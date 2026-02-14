<?php
// Submit Census API - Handle census form submission
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
$requiredFields = ['firstName', 'lastName', 'age', 'sex', 'birthday', 'civilStatus', 'address'];
foreach ($requiredFields as $field) {
    if (empty($input[$field])) {
        echo json_encode([
            'success' => false,
            'message' => "Please fill in all required fields. Missing: $field"
        ]);
        exit;
    }
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
        echo json_encode([
            'success' => false,
            'message' => 'Database connection failed. Please try again later.'
        ]);
        exit;
    }
    
    // Get user email from session storage (passed from frontend or get from session)
    // We need to get the user's ID from resident_information table
    // First, try to get email from the request (frontend should include it)
    $userEmail = null;
    
    // Check if email is in the input (frontend should send it)
    // If not, we'll need to get it from session or request it
    // For now, we'll need the frontend to send the email
    
    // Check if census_form table exists
    $tableExists = false;
    try {
        $checkTable = $pdo->query("SHOW TABLES LIKE 'census_form'");
        $tableExists = $checkTable->rowCount() > 0;
    } catch (PDOException $e) {
        $tableExists = false;
    }
    
    if (!$tableExists) {
        error_log("Census form table 'census_form' does not exist. Data: " . json_encode($input));
        echo json_encode([
            'success' => false,
            'message' => 'Census form table does not exist. Please contact administrator.'
        ]);
        exit;
    }
    
    // Get user email from session or from the logged-in user
    // Since we're using email-based auth, we need to get it from somewhere
    // Option 1: Frontend sends email in the request
    // Option 2: Get from session
    session_start();
    $userEmail = $input['email'] ?? $_SESSION['user_email'] ?? null;
    
    if (empty($userEmail)) {
        echo json_encode([
            'success' => false,
            'message' => 'User email is required. Please ensure you are logged in.'
        ]);
        exit;
    }
    
    // Get user_id (census_id) from resident_information table
    $stmt = $pdo->prepare("SELECT id FROM resident_information WHERE email = ?");
    $stmt->execute([$userEmail]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$user) {
        // User not in resident_information table - create entry first
        // Insert basic user info into resident_information
        $stmt = $pdo->prepare("INSERT INTO resident_information 
            (first_name, middle_name, last_name, suffix, email, age, sex, birthday, civil_status, address, email_verified) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)");
        
        $stmt->execute([
            $input['firstName'],
            $input['middleName'] ?? null,
            $input['lastName'],
            $input['suffix'] ?? null,
            $userEmail,
            $input['age'],
            $input['sex'],
            $input['birthday'],
            $input['civilStatus'],
            $input['address']
        ]);
        
        $censusId = $pdo->lastInsertId();
        error_log("Created new resident_information entry with ID: $censusId for email: $userEmail");
    } else {
        $censusId = $user['id'];
        
        // Update resident_information with latest census data (in case info changed)
        $stmt = $pdo->prepare("UPDATE resident_information SET 
            first_name = ?, 
            middle_name = ?, 
            last_name = ?, 
            age = ?, 
            sex = ?, 
            birthday = ?, 
            civil_status = ?, 
            address = ?
            WHERE id = ?");
        
        $stmt->execute([
            $input['firstName'],
            $input['middleName'] ?? null,
            $input['lastName'],
            $input['age'],
            $input['sex'],
            $input['birthday'],
            $input['civilStatus'],
            $input['address'],
            $censusId
        ]);
        
        // Check if user already submitted census
        $stmt = $pdo->prepare("SELECT id FROM census_form WHERE census_id = ? LIMIT 1");
        $stmt->execute([$censusId]);
        $existingCensus = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($existingCensus) {
            echo json_encode([
                'success' => false,
                'message' => 'You have already submitted the census form'
            ]);
            exit;
        }
    }
    
    // Start transaction for multiple inserts (main person + household members)
    $pdo->beginTransaction();
    
    try {
        // Insert main person's census data (head of household)
        // Use familyOccupation from form, or default to 'Head of Household' if not provided
        $familyOccupation = $input['familyOccupation'] ?? 'Head of Household';
        
        $stmt = $pdo->prepare("INSERT INTO census_form 
            (census_id, first_name, last_name, middle_name, suffix, age, sex, birthday, 
             civil_status, contact_number, occupation, place_of_work, 
             barangay_supported_benefits, complete_address, relation_to_household) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        
        $stmt->execute([
            $censusId,
            $input['firstName'],
            $input['lastName'],
            $input['middleName'] ?? null,
            $input['suffix'] ?? null,
            $input['age'],
            $input['sex'],
            $input['birthday'],
            $input['civilStatus'],
            $input['contactNumber'] ?? null,
            $input['occupation'] ?? null,
            $input['placeOfWork'] ?? null,
            $input['claimedBenefits'] ?? null,
            $input['address'],
            $familyOccupation // Family occupation/relation from form
        ]);
        
        $mainRecordId = $pdo->lastInsertId();
        error_log("Inserted main census record with ID: $mainRecordId for census_id: $censusId");
        
        // Insert household members
        // Each household member gets their own record with their own information
        // They share the same census_id to link them to the main person
        $householdMembers = $input['householdMembers'] ?? [];
        $insertedMembers = 0;
        
        foreach ($householdMembers as $member) {
            // Check if required fields (firstName and lastName) are provided
            if (empty($member['firstName']) || empty(trim($member['firstName'])) ||
                empty($member['lastName']) || empty(trim($member['lastName']))) {
                continue; // Skip members without required name fields
            }
            
            // Use separate firstName, middleName, and lastName fields
            $memberFirstName = trim($member['firstName']);
            $memberLastName = trim($member['lastName']);
            $memberMiddleName = !empty($member['middleName']) ? trim($member['middleName']) : null;
            
            $stmt = $pdo->prepare("INSERT INTO census_form 
                (census_id, first_name, last_name, middle_name, suffix, age, sex, birthday, 
                 civil_status, contact_number, occupation, place_of_work, 
                 barangay_supported_benefits, complete_address, relation_to_household) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            
            $stmt->execute([
                $censusId, // Same census_id (links to main person/household)
                $memberFirstName, // Household member's first name
                $memberLastName, // Household member's last name
                $memberMiddleName, // Household member's middle name
                null, // Suffix not collected for household members
                $member['age'] ?? null, // Household member's age
                $member['sex'] ?? null, // Household member's sex
                $member['birthday'] ?? null, // Household member's birthday
                $member['civilStatus'] ?? null, // Household member's civil status
                null, // Contact number not collected for household members
                $member['work'] ?? null, // Household member's occupation
                $member['placeOfWork'] ?? null, // Household member's place of work
                $member['benefits'] ?? null, // Household member's benefits
                $input['address'], // Same address as main person
                $member['relation'] ?? null // Relation to household head
            ]);
            
            $insertedMembers++;
            $fullName = trim($memberFirstName . ' ' . ($memberMiddleName ? $memberMiddleName . ' ' : '') . $memberLastName);
            error_log("Inserted household member record for: " . $fullName);
        }
        
        // Commit transaction
        $pdo->commit();
        
        error_log("Census form submitted successfully. Main record ID: $mainRecordId, Household members: $insertedMembers");
        
        echo json_encode([
            'success' => true,
            'message' => 'Census form submitted successfully',
            'main_record_id' => $mainRecordId,
            'household_members_count' => $insertedMembers
        ]);
        
    } catch (PDOException $e) {
        // Rollback on error
        $pdo->rollBack();
        error_log("Error inserting census data: " . $e->getMessage());
        throw $e;
    }
    
} catch (PDOException $e) {
    error_log("Error submitting census form: " . $e->getMessage());
    echo json_encode([
        'success' => false,
        'message' => 'An error occurred while submitting the form. Please try again later.'
    ]);
}
?>

