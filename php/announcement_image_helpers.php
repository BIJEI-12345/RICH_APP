<?php
/**
 * Helpers for announcements.image column: LONGBLOB, project-relative path,
 * full URL, data URLs, base64 text, or binary with UTF-8 BOM / leading whitespace.
 */

/**
 * Serve an announcement image when the DB column stores a project-relative path (e.g. Images/foo.jpg)
 * instead of raw binary. Returns true if the file was sent and the script should exit.
 */
function tryServeAnnouncementImageFromStoredPath($raw, $imageId) {
    if (!is_string($raw)) {
        return false;
    }
    $trim = str_replace('\\', '/', trim($raw));
    $len = strlen($trim);
    if ($len < 3 || $len > 2048) {
        return false;
    }
    if (strpos($trim, "\0") !== false || strpos($trim, '..') !== false) {
        return false;
    }
    if (!preg_match('/^[\\w\\-\\.\\/ ]+$/', $trim)) {
        return false;
    }

    $base = realpath(__DIR__ . '/..');
    if ($base === false) {
        return false;
    }

    $full = realpath($base . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $trim));
    if ($full === false || !is_file($full)) {
        return false;
    }

    $baseNorm = str_replace('\\', '/', $base);
    $fullNorm = str_replace('\\', '/', $full);
    if (strpos($fullNorm, $baseNorm) !== 0) {
        return false;
    }

    $mime = 'image/jpeg';
    if (function_exists('finfo_open')) {
        $f = @finfo_open(FILEINFO_MIME_TYPE);
        if ($f) {
            $detected = @finfo_file($f, $full);
            finfo_close($f);
            if ($detected && strpos($detected, 'image/') === 0) {
                $mime = $detected;
            }
        }
    }

    while (ob_get_level()) {
        ob_end_clean();
    }

    header('Content-Type: ' . $mime, true);
    header('Content-Length: ' . filesize($full), true);
    header('Accept-Ranges: bytes', true);
    header('Cache-Control: no-cache, no-store, must-revalidate', true);
    header('Pragma: no-cache', true);
    header('Expires: 0', true);

    readfile($full);

    if (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
    } else {
        flush();
    }

    error_log("Served announcement image_id={$imageId} from file path: {$trim}");
    exit;
}

/**
 * Strip UTF-8 BOM and a small amount of leading ASCII whitespace before image magic bytes.
 */
