<?php
/**
 * Environment Variables Loader & Configuration
 * Uses vlucas/phpdotenv to load .env file from project root
 * Includes database connection and API URL helpers
 */

// Define project root
$projectRoot = dirname(__DIR__);
$envFile = $projectRoot . DIRECTORY_SEPARATOR . '.env';

// Composer autoload path
$autoloadPath = $projectRoot . '/vendor/autoload.php';

// default value
$autoloaderLoaded = false;

if (file_exists($autoloadPath)) {
    try {
        require_once $autoloadPath;
        $autoloaderLoaded = true;
    } catch (Exception $e) {
        error_log("Error loading Composer autoloader: " . $e->getMessage());
    }
} else {
    error_log("Warning: Composer autoloader not found at: " . $autoloadPath);
}

// Try to load .env using Dotenv library first (if available)
$dotenvLoaded = false;
if ($autoloaderLoaded && class_exists('Dotenv\Dotenv')) {
    try {
        if (is_dir($projectRoot)) {
            $dotenv = \Dotenv\Dotenv::createImmutable($projectRoot);
            
            // Use safeLoad() if available (phpdotenv v5+), otherwise use load()
            if (method_exists($dotenv, 'safeLoad')) {
                $dotenv->safeLoad();
                $dotenvLoaded = true;
            } else {
                // For older versions, check if .env file exists first
                if (file_exists($envFile)) {
                    $dotenv->load();
                    $dotenvLoaded = true;
                }
            }
        }
    } catch (Exception $e) {
        error_log("Warning: Dotenv failed to load: " . $e->getMessage());
        $dotenvLoaded = false;
    }
}

// Check if critical variables were loaded by Dotenv
$criticalVarsLoaded = !empty($_ENV['DB_HOST']) || !empty(getenv('DB_HOST'))
    || !empty($_ENV['DB_HOST_AWS']) || !empty(getenv('DB_HOST_AWS'));
if ($dotenvLoaded && !$criticalVarsLoaded) {
    error_log("Warning: Dotenv loaded but DB_HOST not found. Will try manual parsing.");
}

// CRITICAL: Always use manual parsing as fallback/backup
// This ensures .env is loaded even if Dotenv library fails or doesn't set variables properly
// Also ensures compatibility with Ubuntu servers where path resolution might differ
// Check multiple possible paths for .env file (for Ubuntu compatibility)
$possibleEnvPaths = [
    $envFile, // Primary path: project root
    dirname(__DIR__) . '/.env', // Explicit project root
    __DIR__ . '/../.env', // Relative from php directory
    realpath(__DIR__ . '/../.env'), // Real path resolution
];

$envFileFound = false;
$envFileUsed = null;

foreach ($possibleEnvPaths as $testPath) {
    if ($testPath && file_exists($testPath) && is_readable($testPath)) {
        $envFileUsed = $testPath;
        $envFileFound = true;
        break;
    }
}

