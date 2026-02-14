<?php
// Start output buffering to prevent any HTML output
ob_start();

// Email verification processing script
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
if (!isset($input['email']) || !isset($input['code'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Email and verification code are required']);
    exit;
}

$email = trim($input['email']);
$verificationCode = trim($input['code']);

// Validate email format
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid email format']);
    exit;
}

// Validate verification code format
if (!preg_match('/^\d{6}$/', $verificationCode)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid verification code format']);
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

// Verify OTP and save user data
function verifyOTPAndSaveUser($email, $verificationCode) {
    $pdo = getDBConnection();
    if (!$pdo) {
        return ['success' => false, 'message' => 'Database connection failed'];
    }
    
    try {
        // Start transaction
        $pdo->beginTransaction();
        
        // Check if OTP exists and is valid
        $stmt = $pdo->prepare("
            SELECT id, expires_at 
            FROM otp_verifications 
            WHERE email = ? AND verification_code = ? AND expires_at > NOW()
            ORDER BY created_at DESC 
            LIMIT 1
        ");
        
        $stmt->execute([$email, $verificationCode]);
        $otpRecord = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$otpRecord) {
            $pdo->rollBack();
            return ['success' => false, 'message' => 'Invalid or expired verification code'];
        }
        
        // Check if email is already verified (user already exists)
        $stmt = $pdo->prepare("SELECT id FROM resident_information WHERE email = ?");
        $stmt->execute([$email]);
        if ($stmt->fetch()) {
            $pdo->rollBack();
            return ['success' => false, 'message' => 'Email address is already registered and verified'];
        }
        
        // Get registration data from session
        session_start();
        if (!isset($_SESSION['registration_data']) || $_SESSION['registration_data']['email'] !== $email) {
            $pdo->rollBack();
            return ['success' => false, 'message' => 'Registration session expired. Please register again.'];
        }
        
        $registrationData = $_SESSION['registration_data'];
        
        // Save user data to resident_information table
        $stmt = $pdo->prepare("
            INSERT INTO resident_information (
                first_name, middle_name, last_name, suffix, email, age, sex, 
                birthday, civil_status, address, valid_id, id_image, email_verified, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())
        ");
        
        $stmt->execute([
            $registrationData['firstName'],
            $registrationData['middleName'],
            $registrationData['lastName'],
            $registrationData['suffix'],
            $registrationData['email'],
            $registrationData['age'],
            $registrationData['sex'],
            $registrationData['birthday'],
            $registrationData['status'],
            $registrationData['address'],
            $registrationData['validId'],
            $registrationData['idImageData']
        ]);
        
        $userId = $pdo->lastInsertId();
        
        // Delete the used OTP record
        $stmt = $pdo->prepare("DELETE FROM otp_verifications WHERE id = ?");
        $stmt->execute([$otpRecord['id']]);
        
        // Clear registration session data
        unset($_SESSION['registration_data']);
        
        // Commit transaction
        $pdo->commit();
        
        // Send welcome email
        try {
            require_once 'EmailSender.php';
            $emailSender = new EmailSender();
            $fullName = trim($registrationData['firstName'] . ' ' . $registrationData['middleName'] . ' ' . $registrationData['lastName']);
            $emailSender->sendWelcomeEmail($email, $fullName);
        } catch (Exception $e) {
            error_log("Welcome email sending failed: " . $e->getMessage());
            // Don't fail the verification if welcome email fails
        }
        
        // Log successful verification
        logVerificationAttempt($email, true, $_SERVER['REMOTE_ADDR'] ?? 'unknown');
        
        return [
            'success' => true,
            'message' => 'Email verified successfully! Your account has been created.',
            'user_id' => $userId
        ];
        
    } catch (PDOException $e) {
        $pdo->rollBack();
        error_log("OTP verification failed: " . $e->getMessage());
        return ['success' => false, 'message' => 'Verification failed. Please try again.'];
    }
}

// Log verification attempt
function logVerificationAttempt($email, $success, $ipAddress) {
    $pdo = getDBConnection();
    if (!$pdo) return;
    
    try {
        $stmt = $pdo->prepare("
            INSERT INTO registration_logs (email, success, ip_address, created_at) 
            VALUES (?, ?, ?, NOW())
        ");
        $stmt->execute([$email, $success ? 1 : 0, $ipAddress]);
    } catch (PDOException $e) {
        error_log("Failed to log verification attempt: " . $e->getMessage());
    }
}

try {
    // Process OTP verification
    $result = verifyOTPAndSaveUser($email, $verificationCode);

    // Clear any output buffer and return clean JSON response
    ob_clean();

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
    error_log("Email verification error: " . $e->getMessage());
    
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
