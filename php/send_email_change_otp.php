<?php
// Send OTP for email change verification
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['success' => true]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid JSON input']);
    exit;
}

$oldEmail = isset($input['oldEmail']) ? trim($input['oldEmail']) : '';
$newEmail = isset($input['newEmail']) ? trim($input['newEmail']) : '';

if (!$oldEmail || !$newEmail) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Old email and new email are required']);
    exit;
}

if (!filter_var($oldEmail, FILTER_VALIDATE_EMAIL) || !filter_var($newEmail, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid email format']);
    exit;
}

if (strtolower($oldEmail) === strtolower($newEmail)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'New email must be different']);
    exit;
}

require_once __DIR__ . '/env_loader.php';

try {
    $pdo = getDBConnection();
    if (!$pdo) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database connection failed']);
        exit;
    }

    // Ensure user exists with old email
    $stmt = $pdo->prepare("SELECT first_name, last_name, email_verified FROM resident_information WHERE email = ? AND email_verified = 1");
    $stmt->execute([$oldEmail]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$user) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'User not found or email not verified']);
        exit;
    }

    // Ensure new email not already in use
    $stmt = $pdo->prepare("SELECT id FROM resident_information WHERE email = ? LIMIT 1");
    $stmt->execute([$newEmail]);
    if ($stmt->fetch()) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Email already in use']);
        exit;
    }

    // Create email change otp table if missing
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS email_change_otps (
            id INT AUTO_INCREMENT PRIMARY KEY,
            old_email VARCHAR(255) NOT NULL,
            new_email VARCHAR(255) NOT NULL,
            verification_code VARCHAR(6) NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_old_email (old_email),
            INDEX idx_new_email (new_email)
        )
    ");

    // Generate OTP and store (3 min)
    $code = str_pad(random_int(100000, 999999), 6, '0', STR_PAD_LEFT);

    // Delete any previous pending records for this old/new combo
    $stmt = $pdo->prepare("DELETE FROM email_change_otps WHERE old_email = ? OR new_email = ?");
    $stmt->execute([$oldEmail, $newEmail]);

    $stmt = $pdo->prepare("
        INSERT INTO email_change_otps (old_email, new_email, verification_code, expires_at, created_at)
        VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 3 MINUTE), NOW())
    ");
    $stmt->execute([$oldEmail, $newEmail, $code]);

    // Send email to new address
    require_once __DIR__ . '/EmailSender.php';
    $sender = new EmailSender();
    $fullName = trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? ''));
    $emailResult = $sender->sendOTPEmail($newEmail, $code, $fullName ?: 'Resident');

    // Always log code for testing
    error_log("=== EMAIL CHANGE OTP CODE FOR TESTING ===");
    error_log("Old Email: " . $oldEmail);
    error_log("New Email: " . $newEmail);
    error_log("OTP Code: " . $code);
    error_log("========================================");

    // Even if email fails, keep it as success (code stored + logged)
    echo json_encode([
        'success' => true,
        'message' => $emailResult['success'] ? 'Verification code sent to your new email' : 'Code generated. Please check server logs for the code.',
        'otp_code' => $code // for testing
    ]);
} catch (PDOException $e) {
    error_log("send_email_change_otp DB error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Failed to send verification code']);
}
?>

