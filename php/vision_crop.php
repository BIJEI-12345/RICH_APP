<?php
// Auto-crop endpoint using Google Cloud Vision CROP_HINTS
// Fallback to PHP GD Extension for smart cropping if Vision API fails
// Accepts JSON: { image_base64: "data:image/...;base64,xxxx" }
// Returns JSON: { success: bool, cropped_image_base64?: string, method?: string, message?: string }

// Start output buffering to prevent any accidental output
ob_start();

// Set error handling
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

// Set headers
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    ob_end_clean();
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    ob_end_clean();
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

// Load environment variables with error handling
try {
    require_once __DIR__ . '/env_loader.php';
} catch (Throwable $e) {
    ob_end_clean();
    error_log("Error loading env_loader.php: " . $e->getMessage());
    // Try to continue even if env_loader fails
}

// Enable error reporting for debugging (disable in production)
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

// Check if GD extension is available
$gdAvailable = function_exists('imagecreatefromstring') && 
               function_exists('imagecrop') && 
               function_exists('imagejpeg') &&
               function_exists('imagesx') &&
               function_exists('imagesy');

try {
    // If GD is not available, return original image (graceful degradation)
    if (!$gdAvailable) {
        ob_end_clean();
        $raw = file_get_contents('php://input');
        $payload = json_decode($raw, true);
        if ($payload && !empty($payload['image_base64'])) {
            $imageBase64 = $payload['image_base64'];
            if (strpos($imageBase64, ',') !== false) {
                $imageBase64 = explode(',', $imageBase64, 2)[1];
            }
            echo json_encode([
                'success' => true,
                'cropped_image_base64' => 'data:image/jpeg;base64,' . $imageBase64,
                'method' => 'original',
                'message' => 'GD extension not available, returning original image'
            ]);
            exit;
        } else {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'image_base64 is required']);
            exit;
        }
    }

    $raw = file_get_contents('php://input');
    if ($raw === false) {
        ob_end_clean();
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Failed to read request data']);
        exit;
    }

    $payload = json_decode($raw, true);
    if (!$payload || empty($payload['image_base64'])) {
        ob_end_clean();
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'image_base64 is required']);
        exit;
    }

    $imageBase64 = $payload['image_base64'];
    // Remove data URL prefix if present
    if (strpos($imageBase64, ',') !== false) {
        $imageBase64 = explode(',', $imageBase64, 2)[1];
    }

    // Decode image first (needed for both methods)
    $imageData = base64_decode($imageBase64, true);
    if ($imageData === false) {
        ob_end_clean();
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Failed to decode base64 image']);
        exit;
    }

    $sourceImage = @imagecreatefromstring($imageData);
    if (!$sourceImage) {
        // If we can't create image, return original base64
        ob_end_clean();
        echo json_encode([
            'success' => true,
            'cropped_image_base64' => 'data:image/jpeg;base64,' . $imageBase64,
            'method' => 'original',
            'message' => 'Failed to process image, returning original'
        ]);
        exit;
    }

    $imgWidth = @imagesx($sourceImage);
    $imgHeight = @imagesy($sourceImage);
    
    if ($imgWidth === false || $imgHeight === false || $imgWidth <= 0 || $imgHeight <= 0) {
        @imagedestroy($sourceImage);
        ob_end_clean();
        echo json_encode([
            'success' => true,
            'cropped_image_base64' => 'data:image/jpeg;base64,' . $imageBase64,
            'method' => 'original',
            'message' => 'Invalid image dimensions, returning original'
        ]);
        exit;
    }

    // Try Cloud Vision API first
    $croppedImage = null;
    $cropMethod = 'none';
    $cropInfo = null;

    $VISION_URL = getGoogleVisionApiUrl();
    if ($VISION_URL) {
        try {
            // Call Cloud Vision API with CROP_HINTS feature
            $requestBody = [
                'requests' => [[
                    'image' => ['content' => $imageBase64],
                    'features' => [[
                        'type' => 'CROP_HINTS',
                        'maxResults' => 1
                    ]],
                    'imageContext' => [
                        'cropHintsParams' => [
                            'aspectRatios' => [1.5, 1.6, 1.7] // Common ID aspect ratios
                        ]
                    ]
                ]]
            ];

            $ch = curl_init($VISION_URL);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($requestBody));
            curl_setopt($ch, CURLOPT_TIMEOUT, 10); // 10 second timeout for Vision API

            $response = curl_exec($ch);
            $curlError = curl_error($ch);
            $statusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            // If Vision API succeeds, use it
            if ($response !== false && empty($curlError) && $statusCode >= 200 && $statusCode < 300) {
                $data = json_decode($response, true);
                
                if (isset($data['responses'][0]['cropHintsAnnotation']['cropHints'][0])) {
                    $cropHints = $data['responses'][0]['cropHintsAnnotation']['cropHints'][0];
                    
                    if (isset($cropHints['boundingPoly']['vertices'])) {
                        $vertices = $cropHints['boundingPoly']['vertices'];
                        
                        // Calculate crop coordinates
                        $minX = $imgWidth;
                        $minY = $imgHeight;
                        $maxX = 0;
                        $maxY = 0;

                        foreach ($vertices as $vertex) {
                            $x = isset($vertex['x']) ? (int)$vertex['x'] : 0;
                            $y = isset($vertex['y']) ? (int)$vertex['y'] : 0;
                            
                            // Handle normalized coordinates (0-1 range)
                            if ($x <= 1 && $y <= 1 && $x >= 0 && $y >= 0) {
                                $x = (int)($x * $imgWidth);
                                $y = (int)($y * $imgHeight);
                            }
                            
                            $x = max(0, min($imgWidth, $x));
                            $y = max(0, min($imgHeight, $y));
                            
                            $minX = min($minX, $x);
                            $minY = min($minY, $y);
                            $maxX = max($maxX, $x);
                            $maxY = max($maxY, $y);
                        }

                        // Validate and apply crop
                        if ($minX < $maxX && $minY < $maxY && $minX >= 0 && $minY >= 0) {
                            $paddingX = (int)(($maxX - $minX) * 0.05);
                            $paddingY = (int)(($maxY - $minY) * 0.05);
                            
                            $cropX = max(0, $minX - $paddingX);
                            $cropY = max(0, $minY - $paddingY);
                            $cropWidth = min($imgWidth - $cropX, $maxX - $minX + ($paddingX * 2));
                            $cropHeight = min($imgHeight - $cropY, $maxY - $minY + ($paddingY * 2));

                            if ($cropWidth > 0 && $cropHeight > 0 && 
                                $cropX + $cropWidth <= $imgWidth && 
                                $cropY + $cropHeight <= $imgHeight) {
                                
                                $croppedImage = @imagecrop($sourceImage, [
                                    'x' => $cropX,
                                    'y' => $cropY,
                                    'width' => $cropWidth,
                                    'height' => $cropHeight
                                ]);
                                
                                if ($croppedImage) {
                                    $cropMethod = 'cloud_vision';
                                    $cropInfo = [
                                        'x' => $cropX,
                                        'y' => $cropY,
                                        'width' => $cropWidth,
                                        'height' => $cropHeight
                                    ];
                                }
                            }
                        }
                    }
                }
            }
        } catch (Exception $visionError) {
            error_log("Vision API error (will use GD fallback): " . $visionError->getMessage());
        }
    }

    // Fallback to PHP GD smart cropping if Vision API failed or not available
    if (!$croppedImage) {
        $croppedImage = smartCropWithGD($sourceImage, $imgWidth, $imgHeight);
        if ($croppedImage) {
            $cropMethod = 'php_gd';
        }
    }

    // If both methods failed, use original image
    if (!$croppedImage) {
        $croppedImage = $sourceImage;
        $cropMethod = 'original';
    } else {
        // Destroy original if we created a cropped version
        imagedestroy($sourceImage);
    }

    // Convert to base64
    ob_start();
    $jpegSuccess = @imagejpeg($croppedImage, null, 90);
    $croppedImageData = ob_get_clean();
    imagedestroy($croppedImage);

    if (!$jpegSuccess || empty($croppedImageData)) {
        // If encoding fails, return original image
        ob_end_clean();
        echo json_encode([
            'success' => true,
            'cropped_image_base64' => 'data:image/jpeg;base64,' . $imageBase64,
            'method' => 'original',
            'message' => 'Failed to encode cropped image, returning original'
        ]);
        exit;
    }

    $croppedBase64 = base64_encode($croppedImageData);

    // Clean output buffer before sending response
    ob_end_clean();
    
    echo json_encode([
        'success' => true,
        'cropped_image_base64' => 'data:image/jpeg;base64,' . $croppedBase64,
        'method' => $cropMethod,
        'crop_info' => $cropInfo
    ]);

} catch (Throwable $e) {
    error_log("Error in vision_crop.php: " . $e->getMessage());
    error_log("Stack trace: " . $e->getTraceAsString());
    
    // Try to return original image even on error (graceful degradation)
    ob_end_clean();
    try {
        $raw = @file_get_contents('php://input');
        if ($raw !== false) {
            $payload = @json_decode($raw, true);
            if ($payload && !empty($payload['image_base64'])) {
                $imageBase64 = $payload['image_base64'];
                if (strpos($imageBase64, ',') !== false) {
                    $imageBase64 = explode(',', $imageBase64, 2)[1];
                }
                echo json_encode([
                    'success' => true,
                    'cropped_image_base64' => 'data:image/jpeg;base64,' . $imageBase64,
                    'method' => 'original',
                    'message' => 'Error occurred, returning original image',
                    'error_detail' => $e->getMessage()
                ]);
                exit;
            }
        }
    } catch (Exception $fallbackError) {
        error_log("Fallback error: " . $fallbackError->getMessage());
    }
    
    // If we can't return original image, return error but still try to be graceful
    // Return success with error message so JavaScript can handle it
    echo json_encode([
        'success' => false,
        'message' => 'Server error: ' . $e->getMessage(),
        'error_type' => 'server_error'
    ]);
}

