<?php
/**
 * Environment Variables Loader & Configuration
 * Uses vlucas/phpdotenv to load .env file from project root
 * Includes database connection and API URL helpers
 */

// Define project root path explicitly
// This file is in php/env_loader.php, so parent directory is project root
$projectRoot = dirname(__DIR__);
$envFile = $projectRoot . DIRECTORY_SEPARATOR . '.env';

// Load Composer autoloader
$autoloadPath = $projectRoot . '/vendor/autoload.php';
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
$criticalVarsLoaded = !empty($_ENV['DB_HOST']) || !empty(getenv('DB_HOST'));
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
                
                // Set in $_ENV and putenv() for compatibility
                $_ENV[$key] = $value;
                putenv("$key=$value");
                $varsLoaded++;
            }
        }
        
        error_log("Loaded $varsLoaded environment variables from .env file");
        
        // Verify critical variables were loaded
        $dbHost = $_ENV['DB_HOST'] ?? getenv('DB_HOST') ?: null;
        $dbUser = $_ENV['DB_USER'] ?? getenv('DB_USER') ?: null;
        $dbName = $_ENV['DB_NAME'] ?? getenv('DB_NAME') ?: null;
        
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
        error_log("Debug: Check .env file at: " . dirname(__DIR__) . '/.env');
        error_log("Debug: Current _ENV keys: " . implode(', ', array_keys($_ENV)));
        return null;
    }
    
    try {
        // Set connection timeout for remote databases (AWS RDS)
        $dsn = "mysql:host=$host;dbname=$db;charset=utf8mb4";
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_TIMEOUT => 10, // 10 second timeout
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ];
        
        $pdo = new PDO($dsn, $user, $pass, $options);
        return $pdo;
    } catch (PDOException $e) {
        $errorMsg = $e->getMessage();
        error_log("Database connection failed: " . $errorMsg);
        error_log("Connection details - Host: $host, DB: $db, User: $user");
        
        // Provide more specific error information
        if (strpos($errorMsg, 'Unknown database') !== false) {
            error_log("ERROR: Database '$db' does not exist. Please create it in phpMyAdmin.");
        } elseif (strpos($errorMsg, 'Access denied') !== false) {
            error_log("ERROR: Access denied. Check DB_USER and DB_PASS in .env file.");
        } elseif (strpos($errorMsg, 'Connection refused') !== false || strpos($errorMsg, 'No connection') !== false) {
            error_log("ERROR: Cannot connect to MySQL. Is MySQL running in XAMPP?");
        }
        
        return null;
    } catch (Exception $e) {
        error_log("Unexpected error during database connection: " . $e->getMessage());
        return null;
    }
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

