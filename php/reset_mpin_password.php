<?php
// Reset MPIN Password
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
if (!isset($input['email']) || !isset($input['mpin'])) {
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

// Validate MPIN format
if (!preg_match('/^[0-9]{6}$/', $mpin)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'MPIN must be 6 digits']);
    exit;
}

// Database connection - Load from config
require_once(__DIR__ . '/config.php');

// Reset MPIN password
function resetMpinPassword($email, $mpin) {
    $pdo = getDBConnection();
    if (!$pdo) {
        return ['success' => false, 'message' => 'Database connection failed'];
    }
    
    try {
        // Check if email exists and is verified
        $stmt = $pdo->prepare("SELECT id FROM resident_information WHERE email = ? AND email_verified = 1");
        $stmt->execute([$email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$user) {
            return ['success' => false, 'message' => 'User not found or email not verified'];
        }
        
        // Update MPIN password
        $stmt = $pdo->prepare("
            UPDATE resident_information 
            SET mpin_password = ?, updated_at = NOW() 
            WHERE email = ? AND email_verified = 1
        ");
        
        $result = $stmt->execute([$mpin, $email]);
        
        if ($result) {
            error_log("MPIN reset successfully for email: " . $email);
            return [
                'success' => true,
                'message' => 'MPIN reset successfully'
            ];
        } else {
            return ['success' => false, 'message' => 'Failed to reset MPIN'];
        }
        
    } catch (PDOException $e) {
        error_log("Reset MPIN password error: " . $e->getMessage());
        return ['success' => false, 'message' => 'Failed to reset MPIN. Please try again.'];
    }
}

// Process request
$result = resetMpinPassword($email, $mpin);

// Return response
if ($result['success']) {
    http_response_code(200);
    echo json_encode($result);
} else {
    http_response_code(400);
    echo json_encode($result);
}
?>

