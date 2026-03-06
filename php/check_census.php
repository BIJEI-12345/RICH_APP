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
// Database connection - Load from centralized config
require_once __DIR__ . '/env_loader.php';

try {
    $pdo = getDBConnection();
    if ($pdo) {
        // Set MySQL timezone to Philippine time (UTC+8)
        $pdo->exec("SET time_zone = '+08:00'");
    }
    
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
    
    // Get user's last name and address from resident_information
    $stmt = $pdo->prepare("SELECT last_name, address FROM resident_information WHERE id = ?");
    $stmt->execute([$userId]);
    $userInfo = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$userInfo) {
        echo json_encode([
            'success' => true,
            'emailExists' => true,
            'hasCompletedCensus' => false,
            'isAlreadyCensused' => false
        ]);
        exit;
    }
    
    $userLastName = trim($userInfo['last_name']);
    $userAddress = trim($userInfo['address']);
    
    // Extract house number from user's address (first part before comma)
    $userHouseNumber = '';
    if (!empty($userAddress)) {
        $addressParts = explode(',', $userAddress);
        if (count($addressParts) > 0) {
            $userHouseNumber = trim($addressParts[0]);
        }
    }
    
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
        // First, check if census exists for this user (using census_id which references resident_information.id)
        $stmt = $pdo->prepare("SELECT id FROM census_form WHERE census_id = ? LIMIT 1");
        $stmt->execute([$userId]);
        $census = $stmt->fetch(PDO::FETCH_ASSOC);
        
        $hasCompletedCensus = $census !== false;
        
        // Check if user's last name + house number matches any existing census record
        // This checks if someone else with same last name + house number already completed census
        // Exclude the user's own census record (if they have one)
        $isAlreadyCensused = false;
        if (!empty($userLastName) && !empty($userHouseNumber)) {
            // Get all census records (excluding user's own record) and check if any match last name + house number
            $stmt = $pdo->prepare("SELECT id, last_name, complete_address FROM census_form WHERE census_id != ?");
            $stmt->execute([$userId]);
            $allCensusRecords = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            foreach ($allCensusRecords as $record) {
                $censusLastName = trim($record['last_name']);
                $censusAddress = trim($record['complete_address']);
                
                // Extract house number from census address
                $censusHouseNumber = '';
                if (!empty($censusAddress)) {
                    $censusAddressParts = explode(',', $censusAddress);
                    if (count($censusAddressParts) > 0) {
                        $censusHouseNumber = trim($censusAddressParts[0]);
                    }
                }
                
                // Check if last name and house number match (case-insensitive)
                if (strcasecmp($userLastName, $censusLastName) === 0 && 
                    strcasecmp($userHouseNumber, $censusHouseNumber) === 0) {
                    $isAlreadyCensused = true;
                    break;
                }
            }
        }
        
        echo json_encode([
            'success' => true,
            'emailExists' => true,
            'hasCompletedCensus' => $hasCompletedCensus,
            'isAlreadyCensused' => $isAlreadyCensused
        ]);
    } else {
        // Census table doesn't exist yet - email exists but no census data
        echo json_encode([
            'success' => true,
            'emailExists' => true,
            'hasCompletedCensus' => false,
            'isAlreadyCensused' => false,
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

