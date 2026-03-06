<?php
/**
 * Environment Variables Loader & Configuration
 * Uses vlucas/phpdotenv to load .env file from project root
 * Includes database connection and API URL helpers
 */

// Load Composer autoloader
$autoloadPath = __DIR__ . '/../vendor/autoload.php';
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

// Only load Dotenv if autoloader was loaded successfully
if ($autoloaderLoaded) {
    try {
        // Use Dotenv namespace (must be at top level, but we check if class exists)
        if (class_exists('Dotenv\Dotenv')) {
            // Load .env file from project root directory
            // Handle missing .env file gracefully
            $envPath = __DIR__ . '/..';
            
            // Check if directory exists before trying to create Dotenv instance
            if (is_dir($envPath)) {
                try {
                    $dotenv = \Dotenv\Dotenv::createImmutable($envPath);
                    
                    // Try to use safeLoad() if available (phpdotenv v5+), otherwise use load() with error handling
                    if (method_exists($dotenv, 'safeLoad')) {
                        $result = $dotenv->safeLoad();
                        if ($result === false) {
                            error_log("Warning: Dotenv safeLoad() returned false - .env file may have issues");
                        }
                    } else {
                        // For older versions, check if .env file exists first
                        $envFile = $envPath . DIRECTORY_SEPARATOR . '.env';
                        if (file_exists($envFile)) {
                            try {
                                $dotenv->load();
                            } catch (Exception $loadException) {
                                error_log("Warning: Could not load .env file: " . $loadException->getMessage());
                            }
                        }
                    }
                    
                    // Verify that at least one variable was loaded
                    if (empty($_ENV['DB_HOST']) && empty(getenv('DB_HOST'))) {
                        error_log("Warning: .env file loaded but DB_HOST is not set. Check .env file format.");
                        // Try to read .env file directly for debugging
                        $envFile = $envPath . DIRECTORY_SEPARATOR . '.env';
                        if (file_exists($envFile)) {
                            error_log("Debug: .env file exists at: " . $envFile);
                            $envContent = file_get_contents($envFile);
                            $lines = explode("\n", $envContent);
                            error_log("Debug: .env file has " . count($lines) . " lines");
                            // Log first few lines (without sensitive data)
                            foreach (array_slice($lines, 0, 10) as $i => $line) {
                                if (strpos($line, 'DB_') === 0) {
                                    $parts = explode('=', $line, 2);
                                    if (count($parts) === 2) {
                                        $key = trim($parts[0]);
                                        $value = trim($parts[1]);
                                        if ($key === 'DB_PASS') {
                                            error_log("Debug: Line " . ($i+1) . ": $key=" . (empty($value) ? '(empty)' : '(set)'));
                                        } else {
                                            error_log("Debug: Line " . ($i+1) . ": $key=$value");
                                        }
                                    }
                                }
                            }
                        } else {
                            error_log("Debug: .env file does NOT exist at: " . $envFile);
                        }
                    }
                } catch (Exception $dotenvException) {
                    // Log error but don't fail - environment variables might be set another way
                    error_log("Warning: Could not initialize Dotenv: " . $dotenvException->getMessage());
                }
            }
        }
    } catch (Exception $e) {
        // Log error but don't fail - environment variables might be set another way
        error_log("Warning: Could not load .env file: " . $e->getMessage());
    }
}

// Fallback: If Dotenv didn't load variables, try manual parsing
if (empty($_ENV['DB_HOST']) && empty(getenv('DB_HOST'))) {
    $envFile = __DIR__ . '/../.env';
    if (file_exists($envFile)) {
        error_log("Attempting manual .env file parsing as fallback");
        $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            // Skip comments
            if (strpos(trim($line), '#') === 0) {
                continue;
            }
            // Parse KEY=VALUE format
            if (strpos($line, '=') !== false) {
                list($key, $value) = explode('=', $line, 2);
                $key = trim($key);
                $value = trim($value);
                // Remove quotes if present
                $value = trim($value, '"\'');
                // Set in $_ENV
                $_ENV[$key] = $value;
                putenv("$key=$value");
            }
        }
        error_log("Manual parsing complete. DB_HOST: " . ($_ENV['DB_HOST'] ?? 'NOT SET'));
    }
}

/**
 * Get database connection using environment variables
 * @return PDO|null Returns PDO connection or null on failure
 */
function getDBConnection() {
    // Get database credentials from environment variables (required - no fallbacks)
    // Try both $_ENV and getenv() as some PHP configs use different methods
    $host = $_ENV['DB_HOST'] ?? getenv('DB_HOST') ?: null;
    $user = $_ENV['DB_USER'] ?? getenv('DB_USER') ?: null;
    $pass = $_ENV['DB_PASS'] ?? getenv('DB_PASS');
    $db   = $_ENV['DB_NAME'] ?? getenv('DB_NAME') ?: null;
    
    // Debug: Log what we got (without password)
    error_log("DB Connection attempt - Host: " . ($host ?: 'NULL') . ", User: " . ($user ?: 'NULL') . ", DB: " . ($db ?: 'NULL') . ", Pass: " . ($pass !== null ? 'SET' : 'NULL'));
    
    // Validate that all required environment variables are set
    // Note: $pass can be empty string (for XAMPP default), but not null
    if (!$host || !$user || $pass === null || !$db) {
        $missing = [];
        if (!$host) $missing[] = 'DB_HOST';
        if (!$user) $missing[] = 'DB_USER';
        if ($pass === null) $missing[] = 'DB_PASS'; // Only check if null, allow empty string
        if (!$db) $missing[] = 'DB_NAME';
        error_log("Database configuration error: Missing required environment variables: " . implode(', ', $missing));
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

