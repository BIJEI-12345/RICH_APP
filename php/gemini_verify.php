<?php
// Gemini-based ID address verification
// Input JSON: { image_base64: "data:image/...;base64,XXXX" }
// Output JSON: { success: bool, ok: bool, hasMatch: bool, addressText: string, fullText?: string, message?: string }

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Ensure PHP errors are not output as HTML
ini_set('display_errors', 0);
ini_set('log_errors', 1);

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

// Use provided API key (replace safely later with env)
$API_KEY = 'AIzaSyDEQCI1lgzjGRIBXO1urcy5mL1_nhNxXRc';
$URL = 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=' . urlencode($API_KEY);

try {
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true);
    if (!$payload || empty($payload['image_base64'])) {
        echo json_encode(['success' => false, 'ok' => false, 'message' => 'image_base64 is required']);
        exit;
    }

    $imageBase64 = $payload['image_base64'];
    if (strpos($imageBase64, ',') !== false) {
        $imageBase64 = explode(',', $imageBase64, 2)[1];
    }

    $prompt = <<<PROMPT
You are an OCR assistant. Read ONLY what is necessary.
Return JSON only (no prose) with this exact shape:
{"hasMatch": true|false, "firstName": "", "middleName": "", "lastName": ""}
Where hasMatch is true if and only if the printed ADDRESS on the ID contains the word "Bigte" (case-insensitive, any format).
Extract the printed person name fields if visible; otherwise keep them empty strings.
No extra keys, no comments, JSON only.
PROMPT;

    $body = [
        'contents' => [[
            'parts' => [
                [ 'inline_data' => [ 'mime_type' => 'image/jpeg', 'data' => $imageBase64 ] ],
                [ 'text' => $prompt ]
            ]
        ]]
    ];

    $ch = curl_init($URL);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [ 'Content-Type: application/json' ]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    $resp = curl_exec($ch);
    if ($resp === false) {
        $err = curl_error($ch);
        curl_close($ch);
        echo json_encode(['success' => false, 'ok' => false, 'message' => $err]);
        exit;
    }
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($status < 200 || $status >= 300) {
        echo json_encode(['success' => false, 'ok' => false, 'message' => 'Gemini returned status ' . $status, 'raw' => $resp]);
        exit;
    }

    $data = json_decode($resp, true);
    $text = '';
    if (isset($data['candidates'][0]['content']['parts'])) {
        foreach ($data['candidates'][0]['content']['parts'] as $part) {
            if (isset($part['text'])) { $text .= $part['text']; }
        }
    }

    // Attempt to decode JSON response from model
    $extracted = null;
    if ($text) {
        $jsonStart = strpos($text, '{');
        $jsonEnd = strrpos($text, '}');
        if ($jsonStart !== false && $jsonEnd !== false && $jsonEnd > $jsonStart) {
            $jsonStr = substr($text, $jsonStart, $jsonEnd - $jsonStart + 1);
            $extracted = json_decode($jsonStr, true);
        }
    }

    $address = '';
    $fullText = '';
    $firstName = '';
    $middleName = '';
    $lastName = '';
    if (is_array($extracted)) {
        // New compact schema
        if (isset($extracted['hasMatch'])) {
            $hasBigte = (bool)$extracted['hasMatch'];
        }
        $address = isset($extracted['address']) ? (string)$extracted['address'] : '';
        $fullText = isset($extracted['fullText']) ? (string)$extracted['fullText'] : '';
        $firstName = isset($extracted['firstName']) ? (string)$extracted['firstName'] : '';
        $middleName = isset($extracted['middleName']) ? (string)$extracted['middleName'] : '';
        $lastName = isset($extracted['lastName']) ? (string)$extracted['lastName'] : '';
    } else {
        // Fallback: use model text as fullText
        $fullText = $text;
    }

    if (!isset($hasBigte)) {
        // Fallback: check if "Bigte" is in the address or full text (case-insensitive)
        $haystack = strtolower($address . ' ' . $fullText);
        $hasBigte = strpos($haystack, 'bigte') !== false;
    }

    echo json_encode([
        'success' => true,
        'ok' => true,
        'hasMatch' => $hasBigte,
        'addressText' => $address,
        'fullText' => $fullText,
        'firstName' => $firstName,
        'middleName' => $middleName,
        'lastName' => $lastName
    ]);
} catch (Throwable $e) {
    echo json_encode(['success' => false, 'ok' => false, 'message' => $e->getMessage()]);
}

?>