/**
 * Smart cropping using PHP GD Extension
 * Removes white/empty borders and focuses on content
 */
function smartCropWithGD($image, $width, $height) {
    if (!$image || $width <= 0 || $height <= 0) {
        return null;
    }

    // Method 1: Auto-crop by detecting non-white borders
    $cropBox = detectContentBounds($image, $width, $height);
    
    if ($cropBox && 
        $cropBox['x'] >= 0 && $cropBox['y'] >= 0 &&
        $cropBox['width'] > 0 && $cropBox['height'] > 0 &&
        $cropBox['x'] + $cropBox['width'] <= $width &&
        $cropBox['y'] + $cropBox['height'] <= $height) {
        
        // Add small padding (2%)
        $paddingX = (int)($cropBox['width'] * 0.02);
        $paddingY = (int)($cropBox['height'] * 0.02);
        
        $cropX = max(0, $cropBox['x'] - $paddingX);
        $cropY = max(0, $cropBox['y'] - $paddingY);
        $cropWidth = min($width - $cropX, $cropBox['width'] + ($paddingX * 2));
        $cropHeight = min($height - $cropY, $cropBox['height'] + ($paddingY * 2));

        $cropped = @imagecrop($image, [
            'x' => $cropX,
            'y' => $cropY,
            'width' => $cropWidth,
            'height' => $cropHeight
        ]);

        if ($cropped) {
            return $cropped;
        }
    }

    // Method 2: Center crop with ID aspect ratio (1.6:1)
    $targetAspectRatio = 1.6;
    $currentAspectRatio = $width / $height;

    if (abs($currentAspectRatio - $targetAspectRatio) > 0.1) {
        // Need to crop to match aspect ratio
        if ($currentAspectRatio > $targetAspectRatio) {
            // Image is wider, crop width
            $newWidth = (int)($height * $targetAspectRatio);
            $cropX = (int)(($width - $newWidth) / 2);
            $cropY = 0;
            $cropWidth = $newWidth;
            $cropHeight = $height;
        } else {
            // Image is taller, crop height
            $newHeight = (int)($width / $targetAspectRatio);
            $cropX = 0;
            $cropY = (int)(($height - $newHeight) / 2);
            $cropWidth = $width;
            $cropHeight = $newHeight;
        }

        $cropped = @imagecrop($image, [
            'x' => $cropX,
            'y' => $cropY,
            'width' => $cropWidth,
            'height' => $cropHeight
        ]);

        if ($cropped) {
            return $cropped;
        }
    }

    // Method 3: Remove small borders (5% from each side)
    $borderPercent = 0.05;
    $cropX = (int)($width * $borderPercent);
    $cropY = (int)($height * $borderPercent);
    $cropWidth = $width - ($cropX * 2);
    $cropHeight = $height - ($cropY * 2);

    if ($cropWidth > 0 && $cropHeight > 0) {
        $cropped = @imagecrop($image, [
            'x' => $cropX,
            'y' => $cropY,
            'width' => $cropWidth,
            'height' => $cropHeight
        ]);

        if ($cropped) {
            return $cropped;
        }
    }

    return null;
}

