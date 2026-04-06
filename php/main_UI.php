<?php
// Get user data endpoint
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

// Database connection - Load from centralized config
require_once __DIR__ . '/env_loader.php';

try {
    $pdo = getDBConnection();
    if (!$pdo) {
        echo json_encode(['success' => false, 'message' => 'Database connection failed']);
        exit;
    }
    
    // Prepare and execute query to fetch user data
    $stmt = $pdo->prepare("SELECT id, first_name, middle_name, last_name, suffix, email, age, sex, birthday, civil_status, address, valid_id, id_image, profile_pic FROM resident_information WHERE email = ?");
    $stmt->execute([$email]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if ($user) {
        // Contact for forms (concerns, etc.): census head contact first, then resident mobile if column exists
        $contactPhone = null;
        $residentId = (int)($user['id'] ?? 0);
        try {
            $tableCheck = $pdo->query("SHOW TABLES LIKE 'census_form'");
            if ($tableCheck && $tableCheck->rowCount() > 0 && $residentId > 0) {
                $cStmt = $pdo->prepare(
                    "SELECT contact_number FROM census_form WHERE census_id = ? AND contact_number IS NOT NULL AND TRIM(COALESCE(contact_number, '')) != '' ORDER BY id ASC LIMIT 1"
                );
                $cStmt->execute([$residentId]);
                $cRow = $cStmt->fetch(PDO::FETCH_ASSOC);
                if ($cRow && isset($cRow['contact_number'])) {
                    $digits = preg_replace('/[^0-9]/', '', (string)$cRow['contact_number']);
                    if ($digits !== '') {
                        $contactPhone = $digits;
                    }
                }
            }
        } catch (PDOException $e) {
            error_log('main_UI.php census contact lookup: ' . $e->getMessage());
        }
        if ($contactPhone === null && $residentId > 0) {
            try {
                $mobStmt = $pdo->prepare('SELECT mobile FROM resident_information WHERE id = ? LIMIT 1');
                $mobStmt->execute([$residentId]);
                $mobRow = $mobStmt->fetch(PDO::FETCH_ASSOC);
                if ($mobRow && isset($mobRow['mobile']) && $mobRow['mobile'] !== null && trim((string)$mobRow['mobile']) !== '') {
                    $digits = preg_replace('/[^0-9]/', '', (string)$mobRow['mobile']);
                    if ($digits !== '') {
                        $contactPhone = $digits;
                    }
                }
            } catch (PDOException $e) {
                // mobile column may be absent on older schemas
            }
        }

        // Handle birthday - it could be a date object or string
        $birthday = null;
        if ($user['birthday']) {
            if (is_object($user['birthday']) && method_exists($user['birthday'], 'format')) {
                $birthday = $user['birthday']->format('Y-m-d');
            } else {
                $birthday = $user['birthday'];
            }
        }
        
        // Convert id_image to base64 if it exists
        $id_image_base64 = null;
        if (isset($user['id_image']) && $user['id_image']) {
            $id_image_base64 = base64_encode($user['id_image']);
        }
        
        // Convert profile_pic to base64 if it exists
        $profile_pic_base64 = null;
        if (isset($user['profile_pic']) && $user['profile_pic']) {
            $profile_pic_base64 = base64_encode($user['profile_pic']);
        }
        
        $userData = [
            'first_name' => $user['first_name'],
            'middle_name' => $user['middle_name'],
            'last_name' => $user['last_name'],
            'suffix' => $user['suffix'],
            'email' => $user['email'],
            'age' => $user['age'],
            'sex' => $user['sex'],
            'birthday' => $birthday,
            'civil_status' => $user['civil_status'],
            'address' => $user['address'],
            'valid_id' => $user['valid_id'],
            'id_image' => $id_image_base64,
            'profile_pic' => $profile_pic_base64,
            'contact_phone' => $contactPhone
        ];
        
        echo json_encode([
            'success' => true,
            'message' => 'User data retrieved successfully',
            'user' => $userData
        ]);
        
    } else {
        echo json_encode([
            'success' => false,
            'message' => 'User not found',
            'user' => null
        ]);
    }
    
} catch (PDOException $e) {
    error_log("Database error: " . $e->getMessage());
    echo json_encode([
        'success' => false,
        'message' => 'Database connection failed',
        'user' => null
    ]);
}
?>
