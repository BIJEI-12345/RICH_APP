<?php
// Announcements API - Fetch announcements from database or serve images

// Check if this is an image request FIRST - before setting any headers
if (isset($_GET['image_id'])) {
    // Disable error display immediately to prevent corrupting image output
    ini_set('display_errors', 0);
    ini_set('log_errors', 1);
    error_reporting(0);
    
    // Clear any output buffers first
    while (ob_get_level()) {
        ob_end_clean();
    }
    
    // Start output buffering to catch any accidental output
    ob_start();
    
    // Validate and sanitize image_id
    $imageId = filter_var($_GET['image_id'], FILTER_VALIDATE_INT);
    if ($imageId === false || $imageId <= 0) {
        ob_end_clean();
        error_log("Invalid image_id parameter: " . ($_GET['image_id'] ?? 'not set'));
        http_response_code(400);
        header('Content-Type: text/plain');
        echo "Invalid image ID";
        exit;
    }
    // Clear any buffered output before serving image
    ob_end_clean();
    // Serve image directly
    error_log("Image request received for ID: {$imageId}");
    serveAnnouncementImage($imageId);
    exit;
}

// Only set JSON headers if not serving an image
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');
header('Access-Control-Allow-Headers: Content-Type');

// Default to JSON for announcements data
header('Content-Type: application/json');

// Only allow GET requests
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

// Database connection function
function getDBConnection() {
    $host = "rich.cmxcoo6yc8nh.us-east-1.rds.amazonaws.com"; 
    $user = "admin";
    $pass = "4mazonb33j4y!";
    $db   = "rich_db";   
      
     // $host = "rich.c4lc2owy0af4.us-east-1.rds.amazonaws.com";
     // $username = "admin";
     // $password = "4mazonb33j4y!"; 
     // $dbname = "rich_db"; 
       
    
    try {
        $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        // Ensure binary data (LONGBLOB) is returned correctly - don't stringify
        $pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);
        $pdo->setAttribute(PDO::ATTR_STRINGIFY_FETCHES, false);
        return $pdo;
    } catch (PDOException $e) {
        error_log("Database connection failed: " . $e->getMessage());
        return null;
    }
}

// Function to serve default image when announcement image is missing
function serveDefaultImage() {
    // Clear any output buffers first
    while (ob_get_level()) {
        ob_end_clean();
    }
    
    // Clear any existing headers that might interfere (except Cache-Control which is fine)
    // We'll reset Content-Type to image/jpeg
    
    $defaultImagePath = __DIR__ . '/../Images/brgyHall.jpg';
    if (file_exists($defaultImagePath)) {
        // Set proper headers for image
        header('Content-Type: image/jpeg', true); // true to replace existing
        header('Content-Length: ' . filesize($defaultImagePath), true);
        header('Accept-Ranges: bytes', true);
        
        // Clear any remaining output buffers
        while (ob_get_level()) {
            ob_end_clean();
        }
        
        readfile($defaultImagePath);
        exit;
    } else {
        // If default image doesn't exist, return 404
        // Clear buffers first
        while (ob_get_level()) {
            ob_end_clean();
        }
        http_response_code(404);
        header('Content-Type: text/plain', true);
        echo "Default image not found";
        exit;
    }
}

