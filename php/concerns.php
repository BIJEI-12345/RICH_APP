<?php
// Concerns API - Insert concerns to database
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

// Concern submission limits per account
const MAX_TOTAL_CONCERNS_PER_ACCOUNT = 5;
const MAX_UNRESOLVED_CONCERNS_PER_ACCOUNT = 5;

// Function to get user name from email
function getUserNameFromEmail($email) {
    $pdo = getDBConnection();
    if (!$pdo) {
        return 'Unknown User';
    }
    
    try {
        $stmt = $pdo->prepare("SELECT first_name, last_name FROM resident_information WHERE email = ?");
        $stmt->execute([$email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($user) {
            return trim($user['first_name'] . ' ' . $user['last_name']);
        }
        return 'Unknown User';
    } catch (PDOException $e) {
        error_log("Failed to get user name: " . $e->getMessage());
        return 'Unknown User';
    }
}

// Count concerns and check submission eligibility
function getConcernSubmissionEligibility($email) {
    $pdo = getDBConnection();
    if (!$pdo) {
        return [
            'allowed' => false,
            'reason' => 'db_error',
            'message' => 'Database connection failed'
        ];
    }

    if (!$email) {
        return [
            'allowed' => false,
            'reason' => 'missing_email',
            'message' => 'User email is required'
        ];
    }

    try {
        $checkEmailColumn = $pdo->query("SHOW COLUMNS FROM concerns LIKE 'email'");
        $hasEmailColumn = $checkEmailColumn->rowCount() > 0;

        if ($hasEmailColumn) {
            $countSql = "
                SELECT
                    COUNT(*) AS total_count,
                    SUM(
                        CASE
                            WHEN status IS NULL OR status = '' THEN 1
                            WHEN LOWER(status) IN ('new', 'pending', 'processing', 'on process', 'in process', 'open') THEN 1
                            ELSE 0
                        END
                    ) AS unresolved_count,
                    SUM(
                        CASE
                            WHEN status IS NULL OR status = '' OR LOWER(status) IN ('new', 'pending') THEN 1
                            ELSE 0
                        END
                    ) AS new_count,
                    SUM(
                        CASE
                            WHEN LOWER(status) IN ('processing', 'on process', 'in process', 'open') THEN 1
                            ELSE 0
                        END
                    ) AS processing_count
                FROM concerns
                WHERE email = ?
            ";
            $stmt = $pdo->prepare($countSql);
            $stmt->execute([$email]);
        } else {
            $reporterName = getUserNameFromEmail($email);
            $countSql = "
                SELECT
                    COUNT(*) AS total_count,
                    SUM(
                        CASE
                            WHEN status IS NULL OR status = '' THEN 1
                            WHEN LOWER(status) IN ('new', 'pending', 'processing', 'on process', 'in process', 'open') THEN 1
                            ELSE 0
                        END
                    ) AS unresolved_count,
                    SUM(
                        CASE
                            WHEN status IS NULL OR status = '' OR LOWER(status) IN ('new', 'pending') THEN 1
                            ELSE 0
                        END
                    ) AS new_count,
                    SUM(
                        CASE
                            WHEN LOWER(status) IN ('processing', 'on process', 'in process', 'open') THEN 1
                            ELSE 0
                        END
                    ) AS processing_count
                FROM concerns
                WHERE reporter_name = ?
            ";
            $stmt = $pdo->prepare($countSql);
            $stmt->execute([$reporterName]);
        }

        $counts = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
        $totalCount = (int)($counts['total_count'] ?? 0);
        $unresolvedCount = (int)($counts['unresolved_count'] ?? 0);
        $newCount = (int)($counts['new_count'] ?? 0);
        $processingCount = (int)($counts['processing_count'] ?? 0);
        $statusBreakdown = [
            'new' => $newCount,
            'processing' => $processingCount,
        ];

        if ($unresolvedCount >= MAX_UNRESOLVED_CONCERNS_PER_ACCOUNT) {
            return [
                'allowed' => false,
                'reason' => 'unresolved_limit',
                'message' => 'You already have 5 active concerns (New/Processing). Please wait until at least one concern is resolved before submitting again.',
                'total_count' => $totalCount,
                'unresolved_count' => $unresolvedCount,
                'max_total' => MAX_TOTAL_CONCERNS_PER_ACCOUNT,
                'max_unresolved' => MAX_UNRESOLVED_CONCERNS_PER_ACCOUNT,
                'status_breakdown' => $statusBreakdown,
            ];
        }

        return [
            'allowed' => true,
            'total_count' => $totalCount,
            'unresolved_count' => $unresolvedCount,
            'max_total' => MAX_TOTAL_CONCERNS_PER_ACCOUNT,
            'max_unresolved' => MAX_UNRESOLVED_CONCERNS_PER_ACCOUNT,
            'status_breakdown' => $statusBreakdown,
        ];
    } catch (PDOException $e) {
        error_log("Concern eligibility check failed: " . $e->getMessage());
        return [
            'allowed' => false,
            'reason' => 'db_error',
            'message' => 'Unable to validate concern submission limits'
        ];
    }
}

// Function to insert concern
function insertConcern($data) {
    $pdo = getDBConnection();
    if (!$pdo) {
        error_log("Concern: Database connection failed");
        return ['success' => false, 'message' => 'Database connection failed'];
    }
    
    try {
        // Debug: Log received data
        error_log("Concern data received: " . json_encode($data));
        
        // Validate required fields
        $requiredFields = ['contact', 'location', 'statement'];
        foreach ($requiredFields as $field) {
            if (empty($data[$field])) {
                error_log("Concern: Missing required field: $field");
                return ['success' => false, 'message' => "Missing required field: $field"];
            }
        }
        
        // Auto-populate reporter_name from email
        $userEmail = trim((string)($data['user_email'] ?? ''));
        if (!$userEmail) {
            return ['success' => false, 'message' => 'User email is required'];
        }

        // Enforce per-account submission limits before insert
        $eligibility = getConcernSubmissionEligibility($userEmail);
        if (empty($eligibility['allowed'])) {
            return [
                'success' => false,
                'blocked' => true,
                'reason' => $eligibility['reason'] ?? 'blocked',
                'message' => $eligibility['message'] ?? 'Concern submission is currently restricted.',
                'limit_info' => [
                    'total_count' => (int)($eligibility['total_count'] ?? 0),
                    'unresolved_count' => (int)($eligibility['unresolved_count'] ?? 0),
                    'max_total' => (int)($eligibility['max_total'] ?? MAX_TOTAL_CONCERNS_PER_ACCOUNT),
                    'max_unresolved' => (int)($eligibility['max_unresolved'] ?? MAX_UNRESOLVED_CONCERNS_PER_ACCOUNT),
                    'status_breakdown' => $eligibility['status_breakdown'] ?? ['new' => 0, 'processing' => 0],
                ]
            ];
        }

        $reporterName = getUserNameFromEmail($userEmail);
        
        // Validate contact number length (max 11 digits)
        if (!empty($data['contact'])) {
            $contactNumber = preg_replace('/[^0-9]/', '', $data['contact']);
            if (strlen($contactNumber) > 11) {
                return ['success' => false, 'message' => 'Contact number must be 11 digits or less'];
            }
            $data['contact'] = $contactNumber;
        }
        
        // Handle image upload (optional)
        $imageData = null;
        if (!empty($data['image_data'])) {
            // Decode base64 image data
            $imageData = base64_decode($data['image_data']);
        }
        
        // Set Philippine Time for timestamp
        date_default_timezone_set('Asia/Manila');
        $philippineTime = date('Y-m-d H:i:s');
        
        // Get email from data
        $email = $data['user_email'] ?? null;
        
        // Check if email column exists
        $checkColumn = $pdo->query("SHOW COLUMNS FROM concerns LIKE 'email'");
        $emailColumnExists = $checkColumn->rowCount() > 0;
        $checkRating = $pdo->query("SHOW COLUMNS FROM concerns LIKE 'rating'");
        $ratingColumnExists = $checkRating && $checkRating->rowCount() > 0;
        
        if ($emailColumnExists && $email) {
            // Prepare the insert statement with email
            if ($ratingColumnExists) {
                $stmt = $pdo->prepare("
                    INSERT INTO concerns 
                    (email, concern_image, reporter_name, contact, date_and_time, location, statement, status, rating) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
                ");
            } else {
                $stmt = $pdo->prepare("
                    INSERT INTO concerns 
                    (email, concern_image, reporter_name, contact, date_and_time, location, statement, status) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ");
            }
            
            // Execute the insert
            $result = $stmt->execute([
                $email,
                $imageData,
                $reporterName,
                $data['contact'],
                $philippineTime,
                $data['location'],
                $data['statement'],
                'new'
            ]);
        } else {
            // Prepare the insert statement without email (for backward compatibility)
            if ($ratingColumnExists) {
                $stmt = $pdo->prepare("
                    INSERT INTO concerns 
                    (concern_image, reporter_name, contact, date_and_time, location, statement, status, rating) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
                ");
            } else {
                $stmt = $pdo->prepare("
                    INSERT INTO concerns 
                    (concern_image, reporter_name, contact, date_and_time, location, statement, status) 
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ");
            }
            
            // Execute the insert
            $result = $stmt->execute([
                $imageData,
                $reporterName,
                $data['contact'],
                $philippineTime,
                $data['location'],
                $data['statement'],
                'new'
            ]);
        }
        
        if ($result) {
            $concernId = $pdo->lastInsertId();
            error_log("Concern inserted successfully with ID: $concernId");
            return [
                'success' => true,
                'message' => 'Concern submitted successfully',
                'concern_id' => $concernId
            ];
        } else {
            error_log("Concern: Failed to insert - execute returned false");
            return ['success' => false, 'message' => 'Failed to insert concern'];
        }
        
    } catch (PDOException $e) {
        error_log("Failed to insert concern: " . $e->getMessage());
        return ['success' => false, 'message' => 'Failed to insert concern'];
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
    
    // Check if this is a get_user_name request
    if (isset($input['action']) && $input['action'] === 'get_user_name') {
        $userEmail = $input['user_email'] ?? '';
        $reporterName = getUserNameFromEmail($userEmail);
        echo json_encode([
            'success' => true,
            'reporter_name' => $reporterName
        ]);
        exit;
    }

    // Check if this is a concern eligibility request
    if (isset($input['action']) && $input['action'] === 'check_submission_eligibility') {
        $userEmail = trim((string)($input['user_email'] ?? ''));
        $eligibility = getConcernSubmissionEligibility($userEmail);
        echo json_encode([
            'success' => true,
            'allowed' => !empty($eligibility['allowed']),
            'reason' => $eligibility['reason'] ?? null,
            'message' => $eligibility['message'] ?? null,
            'limit_info' => [
                'total_count' => (int)($eligibility['total_count'] ?? 0),
                'unresolved_count' => (int)($eligibility['unresolved_count'] ?? 0),
                'max_total' => (int)($eligibility['max_total'] ?? MAX_TOTAL_CONCERNS_PER_ACCOUNT),
                'max_unresolved' => (int)($eligibility['max_unresolved'] ?? MAX_UNRESOLVED_CONCERNS_PER_ACCOUNT),
                'status_breakdown' => $eligibility['status_breakdown'] ?? ['new' => 0, 'processing' => 0],
            ]
        ]);
        exit;
    }
    
    // Check if this is a get_user_name_direct request (fallback)
    if (isset($input['action']) && $input['action'] === 'get_user_name_direct') {
        $userEmail = $input['user_email'] ?? '';
        $reporterName = getUserNameFromEmail($userEmail);
        echo json_encode([
            'success' => true,
            'reporter_name' => $reporterName
        ]);
        exit;
    }
    
    // Insert the concern
    $result = insertConcern($input);
    
    echo json_encode($result);
    
} catch (Exception $e) {
    error_log("Unexpected error: " . $e->getMessage());
    echo json_encode(['success' => false, 'message' => 'An unexpected error occurred']);
}
?>
