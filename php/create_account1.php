<?php
// Start output buffering to prevent any HTML output
ob_start();

// Registration processing script
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

// Disable error display to prevent HTML output
ini_set('display_errors', 0);
ini_set('log_errors', 1);

// Only allow POST requests
if (!isset($_SERVER['REQUEST_METHOD']) || $_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

// Get form data (FormData)
$input = $_POST;

// Debug: Log received data
error_log("Received POST data: " . print_r($input, true));
error_log("Received FILES data: " . print_r($_FILES, true));
error_log("ValidId value: " . (isset($input['validId']) ? $input['validId'] : 'NOT SET'));

// Validate required fields
$requiredFields = ['firstName', 'lastName', 'email', 'age', 'sex', 'birthday', 'status', 'address', 'validId'];
foreach ($requiredFields as $field) {
    if (!isset($input[$field]) || $input[$field] === '' || $input[$field] === null) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => ucfirst($field) . ' is required']);
        exit;
    }
}

// Sanitize and validate input
$firstName = trim($input['firstName']);
$middleName = isset($input['middleName']) ? trim($input['middleName']) : '';
$lastName = trim($input['lastName']);
$suffix = isset($input['suffix']) ? trim($input['suffix']) : '';
$email = trim($input['email']);
$age = (int)$input['age'];
$sex = trim($input['sex']);
$birthday = trim($input['birthday']);
$status = trim($input['status']);
$address = trim($input['address']);
$validId = trim($input['validId']);
$hasNoMiddleName = isset($input['hasNoMiddleName']) ? (bool)$input['hasNoMiddleName'] : false;

// Handle image upload
$idImageData = null;
if (isset($_FILES['idImage']) && $_FILES['idImage']['error'] === UPLOAD_ERR_OK) {
    $imageFile = $_FILES['idImage'];
    
    // Validate image file
    $allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    $maxSize = 5 * 1024 * 1024; // 5MB
    
    if (in_array($imageFile['type'], $allowedTypes) && $imageFile['size'] <= $maxSize) {
        // Read image file and convert to binary data
        $idImageData = file_get_contents($imageFile['tmp_name']);
    } else {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid image file. Please upload JPG or PNG under 5MB']);
        exit;
    }
}

// Validate email format
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid email format']);
    exit;
}

// Validate names (only letters, spaces, hyphens, and apostrophes)
$namePattern = '/^[a-zA-Z\s\'-]+$/';
if (!preg_match($namePattern, $firstName)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'First name contains invalid characters']);
    exit;
}

if (!preg_match($namePattern, $lastName)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Last name contains invalid characters']);
    exit;
}

if (!empty($middleName) && !preg_match($namePattern, $middleName)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Middle name contains invalid characters']);
    exit;
}

// Validate age
if ($age < 18 || $age > 100) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Age must be between 18 and 100']);
    exit;
}

// Validate sex
if (!in_array($sex, ['Male', 'Female'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid sex selection']);
    exit;
}

// Validate birthday
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $birthday)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid birthday format']);
    exit;
}