/**
 * Detect content bounds by finding non-white/empty areas
 * This helps remove white borders around ID images
 */
function detectContentBounds($image, $width, $height) {
    $threshold = 240; // RGB threshold for "white" (0-255)
    $sampleStep = max(1, (int)(min($width, $height) / 50)); // Sample every N pixels
    
    $minX = $width;
    $minY = $height;
    $maxX = 0;
    $maxY = 0;
    $foundContent = false;

    // Sample pixels to find content boundaries
    for ($y = 0; $y < $height; $y += $sampleStep) {
        for ($x = 0; $x < $width; $x += $sampleStep) {
            $rgb = @imagecolorat($image, $x, $y);
            if ($rgb === false) continue;
            
            $r = ($rgb >> 16) & 0xFF;
            $g = ($rgb >> 8) & 0xFF;
            $b = $rgb & 0xFF;
            
            // Check if pixel is not white/light
            if ($r < $threshold || $g < $threshold || $b < $threshold) {
                $foundContent = true;
                $minX = min($minX, $x);
                $minY = min($minY, $y);
                $maxX = max($maxX, $x);
                $maxY = max($maxY, $y);
            }
        }
    }

    // Also check edges more thoroughly
    // Top edge
    for ($x = 0; $x < $width; $x += $sampleStep) {
        for ($y = 0; $y < min(50, $height); $y++) {
            $rgb = @imagecolorat($image, $x, $y);
            if ($rgb === false) continue;
            $r = ($rgb >> 16) & 0xFF;
            $g = ($rgb >> 8) & 0xFF;
            $b = $rgb & 0xFF;
            if ($r < $threshold || $g < $threshold || $b < $threshold) {
                $foundContent = true;
                $minY = min($minY, $y);
            }
        }
    }

    // Bottom edge
    for ($x = 0; $x < $width; $x += $sampleStep) {
        for ($y = max(0, $height - 50); $y < $height; $y++) {
            $rgb = @imagecolorat($image, $x, $y);
            if ($rgb === false) continue;
            $r = ($rgb >> 16) & 0xFF;
            $g = ($rgb >> 8) & 0xFF;
            $b = $rgb & 0xFF;
            if ($r < $threshold || $g < $threshold || $b < $threshold) {
                $foundContent = true;
                $maxY = max($maxY, $y);
            }
        }
    }

    // Left edge
    for ($y = 0; $y < $height; $y += $sampleStep) {
        for ($x = 0; $x < min(50, $width); $x++) {
            $rgb = @imagecolorat($image, $x, $y);
            if ($rgb === false) continue;
            $r = ($rgb >> 16) & 0xFF;
            $g = ($rgb >> 8) & 0xFF;
            $b = $rgb & 0xFF;
            if ($r < $threshold || $g < $threshold || $b < $threshold) {
                $foundContent = true;
                $minX = min($minX, $x);
            }
        }
    }

    // Right edge
    for ($y = 0; $y < $height; $y += $sampleStep) {
        for ($x = max(0, $width - 50); $x < $width; $x++) {
            $rgb = @imagecolorat($image, $x, $y);
            if ($rgb === false) continue;
            $r = ($rgb >> 16) & 0xFF;
            $g = ($rgb >> 8) & 0xFF;
            $b = $rgb & 0xFF;
            if ($r < $threshold || $g < $threshold || $b < $threshold) {
                $foundContent = true;
                $maxX = max($maxX, $x);
            }
        }
    }

    if (!$foundContent || $minX >= $maxX || $minY >= $maxY) {
        return null;
    }

    return [
        'x' => $minX,
        'y' => $minY,
        'width' => $maxX - $minX,
        'height' => $maxY - $minY
    ];
}
?>
