<?php
/**
 * Full Disclosure Policy Board API.
 *
 * - GET  php/policy_board.php?image_id=N  — serve bytes from `policy_board`.`image`
 * - GET  php/policy_board.php[?email=...] — JSON items + community average; per-user `my_feedback` only (private)
 * - POST php/policy_board.php — { action: "submit_feedback", email, policy_board_id, comment, name }
 *   `comment_policy`: isang row bawat (policy_id, resident_email); column `name` kung may migration
 */
if (!ob_get_level()) {
    ob_start();
}
ini_set('display_errors', '0');

function pb_table_columns(PDO $pdo, string $table): array
{
    $safe = preg_replace('/[^a-zA-Z0-9_]/', '', $table);
    if ($safe === '') {
        return [];
    }
    $stmt = $pdo->query('SHOW COLUMNS FROM `' . $safe . '`');
    if (!$stmt) {
        return [];
    }
    $out = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        if (!empty($row['Field'])) {
            $out[] = $row['Field'];
        }
    }
    return $out;
}

function pb_resolve_image_field(PDO $pdo, string $table): ?array
{
    $cols = pb_table_columns($pdo, $table);
    if (in_array('image', $cols, true)) {
        $stmt = $pdo->query("SHOW COLUMNS FROM `" . preg_replace('/[^a-zA-Z0-9_]/', '', $table) . "` LIKE 'image'");
        $row = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : null;
        $type = $row ? strtolower((string) ($row['Type'] ?? '')) : '';
        return ['type' => $type, 'field' => 'image'];
    }
    return null;
}

function pb_column_is_blob(string $mysqlType): bool
{
    $t = strtolower($mysqlType);
    if (preg_match('/\b(tiny|medium|long)?blob\b/', $t)) {
        return true;
    }
    if (strpos($t, 'varbinary') !== false) {
        return true;
    }
    return false;
}

function pb_normalize_image_column_value($v): ?string
{
    if ($v === false || $v === null) {
        return null;
    }
    if (is_string($v)) {
        return $v;
    }
    if (is_resource($v)) {
        $s = stream_get_contents($v);
        return ($s !== false && $s !== '') ? $s : null;
    }
    if (is_object($v)) {
        try {
            $s = (string) $v;
            return $s !== '' ? $s : null;
        } catch (Throwable $e) {
            return null;
        }
    }
    if (is_scalar($v)) {
        $s = (string) $v;
        return $s !== '' ? $s : null;
    }
    return null;
}

function pb_resolve_path_url(string $raw): string
{
    $raw = trim($raw);
    if ($raw === '') {
        return '';
    }
    if (preg_match('#^https?://#i', $raw)) {
        return $raw;
    }
    if (strncasecmp($raw, 'data:', 5) === 0) {
        return $raw;
    }
    if ($raw[0] === '/') {
        return $raw;
    }
    return str_replace(['../', '..\\'], '', $raw);
}

function pb_resident_display_name(PDO $pdo, string $email): string
{
    $fromProfile = pb_resident_name_from_profile($pdo, $email);
    if ($fromProfile !== null && $fromProfile !== '') {
        return $fromProfile;
    }
    $at = strpos($email, '@');
    if ($at === false) {
        return 'Resident';
    }
    return substr($email, 0, min(3, $at)) . '***';
}

/**
 * Buong pangalan mula sa resident_information lang (para sa column na `name` sa comment_policy).
 */
function pb_resident_name_from_profile(PDO $pdo, string $email): ?string
{
    try {
        $st = $pdo->prepare('SELECT first_name, last_name FROM resident_information WHERE email = ? LIMIT 1');
        $st->execute([$email]);
        $r = $st->fetch(PDO::FETCH_ASSOC);
        if ($r) {
            $n = trim((string) ($r['first_name'] ?? '') . ' ' . trim((string) ($r['last_name'] ?? '')));
            $n = trim(preg_replace('/\s+/u', ' ', $n));
            if ($n !== '') {
                return $n;
            }
        }
    } catch (Throwable $e) {
        // ignore
    }
    return null;
}

/** Safe backticked identifier for comment_policy columns (`comment` is reserved in MySQL). */
function pb_cp_ident(string $field): string
{
    $safe = preg_replace('/[^a-zA-Z0-9_]/', '', $field);
    return $safe === '' ? '``' : '`' . $safe . '`';
}

