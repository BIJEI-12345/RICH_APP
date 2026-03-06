<?php
/**
 * Environment Variables Loader & Configuration
 * Uses vlucas/phpdotenv to load .env file from project root
 * Includes database connection and API URL helpers
 */

// Load Composer autoloader
require_once __DIR__ . '/../vendor/autoload.php';

use Dotenv\Dotenv;

// Load .env file from project root directory
$dotenv = Dotenv::createImmutable(__DIR__ . '/..');
$dotenv->load();

/**
 * Get database connection using environment variables
 * @return PDO|null Returns PDO connection or null on failure
 */
function getDBConnection() {
    // Get database credentials from environment variables (required - no fallbacks)
    $host = $_ENV['DB_HOST'] ?? null;
    $user = $_ENV['DB_USER'] ?? null;
    $pass = $_ENV['DB_PASS'] ?? null;
    $db   = $_ENV['DB_NAME'] ?? null;
    
    // Validate that all required environment variables are set
    if (!$host || !$user || !$pass || !$db) {
        error_log("Database configuration error: Missing required environment variables (DB_HOST, DB_USER, DB_PASS, DB_NAME)");
        return null;
    }
    
    try {
        $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        return $pdo;
    } catch (PDOException $e) {
        error_log("Database connection failed: " . $e->getMessage());
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
 * Get Groq API base URL
 * @return string|null Returns Groq API base URL or null if not set
 */
function getGroqApiUrl() {
    return $_ENV['GROQ_API_URL'] ?? null;
}

/**
 * Get Groq API Key
 * @return string|null Returns API key or null if not set
 */
function getGroqApiKey() {
    return $_ENV['GROQ_API_KEY'] ?? null;
}
