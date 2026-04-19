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

if (!function_exists('census_extract_house_number')) {
    /**
     * House/unit segment from complete_address (first part before comma), same as check_census.php.
     */
    function census_extract_house_number($completeAddress) {
        $completeAddress = trim((string) $completeAddress);
        if ($completeAddress === '') {
            return '';
        }
        $parts = explode(',', $completeAddress, 2);
        return trim($parts[0]);
    }
}

if (!function_exists('census_house_number_key')) {
    /**
     * Normalized house/unit token used for household-level matching.
     */
    function census_house_number_key($value) {
        $value = mb_strtolower(trim((string) $value), 'UTF-8');
        $value = preg_replace('/\s+/u', ' ', $value);
        return $value ?? '';
    }
}

if (!function_exists('census_normalize_identity_age')) {
    function census_normalize_identity_age($value) {
        if ($value === null || $value === '') {
            return '';
        }
        if (is_numeric($value)) {
            return (string) (int) $value;
        }
        return mb_strtolower(trim((string) $value), 'UTF-8');
    }
}

if (!function_exists('census_normalize_identity_birthday')) {
    function census_normalize_identity_birthday($value) {
        $value = trim((string) ($value ?? ''));
        if ($value === '') {
            return '';
        }
        $ts = strtotime($value);
        if ($ts !== false) {
            return date('Y-m-d', $ts);
        }
        return mb_strtolower($value, 'UTF-8');
    }
}

if (!function_exists('census_identity_signature')) {
    /**
     * Normalized 8-field identity for duplicate detection (reference: census_form only).
     */
    function census_identity_signature($firstName, $lastName, $middleName, $age, $sex, $birthday, $civilStatus, $relationToHousehold) {
        return [
            'first_name' => mb_strtolower(trim((string) $firstName), 'UTF-8'),
            'last_name' => mb_strtolower(trim((string) $lastName), 'UTF-8'),
            'middle_name' => mb_strtolower(trim((string) ($middleName ?? '')), 'UTF-8'),
            'age' => census_normalize_identity_age($age),
            'sex' => mb_strtolower(trim((string) ($sex ?? '')), 'UTF-8'),
            'birthday' => census_normalize_identity_birthday($birthday),
            'civil_status' => mb_strtolower(trim((string) ($civilStatus ?? '')), 'UTF-8'),
            'relation_to_household' => mb_strtolower(trim((string) ($relationToHousehold ?? '')), 'UTF-8'),
        ];
    }
}

if (!function_exists('census_identity_duplicate_exists')) {
    /**
     * True if census_form has a row whose 8 identity fields all match (any difference ⇒ not duplicate).
     */
    function census_identity_duplicate_exists(PDO $pdo, array $signature) {
        $stmt = $pdo->query(
            'SELECT first_name, last_name, middle_name, age, sex, birthday, civil_status, relation_to_household FROM census_form'
        );
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as $row) {
            $rowSig = census_identity_signature(
                $row['first_name'] ?? '',
                $row['last_name'] ?? '',
                $row['middle_name'] ?? null,
                $row['age'] ?? null,
                $row['sex'] ?? null,
                $row['birthday'] ?? null,
                $row['civil_status'] ?? null,
                $row['relation_to_household'] ?? null
            );
            if ($rowSig == $signature) {
                return true;
            }
        }
        return false;
    }
}

if (!function_exists('census_trim_disabilities_field')) {
    /**
     * Value for census_form.disabilities VARCHAR(100).
     */
    function census_trim_disabilities_field($value): ?string {
        if ($value === null || $value === '') {
            return null;
        }
        $s = trim((string) $value);
        if ($s === '') {
            return null;
        }
        // Dropdown label "None / Wala" submits as value "None"; accept legacy payloads too.
        if ($s === 'None / Wala') {
            $s = 'None';
        }
        if (function_exists('mb_substr')) {
            return mb_substr($s, 0, 100, 'UTF-8');
        }
        return substr($s, 0, 100);
    }
}

