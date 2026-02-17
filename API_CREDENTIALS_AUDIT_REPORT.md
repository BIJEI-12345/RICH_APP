# API Usage at Credentials Audit Report
## RICH_APP System

**Petsa ng Audit**: 2024  
**Sistema**: RICH Bigte Application  
**Layunin**: Komprehensibong listahan ng lahat ng API usage at credentials sa system

---

## Executive Summary

Ang audit na ito ay naglilista ng:
- **2 External APIs** (Google Gemini, Google Cloud Vision)
- **11 JavaScript files** na gumagamit ng internal PHP endpoints
- **16 PHP files** na may database credentials
- **1 Email service** na may SMTP credentials
- **2 API keys** na hardcoded sa source code

**⚠️ CRITICAL SECURITY FINDING**: Lahat ng credentials ay hardcoded sa source code at walang environment variable protection.

---

## 1. External APIs

### 1.1 Google Gemini API
**File**: `php/gemini_verify.php`  
**Line**: 27-28  
**API Key**: `AIzaSyDEQCI1lgzjGRIBXO1urcy5mL1_nhNxXRc`  
**Endpoint**: `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=...`  
**Purpose**: ID address verification at OCR text extraction

**Ginagamit ng**:
- `js/request.js` (line 25) - ID verification para sa document requests
- `js/create_account1.js` (line 470) - ID verification para sa account creation

**Code Snippet**:
```php
$API_KEY = 'AIzaSyDEQCI1lgzjGRIBXO1urcy5mL1_nhNxXRc';
$URL = 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=' . urlencode($API_KEY);
```

**Security Status**: ⚠️ **CRITICAL** - API key ay hardcoded at exposed sa source code

---

### 1.2 Google Cloud Vision API
**File**: `php/vision_proxy.php`  
**Line**: 23-24  
**API Key**: `AIzaSyDjHCEp9AntErTKlMSNwkWCADw1nUk2okQ`  
**Endpoint**: `https://vision.googleapis.com/v1/images:annotate?key=...`  
**Purpose**: Text detection at OCR sa images

**Ginagamit ng**: 
- Available bilang proxy endpoint pero hindi direktang natagpuan sa active JS files
- Maaaring gamitin bilang fallback o alternative sa Gemini API

**Code Snippet**:
```php
$API_KEY = 'AIzaSyDjHCEp9AntErTKlMSNwkWCADw1nUk2okQ';
$VISION_URL = 'https://vision.googleapis.com/v1/images:annotate?key=' . urlencode($API_KEY);
```

**Security Status**: ⚠️ **CRITICAL** - API key ay hardcoded at exposed sa source code

---

## 2. Internal PHP API Endpoints (via fetch)

### 2.1 js/request.js
**Total API Calls**: 9

| Line | Endpoint | Purpose | Method |
|------|----------|---------|--------|
| 25 | `php/gemini_verify.php` | ID address verification | POST |
| 333 | `php/main_UI.php` | Load user data | POST |
| 637 | `php/submit_request.php` | Submit request (COMMENTED OUT) | POST |
| 1734 | `php/request.php` | Barangay ID submission | POST |
| 1999 | `php/request.php` | Clearance submission | POST |
| 2210 | `php/request.php` | COE (Certificate of Employment) submission | POST |
| 2371 | `php/request.php` | Indigency submission | POST |
| 2560 | `php/request.php` | Certification submission | POST |
| 4353 | `php/check_active_requests.php` | Check active requests | POST |

**Note**: `submit_request.php` ay commented out at hindi aktibo.

---

### 2.2 js/emergency.js
**Total API Calls**: 2

| Line | Endpoint | Purpose | Method |
|------|----------|---------|--------|
| 209 | `php/main_UI.php` | Load user data | POST |
| 356 | `php/emergency.php` | Submit emergency report | POST |

---

### 2.3 js/transactions.js
**Total API Calls**: 3

| Line | Endpoint | Purpose | Method |
|------|----------|---------|--------|
| 189 | `php/transactions.php` | List transactions (dynamic URL) | GET/POST |
| 1063 | `php/transactions.php?action=download&id=...` | Download document | GET |
| 1112 | `php/transactions.php` | Cancel transaction | POST |

---

### 2.4 js/concerns.js
**Total API Calls**: 2

| Line | Endpoint | Purpose | Method |
|------|----------|---------|--------|
| 65 | `php/main_UI.php` | Load user data | POST |
| 154 | `php/concerns.php` | Submit concern | POST |

