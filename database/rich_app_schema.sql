-- RICH APP - Complete Database Schema
-- This schema includes all tables needed for the RICH application

-- User Registration Table
CREATE TABLE resident_information (
    id INT PRIMARY KEY AUTO_INCREMENT,
    first_name VARCHAR(50) NOT NULL,
    middle_name VARCHAR(50) DEFAULT NULL,
    last_name VARCHAR(50) NOT NULL,
    suffix VARCHAR(10) DEFAULT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    age INT NOT NULL,
    sex ENUM('Male', 'Female') NOT NULL,
    birthday DATE NOT NULL,
    civil_status ENUM('Single', 'Married', 'Divorced', 'Widowed') NOT NULL,
    address TEXT NOT NULL,
    valid_id VARCHAR(50) NOT NULL,
    id_image LONGBLOB DEFAULT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    mpin_password varchar(6) NOT NULL
);

-- OTP Verification Table for Email Verification
CREATE TABLE otp_verifications (
    id INT PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(100) NOT NULL,
    verification_code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_expires_at (expires_at)
);

-- Registration Logs Table for tracking registration attempts
CREATE TABLE registration_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(100) NOT NULL,
    success BOOLEAN NOT NULL,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Concerns Table - Community concerns and issues
CREATE TABLE concerns (
    id INT PRIMARY KEY AUTO_INCREMENT,
    concern_image LONGBLOB DEFAULT NULL,
    reporter_name VARCHAR(100) NOT NULL,
    contact VARCHAR(15) NOT NULL,
    date_and_time TIMESTAMP NOT NULL,
    location TEXT NOT NULL,
    statement TEXT NOT NULL,
    status ENUM('pending', 'processing', 'resolved', 'cancelled') DEFAULT 'pending',
    admin_notes TEXT DEFAULT NULL,
    resolved_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_reporter (reporter_name),
    INDEX idx_date (date_and_time)
);

-- Emergency Reports Table - Emergency situations
CREATE TABLE emergency_reports (
    id INT PRIMARY KEY AUTO_INCREMENT,
    emergency_type VARCHAR(100) NOT NULL,
    reporter_name VARCHAR(100) NOT NULL,
    date_and_time TIMESTAMP NOT NULL,
    description TEXT NOT NULL,
    location TEXT DEFAULT NULL,
    contact_number VARCHAR(15) DEFAULT NULL,
    status ENUM('New', 'pending', 'processing', 'resolved', 'cancelled') DEFAULT 'New',
    admin_notes TEXT DEFAULT NULL,
    resolved_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_emergency_type (emergency_type),
    INDEX idx_reporter (reporter_name),
    INDEX idx_date (date_and_time)
);

-- Emergency Report Logs Table - For tracking emergency report attempts
CREATE TABLE emergency_report_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    emergency_type VARCHAR(100) NOT NULL,
    reporter_name VARCHAR(100) NOT NULL,
    success BOOLEAN NOT NULL,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indigency Forms Table - Certificate of Indigency requests
CREATE TABLE indigency_forms (
    id INT PRIMARY KEY AUTO_INCREMENT,
    first_name VARCHAR(50) NOT NULL,
    middle_name VARCHAR(50) DEFAULT NULL,
    last_name VARCHAR(50) NOT NULL,
    address TEXT NOT NULL,
    birth_date DATE NOT NULL,
    birth_place VARCHAR(100) NOT NULL,
    civil_status VARCHAR(20) NOT NULL,
    age INT NOT NULL,
    gender VARCHAR(10) NOT NULL,
    purpose TEXT NOT NULL,
    valid_id VARCHAR(50) DEFAULT NULL,
    id_image LONGBLOB DEFAULT NULL,
    submitted_at TIMESTAMP NOT NULL,
    status ENUM('pending', 'processing', 'completed', 'cancelled') DEFAULT 'pending',
    admin_notes TEXT DEFAULT NULL,
    completed_at TIMESTAMP NULL DEFAULT NULL,
    document_url VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_name (first_name, last_name),
    INDEX idx_submitted (submitted_at)
);

-- Barangay ID Forms Table - Barangay ID requests
CREATE TABLE barangay_id_forms (
    id INT PRIMARY KEY AUTO_INCREMENT,
    last_name VARCHAR(50) NOT NULL,
    given_name VARCHAR(50) NOT NULL,
    middle_name VARCHAR(50) DEFAULT NULL,
    birth_date DATE NOT NULL,
    address TEXT NOT NULL,
    civil_status VARCHAR(20) NOT NULL,
    height VARCHAR(10) NOT NULL,
    weight VARCHAR(10) NOT NULL,
    gender VARCHAR(10) NOT NULL,
    nationality VARCHAR(50) NOT NULL,
    emergency_contact_name VARCHAR(100) NOT NULL,
    emergency_contact_number VARCHAR(15) NOT NULL,
    is_censused VARCHAR(10) NOT NULL,
    residency_duration VARCHAR(50) NOT NULL,
    valid_id VARCHAR(50) NOT NULL,
    id_image LONGBLOB DEFAULT NULL,
    submitted_at TIMESTAMP NOT NULL,
    status ENUM('pending', 'processing', 'completed', 'cancelled') DEFAULT 'pending',
    admin_notes TEXT DEFAULT NULL,
    completed_at TIMESTAMP NULL DEFAULT NULL,
    document_url VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_name (last_name, given_name),
    INDEX idx_submitted (submitted_at)
);

