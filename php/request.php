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

// Database connection - Load from centralized config
require_once __DIR__ . '/env_loader.php';
require_once __DIR__ . '/jobseeker_claimed_lib.php';
require_once __DIR__ . '/census_address_helpers.php';
require_once __DIR__ . '/brgy_user_helpers.php';

// Validate that requesting name matches census_form (head: census_id = your resident id; members: same household shares head's census_id on each row).
function validateRequesterAgainstCensus($email, $firstName, $lastName, $address = '') {
    $pdo = getDBConnection();
    if (!$pdo) {
        return ['success' => false, 'allowed' => false, 'message' => 'Database connection failed'];
    }

    $email = trim((string)$email);
    $firstName = trim((string)$firstName);
    $lastName = trim((string)$lastName);

    if ($email === '' || $firstName === '' || $lastName === '') {
        return ['success' => false, 'allowed' => false, 'message' => 'Email, first name, and last name are required'];
    }

    try {
        $stmt = $pdo->prepare("SELECT id, address FROM resident_information WHERE email = ? LIMIT 1");
        $stmt->execute([$email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$user) {
            return ['success' => false, 'allowed' => false, 'message' => 'User account not found'];
        }
        $residentId = (int)$user['id'];
        $residentAddress = trim((string)($user['address'] ?? ''));

        $tableCheck = $pdo->query("SHOW TABLES LIKE 'census_form'");
        if ($tableCheck->rowCount() === 0) {
            return ['success' => false, 'allowed' => false, 'message' => 'Census table not found'];
        }

        $submittedAddress = trim((string)$address);
        $addressForCompare = $submittedAddress !== '' ? $submittedAddress : $residentAddress;

        // 1) Direct: row for this resident as census_id (submitter / head with own account).
        $stmt = $pdo->prepare(
            'SELECT first_name, last_name, complete_address FROM census_form WHERE census_id = ? '
            . 'AND LOWER(TRIM(first_name)) = LOWER(TRIM(?)) AND LOWER(TRIM(last_name)) = LOWER(TRIM(?)) LIMIT 1'
        );
        $stmt->execute([$residentId, $firstName, $lastName]);
        $census = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($census) {
            $censusAddress = trim((string)($census['complete_address'] ?? ''));
            if ($censusAddress === '') {
                $censusAddress = $residentAddress;
            }
            if ($submittedAddress !== '') {
                if ($censusAddress === '') {
                    return ['success' => true, 'allowed' => true];
                }
                if (!censusAddressesLikelyMatch($submittedAddress, $censusAddress)) {
                    return [
                        'success' => true,
                        'allowed' => false,
                        'message' => 'The requester address does not match your census record. Please use your censused address.'
                    ];
                }
            }
            return ['success' => true, 'allowed' => true];
        }

        // This account has census rows but names don't match (e.g. head typo on the request form).
        $stmt = $pdo->prepare('SELECT id FROM census_form WHERE census_id = ? LIMIT 1');
        $stmt->execute([$residentId]);
        if ($stmt->fetch(PDO::FETCH_ASSOC)) {
            return [
                'success' => true,
                'allowed' => false,
                'message' => 'The requester name does not match your census record. Please use your censused name.'
            ];
        }

        // 2) Household member: rows use head's census_id, not this user's id — match name + address across census_form.
        $stmt = $pdo->prepare(
            'SELECT complete_address FROM census_form WHERE '
            . 'LOWER(TRIM(first_name)) = LOWER(TRIM(?)) AND LOWER(TRIM(last_name)) = LOWER(TRIM(?))'
        );
        $stmt->execute([$firstName, $lastName]);
        $nameRows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        if (empty($nameRows)) {
            return [
                'success' => true,
                'allowed' => false,
                'message' => 'No census record found for this account. Please complete your census first.'
            ];
        }

        if ($addressForCompare === '') {
            return [
                'success' => true,
                'allowed' => false,
                'message' => 'Enter an address that matches your census record so we can verify your household.'
            ];
        }

        foreach ($nameRows as $row) {
            $censusAddress = trim((string)($row['complete_address'] ?? ''));
            if ($censusAddress !== '' && censusAddressesLikelyMatch($addressForCompare, $censusAddress)) {
                return ['success' => true, 'allowed' => true];
            }
        }

        return [
            'success' => true,
            'allowed' => false,
            'message' => 'The requester address does not match your census record. Please use your censused address.'
        ];
    } catch (PDOException $e) {
        error_log("validateRequesterAgainstCensus failed: " . $e->getMessage());
        return ['success' => false, 'allowed' => false, 'message' => 'Failed to validate requester against census'];
    }
}

/** Official names + position cell (EN|TL) + capitol/city hall address — must match js/request.js IND_PARA_KAY_BY_CODE */
function indigencyParaKayCatalog() {
    return [
        'GOVERNOR' => [
            'name' => 'Igg. DANIEL FERNANDO',
            'position' => 'GOVERNOR|Punong Lalawigan',
            'hall_address' => 'Malolos, Bulacan',
        ],
        'CONGRESSMAN' => [
            'name' => 'Igg. ADOR PLEYTO',
            'position' => 'CONGRESSMAN|Kinatawan',
            'hall_address' => 'Santa Maria, Bulacan',
        ],
        'MAYOR' => [
            'name' => 'Igg. MARIA ELENA GERMAR',
            'position' => 'MAYOR|Punong Bayan',
            'hall_address' => 'Norzagaray Bulacan',
        ],
        'NONE' => [
            'name' => 'NONE',
            'position' => 'NONE|Wala',
            'hall_address' => null,
        ],
    ];
}

/**
 * Resolve para_kay (official name), position (EN|TL), and hall_address from position_code; legacy clients may send para_kay only.
 * @return array{para_kay: string, position: ?string, position_code: ?string, hall_address: ?string}
 */
function resolveIndigencyParaKayFields(array $data) {
    $code = strtoupper(trim((string)($data['position_code'] ?? '')));
    if ($code === 'OTHER') {
        $spec = trim((string)($data['para_kay'] ?? ''));
        if ($spec === '') {
            $spec = trim((string)($data['other_para_kay'] ?? ''));
        }
        return [
            'para_kay' => $spec,
            'position' => null,
            'position_code' => 'OTHER',
            'hall_address' => null,
        ];
    }
    $catalog = indigencyParaKayCatalog();
    if ($code !== '' && isset($catalog[$code])) {
        $row = $catalog[$code];
        return [
            'para_kay' => $row['name'],
            'position' => $row['position'],
            'position_code' => $code,
            'hall_address' => $row['hall_address'] ?? null,
        ];
    }
    $paraKay = trim((string)($data['para_kay'] ?? ''));
    return [
        'para_kay' => $paraKay,
        'position' => null,
        'position_code' => null,
        'hall_address' => null,
    ];
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

        $resolvedPk = resolveIndigencyParaKayFields($data);
        $paraKay = $resolvedPk['para_kay'];
        $positionCell = $resolvedPk['position'];
        $hallAddress = $resolvedPk['hall_address'] ?? null;
        if ($paraKay === '') {
            error_log('Indigency form: Missing required field: para_kay / position_code');
            return ['success' => false, 'message' => 'Missing required field: Para Kay'];
        }

        $hasParaKayCol = $pdo->query("SHOW COLUMNS FROM indigency_forms LIKE 'para_kay'")->rowCount() > 0;
        $hasPositionCol = $pdo->query("SHOW COLUMNS FROM indigency_forms LIKE 'position'")->rowCount() > 0;
        $hasHallAddressCol = $pdo->query("SHOW COLUMNS FROM indigency_forms LIKE 'hall_address'")->rowCount() > 0;
        $purposeSuffix = ' [Para Kay: ' . $paraKay . ']';
        if ($positionCell) {
            $purposeSuffix .= ' [Position: ' . $positionCell . ']';
        }
        if ($hallAddress && !$hasHallAddressCol) {
            $purposeSuffix .= ' [Hall: ' . $hallAddress . ']';
        }
        $purposeForInsert = $hasParaKayCol ? $purpose : ($purpose . $purposeSuffix);
        
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
            if ($hasParaKayCol && $hasPositionCol && $hasHallAddressCol) {
                $stmt = $pdo->prepare("
                    INSERT INTO indigency_forms 
                    (email, first_name, middle_name, last_name, address, birth_date, birth_place, civil_status, age, gender, purpose, para_kay, `position`, hall_address, valid_id, id_image, submitted_at) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");
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
                    $paraKay,
                    $positionCell,
                    $hallAddress,
                    $validId,
                    $idImage,
                    $philippineTime
                ]);
            } elseif ($hasParaKayCol && $hasPositionCol) {
                $stmt = $pdo->prepare("
                    INSERT INTO indigency_forms 
                    (email, first_name, middle_name, last_name, address, birth_date, birth_place, civil_status, age, gender, purpose, para_kay, `position`, valid_id, id_image, submitted_at) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");
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
                    $paraKay,
                    $positionCell,
                    $validId,
                    $idImage,
                    $philippineTime
                ]);
            } elseif ($hasParaKayCol && $hasHallAddressCol) {
                $stmt = $pdo->prepare("
                    INSERT INTO indigency_forms 
                    (email, first_name, middle_name, last_name, address, birth_date, birth_place, civil_status, age, gender, purpose, para_kay, hall_address, valid_id, id_image, submitted_at) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");
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
                    $paraKay,
                    $hallAddress,
                    $validId,
                    $idImage,
                    $philippineTime
                ]);
            } elseif ($hasParaKayCol) {
                $stmt = $pdo->prepare("
                    INSERT INTO indigency_forms 
                    (email, first_name, middle_name, last_name, address, birth_date, birth_place, civil_status, age, gender, purpose, para_kay, valid_id, id_image, submitted_at) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");
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
                    $paraKay,
                    $validId,
                    $idImage,
                    $philippineTime
                ]);
            } else {
                $stmt = $pdo->prepare("
                    INSERT INTO indigency_forms 
                    (email, first_name, middle_name, last_name, address, birth_date, birth_place, civil_status, age, gender, purpose, valid_id, id_image, submitted_at) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");
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
                    $purposeForInsert,
                    $validId,
                    $idImage,
                    $philippineTime
                ]);
            }
        } else {
            if ($hasParaKayCol && $hasPositionCol && $hasHallAddressCol) {
                $stmt = $pdo->prepare("
                    INSERT INTO indigency_forms 
                    (first_name, middle_name, last_name, address, birth_date, birth_place, civil_status, age, gender, purpose, para_kay, `position`, hall_address, valid_id, id_image, submitted_at) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");
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
                    $paraKay,
                    $positionCell,
                    $hallAddress,
                    $validId,
                    $idImage,
                    $philippineTime
                ]);
            } elseif ($hasParaKayCol && $hasPositionCol) {
                $stmt = $pdo->prepare("
                    INSERT INTO indigency_forms 
                    (first_name, middle_name, last_name, address, birth_date, birth_place, civil_status, age, gender, purpose, para_kay, `position`, valid_id, id_image, submitted_at) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");
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
                    $paraKay,
                    $positionCell,
                    $validId,
                    $idImage,
                    $philippineTime
                ]);
            } elseif ($hasParaKayCol && $hasHallAddressCol) {
                $stmt = $pdo->prepare("
                    INSERT INTO indigency_forms 
                    (first_name, middle_name, last_name, address, birth_date, birth_place, civil_status, age, gender, purpose, para_kay, hall_address, valid_id, id_image, submitted_at) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");
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
                    $paraKay,
                    $hallAddress,
                    $validId,
                    $idImage,
                    $philippineTime
                ]);
            } elseif ($hasParaKayCol) {
                $stmt = $pdo->prepare("
                    INSERT INTO indigency_forms 
                    (first_name, middle_name, last_name, address, birth_date, birth_place, civil_status, age, gender, purpose, para_kay, valid_id, id_image, submitted_at) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");
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
                    $paraKay,
                    $validId,
                    $idImage,
                    $philippineTime
                ]);
            } else {
                $stmt = $pdo->prepare("
                    INSERT INTO indigency_forms 
                    (first_name, middle_name, last_name, address, birth_date, birth_place, civil_status, age, gender, purpose, valid_id, id_image, submitted_at) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");
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
                    $purposeForInsert,
                    $validId,
                    $idImage,
                    $philippineTime
                ]);
            }
        }
        
        if ($result) {
            $formId = $pdo->lastInsertId();
            error_log("Indigency form inserted successfully with ID: $formId");
            return [
                'success' => true,
                'message' => 'Indigency form submitted successfully',
                'form_id' => $formId,
                'position_code' => $resolvedPk['position_code'] ?? null,
                'hall_address' => $resolvedPk['hall_address'] ?? null,
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

/**
 * Returns true if this user already has a certification with purpose Job Seeker (any status).
 */
function certificationJobSeekerAlreadyUsed($pdo, $email, $firstName, $lastName) {
    $purposeCond = "(LOWER(TRIM(c.purpose)) IN ('jobseeker', 'job seeker'))";
    $checkEmailColumn = $pdo->query("SHOW COLUMNS FROM certification_forms LIKE 'email'");
    $emailColumnExists = $checkEmailColumn->rowCount() > 0;

    if ($emailColumnExists && $email) {
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM certification_forms c WHERE $purposeCond AND c.email = ?");
        $stmt->execute([$email]);
        if ((int) $stmt->fetchColumn() > 0) {
            return true;
        }
        return jobseeker_claimed_matches_user($pdo, $email, $firstName, $lastName);
    }

    $fn = trim((string) ($firstName ?? ''));
    $ln = trim((string) ($lastName ?? ''));
    if ($fn === '' || $ln === '') {
        return jobseeker_claimed_matches_user($pdo, $email, $firstName, $lastName);
    }

    $stmt = $pdo->prepare("
        SELECT COUNT(*) FROM certification_forms c
        WHERE $purposeCond
        AND LOWER(TRIM(c.first_name)) = LOWER(?)
        AND LOWER(TRIM(c.last_name)) = LOWER(?)
    ");
    $stmt->execute([$fn, $ln]);
    if ((int) $stmt->fetchColumn() > 0) {
        return true;
    }

    return jobseeker_claimed_matches_user($pdo, $email, $firstName, $lastName);
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

        if (strtolower(trim((string) $purpose)) === 'jobseeker') {
            if (certificationJobSeekerAlreadyUsed($pdo, $data['email'] ?? null, $data['first_name'] ?? '', $data['last_name'] ?? '')) {
                return [
                    'success' => false,
                    'message' => 'The Job Seeker certification may be requested only once. You have already submitted this request.'
                ];
            }
        }
        
        // Handle valid_id - use custom value if "other" is selected
        $validId = $data['valid_id'] ?? '';
        if ($validId === 'other' && !empty($data['other_valid_id'])) {
            $validId = $data['other_valid_id'];
        }
        
        // Handle out_of_school_youth - convert to "1" if checked, "0" if unchecked
        $outOfSchoolYouth = "0"; // Default to "0" (unchecked)
        if (!empty($data['out_of_school_youth']) && ($data['out_of_school_youth'] === 'yes' || $data['out_of_school_youth'] === 'Yes' || $data['out_of_school_youth'] === '1')) {
            $outOfSchoolYouth = "1";
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
        
        // Check if optional columns exist
        $checkEmailColumn = $pdo->query("SHOW COLUMNS FROM certification_forms LIKE 'email'");
        $emailColumnExists = $checkEmailColumn->rowCount() > 0;
        
        $checkEducationalLevelColumn = $pdo->query("SHOW COLUMNS FROM certification_forms LIKE 'educational_level'");
        $educationalLevelColumnExists = $checkEducationalLevelColumn->rowCount() > 0;
        
        $checkCourseColumn = $pdo->query("SHOW COLUMNS FROM certification_forms LIKE 'course'");
        $courseColumnExists = $checkCourseColumn->rowCount() > 0;
        
        $checkOutOfSchoolYouthColumn = $pdo->query("SHOW COLUMNS FROM certification_forms LIKE 'out_of_school_youth'");
        $outOfSchoolYouthColumnExists = $checkOutOfSchoolYouthColumn->rowCount() > 0;
        
        // Prepare INSERT statements depending on available columns
        if ($emailColumnExists && $email && $educationalLevelColumnExists && $courseColumnExists && $outOfSchoolYouthColumnExists) {
            // With email, educational_level, course, and out_of_school_youth
            $stmt = $pdo->prepare("
                INSERT INTO certification_forms 
                (email, first_name, middle_name, last_name, address, birth_date, birth_place, civil_status, gender, purpose, citizenship, job_position, start_of_work, monthly_income, start_year, month_year, educational_level, course, out_of_school_youth, valid_id, id_image, submitted_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            
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
                $data['educational_level'] ?? null,
                $data['course'] ?? null,
                $outOfSchoolYouth,
                $validId,
                $idImage,
                $philippineTime
            ]);
        } elseif ($emailColumnExists && $email && $educationalLevelColumnExists && $courseColumnExists) {
            // With email, educational_level, and course (no out_of_school_youth column)
            $stmt = $pdo->prepare("
                INSERT INTO certification_forms 
                (email, first_name, middle_name, last_name, address, birth_date, birth_place, civil_status, gender, purpose, citizenship, job_position, start_of_work, monthly_income, start_year, month_year, educational_level, course, valid_id, id_image, submitted_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            
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
                $data['educational_level'] ?? null,
                $data['course'] ?? null,
                $validId,
                $idImage,
                $philippineTime
            ]);
        } elseif ($emailColumnExists && $email && $outOfSchoolYouthColumnExists) {
            // With email and out_of_school_youth only
            $stmt = $pdo->prepare("
                INSERT INTO certification_forms 
                (email, first_name, middle_name, last_name, address, birth_date, birth_place, civil_status, gender, purpose, citizenship, job_position, start_of_work, monthly_income, start_year, month_year, out_of_school_youth, valid_id, id_image, submitted_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            
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
                $outOfSchoolYouth,
                $validId,
                $idImage,
                $philippineTime
            ]);
        } elseif ($emailColumnExists && $email) {
            // With email only (no educational_level / course / out_of_school_youth columns)
            $stmt = $pdo->prepare("
                INSERT INTO certification_forms 
                (email, first_name, middle_name, last_name, address, birth_date, birth_place, civil_status, gender, purpose, citizenship, job_position, start_of_work, monthly_income, start_year, month_year, valid_id, id_image, submitted_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            
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
        } elseif ($educationalLevelColumnExists && $courseColumnExists && $outOfSchoolYouthColumnExists) {
            // Without email, but with educational_level, course, and out_of_school_youth
            $stmt = $pdo->prepare("
                INSERT INTO certification_forms 
                (first_name, middle_name, last_name, address, birth_date, birth_place, civil_status, gender, purpose, citizenship, job_position, start_of_work, monthly_income, start_year, month_year, educational_level, course, out_of_school_youth, valid_id, id_image, submitted_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            
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
                $data['educational_level'] ?? null,
                $data['course'] ?? null,
                $outOfSchoolYouth,
                $validId,
                $idImage,
                $philippineTime
            ]);
        } elseif ($educationalLevelColumnExists && $courseColumnExists) {
            // Without email, but with educational_level and course (no out_of_school_youth column)
            $stmt = $pdo->prepare("
                INSERT INTO certification_forms 
                (first_name, middle_name, last_name, address, birth_date, birth_place, civil_status, gender, purpose, citizenship, job_position, start_of_work, monthly_income, start_year, month_year, educational_level, course, valid_id, id_image, submitted_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            
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
                $data['educational_level'] ?? null,
                $data['course'] ?? null,
                $validId,
                $idImage,
                $philippineTime
            ]);
        } elseif ($outOfSchoolYouthColumnExists) {
            // Without email/educational_level/course, but with out_of_school_youth
            $stmt = $pdo->prepare("
                INSERT INTO certification_forms 
                (first_name, middle_name, last_name, address, birth_date, birth_place, civil_status, gender, purpose, citizenship, job_position, start_of_work, monthly_income, start_year, month_year, out_of_school_youth, valid_id, id_image, submitted_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            
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
                $outOfSchoolYouth,
                $validId,
                $idImage,
                $philippineTime
            ]);
        } else {
            // Original structure: no email, educational_level, course, or out_of_school_youth columns
            $stmt = $pdo->prepare("
                INSERT INTO certification_forms 
                (first_name, middle_name, last_name, address, birth_date, birth_place, civil_status, gender, purpose, citizenship, job_position, start_of_work, monthly_income, start_year, month_year, valid_id, id_image, submitted_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            
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
        }
        error_log("Certification form: Failed to insert - execute returned false");
        return ['success' => false, 'message' => 'Failed to insert certification form'];
        
    } catch (PDOException $e) {
        error_log("Failed to insert certification form: " . $e->getMessage());
        error_log("SQL Error Code: " . $e->getCode());
        if (isset($stmt) && $stmt instanceof PDOStatement) {
            error_log("SQL Error Info: " . json_encode($stmt->errorInfo()));
        }
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
        if ($email && is_email_brgy_user($pdo, $email)) {
            return [
                'success' => false,
                'message' => 'You are ineligible to receive a COE because of your role in the barangay.'
            ];
        }

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
    $action = $input['action'] ?? '';
    if ($action === 'validate_requester_census') {
        $result = validateRequesterAgainstCensus(
            $input['email'] ?? '',
            $input['first_name'] ?? '',
            $input['last_name'] ?? '',
            $input['address'] ?? ''
        );
        echo json_encode($result);
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
