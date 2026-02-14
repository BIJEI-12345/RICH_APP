<?php
// Update profile endpoint
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

// Get email from POST data
$email = isset($_POST['email']) ? trim($_POST['email']) : '';

if (empty($email)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Email is required']);
    exit;
}

// Database connection
try {
    $host = "rich.cmxcoo6yc8nh.us-east-1.rds.amazonaws.com"; 
    $user = "admin";
    $pass = "4mazonb33j4y!";
    $db   = "rich_db";        // Siguraduhin na nagawa mo na ang database na ito sa phpMyAdmin
      
     // $host = "rich.c4lc2owy0af4.us-east-1.rds.amazonaws.com";
     // $username = "admin";
     // $password = "4mazonb33j4y!"; 
     // $dbname = "rich_db"; 
      
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Get form data
    $firstName = isset($_POST['firstName']) ? trim($_POST['firstName']) : '';
    $middleName = isset($_POST['middleName']) ? trim($_POST['middleName']) : '';
    $lastName = isset($_POST['lastName']) ? trim($_POST['lastName']) : '';
    $suffix = isset($_POST['suffix']) ? trim($_POST['suffix']) : '';
    $age = isset($_POST['age']) ? intval($_POST['age']) : 0;
    $sex = isset($_POST['sex']) ? trim($_POST['sex']) : '';
    $birthday = isset($_POST['birthday']) ? trim($_POST['birthday']) : '';
    $civilStatus = isset($_POST['civilStatus']) ? trim($_POST['civilStatus']) : '';
    $address = isset($_POST['userAddress']) ? trim($_POST['userAddress']) : '';
    
    // Validate required fields
    if (empty($firstName) || empty($lastName) || empty($age) || empty($sex) || empty($birthday) || empty($civilStatus) || empty($address)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'All required fields must be filled']);
        exit;
    }
    
    // Handle uploaded files
    $updateQuery = "UPDATE resident_information SET 
                    first_name = :first_name,
                    middle_name = :middle_name,
                    last_name = :last_name,
                    suffix = :suffix,
                    age = :age,
                    sex = :sex,
                    birthday = :birthday,
                    civil_status = :civil_status,
                    address = :address";
    
    $params = [
        ':first_name' => $firstName,
        ':middle_name' => $middleName,
        ':suffix' => $suffix,
        ':last_name' => $lastName,
        ':age' => $age,
        ':sex' => $sex,
        ':birthday' => $birthday,
        ':civil_status' => $civilStatus,
        ':address' => $address,
        ':email' => $email
    ];
    
    // Handle profile picture if uploaded
    if (isset($_FILES['profilePicture']) && $_FILES['profilePicture']['error'] === UPLOAD_ERR_OK) {
        $profilePicData = file_get_contents($_FILES['profilePicture']['tmp_name']);
        $updateQuery .= ", profile_pic = :profile_pic";
        $params[':profile_pic'] = $profilePicData;
    }
    
    $updateQuery .= " WHERE email = :email";
    
    // Prepare and execute update query
    $stmt = $pdo->prepare($updateQuery);
    $stmt->execute($params);
    
    if ($stmt->rowCount() > 0) {
        echo json_encode([
            'success' => true,
            'message' => 'Profile updated successfully'
        ]);
    } else {
        echo json_encode([
            'success' => false,
            'message' => 'No changes were made or user not found'
        ]);
    }
    
} catch (PDOException $e) {
    error_log("Database error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Database error occurred',
        'error' => $e->getMessage()
    ]);
}
?>