/** True if this resident already has any row for this policy (one submission per slide). */
function pb_feedback_row_exists(PDO $pdo, array $cpCols, int $policyId, string $email): bool
{
    $hasResidentEmail = in_array('resident_email', $cpCols, true);
    if ($hasResidentEmail) {
        $st = $pdo->prepare('SELECT 1 FROM comment_policy WHERE policy_id = ? AND resident_email = ? LIMIT 1');
        $st->execute([$policyId, $email]);

        return (bool) $st->fetchColumn();
    }
    $hasName = in_array('name', $cpCols, true);
    $nameFromProfile = pb_resident_name_from_profile($pdo, $email);
    if (!$hasName || $nameFromProfile === null || $nameFromProfile === '') {
        return false;
    }
    $st = $pdo->prepare('SELECT 1 FROM comment_policy WHERE policy_id = ? AND TRIM(`name`) = ? LIMIT 1');
    $st->execute([$policyId, $nameFromProfile]);

    return (bool) $st->fetchColumn();
}

/**
 * Merge legacy multiple rows per user into one view for the current user only.
 */
function pb_merge_my_feedback(PDO $pdo, array $cpCols, string $email, int $policyId): ?array
{
    $hasResidentEmail = in_array('resident_email', $cpCols, true);
    $hasName = in_array('name', $cpCols, true);
    $nameSel = $hasName ? 'c.`name`' : 'NULL AS `name`';
    if ($hasResidentEmail) {
        $st = $pdo->prepare(
            "SELECT c.rating, c.`comment`, $nameSel, c.created_at
             FROM comment_policy c
             WHERE c.policy_id = ? AND c.resident_email = ?
             ORDER BY c.id ASC"
        );
        $st->execute([$policyId, $email]);
    } else {
        $nameFromProfile = pb_resident_name_from_profile($pdo, $email);
        if (!$hasName || $nameFromProfile === null || $nameFromProfile === '') {
            return null;
        }
        $st = $pdo->prepare(
            "SELECT c.rating, c.`comment`, $nameSel, c.created_at
             FROM comment_policy c
             WHERE c.policy_id = ? AND TRIM(c.`name`) = ?
             ORDER BY c.id ASC"
        );
        $st->execute([$policyId, $nameFromProfile]);
    }
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    if (empty($rows)) {
        return null;
    }
    $rating = null;
    $comment = '';
    $name = '';
    $createdAt = null;
    foreach ($rows as $r) {
        if (isset($r['rating']) && $r['rating'] !== null && $r['rating'] !== '') {
            $rv = (int) $r['rating'];
            if ($rv >= 1 && $rv <= 5) {
                $rating = $rv;
            }
        }
        $ct = trim((string) ($r['comment'] ?? ''));
        if ($ct !== '') {
            $comment = $ct;
        }
        if ($hasName) {
            $nt = trim((string) ($r['name'] ?? ''));
            if ($nt !== '') {
                $name = $nt;
            }
        }
        if (!empty($r['created_at'])) {
            $createdAt = $r['created_at'];
        }
    }
    $hasAny = ($rating !== null) || ($comment !== '') || ($name !== '');
    if (!$hasAny) {
        return null;
    }
    $displayName = $name !== '' ? $name : pb_resident_display_name($pdo, $email);
    return [
        'rating' => $rating,
        'comment' => $comment,
        'name' => $displayName,
        'created_at' => $createdAt,
    ];
}

