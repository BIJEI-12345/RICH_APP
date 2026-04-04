<?php
/**
 * Detect "Barangay Bigte" / "BIGTE" in OCR text. Human-readable IDs often fail because
 * OCR misreads B→8, merges lines, or drops small text at the card edge.
 */
function bigte_present_in_ocr_text(string $fullText): bool
{
    if ($fullText === '') {
        return false;
    }
    if (stripos($fullText, 'bigte') !== false) {
        return true;
    }
    $oneLine = preg_replace('/\s+/u', ' ', $fullText);
    // Common misread: B as 8 in "BIGTE" / "8IGTE"
    if (preg_match('/\b[8b]igte\b/iu', $oneLine)) {
        return true;
    }
    // Split letters / noise: "BIG TE", "B I G T E"
    if (preg_match('/\bb[\s\.\-]*i[\s\.\-]*g[\s\.\-]*t[\s\.\-]*e\b/iu', $oneLine)) {
        return true;
    }
    // Address line patterns on PhilIDs
    if (preg_match('/upper\s*,?\s*[b8]igte/iu', $oneLine)) {
        return true;
    }
    if (preg_match('/tirahan.*[b8]igte/iu', $oneLine)) {
        return true;
    }
    // Weak but useful: explicit barangay + Bigte fragment
    if (preg_match('/barangay|brgy\.?/iu', $oneLine) && preg_match('/[b8]igte/iu', $oneLine)) {
        return true;
    }

    return false;
}
