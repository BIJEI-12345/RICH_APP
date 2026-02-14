<?php
// Login processing script
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
if (!isset($input['login_type']) || !isset($input['credentials'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing required fields']);
    exit;
}

$loginType = $input['login_type'];
$credentials = $input['credentials'];

// Validate login type
if (!in_array($loginType, ['email', 'mobile'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid login type']);
    exit;
}

// Validate credentials based on login type
if ($loginType === 'email') {
    if (!filter_var($credentials, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid email format']);
        exit;
    }
} elseif ($loginType === 'mobile') {
    if (!preg_match('/^[0-9]{10}$/', $credentials)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid mobile number format']);
        exit;
    }
}

// Database connection 
function getDBConnection() {
    $host = "rich.cmxcoo6yc8nh.us-east-1.rds.amazonaws.com"; 
    $user = "admin";
    $pass = "4mazonb33j4y!";
    $db   = "rich_db";      // Siguraduhin na nagawa mo na ang database na ito sa phpMyAdmin
      
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

// Authenticate user
function authenticateUser($loginType, $credentials, $password = null) {
    $pdo = getDBConnection();
    if (!$pdo) {
        return ['success' => false, 'message' => 'Database connection failed'];
    }
    
    try {
        if ($loginType === 'email') {
            $stmt = $pdo->prepare("SELECT email, email_verified FROM resident_information WHERE email = ? AND email_verified = '1'");
            $stmt->execute([$credentials]);
        } else {
            $stmt = $pdo->prepare("SELECT email, email_verified FROM resident_information WHERE mobile = ? AND email_verified = '1'");
            $stmt->execute([$credentials]);
        }
        
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$user) {
            return ['success' => false, 'message' => 'User not found or account inactive'];
        }
        
        // Generate session token (in a real app, use proper JWT or session management)
        $sessionToken = bin2hex(random_bytes(32));
        
        // Store session (you might want to store this in a sessions table)
        $_SESSION['user_email'] = $user['email'];
        $_SESSION['session_token'] = $sessionToken;
        
        return [
            'success' => true,
            'message' => 'Login successful',
            'user' => [
                'email' => $user['email']
            ],
            'session_token' => $sessionToken
        ];
        
    } catch (PDOException $e) {
        error_log("Authentication error: " . $e->getMessage());
        return ['success' => false, 'message' => 'Authentication failed'];
    }
}

// Log login attempt
function logLoginAttempt($loginType, $credentials, $success, $ipAddress) {
    $pdo = getDBConnection();
    if (!$pdo) return;
    
    try {
        $stmt = $pdo->prepare("INSERT INTO login_logs (login_type, credentials, success, ip_address, created_at) VALUES (?, ?, ?, ?, NOW())");
        $stmt->execute([$loginType, $credentials, $success ? 1 : 0, $ipAddress]);
    } catch (PDOException $e) {
        error_log("Failed to log login attempt: " . $e->getMessage());
    }
}

// Start session
session_start();

// Get client IP
$ipAddress = $_SERVER['REMOTE_ADDR'] ?? 'unknown';

// Process login
$result = authenticateUser($loginType, $credentials);

// Log the attempt
logLoginAttempt($loginType, $credentials, $result['success'], $ipAddress);

// Return response
if ($result['success']) {
    http_response_code(200);
    echo json_encode($result);
} else {
    http_response_code(401);
    echo json_encode($result);
}


?>
