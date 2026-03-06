<?php
// MPIN Login verification script
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

// Check if input is valid JSON
if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid JSON input']);
    exit;
}

// Validate required fields
if (!isset($input['mpin']) || (!isset($input['email']) && !isset($input['mobile']))) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing required fields']);
    exit;
}

$mpin = $input['mpin'];
$email = $input['email'] ?? null;
$mobile = $input['mobile'] ?? null;

// Validate MPIN format
if (!preg_match('/^[0-9]{6}$/', $mpin)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid MPIN format']);
    exit;
}

// Validate email or mobile
if ($email && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid email format']);
    exit;
}

if ($mobile && !preg_match('/^[0-9]{10}$/', $mobile)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid mobile number format']);
    exit;
}

<<<<<<< HEAD
// Database connection
// Database connection - Load from centralized config
require_once __DIR__ . '/env_loader.php';
}
=======
// Database connection - Load from config
require_once(__DIR__ . '/config.php');
>>>>>>> 9fd9298ac44fc52b0333a0f2578e90264f9eb0ea

// Verify MPIN
function verifyMPIN($email, $mobile, $mpin) {
    $pdo = getDBConnection();
    if (!$pdo) {
        return ['success' => false, 'message' => 'Database connection failed'];
    }
    
    try {
        // Build query based on email or mobile
        if ($email) {
            $stmt = $pdo->prepare("SELECT email, mpin_password, email_verified FROM resident_information WHERE email = ? AND email_verified = 1");
            $stmt->execute([$email]);
        } else {
            $stmt = $pdo->prepare("SELECT email, mobile, mpin_password, email_verified FROM resident_information WHERE mobile = ? AND email_verified = 1");
            $stmt->execute([$mobile]);
        }
        
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$user) {
            return ['success' => false, 'message' => 'User not found or email not verified'];
        }
        
        // Verify MPIN
        if ($user['mpin_password'] !== $mpin) {
            return ['success' => false, 'message' => 'Invalid MPIN'];
        }
        
        // Generate session token
        $sessionToken = bin2hex(random_bytes(32));
        
        // Store session (you might want to store this in a sessions table)
        session_start();
        $_SESSION['user_email'] = $user['email'];
        if (isset($user['mobile'])) {
            $_SESSION['user_mobile'] = $user['mobile'];
        }
        $_SESSION['session_token'] = $sessionToken;
        
        return [
            'success' => true,
            'message' => 'MPIN verification successful',
            'user' => [
                'email' => $user['email'],
                'mobile' => $user['mobile'] ?? null
            ],
            'session_token' => $sessionToken
        ];
        
    } catch (PDOException $e) {
        error_log("MPIN verification error: " . $e->getMessage());
        return ['success' => false, 'message' => 'MPIN verification failed'];
    }
}

// Log MPIN attempt
function logMPINAttempt($email, $mobile, $success, $ipAddress) {
    $pdo = getDBConnection();
    if (!$pdo) return;
    
    try {
        $credentials = $email ? $email : $mobile;
        $loginType = $email ? 'email' : 'mobile';
        
        $stmt = $pdo->prepare("INSERT INTO login_logs (login_type, credentials, success, ip_address, created_at) VALUES (?, ?, ?, ?, NOW())");
        $stmt->execute([$loginType, $credentials, $success ? 1 : 0, $ipAddress]);
    } catch (PDOException $e) {
        error_log("Failed to log MPIN attempt: " . $e->getMessage());
    }
}

// Get client IP
$ipAddress = $_SERVER['REMOTE_ADDR'] ?? 'unknown';

// Process MPIN verification
$result = verifyMPIN($email, $mobile, $mpin);

// Log the attempt
logMPINAttempt($email, $mobile, $result['success'], $ipAddress);

// Return response
if ($result['success']) {
    http_response_code(200);
    echo json_encode($result);
} else {
    http_response_code(401);
    echo json_encode($result);
}
?>