// ---------- Serve single image ----------
if (isset($_GET['image_id'])) {
    $imageId = filter_var($_GET['image_id'], FILTER_VALIDATE_INT);
    if ($imageId === false || $imageId < 1) {
        while (ob_get_level()) {
            ob_end_clean();
        }
        http_response_code(400);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Invalid image_id';
        exit;
    }

    require_once __DIR__ . '/env_loader.php';
    require_once __DIR__ . '/announcement_image_helpers.php';

    while (ob_get_level()) {
        ob_end_clean();
    }

    $pdo = getDBConnection();
    if (!$pdo) {
        http_response_code(503);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Database unavailable';
        exit;
    }

    $pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);
    $pdo->setAttribute(PDO::ATTR_STRINGIFY_FETCHES, false);

    $chk = $pdo->query("SHOW TABLES LIKE 'policy_board'");
    if (!$chk || $chk->rowCount() < 1) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Not found';
        exit;
    }

    $imgMeta = pb_resolve_image_field($pdo, 'policy_board');
    if ($imgMeta === null) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Not found';
        exit;
    }

    $imgField = $imgMeta['field'];
    $pbCols = pb_table_columns($pdo, 'policy_board');
    $idColImg = in_array('id', $pbCols, true)
        ? 'id'
        : (in_array('policy_board_id', $pbCols, true) ? 'policy_board_id' : null);
    if ($idColImg === null) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Not found';
        exit;
    }
    $where = '`' . $idColImg . '` = ?';
    if (in_array('is_active', $pbCols, true)) {
        $where .= ' AND `is_active` = 1';
    }
    $stmt = $pdo->prepare("SELECT `{$imgField}` FROM `policy_board` WHERE {$where} LIMIT 1");
    $stmt->execute([$imageId]);
    $imageData = pb_normalize_image_column_value($stmt->fetchColumn(0));

    if ($imageData === null) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Not found';
        exit;
    }

    $info = ['title' => 'Policy board'];
    try {
        announcement_try_output_image_from_column_value($imageData, $imageId, $info);
    } catch (Throwable $e) {
        error_log('policy_board.php image_id=' . $imageId . ': ' . $e->getMessage());
        http_response_code(500);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Image error';
        exit;
    }

    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Image not available';
    exit;
}

// ---------- JSON API ----------
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST');
header('Access-Control-Allow-Headers: Content-Type');
header('Cache-Control: no-store, no-cache, must-revalidate');

require_once __DIR__ . '/env_loader.php';