// Function to serve announcement image
function serveAnnouncementImage($imageId) {
    // Disable error display to prevent corrupting image output
    ini_set('display_errors', 0);
    ini_set('log_errors', 1);
    error_reporting(0);
    
    // Clear any output buffers first - CRITICAL for binary data
    while (ob_get_level()) {
        ob_end_clean();
    }
    
    // Remove any existing headers that might interfere
    if (headers_sent()) {
        error_log("WARNING: Headers already sent before serving image for ID {$imageId}. Location: " . (function_exists('headers_list') && headers_list() ? implode(', ', headers_list()) : 'none'));
        // If headers already sent, we can't serve image properly
        http_response_code(500);
        header('Content-Type: text/plain');
        echo "Headers already sent";
        exit;
    }
    
    // Add cache control headers to prevent caching of wrong images
    header('Cache-Control: no-cache, no-store, must-revalidate');
    header('Pragma: no-cache');
    header('Expires: 0');
    
    $pdo = getDBConnection();
    if (!$pdo) {
        error_log("Database connection failed for image ID {$imageId}, serving default image");
        serveDefaultImage();
    }
    
    try {
        // CRITICAL: Fetch ONLY from the 'image' column in the announcements table
        // First verify the announcement exists and log its title for debugging
        $verifyStmt = $pdo->prepare("SELECT `id`, `title` FROM `announcements` WHERE `id` = ?");
        $verifyStmt->execute([$imageId]);
        $announcementInfo = $verifyStmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$announcementInfo) {
            error_log("ERROR: Announcement ID {$imageId} does not exist in database, serving default image");
            serveDefaultImage();
        }
        
        error_log("Fetching image for Announcement ID: {$imageId}, Title: '{$announcementInfo['title']}'");
        
        // First check if image column has data (not NULL and not empty)
        $checkStmt = $pdo->prepare("SELECT LENGTH(`image`) as img_length FROM `announcements` WHERE `id` = ?");
        $checkStmt->execute([$imageId]);
        $imgLength = $checkStmt->fetchColumn(0);
        
        if ($imgLength === false || $imgLength === null || $imgLength == 0) {
            error_log("Image column is NULL or empty for Announcement ID: {$imageId}, serving default image");
            serveDefaultImage();
        }
        
        error_log("Image column has data: {$imgLength} bytes for ID {$imageId}");
        
        // CRITICAL: Ensure PDO settings are correct for LONGBLOB
        $pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);
        $pdo->setAttribute(PDO::ATTR_STRINGIFY_FETCHES, false);
        
        // IMPORTANT: Use fetchColumn first (more reliable for LONGBLOB)
        // Create a fresh prepared statement to avoid any caching issues
        $stmt = $pdo->prepare("SELECT `image` FROM `announcements` WHERE `id` = ?");
        $stmt->execute([$imageId]);
        
        // Try fetchColumn first (most reliable for LONGBLOB)
        $imageData = $stmt->fetchColumn(0);
        
        // If fetchColumn returns false/null, try bindColumn as fallback
        if ($imageData === false || $imageData === null) {
            error_log("fetchColumn returned false/null for ID {$imageId}, trying bindColumn...");
            // Create a fresh statement
            $stmt2 = $pdo->prepare("SELECT `image` FROM `announcements` WHERE `id` = ?");
            $stmt2->execute([$imageId]);
            $stmt2->bindColumn(1, $imageData, PDO::PARAM_LOB);
            $result = $stmt2->fetch(PDO::FETCH_BOUND);
            
            if ($result === false || $imageData === null) {
                error_log("bindColumn also failed for ID {$imageId} - Image column is likely NULL or empty, serving default image");
                serveDefaultImage();
            }
        }
        
        // Check if we got data
        if ($imageData === false || $imageData === null) {
            error_log("Announcement ID {$imageId} not found or has NULL image column, serving default image");
            serveDefaultImage();
        }
        
        // Handle resource (stream) - convert to string
        if (is_resource($imageData)) {
            error_log("Image data is a stream resource for ID {$imageId}, converting to string...");
            $imageData = stream_get_contents($imageData);
            if ($imageData === false || strlen($imageData) === 0) {
                error_log("Failed to read image data from stream for ID {$imageId}, serving default image");
                serveDefaultImage();
            }
        }
        
        // Verify we have string data at this point
        if (!is_string($imageData)) {
            error_log("ERROR: Image data is not a string after processing for ID {$imageId}. Type: " . gettype($imageData) . ", serving default image");
            serveDefaultImage();
        }
        
        $imageDataLength = strlen($imageData);
        
        // Check if data is empty
        if ($imageDataLength === 0) {
            error_log("ERROR: Image data length is 0 for ID {$imageId} - Image column exists but is empty, serving default image");
            serveDefaultImage();
        }
        
        // Log for debugging - include a hash of first/last bytes to verify uniqueness
        $firstBytes = bin2hex(substr($imageData, 0, min(20, $imageDataLength)));
        $lastBytes = bin2hex(substr($imageData, max(0, $imageDataLength - 20), min(20, $imageDataLength)));
        $imageHash = md5($imageData); // Full hash to verify uniqueness
        
        error_log("=== IMAGE FETCH DEBUG ===");
        error_log("Announcement ID: {$imageId}");
        error_log("Announcement Title: '{$announcementInfo['title']}'");
        error_log("Image data length: {$imageDataLength} bytes");
        error_log("First 20 bytes (hex): {$firstBytes}");
        error_log("Last 20 bytes (hex): {$lastBytes}");
        error_log("Image MD5 hash: {$imageHash}");
        
        // Detect image type from binary data signature (magic bytes)
        $imageType = 'image/jpeg'; // Default fallback
        
        // JPEG: FF D8
        if ($imageDataLength >= 2 && substr($imageData, 0, 2) === "\xFF\xD8") {
            $imageType = 'image/jpeg';
            error_log("Detected image type: JPEG");
        }
        // PNG: 89 50 4E 47 0D 0A 1A 0A
        elseif ($imageDataLength >= 8 && substr($imageData, 0, 8) === "\x89PNG\r\n\x1a\n") {
            $imageType = 'image/png';
            error_log("Detected image type: PNG");
        }
        // GIF: GIF87a or GIF89a
        elseif ($imageDataLength >= 6 && (substr($imageData, 0, 6) === "GIF87a" || substr($imageData, 0, 6) === "GIF89a")) {
            $imageType = 'image/gif';
            error_log("Detected image type: GIF");
        }
        // WebP: RIFF....WEBP
        elseif ($imageDataLength >= 12 && substr($imageData, 0, 4) === "RIFF" && substr($imageData, 8, 4) === "WEBP") {
            $imageType = 'image/webp';
            error_log("Detected image type: WebP");
        }
        else {
            error_log("Warning: Could not detect image type, defaulting to JPEG. First bytes: " . bin2hex(substr($imageData, 0, min(12, $imageDataLength))));
        }
        
        // Set proper headers for image BEFORE any output
        // Note: Cache-Control headers were already set at the top to prevent wrong image caching
        header('Content-Type: ' . $imageType);
        header('Content-Length: ' . $imageDataLength);
        header('Accept-Ranges: bytes');
        
        // Clear any remaining output buffers before sending image
        while (ob_get_level()) {
            ob_end_clean();
        }
        
        // Output the binary data directly
        // Use output buffering disabled to ensure clean binary output
        if (ob_get_level()) {
            ob_end_flush();
        }
        
        echo $imageData;
        
        // Flush output immediately
        if (ob_get_level()) {
            ob_end_flush();
        }
        flush();
        
        // Log AFTER output (but this shouldn't affect the image)
        error_log("Successfully served LONGBLOB image data for ID {$imageId} (Title: '{$announcementInfo['title']}'), type: {$imageType}, size: {$imageDataLength} bytes");
        exit; // Important: exit after outputting image
        
    } catch (Exception $e) {
        error_log("Error serving image for ID {$imageId}: " . $e->getMessage());
        // Serve default image instead of error message
        serveDefaultImage();
    }
}

