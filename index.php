<?php
// Start PHP session
session_start();

// Check if user is already logged in via PHP session
if (isset($_SESSION['user_email']) && !empty($_SESSION['user_email'])) {
    // User is logged in, redirect to main UI
    header('Location: main_UI.html');
    exit;
}

// Handle login POST request
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Start output buffering to prevent any HTML output
    ob_start();
    
    // Set JSON headers
    header('Content-Type: application/json');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: POST');
    header('Access-Control-Allow-Headers: Content-Type');
    
    // Disable error display to prevent HTML output
    ini_set('display_errors', 0);
    ini_set('log_errors', 1);
    
    // Register shutdown function to catch fatal errors and ensure JSON response
    register_shutdown_function(function() {
        $error = error_get_last();
        if ($error !== NULL && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
            // Clear any output
            ob_clean();
            
            // Log the error
            error_log("Fatal error in index.php: " . $error['message'] . " in " . $error['file'] . " on line " . $error['line']);
            
            // Return JSON error response
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Server error occurred. Please try again.'
            ]);
            ob_end_flush();
            exit;
        }
    });
    
    try {
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
    
    // Database connection - Load from centralized config
    require_once __DIR__ . '/php/env_loader.php';
    
    // Authenticate user
    function authenticateUser($loginType, $credentials) {
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
            
            // Generate session token
            $sessionToken = bin2hex(random_bytes(32));
            
            // Store session
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
    
        // Get client IP
        $ipAddress = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        
        // Process login
        $result = authenticateUser($loginType, $credentials);
        
        // Log the attempt
        logLoginAttempt($loginType, $credentials, $result['success'], $ipAddress);
        
        // Clear any output buffer and return clean JSON response
        ob_clean();
        
        // Return response
        if ($result['success']) {
            http_response_code(200);
            echo json_encode($result);
        } else {
            http_response_code(401);
            echo json_encode($result);
        }
        
    } catch (Exception $e) {
        // Clear any output buffer
        ob_clean();
        
        // Log error
        error_log("Login error: " . $e->getMessage());
        
        // Return error response
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'Server error occurred. Please try again.'
        ]);
    }
    
    // End output buffering
    ob_end_flush();
    exit;
}

// Check if user is logged in via sessionStorage (client-side check will be done in JS)
// But we can set some PHP variables for use in the page if needed
$isLoggedIn = isset($_SESSION['user_email']);
$userEmail = $_SESSION['user_email'] ?? '';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" type="image/jpg" href="Images/logo app 2.jpg">
    <title>RICH Login</title>
    <link rel="stylesheet" href="styles/login.css">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
    <!-- Loading Screen -->
    <div id="loadingScreen" class="loading-screen">
        <div class="loading-content">
            <div class="logo-container">
                <div class="rotating-circle">
                    <img src="Images/cricle.png" alt="Loading Circle" class="circle-image">
                </div>
                <div class="fixed-text">
                    <img src="Images/text.png" alt="RICH Text" class="text-image">
                </div>
            </div>
        </div>
    </div>

    <!-- Main Content (hidden initially) -->
    <div id="mainContent" class="main-content" style="display: none;">
        <div class="container">
            <div class="login-card">
                <!-- Header -->
                <div class="header">
                    <h1 class="welcome-text">Hello, Welcome!</h1>
                    <p class="app-name">Login to <span class="egov">RICH</span><span class="ph"> Bigte</span></p>
                </div>

                <!-- Login Forms -->
                <div class="forms-container">
                    <!-- Email Login Form -->
                    <form id="emailForm" class="login-form active">
                        <div class="input-group">
                            <input type="email" id="email" placeholder="Email Address" required>
                        </div>
                        <button type="submit" class="login-btn">Login</button>
                    </form>
                </div>

                <!-- Separator -->
                <div class="separator">
                    <div class="line"></div>
                    <span class="or-text">or</span>
                    <div class="line"></div>
                </div>

                <!-- Create Account -->
                <div class="create-account">
                    <p class="account-text">Don't have RICH account yet?</p>
                    <button class="create-btn">Create new account</button>
                </div>
            </div>
        </div>
    </div>

    <script src="js/login.js"></script>
</body>
</html>