while (ob_get_level()) {
    ob_end_clean();
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $raw = file_get_contents('php://input');
    $input = json_decode($raw, true);
    if (!is_array($input)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid JSON']);
        exit;
    }

    $pdo = getDBConnection();
    if (!$pdo) {
        echo json_encode(['success' => false, 'message' => 'Database connection failed']);
        exit;
    }

    $chk = $pdo->query("SHOW TABLES LIKE 'policy_board'");
    if (!$chk || $chk->rowCount() < 1) {
        echo json_encode(['success' => false, 'message' => 'Policy board not configured']);
        exit;
    }

    $action = isset($input['action']) ? trim((string) $input['action']) : '';
    $email = isset($input['email']) ? trim((string) $input['email']) : '';
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Valid email is required']);
        exit;
    }

    $pid = isset($input['policy_board_id']) ? filter_var($input['policy_board_id'], FILTER_VALIDATE_INT) : false;
    if ($pid === false || $pid < 1) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid policy_board_id']);
        exit;
    }

    try {
        $pbColsPost = pb_table_columns($pdo, 'policy_board');
        $pkPost = in_array('id', $pbColsPost, true)
            ? 'id'
            : (in_array('policy_board_id', $pbColsPost, true) ? 'policy_board_id' : null);
        if ($pkPost === null) {
            echo json_encode(['success' => false, 'message' => 'Invalid policy_board table']);
            exit;
        }
        $q = 'SELECT `' . $pkPost . '` FROM policy_board WHERE `' . $pkPost . '` = ?';
        if (in_array('is_active', $pbColsPost, true)) {
            $q .= ' AND is_active = 1';
        }
        $q .= ' LIMIT 1';
        $st = $pdo->prepare($q);
        $st->execute([$pid]);
        if (!$st->fetchColumn()) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Disclosure not found']);
            exit;
        }

        $cp = $pdo->query("SHOW TABLES LIKE 'comment_policy'");
        if (!$cp || $cp->rowCount() < 1) {
            echo json_encode(['success' => false, 'message' => 'Table comment_policy not found. Run sql/policy_board.sql']);
            exit;
        }

        $cpCols = pb_table_columns($pdo, 'comment_policy');
        $hasResidentEmail = in_array('resident_email', $cpCols, true);
        $hasCommentCol = in_array('comment', $cpCols, true);
        $hasRatingCol = in_array('rating', $cpCols, true);
        $hasNameCol = in_array('name', $cpCols, true);

        if ($action !== 'submit_feedback') {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Invalid action']);
            exit;
        }

        if (!$hasCommentCol) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Kulang ang column sa comment_policy (kailangan: comment).']);
            exit;
        }
        if (!$hasResidentEmail && !$hasNameCol) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'Kulang ang column sa comment_policy: magdagdag ng `name` o `resident_email`.',
            ]);
            exit;
        }

        $text = isset($input['comment']) ? trim((string) $input['comment']) : '';
        if ($text === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Maglagay ng komento.']);
            exit;
        }
        $len = function_exists('mb_strlen') ? mb_strlen($text, 'UTF-8') : strlen($text);
        if ($len > 2000) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Masyadong mahaba ang komento (max 2000).']);
            exit;
        }

        $nameFromProfile = pb_resident_name_from_profile($pdo, $email);
        if ($nameFromProfile === null || $nameFromProfile === '') {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'Hindi mahanap ang first_name / last_name sa resident_information para sa account na ito. Kumpletuhin muna ang profile.',
            ]);
            exit;
        }

        if (pb_feedback_row_exists($pdo, $cpCols, $pid, $email)) {
            http_response_code(409);
            echo json_encode(['success' => false, 'message' => 'Nakapagpadala ka na ng komento para sa disclosure na ito.']);
            exit;
        }

        if ($hasResidentEmail) {
            $fields = ['policy_id', 'resident_email', 'comment'];
            $params = [$pid, $email, $text];
            if ($hasRatingCol) {
                $fields[] = 'rating';
                $params[] = null;
            }
            if ($hasNameCol) {
                $fields[] = 'name';
                $params[] = $nameFromProfile;
            }
        } else {
            $fields = ['policy_id', 'name', 'comment'];
            $params = [$pid, $nameFromProfile, $text];
            if ($hasRatingCol) {
                $fields[] = 'rating';
                $params[] = null;
            }
        }

        $sql = 'INSERT INTO comment_policy (' . implode(', ', array_map('pb_cp_ident', $fields)) . ') VALUES (' .
            implode(',', array_fill(0, count($params), '?')) . ')';
        $pdo->prepare($sql)->execute($params);

        if ($hasResidentEmail) {
            $aggStmt = $pdo->prepare(
                'SELECT AVG(t.user_rating) AS av, COUNT(*) AS cnt FROM (
                    SELECT resident_email, MAX(rating) AS user_rating
                    FROM comment_policy
                    WHERE policy_id = ? AND rating IS NOT NULL AND rating BETWEEN 1 AND 5
                    GROUP BY resident_email
                ) t'
            );
        } else {
            $aggStmt = $pdo->prepare(
                'SELECT AVG(rating) AS av, COUNT(*) AS cnt FROM comment_policy
                 WHERE policy_id = ? AND rating IS NOT NULL AND rating BETWEEN 1 AND 5'
            );
        }
        $aggStmt->execute([$pid]);
        $aggRow = $aggStmt->fetch(PDO::FETCH_ASSOC);
        $avgOut = null;
        $cntOut = 0;
        if ($aggRow) {
            if (isset($aggRow['av']) && $aggRow['av'] !== null && $aggRow['av'] !== '') {
                $avgOut = round((float) $aggRow['av'], 2);
            }
            $cntOut = (int) ($aggRow['cnt'] ?? 0);
        }

        $myFeedback = pb_merge_my_feedback($pdo, $cpCols, $email, $pid);

        $outPayload = [
            'success' => true,
            'message' => 'Salamat sa iyong tugon.',
            'policy_board_id' => $pid,
            'average_rating' => $avgOut,
            'ratings_count' => $cntOut,
            'my_rating' => null,
            'my_feedback' => $myFeedback,
        ];
        $flags = JSON_UNESCAPED_UNICODE;
        if (defined('JSON_INVALID_UTF8_SUBSTITUTE')) {
            $flags |= JSON_INVALID_UTF8_SUBSTITUTE;
        }
        echo json_encode($outPayload, $flags);
        exit;
    } catch (Throwable $e) {
        error_log('policy_board.php POST: ' . $e->getMessage());
        http_response_code(500);
        $hint = 'Server error';
        $em = $e->getMessage();
        if (stripos($em, 'Unknown column') !== false) {
            $hint = 'Hindi tugma ang database (comment_policy). I-import ang sql/policy_board.sql o idagdag ang mga column.';
        } elseif (stripos($em, 'foreign key') !== false || stripos($em, 'Cannot add or update a child row') !== false) {
            $hint = 'Hindi wasto ang policy_id (dapat nasa policy_board).';
        } elseif (stripos($em, 'doesn\'t have a default value') !== false) {
            $hint = 'Kulang ang default sa isang column sa comment_policy. Ayusin ang table o sundin ang sql/policy_board.sql.';
        }
        echo json_encode(['success' => false, 'message' => $hint]);
        exit;
    }
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

