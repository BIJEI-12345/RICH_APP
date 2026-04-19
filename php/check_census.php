<?php
// Check Census Status API - Check if user has completed census
// Set Philippine Timezone
date_default_timezone_set('Asia/Manila');

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

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
require_once __DIR__ . '/census_address_helpers.php';

/**
 * Detect whether a census row is archived using common archive flag columns.
 */
function isArchivedCensusRow(array $row): bool {
    $archiveColumns = ['is_archived', 'archived', 'archive_status', 'status', 'record_status', 'state'];
    foreach ($archiveColumns as $column) {
        if (!array_key_exists($column, $row)) {
            continue;
        }
        $raw = $row[$column];
        if ($raw === null) {
            continue;
        }
        if (is_numeric($raw) && (int)$raw === 1 && in_array($column, ['is_archived', 'archived'], true)) {
            return true;
        }
        $value = strtolower(trim((string)$raw));
        if ($value === '') {
            continue;
        }
        if (in_array($value, ['archived', 'archive', 'inactive', 'disabled'], true)) {
            return true;
        }
    }
    return false;
}

function censusIdentityText($value): string {
    return mb_strtolower(trim((string) $value), 'UTF-8');
}

function censusIdentityDate($value): string {
    $value = trim((string) ($value ?? ''));
    if ($value === '') {
        return '';
    }
    $ts = strtotime($value);
    if ($ts !== false) {
        return date('Y-m-d', $ts);
    }
    return censusIdentityText($value);
}

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
    $censusLinkId = census_id_for_resident_pk($userId);
    
    // Get user's identity and address from resident_information
    $stmt = $pdo->prepare("SELECT first_name, last_name, birthday, address FROM resident_information WHERE id = ?");
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
    
    $userFirstName = trim($userInfo['first_name'] ?? '');
    $userLastName = trim($userInfo['last_name'] ?? '');
    $userBirthday = trim((string) ($userInfo['birthday'] ?? ''));
    $userAddress = trim($userInfo['address'] ?? '');
    
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
        // Discover archive-related columns first so we can evaluate archived rows safely.
        $archiveColumns = [];
        $existingColumns = [];
        $columnsStmt = $pdo->query("SHOW COLUMNS FROM census_form");
        if ($columnsStmt) {
            $existingColumns = $columnsStmt->fetchAll(PDO::FETCH_COLUMN);
        }
        foreach (['is_archived', 'archived', 'archive_status', 'status', 'record_status', 'state'] as $candidate) {
            if (in_array($candidate, $existingColumns, true)) {
                $archiveColumns[] = $candidate;
            }
        }

        // First, check if census exists for this exact resident identity (not just any household row).
        $selectColumns = 'id, first_name, last_name, birthday, complete_address';
        if (!empty($archiveColumns)) {
            $selectColumns .= ', ' . implode(', ', $archiveColumns);
        }
        $stmt = $pdo->prepare("SELECT $selectColumns FROM census_form WHERE census_id = ?");
        $stmt->execute([$censusLinkId]);
        $censusRows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $isArchived = false;
        $hasCompletedCensus = false;
        $expectedFirst = censusIdentityText($userFirstName);
        $expectedLast = censusIdentityText($userLastName);
        $expectedBirthday = censusIdentityDate($userBirthday);
        foreach ($censusRows as $census) {
            $firstOk = censusIdentityText($census['first_name'] ?? '') === $expectedFirst;
            $lastOk = censusIdentityText($census['last_name'] ?? '') === $expectedLast;
            if (!$firstOk || !$lastOk) {
                continue;
            }

            $birthdayOk = true;
            if ($expectedBirthday !== '') {
                $birthdayOk = censusIdentityDate($census['birthday'] ?? '') === $expectedBirthday;
            }
            if (!$birthdayOk) {
                continue;
            }

            if ($userAddress !== '') {
                $recordAddress = trim((string) ($census['complete_address'] ?? ''));
                if ($recordAddress !== '' && !censusAddressesLikelyMatch($userAddress, $recordAddress)) {
                    continue;
                }
            }

            if (isArchivedCensusRow($census)) {
                $isArchived = true;
                continue;
            }

            $hasCompletedCensus = true;
            $isArchived = false;
            break;
        }
        
        // Same last name + resident address matches census_form.complete_address (fuzzy), another household row
        // Exclude the user's own census row (census_id != this user)
        $isAlreadyCensused = false;
        if ($userLastName !== '' && $userAddress !== '') {
            $stmt = $pdo->prepare("SELECT id, last_name, complete_address FROM census_form WHERE census_id != ?");
            $stmt->execute([$censusLinkId]);
            $allCensusRecords = $stmt->fetchAll(PDO::FETCH_ASSOC);

            foreach ($allCensusRecords as $record) {
                $censusLastName = trim((string)($record['last_name'] ?? ''));
                $censusComplete = trim((string)($record['complete_address'] ?? ''));

                if ($censusComplete === '') {
                    continue;
                }

                if (strcasecmp($userLastName, $censusLastName) !== 0) {
                    continue;
                }

                if (censusAddressesLikelyMatch($userAddress, $censusComplete)) {
                    $isAlreadyCensused = true;
                    break;
                }
            }
        }
        
        echo json_encode([
            'success' => true,
            'emailExists' => true,
            'hasCompletedCensus' => $hasCompletedCensus,
            'isArchived' => $isArchived,
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