---

### 2.5 js/main_UI.js
**Total API Calls**: 7

| Line | Endpoint | Purpose | Method |
|------|----------|---------|--------|
| 93 | `php/main_UI.php` | Load user data | POST |
| 734 | `php/announcements.php` | Load announcements | GET |
| 963 | `php/main_UI.php` | Update user interface | POST |
| 1236 | `php/update_profile.php` | Update profile | POST |
| 1400 | `php/check_census.php` | Check census status | POST |
| 1583 | `php/main_UI.php` | Load user data | POST |
| 1871 | `php/submit_census.php` | Submit census | POST |

---

### 2.6 js/login.js
**Total API Calls**: 1

| Line | Endpoint | Purpose | Method |
|------|----------|---------|--------|
| 69 | `php/login.php` | User login authentication | POST |

---

### 2.7 js/create_account1.js
**Total API Calls**: 2

| Line | Endpoint | Purpose | Method |
|------|----------|---------|--------|
| 470 | `php/gemini_verify.php` | ID verification for account creation | POST |
| 894 | `php/create_account1.php` | Create new account | POST |

---

### 2.8 js/email_verification.js
**Total API Calls**: 2

| Line | Endpoint | Purpose | Method |
|------|----------|---------|--------|
| 70 | `php/resend_verification.php` | Resend verification email | POST |
| 139 | `php/verify_email.php` | Verify email with OTP | POST |

---

### 2.9 js/mpin_password.js
**Total API Calls**: 1

| Line | Endpoint | Purpose | Method |
|------|----------|---------|--------|
| 238 | `php/mpin_password.php` | Save MPIN password | POST |

---

### 2.10 js/mpin_login.js
**Total API Calls**: 1

| Line | Endpoint | Purpose | Method |
|------|----------|---------|--------|
| 305 | `php/mpin_login.php` | MPIN login verification | POST |

---

### 2.11 js/announcements.js
**Total API Calls**: 1

| Line | Endpoint | Purpose | Method |
|------|----------|---------|--------|
| 15 | `php/announcements.php` | Load announcements | GET |

---

## 3. Credentials na Natagpuan

### 3.1 Database Credentials (AWS RDS MySQL)

**Credentials**:
- **Host**: `rich.cmxcoo6yc8nh.us-east-1.rds.amazonaws.com`
- **Username**: `admin`
- **Password**: `4mazonb33j4y!`
- **Database**: `rich_db`
- **Region**: us-east-1 (AWS)

**⚠️ SECURITY STATUS**: **CRITICAL** - Database password ay exposed sa 16 PHP files

**Files na may Database Credentials**:

| # | File | Lines | Function Name |
|---|------|-------|---------------|
| 1 | `php/login.php` | 59-62 | `getDBConnection()` |
| 2 | `php/mpin_password.php` | 57-60 | `getDBConnection()` |
| 3 | `php/mpin_login.php` | 58-61 | `getDBConnection()` |
| 4 | `php/create_account1.php` | 150-153 | `getDBConnection()` |
| 5 | `php/resend_verification.php` | 43-46 | `getDBConnection()` |
| 6 | `php/verify_email.php` | 51-54 | `getDBConnection()` |
| 7 | `php/update_profile.php` | 24-27 | Direct connection (no function) |
| 8 | `php/submit_census.php` | 42-45 | `getDBConnection()` |
| 9 | `php/main_UI.php` | 43-46 | Direct connection (no function) |
| 10 | `php/request.php` | 17-20 | `getDBConnection()` |
| 11 | `php/check_census.php` | 46-49 | `getDBConnection()` |
| 12 | `php/concerns.php` | 17-20 | `getDBConnection()` |
| 13 | `php/check_active_requests.php` | 60-63, 386-389, 576-579 | Multiple `getDBConnection()` calls |
| 14 | `php/announcements.php` | 54-57 | `getDBConnection()` |
| 15 | `php/emergency.php` | 17-20 | `getDBConnection()` |
| 16 | `php/transactions.php` | 16-19 | `getDBConnection()` |

**Code Pattern**:
```php
function getDBConnection() {
    $host = "rich.cmxcoo6yc8nh.us-east-1.rds.amazonaws.com"; 
    $user = "admin";
    $pass = "4mazonb33j4y!";
    $db   = "rich_db";
    
    try {
        $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        return $pdo;
    } catch (PDOException $e) {
        error_log("Database connection failed: " . $e->getMessage());
        return null;
    }
}
```

