<?php
ob_start();

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed'
    ]);
    ob_end_flush();
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);

if (!is_array($input) || !isset($input['email'])) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Email is required'
    ]);
    ob_end_flush();
    exit;
}

$email = trim((string)$input['email']);

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Invalid email format'
    ]);
    ob_end_flush();
    exit;
}

require_once __DIR__ . '/env_loader.php';

try {
    $pdo = getDBConnection();
    if (!$pdo) {
        http_response_code(503);
        echo json_encode([
            'success' => false,
            'message' => 'Database connection failed'
        ]);
        ob_end_flush();
        exit;
    }

    $stmt = $pdo->prepare("SELECT id FROM resident_information WHERE email = ? LIMIT 1");
    $stmt->execute([$email]);
    $exists = (bool)$stmt->fetch(PDO::FETCH_ASSOC);

    echo json_encode([
        'success' => true,
        'available' => !$exists,
        'message' => $exists ? 'Email address already registered' : 'Email address is available'
    ]);
} catch (Throwable $e) {
    error_log('check_email_availability.php error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Server error occurred. Please try again.'
    ]);
}

ob_end_flush();
?>
