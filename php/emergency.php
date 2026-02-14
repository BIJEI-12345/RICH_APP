<?php
// Emergency Reports API - Insert emergency reports to database
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

// Function to insert emergency report
function insertEmergencyReport($data) {
    $pdo = getDBConnection();
    if (!$pdo) {
        error_log("Emergency report: Database connection failed");
        return ['success' => false, 'message' => 'Database connection failed'];
    }
    
    try {
        // Debug: Log received data
        error_log("Emergency report data received: " . json_encode($data));
        
        // Validate required fields
        $requiredFields = ['emergency_type', 'description'];
        foreach ($requiredFields as $field) {
            if (empty($data[$field])) {
                error_log("Emergency report: Missing required field: $field");
                return ['success' => false, 'message' => "Missing required field: $field"];
            }
        }
        
        // Auto-populate reporter_name from email
        $userEmail = $data['user_email'] ?? '';
        $reporterName = getUserNameFromEmail($userEmail);
        
        // Set Philippine Time for timestamp
        date_default_timezone_set('Asia/Manila');
        $philippineTime = date('Y-m-d H:i:s');
        
        // Handle image data (convert base64 to binary if present)
        $imageData = null;
        if (!empty($data['image_data'])) {
            $imageData = base64_decode($data['image_data']);
        }
        
        // Get email from data
        $email = $data['user_email'] ?? null;
        
        // Check if email column exists
        $checkColumn = $pdo->query("SHOW COLUMNS FROM emergency_reports LIKE 'email'");
        $emailColumnExists = $checkColumn->rowCount() > 0;
        
        // Try to insert with all possible columns
        // First, try the version with email, emergency_image and landmark
        $insertSuccess = false;
        $lastError = '';
        
        try {
            if ($emailColumnExists && $email) {
                $stmt = $pdo->prepare("
                    INSERT INTO emergency_reports 
                    (email, emergency_type, reporter_name, date_and_time, description, emergency_image, location, landmark, status) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");
                $result = $stmt->execute([
                    $email,
                    $data['emergency_type'],
                    $reporterName,
                    $philippineTime,
                    $data['description'],
                    $imageData,
                    $data['location'] ?? null,
                    $data['landmark'] ?? null,
                    'New'
                ]);
            } else {
                $stmt = $pdo->prepare("
                    INSERT INTO emergency_reports 
                    (emergency_type, reporter_name, date_and_time, description, emergency_image, location, landmark, status) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ");
                $result = $stmt->execute([
                    $data['emergency_type'],
                    $reporterName,
                    $philippineTime,
                    $data['description'],
                    $imageData,
                    $data['location'] ?? null,
                    $data['landmark'] ?? null,
                    'New'
                ]);
            }
            if ($result) {
                $insertSuccess = true;
            }
        } catch (PDOException $e) {
            $lastError = $e->getMessage();
            error_log("First insert attempt failed: " . $lastError);
            error_log("Trying fallback insert without optional columns");
            
            try {
                if ($emailColumnExists && $email) {
                    $stmt = $pdo->prepare("
                        INSERT INTO emergency_reports 
                        (email, emergency_type, reporter_name, date_and_time, description, location, status) 
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    ");
                    $result = $stmt->execute([
                        $email,
                        $data['emergency_type'],
                        $reporterName,
                        $philippineTime,
                        $data['description'],
                        $data['location'] ?? null,
                        'New'
                    ]);
                } else {
                    $stmt = $pdo->prepare("
                        INSERT INTO emergency_reports 
                        (emergency_type, reporter_name, date_and_time, description, location, status) 
                        VALUES (?, ?, ?, ?, ?, ?)
                    ");
                    $result = $stmt->execute([
                        $data['emergency_type'],
                        $reporterName,
                        $philippineTime,
                        $data['description'],
                        $data['location'] ?? null,
                        'New'
                    ]);
                }
                if ($result) {
                    $insertSuccess = true;
                } else {
                    $lastError = 'Execute returned false on fallback insert';
                }
            } catch (PDOException $e2) {
                $lastError = $e2->getMessage();
                error_log("Fallback insert also failed: " . $lastError);
            }
        }
        
        if ($insertSuccess) {
            $reportId = $pdo->lastInsertId();
            error_log("Emergency report inserted successfully with ID: $reportId");
            return [
                'success' => true,
                'message' => 'Emergency report submitted successfully',
                'report_id' => $reportId
            ];
        } else {
            error_log("Emergency report: All insert attempts failed. Last error: " . $lastError);
            return ['success' => false, 'message' => 'Database error: ' . $lastError];
        }
        
    } catch (PDOException $e) {
        $errorMsg = $e->getMessage();
        error_log("Failed to insert emergency report: " . $errorMsg);
        return ['success' => false, 'message' => 'Database error: ' . $errorMsg];
    }
}

// Function to log emergency report attempt
function logEmergencyReportAttempt($data, $success, $ipAddress) {
    $pdo = getDBConnection();
    if (!$pdo) return;
    
    try {
        // Get reporter name from email
        $userEmail = $data['user_email'] ?? '';
        $reporterName = getUserNameFromEmail($userEmail);
        
        $stmt = $pdo->prepare("
            INSERT INTO emergency_report_logs 
            (emergency_type, reporter_name, success, ip_address, created_at) 
            VALUES (?, ?, ?, ?, NOW())
        ");
        $stmt->execute([
            $data['emergency_type'] ?? 'unknown',
            $reporterName,
            $success ? 1 : 0,
            $ipAddress
        ]);
    } catch (PDOException $e) {
        error_log("Failed to log emergency report attempt: " . $e->getMessage());
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
    
    // Get IP address
    $ipAddress = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    
    // Insert the emergency report
    $result = insertEmergencyReport($input);
    
    // Log the attempt
    logEmergencyReportAttempt($input, $result['success'], $ipAddress);
    
    echo json_encode($result);
    
} catch (Exception $e) {
    error_log("Unexpected error: " . $e->getMessage());
    echo json_encode(['success' => false, 'message' => 'An unexpected error occurred']);
}
?>
