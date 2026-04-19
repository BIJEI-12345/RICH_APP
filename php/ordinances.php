<?php
/**
 * Barangay Ordinance carousel API.
 *
 * - GET  php/ordinances.php?image_id=N  — serve bytes from `ordinance`.`image` (BLOB/path/URL in column)
 * - GET  php/ordinances.php             — JSON { success, ordinances: [{ id, caption, image_url }] }
 *
 * Table: `ordinance` or `ordinances`. Column `image` (required) — VARCHAR path or LONGBLOB.
 */
if (!ob_get_level()) {
    ob_start();
}
ini_set('display_errors', '0');

/**
 * @return string[] column names
 */
function ordinance_table_columns(PDO $pdo, string $table): array
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

/** @return array{type: string, field: string} field = 'image' or 'img' */
function ordinance_resolve_image_field(PDO $pdo, string $table): ?array
{
    $cols = ordinance_table_columns($pdo, $table);
    if (in_array('image', $cols, true)) {
        $stmt = $pdo->query("SHOW COLUMNS FROM `" . preg_replace('/[^a-zA-Z0-9_]/', '', $table) . "` LIKE 'image'");
        $row = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : null;
        $type = $row ? strtolower((string) ($row['Type'] ?? '')) : '';
        return ['type' => $type, 'field' => 'image'];
    }
    if (in_array('img', $cols, true)) {
        $stmt = $pdo->query("SHOW COLUMNS FROM `" . preg_replace('/[^a-zA-Z0-9_]/', '', $table) . "` LIKE 'img'");
        $row = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : null;
        $type = $row ? strtolower((string) ($row['Type'] ?? '')) : '';
        return ['type' => $type, 'field' => 'img'];
    }
    return null;
}

function ordinance_column_is_blob(string $mysqlType): bool
{
    $t = strtolower($mysqlType);
    if (preg_match('/\b(tiny|medium|long)?blob\b/', $t)) {
        return true;
    }
    // Raw byte columns (same streaming/list behavior as BLOB)
    if (strpos($t, 'varbinary') !== false) {
        return true;
    }
    return false;
}

/**
 * PDO/MySQL may return BLOB as string, stream resource, or (rare) other — normalize to raw bytes string.
 *
 * @param mixed $v
 * @return string|null null if empty / unsupported
 */
function ordinance_normalize_image_column_value($v): ?string
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
        } catch (\Throwable $e) {
            return null;
        }
    }
    if (is_scalar($v)) {
        $s = (string) $v;
        return $s !== '' ? $s : null;
    }
    return null;
}

function ordinance_resolve_path_url(string $raw): string
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

