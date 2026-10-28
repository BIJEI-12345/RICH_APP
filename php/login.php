<?php
// Login API endpoint
ini_set('display_errors', 0);
ini_set('log_errors', 1);
header('Content-Type: application/json');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$input = json_decode(file_get_contents('php://input'), true);
if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid JSON input']);
    exit;
}

if (!isset($input['login_type'], $input['credentials'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing required fields']);
    exit;
}

$loginType = $input['login_type'];
$credentials = trim($input['credentials']);

if (!in_array($loginType, ['email', 'mobile'], true)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid login type']);
    exit;
}

if ($loginType === 'email' && !filter_var($credentials, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid email format']);
    exit;
}

if ($loginType === 'mobile' && !preg_match('/^[0-9]{10}$/', $credentials)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid mobile number format']);
    exit;
}

require_once __DIR__ . '/env_loader.php';

function authenticateUser($loginType, $credentials) {
    $pdo = getDBConnection();
    if (!$pdo) {
        return ['success' => false, 'message' => 'Database connection failed'];
    }

    try {
        if ($loginType === 'email') {
            $stmt = $pdo->prepare("SELECT email, email_verified FROM resident_information WHERE email = ? AND email_verified::text IN ('1', 'true', 't')");
            $stmt->execute([$credentials]);
        } else {
            $stmt = $pdo->prepare("SELECT email, email_verified FROM resident_information WHERE mobile = ? AND email_verified::text IN ('1', 'true', 't')");
            $stmt->execute([$credentials]);
        }

        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$user) {
            return ['success' => false, 'message' => 'User not found or account inactive'];
        }

        $sessionToken = bin2hex(random_bytes(32));
        $_SESSION['user_email'] = $user['email'];
        $_SESSION['session_token'] = $sessionToken;

        return [
            'success' => true,
            'message' => 'Login successful',
            'user' => ['email' => $user['email']],
            'session_token' => $sessionToken
        ];
    } catch (PDOException $e) {
        error_log('Authentication error: ' . $e->getMessage());
        return ['success' => false, 'message' => 'Authentication failed'];
    }
}

function logLoginAttempt($loginType, $credentials, $success, $ipAddress) {
    $pdo = getDBConnection();
    if (!$pdo) {
        return;
    }

    try {
        $stmt = $pdo->prepare("INSERT INTO login_logs (login_type, credentials, success, ip_address, created_at) VALUES (?, ?, ?, ?, NOW())");
        $stmt->execute([$loginType, $credentials, $success ? 1 : 0, $ipAddress]);
    } catch (PDOException $e) {
        error_log('Failed to log login attempt: ' . $e->getMessage());
    }
}

$ipAddress = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$result = authenticateUser($loginType, $credentials);
logLoginAttempt($loginType, $credentials, $result['success'], $ipAddress);

http_response_code($result['success'] ? 200 : 401);
echo json_encode($result);
