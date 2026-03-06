<?php
// Forgot MPIN - Send OTP
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

// Get JSON input
$input = json_decode(file_get_contents('php://input'), true);

// Validate required fields
if (!isset($input['email'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Email is required']);
    exit;
}

$email = trim($input['email']);

// Validate email format
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid email format']);
    exit;
}

<<<<<<< HEAD
// Database connection
// Database connection - Load from centralized config
require_once __DIR__ . '/env_loader.php';
=======
// Database connection - Load from config
require_once(__DIR__ . '/config.php');
>>>>>>> 9fd9298ac44fc52b0333a0f2578e90264f9eb0ea

// Send OTP for forgot MPIN
function sendForgotMpinOTP($email) {
    $pdo = getDBConnection();
    if (!$pdo) {
        return ['success' => false, 'message' => 'Database connection failed'];
    }
    
    try {
        // Check if email exists and is verified
        $stmt = $pdo->prepare("SELECT id, first_name, last_name FROM resident_information WHERE email = ? AND email_verified = 1");
        $stmt->execute([$email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$user) {
            return ['success' => false, 'message' => 'Email not found or not verified'];
        }
        
        // Generate 6-digit verification code
        $verificationCode = str_pad(random_int(100000, 999999), 6, '0', STR_PAD_LEFT);
        
        // Delete any existing OTP records for this email
        $stmt = $pdo->prepare("DELETE FROM otp_verifications WHERE email = ?");
        $stmt->execute([$email]);
        
        // Store OTP in otp_verifications table (3 minutes expiration)
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
        $fullName = trim($user['first_name'] . ' ' . $user['last_name']);
        require_once 'EmailSender.php';
        $emailSender = new EmailSender();
        $emailResult = $emailSender->sendOTPEmail($email, $verificationCode, $fullName);
        
        // Always log the OTP code for testing purposes
        error_log("=== FORGOT MPIN OTP CODE FOR TESTING ===");
        error_log("Email: " . $email);
        error_log("OTP Code: " . $verificationCode);
        error_log("Full Name: " . $fullName);
        error_log("=========================================");
        
        if ($emailResult['success']) {
            return [
                'success' => true,
                'message' => 'OTP sent successfully to your email',
                'otp_code' => $verificationCode // For testing
            ];
        } else {
            // Still return success if OTP is stored, even if email fails
            // The OTP is logged for testing
            return [
                'success' => true,
                'message' => 'OTP generated. Please check server logs for OTP code.',
                'otp_code' => $verificationCode // For testing
            ];
        }
        
    } catch (PDOException $e) {
        error_log("Send forgot MPIN OTP error: " . $e->getMessage());
        return ['success' => false, 'message' => 'Failed to send OTP. Please try again.'];
    }
}

// Process request
$result = sendForgotMpinOTP($email);

// Return response
if ($result['success']) {
    http_response_code(200);
    echo json_encode($result);
} else {
    http_response_code(400);
    echo json_encode($result);
}
?>

