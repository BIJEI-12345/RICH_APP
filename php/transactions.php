<?php
// Transactions PHP Backend - Unified view of all user requests

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Database configuration - Using the same connection as other PHP files
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
        return $pdo;
} catch (PDOException $e) {
        error_log("Database connection failed: " . $e->getMessage());
        return null;
    }
}

$pdo = getDBConnection();
if (!$pdo) {
    echo json_encode(['success' => false, 'message' => 'Database connection failed']);
    exit;
}

// Handle different actions
$action = $_GET['action'] ?? $_POST['action'] ?? 'list';

switch ($action) {
    case 'list':
        listTransactions($pdo);
        break;
    case 'download':
        downloadDocument($pdo);
        break;
    case 'cancel':
        cancelTransaction($pdo);
        break;
    default:
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
        break;
}

// List all transactions for the user from all request types
function listTransactions($pdo) {
    try {
        // Start session to get logged-in user
        session_start();
        
        // Get user email from session (logged-in user) or fallback to request param
        $userEmail = $_SESSION['user_email'] ?? null;
        if (!$userEmail) {
            // Fallbacks for non-session contexts (e.g., opened page directly)
            $userEmail = $_GET['user_email'] ?? $_POST['user_email'] ?? null;
        }
        
        error_log("Session user_email: " . ($userEmail ?? 'NULL'));
        error_log("All session data: " . json_encode($_SESSION));
        
        if (!$userEmail) {
            echo json_encode([
                'success' => false,
                'message' => 'Please log in first to view your transactions.',
                'transactions' => []
            ]);
            return;
        }
        
        // Get user ID from email
        $userStmt = $pdo->prepare("SELECT id, first_name, last_name FROM resident_information WHERE email = ?");
        $userStmt->execute([$userEmail]);
        $user = $userStmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$user) {
            echo json_encode([
                'success' => false,
                'message' => 'User not found. Please check your email or register first.',
                'transactions' => []
            ]);
            return;
        }
        
        $userId = $user['id'];
        $userName = trim($user['first_name'] . ' ' . $user['last_name']);
        
        // Debug: Log user information
        error_log("User Email: " . $userEmail);
        error_log("User ID: " . $userId);
        error_log("User Name: '" . $userName . "'");
        
        // Debug: Check what names exist in the database
        $nameCheckStmt = $pdo->prepare("SELECT DISTINCT reporter_name FROM concerns LIMIT 10");
        $nameCheckStmt->execute();
        $concernNames = $nameCheckStmt->fetchAll(PDO::FETCH_COLUMN);
        error_log("Names in concerns table: " . json_encode($concernNames));
        
        $emergencyNameCheckStmt = $pdo->prepare("SELECT DISTINCT reporter_name FROM emergency_reports LIMIT 10");
        $emergencyNameCheckStmt->execute();
        $emergencyNames = $emergencyNameCheckStmt->fetchAll(PDO::FETCH_COLUMN);
        error_log("Names in emergency_reports table: " . json_encode($emergencyNames));
        
        $allTransactions = [];
        
        // Fetch concerns - Check if email column exists, if yes query directly by email, otherwise use JOIN
        $checkEmailColumn = $pdo->query("SHOW COLUMNS FROM concerns LIKE 'email'");
        $hasEmailColumn = $checkEmailColumn->rowCount() > 0;
        
        if ($hasEmailColumn) {
            $concernsStmt = $pdo->prepare("
                SELECT 
                    CONCAT('CONC-', c.id) as id,
                    'Community Concern' as document_type,
                    CONCAT('CONC-', LPAD(c.id, 6, '0')) as reference_number,
                    CASE 
                        WHEN c.status IS NULL OR c.status = '' THEN 'New'
                        WHEN c.status = 'pending' THEN 'New'
                        WHEN c.status = 'processing' THEN 'Processing'
                        WHEN c.status = 'resolved' THEN 'Finished'
                        WHEN c.status = 'cancelled' THEN 'cancelled'
                        ELSE c.status
                    END as status,
                    c.date_and_time as request_date,
                    c.process_at as processing_date,
                    c.resolved_at as completion_date,
                    c.statement as notes,
                    c.statement,
                    NULL as document_url,
                    c.date_and_time as created_at,
                    c.date_and_time as updated_at,
                    'concern' as request_type
                FROM concerns c
                WHERE c.email = ?
                ORDER BY c.date_and_time DESC
            ");
            $concernsStmt->execute([$userEmail]);
        } else {
            $concernsStmt = $pdo->prepare("
                SELECT 
                    CONCAT('CONC-', c.id) as id,
                    'Community Concern' as document_type,
                    CONCAT('CONC-', LPAD(c.id, 6, '0')) as reference_number,
                    CASE 
                        WHEN c.status IS NULL OR c.status = '' THEN 'New'
                        WHEN c.status = 'pending' THEN 'New'
                        WHEN c.status = 'processing' THEN 'Processing'
                        WHEN c.status = 'resolved' THEN 'Finished'
                        WHEN c.status = 'cancelled' THEN 'cancelled'
                        ELSE c.status
                    END as status,
                    c.date_and_time as request_date,
                    c.process_at as processing_date,
                    c.resolved_at as completion_date,
                    c.statement as notes,
                    c.statement,
                    NULL as document_url,
                    c.date_and_time as created_at,
                    c.date_and_time as updated_at,
                    'concern' as request_type
                FROM concerns c
                INNER JOIN resident_information r ON c.reporter_name = CONCAT(TRIM(r.first_name), ' ', TRIM(r.last_name))
                WHERE r.email = ?
                ORDER BY c.date_and_time DESC
            ");
            $concernsStmt->execute([$userEmail]);
        }
        $concerns = $concernsStmt->fetchAll(PDO::FETCH_ASSOC);
        error_log("Concerns found for email '" . $userEmail . "': " . count($concerns));
        foreach ($concerns as $concern) {
            error_log("Concern ID: " . $concern['id'] . ", Type: " . $concern['document_type'] . ", Request Type: " . $concern['request_type'] . ", Statement: " . $concern['statement']);
        }
        $allTransactions = array_merge($allTransactions, $concerns);
        
        // Fetch emergency reports - Check if email column exists, if yes query directly by email, otherwise use JOIN
        $checkEmailColumn = $pdo->query("SHOW COLUMNS FROM emergency_reports LIKE 'email'");
        $hasEmailColumn = $checkEmailColumn->rowCount() > 0;
        
        if ($hasEmailColumn) {
            $emergencyStmt = $pdo->prepare("
                SELECT 
                    CONCAT('EMRG-', e.id) as id,
                    CONCAT('Emergency: ', e.emergency_type) as document_type,
                    CONCAT('EMRG-', LPAD(e.id, 6, '0')) as reference_number,
                    CASE 
                        WHEN e.status IS NULL OR e.status = '' THEN 'New'
                        WHEN e.status = 'New' THEN 'New'
                        WHEN e.status = 'pending' THEN 'New'
                        WHEN e.status = 'processing' THEN 'Processing'
                        WHEN e.status = 'resolved' THEN 'Finished'
                        WHEN e.status = 'cancelled' THEN 'cancelled'
                        ELSE e.status
                    END as status,
                    e.date_and_time as request_date,
                    NULL as processing_date,
                    e.resolved_datetime as completion_date,
                    e.description as notes,
                    e.emergency_type,
                    NULL as document_url,
                    e.date_and_time as created_at,
                    e.date_and_time as updated_at,
                    'emergency' as request_type
                FROM emergency_reports e
                WHERE e.email = ?
                ORDER BY e.date_and_time DESC
            ");
            $emergencyStmt->execute([$userEmail]);
        } else {
            $emergencyStmt = $pdo->prepare("
                SELECT 
                    CONCAT('EMRG-', e.id) as id,
                    CONCAT('Emergency: ', e.emergency_type) as document_type,
                    CONCAT('EMRG-', LPAD(e.id, 6, '0')) as reference_number,
                    CASE 
                        WHEN e.status IS NULL OR e.status = '' THEN 'New'
                        WHEN e.status = 'New' THEN 'New'
                        WHEN e.status = 'pending' THEN 'New'
                        WHEN e.status = 'processing' THEN 'Processing'
                        WHEN e.status = 'resolved' THEN 'Finished'
                        WHEN e.status = 'cancelled' THEN 'cancelled'
                        ELSE e.status
                    END as status,
                    e.date_and_time as request_date,
                    NULL as processing_date,
                    e.resolved_datetime as completion_date,
                    e.description as notes,
                    e.emergency_type,
                    NULL as document_url,
                    e.date_and_time as created_at,
                    e.date_and_time as updated_at,
                    'emergency' as request_type
                FROM emergency_reports e
                INNER JOIN resident_information r ON e.reporter_name = CONCAT(TRIM(r.first_name), ' ', TRIM(r.last_name))
                WHERE r.email = ?
                ORDER BY e.date_and_time DESC
            ");
            $emergencyStmt->execute([$userEmail]);
        }
        $emergencies = $emergencyStmt->fetchAll(PDO::FETCH_ASSOC);
        error_log("Emergency reports found for email '" . $userEmail . "': " . count($emergencies));
        
        // Debug: Show each emergency report
        foreach ($emergencies as $emergency) {
            error_log("Emergency ID: " . $emergency['id'] . ", Type: " . $emergency['document_type'] . ", Status: " . $emergency['status']);
        }
        
        $allTransactions = array_merge($allTransactions, $emergencies);
        
        // Fetch indigency forms - Check if email column exists, if yes query directly by email, otherwise use JOIN
        $checkEmailColumn = $pdo->query("SHOW COLUMNS FROM indigency_forms LIKE 'email'");
        $hasEmailColumn = $checkEmailColumn->rowCount() > 0;
        
        if ($hasEmailColumn) {
            $indigencyStmt = $pdo->prepare("
                SELECT 
                    CONCAT('INDG-', id) as id,
                    'Certificate of Indigency' as document_type,
                    CONCAT('INDG-', LPAD(id, 6, '0')) as reference_number,
                    CASE 
                        WHEN status IS NULL OR status = '' THEN 'New'
                        WHEN status = 'pending' THEN 'New'
                        WHEN status = 'processing' THEN 'Processing'
                        WHEN status = 'completed' THEN 'Finished'
                        WHEN status = 'cancelled' THEN 'cancelled'
                        ELSE status
                    END as status,
                    submitted_at as request_date,
                    process_at as processing_date,
                    finish_at as completion_date,
                    purpose as notes,
                    NULL as document_url,
                    submitted_at as created_at,
                    submitted_at as updated_at,
                    'indigency' as request_type
                FROM indigency_forms 
                WHERE email = ?
                ORDER BY submitted_at DESC
            ");
            $indigencyStmt->execute([$userEmail]);
        } else {
            $indigencyStmt = $pdo->prepare("
                SELECT 
                    CONCAT('INDG-', i.id) as id,
                    'Certificate of Indigency' as document_type,
                    CONCAT('INDG-', LPAD(i.id, 6, '0')) as reference_number,
                    CASE 
                        WHEN i.status IS NULL OR i.status = '' THEN 'New'
                        WHEN i.status = 'pending' THEN 'New'
                        WHEN i.status = 'processing' THEN 'Processing'
                        WHEN i.status = 'completed' THEN 'Finished'
                        WHEN i.status = 'cancelled' THEN 'cancelled'
                        ELSE i.status
                    END as status,
                    i.submitted_at as request_date,
                    i.process_at as processing_date,
                    i.finish_at as completion_date,
                    i.purpose as notes,
                    NULL as document_url,
                    i.submitted_at as created_at,
                    i.submitted_at as updated_at,
                    'indigency' as request_type
                FROM indigency_forms i
                INNER JOIN resident_information r ON CONCAT(TRIM(r.first_name), ' ', TRIM(r.last_name)) = CONCAT(TRIM(i.first_name), ' ', TRIM(i.last_name))
                WHERE r.email = ?
                ORDER BY i.submitted_at DESC
            ");
            $indigencyStmt->execute([$userEmail]);
        }
        $indigencyForms = $indigencyStmt->fetchAll(PDO::FETCH_ASSOC);
        error_log("Indigency forms found for email '" . $userEmail . "': " . count($indigencyForms));
        $allTransactions = array_merge($allTransactions, $indigencyForms);
        
        // Fetch barangay ID forms - Check if email column exists, if yes query directly by email, otherwise use JOIN
        $checkEmailColumn = $pdo->query("SHOW COLUMNS FROM barangay_id_forms LIKE 'email'");
        $hasEmailColumn = $checkEmailColumn->rowCount() > 0;
        
        if ($hasEmailColumn) {
            $barangayIdStmt = $pdo->prepare("
                SELECT 
                    CONCAT('BID-', id) as id,
                    'Barangay ID' as document_type,
                    CONCAT('BID-', LPAD(id, 6, '0')) as reference_number,
                    CASE 
                        WHEN status IS NULL OR status = '' THEN 'New'
                        WHEN status = 'pending' THEN 'New'
                        WHEN status = 'processing' THEN 'Processing'
                        WHEN status = 'completed' THEN 'Finished'
                        WHEN status = 'cancelled' THEN 'cancelled'
                        ELSE status
                    END as status,
                    submitted_at as request_date,
                    process_at as processing_date,
                    finish_at as completion_date,
                    valid_id as notes,
                    NULL as document_url,
                    submitted_at as created_at,
                    submitted_at as updated_at,
                    'barangay_id' as request_type
                FROM barangay_id_forms 
                WHERE email = ?
                ORDER BY submitted_at DESC
            ");
            $barangayIdStmt->execute([$userEmail]);
        } else {
            $barangayIdStmt = $pdo->prepare("
                SELECT 
                    CONCAT('BID-', b.id) as id,
                    'Barangay ID' as document_type,
                    CONCAT('BID-', LPAD(b.id, 6, '0')) as reference_number,
                    CASE 
                        WHEN b.status IS NULL OR b.status = '' THEN 'New'
                        WHEN b.status = 'pending' THEN 'New'
                        WHEN b.status = 'processing' THEN 'Processing'
                        WHEN b.status = 'completed' THEN 'Finished'
                        WHEN b.status = 'cancelled' THEN 'cancelled'
                        ELSE b.status
                    END as status,
                    b.submitted_at as request_date,
                    b.process_at as processing_date,
                    b.finish_at as completion_date,
                    b.valid_id as notes,
                    NULL as document_url,
                    b.submitted_at as created_at,
                    b.submitted_at as updated_at,
                    'barangay_id' as request_type
                FROM barangay_id_forms b
                INNER JOIN resident_information r ON CONCAT(TRIM(r.first_name), ' ', TRIM(r.last_name)) = CONCAT(TRIM(b.given_name), ' ', TRIM(b.last_name))
                WHERE r.email = ?
                ORDER BY b.submitted_at DESC
            ");
            $barangayIdStmt->execute([$userEmail]);
        }
        $barangayIdForms = $barangayIdStmt->fetchAll(PDO::FETCH_ASSOC);
        error_log("Barangay ID forms found for email '" . $userEmail . "': " . count($barangayIdForms));
        $allTransactions = array_merge($allTransactions, $barangayIdForms);
        
        // Fetch certification forms - Check if email column exists, if yes query directly by email, otherwise use JOIN
        $checkEmailColumn = $pdo->query("SHOW COLUMNS FROM certification_forms LIKE 'email'");
        $hasEmailColumn = $checkEmailColumn->rowCount() > 0;
        
        if ($hasEmailColumn) {
            $certificationStmt = $pdo->prepare("
                SELECT 
                    CONCAT('CERT-', id) as id,
                    'Certification' as document_type,
                    CONCAT('CERT-', LPAD(id, 6, '0')) as reference_number,
                    CASE 
                        WHEN status IS NULL OR status = '' THEN 'New'
                        WHEN status = 'pending' THEN 'New'
                        WHEN status = 'processing' THEN 'Processing'
                        WHEN status = 'completed' THEN 'Finished'
                        WHEN status = 'cancelled' THEN 'cancelled'
                        ELSE status
                    END as status,
                    submitted_at as request_date,
                    process_at as processing_date,
                    finish_at as completion_date,
                    purpose as notes,
                    NULL as document_url,
                    submitted_at as created_at,
                    submitted_at as updated_at,
                    'certification' as request_type
                FROM certification_forms 
                WHERE email = ?
                ORDER BY submitted_at DESC
            ");
            $certificationStmt->execute([$userEmail]);
        } else {
            $certificationStmt = $pdo->prepare("
                SELECT 
                    CONCAT('CERT-', c.id) as id,
                    'Certification' as document_type,
                    CONCAT('CERT-', LPAD(c.id, 6, '0')) as reference_number,
                    CASE 
                        WHEN c.status IS NULL OR c.status = '' THEN 'New'
                        WHEN c.status = 'pending' THEN 'New'
                        WHEN c.status = 'processing' THEN 'Processing'
                        WHEN c.status = 'completed' THEN 'Finished'
                        WHEN c.status = 'cancelled' THEN 'cancelled'
                        ELSE c.status
                    END as status,
                    c.submitted_at as request_date,
                    c.process_at as processing_date,
                    c.finish_at as completion_date,
                    c.purpose as notes,
                    NULL as document_url,
                    c.submitted_at as created_at,
                    c.submitted_at as updated_at,
                    'certification' as request_type
                FROM certification_forms c
                INNER JOIN resident_information r ON CONCAT(TRIM(r.first_name), ' ', TRIM(r.last_name)) = CONCAT(TRIM(c.first_name), ' ', TRIM(c.last_name))
                WHERE r.email = ?
                ORDER BY c.submitted_at DESC
            ");
            $certificationStmt->execute([$userEmail]);
        }
        $certificationForms = $certificationStmt->fetchAll(PDO::FETCH_ASSOC);
        error_log("Certification forms found for email '" . $userEmail . "': " . count($certificationForms));
        $allTransactions = array_merge($allTransactions, $certificationForms);
        
        // Fetch COE forms - Check if email column exists, if yes query directly by email, otherwise use JOIN
        $checkEmailColumn = $pdo->query("SHOW COLUMNS FROM coe_forms LIKE 'email'");
        $hasEmailColumn = $checkEmailColumn->rowCount() > 0;
        
        if ($hasEmailColumn) {
            $coeStmt = $pdo->prepare("
                SELECT 
                    CONCAT('COE-', id) as id,
                    'Certificate of Employment' as document_type,
                    CONCAT('COE-', LPAD(id, 6, '0')) as reference_number,
                    CASE 
                        WHEN status IS NULL OR status = '' THEN 'New'
                        WHEN status = 'pending' THEN 'New'
                        WHEN status = 'processing' THEN 'Processing'
                        WHEN status = 'completed' THEN 'Finished'
                        WHEN status = 'cancelled' THEN 'cancelled'
                        ELSE status
                    END as status,
                    submitted_at as request_date,
                    process_at as processing_date,
                    finish_at as completion_date,
                    position as notes,
                    NULL as document_url,
                    submitted_at as created_at,
                    submitted_at as updated_at,
                    'coe' as request_type
                FROM coe_forms 
                WHERE email = ?
                ORDER BY submitted_at DESC
            ");
            $coeStmt->execute([$userEmail]);
        } else {
            $coeStmt = $pdo->prepare("
                SELECT 
                    CONCAT('COE-', coe.id) as id,
                    'Certificate of Employment' as document_type,
                    CONCAT('COE-', LPAD(coe.id, 6, '0')) as reference_number,
                    CASE 
                        WHEN coe.status IS NULL OR coe.status = '' THEN 'New'
                        WHEN coe.status = 'pending' THEN 'New'
                        WHEN coe.status = 'processing' THEN 'Processing'
                        WHEN coe.status = 'completed' THEN 'Finished'
                        WHEN coe.status = 'cancelled' THEN 'cancelled'
                        ELSE coe.status
                    END as status,
                    coe.submitted_at as request_date,
                    coe.process_at as processing_date,
                    coe.finish_at as completion_date,
                    coe.position as notes,
                    NULL as document_url,
                    coe.submitted_at as created_at,
                    coe.submitted_at as updated_at,
                    'coe' as request_type
                FROM coe_forms coe
                INNER JOIN resident_information r ON CONCAT(TRIM(r.first_name), ' ', TRIM(r.last_name)) = CONCAT(TRIM(coe.first_name), ' ', TRIM(coe.last_name))
                WHERE r.email = ?
                ORDER BY coe.submitted_at DESC
            ");
            $coeStmt->execute([$userEmail]);
        }
        $coeForms = $coeStmt->fetchAll(PDO::FETCH_ASSOC);
        error_log("COE forms found for email '" . $userEmail . "': " . count($coeForms));
        $allTransactions = array_merge($allTransactions, $coeForms);
        
        // Fetch clearance forms - Check if email column exists, if yes query directly by email, otherwise use JOIN
        $checkEmailColumn = $pdo->query("SHOW COLUMNS FROM clearance_forms LIKE 'email'");
        $hasEmailColumn = $checkEmailColumn->rowCount() > 0;
        
        if ($hasEmailColumn) {
            $clearanceStmt = $pdo->prepare("
                SELECT 
                    CONCAT('CLR-', id) as id,
                    'Clearance Certificate' as document_type,
                    CONCAT('CLR-', LPAD(id, 6, '0')) as reference_number,
                    CASE 
                        WHEN status IS NULL OR status = '' THEN 'New'
                        WHEN status = 'pending' THEN 'New'
                        WHEN status = 'processing' THEN 'Processing'
                        WHEN status = 'completed' THEN 'Finished'
                        WHEN status = 'cancelled' THEN 'cancelled'
                        ELSE status
                    END as status,
                    submitted_at as request_date,
                    process_at as processing_date,
                    finish_at as completion_date,
                    purpose as notes,
                    NULL as document_url,
                    submitted_at as created_at,
                    submitted_at as updated_at,
                    'clearance' as request_type
                FROM clearance_forms 
                WHERE email = ?
                ORDER BY submitted_at DESC
            ");
            $clearanceStmt->execute([$userEmail]);
        } else {
            $clearanceStmt = $pdo->prepare("
                SELECT 
                    CONCAT('CLR-', cl.id) as id,
                    'Clearance Certificate' as document_type,
                    CONCAT('CLR-', LPAD(cl.id, 6, '0')) as reference_number,
                    CASE 
                        WHEN cl.status IS NULL OR cl.status = '' THEN 'New'
                        WHEN cl.status = 'pending' THEN 'New'
                        WHEN cl.status = 'processing' THEN 'Processing'
                        WHEN cl.status = 'completed' THEN 'Finished'
                        WHEN cl.status = 'cancelled' THEN 'cancelled'
                        ELSE cl.status
                    END as status,
                    cl.submitted_at as request_date,
                    cl.process_at as processing_date,
                    cl.finish_at as completion_date,
                    cl.purpose as notes,
                    NULL as document_url,
                    cl.submitted_at as created_at,
                    cl.submitted_at as updated_at,
                    'clearance' as request_type
                FROM clearance_forms cl
                INNER JOIN resident_information r ON CONCAT(TRIM(r.first_name), ' ', TRIM(r.last_name)) = CONCAT(TRIM(cl.first_name), ' ', TRIM(cl.last_name))
                WHERE r.email = ?
                ORDER BY cl.submitted_at DESC
            ");
            $clearanceStmt->execute([$userEmail]);
        }
        $clearanceForms = $clearanceStmt->fetchAll(PDO::FETCH_ASSOC);
        error_log("Clearance forms found for email '" . $userEmail . "': " . count($clearanceForms));
        $allTransactions = array_merge($allTransactions, $clearanceForms);
        
        // Sort all transactions by creation date (newest first)
        usort($allTransactions, function($a, $b) {
            return strtotime($b['created_at']) - strtotime($a['created_at']);
        });
        
        // Debug: Log status values
        error_log("TOTAL TRANSACTIONS FOR EMAIL '" . $userEmail . "': " . count($allTransactions));
        $statusCounts = array_count_values(array_column($allTransactions, 'status'));
        error_log("Status counts for email: " . json_encode($statusCounts));
        
        // Debug: Show which transactions belong to this email
        foreach ($allTransactions as $transaction) {
            error_log("Transaction ID: " . $transaction['id'] . ", Type: " . $transaction['document_type'] . ", Status: " . $transaction['status']);
        }
        
        echo json_encode([
            'success' => true,
            'transactions' => $allTransactions,
            'user_name' => $userName,
            'total_count' => count($allTransactions)
        ]);
        
    } catch (PDOException $e) {
        error_log("Failed to fetch transactions: " . $e->getMessage());
        echo json_encode([
            'success' => false,
            'message' => 'Failed to fetch transactions: ' . $e->getMessage()
        ]);
    }
}

// Download document
function downloadDocument($pdo) {
    try {
        $transactionId = $_GET['id'] ?? null;
        
        if (!$transactionId) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Transaction ID required']);
            return;
        }
        
        $stmt = $pdo->prepare("
            SELECT document_url, document_type, reference_number
            FROM transactions 
            WHERE id = ? AND status = 'completed'
        ");
        
        $stmt->execute([$transactionId]);
        $transaction = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$transaction) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Document not found']);
            return;
        }
        
        $documentPath = $transaction['document_url'];
        
        if (file_exists($documentPath)) {
            header('Content-Type: application/pdf');
            header('Content-Disposition: attachment; filename="' . $transaction['document_type'] . '_' . $transaction['reference_number'] . '.pdf"');
            header('Content-Length: ' . filesize($documentPath));
            readfile($documentPath);
        } else {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Document file not found']);
        }
        
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to download document']);
    }
}

// Cancel transaction
function cancelTransaction($pdo) {
    try {
        $input = json_decode(file_get_contents('php://input'), true);
        $transactionId = $input['transaction_id'] ?? null;
        
        if (!$transactionId) {
            echo json_encode(['success' => false, 'message' => 'Transaction ID required']);
            return;
        }
        
        $stmt = $pdo->prepare("
            UPDATE transactions 
            SET status = 'cancelled', updated_at = NOW()
            WHERE id = ? AND status = 'pending'
        ");
        
        $result = $stmt->execute([$transactionId]);
        
        if ($stmt->rowCount() > 0) {
            echo json_encode(['success' => true, 'message' => 'Transaction cancelled successfully']);
        } else {
            echo json_encode(['success' => false, 'message' => 'Transaction not found or cannot be cancelled']);
        }
        
    } catch (PDOException $e) {
        echo json_encode(['success' => false, 'message' => 'Failed to cancel transaction']);
    }
}


?>