// Always run manual parsing as backup/ensure variables are loaded
// This is especially important on Ubuntu where Dotenv might fail silently
if ($envFileFound && $envFileUsed) {
    // Only log if we're doing manual parsing because Dotenv didn't work
    if (!$criticalVarsLoaded) {
        error_log("Loading .env manually (Dotenv didn't load variables) from: " . $envFileUsed);
    } else {
        error_log("Verifying .env variables via manual parsing from: " . $envFileUsed);
    }
    
    // Read file with error handling
    $lines = @file($envFileUsed, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    
    if ($lines === false) {
        error_log("ERROR: Failed to read .env file at: " . $envFileUsed);
        error_log("Debug: File readable: " . (is_readable($envFileUsed) ? 'YES' : 'NO'));
        error_log("Debug: File permissions: " . substr(sprintf('%o', fileperms($envFileUsed)), -4));
    } else {
        // Strip UTF-8 BOM if present on first line (breaks first KEY otherwise)
        if (!empty($lines[0]) && strncmp($lines[0], "\xEF\xBB\xBF", 3) === 0) {
            $lines[0] = substr($lines[0], 3);
        }
        $varsLoaded = 0;
        foreach ($lines as $lineNum => $line) {
            $line = trim($line);
            
            // Skip empty lines and comments
            if (empty($line) || strpos($line, '#') === 0) {
                continue;
            }
            
            // Parse KEY=VALUE format
            if (strpos($line, '=') !== false) {
                list($key, $value) = explode('=', $line, 2);
                $key = trim($key);
                $value = trim($value);
                
                // Remove quotes if present (handle both single and double quotes)
                $value = trim($value, '"\''); 
                
                // Set in $_ENV first (always reliable); putenv() can mishandle spaces on some Windows builds
                $_ENV[$key] = $value;
                @putenv($key . '=' . $value);
                $varsLoaded++;
            }
        }
        
        error_log("Loaded $varsLoaded environment variables from .env file");
        
        // Verify critical variables were loaded
        $dbHost = $_ENV['DB_HOST'] ?? $_ENV['DB_HOST_AWS'] ?? getenv('DB_HOST') ?: getenv('DB_HOST_AWS') ?: null;
        $dbUser = $_ENV['DB_USER'] ?? $_ENV['DB_USER_AWS'] ?? getenv('DB_USER') ?: getenv('DB_USER_AWS') ?: null;
        $dbName = $_ENV['DB_NAME'] ?? $_ENV['DB_NAME_AWS'] ?? getenv('DB_NAME') ?: getenv('DB_NAME_AWS') ?: null;
        
        if (!$dbHost || !$dbUser || !$dbName) {
            error_log("ERROR: .env file exists but critical variables not loaded. File path: " . $envFileUsed);
            error_log("Debug: File readable: " . (is_readable($envFileUsed) ? 'YES' : 'NO'));
            error_log("Debug: File size: " . filesize($envFileUsed) . " bytes");
            error_log("Debug: Variables loaded: $varsLoaded");
            error_log("Debug: DB_HOST=" . ($dbHost ?: 'NOT SET') . ", DB_USER=" . ($dbUser ?: 'NOT SET') . ", DB_NAME=" . ($dbName ?: 'NOT SET'));
            error_log("Debug: First 10 lines of .env: " . implode(' | ', array_slice($lines, 0, 10)));
            error_log("Debug: All _ENV keys: " . implode(', ', array_keys($_ENV)));
        } else {
            error_log("SUCCESS: Critical database variables loaded from .env file");
        }
    }
} else {
    error_log("ERROR: .env file not found or not readable");
    error_log("Debug: Checked paths:");
    foreach ($possibleEnvPaths as $path) {
        if ($path) {
            $exists = file_exists($path) ? 'EXISTS' : 'NOT FOUND';
            $readable = file_exists($path) && is_readable($path) ? 'READABLE' : 'NOT READABLE';
            error_log("  - $path: $exists, $readable");
        }
    }
    error_log("Debug: Project root (dirname(__DIR__)): " . dirname(__DIR__));
    error_log("Debug: Current directory (__DIR__): " . __DIR__);
    error_log("Debug: Real path of php dir: " . realpath(__DIR__));
}

// Map the AWS-suffixed settings to the names used by existing application code.
foreach ([
    'DB_HOST' => 'DB_HOST_AWS',
    'DB_PORT' => 'DB_PORT_AWS',
    'DB_USER' => 'DB_USER_AWS',
    'DB_PASS' => 'DB_PASS_AWS',
    'DB_NAME' => 'DB_NAME_AWS',
] as $standardName => $awsName) {
    if (!isset($_ENV[$standardName]) && getenv($standardName) === false) {
        $value = $_ENV[$awsName] ?? getenv($awsName);
        if ($value !== false && $value !== null) {
            $_ENV[$standardName] = $value;
            putenv($standardName . '=' . $value);
        }
    }
}

/**
 * Get database connection using environment variables
 * @return PDO|null Returns PDO connection or null on failure
 */
function getDBConnection() {
    // Get database credentials from environment variables
    // Try both $_ENV and getenv() as some PHP configs use different methods
    $host = $_ENV['DB_HOST'] ?? getenv('DB_HOST') ?: null;
    $user = $_ENV['DB_USER'] ?? getenv('DB_USER') ?: null;
    $pass = $_ENV['DB_PASS'] ?? getenv('DB_PASS');
    $db   = $_ENV['DB_NAME'] ?? getenv('DB_NAME') ?: null;
    
    // IMPORTANT: If DB_PASS is not set at all, set it to empty string
    // This handles cases where .env has DB_PASS= (empty) or DB_PASS="" 
    if ($pass === null || $pass === false) {
        $pass = '';
    }
    
    // Debug: Log what we got (without password)
    error_log("DB Connection attempt - Host: " . ($host ?: 'NULL') . ", User: " . ($user ?: 'NULL') . ", DB: " . ($db ?: 'NULL') . ", Pass: " . ($pass !== null && $pass !== '' ? 'SET' : ($pass === '' ? 'EMPTY' : 'NULL')));
    
    // Validate that all required environment variables are set
    // Note: $pass can be empty string, but we need to check if it was explicitly set
    $missing = [];
    if (!$host) $missing[] = 'DB_HOST';
    if (!$user) $missing[] = 'DB_USER';
    if (!isset($_ENV['DB_PASS']) && getenv('DB_PASS') === false) {
        $missing[] = 'DB_PASS'; // DB_PASS must exist in .env (even if empty)
    }
    if (!$db) $missing[] = 'DB_NAME';
    
    if (!empty($missing)) {
        error_log("Database configuration error: Missing required environment variables: " . implode(', ', $missing));
        error_log("Debug: Check the PostgreSQL settings in .env at: " . dirname(__DIR__) . '/.env');
        error_log("Debug: Current _ENV keys: " . implode(', ', array_keys($_ENV)));
        return null;
    }
    
    try {
        $driver = strtolower(trim((string) ($_ENV['DB_DRIVER'] ?? getenv('DB_DRIVER') ?: 'pgsql')));
        $port = $_ENV['DB_PORT'] ?? getenv('DB_PORT');
        if ($port === false || $port === null || $port === '') {
            $port = '5432';
        }
        if ($driver !== 'pgsql') {
            throw new RuntimeException('Unsupported DB_DRIVER. This application requires pgsql.');
        }
        $sslMode = $_ENV['DB_SSLMODE'] ?? getenv('DB_SSLMODE') ?: 'require';
        if (!in_array($sslMode, ['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'], true)) {
            throw new RuntimeException('Invalid DB_SSLMODE value.');
        }
        $dsn = "pgsql:host=$host;port=$port;dbname=$db;sslmode=$sslMode";
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_TIMEOUT => 10, // 10 second timeout
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ];
        
        $maxAttempts = 3;
        for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
            try {
                $pdo = new PDO($dsn, $user, $pass, $options);
                $pdo->exec("SET TIME ZONE 'Asia/Manila'");
                return $pdo;
            } catch (PDOException $e) {
                $errorMsg = $e->getMessage();
                $errorInfo = $e->errorInfo ?? null;
                $sqlState = is_array($errorInfo)
                    ? (string) ($errorInfo[0] ?? $e->getCode())
                    : (string) $e->getCode();
                $isConnectionError = substr($sqlState, 0, 2) === '08';

                if ($isConnectionError && $attempt < $maxAttempts) {
                    usleep(200000 * $attempt);
                    continue;
                }

                error_log("Database connection failed: " . $errorMsg);
                error_log("Connection details - Host: $host, DB: $db, User: $user");

                // Provide more specific error information
                if (strpos($errorMsg, 'Unknown database') !== false || strpos($errorMsg, 'does not exist') !== false) {
                    error_log("ERROR: Database '$db' does not exist on the configured PostgreSQL server.");
                } elseif (strpos($errorMsg, 'password authentication failed') !== false) {
                    error_log("ERROR: Access denied. Check DB_USER and DB_PASS in .env file.");
                } elseif (strpos($errorMsg, 'Connection refused') !== false || strpos($errorMsg, 'No connection') !== false) {
                    error_log("ERROR: Cannot connect to the configured database server.");
                }

                return null;
            } catch (Exception $e) {
                error_log("Unexpected error during database connection: " . $e->getMessage());
                return null;
            }
        }
    } catch (PDOException $e) {
        error_log("Database connection failed: " . $e->getMessage());
        return null;
    } catch (Exception $e) {
        error_log("Unexpected error during database connection: " . $e->getMessage());
        return null;
    }
    return null;
}

