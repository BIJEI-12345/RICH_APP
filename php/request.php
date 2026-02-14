<?php
// Request Forms API - Handle form submissions for various document requests
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

// Database connection function
function getDBConnection() {
    $host = "rich.cmxcoo6yc8nh.us-east-1.rds.amazonaws.com"; 
    $user = "admin";
    $pass = "4mazonb33j4y!";
    $db   = "rich_db";       // Siguraduhin na nagawa mo na ang database na ito sa phpMyAdmin
      
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

// Function to insert indigency form data
function insertIndigencyForm($data) {
    $pdo = getDBConnection();
    if (!$pdo) {
        error_log("Indigency form: Database connection failed");
        return ['success' => false, 'message' => 'Database connection failed'];
    }
    
    try {
        // Debug: Log received data
        error_log("Indigency form data received: " . json_encode($data));
        
        // Validate required fields
        $requiredFields = ['first_name', 'last_name', 'address', 'birth_date', 'birth_place', 'age', 'gender', 'civil_status', 'purpose'];
        foreach ($requiredFields as $field) {
            if (empty($data[$field])) {
                error_log("Indigency form: Missing required field: $field");
                return ['success' => false, 'message' => "Missing required field: $field"];
            }
        }
        
        // Handle purpose - use custom value if "other" is selected
        $purpose = $data['purpose'];
        if ($purpose === 'other' && !empty($data['other_purpose'])) {
            $purpose = $data['other_purpose'];
        }
        
        // Handle valid_id - use custom value if "other" is selected
        $validId = $data['valid_id'] ?? '';
        if ($validId === 'other' && !empty($data['other_valid_id'])) {
            $validId = $data['other_valid_id'];
        }
        
        // Handle image upload (optional)
        $idImage = null;
        if (!empty($data['id_image'])) {
            // Decode base64 image data
            $idImage = base64_decode($data['id_image']);
        }
        
        // Set Philippine Time for timestamp
        date_default_timezone_set('Asia/Manila');
        $philippineTime = date('Y-m-d H:i:s');
        
        // Get email from data or try to get from resident_information if not provided
        $email = $data['email'] ?? null;
        if (!$email && !empty($data['first_name']) && !empty($data['last_name'])) {
            // Try to get email from resident_information by name
            $emailStmt = $pdo->prepare("SELECT email FROM resident_information WHERE first_name = ? AND last_name = ? LIMIT 1");
            $emailStmt->execute([$data['first_name'], $data['last_name']]);
            $emailResult = $emailStmt->fetch(PDO::FETCH_ASSOC);
            $email = $emailResult['email'] ?? null;
        }
        
        // Check if email column exists, if not, we'll skip it
        $checkColumn = $pdo->query("SHOW COLUMNS FROM indigency_forms LIKE 'email'");
        $emailColumnExists = $checkColumn->rowCount() > 0;
        
        if ($emailColumnExists && $email) {
            // Prepare the insert statement with email
            $stmt = $pdo->prepare("
                INSERT INTO indigency_forms 
                (email, first_name, middle_name, last_name, address, birth_date, birth_place, civil_status, age, gender, purpose, valid_id, id_image, submitted_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            
            // Execute the insert
            $result = $stmt->execute([
                $email,
                $data['first_name'],
                $data['middle_name'] ?? null,
                $data['last_name'],
                $data['address'],
                $data['birth_date'],
                $data['birth_place'],
                $data['civil_status'],
                $data['age'],
                $data['gender'],
                $purpose,
                $validId,
                $idImage,
                $philippineTime
            ]);
        } else {
            // Prepare the insert statement without email (for backward compatibility)
            $stmt = $pdo->prepare("
                INSERT INTO indigency_forms 
                (first_name, middle_name, last_name, address, birth_date, birth_place, civil_status, age, gender, purpose, valid_id, id_image, submitted_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            
            // Execute the insert
            $result = $stmt->execute([
                $data['first_name'],
                $data['middle_name'] ?? null,
                $data['last_name'],
                $data['address'],
                $data['birth_date'],
                $data['birth_place'],
                $data['civil_status'],
                $data['age'],
                $data['gender'],
                $purpose,
                $validId,
                $idImage,
                $philippineTime
            ]);
        }
        
        if ($result) {
            $formId = $pdo->lastInsertId();
            error_log("Indigency form inserted successfully with ID: $formId");
            return [
                'success' => true,
                'message' => 'Indigency form submitted successfully',
                'form_id' => $formId
            ];
        } else {
            error_log("Indigency form: Failed to insert - execute returned false");
            return ['success' => false, 'message' => 'Failed to insert indigency form'];
        }
        
    } catch (PDOException $e) {
        error_log("Failed to insert indigency form: " . $e->getMessage());
        return ['success' => false, 'message' => 'Failed to insert indigency form'];
    }
}

// Function to insert Barangay ID form data
function insertBarangayIdForm($data) {
    $pdo = getDBConnection();
    if (!$pdo) {
        error_log("Barangay ID form: Database connection failed");
        return ['success' => false, 'message' => 'Database connection failed'];
    }
    
    try {
        // Debug: Log received data
        error_log("Barangay ID form data received: " . json_encode($data));
        error_log("Barangay ID form - Available fields: " . implode(', ', array_keys($data)));
        
        // Validate required fields
        $requiredFields = ['last_name', 'given_name', 'birth_date', 'address', 'civil_status', 'height', 'weight', 'gender', 'nationality', 'emergency_contact_name', 'emergency_contact_number', 'residency_duration', 'valid_id'];
        foreach ($requiredFields as $field) {
            if (empty($data[$field])) {
                error_log("Barangay ID form: Missing required field: $field");
                return ['success' => false, 'message' => "Missing required field: $field"];
            }
        }
        
        // Handle nationality - use custom value if "other" is selected
        $nationality = $data['nationality'];
        if ($nationality === 'other' && !empty($data['other_nationality'])) {
            $nationality = $data['other_nationality'];
        }
        
        // Handle valid_id - use custom value if "other" is selected
        $validId = $data['valid_id'];
        if ($validId === 'other' && !empty($data['other_valid_id'])) {
            $validId = $data['other_valid_id'];
        }
        
        // Handle image upload (optional)
        $idImage = null;
        if (!empty($data['id_image'])) {
            // Decode base64 image data
            $idImage = base64_decode($data['id_image']);
        }
        
        // Handle 1x1 picture upload (res_picture)
        $resPicture = null;
        if (!empty($data['res_picture'])) {
            // Decode base64 image data
            $resPicture = base64_decode($data['res_picture']);
        }
        
        // Set Philippine Time for timestamp
        date_default_timezone_set('Asia/Manila');
        $philippineTime = date('Y-m-d H:i:s');
        
        // Get email from data
        $email = $data['email'] ?? null;
        
        // Check if email column exists
        $checkColumn = $pdo->query("SHOW COLUMNS FROM barangay_id_forms LIKE 'email'");
        $emailColumnExists = $checkColumn->rowCount() > 0;
        
        if ($emailColumnExists && $email) {
            // Prepare the insert statement with email
            $stmt = $pdo->prepare("
                INSERT INTO barangay_id_forms 
                (email, last_name, given_name, middle_name, birth_date, address, civil_status, height, weight, gender, nationality, emergency_contact_name, emergency_contact_number, residency_duration, valid_id, id_image, res_picture, submitted_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            
            // Execute the insert
            $result = $stmt->execute([
                $email,
                $data['last_name'],
                $data['given_name'],
                $data['middle_name'] ?? null,
                $data['birth_date'],
                $data['address'],
                $data['civil_status'],
                $data['height'],
                $data['weight'],
                $data['gender'],
                $nationality,
                $data['emergency_contact_name'],
                $data['emergency_contact_number'],
                $data['residency_duration'],
                $validId,
                $idImage,
                $resPicture,
                $philippineTime
            ]);
        } else {
            // Prepare the insert statement without email (backward compatibility)
            $stmt = $pdo->prepare("
                INSERT INTO barangay_id_forms 
                (last_name, given_name, middle_name, birth_date, address, civil_status, height, weight, gender, nationality, emergency_contact_name, emergency_contact_number, residency_duration, valid_id, id_image, res_picture, submitted_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            
            // Execute the insert
            $result = $stmt->execute([
                $data['last_name'],
                $data['given_name'],
                $data['middle_name'] ?? null,
                $data['birth_date'],
                $data['address'],
                $data['civil_status'],
                $data['height'],
                $data['weight'],
                $data['gender'],
                $nationality,
                $data['emergency_contact_name'],
                $data['emergency_contact_number'],
                $data['residency_duration'],
                $validId,
                $idImage,
                $resPicture,
                $philippineTime
            ]);
        }
        
        if ($result) {
            $formId = $pdo->lastInsertId();
            error_log("Barangay ID form inserted successfully with ID: $formId");
            return [
                'success' => true,
                'message' => 'Barangay ID form submitted successfully',
                'form_id' => $formId
            ];
        } else {
            error_log("Barangay ID form: Failed to insert - execute returned false");
            return ['success' => false, 'message' => 'Failed to insert Barangay ID form'];
        }
        
    } catch (PDOException $e) {
        error_log("Failed to insert Barangay ID form: " . $e->getMessage());
        return ['success' => false, 'message' => 'Failed to insert Barangay ID form: ' . $e->getMessage()];
    }
}

// Function to insert Certification form data
function insertCertificationForm($data) {
    $pdo = getDBConnection();
    if (!$pdo) {
        error_log("Certification form: Database connection failed");
        return ['success' => false, 'message' => 'Database connection failed'];
    }
    
    try {
        // Debug: Log received data
        error_log("Certification form data received: " . json_encode($data));
        
        // Validate required fields
        $requiredFields = ['first_name', 'last_name', 'address', 'birth_date', 'birth_place', 'civil_status', 'gender', 'purpose'];
        foreach ($requiredFields as $field) {
            if (empty($data[$field])) {
                error_log("Certification form: Missing required field: $field");
                return ['success' => false, 'message' => "Missing required field: $field"];
            }
        }
        
        // Handle purpose - use custom value if "other" is selected
        $purpose = $data['purpose'];
        if ($purpose === 'other' && !empty($data['other_purpose'])) {
            $purpose = $data['other_purpose'];
        }
        
        // Handle valid_id - use custom value if "other" is selected
        $validId = $data['valid_id'] ?? '';
        if ($validId === 'other' && !empty($data['other_valid_id'])) {
            $validId = $data['other_valid_id'];
        }
        
        // Handle image upload (optional)
        $idImage = null;
        if (!empty($data['id_image'])) {
            // Decode base64 image data
            $idImage = base64_decode($data['id_image']);
        }
        
        // Set Philippine Time for timestamp
        date_default_timezone_set('Asia/Manila');
        $philippineTime = date('Y-m-d H:i:s');
        
        // Get email from data
        $email = $data['email'] ?? null;
        
        // Check if email column exists
        $checkColumn = $pdo->query("SHOW COLUMNS FROM certification_forms LIKE 'email'");
        $emailColumnExists = $checkColumn->rowCount() > 0;
        
        if ($emailColumnExists && $email) {
            // Prepare the insert statement with email
            $stmt = $pdo->prepare("
                INSERT INTO certification_forms 
                (email, first_name, middle_name, last_name, address, birth_date, birth_place, civil_status, gender, purpose, citizenship, job_position, start_of_work, monthly_income, start_year, month_year, valid_id, id_image, submitted_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            
            // Execute the insert
            $result = $stmt->execute([
                $email,
                $data['first_name'],
                $data['middle_name'] ?? null,
                $data['last_name'],
                $data['address'],
                $data['birth_date'],
                $data['birth_place'],
                $data['civil_status'],
                $data['gender'],
                $purpose,
                $data['citizenship'] ?? null,
                $data['job'] ?? null,
                $data['date_hire'] ?? null,
                $data['monthly_income'] ?? null,
                $data['year_residing'] ?? null,
                $data['month_year_passing'] ?? null,
                $validId,
                $idImage,
                $philippineTime
            ]);
        } else {
            // Prepare the insert statement without email (backward compatibility)
            $stmt = $pdo->prepare("
                INSERT INTO certification_forms 
                (first_name, middle_name, last_name, address, birth_date, birth_place, civil_status, gender, purpose, citizenship, job_position, start_of_work, monthly_income, start_year, month_year, valid_id, id_image, submitted_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            
            // Execute the insert
            $result = $stmt->execute([
                $data['first_name'],
                $data['middle_name'] ?? null,
                $data['last_name'],
                $data['address'],
                $data['birth_date'],
                $data['birth_place'],
                $data['civil_status'],
                $data['gender'],
                $purpose,
                $data['citizenship'] ?? null,
                $data['job'] ?? null,
                $data['date_hire'] ?? null,
                $data['monthly_income'] ?? null,
                $data['year_residing'] ?? null,
                $data['month_year_passing'] ?? null,
                $validId,
                $idImage,
                $philippineTime
            ]);
        }
        
        if ($result) {
            $formId = $pdo->lastInsertId();
            error_log("Certification form inserted successfully with ID: $formId");
            return [
                'success' => true,
                'message' => 'Certification form submitted successfully',
                'form_id' => $formId
            ];
        } else {
            error_log("Certification form: Failed to insert - execute returned false");
            return ['success' => false, 'message' => 'Failed to insert certification form'];
        }
        
    } catch (PDOException $e) {
        error_log("Failed to insert certification form: " . $e->getMessage());
        error_log("SQL Error Code: " . $e->getCode());
        error_log("SQL Error Info: " . json_encode($stmt->errorInfo()));
        return ['success' => false, 'message' => 'Failed to insert certification form: ' . $e->getMessage()];
    }
}

// Function to insert Certificate of Employment form data
function insertCoeForm($data) {
    $pdo = getDBConnection();
    if (!$pdo) {
        error_log("COE form: Database connection failed");
        return ['success' => false, 'message' => 'Database connection failed'];
    }
    
    try {
        // Debug: Log received data
        error_log("COE form data received: " . json_encode($data));
        
        // Validate required fields
        $requiredFields = ['first_name', 'last_name', 'address', 'age', 'gender', 'civil_status', 'employment_type', 'position', 'date_started', 'monthly_salary'];
        foreach ($requiredFields as $field) {
            if (empty($data[$field])) {
                error_log("COE form: Missing required field: $field");
                return ['success' => false, 'message' => "Missing required field: $field"];
            }
        }
        
        // Handle valid_id - use custom value if "other" is selected
        $validId = $data['valid_id'] ?? '';
        if ($validId === 'other' && !empty($data['other_valid_id'])) {
            $validId = $data['other_valid_id'];
        }
        
        // Handle image upload (optional)
        $idImage = null;
        if (!empty($data['id_image'])) {
            // Decode base64 image data
            $idImage = base64_decode($data['id_image']);
        }
        
        // Set Philippine Time for timestamp
        date_default_timezone_set('Asia/Manila');
        $philippineTime = date('Y-m-d H:i:s');
        
        // Get email from data
        $email = $data['email'] ?? null;
        
        // Check if email column exists
        $checkColumn = $pdo->query("SHOW COLUMNS FROM coe_forms LIKE 'email'");
        $emailColumnExists = $checkColumn->rowCount() > 0;
        
        if ($emailColumnExists && $email) {
            // Prepare the insert statement with email
            $stmt = $pdo->prepare("
                INSERT INTO coe_forms 
                (email, first_name, middle_name, last_name, address, age, gender, civil_status, employment_type, position, date_started, monthly_salary, valid_id, id_image, submitted_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            
            // Execute the insert
            $result = $stmt->execute([
                $email,
                $data['first_name'],
                $data['middle_name'] ?? null,
                $data['last_name'],
                $data['address'],
                $data['age'],
                $data['gender'],
                $data['civil_status'],
                $data['employment_type'],
                $data['position'],
                $data['date_started'],
                $data['monthly_salary'],
                $validId,
                $idImage,
                $philippineTime
            ]);
        } else {
            // Prepare the insert statement without email (backward compatibility)
            $stmt = $pdo->prepare("
                INSERT INTO coe_forms 
                (first_name, middle_name, last_name, address, age, gender, civil_status, employment_type, position, date_started, monthly_salary, valid_id, id_image, submitted_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            
            // Execute the insert
            $result = $stmt->execute([
                $data['first_name'],
                $data['middle_name'] ?? null,
                $data['last_name'],
                $data['address'],
                $data['age'],
                $data['gender'],
                $data['civil_status'],
                $data['employment_type'],
                $data['position'],
                $data['date_started'],
                $data['monthly_salary'],
                $validId,
                $idImage,
                $philippineTime
            ]);
        }
        
        if ($result) {
            $formId = $pdo->lastInsertId();
            error_log("COE form inserted successfully with ID: $formId");
            return [
                'success' => true,
                'message' => 'Certificate of Employment form submitted successfully',
                'form_id' => $formId
            ];
        } else {
            error_log("COE form: Failed to insert - execute returned false");
            return ['success' => false, 'message' => 'Failed to insert COE form'];
        }
        
    } catch (PDOException $e) {
        error_log("Failed to insert COE form: " . $e->getMessage());
        error_log("SQL Error Code: " . $e->getCode());
        error_log("SQL Error Info: " . json_encode($stmt->errorInfo()));
        return ['success' => false, 'message' => 'Failed to insert COE form: ' . $e->getMessage()];
    }
}

// Function to insert Clearance form data
function insertClearanceForm($data) {
    $pdo = getDBConnection();
    if (!$pdo) {
        error_log("Clearance form: Database connection failed");
        return ['success' => false, 'message' => 'Database connection failed'];
    }
    
    try {
        // Debug: Log received data
        error_log("Clearance form data received: " . json_encode($data));
        
        // Validate required fields
        $requiredFields = ['first_name', 'last_name', 'address', 'birth_date', 'birth_place', 'civil_status', 'age', 'gender', 'purpose'];
        foreach ($requiredFields as $field) {
            if (empty($data[$field])) {
                error_log("Clearance form: Missing required field: $field");
                return ['success' => false, 'message' => "Missing required field: $field"];
            }
        }
        
        // Handle purpose - use custom value if "other" is selected
        $purpose = $data['purpose'];
        if ($purpose === 'other' && !empty($data['other_purpose'])) {
            $purpose = $data['other_purpose'];
        }
        
        // Handle valid_id - use custom value if "other" is selected
        $validId = $data['valid_id'] ?? '';
        if ($validId === 'other' && !empty($data['other_valid_id'])) {
            $validId = $data['other_valid_id'];
        }
        
        // Handle image upload (optional)
        $idImage = null;
        if (!empty($data['id_image'])) {
            // Decode base64 image data
            $idImage = base64_decode($data['id_image']);
        }
        
        // Set Philippine Time for timestamp
        date_default_timezone_set('Asia/Manila');
        $philippineTime = date('Y-m-d H:i:s');
        
        // Get email from data
        $email = $data['email'] ?? null;
        
        // Check if email column exists
        $checkColumn = $pdo->query("SHOW COLUMNS FROM clearance_forms LIKE 'email'");
        $emailColumnExists = $checkColumn->rowCount() > 0;
        
        if ($emailColumnExists && $email) {
            // Prepare the insert statement with email
            $stmt = $pdo->prepare("
                INSERT INTO clearance_forms 
                (email, first_name, middle_name, last_name, address, birth_date, birth_place, civil_status, age, gender, purpose, citizenship, business_name, location, start_year, valid_id, id_image, submitted_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            
            // Execute the insert
            $result = $stmt->execute([
                $email,
                $data['first_name'],
                $data['middle_name'] ?? null,
                $data['last_name'],
                $data['address'],
                $data['birth_date'],
                $data['birth_place'],
                $data['civil_status'],
                $data['age'],
                $data['gender'],
                $purpose,
                $data['citizenship'] ?? null,
                $data['business_name'] ?? null,
                $data['business_location'] ?? null,
                $data['year_start_residing'] ?? null,
                $validId,
                $idImage,
                $philippineTime
            ]);
        } else {
            // Prepare the insert statement without email (backward compatibility)
            $stmt = $pdo->prepare("
                INSERT INTO clearance_forms 
                (first_name, middle_name, last_name, address, birth_date, birth_place, civil_status, age, gender, purpose, citizenship, business_name, location, start_year, valid_id, id_image, submitted_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            
            // Execute the insert
            $result = $stmt->execute([
                $data['first_name'],
                $data['middle_name'] ?? null,
                $data['last_name'],
                $data['address'],
                $data['birth_date'],
                $data['birth_place'],
                $data['civil_status'],
                $data['age'],
                $data['gender'],
                $purpose,
                $data['citizenship'] ?? null,
                $data['business_name'] ?? null,
                $data['business_location'] ?? null,
                $data['year_start_residing'] ?? null,
                $validId,
                $idImage,
                $philippineTime
            ]);
        }
        
        if ($result) {
            $formId = $pdo->lastInsertId();
            error_log("Clearance form inserted successfully with ID: $formId");
            return [
                'success' => true,
                'message' => 'Clearance form submitted successfully',
                'form_id' => $formId
            ];
        } else {
            error_log("Clearance form: Failed to insert - execute returned false");
            return ['success' => false, 'message' => 'Failed to insert clearance form'];
        }
        
    } catch (PDOException $e) {
        error_log("Failed to insert clearance form: " . $e->getMessage());
        error_log("SQL Error Code: " . $e->getCode());
        error_log("SQL Error Info: " . json_encode($stmt->errorInfo()));
        return ['success' => false, 'message' => 'Failed to insert clearance form: ' . $e->getMessage()];
    }
}

// Main execution
try {
    // Get JSON input
    $input = json_decode(file_get_contents('php://input'), true);
    
    // Check if input is valid JSON
    if (json_last_error() !== JSON_ERROR_NONE) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid JSON input']);
        exit;
    }
    
    // Check form type
    $formType = $input['form_type'] ?? '';
    
    // Debug: Log form type and input data
    error_log("Form type received: " . $formType);
    error_log("Input data keys: " . implode(', ', array_keys($input)));
    
    if ($formType === 'indigency') {
        // Handle indigency form submission
        $result = insertIndigencyForm($input);
        echo json_encode($result);
    } elseif ($formType === 'barangay_id') {
        // Handle Barangay ID form submission
        $result = insertBarangayIdForm($input);
        echo json_encode($result);
    } elseif ($formType === 'certification') {
        // Handle Certification form submission
        $result = insertCertificationForm($input);
        echo json_encode($result);
    } elseif ($formType === 'coe') {
        // Handle Certificate of Employment form submission
        $result = insertCoeForm($input);
        echo json_encode($result);
    } elseif ($formType === 'clearance') {
        // Handle Clearance form submission
        $result = insertClearanceForm($input);
        echo json_encode($result);
    } else {
        echo json_encode(['success' => false, 'message' => 'Invalid form type']);
    }
    
} catch (Exception $e) {
    error_log("Unexpected error: " . $e->getMessage());
    echo json_encode(['success' => false, 'message' => 'An unexpected error occurred']);
}
?>
