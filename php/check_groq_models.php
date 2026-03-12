<?php
// Script to check available Groq models
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

// Load environment variables
require_once __DIR__ . '/env_loader.php';

// Get Groq API Key and URL
$API_KEY = getGroqApiKey();
if (!$API_KEY) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'API configuration error: GROQ_API_KEY is not set in .env file']);
    exit;
}
$MODELS_URL = getGroqApiUrl();

$ch = curl_init($MODELS_URL);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Authorization: Bearer ' . $API_KEY
]);

$response = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($status === 200) {
    $data = json_decode($response, true);
    
    // Filter vision models (llava models)
    $visionModels = [];
    if (isset($data['data'])) {
        foreach ($data['data'] as $model) {
            if (isset($model['id']) && stripos($model['id'], 'llava') !== false) {
                $visionModels[] = [
                    'id' => $model['id'],
                    'object' => $model['object'] ?? 'unknown',
                    'created' => $model['created'] ?? null,
                    'owned_by' => $model['owned_by'] ?? 'unknown'
                ];
            }
        }
    }
    
    echo json_encode([
        'success' => true,
        'status' => $status,
        'total_models' => count($data['data'] ?? []),
        'vision_models' => $visionModels,
        'all_models' => $data['data'] ?? []
    ], JSON_PRETTY_PRINT);
} else {
    echo json_encode([
        'success' => false,
        'status' => $status,
        'error' => $response,
        'message' => 'Failed to fetch models'
    ], JSON_PRETTY_PRINT);
}
?>
