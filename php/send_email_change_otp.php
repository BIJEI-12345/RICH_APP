<?php
// Send OTP for email change verification — stores in otp_verifications (same as other OTP flows)
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

    $stmt = $pdo->prepare("SELECT first_name, last_name, email_verified FROM resident_information WHERE email = ? AND email_verified = 1");
    $stmt->execute([$oldEmail]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$user) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'User not found or email not verified']);
        exit;
    }

    $stmt = $pdo->prepare("SELECT id FROM resident_information WHERE email = ? LIMIT 1");
    $stmt->execute([$newEmail]);
    if ($stmt->fetch()) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Email already in use']);
        exit;
    }

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS otp_verifications (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(255) NOT NULL,
            verification_code VARCHAR(16) NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_otp_email (email),
            INDEX idx_otp_expires (expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $code = str_pad(random_int(100000, 999999), 6, '0', STR_PAD_LEFT);

    // OTP is for the NEW address (where we send the email)
    $stmt = $pdo->prepare('DELETE FROM otp_verifications WHERE email = ?');
    $stmt->execute([$newEmail]);

    $stmt = $pdo->prepare('
        INSERT INTO otp_verifications (email, verification_code, expires_at, created_at)
        VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 3 MINUTE), NOW())
    ');
    $stmt->execute([$newEmail, $code]);

    $fullName = trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? ''));
    if ($fullName === '') {
        $fullName = 'Resident';
    }

    $emailResult = null;
    try {
        require_once __DIR__ . '/EmailSender.php';
        $sender = new EmailSender();
        $emailResult = $sender->sendEmailChangeOTPEmail($newEmail, $code, $fullName);
    } catch (Exception $e) {
        error_log('send_email_change_otp EmailSender: ' . $e->getMessage());
        $emailResult = [
            'success' => false,
            'message' => 'Email could not be sent: ' . $e->getMessage(),
            'error' => $e->getMessage(),
        ];
    }

    $sent = $emailResult && !empty($emailResult['success']);

    // If SMTP failed or is not configured, try PHP mail() (works on some XAMPP setups when sendmail is set)
    if (!$sent && function_exists('mail')) {
        $from = $_ENV['SMTP_FROM_EMAIL'] ?? getenv('SMTP_FROM_EMAIL') ?: 'noreply@localhost';
        $subject = 'RICH APP — OTP to change your email';
        $plain = "Hello {$fullName},\r\n\r\nThis OTP to change your email in RICH APP.\r\n\r\nYour 6-digit code: {$code}\r\n\r\nThe OTP will expire in 3 minutes.\r\n";
        $headers = 'From: ' . $from . "\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n";
        if (@mail($newEmail, $subject, $plain, $headers)) {
            $sent = true;
            $emailResult = [
                'success' => true,
                'message' => 'Verification code sent to your new email',
            ];
            error_log('send_email_change_otp: delivered via PHP mail() to ' . $newEmail);
        }
    }

    $errMsg = $emailResult['error'] ?? ($emailResult['message'] ?? 'Unknown error');

    echo json_encode([
        'success' => true,
        'message' => $sent
            ? ($emailResult['message'] ?? 'Verification code sent to your new email')
            : ('OTP saved. Email not delivered — configure SMTP in .env or enable sendmail (' . $errMsg . '). Check server logs for the code.'),
        'email_sent' => $sent,
        'otp_code' => $code,
    ]);

    if (!$sent) {
        error_log('send_email_change_otp: all delivery methods failed for new email; OTP in otp_verifications. ' . $errMsg);
    }
} catch (PDOException $e) {
    error_log('send_email_change_otp DB error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Failed to send verification code']);
}
