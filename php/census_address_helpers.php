<?php
/**
 * Compare two address strings as likely the same (format differences, spacing, etc.).
 * Shared by check_census.php and request.php (document requests).
 */
function censusAddressesLikelyMatch($submittedAddress, $censusAddress) {
    $submittedAddress = trim((string) $submittedAddress);
    $censusAddress = trim((string) $censusAddress);
    if ($submittedAddress === '' || $censusAddress === '') {
        return false;
    }

    $normalizeCompact = function ($value) {
        $value = mb_strtolower(trim((string) $value), 'UTF-8');
        $value = preg_replace('/[^a-z0-9]+/u', '', $value);
        return $value ?? '';
    };

    $a = $normalizeCompact($submittedAddress);
    $b = $normalizeCompact($censusAddress);
    if ($a === '' || $b === '') {
        return false;
    }
    if ($a === $b) {
        return true;
    }
    if (strpos($b, $a) !== false || strpos($a, $b) !== false) {
        return true;
    }

    similar_text($a, $b, $pct);
    if ($pct >= 72.0) {
        return true;
    }

    $tokens = function ($s) {
        $s = mb_strtolower($s, 'UTF-8');
        $s = preg_replace('/[^a-z0-9]+/u', ' ', $s);
        $parts = preg_split('/\s+/', trim($s), -1, PREG_SPLIT_NO_EMPTY);
        return array_values(array_unique(array_filter($parts, function ($w) {
            return strlen($w) >= 4;
        })));
    };
    $ta = $tokens($submittedAddress);
    $tb = $tokens($censusAddress);
    if (count($ta) === 0 || count($tb) === 0) {
        return $pct >= 65.0;
    }
    $inter = array_intersect($ta, $tb);
    if (count($inter) >= 2) {
        return true;
    }
    if (count($inter) === 1 && (count($ta) <= 3 || count($tb) <= 3)) {
        return true;
    }

    return false;
}
