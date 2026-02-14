<?php
// Check if this is an image request FIRST - before setting any headers
if (isset($_GET['image_id'])) {
    // Disable error display immediately to prevent corrupting image output
    ini_set('display_errors', 0);
    ini_set('log_errors', 1);
    
    // Clear any output buffers first
    while (ob_get_level()) {
        ob_end_clean();
    }
    
    // Validate and sanitize image_id
    $imageId = filter_var($_GET['image_id'], FILTER_VALIDATE_INT);
    if ($imageId === false || $imageId <= 0) {
        error_log("Invalid image_id parameter: " . ($_GET['image_id'] ?? 'not set'));
        http_response_code(400);
        header('Content-Type: text/plain');
        echo "Invalid image ID";
        exit;
    }
    // Serve image directly
    error_log("Image request received for ID: {$imageId}");
    serveAnnouncementImage($imageId);
    exit;
}

// Only set JSON headers if not serving an image
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Handle GET request to fetch announcements (same as announcements.php)
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        $result = fetchAnnouncements();
        echo json_encode($result);
        exit;
    } catch (Exception $e) {
        error_log("Unexpected error fetching announcements: " . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'An unexpected error occurred']);
        exit;
    }
}

try {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!isset($input['email']) || !filter_var($input['email'], FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Valid email is required']);
        exit;
    }
    $email = trim($input['email']);

    $host = "rich.cmxcoo6yc8nh.us-east-1.rds.amazonaws.com"; 
    $user = "admin";
    $pass = "4mazonb33j4y!";
    $db   = "rich_db";// Siguraduhin na nagawa mo na ang database na ito sa phpMyAdmin
      
     // $host = "rich.c4lc2owy0af4.us-east-1.rds.amazonaws.com";
     // $username = "admin";
     // $password = "4mazonb33j4y!"; 
     // $dbname = "rich_db"; 
      

    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    // Ensure binary data (LONGBLOB) is returned correctly - don't stringify
    $pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);
    $pdo->setAttribute(PDO::ATTR_STRINGIFY_FETCHES, false);

    // Fetch user info including address for more accurate matching
    $stmt = $pdo->prepare("SELECT id, first_name, last_name, address FROM resident_information WHERE email = ?");
    $stmt->execute([$email]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$user) {
        echo json_encode(['success' => false, 'message' => 'User not found', 'active' => []]);
        exit;
    }
    $userId = $user['id'];
    $userName = trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? ''));
    $userAddress = $user['address'] ?? '';
    error_log("Checking active requests for email: '{$email}' (User ID: {$userId}, Name: '{$userName}')");

    $active = [];

    // Helper to flag active
    $flag = function($type, $extra = []) use (&$active) {
        $active[$type] = array_merge(['active' => true], $extra);
    };

    // Barangay ID - Check if email column exists, if yes query directly by email, otherwise use JOIN
    $checkEmailColumn = $pdo->query("SHOW COLUMNS FROM barangay_id_forms LIKE 'email'");
    $hasEmailColumn = $checkEmailColumn->rowCount() > 0;
    
    if ($hasEmailColumn) {
        $stmt = $pdo->prepare("
            SELECT COUNT(*) 
            FROM barangay_id_forms b
            WHERE b.email = ?
            AND (b.status IS NULL OR b.status = '' OR LOWER(b.status) IN ('pending', 'processing', 'new'))
            AND LOWER(b.status) NOT IN ('finished', 'completed', 'resolved', 'cancelled')
        ");
        $stmt->execute([$email]);
        $barangayIdCount = $stmt->fetchColumn();
        error_log("Barangay ID check for email '{$email}' (direct email query): Found {$barangayIdCount} active requests");
    } else {
        $stmt = $pdo->prepare("
            SELECT COUNT(*) 
            FROM barangay_id_forms b
            INNER JOIN resident_information r ON CONCAT(TRIM(r.first_name), ' ', TRIM(r.last_name)) = CONCAT(TRIM(b.given_name), ' ', TRIM(b.last_name))
            WHERE r.email = ?
            AND (b.status IS NULL OR b.status = '' OR LOWER(b.status) IN ('pending', 'processing', 'new'))
            AND LOWER(b.status) NOT IN ('finished', 'completed', 'resolved', 'cancelled')
        ");
        $stmt->execute([$email]);
        $barangayIdCount = $stmt->fetchColumn();
        error_log("Barangay ID check for email '{$email}' (JOIN by name): Found {$barangayIdCount} active requests");
    }
    
    if ($barangayIdCount > 0) { 
        $flag('barangay_id');
        error_log("Barangay ID FLAGGED as active for email '{$email}'");
    }

    // Certification - Check if email column exists, if yes query directly by email, otherwise use JOIN
    $checkEmailColumn = $pdo->query("SHOW COLUMNS FROM certification_forms LIKE 'email'");
    $hasEmailColumn = $checkEmailColumn->rowCount() > 0;
    
    if ($hasEmailColumn) {
        $stmt = $pdo->prepare("
            SELECT COUNT(*) 
            FROM certification_forms c
            WHERE c.email = ?
            AND (c.status IS NULL OR c.status = '' OR LOWER(c.status) IN ('pending', 'processing', 'new'))
            AND LOWER(c.status) NOT IN ('finished', 'completed', 'resolved', 'cancelled')
        ");
        $stmt->execute([$email]);
        $certificationCount = $stmt->fetchColumn();
        error_log("Certification check for email '{$email}' (direct email query): Found {$certificationCount} active requests");
    } else {
        $stmt = $pdo->prepare("
            SELECT COUNT(*) 
            FROM certification_forms c
            INNER JOIN resident_information r ON CONCAT(TRIM(r.first_name), ' ', TRIM(r.last_name)) = CONCAT(TRIM(c.first_name), ' ', TRIM(c.last_name))
            WHERE r.email = ?
            AND (c.status IS NULL OR c.status = '' OR LOWER(c.status) IN ('pending', 'processing', 'new'))
            AND LOWER(c.status) NOT IN ('finished', 'completed', 'resolved', 'cancelled')
        ");
        $stmt->execute([$email]);
        $certificationCount = $stmt->fetchColumn();
        error_log("Certification check for email '{$email}' (JOIN by name): Found {$certificationCount} active requests");
    }
    
    if ($certificationCount > 0) { 
        $flag('certification');
        error_log("Certification FLAGGED as active for email '{$email}'");
    }

    // COE - Check if email column exists, if yes query directly by email, otherwise use JOIN
    $checkEmailColumn = $pdo->query("SHOW COLUMNS FROM coe_forms LIKE 'email'");
    $hasEmailColumn = $checkEmailColumn->rowCount() > 0;
    
    if ($hasEmailColumn) {
        $stmt = $pdo->prepare("
            SELECT COUNT(*) 
            FROM coe_forms coe
            WHERE coe.email = ?
            AND (coe.status IS NULL OR coe.status = '' OR LOWER(coe.status) IN ('pending', 'processing', 'new'))
            AND LOWER(coe.status) NOT IN ('finished', 'completed', 'resolved', 'cancelled')
        ");
        $stmt->execute([$email]);
        $coeCount = $stmt->fetchColumn();
        error_log("COE check for email '{$email}' (direct email query): Found {$coeCount} active requests");
    } else {
        $stmt = $pdo->prepare("
            SELECT COUNT(*) 
            FROM coe_forms coe
            INNER JOIN resident_information r ON CONCAT(TRIM(r.first_name), ' ', TRIM(r.last_name)) = CONCAT(TRIM(coe.first_name), ' ', TRIM(coe.last_name))
            WHERE r.email = ?
            AND (coe.status IS NULL OR coe.status = '' OR LOWER(coe.status) IN ('pending', 'processing', 'new'))
            AND LOWER(coe.status) NOT IN ('finished', 'completed', 'resolved', 'cancelled')
        ");
        $stmt->execute([$email]);
        $coeCount = $stmt->fetchColumn();
        error_log("COE check for email '{$email}' (JOIN by name): Found {$coeCount} active requests");
    }
    
    if ($coeCount > 0) { 
        $flag('coe');
        error_log("COE FLAGGED as active for email '{$email}'");
    }

    // Indigency - Check if email column exists, if yes query directly by email, otherwise use JOIN
    $checkEmailColumn = $pdo->query("SHOW COLUMNS FROM indigency_forms LIKE 'email'");
    $hasEmailColumn = $checkEmailColumn->rowCount() > 0;
    
    if ($hasEmailColumn) {
        // Query directly by email if column exists
        $stmt = $pdo->prepare("
            SELECT COUNT(*) 
            FROM indigency_forms i
            WHERE i.email = ?
            AND (i.status IS NULL OR i.status = '' OR LOWER(i.status) IN ('pending', 'processing', 'new'))
            AND LOWER(i.status) NOT IN ('finished', 'completed', 'resolved', 'cancelled')
        ");
        $stmt->execute([$email]);
        $indigencyCount = $stmt->fetchColumn();
        error_log("Indigency check for email '{$email}' (direct email query): Found {$indigencyCount} active requests");
    } else {
        // Fallback to JOIN with resident_information based on email
        $stmt = $pdo->prepare("
            SELECT COUNT(*) 
            FROM indigency_forms i
            INNER JOIN resident_information r ON CONCAT(TRIM(r.first_name), ' ', TRIM(r.last_name)) = CONCAT(TRIM(i.first_name), ' ', TRIM(i.last_name))
            WHERE r.email = ?
            AND (i.status IS NULL OR i.status = '' OR LOWER(i.status) IN ('pending', 'processing', 'new'))
            AND LOWER(i.status) NOT IN ('finished', 'completed', 'resolved', 'cancelled')
        ");
        $stmt->execute([$email]);
        $indigencyCount = $stmt->fetchColumn();
        error_log("Indigency check for email '{$email}' (JOIN by name): Found {$indigencyCount} active requests");
    }
    
    if ($indigencyCount > 0) { 
        $flag('indigency');
        error_log("Indigency FLAGGED as active for email '{$email}'");
    }

    // Clearance - Check if email column exists, if yes query directly by email, otherwise use JOIN
    $checkEmailColumn = $pdo->query("SHOW COLUMNS FROM clearance_forms LIKE 'email'");
    $hasEmailColumn = $checkEmailColumn->rowCount() > 0;
    
    if ($hasEmailColumn) {
        $stmt = $pdo->prepare("
            SELECT COUNT(*) 
            FROM clearance_forms cl
            WHERE cl.email = ?
            AND (cl.status IS NULL OR cl.status = '' OR LOWER(cl.status) IN ('pending', 'processing', 'new'))
            AND LOWER(cl.status) NOT IN ('finished', 'completed', 'resolved', 'cancelled')
        ");
        $stmt->execute([$email]);
        $clearanceCount = $stmt->fetchColumn();
        error_log("Clearance check for email '{$email}' (direct email query): Found {$clearanceCount} active requests");
    } else {
        $stmt = $pdo->prepare("
            SELECT COUNT(*) 
            FROM clearance_forms cl
            INNER JOIN resident_information r ON CONCAT(TRIM(r.first_name), ' ', TRIM(r.last_name)) = CONCAT(TRIM(cl.first_name), ' ', TRIM(cl.last_name))
            WHERE r.email = ?
            AND (cl.status IS NULL OR cl.status = '' OR LOWER(cl.status) IN ('pending', 'processing', 'new'))
            AND LOWER(cl.status) NOT IN ('finished', 'completed', 'resolved', 'cancelled')
        ");
        $stmt->execute([$email]);
        $clearanceCount = $stmt->fetchColumn();
        error_log("Clearance check for email '{$email}' (JOIN by name): Found {$clearanceCount} active requests");
    }
    
    if ($clearanceCount > 0) { 
        $flag('clearance');
        error_log("Clearance FLAGGED as active for email '{$email}'");
    }

    // Concerns - Check if email column exists, if yes query directly by email, otherwise use JOIN
    $checkEmailColumn = $pdo->query("SHOW COLUMNS FROM concerns LIKE 'email'");
    $hasEmailColumn = $checkEmailColumn->rowCount() > 0;
    
    if ($hasEmailColumn) {
        $stmt = $pdo->prepare("
            SELECT COUNT(*) 
            FROM concerns c
            WHERE c.email = ?
            AND (c.status IS NULL OR c.status = '' OR LOWER(c.status) IN ('pending', 'processing', 'new'))
            AND LOWER(c.status) NOT IN ('finished', 'completed', 'resolved', 'cancelled')
        ");
        $stmt->execute([$email]);
        $concernsCount = $stmt->fetchColumn();
        error_log("Concerns check for email '{$email}' (direct email query): Found {$concernsCount} active requests");
    } else {
        $stmt = $pdo->prepare("
            SELECT COUNT(*) 
            FROM concerns c
            INNER JOIN resident_information r ON c.reporter_name = CONCAT(TRIM(r.first_name), ' ', TRIM(r.last_name))
            WHERE r.email = ?
            AND (c.status IS NULL OR c.status = '' OR LOWER(c.status) IN ('pending', 'processing', 'new'))
            AND LOWER(c.status) NOT IN ('finished', 'completed', 'resolved', 'cancelled')
        ");
        $stmt->execute([$email]);
        $concernsCount = $stmt->fetchColumn();
        error_log("Concerns check for email '{$email}' (JOIN by name): Found {$concernsCount} active requests");
    }
    
    if ($concernsCount > 0) { 
        $flag('concerns');
        error_log("Concerns FLAGGED as active for email '{$email}'");
    }

    // Emergency Reports - Check if email column exists, if yes query directly by email, otherwise use JOIN
    $checkEmailColumn = $pdo->query("SHOW COLUMNS FROM emergency_reports LIKE 'email'");
    $hasEmailColumn = $checkEmailColumn->rowCount() > 0;
    
    if ($hasEmailColumn) {
        $stmt = $pdo->prepare("
            SELECT COUNT(*) 
            FROM emergency_reports e
            WHERE e.email = ?
            AND (e.status IS NULL OR e.status = '' OR LOWER(e.status) IN ('pending', 'processing', 'new'))
            AND LOWER(e.status) NOT IN ('finished', 'completed', 'resolved', 'cancelled')
        ");
        $stmt->execute([$email]);
        $emergencyCount = $stmt->fetchColumn();
        error_log("Emergency reports check for email '{$email}' (direct email query): Found {$emergencyCount} active requests");
    } else {
        $stmt = $pdo->prepare("
            SELECT COUNT(*) 
            FROM emergency_reports e
            INNER JOIN resident_information r ON e.reporter_name = CONCAT(TRIM(r.first_name), ' ', TRIM(r.last_name))
            WHERE r.email = ?
            AND (e.status IS NULL OR e.status = '' OR LOWER(e.status) IN ('pending', 'processing', 'new'))
            AND LOWER(e.status) NOT IN ('finished', 'completed', 'resolved', 'cancelled')
        ");
        $stmt->execute([$email]);
        $emergencyCount = $stmt->fetchColumn();
        error_log("Emergency reports check for email '{$email}' (JOIN by name): Found {$emergencyCount} active requests");
    }
    
    if ($emergencyCount > 0) { 
        $flag('emergency');
        error_log("Emergency reports FLAGGED as active for email '{$email}'");
    }

    error_log("Returning active restrictions: " . json_encode($active));
    echo json_encode(['success' => true, 'active' => $active]);
} catch (PDOException $e) {
    error_log('DB error in check_active_requests: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error']);
} catch (Throwable $t) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error']);
}

// Function to serve default image when announcement image is missing
function serveDefaultImage() {
    $defaultImagePath = __DIR__ . '/../Images/brgyHall.jpg';
    if (file_exists($defaultImagePath)) {
        header('Content-Type: image/jpeg');
        header('Content-Length: ' . filesize($defaultImagePath));
        readfile($defaultImagePath);
        exit;
    } else {
        // If default image doesn't exist, return 404
        http_response_code(404);
        header('Content-Type: text/plain');
        echo "Default image not found";
        exit;
    }
}

// Function to serve announcement image from longblob column
function serveAnnouncementImage($imageId) {
    // Disable error display to prevent corrupting image output
    ini_set('display_errors', 0);
    ini_set('log_errors', 1);
    
    // Clear any output buffers first - CRITICAL for binary data
    while (ob_get_level()) {
        ob_end_clean();
    }
    
    // Remove any existing headers that might interfere
    if (headers_sent()) {
        error_log("WARNING: Headers already sent before serving image for ID {$imageId}");
    }
    
    // Add cache control headers to prevent caching of wrong images
    header('Cache-Control: no-cache, no-store, must-revalidate');
    header('Pragma: no-cache');
    header('Expires: 0');
    
    $host = "rich.cmxcoo6yc8nh.us-east-1.rds.amazonaws.com"; 
    $user = "admin";
    $pass = "4mazonb33j4y!";
    $db   = "rich_db";
    
    try {
        $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        // Ensure binary data (LONGBLOB) is returned correctly - don't stringify
        $pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);
        $pdo->setAttribute(PDO::ATTR_STRINGIFY_FETCHES, false);
    } catch (PDOException $e) {
        error_log("Database connection failed: " . $e->getMessage());
        http_response_code(500);
        header('Content-Type: text/plain');
        echo "Database connection failed";
        exit;
    }
    
    try {
        // CRITICAL: Fetch ONLY from the 'image' column in the announcements table
        // First verify the announcement exists and log its title for debugging
        $verifyStmt = $pdo->prepare("SELECT `id`, `title` FROM `announcements` WHERE `id` = ?");
        $verifyStmt->execute([$imageId]);
        $announcementInfo = $verifyStmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$announcementInfo) {
            error_log("ERROR: Announcement ID {$imageId} does not exist in database");
            http_response_code(404);
            header('Content-Type: text/plain');
            echo "Announcement not found";
            exit;
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
                error_log("Failed to read image data from stream for ID {$imageId}");
                http_response_code(404);
                header('Content-Type: text/plain');
                echo "Image data is empty";
                exit;
            }
        }
        
        // Verify we have string data at this point
        if (!is_string($imageData)) {
            error_log("ERROR: Image data is not a string after processing for ID {$imageId}. Type: " . gettype($imageData));
            http_response_code(500);
            header('Content-Type: text/plain');
            echo "Invalid image data type";
            exit;
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
        http_response_code(500);
        header('Content-Type: text/plain');
        echo "Error: " . $e->getMessage();
    }
}

// Function to fetch announcements (same as announcements.php)
function fetchAnnouncements() {
    $host = "rich.cmxcoo6yc8nh.us-east-1.rds.amazonaws.com"; 
    $user = "admin";
    $pass = "4mazonb33j4y!";
    $db   = "rich_db";
    
    try {
        $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);
        $pdo->setAttribute(PDO::ATTR_STRINGIFY_FETCHES, false);
    } catch (PDOException $e) {
        error_log("Database connection failed: " . $e->getMessage());
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
                `description`
            FROM `announcements` 
            ORDER BY `created_at` DESC
        ");
        $stmt->execute();
        
        $announcements = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Format the created_at for display and handle images from 'image' column
        foreach ($announcements as &$announcement) {
            $dateTime = new DateTime($announcement['created_at']);
            $announcement['formatted_date'] = $dateTime->format('m/d/Y');
            $announcement['formatted_time'] = $dateTime->format('h:i A');
            $announcement['days_ago'] = calculateDaysAgo($dateTime);
            
            // CRITICAL: Always use the API endpoint to fetch image from 'image' column
            // The serveAnnouncementImage function will check if image exists and serve it
            // Use announcement ID + created_at timestamp to ensure unique cache-busting for each announcement
            $cacheBuster = strtotime($announcement['created_at']) . '_' . $announcement['id'];
            $announcement['image'] = 'php/check_active_requests.php?image_id=' . $announcement['id'] . '&t=' . $cacheBuster;
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

// Function to calculate days ago (same as announcements.php)
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