function db_table_exists(PDO $pdo, string $table): bool {
    $stmt = $pdo->prepare(
        'SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ? LIMIT 1'
    );
    $stmt->execute([$table]);
    return $stmt->fetchColumn() !== false;
}

function db_column_exists(PDO $pdo, string $table, string $column): bool {
    $stmt = $pdo->prepare(
        'SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ? AND column_name = ? LIMIT 1'
    );
    $stmt->execute([$table, $column]);
    return $stmt->fetchColumn() !== false;
}

function db_table_columns(PDO $pdo, string $table): array {
    $stmt = $pdo->prepare(
        'SELECT column_name AS "Field", data_type AS "Type", udt_name AS "Udt" FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ? ORDER BY ordinal_position'
    );
    $stmt->execute([$table]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function db_last_insert_id(PDO $pdo, string $table): ?string {
    try {
        $stmt = $pdo->prepare('SELECT currval(pg_get_serial_sequence(?, ?))');
        $stmt->execute([$table, 'id']);
        $id = $stmt->fetchColumn();
        return $id !== false ? (string) $id : null;
    } catch (PDOException $e) {
        error_log("Could not resolve last inserted ID for $table: " . $e->getMessage());
        return null;
    }
}

function db_bytea_parameter(?string $binary): ?string {
    return $binary === null ? null : '\\x' . bin2hex($binary);
}

/**
 * Value stored in census_form.census_id for a given resident_information primary key.
 * Configure via CENSUS_ID_MODE: legacy (numeric) or prefixed (e.g. CEN-001).
 *
 * @param int|string $residentPkId resident_information.id
 * @return string
 */
function census_id_for_resident_pk($residentPkId) {
    $id = (int) $residentPkId;
    $mode = strtolower(trim((string) ($_ENV['CENSUS_ID_MODE'] ?? getenv('CENSUS_ID_MODE') ?: 'legacy')));
    if ($mode === '' || $mode === 'legacy' || $mode === 'numeric' || $mode === 'int') {
        return (string) $id;
    }
    if ($id < 1) {
        return (string) $residentPkId;
    }
    $prefix = $_ENV['CENSUS_ID_PREFIX'] ?? getenv('CENSUS_ID_PREFIX');
    $prefix = trim((string) ($prefix !== false && $prefix !== null ? $prefix : 'CEN'));
    if ($prefix === '') {
        $prefix = 'CEN';
    }
    $padRaw = $_ENV['CENSUS_ID_PAD'] ?? getenv('CENSUS_ID_PAD');
    $pad = (int) ($padRaw !== false && $padRaw !== null && $padRaw !== '' ? $padRaw : 3);
    if ($pad < 1) {
        $pad = 3;
    }
    return $prefix . '-' . str_pad((string) $id, $pad, '0', STR_PAD_LEFT);
}

/**
 * Get Google Vision API URL with API key
 * @return string|null Returns full API URL or null if API key or URL is not set
 */
function getGoogleVisionApiUrl() {
    $apiKey = $_ENV['GOOGLE_VISION_API_KEY'] ?? null;
    $baseUrl = $_ENV['GOOGLE_VISION_API_URL'] ?? null;
    
    if (!$apiKey || !$baseUrl) {
        return null;
    }
    
    return $baseUrl . '?key=' . urlencode($apiKey);
}

/**
 * Get Google Gemini API URL with API key
 * @return string|null Returns full API URL or null if API key or URL is not set
 */
function getGoogleGeminiApiUrl() {
    $apiKey = $_ENV['GEMINI_API_KEY'] ?? null;
    $baseUrl = $_ENV['GEMINI_API_URL'] ?? null;
    
    if (!$apiKey || !$baseUrl) {
        return null;
    }
    
    return $baseUrl . '?key=' . urlencode($apiKey);
}

/**
 * Debug function to check .env loading status
 * Call this temporarily in your code to see what's loaded
 * Usage: debugEnvStatus();
 */
function debugEnvStatus() {
    $projectRoot = dirname(__DIR__);
    $envFile = $projectRoot . DIRECTORY_SEPARATOR . '.env';
    
    $debug = [
        'env_file_exists' => file_exists($envFile),
        'env_file_path' => $envFile,
        'env_file_readable' => file_exists($envFile) ? is_readable($envFile) : false,
        'project_root' => $projectRoot,
        'current_dir' => __DIR__,
        'env_vars_loaded' => [
            'DB_HOST' => $_ENV['DB_HOST'] ?? getenv('DB_HOST') ?: 'NOT SET',
            'DB_USER' => $_ENV['DB_USER'] ?? getenv('DB_USER') ?: 'NOT SET',
            'DB_PASS' => isset($_ENV['DB_PASS']) || getenv('DB_PASS') !== false ? 'SET (hidden)' : 'NOT SET',
            'DB_NAME' => $_ENV['DB_NAME'] ?? getenv('DB_NAME') ?: 'NOT SET',
        ],
        'all_env_keys' => array_keys($_ENV),
        'composer_autoload_exists' => file_exists($projectRoot . '/vendor/autoload.php'),
        'dotenv_class_exists' => class_exists('Dotenv\Dotenv'),
    ];
    
    error_log("=== ENV DEBUG INFO ===");
    error_log(json_encode($debug, JSON_PRETTY_PRINT));
    error_log("======================");
    
    return $debug;
}
