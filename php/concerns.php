<?php
// Concerns API - Insert concerns to database
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

// Database connection function
function getDBConnection() {
    $host = "rich.cmxcoo6yc8nh.us-east-1.rds.amazonaws.com"; 
    $user = "admin";
    $pass = "4mazonb33j4y!";
    $db   = "rich_db";       // Siguraduhin na nagawa mo na ang database na ito sa phpMyAdmin
      
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

// Function to get user name from email
function getUserNameFromEmail($email) {
    $pdo = getDBConnection();
    if (!$pdo) {
        return 'Unknown User';
    }
    
    try {
        $stmt = $pdo->prepare("SELECT first_name, last_name FROM resident_information WHERE email = ?");
        $stmt->execute([$email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($user) {
            return trim($user['first_name'] . ' ' . $user['last_name']);
        }
        return 'Unknown User';
    } catch (PDOException $e) {
        error_log("Failed to get user name: " . $e->getMessage());
        return 'Unknown User';
    }
}

// Function to insert concern
function insertConcern($data) {
    $pdo = getDBConnection();
    if (!$pdo) {
        error_log("Concern: Database connection failed");
        return ['success' => false, 'message' => 'Database connection failed'];
    }
    
    try {
        // Debug: Log received data
        error_log("Concern data received: " . json_encode($data));
        
        // Validate required fields
        $requiredFields = ['contact', 'location', 'statement'];
        foreach ($requiredFields as $field) {
            if (empty($data[$field])) {
                error_log("Concern: Missing required field: $field");
                return ['success' => false, 'message' => "Missing required field: $field"];
            }
        }
        
        // Auto-populate reporter_name from email
        $userEmail = $data['user_email'] ?? '';
        $reporterName = getUserNameFromEmail($userEmail);
        
        // Validate contact number length (max 11 digits)
        if (!empty($data['contact'])) {
            $contactNumber = preg_replace('/[^0-9]/', '', $data['contact']);
            if (strlen($contactNumber) > 11) {
                return ['success' => false, 'message' => 'Contact number must be 11 digits or less'];
            }
            $data['contact'] = $contactNumber;
        }
        
        // Handle image upload (optional)
        $imageData = null;
        if (!empty($data['image_data'])) {
            // Decode base64 image data
            $imageData = base64_decode($data['image_data']);
        }
        
        // Set Philippine Time for timestamp
        date_default_timezone_set('Asia/Manila');
        $philippineTime = date('Y-m-d H:i:s');
        
        // Get email from data
        $email = $data['user_email'] ?? null;
        
        // Check if email column exists
        $checkColumn = $pdo->query("SHOW COLUMNS FROM concerns LIKE 'email'");
        $emailColumnExists = $checkColumn->rowCount() > 0;
        
        if ($emailColumnExists && $email) {
            // Prepare the insert statement with email
            $stmt = $pdo->prepare("
                INSERT INTO concerns 
                (email, concern_image, reporter_name, contact, date_and_time, location, statement) 
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ");
            
            // Execute the insert
            $result = $stmt->execute([
                $email,
                $imageData,
                $reporterName,
                $data['contact'],
                $philippineTime,
                $data['location'],
                $data['statement']
            ]);
        } else {
            // Prepare the insert statement without email (for backward compatibility)
            $stmt = $pdo->prepare("
                INSERT INTO concerns 
                (concern_image, reporter_name, contact, date_and_time, location, statement) 
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            
            // Execute the insert
            $result = $stmt->execute([
                $imageData,
                $reporterName,
                $data['contact'],
                $philippineTime,
                $data['location'],
                $data['statement']
            ]);
        }
        
        if ($result) {
            $concernId = $pdo->lastInsertId();
            error_log("Concern inserted successfully with ID: $concernId");
            return [
                'success' => true,
                'message' => 'Concern submitted successfully',
                'concern_id' => $concernId
            ];
        } else {
            error_log("Concern: Failed to insert - execute returned false");
            return ['success' => false, 'message' => 'Failed to insert concern'];
        }
        
    } catch (PDOException $e) {
        error_log("Failed to insert concern: " . $e->getMessage());
        return ['success' => false, 'message' => 'Failed to insert concern'];
    }
}

// Main execution
try {
    // Get JSON input
    $input = json_decode(file_get_contents('php://input'), true);
    
    // Check if input is valid JSON
    if (json_last_error() !== JSON_ERROR_NONE) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid JSON input']);
        exit;
    }
    
    // Check if this is a get_user_name request
    if (isset($input['action']) && $input['action'] === 'get_user_name') {
        $userEmail = $input['user_email'] ?? '';
        $reporterName = getUserNameFromEmail($userEmail);
        echo json_encode([
            'success' => true,
            'reporter_name' => $reporterName
        ]);
        exit;
    }
    
    // Check if this is a get_user_name_direct request (fallback)
    if (isset($input['action']) && $input['action'] === 'get_user_name_direct') {
        $userEmail = $input['user_email'] ?? '';
        $reporterName = getUserNameFromEmail($userEmail);
        echo json_encode([
            'success' => true,
            'reporter_name' => $reporterName
        ]);
        exit;
    }
    
    // Insert the concern
    $result = insertConcern($input);
    
    echo json_encode($result);
    
} catch (Exception $e) {
    error_log("Unexpected error: " . $e->getMessage());
    echo json_encode(['success' => false, 'message' => 'An unexpected error occurred']);
}
?>