// Validate civil status
if (!in_array($status, ['Single', 'Married', 'Divorced', 'Widowed'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid civil status']);
    exit;
}

// Validate address length
if (strlen($address) < 10) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Address must be at least 10 characters long']);
    exit;
}

// Validate valid ID
$validIdTypes = [
    'National ID', "Driver's License", 'Passport', 'SSS ID', 'GSIS ID', 'PhilHealth ID', 
    'TIN ID', 'Postal ID', "Voter's ID", 'Senior Citizen ID', 'OFW ID', 
    'National ID (PhilSys)', 'Barangay ID', 'Police Clearance', 'NBI Clearance'
];

if (!in_array($validId, $validIdTypes)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid valid ID type selected']);
    exit;
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

// Check if email already exists
function emailExists($email) {
    $pdo = getDBConnection();
    if (!$pdo) {
        return false;
    }
    
    try {
        $stmt = $pdo->prepare("SELECT id FROM resident_information WHERE email = ?");
        $stmt->execute([$email]);
        return $stmt->fetch() !== false;
    } catch (PDOException $e) {
        error_log("Email check failed: " . $e->getMessage());
        return false;
    }
}

// Generate verification token
function generateVerificationToken() {
    return bin2hex(random_bytes(32));
}

// Send OTP to email without storing any data
function sendOTPToEmail($firstName, $middleName, $lastName, $suffix, $email, $age, $sex, $birthday, $status, $address, $validId, $hasNoMiddleName, $idImageData) {
    $pdo = getDBConnection();
    if (!$pdo) {
        return ['success' => false, 'message' => 'Database connection failed'];
    }
    
    try {
        // Check if email already exists in resident_information
        if (emailExists($email)) {
            return ['success' => false, 'message' => 'Email address already registered'];
        }
        
        // Generate 6-digit verification code
        $verificationCode = str_pad(random_int(100000, 999999), 6, '0', STR_PAD_LEFT);
        
        // Delete any existing OTP records for this email
        $stmt = $pdo->prepare("DELETE FROM otp_verifications WHERE email = ?");
        $stmt->execute([$email]);
        
        // Store OTP in otp_verifications table (3 minutes expiration)
        $stmt = $pdo->prepare("
            INSERT INTO otp_verifications (
                email, 
                verification_code, 
                expires_at, 
                created_at
            ) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 3 MINUTE), NOW())
        ");
        
        $stmt->execute([$email, $verificationCode]);
        
        // Send verification email
        $fullName = trim($firstName . ' ' . $middleName . ' ' . $lastName);
        $emailResult = sendVerificationEmail($email, $verificationCode, $fullName);
        
        // Always log the OTP code for testing purposes
        error_log("=== OTP CODE FOR TESTING ===");
        error_log("Email: " . $email);
        error_log("OTP Code: " . $verificationCode);
        error_log("Full Name: " . $fullName);
        error_log("=============================");
        
        if (!$emailResult['success']) {
            // Log detailed error
            error_log("✗ Email sending failed during registration");
            error_log("  - Email: " . $email);
            error_log("  - Error: " . ($emailResult['error'] ?? $emailResult['message'] ?? 'Unknown error'));
            error_log("  - OTP Code: " . $verificationCode . " (for manual testing)");
            
            // Return error with OTP for development/testing
            return [
                'success' => false, 
                'message' => 'Failed to send verification email: ' . ($emailResult['message'] ?? 'Unknown error'),
                'error_details' => $emailResult['error'] ?? null,
                'otp_code' => $verificationCode // Include OTP for testing if email fails
            ];
        }
        
        // Store form data in session for later use after verification
        session_start();
        $_SESSION['registration_data'] = [
            'firstName' => $firstName,
            'middleName' => $middleName,
            'lastName' => $lastName,
            'suffix' => $suffix,
            'email' => $email,
            'age' => $age,
            'sex' => $sex,
            'birthday' => $birthday,
            'status' => $status,
            'address' => $address,
            'validId' => $validId,
            'hasNoMiddleName' => $hasNoMiddleName,
            'idImageData' => $idImageData
        ];
        
        return [
            'success' => true,
            'message' => 'Verification code sent to your email',
            'email' => $email,
            'verification_code' => $verificationCode // For testing purposes
        ];
        
    } catch (PDOException $e) {
        error_log("OTP sending failed: " . $e->getMessage());
        return ['success' => false, 'message' => 'Failed to send verification code. Please try again.'];
    }
}

// Log registration attempt
function logRegistrationAttempt($email, $success, $ipAddress) {
    $pdo = getDBConnection();
    if (!$pdo) return;
    
    try {
        $stmt = $pdo->prepare("
            INSERT INTO registration_logs (email, success, ip_address, created_at) 
            VALUES (?, ?, ?, NOW())
        ");
        $stmt->execute([$email, $success ? 1 : 0, $ipAddress]);
    } catch (PDOException $e) {
        error_log("Failed to log registration attempt: " . $e->getMessage());
    }
}

// Send verification email using EmailSender class
function sendVerificationEmail($email, $code, $fullName) {
    try {
        // Include the EmailSender class
        require_once 'EmailSender.php';
        
        // Create email sender instance
        $emailSender = new EmailSender();
        
        // Send OTP email
        $result = $emailSender->sendOTPEmail($email, $code, $fullName);
        
        // Log the result
        if ($result['success']) {
            error_log("Verification email sent successfully to: " . $email);
        } else {
            error_log("Failed to send verification email to: " . $email . " - Error: " . $result['message']);
        }
        
        // Always log the code for testing purposes
        error_log("VERIFICATION CODE FOR TESTING: " . $code);
        
        return $result;
        
    } catch (Exception $e) {
        error_log("Email sending error: " . $e->getMessage());
        error_log("VERIFICATION CODE FOR TESTING: " . $code);
        
        return [
            'success' => false,
            'message' => 'Email sending failed: ' . $e->getMessage()
        ];
    }
}

try {
    // Process registration (send OTP only, no data storage)
    $result = sendOTPToEmail($firstName, $middleName, $lastName, $suffix, $email, $age, $sex, $birthday, $status, $address, $validId, $hasNoMiddleName, $idImageData);

    // Clear any output buffer and return clean JSON response
    ob_clean();

    // Return response
    if ($result['success']) {
        http_response_code(201);
        echo json_encode($result);
    } else {
        http_response_code(400);
        echo json_encode($result);
    }

} catch (Exception $e) {
    // Clear any output buffer
    ob_clean();
    
    // Log error
    error_log("Registration error: " . $e->getMessage());
    
    // Return error response
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Server error occurred. Please try again.'
    ]);
}

// End output buffering
ob_end_flush();

// Example database schema (create these tables in your database):
/*
CREATE TABLE temp_registrations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    last_name VARCHAR(100) NOT NULL,
    suffix VARCHAR(10),
    email VARCHAR(255) NOT NULL,
    age INT NOT NULL,
    sex ENUM('Male', 'Female') NOT NULL,
    birthday DATE NOT NULL,
    civil_status ENUM('Single', 'Married', 'Divorced', 'Widowed') NOT NULL,
    address TEXT NOT NULL,
    id_image LONGBLOB,
    verification_code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE resident_information (
    id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    last_name VARCHAR(100) NOT NULL,
    suffix VARCHAR(10),
    email VARCHAR(255) UNIQUE NOT NULL,
    age INT NOT NULL,
    sex ENUM('Male', 'Female') NOT NULL,
    birthday DATE NOT NULL,
    civil_status ENUM('Single', 'Married', 'Divorced', 'Widowed') NOT NULL,
    address TEXT NOT NULL,
    valid_id VARCHAR(50) NOT NULL,
    id_image LONGBLOB,
    email_verified BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE registration_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    success BOOLEAN NOT NULL,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
*/
?>
