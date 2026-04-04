<?php
// Google Vision API — one OCR pass; logic order: ID type match (if expected_id_type), then Barangay Bigte
// Input JSON: { image_base64: "...", expected_id_type?: "National ID" | "Driver's License" | ... (HTML value) }
// Output JSON: hasMatch (Bigte), fullText, names; if expected_id_type: idTypeMatch, detectedIdType, ...

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

require_once __DIR__ . '/env_loader.php';

try {
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true);
    if (!$payload || empty($payload['image_base64'])) {
        echo json_encode(['success' => false, 'ok' => false, 'message' => 'image_base64 is required']);
        exit;
    }

    $VISION_URL = getGoogleVisionApiUrl();
    if (!$VISION_URL) {
        echo json_encode(['success' => false, 'ok' => false, 'message' => 'API configuration error: GOOGLE_VISION_API_KEY is not set in .env file']);
        exit;
    }

    $expectedIdTypeRequest = isset($payload['expected_id_type']) ? trim((string) $payload['expected_id_type']) : '';

    $imageBase64 = $payload['image_base64'];
    if (strpos($imageBase64, ',') !== false) {
        $imageBase64 = explode(',', $imageBase64, 2)[1];
    }

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
        echo json_encode(['success' => false, 'ok' => false, 'message' => 'Vision API request failed: ' . $err]);
        exit;
    }
    
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
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
        
        echo json_encode([
            'success' => false, 
            'ok' => false, 
            'message' => $detailedMessage,
            'status' => 403,
            'error_type' => 'permission_denied',
            'raw_error' => isset($errorData['error']) ? $errorData['error'] : null
        ]);
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
            $errorMessage .= ': ' . $errorData['error']['message'];
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

    require_once __DIR__ . '/bigte_ocr_helpers.php';

    $address = '';
    $firstName = '';
    $middleName = '';
    $lastName = '';

    // 1) ID type vs selected type (same fullText) — before Bigte check
    $idMatch = null;
    if ($expectedIdTypeRequest !== '') {
        require_once __DIR__ . '/id_type_match_helpers.php';
        $idMatch = compute_id_type_match_from_fulltext($fullText, $expectedIdTypeRequest);
    }

    // 2) Barangay Bigte in OCR text
    $hasBigte = bigte_present_in_ocr_text($fullText);

    // Extract address line (Bigte / address patterns)
    $lines = explode("\n", $fullText);
    foreach ($lines as $line) {
        $line = trim($line);
        if (bigte_present_in_ocr_text($line) ||
            stripos($line, 'address') !== false ||
            preg_match('/\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Barangay|Brgy)/i', $line)) {
            $address = $line;
            break;
        }
    }

    $namePatterns = [
        '/\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/',
        '/\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/',
    ];

    foreach ($namePatterns as $pattern) {
        if (preg_match($pattern, $fullText, $matches)) {
            if (count($matches) >= 4) {
                $firstName = $matches[1];
                $middleName = $matches[2];
                $lastName = $matches[3];
            } elseif (count($matches) >= 3) {
                $firstName = $matches[1];
                $lastName = $matches[2];
            }
            break;
        }
    }

    $response = [
        'success' => true,
        'ok' => true,
        'hasMatch' => $hasBigte,
        'addressText' => $address,
        'fullText' => $fullText,
        'firstName' => $firstName,
        'middleName' => $middleName,
        'lastName' => $lastName
    ];

    if ($idMatch !== null) {
        $response['idTypeMatch'] = $idMatch['idTypeMatch'];
        $response['detectedIdType'] = $idMatch['detectedIdType'];
        $response['expectedIdType'] = $expectedIdTypeRequest;
        $response['expectedName'] = $idMatch['expectedName'];
        $response['idTypeConfidence'] = $idMatch['confidence'];
        $response['matchReason'] = $idMatch['matchReason'];
    }

    echo json_encode($response);
} catch (Throwable $e) {
    echo json_encode(['success' => false, 'ok' => false, 'message' => $e->getMessage()]);
}

?>
