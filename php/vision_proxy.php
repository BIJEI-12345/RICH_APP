<?php
// Proxy endpoint for Google Cloud Vision TEXT_DETECTION
// Accepts JSON: { image_base64: "data:image/...;base64,xxxx" }
// Returns JSON: { success: bool, hasBigte: bool, fullText: string, message?: string }

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

// TODO: Move to environment variable or secure config
$API_KEY = 'AIzaSyDjHCEp9AntErTKlMSNwkWCADw1nUk2okQ';
$VISION_URL = 'https://vision.googleapis.com/v1/images:annotate?key=' . urlencode($API_KEY);

try {
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true);
    if (!$payload || empty($payload['image_base64'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'image_base64 is required']);
        exit;
    }

    $imageBase64 = $payload['image_base64'];
    // Remove data URL prefix if present
    if (strpos($imageBase64, ',') !== false) {
        $imageBase64 = explode(',', $imageBase64, 2)[1];
    }

    $requestBody = [
        'requests' => [[
            'image' => [ 'content' => $imageBase64 ],
            'features' => [[ 'type' => 'TEXT_DETECTION', 'maxResults' => 1 ]]
        ]]
    ];

    $ch = curl_init($VISION_URL);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [ 'Content-Type: application/json' ]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($requestBody));

    $response = curl_exec($ch);
    if ($response === false) {
        $err = curl_error($ch);
        curl_close($ch);
        // Always return 200 with structured error to avoid browser network errors
        echo json_encode(['success' => false, 'message' => 'Vision request failed', 'error' => $err]);
        exit;
    }

    $statusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($statusCode < 200 || $statusCode >= 300) {
        // Return JSON error but keep 200 to simplify client handling
        echo json_encode(['success' => false, 'message' => 'Vision API returned status ' . $statusCode, 'raw' => $response]);
        exit;
    }

    $data = json_decode($response, true);
    $textAnnotations = $data['responses'][0]['textAnnotations'] ?? null;
    $fullText = '';
    if (is_array($textAnnotations) && count($textAnnotations) > 0) {
        $fullText = $textAnnotations[0]['description'] ?? '';
    }

    $hasBigte = stripos($fullText, 'bigte') !== false;

    echo json_encode([
        'success' => true,
        'hasBigte' => $hasBigte,
        'fullText' => $fullText
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error', 'error' => $e->getMessage()]);
}

?>


