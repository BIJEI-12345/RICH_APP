<?php
/**
 * .env File Diagnostic Script
 * Access this file via browser to check .env file loading issues
 * Example: http://your-server/RICH_APP/php/env_diagnostic.php
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$diagnostics = [
    'timestamp' => date('Y-m-d H:i:s'),
    'server_info' => [
        'php_version' => phpversion(),
        'server_software' => $_SERVER['SERVER_SOFTWARE'] ?? 'Unknown',
        'document_root' => $_SERVER['DOCUMENT_ROOT'] ?? 'Unknown',
        'script_filename' => __FILE__,
    ],
    'paths' => [],
    'env_file_status' => [],
    'composer_status' => [],
    'dotenv_status' => [],
    'environment_variables' => [],
    'recommendations' => []
];

// Define project root path
$projectRoot = dirname(__DIR__);
$diagnostics['paths']['project_root'] = $projectRoot;
$diagnostics['paths']['php_directory'] = __DIR__;
$diagnostics['paths']['realpath_php_dir'] = realpath(__DIR__);
$diagnostics['paths']['realpath_project_root'] = realpath($projectRoot);

// Check possible .env file paths
$possibleEnvPaths = [
    'primary' => $projectRoot . DIRECTORY_SEPARATOR . '.env',
    'explicit_root' => dirname(__DIR__) . '/.env',
    'relative_from_php' => __DIR__ . '/../.env',
    'realpath' => realpath(__DIR__ . '/../.env'),
];

$envFileFound = false;
$envFileUsed = null;

foreach ($possibleEnvPaths as $name => $path) {
    $exists = $path && file_exists($path);
    $readable = $exists && is_readable($path);
    $writable = $exists && is_writable($path);
    
    $diagnostics['env_file_status'][$name] = [
        'path' => $path,
        'exists' => $exists,
        'readable' => $readable,
        'writable' => $writable,
    ];
    
    if ($exists) {
        $diagnostics['env_file_status'][$name]['size'] = filesize($path);
        $diagnostics['env_file_status'][$name]['permissions'] = substr(sprintf('%o', fileperms($path)), -4);
        $diagnostics['env_file_status'][$name]['owner'] = function_exists('posix_getpwuid') ? posix_getpwuid(fileowner($path)) : 'N/A';
        
        if (!$envFileFound && $readable) {
            $envFileFound = true;
            $envFileUsed = $path;
        }
    }
}

// Check Composer autoloader
$autoloadPath = $projectRoot . '/vendor/autoload.php';
$diagnostics['composer_status']['autoload_path'] = $autoloadPath;
$diagnostics['composer_status']['exists'] = file_exists($autoloadPath);
$diagnostics['composer_status']['readable'] = file_exists($autoloadPath) && is_readable($autoloadPath);

if ($diagnostics['composer_status']['exists']) {
    try {
        require_once $autoloadPath;
        $diagnostics['composer_status']['loaded'] = true;
        $diagnostics['composer_status']['dotenv_class_exists'] = class_exists('Dotenv\Dotenv');
    } catch (Exception $e) {
        $diagnostics['composer_status']['loaded'] = false;
        $diagnostics['composer_status']['error'] = $e->getMessage();
    }
} else {
    $diagnostics['composer_status']['loaded'] = false;
}

// Try to load .env using Dotenv if available
if ($diagnostics['composer_status']['dotenv_class_exists']) {
    try {
        $dotenv = \Dotenv\Dotenv::createImmutable($projectRoot);
        if (method_exists($dotenv, 'safeLoad')) {
            $dotenv->safeLoad();
        } else {
            if ($envFileUsed && file_exists($envFileUsed)) {
                $dotenv->load();
            }
        }
        $diagnostics['dotenv_status']['loaded'] = true;
    } catch (Exception $e) {
        $diagnostics['dotenv_status']['loaded'] = false;
        $diagnostics['dotenv_status']['error'] = $e->getMessage();
    }
} else {
    $diagnostics['dotenv_status']['loaded'] = false;
    $diagnostics['dotenv_status']['reason'] = 'Dotenv class not found';
}

// Try manual parsing if .env file exists
if ($envFileFound && $envFileUsed) {
    $lines = @file($envFileUsed, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    
    if ($lines !== false) {
        $diagnostics['env_file_status']['manual_parsing'] = [
            'success' => true,
            'total_lines' => count($lines),
            'sample_lines' => array_slice($lines, 0, 10),
        ];
        
        $varsLoaded = 0;
        $parsedVars = [];
        
        foreach ($lines as $lineNum => $line) {
            $line = trim($line);
            
            if (empty($line) || strpos($line, '#') === 0) {
                continue;
            }
            
            if (strpos($line, '=') !== false) {
                list($key, $value) = explode('=', $line, 2);
                $key = trim($key);
                $value = trim($value);
                $value = trim($value, '"\''); 
                
                $_ENV[$key] = $value;
                putenv("$key=$value");
                $parsedVars[$key] = $value !== '' ? 'SET' : 'EMPTY';
                $varsLoaded++;
            }
        }
        
        $diagnostics['env_file_status']['manual_parsing']['vars_loaded'] = $varsLoaded;
        $diagnostics['env_file_status']['manual_parsing']['parsed_vars'] = $parsedVars;
    } else {
        $diagnostics['env_file_status']['manual_parsing'] = [
            'success' => false,
            'error' => 'Failed to read file'
        ];
    }
}

// Check environment variables
$requiredVars = ['DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME'];
foreach ($requiredVars as $var) {
    $envValue = $_ENV[$var] ?? getenv($var);
    $diagnostics['environment_variables'][$var] = [
        'set' => $envValue !== false && $envValue !== null,
        'value' => $var === 'DB_PASS' ? ($envValue ? '***HIDDEN***' : 'NOT SET') : ($envValue ?: 'NOT SET'),
        'in_ENV' => isset($_ENV[$var]),
        'in_getenv' => getenv($var) !== false,
    ];
}

// Generate recommendations
if (!$envFileFound) {
    $diagnostics['recommendations'][] = [
        'priority' => 'CRITICAL',
        'issue' => '.env file not found',
        'solution' => "Create .env file at: {$projectRoot}/.env with the following format:\nDB_HOST=your_host\nDB_USER=your_user\nDB_PASS=your_password\nDB_NAME=your_database"
    ];
} else {
    if (!$diagnostics['env_file_status'][array_search($envFileUsed, $possibleEnvPaths)]['readable']) {
        $diagnostics['recommendations'][] = [
            'priority' => 'CRITICAL',
            'issue' => '.env file is not readable',
            'solution' => "Fix file permissions: chmod 644 {$envFileUsed} or chmod 600 {$envFileUsed}"
        ];
    }
    
    $missingVars = [];
    foreach ($requiredVars as $var) {
        if (!$diagnostics['environment_variables'][$var]['set']) {
            $missingVars[] = $var;
        }
    }
    
    if (!empty($missingVars)) {
        $diagnostics['recommendations'][] = [
            'priority' => 'CRITICAL',
            'issue' => 'Missing environment variables: ' . implode(', ', $missingVars),
            'solution' => "Add these variables to your .env file:\n" . implode("\n", array_map(function($v) { return "$v=your_value"; }, $missingVars))
        ];
    }
}

if (!$diagnostics['composer_status']['exists']) {
    $diagnostics['recommendations'][] = [
        'priority' => 'LOW',
        'issue' => 'Composer autoloader not found',
        'solution' => 'Run: composer install (optional - manual parsing will work without it)'
    ];
}

// Overall status
$diagnostics['overall_status'] = 'OK';
if (!$envFileFound) {
    $diagnostics['overall_status'] = 'ERROR: .env file not found';
} elseif (!empty($missingVars)) {
    $diagnostics['overall_status'] = 'ERROR: Missing required variables';
} elseif (!$diagnostics['env_file_status'][array_search($envFileUsed, $possibleEnvPaths)]['readable']) {
    $diagnostics['overall_status'] = 'ERROR: .env file not readable';
}

echo json_encode($diagnostics, JSON_PRETTY_PRINT);

