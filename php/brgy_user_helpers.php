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
        $t = $pdo->query("SHOW TABLES LIKE 'brgy_users'");
        if (!$t || $t->rowCount() === 0) {
            return false;
        }
        $c = $pdo->query("SHOW COLUMNS FROM brgy_users LIKE 'email'");
        if (!$c || $c->rowCount() === 0) {
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
