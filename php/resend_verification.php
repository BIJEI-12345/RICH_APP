<?php
// Start output buffering to prevent any HTML output
ob_start();

// Resend verification code script
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

// Get JSON input
$input = json_decode(file_get_contents('php://input'), true);

// Validate required fields
if (!isset($input['email'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Email address is required']);
    exit;
}

$email = trim($input['email']);

// Validate email format
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid email format']);
    exit;
}

// Database connection
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

// Check if email already exists in resident_information
function emailExists($email) {
    $pdo = getDBConnection();
    if (!$pdo) {
        return false;
    }
    
    try {
        $stmt = $pdo->prepare("SELECT id FROM resident_information WHERE email = ?");
        $stmt->execute([$email]);
        return $stmt->fetch() !== false;
    } catch (PDOException $e) {
        error_log("Email check failed: " . $e->getMessage());
        return false;
    }
}

// Send new OTP code
function resendOTPCode($email) {
    $pdo = getDBConnection();
    if (!$pdo) {
        return ['success' => false, 'message' => 'Database connection failed'];
    }
    
    try {
        // Check if email already exists in resident_information
        if (emailExists($email)) {
            return ['success' => false, 'message' => 'Email address is already registered'];
        }
        
        // Check if registration session exists
        session_start();
        if (!isset($_SESSION['registration_data']) || $_SESSION['registration_data']['email'] !== $email) {
            return ['success' => false, 'message' => 'Registration session expired. Please register again.'];
        }
        
        // Generate new 6-digit verification code
        $verificationCode = str_pad(random_int(100000, 999999), 6, '0', STR_PAD_LEFT);
        
        // Delete any existing OTP records for this email
        $stmt = $pdo->prepare("DELETE FROM otp_verifications WHERE email = ?");
        $stmt->execute([$email]);
        
        // Store new OTP in otp_verifications table (3 minutes expiration)
        $stmt = $pdo->prepare("
            INSERT INTO otp_verifications (
                email, 
                verification_code, 
                expires_at, 
                created_at
            ) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 3 MINUTE), NOW())
        ");
        
        $stmt->execute([$email, $verificationCode]);
        
        // Send verification email
        $registrationData = $_SESSION['registration_data'];
        $fullName = trim($registrationData['firstName'] . ' ' . $registrationData['middleName'] . ' ' . $registrationData['lastName']);
        
        require_once 'EmailSender.php';
        $emailSender = new EmailSender();
        $emailResult = $emailSender->sendOTPEmail($email, $verificationCode, $fullName);
        
        if (!$emailResult['success']) {
            return ['success' => false, 'message' => 'Failed to send verification email. Please try again.'];
        }
        
        // Log the code for testing purposes
        error_log("=== RESEND OTP CODE FOR TESTING ===");
        error_log("Email: " . $email);
        error_log("OTP Code: " . $verificationCode);
        error_log("Full Name: " . $fullName);
        error_log("====================================");
        
        return [
            'success' => true,
            'message' => 'New verification code sent to your email',
            'verification_code' => $verificationCode // For testing purposes
        ];
        
    } catch (PDOException $e) {
        error_log("OTP resend failed: " . $e->getMessage());
        return ['success' => false, 'message' => 'Failed to resend verification code. Please try again.'];
    }
}

// Log resend attempt
function logResendAttempt($email, $success, $ipAddress) {
    $pdo = getDBConnection();
    if (!$pdo) return;
    
    try {
        $stmt = $pdo->prepare("
            INSERT INTO registration_logs (email, success, ip_address, created_at) 
            VALUES (?, ?, ?, NOW())
        ");
        $stmt->execute([$email, $success ? 1 : 0, $ipAddress]);
    } catch (PDOException $e) {
        error_log("Failed to log resend attempt: " . $e->getMessage());
    }
}

try {
    // Process OTP resend
    $result = resendOTPCode($email);

    // Clear any output buffer and return clean JSON response
    ob_clean();

    // Log the attempt
    logResendAttempt($email, $result['success'], $_SERVER['REMOTE_ADDR'] ?? 'unknown');

    // Return response
    if ($result['success']) {
        http_response_code(200);
        echo json_encode($result);
    } else {
        http_response_code(400);
        echo json_encode($result);
    }

} catch (Exception $e) {
    // Clear any output buffer
    ob_clean();
    
    // Log error
    error_log("Resend verification error: " . $e->getMessage());
    
    // Return error response
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Server error occurred. Please try again.'
    ]);
}

// End output buffering
ob_end_flush();
?>