$pdo = getDBConnection();
if (!$pdo) {
    echo json_encode(['success' => false, 'message' => 'Database connection failed']);
    exit;
}

try {
    $chk = $pdo->query("SHOW TABLES LIKE 'policy_board'");
    if (!$chk || $chk->rowCount() < 1) {
        echo json_encode(['success' => true, 'items' => []]);
        exit;
    }

    $imgMeta = pb_resolve_image_field($pdo, 'policy_board');
    if ($imgMeta === null) {
        echo json_encode(['success' => true, 'items' => []]);
        exit;
    }

    $cols = pb_table_columns($pdo, 'policy_board');
    if (!in_array('id', $cols, true) && !in_array('policy_board_id', $cols, true)) {
        echo json_encode(['success' => true, 'items' => []]);
        exit;
    }
    $isBlob = pb_column_is_blob($imgMeta['type']);
    $imgField = $imgMeta['field'];

    $idCol = 'id';
    if (!in_array('id', $cols, true) && in_array('policy_board_id', $cols, true)) {
        $idCol = 'policy_board_id';
    }

    $select = [];
    if ($idCol === 'id') {
        $select[] = '`id`';
    } else {
        $select[] = '`policy_board_id` AS `id`';
    }
    if ($isBlob) {
        $select[] = 'COALESCE(LENGTH(`' . $imgField . '`), 0) AS `_img_len`';
    } else {
        $select[] = '`' . $imgField . '` AS `image`';
    }
    if (in_array('caption', $cols, true)) {
        $select[] = '`caption`';
    }

    $sql = 'SELECT ' . implode(', ', $select) . ' FROM `policy_board`';
    if (in_array('is_active', $cols, true)) {
        $sql .= ' WHERE `is_active` = 1';
    }
    $orderParts = [];
    if (in_array('sort_order', $cols, true)) {
        $orderParts[] = '`sort_order` ASC';
    }
    $orderParts[] = '`' . $idCol . '` ASC';
    $sql .= ' ORDER BY ' . implode(', ', $orderParts);

    $stmt = $pdo->query($sql);
    if (!$stmt) {
        throw new PDOException('Query failed');
    }
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $ids = [];
    foreach ($rows as $row) {
        $ids[] = (int) ($row['id'] ?? 0);
    }
    $ids = array_values(array_filter($ids, static function ($v) {
        return $v > 0;
    }));

    $avgMap = [];
    $countMap = [];
    $myMap = [];
    $myFeedbackByPid = [];

    $viewerEmail = isset($_GET['email']) ? trim((string) $_GET['email']) : '';
    $viewerSuggestedName = '';
    if ($viewerEmail !== '' && filter_var($viewerEmail, FILTER_VALIDATE_EMAIL)) {
        $viewerSuggestedName = (string) (pb_resident_name_from_profile($pdo, $viewerEmail) ?? '');
    }

    $cpTbl = $pdo->query("SHOW TABLES LIKE 'comment_policy'");
    $hasCommentPolicy = $cpTbl && $cpTbl->rowCount() > 0;
    $cpColsGet = [];
    if ($hasCommentPolicy) {
        $cpColsGet = pb_table_columns($pdo, 'comment_policy');
        foreach (['policy_id', 'rating', 'comment'] as $req) {
            if (!in_array($req, $cpColsGet, true)) {
                $hasCommentPolicy = false;
                error_log('policy_board.php: comment_policy missing column: ' . $req);
                break;
            }
        }
        if ($hasCommentPolicy) {
            $hasEmailGet = in_array('resident_email', $cpColsGet, true);
            $hasNameGet = in_array('name', $cpColsGet, true);
            if (!$hasEmailGet && !$hasNameGet) {
                $hasCommentPolicy = false;
                error_log('policy_board.php: comment_policy needs resident_email or name column');
            }
        }
    }

    if (!empty($ids) && $hasCommentPolicy) {
        try {
            $cpCols = $cpColsGet;
            $hasResidentEmailAgg = in_array('resident_email', $cpCols, true);
            $place = implode(',', array_fill(0, count($ids), '?'));
            if ($hasResidentEmailAgg) {
                $agg = $pdo->prepare(
                    "SELECT x.policy_id, AVG(x.user_rating) AS av, COUNT(*) AS cnt
                     FROM (
                         SELECT policy_id, resident_email, MAX(rating) AS user_rating
                         FROM comment_policy
                         WHERE policy_id IN ($place)
                         AND rating IS NOT NULL AND rating BETWEEN 1 AND 5
                         GROUP BY policy_id, resident_email
                     ) x
                     GROUP BY x.policy_id"
                );
            } else {
                $agg = $pdo->prepare(
                    "SELECT policy_id, AVG(rating) AS av, COUNT(*) AS cnt
                     FROM comment_policy
                     WHERE policy_id IN ($place)
                     AND rating IS NOT NULL AND rating BETWEEN 1 AND 5
                     GROUP BY policy_id"
                );
            }
            $agg->execute($ids);
            foreach ($agg->fetchAll(PDO::FETCH_ASSOC) as $a) {
                $pidx = (int) $a['policy_id'];
                $avgMap[$pidx] = round((float) $a['av'], 2);
                $countMap[$pidx] = (int) $a['cnt'];
            }

            if ($viewerEmail !== '' && filter_var($viewerEmail, FILTER_VALIDATE_EMAIL)) {
                foreach ($ids as $pidVal) {
                    $mf = pb_merge_my_feedback($pdo, $cpCols, $viewerEmail, (int) $pidVal);
                    if ($mf !== null) {
                        $myFeedbackByPid[(int) $pidVal] = $mf;
                        if (isset($mf['rating']) && $mf['rating'] !== null) {
                            $myMap[(int) $pidVal] = (int) $mf['rating'];
                        }
                    }
                }
            }
        } catch (Throwable $e) {
            error_log('policy_board.php comment_policy block: ' . $e->getMessage());
        }
    }

    $listCacheBust = bin2hex(random_bytes(4));
    $out = [];

    foreach ($rows as $row) {
        $idVal = (int) ($row['id'] ?? 0);
        if ($idVal < 1) {
            continue;
        }

        if ($isBlob) {
            $len = (int) ($row['_img_len'] ?? 0);
            if ($len < 1) {
                continue;
            }
            $imageUrl = 'php/policy_board.php?image_id=' . $idVal . '&t=' . $listCacheBust;
        } else {
            $imgRaw = isset($row['image']) ? (string) $row['image'] : '';
            $imageUrl = pb_resolve_path_url($imgRaw);
            if ($imageUrl === '') {
                continue;
            }
        }

        $out[] = [
            'id' => $idVal,
            'caption' => isset($row['caption']) && $row['caption'] !== null && trim((string) $row['caption']) !== ''
                ? trim((string) $row['caption'])
                : null,
            'image_url' => $imageUrl,
            'average_rating' => $avgMap[$idVal] ?? null,
            'ratings_count' => $countMap[$idVal] ?? 0,
            'my_rating' => $myMap[$idVal] ?? null,
            'my_feedback' => $myFeedbackByPid[$idVal] ?? null,
        ];
    }

    $flags = JSON_UNESCAPED_UNICODE;
    if (defined('JSON_INVALID_UTF8_SUBSTITUTE')) {
        $flags |= JSON_INVALID_UTF8_SUBSTITUTE;
    }
    $json = json_encode([
        'success' => true,
        'viewer_suggested_name' => $viewerSuggestedName,
        'items' => $out,
    ], $flags);
    if ($json === false) {
        error_log('policy_board.php json_encode: ' . json_last_error_msg());
        echo json_encode(['success' => false, 'message' => 'Failed to encode response']);
        exit;
    }
    echo $json;
} catch (PDOException $e) {
    error_log('policy_board.php PDO: ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine());
    echo json_encode(['success' => false, 'message' => 'Failed to load policy board']);
} catch (Throwable $e) {
    error_log('policy_board.php: ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine());
    echo json_encode(['success' => false, 'message' => 'Failed to load policy board']);
}
