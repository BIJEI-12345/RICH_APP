<?php
// Check Census Status API - Check if user has completed census
// Set Philippine Timezone
date_default_timezone_set('Asia/Manila');

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
if (!isset($input['email'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Email is required']);
    exit;
}

$email = trim($input['email']);

// Validate email format
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid email format']);
    exit;
}

// Database connection function
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
        // Set MySQL timezone to Philippine time (UTC+8)
        $pdo->exec("SET time_zone = '+08:00'");
        return $pdo;
    } catch (PDOException $e) {
        error_log("Database connection failed: " . $e->getMessage());
        return null;
    }
}

try {
    $pdo = getDBConnection();
    
    if (!$pdo) {
        // If database connection fails, return false (show modal)
        echo json_encode([
            'success' => true,
            'hasCompletedCensus' => false,
            'message' => 'Database connection failed, showing modal'
        ]);
        exit;
    }
    
    // Check if email exists in resident_information table
    $stmt = $pdo->prepare("SELECT id FROM resident_information WHERE email = ?");
    $stmt->execute([$email]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$user) {
        // Email NOT in resident_information table - show census form
        echo json_encode([
            'success' => true,
            'emailExists' => false,
            'hasCompletedCensus' => false,
            'message' => 'Email not found in resident_information table'
        ]);
        exit;
    }
    
    // Email exists in resident_information table
    $userId = $user['id'];
    
    // Check if census_form table exists (singular, not plural)
    $tableExists = false;
    try {
        $checkTable = $pdo->query("SHOW TABLES LIKE 'census_form'");
        $tableExists = $checkTable->rowCount() > 0;
    } catch (PDOException $e) {
        // Table doesn't exist yet
        $tableExists = false;
    }
    
    if ($tableExists) {
        // Check if census exists for this user (using census_id which references resident_information.id)
        $stmt = $pdo->prepare("SELECT id FROM census_form WHERE census_id = ? LIMIT 1");
        $stmt->execute([$userId]);
        $census = $stmt->fetch(PDO::FETCH_ASSOC);
        
        echo json_encode([
            'success' => true,
            'emailExists' => true,
            'hasCompletedCensus' => $census !== false
        ]);
    } else {
        // Census table doesn't exist yet - email exists but no census data
        echo json_encode([
            'success' => true,
            'emailExists' => true,
            'hasCompletedCensus' => false,
            'message' => 'Census table not yet created'
        ]);
    }
    
} catch (PDOException $e) {
    error_log("Error checking census status: " . $e->getMessage());
    // On error, return false (show modal)
    echo json_encode([
        'success' => true,
        'hasCompletedCensus' => false,
        'message' => 'Database error occurred'
    ]);
}
?>