**Note**: May commented out na alternate database credentials sa ilang files:
- Alternate host: `rich.c4lc2owy0af4.us-east-1.rds.amazonaws.com` (commented)

---

### 3.2 Email Credentials (Gmail SMTP)

**File**: `php/EmailSender.php`  
**Lines**: 21-26

**Credentials**:
- **SMTP Host**: `smtp.gmail.com`
- **SMTP Port**: `587`
- **SMTP Username**: `rich091525@gmail.com`
- **SMTP Password**: `otrp vhkp eniz vrsk` (Gmail App Password)
- **From Email**: `rich091525@gmail.com`
- **From Name**: `RICH Bigte`
- **Encryption**: STARTTLS

**⚠️ SECURITY STATUS**: **CRITICAL** - Gmail app password ay exposed sa source code

**Code Snippet**:
```php
public function __construct() {
    $this->smtpHost = 'smtp.gmail.com';
    $this->smtpPort = 587;
    $this->smtpUsername = 'rich091525@gmail.com';
    $this->smtpPassword = 'otrp vhkp eniz vrsk';
    $this->fromEmail = 'rich091525@gmail.com';
    $this->fromName = 'RICH Bigte';
}
```

**Ginagamit ng**:
- `php/create_account1.php` - Email verification OTP
- `php/resend_verification.php` - Resend verification emails
- `php/verify_email.php` - Email verification process

---

### 3.3 External API Keys

#### 3.3.1 Google Gemini API Key
- **File**: `php/gemini_verify.php`
- **Line**: 27
- **Key**: `AIzaSyDEQCI1lgzjGRIBXO1urcy5mL1_nhNxXRc`
- **Status**: ⚠️ Hardcoded sa source code

#### 3.3.2 Google Cloud Vision API Key
- **File**: `php/vision_proxy.php`
- **Line**: 23
- **Key**: `AIzaSyDjHCEp9AntErTKlMSNwkWCADw1nUk2okQ`
- **Status**: ⚠️ Hardcoded sa source code

---

## 4. Security Concerns

### 4.1 Critical Issues

1. **Hardcoded Credentials**
   - Lahat ng credentials (database, email, API keys) ay hardcoded sa source code
   - Walang environment variable protection
   - Credentials ay visible sa lahat ng may access sa codebase

2. **Exposed API Keys**
   - Google Gemini API key ay exposed
   - Google Cloud Vision API key ay exposed
   - Maaaring ma-abuse ng unauthorized users

3. **Database Password Exposure**
   - Database password ay exposed sa 16 PHP files
   - AWS RDS credentials ay accessible sa lahat ng may code access
   - Walang connection encryption verification

4. **Email Password Exposure**
   - Gmail app password ay exposed
   - Email account ay vulnerable sa unauthorized access

5. **No Secrets Management**
   - Walang paggamit ng environment variables
   - Walang `.env` file protection
   - Walang secrets management service

### 4.2 Medium Priority Issues

1. **Code Duplication**
   - Database connection code ay duplicated sa 16 files
   - Walang centralized configuration

2. **No Credential Rotation**
   - Walang mechanism para sa credential rotation
   - Credentials ay static at hindi nagbabago

3. **Commented Credentials**
   - May alternate database credentials na commented out
   - Maaaring magdulot ng confusion

---

## 5. Recommendations

### 5.1 Immediate Actions (Critical)

1. **Ilipat ang lahat ng credentials sa environment variables**
   - Gumawa ng `.env` file
   - I-add ang `.env` sa `.gitignore`
   - Gumamit ng `vlucas/phpdotenv` package

2. **I-rotate ang lahat ng credentials**
   - Generate new database password
   - Generate new Gmail app password
   - Generate new API keys para sa Google services
   - Update lahat ng credentials pagkatapos ng migration

3. **I-restrict ang access sa credentials**
   - Limit access sa `.env` file
   - Use file permissions (chmod 600)
   - I-secure ang server access

### 5.2 Short-term Actions (1-2 weeks)

1. **Centralize database configuration**
   - Gumawa ng `php/config/database.php`
   - I-load ang credentials mula sa environment variables
   - I-update ang lahat ng files na gumagamit ng database