// Function to fetch announcements
function fetchAnnouncements() {
    $pdo = getDBConnection();
    if (!$pdo) {
        return ['success' => false, 'message' => 'Database connection failed'];
    }
    
    try {
        // Fetch announcements ordered by created_at descending (newest first)
        // Don't select the image column to avoid loading large binary data
        // We'll always use the API endpoint and let it handle checking for image existence
        $stmt = $pdo->prepare("
            SELECT 
                `id`, 
                `title`, 
                `created_at`, 
                `date_and_time`,
                `description`
            FROM `announcements` 
            ORDER BY `created_at` DESC
        ");
        $stmt->execute();
        
        $announcements = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Format the date_and_time for display and handle images from 'image' column
        foreach ($announcements as &$announcement) {
            // Set timezone to Philippines (Asia/Manila)
            $phTimeZone = new DateTimeZone('Asia/Manila');
            $utcTimeZone = new DateTimeZone('UTC');
            
            // Format created_at for "Posted on:" field (date only) - convert to PH time
            if (!empty($announcement['created_at'])) {
                // Assume database stores in UTC, convert to PH time
                $createdDateTime = new DateTime($announcement['created_at'], $utcTimeZone);
                $createdDateTime->setTimezone($phTimeZone);
                $announcement['formatted_created_date'] = $createdDateTime->format('m/d/Y');
                
                // Format created_at for "Time posted:" field (time only, PH time)
                $announcement['formatted_created_time'] = $createdDateTime->format('h:i A');
                
                // For days_ago calculation, use original without timezone conversion
                $originalCreated = new DateTime($announcement['created_at']);
                $announcement['days_ago'] = calculateDaysAgo($originalCreated);
            } else {
                $announcement['formatted_created_date'] = 'Not specified';
                $announcement['formatted_created_time'] = 'Not specified';
                $announcement['days_ago'] = 'Today';
            }
            
            // Format date_and_time for "When" field - database already in PH time
            if (!empty($announcement['date_and_time']) && $announcement['date_and_time'] !== '0000-00-00 00:00:00' && $announcement['date_and_time'] !== '0000-00-00') {
                try {
                    // Database already stores in PH time, no conversion needed
                    $whenDateTime = new DateTime($announcement['date_and_time'], $phTimeZone);
                    $announcement['formatted_when'] = $whenDateTime->format('m/d/Y h:i A');
                    
                    // Also store the PH time formatted date and time separately for consistency
                    $announcement['formatted_when_date'] = $whenDateTime->format('m/d/Y');
                    $announcement['formatted_when_time'] = $whenDateTime->format('h:i A');
                } catch (Exception $e) {
                    error_log("Error formatting date_and_time: " . $e->getMessage() . " | Value: " . $announcement['date_and_time']);
                    $announcement['formatted_when'] = 'Not specified';
                    $announcement['formatted_when_date'] = 'Not specified';
                    $announcement['formatted_when_time'] = 'Not specified';
                }
            } else {
                $announcement['formatted_when'] = 'Not specified';
                $announcement['formatted_when_date'] = 'Not specified';
                $announcement['formatted_when_time'] = 'Not specified';
            }
            
            // Store formatted_date for backward compatibility (use created_at date)
            $announcement['formatted_date'] = $announcement['formatted_created_date'];
            
            // CRITICAL: Always use the API endpoint to fetch image from 'image' column
            // The serveAnnouncementImage function will check if image exists and serve it
            // Use announcement ID + created_at timestamp to ensure unique cache-busting for each announcement
            $cacheBuster = strtotime($announcement['created_at']) . '_' . $announcement['id'];
            $announcement['image'] = 'php/announcements.php?image_id=' . $announcement['id'] . '&t=' . $cacheBuster;
            error_log("Announcement ID {$announcement['id']} (Title: {$announcement['title']}): Using API endpoint for image from 'image' column with cache buster: {$cacheBuster}");
        }
        
        return [
            'success' => true,
            'announcements' => $announcements
        ];
        
    } catch (PDOException $e) {
        error_log("Failed to fetch announcements: " . $e->getMessage());
        return ['success' => false, 'message' => 'Failed to fetch announcements'];
    }
}

// Function to calculate days ago
function calculateDaysAgo($dateTime) {
    $now = new DateTime();
    $diff = $now->diff($dateTime);
    
    // Calculate total days difference
    $totalDays = $diff->days;
    
    // If the announcement was posted in the future, return 0
    if ($dateTime > $now) {
        return 'Today';
    }
    
    if ($totalDays == 0) {
        return 'Today';
    } elseif ($totalDays == 1) {
        return '1 day ago';
    } else {
        return $totalDays . ' days ago';
    }
}

// Main execution
try {
    $result = fetchAnnouncements();
    echo json_encode($result);
} catch (Exception $e) {
    error_log("Unexpected error: " . $e->getMessage());
    echo json_encode(['success' => false, 'message' => 'An unexpected error occurred']);
}
?>
