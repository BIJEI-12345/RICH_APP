<?php
// Verify OTP for email change and update email in resident_information
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
$code = isset($input['code']) ? trim($input['code']) : '';

if (!$oldEmail || !$newEmail || !$code) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Old email, new email, and code are required']);
    exit;
}

if (!filter_var($oldEmail, FILTER_VALIDATE_EMAIL) || !filter_var($newEmail, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid email format']);
    exit;
}

if (!preg_match('/^\d{6}$/', $code)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid code format']);
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

    // Ensure table exists
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

    $pdo->beginTransaction();

    // Verify OTP
    $stmt = $pdo->prepare("
        SELECT id
        FROM email_change_otps
        WHERE old_email = ? AND new_email = ? AND verification_code = ? AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1
    ");
    $stmt->execute([$oldEmail, $newEmail, $code]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        $pdo->rollBack();
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid or expired code']);
        exit;
    }

    // Ensure old email exists and new email still not used
    $stmt = $pdo->prepare("SELECT id FROM resident_information WHERE email = ? AND email_verified = 1");
    $stmt->execute([$oldEmail]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$user) {
        $pdo->rollBack();
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'User not found']);
        exit;
    }

    $stmt = $pdo->prepare("SELECT id FROM resident_information WHERE email = ? LIMIT 1");
    $stmt->execute([$newEmail]);
    if ($stmt->fetch()) {
        $pdo->rollBack();
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Email already in use']);
        exit;
    }

    // Update user email
    $stmt = $pdo->prepare("UPDATE resident_information SET email = ?, updated_at = NOW() WHERE email = ? AND email_verified = 1");
    $stmt->execute([$newEmail, $oldEmail]);

    // Delete OTP record
    $stmt = $pdo->prepare("DELETE FROM email_change_otps WHERE id = ?");
    $stmt->execute([$row['id']]);

    $pdo->commit();

    echo json_encode(['success' => true, 'message' => 'Email verified and updated']);
} catch (PDOException $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log("verify_email_change_otp DB error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Verification failed']);
}
?>

