<?php
/**
 * Barangay officials listed in brgy_users are ineligible for Certificate of Employment (COE).
 * Expects table brgy_users with an `email` column (case-insensitive match).
 */
function is_email_brgy_user(PDO $pdo, $email) {
    $email = trim((string) $email);
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return false;
    }
    try {
        if (!db_table_exists($pdo, 'brgy_users') || !db_column_exists($pdo, 'brgy_users', 'email')) {
            return false;
        }
        $q = $pdo->prepare('SELECT 1 FROM brgy_users WHERE LOWER(TRIM(email)) = LOWER(?) LIMIT 1');
        $q->execute([$email]);
        return (bool) $q->fetchColumn();
    } catch (Throwable $e) {
        error_log('is_email_brgy_user: ' . $e->getMessage());
        return false;
    }
}
