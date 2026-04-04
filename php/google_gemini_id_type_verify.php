<?php
// Google Vision API-based ID Type verification
// Input JSON: { image_base64: "data:image/...;base64,XXXX", expected_id_type: display string (same as HTML option value) }
// Output JSON: { success: bool, ok: bool, idTypeMatch: bool, detectedIdType: string, fullText: string, message?: string }

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

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

// Load environment variables
require_once __DIR__ . '/env_loader.php';

// Get Google Vision API URL
$VISION_URL = getGoogleVisionApiUrl();
if (!$VISION_URL) {
    http_response_code(500);
    echo json_encode(['success' => false, 'ok' => false, 'message' => 'API configuration error: GOOGLE_VISION_API_KEY is not set in .env file']);
    exit;
}

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

    $expectedIdType = $payload['expected_id_type'] ?? '';

    // Call Google Vision API to extract text from image
    $requestBody = [
        'requests' => [[
            'image' => ['content' => $imageBase64],
            'features' => [['type' => 'TEXT_DETECTION', 'maxResults' => 1]]
        ]]
    ];

    $ch = curl_init($VISION_URL);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($requestBody));
    $resp = curl_exec($ch);
    
    if ($resp === false) {
        $err = curl_error($ch);
        curl_close($ch);
        echo json_encode(['success' => false, 'ok' => false, 'message' => 'Google Vision API request failed: ' . $err]);
        exit;
    }
    
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    // Handle specific HTTP status codes
    if ($status === 401) {
        echo json_encode([
            'success' => false, 
            'ok' => false, 
            'message' => 'Invalid API key. Please check your Google Vision API key.',
            'status' => 401,
            'error_type' => 'authentication_failed'
        ]);
        exit;
    }

    if ($status === 403) {
        // Parse error details from Google Vision API response
        $errorData = json_decode($resp, true);
        $detailedMessage = 'API key does not have permission to access this resource.';
        
        // Extract more specific error message if available
        if (isset($errorData['error']['message'])) {
            $apiErrorMessage = $errorData['error']['message'];
            $detailedMessage = $apiErrorMessage;
            
            // Check if it's specifically about API not being enabled
            if (stripos($apiErrorMessage, 'has not been used') !== false || stripos($apiErrorMessage, 'is disabled') !== false) {
                $detailedMessage = 'Cloud Vision API is not enabled for this project. Please enable it in Google Cloud Console.';
            }
        }
        
        $responseData = [
            'success' => false, 
            'ok' => false, 
            'message' => $detailedMessage,
            'status' => 403,
            'error_type' => 'permission_denied',
            'raw_error' => isset($errorData['error']) ? $errorData['error'] : null
        ];
        
        echo json_encode($responseData);
        exit;
    }

    if ($status === 429) {
        echo json_encode([
            'success' => false, 
            'ok' => false, 
            'message' => 'API rate limit exceeded. Please try again later.',
            'status' => 429,
            'error_type' => 'rate_limit_exceeded'
        ]);
        exit;
    }

    if ($status < 200 || $status >= 300) {
        $errorData = json_decode($resp, true);
        $errorMessage = 'Google Vision API returned status ' . $status;
        if (isset($errorData['error']['message'])) {
            $apiErrorMsg = $errorData['error']['message'];
            $errorMessage .= ': ' . $apiErrorMsg;
            
            // Provide specific guidance for API not enabled
            if ($status === 403 && (stripos($apiErrorMsg, 'has not been used') !== false || stripos($apiErrorMsg, 'is disabled') !== false)) {
                $errorMessage = 'Cloud Vision API is not enabled. Please enable it in Google Cloud Console.';
            }
        }
        
        echo json_encode([
            'success' => false, 
            'ok' => false, 
            'message' => $errorMessage,
            'status' => $status,
            'raw' => substr($resp, 0, 500)
        ]);
        exit;
    }

    // Parse Google Vision API response
    $data = json_decode($resp, true);
    $fullText = '';
    $textAnnotations = $data['responses'][0]['textAnnotations'] ?? null;
    
    if (is_array($textAnnotations) && count($textAnnotations) > 0) {
        $fullText = $textAnnotations[0]['description'] ?? '';
    }

    require_once __DIR__ . '/id_type_match_helpers.php';
    $idMatch = compute_id_type_match_from_fulltext($fullText, $expectedIdType);

    echo json_encode([
        'success' => true,
        'ok' => true,
        'idTypeMatch' => $idMatch['idTypeMatch'],
        'detectedIdType' => $idMatch['detectedIdType'],
        'expectedIdType' => $expectedIdType,
        'expectedName' => $idMatch['expectedName'],
        'fullText' => $fullText,
        'confidence' => $idMatch['confidence'],
        'matchReason' => $idMatch['matchReason'] ?? ''
    ]);
} catch (Throwable $e) {
    echo json_encode(['success' => false, 'ok' => false, 'message' => $e->getMessage()]);
}

?>
