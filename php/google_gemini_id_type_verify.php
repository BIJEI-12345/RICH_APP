<?php
// Google Vision API-based ID Type verification
// Input JSON: { image_base64: "data:image/...;base64,XXXX", expected_id_type: "driver-license" }
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
    
    // Map ID types to their display names and keywords
    $idTypeMap = [
        'driver-license' => ['name' => "Driver's License", 'keywords' => ['driver', 'license', 'drivers license', 'driving license', 'lto', 'land transportation office', 'non-professional', 'professional']],
        'passport' => ['name' => 'Passport', 'keywords' => ['passport', 'republic of the philippines', 'department of foreign affairs', 'dfa', 'passport no']],
        'sss-id' => ['name' => 'SSS ID', 'keywords' => ['sss', 'social security', 'social security system', 'sss id', 'sss number']],
        'philhealth-id' => ['name' => 'PhilHealth ID', 'keywords' => ['philhealth', 'phil health', 'philhealth id', 'national health insurance', 'nhip']],
        'postal-id' => ['name' => 'Postal ID', 'keywords' => ['postal', 'postal id', 'philpost', 'philippine postal', 'postal identification']],
        'voter-id' => ['name' => "Voter's ID", 'keywords' => ['voter', 'voters', 'comelec', 'commission on elections', 'voter id', 'voter identification']],
        'senior-citizen-id' => ['name' => 'Senior Citizen ID', 'keywords' => ['senior citizen', 'senior', 'sc id', 'senior citizen id', 'oscad']],
        'pwd-id' => ['name' => 'PWD ID', 'keywords' => ['pwd', 'person with disability', 'persons with disability', 'pwd id', 'pwd card']],
        'company-id' => ['name' => 'Company ID', 'keywords' => ['company', 'employee', 'staff', 'corporate', 'company id', 'employee id', 'staff id']],
        'barangay-id' => ['name' => 'Barangay ID', 'keywords' => ['barangay', 'barangay id', 'barangay clearance', 'barangay certificate', 'barangay identification']]
    ];

    $expectedName = isset($idTypeMap[$expectedIdType]) ? $idTypeMap[$expectedIdType]['name'] : $expectedIdType;
    $expectedKeywords = isset($idTypeMap[$expectedIdType]) ? $idTypeMap[$expectedIdType]['keywords'] : [];

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

    // Detect ID type based on extracted text
    $detectedIdType = 'unknown';
    $confidence = 'low';
    $lowerText = strtolower($fullText);
    
    // Check for each ID type based on keywords
    if (preg_match('/\bpassport\b/i', $fullText) || preg_match('/\bdepartment of foreign affairs\b/i', $fullText) || preg_match('/\bdfa\b/i', $fullText)) {
        $detectedIdType = 'passport';
        $confidence = 'high';
    } elseif ((preg_match('/\bdriver\b/i', $fullText) || preg_match('/\blto\b/i', $fullText)) && preg_match('/\blicense\b/i', $fullText)) {
        $detectedIdType = 'driver-license';
        $confidence = 'high';
    } elseif (preg_match('/\bsss\b/i', $fullText) || preg_match('/\bsocial security\b/i', $fullText)) {
        $detectedIdType = 'sss-id';
        $confidence = 'high';
    } elseif (preg_match('/\bphilhealth\b/i', $fullText) || preg_match('/\bphil health\b/i', $fullText) || preg_match('/\bnational health insurance\b/i', $fullText)) {
        $detectedIdType = 'philhealth-id';
        $confidence = 'high';
    } elseif (preg_match('/\bpostal\b/i', $fullText) || preg_match('/\bphilpost\b/i', $fullText)) {
        $detectedIdType = 'postal-id';
        $confidence = 'medium';
    } elseif (preg_match('/\bvoter\b/i', $fullText) || preg_match('/\bcomelec\b/i', $fullText)) {
        $detectedIdType = 'voter-id';
        $confidence = 'high';
    } elseif (preg_match('/\bsenior citizen\b/i', $fullText) || preg_match('/\boscad\b/i', $fullText)) {
        $detectedIdType = 'senior-citizen-id';
        $confidence = 'high';
    } elseif (preg_match('/\bpwd\b/i', $fullText) || preg_match('/\bperson with disability\b/i', $fullText)) {
        $detectedIdType = 'pwd-id';
        $confidence = 'high';
    } elseif (preg_match('/\bbarangay\b/i', $fullText)) {
        $detectedIdType = 'barangay-id';
        $confidence = 'medium';
    } elseif (preg_match('/\bcompany\b/i', $fullText) || preg_match('/\bemployee\b/i', $fullText) || preg_match('/\bstaff\b/i', $fullText)) {
        $detectedIdType = 'company-id';
        $confidence = 'medium';
    }

    // Check if detected ID type matches expected ID type
    $idTypeMatch = false;
    $matchReason = '';
    
    if ($expectedIdType && !empty($fullText)) {
        // PRIORITY 1: Check for exact display name in text (case-insensitive)
        // This checks for "Driver's License", "Drivers License", "Driver License", etc.
        if (!empty($expectedName)) {
            // Create variations of the display name
            $nameVariations = [
                $expectedName, // "Driver's License"
                str_replace("'s", "s", $expectedName), // "Drivers License"
                str_replace("'s", "", $expectedName), // "Driver License"
                str_replace("'", "", $expectedName), // "Drivers License" (alternative)
            ];
            
            // Remove duplicates and empty values
            $nameVariations = array_unique(array_filter($nameVariations));
            
            foreach ($nameVariations as $variation) {
                // Check for exact phrase match with word boundaries (case-insensitive)
                $escapedVariation = preg_quote($variation, '/');
                if (preg_match('/\b' . $escapedVariation . '\b/i', $fullText)) {
                    $idTypeMatch = true;
                    $matchReason = 'display_name_match_' . str_replace([' ', "'"], ['_', ''], strtolower($variation));
                    break;
                }
                
                // Also check without word boundaries for partial matches
                if (stripos($fullText, $variation) !== false) {
                    $idTypeMatch = true;
                    $matchReason = 'display_name_partial_match_' . str_replace([' ', "'"], ['_', ''], strtolower($variation));
                    break;
                }
            }
        }
        
        // PRIORITY 2: Check for exact ID type match from detection
        if (!$idTypeMatch && $detectedIdType !== 'unknown' && $detectedIdType === $expectedIdType) {
            $idTypeMatch = true;
            $matchReason = 'exact_type_match';
        }
        
        // PRIORITY 3: Keyword matching in fullText
        if (!$idTypeMatch && !empty($expectedKeywords)) {
            foreach ($expectedKeywords as $keyword) {
                $lowerKeyword = strtolower($keyword);
                // Use word boundary for better accuracy
                $escapedKeyword = preg_quote($lowerKeyword, '/');
                if (preg_match('/\b' . $escapedKeyword . '\b/i', $fullText)) {
                    $idTypeMatch = true;
                    $matchReason = 'keyword_match_' . str_replace(' ', '_', $keyword);
                    break;
                }
                // Fallback to simple string search
                if (strpos($lowerText, $lowerKeyword) !== false) {
                    $idTypeMatch = true;
                    $matchReason = 'keyword_match_' . str_replace(' ', '_', $keyword);
                    break;
                }
            }
        }
        
        // PRIORITY 4: Special case checks for each ID type
        // For Driver's License - check for "driver" AND "license" together
        if ($expectedIdType === 'driver-license' && !$idTypeMatch) {
            $hasDriver = preg_match('/\bdriver\b/i', $fullText) || preg_match('/\blto\b/i', $fullText);
            $hasLicense = preg_match('/\blicense\b/i', $fullText);
            if ($hasDriver && $hasLicense) {
                $idTypeMatch = true;
                $matchReason = 'driver_license_words_found';
            }
        }
        
        // For Passport - require exact word "passport"
        if ($expectedIdType === 'passport' && !$idTypeMatch) {
            if (preg_match('/\bpassport\b/i', $fullText)) {
                $idTypeMatch = true;
                $matchReason = 'passport_word_found';
            }
        }
        
        // For SSS ID - check for "sss"
        if ($expectedIdType === 'sss-id' && !$idTypeMatch) {
            if (preg_match('/\bsss\b/i', $fullText)) {
                $idTypeMatch = true;
                $matchReason = 'sss_word_found';
            }
        }
        
        // For PhilHealth ID
        if ($expectedIdType === 'philhealth-id' && !$idTypeMatch) {
            if (preg_match('/\bphilhealth\b/i', $fullText) || preg_match('/\bphil health\b/i', $fullText)) {
                $idTypeMatch = true;
                $matchReason = 'philhealth_word_found';
            }
        }
        
        // For Postal ID
        if ($expectedIdType === 'postal-id' && !$idTypeMatch) {
            if (preg_match('/\bpostal\b/i', $fullText) || preg_match('/\bphilpost\b/i', $fullText)) {
                $idTypeMatch = true;
                $matchReason = 'postal_word_found';
            }
        }
        
        // For Voter's ID
        if ($expectedIdType === 'voter-id' && !$idTypeMatch) {
            if (preg_match('/\bvoter\b/i', $fullText) || preg_match('/\bcomelec\b/i', $fullText)) {
                $idTypeMatch = true;
                $matchReason = 'voter_word_found';
            }
        }
        
        // For Senior Citizen ID
        if ($expectedIdType === 'senior-citizen-id' && !$idTypeMatch) {
            if (preg_match('/\bsenior citizen\b/i', $fullText) || preg_match('/\boscad\b/i', $fullText)) {
                $idTypeMatch = true;
                $matchReason = 'senior_citizen_word_found';
            }
        }
        
        // For PWD ID
        if ($expectedIdType === 'pwd-id' && !$idTypeMatch) {
            if (preg_match('/\bpwd\b/i', $fullText) || preg_match('/\bperson with disability\b/i', $fullText)) {
                $idTypeMatch = true;
                $matchReason = 'pwd_word_found';
            }
        }
        
        // For Barangay ID
        if ($expectedIdType === 'barangay-id' && !$idTypeMatch) {
            if (preg_match('/\bbarangay\b/i', $fullText)) {
                $idTypeMatch = true;
                $matchReason = 'barangay_word_found';
            }
        }
    }

    echo json_encode([
        'success' => true,
        'ok' => true,
        'idTypeMatch' => $idTypeMatch,
        'detectedIdType' => $detectedIdType,
        'expectedIdType' => $expectedIdType,
        'expectedName' => $expectedName,
        'fullText' => $fullText,
        'confidence' => $confidence,
        'matchReason' => $matchReason ?? ''
    ]);
} catch (Throwable $e) {
    echo json_encode(['success' => false, 'ok' => false, 'message' => $e->getMessage()]);
}

?>
