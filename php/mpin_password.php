<?php
// MPIN Password saving script
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

// Disable error display to prevent HTML output
ini_set('display_errors', 0);
ini_set('log_errors', 1);

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

// Get input data (try JSON first, then POST)
$input = json_decode(file_get_contents('php://input'), true);

// If JSON input is empty, try POST data
if (empty($input)) {
    $input = $_POST;
}

// Debug: Log received data (simplified)
error_log("MPIN save attempt for email: " . ($input['email'] ?? 'NOT SET'));

// Validate required fields
if (!isset($input['email']) || !isset($input['mpin'])) {
    error_log("Missing required fields - email: " . (isset($input['email']) ? 'present' : 'missing') . ", mpin: " . (isset($input['mpin']) ? 'present' : 'missing'));
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Email and MPIN are required']);
    exit;
}

$email = trim($input['email']);
$mpin = trim($input['mpin']);

// Validate email format
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid email format']);
    exit;
}

// Validate MPIN format (6 digits)
if (!preg_match('/^\d{6}$/', $mpin)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'MPIN must be exactly 6 digits']);
    exit;
}

// Database connection
function getDBConnection() {
    $host = "rich.cmxcoo6yc8nh.us-east-1.rds.amazonaws.com"; 
    $user = "admin";
    $pass = "4mazonb33j4y!";
    $db   = "rich_db";      // Siguraduhin na nagawa mo na ang database na ito sa phpMyAdmin
    
   // $host = "rich.c4lc2owy0af4.us-east-1.rds.amazonaws.com";
   // $username = "admin";
   // $password = "4mazonb33j4y!"; 
   // $dbname = "rich_db"; 
    
    try {
        $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        return $pdo;
    } catch (PDOException $e) {
        error_log("Database connection failed: " . $e->getMessage());
        return null;
    }
}

// Save MPIN password
function saveMPINPassword($email, $mpin) {
    error_log("Starting MPIN save for email: " . $email . " with MPIN: " . $mpin);
    
    $pdo = getDBConnection();
    if (!$pdo) {
        error_log("Database connection failed");
        return ['success' => false, 'message' => 'Database connection failed'];
    }
    
    try {
        // First, check if the table exists and create it if it doesn't
        $tableCheck = $pdo->query("SHOW TABLES LIKE 'resident_information'");
        if ($tableCheck->rowCount() == 0) {
            error_log("Table resident_information does not exist, creating it");
            
            $createTable = "
                CREATE TABLE resident_information (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    first_name VARCHAR(100) NOT NULL,
                    last_name VARCHAR(100) NOT NULL,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    age INT DEFAULT 0,
                    sex VARCHAR(20) DEFAULT 'Not specified',
                    birthday DATE DEFAULT NULL,
                    civil_status VARCHAR(50) DEFAULT 'Not specified',
                    address TEXT DEFAULT 'Not specified',
                    email_verified TINYINT(1) DEFAULT 0,
                    mpin_password VARCHAR(6) DEFAULT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            ";
            
            $pdo->exec($createTable);
            error_log("Table resident_information created successfully");
        }
        
        // Always try to create/update user with MPIN
        error_log("Processing MPIN for email: " . $email);
        
        // First, try to insert or update using INSERT ... ON DUPLICATE KEY UPDATE
        $stmt = $pdo->prepare("
            INSERT INTO resident_information (
                first_name, last_name, email, age, sex, birthday, 
                civil_status, address, email_verified, mpin_password, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE 
                mpin_password = VALUES(mpin_password),
                updated_at = NOW()
        ");
        
        $result = $stmt->execute([
            'User', 'User', $email, 21, 'Male', '2000-01-01', 'Single', 'Not specified', 1, $mpin
        ]);
        
        if ($result) {
            // Get the user ID (either newly created or existing)
            $stmt = $pdo->prepare("SELECT id FROM resident_information WHERE email = ?");
            $stmt->execute([$email]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            $userId = $user['id'];
            
            error_log("Successfully saved MPIN for email: " . $email . " - User ID: " . $userId);
        } else {
            $errorInfo = $stmt->errorInfo();
            error_log("Failed to save MPIN - Error: " . print_r($errorInfo, true));
            return ['success' => false, 'message' => 'Failed to save MPIN: ' . $errorInfo[2]];
        }
        
        error_log("MPIN save completed successfully for email: " . $email);
        return [
            'success' => true,
            'message' => 'MPIN password saved successfully!',
            'user_id' => $userId,
            'email' => $email
        ];
        
    } catch (PDOException $e) {
        error_log("MPIN save failed with PDO exception: " . $e->getMessage());
        error_log("PDO Error Code: " . $e->getCode());
        return ['success' => false, 'message' => 'Database error: ' . $e->getMessage()];
    }
}

try {
    // Process MPIN saving
    $result = saveMPINPassword($email, $mpin);
    
    // Debug logging
    error_log("MPIN save result: " . print_r($result, true));

    // Clear any output buffer to ensure clean JSON response
    if (ob_get_level()) {
        ob_clean();
    }

    // Return response
    if ($result['success']) {
        error_log("Returning success response for email: " . $email);
        http_response_code(200);
        echo json_encode($result);
        exit; // Ensure no further output
    } else {
        error_log("Returning error response for email: " . $email . " - " . $result['message']);
        http_response_code(400);
        echo json_encode($result);
        exit; // Ensure no further output
    }

} catch (Exception $e) {
    // Clear any output buffer
    if (ob_get_level()) {
        ob_clean();
    }
    
    // Log error
    error_log("MPIN save exception: " . $e->getMessage());
    
    // Return error response
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Server error occurred. Please try again.'
    ]);
    exit; // Ensure no further output
}
?>
