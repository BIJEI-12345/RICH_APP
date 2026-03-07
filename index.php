<?php
// Handle login POST request first (before session_start to avoid output issues)
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Start output buffering FIRST to catch any output
    ob_start();
    
    // Start PHP session (after output buffering)
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    
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
        if ($error !== NULL && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_RECOVERABLE_ERROR])) {
            // Clear any output
            if (ob_get_level() > 0) {
                ob_clean();
            }
            
            // Log the error with full details
            $errorDetails = [
                'message' => $error['message'],
                'file' => $error['file'],
                'line' => $error['line'],
                'type' => $error['type']
            ];
            error_log("Fatal error in index.php: " . json_encode($errorDetails));
            
            // Return JSON error response
            if (!headers_sent()) {
                http_response_code(500);
                header('Content-Type: application/json');
            }
            echo json_encode([
                'success' => false,
                'message' => 'Server error occurred. Please check server logs for details.',
                'error_type' => 'fatal_error'
            ]);
            if (ob_get_level() > 0) {
                ob_end_flush();
            }
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
    $envLoaderPath = __DIR__ . '/php/env_loader.php';
    if (!file_exists($envLoaderPath)) {
        error_log("ERROR: env_loader.php not found at: " . $envLoaderPath);
        ob_clean();
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'Server configuration error. Configuration file not found.'
        ]);
        ob_end_flush();
        exit;
    }
    
    // Load the configuration file
    // Use include instead of require_once to catch errors better
    $envLoaderLoaded = false;
    try {
        ob_start(); // Start buffering to catch any output
        include $envLoaderPath;
        $output = ob_get_clean();
        if (!empty($output)) {
            error_log("Warning: env_loader.php produced output: " . $output);
        }
        $envLoaderLoaded = true;
    } catch (Throwable $e) {
        ob_end_clean();
        error_log("ERROR loading env_loader.php: " . $e->getMessage() . " in " . $e->getFile() . " on line " . $e->getLine());
        ob_clean();
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'Server configuration error. Please check server logs.'
        ]);
        ob_end_flush();
        exit;
    }
    
    // Verify that getDBConnection function exists
    if (!function_exists('getDBConnection')) {
        error_log("ERROR: getDBConnection function not found after loading env_loader.php");
        ob_clean();
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'Server configuration error. Database functions not available.'
        ]);
        ob_end_flush();
        exit;
    }
    
    // Authenticate user
    function authenticateUser($loginType, $credentials) {
        $pdo = getDBConnection();
        if (!$pdo) {
            // Check if .env file exists
            $envPath = __DIR__ . '/.env';
            $envExists = file_exists($envPath);
            
            if (!$envExists) {
                return ['success' => false, 'message' => 'Database configuration missing. Please create a .env file in the project root with DB_HOST, DB_USER, DB_PASS, and DB_NAME.'];
            }
            
            // Check which variables are missing
            $host = $_ENV['DB_HOST'] ?? getenv('DB_HOST') ?: null;
            $user = $_ENV['DB_USER'] ?? getenv('DB_USER') ?: null;
            $pass = $_ENV['DB_PASS'] ?? getenv('DB_PASS');
            $db   = $_ENV['DB_NAME'] ?? getenv('DB_NAME') ?: null;
            
            $missing = [];
            if (!$host) $missing[] = 'DB_HOST';
            if (!$user) $missing[] = 'DB_USER';
            if ($pass === null) $missing[] = 'DB_PASS'; // Only check if null, allow empty string
            if (!$db) $missing[] = 'DB_NAME';
            
            if (!empty($missing)) {
                $diagnosticUrl = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'] . dirname($_SERVER['SCRIPT_NAME']) . '/php/env_diagnostic.php';
                return [
                    'success' => false, 
                    'message' => 'Database configuration incomplete. Missing: ' . implode(', ', $missing) . '. Please check your .env file.',
                    'help' => 'Run diagnostic script to check .env file: ' . $diagnosticUrl,
                    'missing_variables' => $missing
                ];
            }
            
            // Try to get more specific error from logs or provide general guidance
            $errorMsg = 'Database connection failed. ';
            $errorMsg .= 'Please check: 1) MySQL is running in XAMPP, 2) Database exists, 3) Credentials in .env file are correct.';
            $errorMsg .= ' Check PHP error logs for details.';
            return ['success' => false, 'message' => $errorMsg];
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

// For non-POST requests (GET requests to show the login page)
// Start PHP session
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Check if user wants to logout/clear session (via ?logout=true parameter)
$logoutRequest = isset($_GET['logout']) && $_GET['logout'] === 'true';
if ($logoutRequest) {
    // Clear all session data
    $_SESSION = array();
    
    // Destroy session cookie if it exists
    if (isset($_COOKIE[session_name()])) {
        setcookie(session_name(), '', time() - 3600, '/');
    }
    
    // Destroy the session
    session_destroy();
    
    // Start a new session for the login page
    session_start();
}

// Check if user is already logged in via PHP session
// Allow bypass with ?force_login=true query parameter for testing
$forceLogin = isset($_GET['force_login']) && $_GET['force_login'] === 'true';

if (isset($_SESSION['user_email']) && !empty($_SESSION['user_email']) && !$forceLogin && !$logoutRequest) {
    // User is logged in, but sync sessionStorage first to prevent bootloop on mobile
    // Add a script to sync sessionStorage before redirect
    echo '<!DOCTYPE html><html><head><script>';
    echo 'sessionStorage.setItem("user_email", "' . htmlspecialchars($_SESSION['user_email'], ENT_QUOTES) . '");';
    echo 'window.location.href = "main_UI.html";';
    echo '</script></head><body></body></html>';
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
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <link rel="icon" type="image/jpg" href="Images/logo app 2.jpg">
    <title>RICH Login</title>
    <link rel="stylesheet" href="styles/login.css">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
    <!-- Loading Screen -->
    <div class="loading-screen">
        <div class="loading-content">
            <div class="logo-container">
                <div class="rotating-circle">
                    <img src="Images/cricle-removebg.png" alt="Loading Circle" class="circle-image">
                </div>
                <div class="fixed-text">
                    <img src="Images/no_bg_logo.png" alt="RICH Logo" class="text-image">
                </div>
            </div>
        </div>
    </div>

    <!-- Main Content -->
    <div id="mainContent" class="main-content">
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
