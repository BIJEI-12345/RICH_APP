<?php
// Transactions PHP Backend - Unified view of all user requests

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Database connection - Load from centralized config
require_once __DIR__ . '/env_loader.php';

$pdo = getDBConnection();
if (!$pdo) {
    echo json_encode(['success' => false, 'message' => 'Database connection failed']);
    exit;
}

/**
 * Same session / GET / POST user email resolution as listTransactions — keep image serve in sync with list.
 * Important: trim session first; whitespace-only session must not block ?user_email= (img src / API fallback).
 */
function transactions_resolve_request_user_email() {
    if (function_exists('session_status') && session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    $userEmail = null;
    if (isset($_SESSION['user_email'])) {
        $userEmail = trim((string)$_SESSION['user_email']);
    }
    if ($userEmail === '') {
        $userEmail = $_GET['user_email'] ?? $_POST['user_email'] ?? null;
        if ($userEmail !== null && $userEmail !== '') {
            $userEmail = trim((string)$userEmail);
        }
    }
    if ($userEmail === null || $userEmail === '') {
        return null;
    }
    return $userEmail;
}

// Handle different actions
$action = $_GET['action'] ?? $_POST['action'] ?? 'list';

switch ($action) {
    case 'list':
        listTransactions($pdo);
        break;
    case 'serve_concern_resolved_image':
        serveConcernResolvedImage($pdo);
        break;
    case 'serve_concern_reported_image':
        serveConcernReportedImage($pdo);
        break;
    case 'download':
        downloadDocument($pdo);
        break;
    case 'cancel':
        cancelTransaction($pdo);
        break;
    case 'rate_concern':
        rateConcernTransaction($pdo);
        break;
    default:
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
        break;
}

/**
 * Which column stores 1–5 star count for concerns ('rating' preferred, else legacy 'resident_rating').
 * @return string|null
 */
function concern_rating_column_name(PDO $pdo) {
    static $cache = false;
    if ($cache !== false) {
        return $cache;
    }
    foreach (['rating', 'resident_rating'] as $col) {
        try {
            $q = $pdo->query("SHOW COLUMNS FROM `concerns` LIKE " . $pdo->quote($col));
            if ($q && $q->rowCount() > 0) {
                return $cache = $col;
            }
        } catch (Throwable $e) {
            // ignore
        }
    }
    return $cache = null;
}

/** SQL fragment c.col or NULL for list SELECT (cached). */
function concern_rating_select_fragment(PDO $pdo) {
    static $cache = false;
    if ($cache !== false) {
        return $cache;
    }
    $col = concern_rating_column_name($pdo);
    if ($col === 'rating') {
        return $cache = 'c.`rating`';
    }
    if ($col === 'resident_rating') {
        return $cache = 'c.resident_rating';
    }
    return $cache = 'NULL';
}

/** SQL fragment for resident feedback after rating (TEXT column), or NULL. */
function concern_suggestions_select_fragment(PDO $pdo) {
    static $cache = false;
    if ($cache !== false) {
        return $cache;
    }
    try {
        $q = $pdo->query("SHOW COLUMNS FROM `concerns` LIKE 'suggestions'");
        return $cache = ($q && $q->rowCount() > 0) ? 'c.suggestions' : 'NULL';
    } catch (Throwable $e) {
        return $cache = 'NULL';
    }
}

/** @return bool */
function concern_table_has_suggestions(PDO $pdo) {
    static $cache = null;
    if ($cache !== null) {
        return $cache;
    }
    try {
        $q = $pdo->query("SHOW COLUMNS FROM `concerns` LIKE 'suggestions'");
        return $cache = ($q && $q->rowCount() > 0);
    } catch (Throwable $e) {
        return $cache = false;
    }
}

/** SQL fragment c.resolution_statement or NULL if column missing (barangay text when resolving). */
function concern_resolution_statement_select_fragment(PDO $pdo) {
    static $cache = false;
    if ($cache !== false) {
        return $cache;
    }
    try {
        $q = $pdo->query("SHOW COLUMNS FROM `concerns` LIKE 'resolution_statement'");
        return $cache = ($q && $q->rowCount() > 0) ? 'c.resolution_statement' : 'NULL';
    } catch (Throwable $e) {
        return $cache = 'NULL';
    }
}

/** SQL fragment c.resolved_image or NULL if column missing. */
function concern_resolved_image_select_fragment(PDO $pdo) {
    static $cache = false;
    if ($cache !== false) {
        return $cache;
    }
    try {
        $q = $pdo->query("SHOW COLUMNS FROM `concerns` LIKE 'resolved_image'");
        return $cache = ($q && $q->rowCount() > 0) ? 'c.resolved_image' : 'NULL';
    } catch (Throwable $e) {
        return $cache = 'NULL';
    }
}

/** SQL expression: 1 if concern has non-empty resolved_image, else 0 (or 0 if column missing). */
function concern_has_resolved_image_expression(PDO $pdo) {
    static $cache = false;
    if ($cache !== false) {
        return $cache;
    }
    try {
        $q = $pdo->query("SHOW COLUMNS FROM `concerns` LIKE 'resolved_image'");
        if ($q && $q->rowCount() > 0) {
            return $cache = '(c.resolved_image IS NOT NULL AND LENGTH(c.resolved_image) > 0)';
        }
    } catch (Throwable $e) {
        // ignore
    }
    return $cache = '0';
}

/** SQL expression: 1 if concern has non-empty concern_image (reported), else 0 (or 0 if column missing). */
function concern_has_concern_image_expression(PDO $pdo) {
    static $cache = false;
    if ($cache !== false) {
        return $cache;
    }
    try {
        $q = $pdo->query("SHOW COLUMNS FROM `concerns` LIKE 'concern_image'");
        if ($q && $q->rowCount() > 0) {
            return $cache = '(c.concern_image IS NOT NULL AND LENGTH(c.concern_image) > 0)';
        }
    } catch (Throwable $e) {
        // ignore
    }
    return $cache = '0';
}

/**
 * Strip UTF-8 BOM and leading whitespace before image magic bytes (matches announcement_image_helpers).
 */
function transactions_resolved_image_strip_prefix_noise(string $binary): string {
    if ($binary === '') {
        return $binary;
    }
    if (strncmp($binary, "\xEF\xBB\xBF", 3) === 0) {
        $binary = substr($binary, 3);
    }
    $len = strlen($binary);
    $i = 0;
    while ($i < $len && $i < 24) {
        $b = ord($binary[$i]);
        if ($b === 0x09 || $b === 0x0A || $b === 0x0D || $b === 0x20) {
            $i++;
            continue;
        }
        break;
    }
    return $i > 0 ? substr($binary, $i) : $binary;
}

/**
 * Detect image MIME from leading bytes (JPEG/PNG/GIF/WEBP/BMP).
 */
function transactions_resolved_image_detect_mime_from_bytes(string $bin): ?string {
    $len = strlen($bin);
    if ($len < 2) {
        return null;
    }
    if ($len >= 3 && strncmp($bin, "\xFF\xD8\xFF", 3) === 0) {
        return 'image/jpeg';
    }
    if ($len >= 8 && strncmp($bin, "\x89PNG\x0D\x0A\x1A\x0A", 8) === 0) {
        return 'image/png';
    }
    if ($len >= 6 && (strncasecmp($bin, 'GIF87a', 6) === 0 || strncasecmp($bin, 'GIF89a', 6) === 0)) {
        return 'image/gif';
    }
    if ($len >= 12 && strncmp($bin, 'RIFF', 4) === 0 && substr($bin, 8, 4) === 'WEBP') {
        return 'image/webp';
    }
    if ($len >= 6 && substr($bin, 0, 2) === 'BM') {
        return 'image/bmp';
    }
    return null;
}

/**
 * Last-resort MIME for raw bytes (e.g. HEIC/AVIF) when magic-byte list misses.
 */
function transactions_resolved_image_detect_mime_finfo(string $bin): ?string {
    if ($bin === '' || !function_exists('finfo_open')) {
        return null;
    }
    $f = @finfo_open(FILEINFO_MIME_TYPE);
    if (!$f) {
        return null;
    }
    $det = @finfo_buffer($f, $bin);
    finfo_close($f);
    if (!is_string($det) || strpos($det, 'image/') !== 0) {
        return null;
    }
    return $det;
}

/**
 * Make resolved_image safe for JSON: BLOB → data URL; base64 text → data URL; http(s)/data kept; paths normalized.
 * Handles PDO returning a stream for LONGBLOB on some setups.
 */
function transactions_normalize_concern_resolved_image_for_api(array &$row) {
    if (!array_key_exists('resolved_image', $row)) {
        return;
    }
    $v = $row['resolved_image'];
    if ($v === null) {
        return;
    }
    if (is_resource($v)) {
        $v = stream_get_contents($v);
    }
    if (!is_string($v) || $v === '') {
        $row['resolved_image'] = null;
        return;
    }

    $trimAll = trim($v);
    if ($trimAll === '') {
        $row['resolved_image'] = null;
        return;
    }

    if (preg_match('#^(https?://|data:image/)#i', $trimAll)) {
        $row['resolved_image'] = $trimAll;
        return;
    }

    // Raw binary image (LONGBLOB / BLOB); strip BOM/whitespace so magic bytes match
    $binary = transactions_resolved_image_strip_prefix_noise($v);
    $mime = transactions_resolved_image_detect_mime_from_bytes($binary);
    if ($mime !== null) {
        $row['resolved_image'] = 'data:' . $mime . ';base64,' . base64_encode($binary);
        return;
    }
    $mimeF = transactions_resolved_image_detect_mime_finfo($binary);
    if ($mimeF !== null) {
        $row['resolved_image'] = 'data:' . $mimeF . ';base64,' . base64_encode($binary);
        return;
    }

    // Plain base64 in TEXT/VARCHAR (no data: prefix); allow URL-safe (-_)
    if (strlen($trimAll) >= 32 && preg_match('/^[A-Za-z0-9+\/=\r\n\-_]+$/', $trimAll)) {
        $decoded = @base64_decode(preg_replace('/\s+/', '', $trimAll), true);
        if ($decoded !== false && strlen($decoded) > 16) {
            $decBin = transactions_resolved_image_strip_prefix_noise($decoded);
            $mime2 = transactions_resolved_image_detect_mime_from_bytes($decBin);
            if ($mime2 === null) {
                $mime2 = transactions_resolved_image_detect_mime_finfo($decBin);
            }
            if ($mime2 !== null) {
                $row['resolved_image'] = 'data:' . $mime2 . ';base64,' . base64_encode($decBin);
                return;
            }
        }
    }

    // File / site path (not raw image bytes): printable, no NUL
    if (strlen($trimAll) <= 8192 && strpos($trimAll, "\0") === false) {
        $isPrintablePath = preg_match('/^[\x20-\x7E]+$/', $trimAll) === 1;
        if ($isPrintablePath) {
            $norm = str_replace('\\', '/', $trimAll);
            $looksLikePath =
                strpos($norm, '/') !== false
                || preg_match('#^[a-zA-Z]:/#', $norm)
                || strpos($norm, './') === 0
                || preg_match('/\.(jpe?g|png|gif|webp|bmp|svg)$/i', $norm);
            if ($looksLikePath) {
                $row['resolved_image'] = $norm;
                return;
            }
        }
    }

    $row['resolved_image'] = null;
}

/**
 * Serve raw resolved_image for one concern (single-row SELECT; avoids empty LONGBLOB in large list queries).
 * GET: action=serve_concern_resolved_image&concern_ref=CONC-33&user_email= (optional if session set)
 */
function serveConcernResolvedImage(PDO $pdo) {
    $userEmail = transactions_resolve_request_user_email();
    if (!$userEmail) {
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8', true);
        echo json_encode(['success' => false, 'message' => 'Please log in to view this image.']);
        return;
    }

    $ref = trim((string)($_GET['concern_ref'] ?? $_GET['id'] ?? ''));
    if (!preg_match('/^CONC-(\d+)$/i', $ref, $m)) {
        http_response_code(400);
        header('Content-Type: application/json; charset=utf-8', true);
        echo json_encode(['success' => false, 'message' => 'Invalid concern reference.']);
        return;
    }
    $concernNumericId = (int)$m[1];

    try {
        $q = $pdo->query("SHOW COLUMNS FROM `concerns` LIKE 'resolved_image'");
        if (!$q || $q->rowCount() === 0) {
            http_response_code(404);
            header('Content-Type: application/json; charset=utf-8', true);
            echo json_encode(['success' => false, 'message' => 'No resolved_image column.']);
            return;
        }
    } catch (Throwable $e) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8', true);
        echo json_encode(['success' => false, 'message' => 'Server error.']);
        return;
    }

    $userEmailTrim = trim((string)$userEmail);
    $userEmailLookup = strtolower($userEmailTrim);
    $userStmt = $pdo->prepare('SELECT id, CONCAT(TRIM(first_name), " ", TRIM(last_name)) AS full_name FROM resident_information WHERE email = ? OR LOWER(TRIM(email)) = ?');
    $userStmt->execute([$userEmailTrim, $userEmailLookup]);
    $userRow = $userStmt->fetch(PDO::FETCH_ASSOC);
    if (!$userRow) {
        http_response_code(403);
        header('Content-Type: application/json; charset=utf-8', true);
        echo json_encode(['success' => false, 'message' => 'Access denied.']);
        return;
    }
    $fullName = trim((string)$userRow['full_name']);

    $checkEmailColumn = $pdo->query("SHOW COLUMNS FROM concerns LIKE 'email'");
    $hasEmailColumn = $checkEmailColumn->rowCount() > 0;

    // Match listTransactions: email column path first; if no row, fallback to reporter_name join (legacy / mismatched c.email).
    $emailForList = strtolower($userEmailTrim);
    $row = null;
    if ($hasEmailColumn) {
        $stmt = $pdo->prepare("
            SELECT c.resolved_image FROM concerns c
            WHERE c.id = ?
              AND LOWER(TRIM(COALESCE(c.email, ''))) = ?
              AND TRIM(COALESCE(c.email, '')) <> ''
        ");
        $stmt->execute([$concernNumericId, $emailForList]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            $stmt = $pdo->prepare("
                SELECT c.resolved_image FROM concerns c
                INNER JOIN resident_information r ON c.reporter_name = CONCAT(TRIM(r.first_name), ' ', TRIM(r.last_name))
                WHERE c.id = ? AND LOWER(TRIM(r.email)) = ?
            ");
            $stmt->execute([$concernNumericId, $emailForList]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
        }
    } else {
        $stmt = $pdo->prepare("
            SELECT c.resolved_image FROM concerns c
            INNER JOIN resident_information r ON c.reporter_name = CONCAT(TRIM(r.first_name), ' ', TRIM(r.last_name))
            WHERE c.id = ? AND LOWER(TRIM(r.email)) = ?
        ");
        $stmt->execute([$concernNumericId, $emailForList]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
    }
    if (!$row) {
        http_response_code(404);
        header('Content-Type: application/json; charset=utf-8', true);
        echo json_encode(['success' => false, 'message' => 'Concern not found.']);
        return;
    }

    $v = $row['resolved_image'];
    if (is_resource($v)) {
        $v = stream_get_contents($v);
    }
    // LONGBLOB: use strlen, not === '' (binary-safe)
    if (!is_string($v) || strlen($v) === 0) {
        http_response_code(404);
        header('Content-Type: application/json; charset=utf-8', true);
        echo json_encode(['success' => false, 'message' => 'No image stored for this concern.']);
        return;
    }

    require_once __DIR__ . '/announcement_image_helpers.php';

    $trimAll = trim($v);

    if (preg_match('#^https?://#i', $trimAll)) {
        header('Location: ' . $trimAll, true, 302);
        exit;
    }

    if (preg_match('#^data:image/#i', $trimAll) && preg_match('#^data:image/[^;]+;base64,#i', $trimAll)) {
        $comma = strpos($trimAll, ',');
        if ($comma !== false) {
            $b64 = substr($trimAll, $comma + 1);
            $decoded = @base64_decode($b64, true);
            if ($decoded !== false && $decoded !== '') {
                $bin = transactions_resolved_image_strip_prefix_noise($decoded);
                $mime = transactions_resolved_image_detect_mime_from_bytes($bin)
                    ?: transactions_resolved_image_detect_mime_finfo($bin)
                    ?: 'image/jpeg';
                transactions_emit_resolved_image_bytes($bin, $mime);
                exit;
            }
        }
    }

    $binary = transactions_resolved_image_strip_prefix_noise($v);
    $mime = transactions_resolved_image_detect_mime_from_bytes($binary)
        ?: transactions_resolved_image_detect_mime_finfo($binary);
    if ($mime !== null) {
        transactions_emit_resolved_image_bytes($binary, $mime);
        exit;
    }

    if (strlen($trimAll) >= 32 && preg_match('/^[A-Za-z0-9+\/=\r\n\-_]+$/', $trimAll)) {
        $decoded = @base64_decode(preg_replace('/\s+/', '', $trimAll), true);
        if ($decoded !== false && strlen($decoded) > 16) {
            $decBin = transactions_resolved_image_strip_prefix_noise($decoded);
            $mime2 = transactions_resolved_image_detect_mime_from_bytes($decBin)
                ?: transactions_resolved_image_detect_mime_finfo($decBin);
            if ($mime2 !== null) {
                transactions_emit_resolved_image_bytes($decBin, $mime2);
                exit;
            }
        }
    }

    if (strlen($trimAll) <= 8192 && strpos($trimAll, "\0") === false && preg_match('/^[\x20-\x7E]+$/', $trimAll)) {
        $norm = str_replace('\\', '/', $trimAll);
        $looksLikePath =
            strpos($norm, '/') !== false
            || preg_match('#^[a-zA-Z]:/#', $norm)
            || strpos($norm, './') === 0
            || preg_match('/\.(jpe?g|png|gif|webp|bmp|svg)$/i', $norm);
        if ($looksLikePath && tryServeAnnouncementImageFromStoredPath($norm, 'concern-' . $concernNumericId)) {
            exit;
        }
    }

    // GD recognizes JPEG/PNG/GIF/WebP even when custom magic-byte checks miss
    if (function_exists('getimagesizefromstring')) {
        foreach ([$binary, $v] as $blobTry) {
            if (!is_string($blobTry) || $blobTry === '') {
                continue;
            }
            $info = @getimagesizefromstring($blobTry);
            if (is_array($info) && !empty($info['mime']) && strpos($info['mime'], 'image/') === 0) {
                transactions_emit_resolved_image_bytes($blobTry, $info['mime']);
                exit;
            }
        }
    }

    http_response_code(404);
    header('Content-Type: application/json; charset=utf-8', true);
    echo json_encode(['success' => false, 'message' => 'Could not decode resolved image.']);
}

/**
 * Serve raw concern_image (photo submitted with the report) for one concern.
 * GET: action=serve_concern_reported_image&concern_ref=CONC-33&user_email=
 */
function serveConcernReportedImage(PDO $pdo) {
    $userEmail = transactions_resolve_request_user_email();
    if (!$userEmail) {
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8', true);
        echo json_encode(['success' => false, 'message' => 'Please log in to view this image.']);
        return;
    }

    $ref = trim((string)($_GET['concern_ref'] ?? $_GET['id'] ?? ''));
    if (!preg_match('/^CONC-(\d+)$/i', $ref, $m)) {
        http_response_code(400);
        header('Content-Type: application/json; charset=utf-8', true);
        echo json_encode(['success' => false, 'message' => 'Invalid concern reference.']);
        return;
    }
    $concernNumericId = (int)$m[1];

    try {
        $q = $pdo->query("SHOW COLUMNS FROM `concerns` LIKE 'concern_image'");
        if (!$q || $q->rowCount() === 0) {
            http_response_code(404);
            header('Content-Type: application/json; charset=utf-8', true);
            echo json_encode(['success' => false, 'message' => 'No concern_image column.']);
            return;
        }
    } catch (Throwable $e) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8', true);
        echo json_encode(['success' => false, 'message' => 'Server error.']);
        return;
    }

    $userEmailTrim = trim((string)$userEmail);
    $userEmailLookup = strtolower($userEmailTrim);
    $userStmt = $pdo->prepare('SELECT id, CONCAT(TRIM(first_name), " ", TRIM(last_name)) AS full_name FROM resident_information WHERE email = ? OR LOWER(TRIM(email)) = ?');
    $userStmt->execute([$userEmailTrim, $userEmailLookup]);
    $userRow = $userStmt->fetch(PDO::FETCH_ASSOC);
    if (!$userRow) {
        http_response_code(403);
        header('Content-Type: application/json; charset=utf-8', true);
        echo json_encode(['success' => false, 'message' => 'Access denied.']);
        return;
    }

    $checkEmailColumn = $pdo->query("SHOW COLUMNS FROM concerns LIKE 'email'");
    $hasEmailColumn = $checkEmailColumn->rowCount() > 0;

    $emailForList = strtolower($userEmailTrim);
    $row = null;
    if ($hasEmailColumn) {
        $stmt = $pdo->prepare("
            SELECT c.concern_image FROM concerns c
            WHERE c.id = ?
              AND LOWER(TRIM(COALESCE(c.email, ''))) = ?
              AND TRIM(COALESCE(c.email, '')) <> ''
        ");
        $stmt->execute([$concernNumericId, $emailForList]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            $stmt = $pdo->prepare("
                SELECT c.concern_image FROM concerns c
                INNER JOIN resident_information r ON c.reporter_name = CONCAT(TRIM(r.first_name), ' ', TRIM(r.last_name))
                WHERE c.id = ? AND LOWER(TRIM(r.email)) = ?
            ");
            $stmt->execute([$concernNumericId, $emailForList]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
        }
    } else {
        $stmt = $pdo->prepare("
            SELECT c.concern_image FROM concerns c
            INNER JOIN resident_information r ON c.reporter_name = CONCAT(TRIM(r.first_name), ' ', TRIM(r.last_name))
            WHERE c.id = ? AND LOWER(TRIM(r.email)) = ?
        ");
        $stmt->execute([$concernNumericId, $emailForList]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
    }
    if (!$row) {
        http_response_code(404);
        header('Content-Type: application/json; charset=utf-8', true);
        echo json_encode(['success' => false, 'message' => 'Concern not found.']);
        return;
    }

    $v = $row['concern_image'];
    if (is_resource($v)) {
        $v = stream_get_contents($v);
    }
    if (!is_string($v) || strlen($v) === 0) {
        http_response_code(404);
        header('Content-Type: application/json; charset=utf-8', true);
        echo json_encode(['success' => false, 'message' => 'No reported image stored for this concern.']);
        return;
    }

    require_once __DIR__ . '/announcement_image_helpers.php';

    $trimAll = trim($v);

    if (preg_match('#^https?://#i', $trimAll)) {
        header('Location: ' . $trimAll, true, 302);
        exit;
    }

    if (preg_match('#^data:image/#i', $trimAll) && preg_match('#^data:image/[^;]+;base64,#i', $trimAll)) {
        $comma = strpos($trimAll, ',');
        if ($comma !== false) {
            $b64 = substr($trimAll, $comma + 1);
            $decoded = @base64_decode($b64, true);
            if ($decoded !== false && $decoded !== '') {
                $bin = transactions_resolved_image_strip_prefix_noise($decoded);
                $mime = transactions_resolved_image_detect_mime_from_bytes($bin)
                    ?: transactions_resolved_image_detect_mime_finfo($bin)
                    ?: 'image/jpeg';
                transactions_emit_resolved_image_bytes($bin, $mime);
                exit;
            }
        }
    }

    $binary = transactions_resolved_image_strip_prefix_noise($v);
    $mime = transactions_resolved_image_detect_mime_from_bytes($binary)
        ?: transactions_resolved_image_detect_mime_finfo($binary);
    if ($mime !== null) {
        transactions_emit_resolved_image_bytes($binary, $mime);
        exit;
    }

    if (strlen($trimAll) >= 32 && preg_match('/^[A-Za-z0-9+\/=\r\n\-_]+$/', $trimAll)) {
        $decoded = @base64_decode(preg_replace('/\s+/', '', $trimAll), true);
        if ($decoded !== false && strlen($decoded) > 16) {
            $decBin = transactions_resolved_image_strip_prefix_noise($decoded);
            $mime2 = transactions_resolved_image_detect_mime_from_bytes($decBin)
                ?: transactions_resolved_image_detect_mime_finfo($decBin);
            if ($mime2 !== null) {
                transactions_emit_resolved_image_bytes($decBin, $mime2);
                exit;
            }
        }
    }

    if (strlen($trimAll) <= 8192 && strpos($trimAll, "\0") === false && preg_match('/^[\x20-\x7E]+$/', $trimAll)) {
        $norm = str_replace('\\', '/', $trimAll);
        $looksLikePath =
            strpos($norm, '/') !== false
            || preg_match('#^[a-zA-Z]:/#', $norm)
            || strpos($norm, './') === 0
            || preg_match('/\.(jpe?g|png|gif|webp|bmp|svg)$/i', $norm);
        if ($looksLikePath && tryServeAnnouncementImageFromStoredPath($norm, 'concern-reported-' . $concernNumericId)) {
            exit;
        }
    }

    if (function_exists('getimagesizefromstring')) {
        foreach ([$binary, $v] as $blobTry) {
            if (!is_string($blobTry) || $blobTry === '') {
                continue;
            }
            $info = @getimagesizefromstring($blobTry);
            if (is_array($info) && !empty($info['mime']) && strpos($info['mime'], 'image/') === 0) {
                transactions_emit_resolved_image_bytes($blobTry, $info['mime']);
                exit;
            }
        }
    }

    http_response_code(404);
    header('Content-Type: application/json; charset=utf-8', true);
    echo json_encode(['success' => false, 'message' => 'Could not decode reported image.']);
}

function transactions_emit_resolved_image_bytes(string $body, string $mime) {
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    header('Content-Type: ' . $mime, true);
    header('Content-Length: ' . strlen($body), true);
    header('Cache-Control: private, max-age=300', true);
    echo $body;
}

/** @return bool Whether $table has a reason_revoke column (cached). */
function transactions_table_has_reason_revoke(PDO $pdo, $tableName) {
    static $cache = [];
    if (isset($cache[$tableName])) {
        return $cache[$tableName];
    }
    $allowed = ['concerns', 'emergency_reports', 'indigency_forms', 'barangay_id_forms', 'certification_forms', 'coe_forms', 'clearance_forms'];
    if (!in_array($tableName, $allowed, true)) {
        return $cache[$tableName] = false;
    }
    try {
        $q = $pdo->query("SHOW COLUMNS FROM `{$tableName}` LIKE 'reason_revoke'");
        return $cache[$tableName] = ($q && $q->rowCount() > 0);
    } catch (Throwable $e) {
        return $cache[$tableName] = false;
    }
}

/**
 * POST JSON: { concern_id, rating: 1-5, suggestions?: string, user_email?: fallback }
 * Saves rating (1–5) and optional suggestions (TEXT) for resolved concerns.
 */
function rateConcernTransaction(PDO $pdo) {
    header('Content-Type: application/json');
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed']);
        return;
    }

    $raw = file_get_contents('php://input');
    $input = json_decode($raw, true);
    if (!is_array($input)) {
        $input = [];
    }

    $userEmail = transactions_resolve_request_user_email();
    if (!$userEmail && !empty($input['user_email'])) {
        $userEmail = trim((string)$input['user_email']);
    }
    if (!$userEmail) {
        echo json_encode(['success' => false, 'message' => 'Please log in to rate this concern.']);
        return;
    }

    $ratingCol = concern_rating_column_name($pdo);
    if (!$ratingCol) {
        echo json_encode(['success' => false, 'message' => 'Walang `rating` column sa concerns table. Magdagdag ng INT (hal. DEFAULT 0 para sa hindi pa naka-rate).']);
        return;
    }

    $concernIdStr = trim((string)($input['concern_id'] ?? ''));
    $stars = (int)($input['rating'] ?? 0);
    if ($stars < 1 || $stars > 5) {
        echo json_encode(['success' => false, 'message' => 'Please choose 1 to 5 stars.']);
        return;
    }
    if (!preg_match('/^CONC-(\d+)$/i', $concernIdStr, $m)) {
        echo json_encode(['success' => false, 'message' => 'Invalid concern reference.']);
        return;
    }
    $concernNumericId = (int)$m[1];

    $userStmt = $pdo->prepare('SELECT id, CONCAT(TRIM(first_name), " ", TRIM(last_name)) AS full_name FROM resident_information WHERE email = ?');
    $userStmt->execute([$userEmail]);
    $userRow = $userStmt->fetch(PDO::FETCH_ASSOC);
    if (!$userRow) {
        echo json_encode(['success' => false, 'message' => 'User not found.']);
        return;
    }
    $fullName = trim((string)$userRow['full_name']);

    $checkEmailColumn = $pdo->query("SHOW COLUMNS FROM concerns LIKE 'email'");
    $hasEmailColumn = $checkEmailColumn->rowCount() > 0;

    try {
        $quotedCol = '`' . str_replace('`', '``', $ratingCol) . '`';
        if ($hasEmailColumn) {
            $stmt = $pdo->prepare("SELECT id, status, {$quotedCol} AS concern_rating_val FROM concerns WHERE id = ? AND email = ?");
            $stmt->execute([$concernNumericId, $userEmail]);
        } else {
            $stmt = $pdo->prepare("SELECT id, status, {$quotedCol} AS concern_rating_val FROM concerns WHERE id = ? AND reporter_name = ?");
            $stmt->execute([$concernNumericId, $fullName]);
        }
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            echo json_encode(['success' => false, 'message' => 'Concern not found or access denied.']);
            return;
        }
        $dbStatus = strtolower(trim((string)($row['status'] ?? '')));
        if ($dbStatus !== 'resolved') {
            echo json_encode(['success' => false, 'message' => 'You can rate only after the concern is finished.']);
            return;
        }
        $existing = (int)($row['concern_rating_val'] ?? 0);
        if ($existing >= 1 && $existing <= 5) {
            echo json_encode(['success' => false, 'message' => 'You already submitted a rating for this concern.']);
            return;
        }

        $suggestionsRaw = isset($input['suggestions']) ? trim((string)$input['suggestions']) : '';
        $sLen = function_exists('mb_strlen') ? mb_strlen($suggestionsRaw, 'UTF-8') : strlen($suggestionsRaw);
        if ($sLen > 65535) {
            echo json_encode(['success' => false, 'message' => 'Masyadong mahaba ang feedback/suggestions.']);
            return;
        }

        $hasSuggestionsCol = concern_table_has_suggestions($pdo);
        if ($hasSuggestionsCol) {
            $upd = $pdo->prepare("UPDATE concerns SET {$quotedCol} = ?, `suggestions` = ? WHERE id = ?");
            $upd->execute([$stars, $suggestionsRaw, $concernNumericId]);
        } else {
            $upd = $pdo->prepare("UPDATE concerns SET {$quotedCol} = ? WHERE id = ?");
            $upd->execute([$stars, $concernNumericId]);
        }

        echo json_encode([
            'success' => true,
            'rating' => $stars,
            'resident_rating' => $stars,
            'suggestions' => $hasSuggestionsCol ? $suggestionsRaw : null,
            'message' => 'Salamat sa iyong rating at feedback.',
        ]);
    } catch (PDOException $e) {
        error_log('rateConcernTransaction: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Could not save rating. Please try again.']);
    }
}

// List all transactions for the user from all request types
function listTransactions($pdo) {
    try {
        $userEmail = transactions_resolve_request_user_email();
        
        error_log("Session user_email: " . ($userEmail ?? 'NULL'));
        error_log("All session data: " . json_encode($_SESSION));
        
        if (!$userEmail) {
            echo json_encode([
                'success' => false,
                'message' => 'Please log in first to view your transactions.',
                'transactions' => []
            ]);
            return;
        }

        $userEmail = trim((string)$userEmail);
        
        // Get user ID from email
        $userStmt = $pdo->prepare("SELECT id, first_name, last_name FROM resident_information WHERE email = ? OR LOWER(TRIM(email)) = ?");
        $userStmt->execute([$userEmail, strtolower($userEmail)]);
        $user = $userStmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$user) {
            echo json_encode([
                'success' => false,
                'message' => 'User not found. Please check your email or register first.',
                'transactions' => []
            ]);
            return;
        }
        
        $userId = $user['id'];
        $userName = trim($user['first_name'] . ' ' . $user['last_name']);
        
        // Debug: Log user information
        error_log("User Email: " . $userEmail);
        error_log("User ID: " . $userId);
        error_log("User Name: '" . $userName . "'");
        
        // Debug: Check what names exist in the database
        $nameCheckStmt = $pdo->prepare("SELECT DISTINCT reporter_name FROM concerns LIMIT 10");
        $nameCheckStmt->execute();
        $concernNames = $nameCheckStmt->fetchAll(PDO::FETCH_COLUMN);
        error_log("Names in concerns table: " . json_encode($concernNames));
        
        $emergencyNameCheckStmt = $pdo->prepare("SELECT DISTINCT reporter_name FROM emergency_reports LIMIT 10");
        $emergencyNameCheckStmt->execute();
        $emergencyNames = $emergencyNameCheckStmt->fetchAll(PDO::FETCH_COLUMN);
        error_log("Names in emergency_reports table: " . json_encode($emergencyNames));
        
        $allTransactions = [];

        $rvConcerns = transactions_table_has_reason_revoke($pdo, 'concerns') ? 'c.reason_revoke' : 'NULL';
        $rvEmergency = transactions_table_has_reason_revoke($pdo, 'emergency_reports') ? 'e.reason_revoke' : 'NULL';
        $rvIndigency = transactions_table_has_reason_revoke($pdo, 'indigency_forms') ? 'reason_revoke' : 'NULL';
        $rvIndigencyJoin = transactions_table_has_reason_revoke($pdo, 'indigency_forms') ? 'i.reason_revoke' : 'NULL';
        $rvBarangay = transactions_table_has_reason_revoke($pdo, 'barangay_id_forms') ? 'reason_revoke' : 'NULL';
        $rvBarangayJoin = transactions_table_has_reason_revoke($pdo, 'barangay_id_forms') ? 'b.reason_revoke' : 'NULL';
        $rvCert = transactions_table_has_reason_revoke($pdo, 'certification_forms') ? 'reason_revoke' : 'NULL';
        $rvCertJoin = transactions_table_has_reason_revoke($pdo, 'certification_forms') ? 'c.reason_revoke' : 'NULL';
        $rvCoe = transactions_table_has_reason_revoke($pdo, 'coe_forms') ? 'reason_revoke' : 'NULL';
        $rvCoeJoin = transactions_table_has_reason_revoke($pdo, 'coe_forms') ? 'coe.reason_revoke' : 'NULL';
        $rvClearance = transactions_table_has_reason_revoke($pdo, 'clearance_forms') ? 'reason_revoke' : 'NULL';
        $rvClearanceJoin = transactions_table_has_reason_revoke($pdo, 'clearance_forms') ? 'cl.reason_revoke' : 'NULL';

        $ratingConcerns = concern_rating_select_fragment($pdo);
        $suggestionsConcerns = concern_suggestions_select_fragment($pdo);
        $resolutionStatementConcerns = concern_resolution_statement_select_fragment($pdo);
        $hasResolvedExpr = concern_has_resolved_image_expression($pdo);
        $hasConcernExpr = concern_has_concern_image_expression($pdo);
        
        // Fetch concerns - Check if email column exists, if yes query directly by email, otherwise use JOIN
        $checkEmailColumn = $pdo->query("SHOW COLUMNS FROM concerns LIKE 'email'");
        $hasEmailColumn = $checkEmailColumn->rowCount() > 0;
        
        if ($hasEmailColumn) {
            $concernsStmt = $pdo->prepare("
                SELECT 
                    CONCAT('CONC-', c.id) as id,
                    'Community Concern' as document_type,
                    CONCAT('CONC-', LPAD(c.id, 6, '0')) as reference_number,
                    CASE 
                        WHEN c.status IS NULL OR c.status = '' THEN 'New'
                        WHEN c.status = 'pending' THEN 'New'
                        WHEN c.status = 'processing' THEN 'Processing'
                        WHEN c.status = 'resolved' THEN 'Finished'
                        WHEN c.status = 'cancelled' THEN 'cancelled'
                        ELSE c.status
                    END as status,
                    c.date_and_time as request_date,
                    c.process_at as processing_date,
                    c.resolved_at as completion_date,
                    c.statement as notes,
                    c.statement,
                    NULL as document_url,
                    c.date_and_time as created_at,
                    c.date_and_time as updated_at,
                    {$ratingConcerns} AS rating,
                    {$ratingConcerns} AS resident_rating,
                    {$suggestionsConcerns} AS suggestions,
                    {$resolutionStatementConcerns} AS resolution_statement,
                    NULL AS resolved_image,
                    {$hasResolvedExpr} AS has_resolved_image,
                    {$hasConcernExpr} AS has_concern_image,
                    {$rvConcerns} AS reason_revoke,
                    'concern' as request_type
                FROM concerns c
                WHERE LOWER(TRIM(COALESCE(c.email, ''))) = ?
                  AND TRIM(COALESCE(c.email, '')) <> ''
                ORDER BY c.date_and_time DESC
            ");
            $concernsStmt->execute([strtolower($userEmail)]);
        } else {
            $concernsStmt = $pdo->prepare("
                SELECT 
                    CONCAT('CONC-', c.id) as id,
                    'Community Concern' as document_type,
                    CONCAT('CONC-', LPAD(c.id, 6, '0')) as reference_number,
                    CASE 
                        WHEN c.status IS NULL OR c.status = '' THEN 'New'
                        WHEN c.status = 'pending' THEN 'New'
                        WHEN c.status = 'processing' THEN 'Processing'
                        WHEN c.status = 'resolved' THEN 'Finished'
                        WHEN c.status = 'cancelled' THEN 'cancelled'
                        ELSE c.status
                    END as status,
                    c.date_and_time as request_date,
                    c.process_at as processing_date,
                    c.resolved_at as completion_date,
                    c.statement as notes,
                    c.statement,
                    NULL as document_url,
                    c.date_and_time as created_at,
                    c.date_and_time as updated_at,
                    {$ratingConcerns} AS rating,
                    {$ratingConcerns} AS resident_rating,
                    {$suggestionsConcerns} AS suggestions,
                    {$resolutionStatementConcerns} AS resolution_statement,
                    NULL AS resolved_image,
                    {$hasResolvedExpr} AS has_resolved_image,
                    {$hasConcernExpr} AS has_concern_image,
                    {$rvConcerns} AS reason_revoke,
                    'concern' as request_type
                FROM concerns c
                INNER JOIN resident_information r ON c.reporter_name = CONCAT(TRIM(r.first_name), ' ', TRIM(r.last_name))
                WHERE LOWER(TRIM(r.email)) = ?
                ORDER BY c.date_and_time DESC
            ");
            $concernsStmt->execute([strtolower($userEmail)]);
        }
        $concerns = $concernsStmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($concerns as &$concernRow) {
            transactions_normalize_concern_resolved_image_for_api($concernRow);
        }
        unset($concernRow);
        error_log("Concerns found for email '" . $userEmail . "': " . count($concerns));
        foreach ($concerns as $concern) {
            error_log("Concern ID: " . $concern['id'] . ", Type: " . $concern['document_type'] . ", Request Type: " . $concern['request_type'] . ", Statement: " . $concern['statement']);
        }
        $allTransactions = array_merge($allTransactions, $concerns);
        
        // Fetch emergency reports - Check if email column exists, if yes query directly by email, otherwise use JOIN
        $checkEmailColumn = $pdo->query("SHOW COLUMNS FROM emergency_reports LIKE 'email'");
        $hasEmailColumn = $checkEmailColumn->rowCount() > 0;
        
        if ($hasEmailColumn) {
            $emergencyStmt = $pdo->prepare("
                SELECT 
                    CONCAT('EMRG-', e.id) as id,
                    CONCAT('Emergency: ', e.emergency_type) as document_type,
                    CONCAT('EMRG-', LPAD(e.id, 6, '0')) as reference_number,
                    CASE 
                        WHEN e.status IS NULL OR e.status = '' THEN 'New'
                        WHEN e.status = 'New' THEN 'New'
                        WHEN e.status = 'pending' THEN 'New'
                        WHEN e.status = 'processing' THEN 'Processing'
                        WHEN e.status = 'resolved' THEN 'Finished'
                        WHEN e.status = 'cancelled' THEN 'cancelled'
                        ELSE e.status
                    END as status,
                    e.date_and_time as request_date,
                    NULL as processing_date,
                    e.resolved_datetime as completion_date,
                    e.description as notes,
                    e.emergency_type,
                    NULL as document_url,
                    e.date_and_time as created_at,
                    e.date_and_time as updated_at,
                    {$rvEmergency} AS reason_revoke,
                    'emergency' as request_type
                FROM emergency_reports e
                WHERE e.email = ?
                ORDER BY e.date_and_time DESC
            ");
            $emergencyStmt->execute([$userEmail]);
        } else {
            $emergencyStmt = $pdo->prepare("
                SELECT 
                    CONCAT('EMRG-', e.id) as id,
                    CONCAT('Emergency: ', e.emergency_type) as document_type,
                    CONCAT('EMRG-', LPAD(e.id, 6, '0')) as reference_number,
                    CASE 
                        WHEN e.status IS NULL OR e.status = '' THEN 'New'
                        WHEN e.status = 'New' THEN 'New'
                        WHEN e.status = 'pending' THEN 'New'
                        WHEN e.status = 'processing' THEN 'Processing'
                        WHEN e.status = 'resolved' THEN 'Finished'
                        WHEN e.status = 'cancelled' THEN 'cancelled'
                        ELSE e.status
                    END as status,
                    e.date_and_time as request_date,
                    NULL as processing_date,
                    e.resolved_datetime as completion_date,
                    e.description as notes,
                    e.emergency_type,
                    NULL as document_url,
                    e.date_and_time as created_at,
                    e.date_and_time as updated_at,
                    {$rvEmergency} AS reason_revoke,
                    'emergency' as request_type
                FROM emergency_reports e
                INNER JOIN resident_information r ON e.reporter_name = CONCAT(TRIM(r.first_name), ' ', TRIM(r.last_name))
                WHERE r.email = ?
                ORDER BY e.date_and_time DESC
            ");
            $emergencyStmt->execute([$userEmail]);
        }
        $emergencies = $emergencyStmt->fetchAll(PDO::FETCH_ASSOC);
        error_log("Emergency reports found for email '" . $userEmail . "': " . count($emergencies));
        
        // Debug: Show each emergency report
        foreach ($emergencies as $emergency) {
            error_log("Emergency ID: " . $emergency['id'] . ", Type: " . $emergency['document_type'] . ", Status: " . $emergency['status']);
        }
        
        $allTransactions = array_merge($allTransactions, $emergencies);
        
        // Fetch indigency forms - Check if email column exists, if yes query directly by email, otherwise use JOIN
        $checkEmailColumn = $pdo->query("SHOW COLUMNS FROM indigency_forms LIKE 'email'");
        $hasEmailColumn = $checkEmailColumn->rowCount() > 0;
        
        if ($hasEmailColumn) {
            $indigencyStmt = $pdo->prepare("
                SELECT 
                    CONCAT('INDG-', id) as id,
                    'Certificate of Indigency' as document_type,
                    CONCAT('INDG-', LPAD(id, 6, '0')) as reference_number,
                    CASE 
                        WHEN status IS NULL OR status = '' THEN 'New'
                        WHEN status = 'pending' THEN 'New'
                        WHEN status = 'processing' THEN 'Processing'
                        WHEN status = 'completed' THEN 'Finished'
                        WHEN status = 'cancelled' THEN 'cancelled'
                        ELSE status
                    END as status,
                    submitted_at as request_date,
                    process_at as processing_date,
                    finish_at as completion_date,
                    purpose as notes,
                    NULL as document_url,
                    submitted_at as created_at,
                    submitted_at as updated_at,
                    {$rvIndigency} AS reason_revoke,
                    'indigency' as request_type
                FROM indigency_forms 
                WHERE email = ?
                ORDER BY submitted_at DESC
            ");
            $indigencyStmt->execute([$userEmail]);
        } else {
            $indigencyStmt = $pdo->prepare("
                SELECT 
                    CONCAT('INDG-', i.id) as id,
                    'Certificate of Indigency' as document_type,
                    CONCAT('INDG-', LPAD(i.id, 6, '0')) as reference_number,
                    CASE 
                        WHEN i.status IS NULL OR i.status = '' THEN 'New'
                        WHEN i.status = 'pending' THEN 'New'
                        WHEN i.status = 'processing' THEN 'Processing'
                        WHEN i.status = 'completed' THEN 'Finished'
                        WHEN i.status = 'cancelled' THEN 'cancelled'
                        ELSE i.status
                    END as status,
                    i.submitted_at as request_date,
                    i.process_at as processing_date,
                    i.finish_at as completion_date,
                    i.purpose as notes,
                    NULL as document_url,
                    i.submitted_at as created_at,
                    i.submitted_at as updated_at,
                    {$rvIndigencyJoin} AS reason_revoke,
                    'indigency' as request_type
                FROM indigency_forms i
                INNER JOIN resident_information r ON CONCAT(TRIM(r.first_name), ' ', TRIM(r.last_name)) = CONCAT(TRIM(i.first_name), ' ', TRIM(i.last_name))
                WHERE r.email = ?
                ORDER BY i.submitted_at DESC
            ");
            $indigencyStmt->execute([$userEmail]);
        }
        $indigencyForms = $indigencyStmt->fetchAll(PDO::FETCH_ASSOC);
        error_log("Indigency forms found for email '" . $userEmail . "': " . count($indigencyForms));
        $allTransactions = array_merge($allTransactions, $indigencyForms);
        
        // Fetch barangay ID forms - Check if email column exists, if yes query directly by email, otherwise use JOIN
        $checkEmailColumn = $pdo->query("SHOW COLUMNS FROM barangay_id_forms LIKE 'email'");
        $hasEmailColumn = $checkEmailColumn->rowCount() > 0;
        
        if ($hasEmailColumn) {
            $barangayIdStmt = $pdo->prepare("
                SELECT 
                    CONCAT('BID-', id) as id,
                    'Barangay ID' as document_type,
                    CONCAT('BID-', LPAD(id, 6, '0')) as reference_number,
                    CASE 
                        WHEN status IS NULL OR status = '' THEN 'New'
                        WHEN status = 'pending' THEN 'New'
                        WHEN status = 'processing' THEN 'Processing'
                        WHEN status = 'completed' THEN 'Finished'
                        WHEN status = 'cancelled' THEN 'cancelled'
                        ELSE status
                    END as status,
                    submitted_at as request_date,
                    process_at as processing_date,
                    finish_at as completion_date,
                    valid_id as notes,
                    NULL as document_url,
                    submitted_at as created_at,
                    submitted_at as updated_at,
                    {$rvBarangay} AS reason_revoke,
                    'barangay_id' as request_type
                FROM barangay_id_forms 
                WHERE email = ?
                ORDER BY submitted_at DESC
            ");
            $barangayIdStmt->execute([$userEmail]);
        } else {
            $barangayIdStmt = $pdo->prepare("
                SELECT 
                    CONCAT('BID-', b.id) as id,
                    'Barangay ID' as document_type,
                    CONCAT('BID-', LPAD(b.id, 6, '0')) as reference_number,
                    CASE 
                        WHEN b.status IS NULL OR b.status = '' THEN 'New'
                        WHEN b.status = 'pending' THEN 'New'
                        WHEN b.status = 'processing' THEN 'Processing'
                        WHEN b.status = 'completed' THEN 'Finished'
                        WHEN b.status = 'cancelled' THEN 'cancelled'
                        ELSE b.status
                    END as status,
                    b.submitted_at as request_date,
                    b.process_at as processing_date,
                    b.finish_at as completion_date,
                    b.valid_id as notes,
                    NULL as document_url,
                    b.submitted_at as created_at,
                    b.submitted_at as updated_at,
                    {$rvBarangayJoin} AS reason_revoke,
                    'barangay_id' as request_type
                FROM barangay_id_forms b
                INNER JOIN resident_information r ON CONCAT(TRIM(r.first_name), ' ', TRIM(r.last_name)) = CONCAT(TRIM(b.given_name), ' ', TRIM(b.last_name))
                WHERE r.email = ?
                ORDER BY b.submitted_at DESC
            ");
            $barangayIdStmt->execute([$userEmail]);
        }
        $barangayIdForms = $barangayIdStmt->fetchAll(PDO::FETCH_ASSOC);
        error_log("Barangay ID forms found for email '" . $userEmail . "': " . count($barangayIdForms));
        $allTransactions = array_merge($allTransactions, $barangayIdForms);
        
        // Fetch certification forms - Check if email column exists, if yes query directly by email, otherwise use JOIN
        $checkEmailColumn = $pdo->query("SHOW COLUMNS FROM certification_forms LIKE 'email'");
        $hasEmailColumn = $checkEmailColumn->rowCount() > 0;
        
        if ($hasEmailColumn) {
            $certificationStmt = $pdo->prepare("
                SELECT 
                    CONCAT('CERT-', id) as id,
                    'Certification' as document_type,
                    CONCAT('CERT-', LPAD(id, 6, '0')) as reference_number,
                    CASE 
                        WHEN status IS NULL OR status = '' THEN 'New'
                        WHEN status = 'pending' THEN 'New'
                        WHEN status = 'processing' THEN 'Processing'
                        WHEN status = 'completed' THEN 'Finished'
                        WHEN status = 'cancelled' THEN 'cancelled'
                        ELSE status
                    END as status,
                    submitted_at as request_date,
                    process_at as processing_date,
                    finish_at as completion_date,
                    purpose as notes,
                    NULL as document_url,
                    submitted_at as created_at,
                    submitted_at as updated_at,
                    {$rvCert} AS reason_revoke,
                    'certification' as request_type
                FROM certification_forms 
                WHERE email = ?
                ORDER BY submitted_at DESC
            ");
            $certificationStmt->execute([$userEmail]);
        } else {
            $certificationStmt = $pdo->prepare("
                SELECT 
                    CONCAT('CERT-', c.id) as id,
                    'Certification' as document_type,
                    CONCAT('CERT-', LPAD(c.id, 6, '0')) as reference_number,
                    CASE 
                        WHEN c.status IS NULL OR c.status = '' THEN 'New'
                        WHEN c.status = 'pending' THEN 'New'
                        WHEN c.status = 'processing' THEN 'Processing'
                        WHEN c.status = 'completed' THEN 'Finished'
                        WHEN c.status = 'cancelled' THEN 'cancelled'
                        ELSE c.status
                    END as status,
                    c.submitted_at as request_date,
                    c.process_at as processing_date,
                    c.finish_at as completion_date,
                    c.purpose as notes,
                    NULL as document_url,
                    c.submitted_at as created_at,
                    c.submitted_at as updated_at,
                    {$rvCertJoin} AS reason_revoke,
                    'certification' as request_type
                FROM certification_forms c
                INNER JOIN resident_information r ON CONCAT(TRIM(r.first_name), ' ', TRIM(r.last_name)) = CONCAT(TRIM(c.first_name), ' ', TRIM(c.last_name))
                WHERE r.email = ?
                ORDER BY c.submitted_at DESC
            ");
            $certificationStmt->execute([$userEmail]);
        }
        $certificationForms = $certificationStmt->fetchAll(PDO::FETCH_ASSOC);
        error_log("Certification forms found for email '" . $userEmail . "': " . count($certificationForms));
        $allTransactions = array_merge($allTransactions, $certificationForms);
        
        // Fetch COE forms - Check if email column exists, if yes query directly by email, otherwise use JOIN
        $checkEmailColumn = $pdo->query("SHOW COLUMNS FROM coe_forms LIKE 'email'");
        $hasEmailColumn = $checkEmailColumn->rowCount() > 0;
        
        if ($hasEmailColumn) {
            $coeStmt = $pdo->prepare("
                SELECT 
                    CONCAT('COE-', id) as id,
                    'Certificate of Employment' as document_type,
                    CONCAT('COE-', LPAD(id, 6, '0')) as reference_number,
                    CASE 
                        WHEN status IS NULL OR status = '' THEN 'New'
                        WHEN status = 'pending' THEN 'New'
                        WHEN status = 'processing' THEN 'Processing'
                        WHEN status = 'completed' THEN 'Finished'
                        WHEN status = 'cancelled' THEN 'cancelled'
                        ELSE status
                    END as status,
                    submitted_at as request_date,
                    process_at as processing_date,
                    finish_at as completion_date,
                    position as notes,
                    NULL as document_url,
                    submitted_at as created_at,
                    submitted_at as updated_at,
                    {$rvCoe} AS reason_revoke,
                    'coe' as request_type
                FROM coe_forms 
                WHERE email = ?
                ORDER BY submitted_at DESC
            ");
            $coeStmt->execute([$userEmail]);
        } else {
            $coeStmt = $pdo->prepare("
                SELECT 
                    CONCAT('COE-', coe.id) as id,
                    'Certificate of Employment' as document_type,
                    CONCAT('COE-', LPAD(coe.id, 6, '0')) as reference_number,
                    CASE 
                        WHEN coe.status IS NULL OR coe.status = '' THEN 'New'
                        WHEN coe.status = 'pending' THEN 'New'
                        WHEN coe.status = 'processing' THEN 'Processing'
                        WHEN coe.status = 'completed' THEN 'Finished'
                        WHEN coe.status = 'cancelled' THEN 'cancelled'
                        ELSE coe.status
                    END as status,
                    coe.submitted_at as request_date,
                    coe.process_at as processing_date,
                    coe.finish_at as completion_date,
                    coe.position as notes,
                    NULL as document_url,
                    coe.submitted_at as created_at,
                    coe.submitted_at as updated_at,
                    {$rvCoeJoin} AS reason_revoke,
                    'coe' as request_type
                FROM coe_forms coe
                INNER JOIN resident_information r ON CONCAT(TRIM(r.first_name), ' ', TRIM(r.last_name)) = CONCAT(TRIM(coe.first_name), ' ', TRIM(coe.last_name))
                WHERE r.email = ?
                ORDER BY coe.submitted_at DESC
            ");
            $coeStmt->execute([$userEmail]);
        }
        $coeForms = $coeStmt->fetchAll(PDO::FETCH_ASSOC);
        error_log("COE forms found for email '" . $userEmail . "': " . count($coeForms));
        $allTransactions = array_merge($allTransactions, $coeForms);
        
        // Fetch clearance forms - Check if email column exists, if yes query directly by email, otherwise use JOIN
        $checkEmailColumn = $pdo->query("SHOW COLUMNS FROM clearance_forms LIKE 'email'");
        $hasEmailColumn = $checkEmailColumn->rowCount() > 0;
        
        if ($hasEmailColumn) {
            $clearanceStmt = $pdo->prepare("
                SELECT 
                    CONCAT('CLR-', id) as id,
                    'Clearance Certificate' as document_type,
                    CONCAT('CLR-', LPAD(id, 6, '0')) as reference_number,
                    CASE 
                        WHEN status IS NULL OR status = '' THEN 'New'
                        WHEN status = 'pending' THEN 'New'
                        WHEN status = 'processing' THEN 'Processing'
                        WHEN status = 'completed' THEN 'Finished'
                        WHEN status = 'cancelled' THEN 'cancelled'
                        ELSE status
                    END as status,
                    submitted_at as request_date,
                    process_at as processing_date,
                    finish_at as completion_date,
                    purpose as notes,
                    NULL as document_url,
                    submitted_at as created_at,
                    submitted_at as updated_at,
                    {$rvClearance} AS reason_revoke,
                    'clearance' as request_type
                FROM clearance_forms 
                WHERE email = ?
                ORDER BY submitted_at DESC
            ");
            $clearanceStmt->execute([$userEmail]);
        } else {
            $clearanceStmt = $pdo->prepare("
                SELECT 
                    CONCAT('CLR-', cl.id) as id,
                    'Clearance Certificate' as document_type,
                    CONCAT('CLR-', LPAD(cl.id, 6, '0')) as reference_number,
                    CASE 
                        WHEN cl.status IS NULL OR cl.status = '' THEN 'New'
                        WHEN cl.status = 'pending' THEN 'New'
                        WHEN cl.status = 'processing' THEN 'Processing'
                        WHEN cl.status = 'completed' THEN 'Finished'
                        WHEN cl.status = 'cancelled' THEN 'cancelled'
                        ELSE cl.status
                    END as status,
                    cl.submitted_at as request_date,
                    cl.process_at as processing_date,
                    cl.finish_at as completion_date,
                    cl.purpose as notes,
                    NULL as document_url,
                    cl.submitted_at as created_at,
                    cl.submitted_at as updated_at,
                    {$rvClearanceJoin} AS reason_revoke,
                    'clearance' as request_type
                FROM clearance_forms cl
                INNER JOIN resident_information r ON CONCAT(TRIM(r.first_name), ' ', TRIM(r.last_name)) = CONCAT(TRIM(cl.first_name), ' ', TRIM(cl.last_name))
                WHERE r.email = ?
                ORDER BY cl.submitted_at DESC
            ");
            $clearanceStmt->execute([$userEmail]);
        }
        $clearanceForms = $clearanceStmt->fetchAll(PDO::FETCH_ASSOC);
        error_log("Clearance forms found for email '" . $userEmail . "': " . count($clearanceForms));
        $allTransactions = array_merge($allTransactions, $clearanceForms);
        
        // Sort all transactions by creation date (newest first)
        usort($allTransactions, function($a, $b) {
            return strtotime($b['created_at']) - strtotime($a['created_at']);
        });
        
        // Debug: Log status values
        error_log("TOTAL TRANSACTIONS FOR EMAIL '" . $userEmail . "': " . count($allTransactions));
        $statusCounts = array_count_values(array_column($allTransactions, 'status'));
        error_log("Status counts for email: " . json_encode($statusCounts));
        
        // Debug: Show which transactions belong to this email
        foreach ($allTransactions as $transaction) {
            error_log("Transaction ID: " . $transaction['id'] . ", Type: " . $transaction['document_type'] . ", Status: " . $transaction['status']);
        }
        
        $jsonFlags = JSON_UNESCAPED_UNICODE;
        if (defined('JSON_INVALID_UTF8_SUBSTITUTE')) {
            $jsonFlags |= JSON_INVALID_UTF8_SUBSTITUTE;
        }
        echo json_encode([
            'success' => true,
            'transactions' => $allTransactions,
            'user_name' => $userName,
            'total_count' => count($allTransactions)
        ], $jsonFlags);
        
    } catch (PDOException $e) {
        error_log("Failed to fetch transactions: " . $e->getMessage());
        echo json_encode([
            'success' => false,
            'message' => 'Failed to fetch transactions: ' . $e->getMessage()
        ]);
    }
}

// Download document
function downloadDocument($pdo) {
    try {
        $transactionId = $_GET['id'] ?? null;
        
        if (!$transactionId) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Transaction ID required']);
            return;
        }
        
        $stmt = $pdo->prepare("
            SELECT document_url, document_type, reference_number
            FROM transactions 
            WHERE id = ? AND status = 'completed'
        ");
        
        $stmt->execute([$transactionId]);
        $transaction = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$transaction) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Document not found']);
            return;
        }
        
        $documentPath = $transaction['document_url'];
        
        if (file_exists($documentPath)) {
            header('Content-Type: application/pdf');
            header('Content-Disposition: attachment; filename="' . $transaction['document_type'] . '_' . $transaction['reference_number'] . '.pdf"');
            header('Content-Length: ' . filesize($documentPath));
            readfile($documentPath);
        } else {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Document file not found']);
        }
        
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to download document']);
    }
}

// Cancel transaction
function cancelTransaction($pdo) {
    try {
        $input = json_decode(file_get_contents('php://input'), true);
        $transactionId = $input['transaction_id'] ?? null;
        
        if (!$transactionId) {
            echo json_encode(['success' => false, 'message' => 'Transaction ID required']);
            return;
        }
        
        $stmt = $pdo->prepare("
            UPDATE transactions 
            SET status = 'cancelled', updated_at = NOW()
            WHERE id = ? AND status = 'pending'
        ");
        
        $result = $stmt->execute([$transactionId]);
        
        if ($stmt->rowCount() > 0) {
            echo json_encode(['success' => true, 'message' => 'Transaction cancelled successfully']);
        } else {
            echo json_encode(['success' => false, 'message' => 'Transaction not found or cannot be cancelled']);
        }
        
    } catch (PDOException $e) {
        echo json_encode(['success' => false, 'message' => 'Failed to cancel transaction']);
    }
}


?>