-- Certification Forms Table - Various certification requests
CREATE TABLE certification_forms (
    id INT PRIMARY KEY AUTO_INCREMENT,
    first_name VARCHAR(50) NOT NULL,
    middle_name VARCHAR(50) DEFAULT NULL,
    last_name VARCHAR(50) NOT NULL,
    address TEXT NOT NULL,
    birth_date DATE NOT NULL,
    birth_place VARCHAR(100) NOT NULL,
    civil_status VARCHAR(20) NOT NULL,
    gender VARCHAR(10) NOT NULL,
    purpose TEXT NOT NULL,
    citizenship VARCHAR(50) DEFAULT NULL,
    job VARCHAR(100) DEFAULT NULL,
    date_hire DATE DEFAULT NULL,
    monthly_income DECIMAL(10,2) DEFAULT NULL,
    year_residing VARCHAR(50) DEFAULT NULL,
    month_year_passing VARCHAR(50) DEFAULT NULL,
    valid_id VARCHAR(50) DEFAULT NULL,
    id_image LONGBLOB DEFAULT NULL,
    submitted_at TIMESTAMP NOT NULL,
    status ENUM('pending', 'processing', 'completed', 'cancelled') DEFAULT 'pending',
    admin_notes TEXT DEFAULT NULL,
    completed_at TIMESTAMP NULL DEFAULT NULL,
    document_url VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_name (first_name, last_name),
    INDEX idx_submitted (submitted_at)
);

-- Certificate of Employment Forms Table - COE requests
CREATE TABLE coe_forms (
    id INT PRIMARY KEY AUTO_INCREMENT,
    first_name VARCHAR(50) NOT NULL,
    middle_name VARCHAR(50) DEFAULT NULL,
    last_name VARCHAR(50) NOT NULL,
    address TEXT NOT NULL,
    age INT NOT NULL,
    gender VARCHAR(10) NOT NULL,
    civil_status VARCHAR(20) NOT NULL,
    employment_type VARCHAR(50) NOT NULL,
    position VARCHAR(100) NOT NULL,
    date_started DATE NOT NULL,
    monthly_salary DECIMAL(10,2) NOT NULL,
    valid_id VARCHAR(50) DEFAULT NULL,
    id_image LONGBLOB DEFAULT NULL,
    submitted_at TIMESTAMP NOT NULL,
    status ENUM('pending', 'processing', 'completed', 'cancelled') DEFAULT 'pending',
    admin_notes TEXT DEFAULT NULL,
    completed_at TIMESTAMP NULL DEFAULT NULL,
    document_url VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_name (first_name, last_name),
    INDEX idx_submitted (submitted_at)
);

-- Clearance Forms Table - Clearance certificate requests
CREATE TABLE clearance_forms (
    id INT PRIMARY KEY AUTO_INCREMENT,
    first_name VARCHAR(50) NOT NULL,
    middle_name VARCHAR(50) DEFAULT NULL,
    last_name VARCHAR(50) NOT NULL,
    address TEXT NOT NULL,
    birth_date DATE NOT NULL,
    birth_place VARCHAR(100) NOT NULL,
    civil_status VARCHAR(20) NOT NULL,
    age INT NOT NULL,
    gender VARCHAR(10) NOT NULL,
    purpose TEXT NOT NULL,
    citizenship VARCHAR(50) DEFAULT NULL,
    business_name VARCHAR(255) DEFAULT NULL,
    location VARCHAR(255) DEFAULT NULL,
    valid_id VARCHAR(50) DEFAULT NULL,
    id_image LONGBLOB DEFAULT NULL,
    submitted_at TIMESTAMP NOT NULL,
    status ENUM('pending', 'processing', 'completed', 'cancelled') DEFAULT 'pending',
    admin_notes TEXT DEFAULT NULL,
    completed_at TIMESTAMP NULL DEFAULT NULL,
    document_url VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_name (first_name, last_name),
    INDEX idx_submitted (submitted_at)
);

-- Transactions Table - Unified view of all requests (for admin/overview purposes)
CREATE TABLE transactions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    request_type ENUM('concern', 'emergency', 'indigency', 'barangay_id', 'certification', 'coe', 'clearance') NOT NULL,
    request_id INT NOT NULL,
    document_type VARCHAR(100) NOT NULL,
    reference_number VARCHAR(50) NOT NULL,
    status ENUM('pending', 'processing', 'completed', 'resolved', 'cancelled') NOT NULL,
    amount DECIMAL(10,2) DEFAULT 0.00,
    request_date TIMESTAMP NOT NULL,
    due_date TIMESTAMP DEFAULT NULL,
    processing_days INT DEFAULT 7,
    processing_date TIMESTAMP NULL DEFAULT NULL,
    completion_date TIMESTAMP NULL DEFAULT NULL,
    notes TEXT DEFAULT NULL,
    document_url VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_status (status),
    INDEX idx_request_type (request_type),
    INDEX idx_reference (reference_number),
    FOREIGN KEY (user_id) REFERENCES resident_information(id) ON DELETE CASCADE
);

 -- cpnumber VARCHAR(15) DEFAULT NULL, dont erase, dont change.