// ---------- Serve single image (DB column `image`) ----------
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

    $table = null;
    foreach (['ordinance', 'ordinances'] as $candidate) {
        $check = $pdo->query('SHOW TABLES LIKE ' . $pdo->quote($candidate));
        if ($check && $check->rowCount() > 0) {
            $table = $candidate;
            break;
        }
    }
    if ($table === null) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Not found';
        exit;
    }

    $imgMeta = ordinance_resolve_image_field($pdo, $table);
    if ($imgMeta === null) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Not found';
        exit;
    }

    $idCol = in_array('id', ordinance_table_columns($pdo, $table), true)
        ? 'id'
        : (in_array('ordinance_id', ordinance_table_columns($pdo, $table), true) ? 'ordinance_id' : null);
    if ($idCol === null) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Not found';
        exit;
    }

    $imgField = $imgMeta['field'];
    $stmt = $pdo->prepare("SELECT `{$imgField}` FROM `{$table}` WHERE `{$idCol}` = ? LIMIT 1");
    $stmt->execute([$imageId]);
    $imageData = ordinance_normalize_image_column_value($stmt->fetchColumn(0));

    if ($imageData === null) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Not found';
        exit;
    }

    $info = ['title' => 'Ordinance'];
    try {
        announcement_try_output_image_from_column_value($imageData, $imageId, $info);
    } catch (Throwable $e) {
        error_log('ordinances.php image_id=' . $imageId . ': ' . $e->getMessage());
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

// ---------- JSON list (never embed binary from `image` BLOB) ----------
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');
header('Access-Control-Allow-Headers: Content-Type');
header('Cache-Control: no-store, no-cache, must-revalidate');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

require_once __DIR__ . '/env_loader.php';

while (ob_get_level()) {
    ob_end_clean();
}

$pdo = getDBConnection();
if (!$pdo) {
    echo json_encode(['success' => false, 'message' => 'Database connection failed']);
    exit;
}

try {
    $table = null;
    foreach (['ordinance', 'ordinances'] as $candidate) {
        $check = $pdo->query('SHOW TABLES LIKE ' . $pdo->quote($candidate));
        if ($check && $check->rowCount() > 0) {
            $table = $candidate;
            break;
        }
    }
    if ($table === null) {
        echo json_encode(['success' => true, 'ordinances' => []]);
        exit;
    }

    $imgMeta = ordinance_resolve_image_field($pdo, $table);
    if ($imgMeta === null) {
        echo json_encode(['success' => true, 'ordinances' => []]);
        exit;
    }

    $cols = ordinance_table_columns($pdo, $table);
    $isBlob = ordinance_column_is_blob($imgMeta['type']);
    $imgField = $imgMeta['field'];

    $select = [];
    if (in_array('id', $cols, true)) {
        $select[] = '`id`';
    } elseif (in_array('ordinance_id', $cols, true)) {
        $select[] = '`ordinance_id` AS `id`';
    }
    if ($isBlob) {
        $select[] = 'COALESCE(LENGTH(`' . $imgField . '`), 0) AS `_img_len`';
    } else {
        $select[] = '`' . $imgField . '` AS `image`';
    }
    if (in_array('caption', $cols, true)) {
        $select[] = '`caption`';
    }

    if ($select === []) {
        echo json_encode(['success' => true, 'ordinances' => []]);
        exit;
    }

    $sql = 'SELECT ' . implode(', ', $select) . ' FROM `' . $table . '`';
    if (in_array('is_active', $cols, true)) {
        $sql .= ' WHERE `is_active` = 1';
    }
    $orderParts = [];
    if (in_array('sort_order', $cols, true)) {
        $orderParts[] = '`sort_order` ASC';
    }
    if (in_array('id', $cols, true)) {
        $orderParts[] = '`id` ASC';
    } elseif (in_array('ordinance_id', $cols, true)) {
        $orderParts[] = '`ordinance_id` ASC';
    }
    if (!empty($orderParts)) {
        $sql .= ' ORDER BY ' . implode(', ', $orderParts);
    }

    $stmt = $pdo->query($sql);
    if (!$stmt) {
        throw new PDOException('Query failed');
    }
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $out = [];
    $rowNum = 0;
    $listCacheBust = bin2hex(random_bytes(4));

    foreach ($rows as $row) {
        $rowNum++;
        $idVal = isset($row['id']) ? (int) $row['id'] : $rowNum;

        if ($isBlob) {
            $len = (int) ($row['_img_len'] ?? 0);
            if ($len < 1) {
                continue;
            }
            $imageUrl = 'php/ordinances.php?image_id=' . $idVal . '&t=' . $listCacheBust;
        } else {
            $imgRaw = isset($row['image']) ? (string) $row['image'] : '';
            $imageUrl = ordinance_resolve_path_url($imgRaw);
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
        ];
    }

    $flags = JSON_UNESCAPED_UNICODE;
    if (defined('JSON_INVALID_UTF8_SUBSTITUTE')) {
        $flags |= JSON_INVALID_UTF8_SUBSTITUTE;
    }
    $json = json_encode(['success' => true, 'ordinances' => $out], $flags);
    if ($json === false) {
        error_log('ordinances.php: json_encode failed: ' . json_last_error_msg());
        echo json_encode(['success' => false, 'message' => 'Failed to encode response']);
        exit;
    }
    echo $json;
} catch (PDOException $e) {
    error_log('ordinances.php: ' . $e->getMessage());
    echo json_encode(['success' => false, 'message' => 'Failed to load ordinances']);
} catch (Throwable $e) {
    error_log('ordinances.php: ' . $e->getMessage());
    echo json_encode(['success' => false, 'message' => 'Failed to load ordinances']);
}