if (!function_exists('census_trim_benefits_field')) {
    /**
     * Value for census_form.barangay_supported_benefits (trimmed; empty → null).
     * Explicit "None" from the form is stored as the string None.
     */
    function census_trim_benefits_field($value): ?string {
        if ($value === null || $value === '') {
            return null;
        }
        $s = trim((string) $value);
        if ($s === '') {
            return null;
        }
        if (function_exists('mb_substr')) {
            return mb_substr($s, 0, 255, 'UTF-8');
        }
        return substr($s, 0, 255);
    }
}

if (!function_exists('census_normalize_place_of_work')) {
    /**
     * census_form.place_of_work: literal "None" when occupation is not Employed.
     * Employed rows store occupation as "Employed - {type of work}" from the census form.
     */
    function census_normalize_place_of_work($occupation, $placeOfWork): ?string {
        $occ = trim((string) ($occupation ?? ''));
        if ($occ !== '' && strpos($occ, 'Employed - ') === 0) {
            $p = trim((string) ($placeOfWork ?? ''));
            if ($p === '') {
                return null;
            }
            if (function_exists('mb_substr')) {
                return mb_substr($p, 0, 255, 'UTF-8');
            }
            return substr($p, 0, 255);
        }
        return 'None';
    }
}

// Database connection - Load from centralized config
require_once __DIR__ . '/env_loader.php';

