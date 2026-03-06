<?php
// Emergency Hotline Recommendation using Google Gemini API
// Input JSON: { emergency_type: "fire", description: "..." }
// Output JSON: { success: bool, hotlines: [{ name, number, description }] }

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

// Load environment variables
require_once __DIR__ . '/env_loader.php';

// Get Google Gemini API URL (returns null if API key is not set)
// Note: If API key is not set, the code will use fallback rule-based matching (see getRecommendedHotlineByType function)
$GEMINI_URL = getGoogleGeminiApiUrl();

// Specific Emergency Hotlines - Only these 4 hotlines
$hotlines = [
    ['name' => 'Bureau of Fire Protection (BFP)', 'number' => '0917-159-5831', 'description' => 'Fire emergencies, gas leaks, and fire-related incidents'],
    ['name' => 'Philippine National Police (PNP)', 'number' => '0998-598-5388', 'description' => 'Crime, violence, serious criminal activities'],
    ['name' => 'MDRRMO Norz. (NDRRMC)', 'number' => '0905-247-0355', 'description' => 'Rescue operations, disasters, floods, earthquakes, and major calamities'],
    ['name' => 'Barangay Bigte', 'number' => '0997-732-2787', 'description' => 'Minor violence, disturbances, quarrels, theft, and barangay-level concerns'],
];

try {
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true);
    
    if (!$payload || empty($payload['emergency_type'])) {
        echo json_encode(['success' => false, 'message' => 'emergency_type is required']);
        exit;
    }

    $emergencyType = $payload['emergency_type'] ?? '';
    $description = $payload['description'] ?? '';

    // Use Gemini API to analyze and recommend the most appropriate hotline
    $prompt = "You are an emergency response assistant. Based on the emergency type and description, determine which ONE hotline is most appropriate.\n\n";
    $prompt .= "Emergency Type: \"$emergencyType\"\n";
    if (!empty($description)) {
        $prompt .= "Description: \"$description\"\n";
    }
    $prompt .= "\nAvailable Hotlines:\n";
    $prompt .= "1. BFP (0917-159-5831) - For: Fire emergencies, gas leaks, fire-related incidents\n";
    $prompt .= "2. PNP (0998-598-5388) - For: Crime, violence, serious criminal activities\n";
    $prompt .= "3. NDRRMC (0905-247-0355) - For: Rescue operations, disasters, floods, earthquakes, major calamities\n";
    $prompt .= "4. Barangay Bigte (0997-732-2787) - For: Traffic accidents, minor violence, disturbances, quarrels, theft, barangay-level concerns\n\n";
    $prompt .= "Rules:\n";
    $prompt .= "- Fires, gas leaks → BFP\n";
    $prompt .= "- Serious crimes, violence, robbery → PNP\n";
    $prompt .= "- Disasters, rescue, floods, earthquakes → NDRRMC\n";
    $prompt .= "- Traffic accidents, minor issues, disturbances, quarrels, petty theft → Barangay Bigte\n\n";
    $prompt .= "Respond with ONLY the number (1, 2, 3, or 4) of the most appropriate hotline. No explanation, just the number.";

    if (empty($API_KEY)) {
        // Fallback: Use rule-based matching if no API key
        $recommendedIndex = getRecommendedHotlineByType($emergencyType, $description);
    } else {
        // Call Gemini API
        $requestBody = [
            'contents' => [[
                'parts' => [[
                    'text' => $prompt
                ]]
            ]]
        ];

        $ch = curl_init($GEMINI_URL);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($requestBody));
        
        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($status === 200 && $response) {
            $data = json_decode($response, true);
            $geminiText = trim($data['candidates'][0]['content']['parts'][0]['text'] ?? '');
            
            // Extract number from response (should be 1, 2, 3, or 4)
            preg_match('/\b([1-4])\b/', $geminiText, $matches);
            if (!empty($matches[1])) {
                $recommendedIndex = (int)$matches[1] - 1; // Convert to 0-based index
            } else {
                // Fallback if API response is unclear
                $recommendedIndex = getRecommendedHotlineByType($emergencyType, $description);
            }
        } else {
            // Fallback to rule-based
            $recommendedIndex = getRecommendedHotlineByType($emergencyType, $description);
        }
    }

    // Get recommended hotline (only one)
    $recommendedHotline = $hotlines[$recommendedIndex] ?? $hotlines[0]; // Default to BFP if invalid

    echo json_encode([
        'success' => true,
        'hotlines' => [$recommendedHotline] // Return array with single hotline
    ]);

} catch (Throwable $e) {
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}

// Fallback function for rule-based matching
function getRecommendedHotlineByType($emergencyType, $description = '') {
    $type = strtolower($emergencyType);
    $desc = strtolower($description);
    $combined = $type . ' ' . $desc;
    
    // Index mapping: 0=BFP, 1=PNP, 2=NDRRMC, 3=Barangay Bigte
    
    // Fire-related emergencies → BFP (index 0)
    if (strpos($combined, 'fire') !== false || 
        strpos($combined, 'gas leak') !== false || 
        strpos($combined, 'gas-leak') !== false ||
        strpos($combined, 'burning') !== false ||
        strpos($combined, 'smoke') !== false) {
        return 0; // BFP
    }
    
    // Disasters and rescue → NDRRMC (index 2)
    if (strpos($combined, 'flood') !== false || 
        strpos($combined, 'earthquake') !== false || 
        strpos($combined, 'disaster') !== false ||
        strpos($combined, 'rescue') !== false ||
        strpos($combined, 'calamity') !== false ||
        strpos($combined, 'typhoon') !== false ||
        strpos($combined, 'landslide') !== false) {
        return 2; // NDRRMC
    }
    
    // Serious crimes and violence → PNP (index 1)
    if (strpos($combined, 'robbery') !== false || 
        strpos($combined, 'crime') !== false || 
        strpos($combined, 'violence') !== false ||
        strpos($combined, 'assault') !== false ||
        strpos($combined, 'murder') !== false ||
        strpos($combined, 'homicide') !== false ||
        strpos($combined, 'kidnap') !== false ||
        strpos($combined, 'serious') !== false) {
        return 1; // PNP
    }
    
    // Minor issues, disturbances, quarrels, petty theft → Barangay Bigte (index 3)
    if (strpos($combined, 'theft') !== false || 
        strpos($combined, 'quarrel') !== false || 
        strpos($combined, 'disturbance') !== false ||
        strpos($combined, 'away') !== false ||
        strpos($combined, 'kaguluhan') !== false ||
        strpos($combined, 'minor') !== false ||
        strpos($combined, 'petty') !== false ||
        strpos($combined, 'barangay') !== false) {
        return 3; // Barangay Bigte
    }
    
    // Traffic accidents → Barangay Bigte (index 3)
    if (strpos($combined, 'accident') !== false || strpos($combined, 'traffic') !== false) {
        return 3; // Barangay Bigte
    }
    
    // Medical emergencies → NDRRMC (for rescue operations)
    if (strpos($combined, 'medical') !== false || strpos($combined, 'health') !== false) {
        return 2; // NDRRMC
    }
    
    // Power outage → Barangay Bigte (minor issue)
    if (strpos($combined, 'power') !== false || strpos($combined, 'outage') !== false) {
        return 3; // Barangay Bigte
    }
    
    // Default: Barangay Bigte for unspecified minor issues
    return 3; // Barangay Bigte
}

?>