2. **Implement secrets management**
   - Gumamit ng AWS Secrets Manager o similar service
   - I-store ang credentials sa secure vault
   - I-access ang credentials via API

3. **Add credential validation**
   - I-validate ang credentials sa startup
   - I-log ang connection failures (without exposing credentials)
   - I-implement ang retry mechanism

### 5.3 Long-term Actions (1-3 months)

1. **Implement credential rotation**
   - Automated rotation ng API keys
   - Scheduled password updates
   - Zero-downtime rotation mechanism

2. **Add monitoring and alerting**
   - Monitor API key usage
   - Alert on suspicious activities
   - Track credential access logs

3. **Security audit and compliance**
   - Regular security audits
   - Compliance checks (GDPR, data protection)
   - Penetration testing

---

## 6. Implementation Guide

### 6.1 Creating .env File

Gumawa ng `.env` file sa root directory:

```env
# Database Configuration
DB_HOST=rich.cmxcoo6yc8nh.us-east-1.rds.amazonaws.com
DB_USER=admin
DB_PASS=4mazonb33j4y!
DB_NAME=rich_db

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=rich091525@gmail.com
SMTP_PASS=otrp vhkp eniz vrsk
SMTP_FROM_EMAIL=rich091525@gmail.com
SMTP_FROM_NAME=RICH Bigte

# API Keys
GEMINI_API_KEY=AIzaSyDEQCI1lgzjGRIBXO1urcy5mL1_nhNxXRc
VISION_API_KEY=AIzaSyDjHCEp9AntErTKlMSNwkWCADw1nUk2okQ
```

### 6.2 Installing phpdotenv

```bash
composer require vlucas/phpdotenv
```

### 6.3 Creating Config File

Gumawa ng `php/config/database.php`:

```php
<?php
require_once __DIR__ . '/../../vendor/autoload.php';

$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../..');
$dotenv->load();

function getDBConnection() {
    $host = $_ENV['DB_HOST'];
    $user = $_ENV['DB_USER'];
    $pass = $_ENV['DB_PASS'];
    $db   = $_ENV['DB_NAME'];
    
    try {
        $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        return $pdo;
    } catch (PDOException $e) {
        error_log("Database connection failed: " . $e->getMessage());
        return null;
    }
}
?>
```

### 6.4 Updating .gitignore

I-add ang `.env` sa `.gitignore`:

```
.env
.env.local
.env.*.local
```

---

## 7. Summary Statistics

### API Usage
- **External APIs**: 2 (Google Gemini, Google Cloud Vision)
- **Internal PHP Endpoints**: 19 unique endpoints
- **Total API Calls**: 31 calls across 11 JavaScript files

### Credentials
- **Database Credentials**: Found in 16 PHP files
- **Email Credentials**: Found in 1 PHP file
- **API Keys**: 2 hardcoded keys

### Security Status
- **Critical Issues**: 5
- **Medium Priority Issues**: 3
- **Files Requiring Updates**: 18 PHP files + 1 JavaScript config

---

## 8. Appendix: Complete File List

### JavaScript Files with API Calls
1. `js/request.js` - 9 API calls
2. `js/emergency.js` - 2 API calls
3. `js/transactions.js` - 3 API calls
4. `js/concerns.js` - 2 API calls
5. `js/main_UI.js` - 7 API calls
6. `js/login.js` - 1 API call
7. `js/create_account1.js` - 2 API calls
8. `js/email_verification.js` - 2 API calls
9. `js/mpin_password.js` - 1 API call
10. `js/mpin_login.js` - 1 API call
11. `js/announcements.js` - 1 API call

### PHP Files with Credentials
1. `php/login.php`
2. `php/mpin_password.php`
3. `php/mpin_login.php`
4. `php/create_account1.php`
5. `php/resend_verification.php`
6. `php/verify_email.php`
7. `php/update_profile.php`
8. `php/submit_census.php`
9. `php/main_UI.php`
10. `php/request.php`
11. `php/check_census.php`
12. `php/concerns.php`
13. `php/check_active_requests.php`
14. `php/announcements.php`
15. `php/emergency.php`
16. `php/transactions.php`
17. `php/EmailSender.php`
18. `php/gemini_verify.php`
19. `php/vision_proxy.php`

---

**End of Report**

*Ito ay comprehensive audit report ng RICH_APP system. I-recommend na i-implement agad ang security improvements para maprotektahan ang system at user data.*
