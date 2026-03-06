<?php
// Forgot MPIN - Verify OTP
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
if (!isset($input['email']) || !isset($input['otp'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Email and OTP are required']);
    exit;
}

$email = trim($input['email']);
$otp = trim($input['otp']);

// Validate email format
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid email format']);
    exit;
}

// Validate OTP format
if (!preg_match('/^\d{6}$/', $otp)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid OTP format']);
    exit;
}

// Database connection - Load from centralized config
require_once __DIR__ . '/env_loader.php';

// Verify OTP for forgot MPIN
function verifyForgotMpinOTP($email, $otp) {
    $pdo = getDBConnection();
    if (!$pdo) {
        return ['success' => false, 'message' => 'Database connection failed'];
    }
    
    try {
        // Check if OTP exists and is valid
        $stmt = $pdo->prepare("
            SELECT id, expires_at 
            FROM otp_verifications 
            WHERE email = ? AND verification_code = ? AND expires_at > NOW()
            ORDER BY created_at DESC 
            LIMIT 1
        ");
        
        $stmt->execute([$email, $otp]);
        $otpRecord = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$otpRecord) {
            return ['success' => false, 'message' => 'Invalid or expired OTP'];
        }
        
        // Check if email exists and is verified
        $stmt = $pdo->prepare("SELECT id FROM resident_information WHERE email = ? AND email_verified = 1");
        $stmt->execute([$email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$user) {
            return ['success' => false, 'message' => 'User not found or email not verified'];
        }
        
        // Delete the used OTP record
        $stmt = $pdo->prepare("DELETE FROM otp_verifications WHERE id = ?");
        $stmt->execute([$otpRecord['id']]);
        
        return [
            'success' => true,
            'message' => 'OTP verified successfully'
        ];
        
    } catch (PDOException $e) {
        error_log("Verify forgot MPIN OTP error: " . $e->getMessage());
        return ['success' => false, 'message' => 'OTP verification failed. Please try again.'];
    }
}

// Process request
$result = verifyForgotMpinOTP($email, $otp);

// Return response
if ($result['success']) {
    http_response_code(200);
    echo json_encode($result);
} else {
    http_response_code(400);
    echo json_encode($result);
}
?>