try {
    $pdo = getDBConnection();
    if ($pdo) {
        // Set MySQL timezone to Philippine time (UTC+8)
        $pdo->exec("SET time_zone = '+08:00'");
    }
    
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

    $hasDisabilitiesColumn = false;
    try {
        $dc = $pdo->query("SHOW COLUMNS FROM census_form LIKE 'disabilities'");
        $hasDisabilitiesColumn = $dc && $dc->rowCount() > 0;
    } catch (PDOException $e) {
        $hasDisabilitiesColumn = false;
    }

    $hasStatusColumn = false;
    try {
        $sc = $pdo->query("SHOW COLUMNS FROM census_form LIKE 'status'");
        $hasStatusColumn = $sc && $sc->rowCount() > 0;
    } catch (PDOException $e) {
        $hasStatusColumn = false;
    }

    $hasIndigenousColumn = false;
    try {
        $ic = $pdo->query("SHOW COLUMNS FROM census_form LIKE 'indigenous'");
        $hasIndigenousColumn = $ic && $ic->rowCount() > 0;
    } catch (PDOException $e) {
        $hasIndigenousColumn = false;
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

    // Combined address as stored in census_form (house number required for validation)
    $fullAddressPreview = trim($input['address']);
    if (!empty($input['unitHouseNumber'])) {
        $fullAddressPreview = trim($input['unitHouseNumber']) . ', ' . $fullAddressPreview;
    }
    $submittedHouseNumber = census_extract_house_number($fullAddressPreview);

    if ($submittedHouseNumber === '') {
        echo json_encode([
            'success' => false,
            'message' => 'Please enter your unit or house number so the census can check for duplicate household records.'
        ]);
        exit;
    }

    $headFirst = trim($input['firstName']);
    $headLast = trim($input['lastName']);
    $headMiddle = $input['middleName'] ?? null;
    $headRelation = $input['familyOccupation'] ?? 'Head of Household';
    $headSig = census_identity_signature(
        $headFirst,
        $headLast,
        $headMiddle,
        $input['age'],
        $input['sex'],
        $input['birthday'],
        $input['civilStatus'],
        $headRelation
    );
    if (census_identity_duplicate_exists($pdo, $headSig)) {
        echo json_encode([
            'success' => false,
            'message' => 'This person is already in the census with the same details (name, age, sex, birthday, civil status, and relation).'
        ]);
        exit;
    }

    $householdMembers = $input['householdMembers'] ?? [];
    if (is_array($householdMembers)) {
        foreach ($householdMembers as $member) {
            if (empty($member['firstName']) || !is_string($member['firstName']) || trim($member['firstName']) === '') {
                continue;
            }
            if (empty($member['lastName']) || !is_string($member['lastName']) || trim($member['lastName']) === '') {
                continue;
            }
            $mf = trim($member['firstName']);
            $ml = trim($member['lastName']);
            $mm = !empty($member['middleName']) ? trim($member['middleName']) : null;
            $memberSig = census_identity_signature(
                $mf,
                $ml,
                $mm,
                $member['age'] ?? null,
                $member['sex'] ?? null,
                $member['birthday'] ?? null,
                $member['civilStatus'] ?? null,
                $member['relation'] ?? null
            );
            if (census_identity_duplicate_exists($pdo, $memberSig)) {
                echo json_encode([
                    'success' => false,
                    'message' => $mf . ' ' . $ml . ' is already in the census with the same details (name, age, sex, birthday, civil status, and relation).'
                ]);
                exit;
            }
        }
    }
    
    // Get user_id (census_id) from resident_information table
    $stmt = $pdo->prepare("SELECT id FROM resident_information WHERE email = ?");
    $stmt->execute([$userEmail]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$user) {
        // User not in resident_information table - create entry first
        // Insert basic user info into resident_information
        // Combine address with unit/house number if provided
        $fullAddress = $input['address'];
        if (!empty($input['unitHouseNumber'])) {
            $fullAddress = trim($input['unitHouseNumber']) . ', ' . $fullAddress;
        }
        
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
            $fullAddress
        ]);
        
        $censusId = $pdo->lastInsertId();
        error_log("Created new resident_information entry with ID: $censusId for email: $userEmail");
    } else {
        $censusId = $user['id'];
        
        // Update resident_information with latest census data (in case info changed)
        // Combine address with unit/house number if provided
        $fullAddress = $input['address'];
        if (!empty($input['unitHouseNumber'])) {
            $fullAddress = trim($input['unitHouseNumber']) . ', ' . $fullAddress;
        }
        
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
            $fullAddress,
            $censusId
        ]);
    }
    
    $ownCensusLinkId = census_id_for_resident_pk($censusId);

    // If this account no longer has rows in census_form, allow re-submit and
    // align census_id with an existing household census_id using the same house number.
    $targetCensusLinkId = $ownCensusLinkId;

    $stmt = $pdo->prepare("SELECT id FROM census_form WHERE census_id = ? LIMIT 1");
    $stmt->execute([$ownCensusLinkId]);
    $hasOwnCensusRows = (bool) $stmt->fetch(PDO::FETCH_ASSOC);
    if ($hasOwnCensusRows) {
        echo json_encode([
            'success' => false,
            'message' => 'You have already submitted the census form'
        ]);
        exit;
    }

    $submittedHouseKey = census_house_number_key($submittedHouseNumber);
    if ($submittedHouseKey !== '') {
        $householdStmt = $pdo->prepare(
            "SELECT census_id, complete_address FROM census_form
             WHERE complete_address IS NOT NULL AND TRIM(complete_address) != ''
             ORDER BY id ASC"
        );
        $householdStmt->execute();
        $householdRows = $householdStmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($householdRows as $householdRow) {
            $candidateHouseKey = census_house_number_key(
                census_extract_house_number($householdRow['complete_address'] ?? '')
            );
            if ($candidateHouseKey !== '' && $candidateHouseKey === $submittedHouseKey) {
                $candidateCensusId = trim((string) ($householdRow['census_id'] ?? ''));
                if ($candidateCensusId !== '') {
                    $targetCensusLinkId = $candidateCensusId;
                    break;
                }
            }
        }
    }
    
    // Start transaction for multiple inserts (main person + household members)
    $pdo->beginTransaction();
    
    try {
        // Insert main person's census data (head of household)
        // Use familyOccupation from form, or default to 'Head of Household' if not provided
        $familyOccupation = $input['familyOccupation'] ?? 'Head of Household';
        
        // Combine address with unit/house number if provided
        $fullAddress = $input['address'];
        if (!empty($input['unitHouseNumber'])) {
            $fullAddress = trim($input['unitHouseNumber']) . ', ' . $fullAddress;
        }

        $headDisabilities = census_trim_disabilities_field($input['disability'] ?? null);
        $headBenefits = census_trim_benefits_field($input['claimedBenefits'] ?? null);
        $headPlaceOfWork = census_normalize_place_of_work($input['occupation'] ?? null, $input['placeOfWork'] ?? null);

        $headIndigenous = 0;
        if ($hasIndigenousColumn && array_key_exists('indigenous', $input)) {
            $iv = $input['indigenous'];
            if ($iv === 1 || $iv === '1' || $iv === true) {
                $headIndigenous = 1;
            } else {
                $headIndigenous = 0;
            }
        }

        $headCols = [
            'census_id', 'first_name', 'last_name', 'middle_name', 'suffix', 'age', 'sex', 'birthday',
            'civil_status', 'contact_number', 'occupation', 'place_of_work',
            'barangay_supported_benefits', 'complete_address', 'relation_to_household',
        ];
        $headVals = [
            $targetCensusLinkId,
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
            $headPlaceOfWork,
            $headBenefits,
            $fullAddress,
            $familyOccupation,
        ];
        if ($hasDisabilitiesColumn) {
            $headCols[] = 'disabilities';
            $headVals[] = $headDisabilities;
        }
        if ($hasStatusColumn) {
            $headCols[] = 'status';
            $headVals[] = 'Censused';
        }
        if ($hasIndigenousColumn) {
            $headCols[] = 'indigenous';
            $headVals[] = $headIndigenous;
        }
        $headPlaceholders = implode(',', array_fill(0, count($headVals), '?'));
        $stmt = $pdo->prepare(
            'INSERT INTO census_form (' . implode(',', $headCols) . ') VALUES (' . $headPlaceholders . ')'
        );
        $stmt->execute($headVals);
        
        $mainRecordId = $pdo->lastInsertId();
        error_log("Inserted main census record with ID: $mainRecordId for census_id: $targetCensusLinkId");
        
        // Insert household members
        // Each household member gets their own record with their own information
        // They share the same census_id to link them to the main person
        $householdMembers = $input['householdMembers'] ?? [];
        $insertedMembers = 0;
        
        // Combine address with unit/house number if provided (for household members)
        $fullAddressForMembers = $input['address'];
        if (!empty($input['unitHouseNumber'])) {
            $fullAddressForMembers = trim($input['unitHouseNumber']) . ', ' . $fullAddressForMembers;
        }
        
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

            $memberDisabilities = census_trim_disabilities_field($member['disability'] ?? null);
            $memberBenefits = census_trim_benefits_field($member['benefits'] ?? null);
            $memberPlaceOfWork = census_normalize_place_of_work($member['work'] ?? null, $member['placeOfWork'] ?? null);

            $memberIndigenous = 0;
            if ($hasIndigenousColumn && array_key_exists('indigenous', $member)) {
                $miv = $member['indigenous'];
                if ($miv === 1 || $miv === '1' || $miv === true) {
                    $memberIndigenous = 1;
                } else {
                    $memberIndigenous = 0;
                }
            }

            $memCols = [
                'census_id', 'first_name', 'last_name', 'middle_name', 'suffix', 'age', 'sex', 'birthday',
                'civil_status', 'contact_number', 'occupation', 'place_of_work',
                'barangay_supported_benefits', 'complete_address', 'relation_to_household',
            ];
            $memberSuffix = isset($member['suffix']) && $member['suffix'] !== '' && $member['suffix'] !== null
                ? trim((string) $member['suffix'])
                : null;

            $memVals = [
                $targetCensusLinkId,
                $memberFirstName,
                $memberLastName,
                $memberMiddleName,
                $memberSuffix,
                $member['age'] ?? null,
                $member['sex'] ?? null,
                $member['birthday'] ?? null,
                $member['civilStatus'] ?? null,
                null,
                $member['work'] ?? null,
                $memberPlaceOfWork,
                $memberBenefits,
                $fullAddressForMembers,
                $member['relation'] ?? null,
            ];
            if ($hasDisabilitiesColumn) {
                $memCols[] = 'disabilities';
                $memVals[] = $memberDisabilities;
            }
            if ($hasStatusColumn) {
                $memCols[] = 'status';
                $memVals[] = 'Censused';
            }
            if ($hasIndigenousColumn) {
                $memCols[] = 'indigenous';
                $memVals[] = $memberIndigenous;
            }
            $memPlaceholders = implode(',', array_fill(0, count($memVals), '?'));
            $stmt = $pdo->prepare(
                'INSERT INTO census_form (' . implode(',', $memCols) . ') VALUES (' . $memPlaceholders . ')'
            );
            $stmt->execute($memVals);
            
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
            'household_members_count' => $insertedMembers,
            'census_id' => $targetCensusLinkId
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

