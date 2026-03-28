<?php
/**
 * jobseeker_claimed: registry when a Job Seeker certification is finished (not on initial submit).
 */

function jobseeker_claimed_table_exists(PDO $pdo): bool
{
    try {
        $r = $pdo->query("SHOW TABLES LIKE 'jobseeker_claimed'");
        return $r && $r->rowCount() > 0;
    } catch (Throwable $e) {
        return false;
    }
}

function jobseeker_claimed_column_exists(PDO $pdo, string $column): bool
{
    try {
        $st = $pdo->prepare('SHOW COLUMNS FROM jobseeker_claimed WHERE Field = ?');
        $st->execute([$column]);
        return $st->rowCount() > 0;
    } catch (Throwable $e) {
        return false;
    }
}

function certification_status_is_finished(?string $status): bool
{
    $s = strtolower(trim((string) $status));
    return in_array($s, ['finished', 'completed', 'resolved', 'complete'], true);
}

function certification_purpose_is_jobseeker(?string $purpose): bool
{
    $p = strtolower(trim((string) $purpose));
    return in_array($p, ['jobseeker', 'job seeker'], true);
}

function compute_age_from_birth_date(?string $birthDate): ?int
{
    if ($birthDate === null || trim($birthDate) === '') {
        return null;
    }
    try {
        $bd = new DateTime(trim($birthDate));
        $now = new DateTime('now', new DateTimeZone('Asia/Manila'));
        return (int) $bd->diff($now)->y;
    } catch (Throwable $e) {
        return null;
    }
}

/**
 * Normalize out_of_school_youth from certification_forms row to 0/1 for jobseeker_claimed.
 */
function jobseeker_oosy_to_tinyint($value): int
{
    if ($value === null || $value === '') {
        return 0;
    }
    if (is_numeric($value)) {
        return ((int) $value) !== 0 ? 1 : 0;
    }
    $v = strtolower(trim((string) $value));
    if (in_array($v, ['1', 'yes', 'true', 'y'], true)) {
        return 1;
    }
    return 0;
}

/**
 * True if this user already has a row in jobseeker_claimed (by resident id or name).
 */
function jobseeker_claimed_matches_user(PDO $pdo, ?string $email, string $firstName, string $lastName): bool
{
    if (!jobseeker_claimed_table_exists($pdo)) {
        return false;
    }
    if ($email) {
        $st = $pdo->prepare('SELECT id FROM resident_information WHERE email = ? LIMIT 1');
        $st->execute([$email]);
        $rid = $st->fetchColumn();
        if ($rid) {
            $st2 = $pdo->prepare('SELECT COUNT(*) FROM jobseeker_claimed WHERE no = ?');
            $st2->execute([(int) $rid]);
            if ((int) $st2->fetchColumn() > 0) {
                return true;
            }
        }
    }
    $fn = trim((string) $firstName);
    $ln = trim((string) $lastName);
    if ($fn === '' || $ln === '') {
        return false;
    }
    $st3 = $pdo->prepare('
        SELECT COUNT(*) FROM jobseeker_claimed
        WHERE LOWER(TRIM(first_name)) = LOWER(?)
        AND LOWER(TRIM(last_name)) = LOWER(?)
    ');
    $st3->execute([$fn, $ln]);
    return ((int) $st3->fetchColumn()) > 0;
}

/**
 * Insert into jobseeker_claimed from a certification_forms row (when status is finished).
 * Idempotent if certification_form_id column exists and is set.
 */
function insert_jobseeker_claimed_from_certification_form(PDO $pdo, int $certificationFormId): bool
{
    if (!jobseeker_claimed_table_exists($pdo)) {
        error_log('jobseeker_claimed: table missing');
        return false;
    }

    $stmt = $pdo->prepare('SELECT * FROM certification_forms WHERE id = ?');
    $stmt->execute([$certificationFormId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return false;
    }

    if (!certification_purpose_is_jobseeker($row['purpose'] ?? null)) {
        return false;
    }
    if (!certification_status_is_finished($row['status'] ?? null)) {
        return false;
    }

    if (jobseeker_claimed_column_exists($pdo, 'certification_form_id')) {
        $chk = $pdo->prepare('SELECT COUNT(*) FROM jobseeker_claimed WHERE certification_form_id = ?');
        $chk->execute([$certificationFormId]);
        if ((int) $chk->fetchColumn() > 0) {
            return true;
        }
    }

    $email = $row['email'] ?? null;
    $no = 0;
    if ($email) {
        $st = $pdo->prepare('SELECT id FROM resident_information WHERE email = ? LIMIT 1');
        $st->execute([$email]);
        $rid = $st->fetchColumn();
        if ($rid) {
            $no = (int) $rid;
        }
    }

    $oosy = jobseeker_oosy_to_tinyint($row['out_of_school_youth'] ?? '0');
    $age = compute_age_from_birth_date($row['birth_date'] ?? null);

    $hasCf = jobseeker_claimed_column_exists($pdo, 'certification_form_id');
    $hasCreated = jobseeker_claimed_column_exists($pdo, 'created_at');

    if ($hasCf && $hasCreated) {
        $sql = 'INSERT INTO jobseeker_claimed
            (no, last_name, first_name, middle_name, sex, age, birth_date, educational_level, course, out_of_school_youth, certification_form_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())';
        return $pdo->prepare($sql)->execute([
            $no,
            $row['last_name'],
            $row['first_name'],
            $row['middle_name'] ?? null,
            $row['gender'] ?? null,
            $age,
            !empty($row['birth_date']) ? $row['birth_date'] : null,
            $row['educational_level'] ?? null,
            $row['course'] ?? null,
            $oosy,
            $certificationFormId,
        ]);
    }
    if ($hasCf) {
        $sql = 'INSERT INTO jobseeker_claimed
            (no, last_name, first_name, middle_name, sex, age, birth_date, educational_level, course, out_of_school_youth, certification_form_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        return $pdo->prepare($sql)->execute([
            $no,
            $row['last_name'],
            $row['first_name'],
            $row['middle_name'] ?? null,
            $row['gender'] ?? null,
            $age,
            !empty($row['birth_date']) ? $row['birth_date'] : null,
            $row['educational_level'] ?? null,
            $row['course'] ?? null,
            $oosy,
            $certificationFormId,
        ]);
    }
    if ($hasCreated) {
        $sql = 'INSERT INTO jobseeker_claimed
            (no, last_name, first_name, middle_name, sex, age, birth_date, educational_level, course, out_of_school_youth, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())';
        return $pdo->prepare($sql)->execute([
            $no,
            $row['last_name'],
            $row['first_name'],
            $row['middle_name'] ?? null,
            $row['gender'] ?? null,
            $age,
            !empty($row['birth_date']) ? $row['birth_date'] : null,
            $row['educational_level'] ?? null,
            $row['course'] ?? null,
            $oosy,
        ]);
    }

    $sql = 'INSERT INTO jobseeker_claimed
        (no, last_name, first_name, middle_name, sex, age, birth_date, educational_level, course, out_of_school_youth)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    return $pdo->prepare($sql)->execute([
        $no,
        $row['last_name'],
        $row['first_name'],
        $row['middle_name'] ?? null,
        $row['gender'] ?? null,
        $age,
        !empty($row['birth_date']) ? $row['birth_date'] : null,
        $row['educational_level'] ?? null,
        $row['course'] ?? null,
        $oosy,
    ]);
}