function announcement_image_strip_prefix_noise($binary) {
    if (!is_string($binary) || $binary === '') {
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
 * If the column holds a full http(s) URL to an image, redirect the client there.
 * @return bool true if a redirect was sent (script exits)
 */
function announcement_try_redirect_if_remote_image_url($raw) {
    if (!is_string($raw)) {
        return false;
    }
    $s = trim($raw);
    if ($s === '' || !preg_match('#^https?://#i', $s)) {
        return false;
    }
    $parts = parse_url($s);
    if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
        return false;
    }
    $scheme = strtolower($parts['scheme']);
    if ($scheme !== 'http' && $scheme !== 'https') {
        return false;
    }
    while (ob_get_level()) {
        ob_end_clean();
    }
    header('Cache-Control: no-cache, no-store, must-revalidate', true);
    header('Pragma: no-cache', true);
    header('Expires: 0', true);
    header('Location: ' . $s, true, 302);
    error_log('Announcement image: redirecting to remote URL for column value');
    exit;
}

/**
 * Decode data:image/...;base64,... payloads sometimes stored in VARCHAR.
 */
function announcement_try_decode_data_url($raw) {
    if (!is_string($raw)) {
        return null;
    }
    $raw = ltrim($raw);
    if (stripos($raw, 'data:image/') !== 0) {
        return null;
    }
    if (!preg_match('#^data:image/[^;]+;base64,#i', $raw)) {
        return null;
    }
    $comma = strpos($raw, ',');
    if ($comma === false) {
        return null;
    }
    $b64 = substr($raw, $comma + 1);
    $decoded = base64_decode($b64, true);
    if ($decoded === false || $decoded === '') {
        return null;
    }
    return announcement_image_strip_prefix_noise($decoded);
}

/**
 * If the whole column looks like base64 text for an image, decode it.
 */
function announcement_try_decode_plain_base64_image($raw) {
    if (!is_string($raw) || strlen($raw) < 32) {
        return null;
    }
    $compact = preg_replace('/\s+/', '', $raw);
    if (strlen($compact) < 32 || !preg_match('#^[A-Za-z0-9+/]+=*$#', $compact)) {
        return null;
    }
    $decoded = base64_decode($compact, true);
    if ($decoded === false || strlen($decoded) < 4) {
        return null;
    }
    if (announcement_detect_raster_content_type($decoded) === null) {
        return null;
    }
    return $decoded;
}

/**
 * @return string|null MIME type like image/jpeg, or null if not a known raster signature
 */
function announcement_detect_raster_content_type($binary) {
    if (!is_string($binary)) {
        return null;
    }
    $imageDataLength = strlen($binary);
    if ($imageDataLength < 2) {
        return null;
    }
    if ($imageDataLength >= 2 && substr($binary, 0, 2) === "\xFF\xD8") {
        return 'image/jpeg';
    }
    if ($imageDataLength >= 8 && substr($binary, 0, 8) === "\x89PNG\r\n\x1a\n") {
        return 'image/png';
    }
    if ($imageDataLength >= 6 && (substr($binary, 0, 6) === 'GIF87a' || substr($binary, 0, 6) === 'GIF89a')) {
        return 'image/gif';
    }
    if ($imageDataLength >= 12 && substr($binary, 0, 4) === 'RIFF' && substr($binary, 8, 4) === 'WEBP') {
        return 'image/webp';
    }
    return null;
}

/**
 * Prepare raw column bytes: strip noise, optional data URL / base64 decode.
 */
function announcement_prepare_image_binary_from_column($raw) {
    if (!is_string($raw)) {
        return $raw;
    }

    $dataUrlDecoded = announcement_try_decode_data_url($raw);
    if ($dataUrlDecoded !== null) {
        return $dataUrlDecoded;
    }

    $imageData = announcement_image_strip_prefix_noise($raw);
    if (announcement_detect_raster_content_type($imageData) !== null) {
        return $imageData;
    }

    $b64 = announcement_try_decode_plain_base64_image($imageData);
    if ($b64 !== null) {
        return $b64;
    }

    return $imageData;
}

/**
 * Output raster image bytes with correct headers, then exit.
 */
function announcement_send_raster_bytes($imageData, $imageType, $imageId, $announcementTitle) {
    $imageDataLength = strlen($imageData);

    while (ob_get_level()) {
        ob_end_clean();
    }

    header('Content-Type: ' . $imageType, true);
    header('Content-Length: ' . $imageDataLength, true);
    header('Accept-Ranges: bytes', true);

    if (ob_get_level()) {
        ob_end_clean();
    }

    echo $imageData;

    if (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
    } else {
        flush();
    }

    error_log("Successfully served image for ID {$imageId} (Title: '{$announcementTitle}'), type: {$imageType}, size: {$imageDataLength} bytes");
    exit;
}

/**
 * Full pipeline: column value -> redirect, file path, or binary raster; returns false if caller should use default image.
 *
 * @param string $imageData Raw string from announcements.image
 * @param int $imageId Announcement primary key
 * @param array $announcementInfo Must include 'title' for logs
 * @return bool false only if image could not be served (caller may show default)
 */
function announcement_try_output_image_from_column_value($imageData, $imageId, array $announcementInfo) {
    announcement_try_redirect_if_remote_image_url($imageData);

    $prepared = announcement_prepare_image_binary_from_column($imageData);
    $imageType = announcement_detect_raster_content_type($prepared);

    if ($imageType !== null) {
        announcement_send_raster_bytes($prepared, $imageType, $imageId, $title);
    }

    error_log("No raster magic bytes for ID {$imageId}; trying VARCHAR path. First bytes: " . bin2hex(substr($prepared, 0, min(12, strlen($prepared)))));
    tryServeAnnouncementImageFromStoredPath($prepared, $imageId);

    return false;
}
