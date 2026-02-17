-- RICH APP Database Schema
-- Database: rich_db

CREATE DATABASE IF NOT EXISTS rich_db;
USE rich_db;

-- Resident Information Table
CREATE TABLE resident_information (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    profile_pic LONGBLOB NULL,
    first_name VARCHAR(50) NOT NULL,
    middle_name VARCHAR(50) NULL,
    last_name VARCHAR(50) NOT NULL,
    suffix VARCHAR(10) NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    age INT NULL,
    sex ENUM('Male', 'Female') NULL,
    birthday DATE NULL,
    civil_status ENUM('Single', 'Married', 'Widowed', 'Separated') NULL,
    address TEXT NULL,
    valid_id VARCHAR(50) NULL,
    id_image LONGBLOB NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    email_verified TINYINT(1) DEFAULT 0,
    mpin_password VARCHAR(6) NULL
);

-- Barangay Users Table
CREATE TABLE brgy_users (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    edit_profile LONGBLOB NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    age INT NULL,
    position VARCHAR(50) NULL,
    gender ENUM('Male','Female') NULL,
    address VARCHAR(255) NULL,
    password VARCHAR(50) NOT NULL,
    confirm_pass VARCHAR(50) NOT NULL,
    action ENUM('accepted','declined','pending') DEFAULT 'pending',
    last_login DATETIME NULL,
    last_logout DATETIME NULL,
    total_active_hours DECIMAL(10,2) NOT NULL DEFAULT 0,
    online_offline ENUM('online', 'offline') DEFAULT 'offline',
    verified_email TINYINT(1) DEFAULT 0,
    otp_code VARCHAR(6) NULL,
    otp_expires_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Concerns Table
CREATE TABLE concerns (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255),
    concern_image LONGBLOB NULL,
    reporter_name VARCHAR(100) NULL,
    contact VARCHAR(15) NULL,
    date_and_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    location VARCHAR(150) NULL,
    statement TEXT NULL,
    status ENUM('new','processing','resolved') DEFAULT 'new',
    resolved_at DATETIME NULL,
    process_at DATETIME NULL,
    risk_level ENUM('low','medium','high') DEFAULT 'low'
);

-- Emergency Reports Table
CREATE TABLE emergency_reports (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255),
    emergency_image LONGBLOB,
    emergency_type VARCHAR(50) NOT NULL,
    location VARCHAR(255) NOT NULL,
    landmark VARCHAR(100),
    reporter_name VARCHAR(100) NOT NULL,
    date_and_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    description TEXT,
    status ENUM('NEW', 'RESOLVED') DEFAULT 'NEW',
    resolved_datetime DATETIME
);

-- Barangay ID Forms Table
CREATE TABLE barangay_id_forms (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    res_picture LONGBLOB,
    last_name VARCHAR(100) NOT NULL,
    given_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    email VARCHAR(100) NULL,
    birth_date DATE,
    address TEXT,
    civil_status ENUM('SINGLE', 'MARRIED', 'WIDOW'),
    height DECIMAL(5,2),
    weight DECIMAL(5,2),
    gender ENUM('MALE', 'FEMALE') NOT NULL,
    nationality VARCHAR(100) DEFAULT 'Filipino',
    emergency_contact_name VARCHAR(255),
    emergency_contact_number VARCHAR(20),
    is_censused TINYINT(1) DEFAULT 0,
    residency_duration VARCHAR(100),
    valid_id VARCHAR(50) NOT NULL,
    id_image LONGBLOB,
    status ENUM('New', 'Processing', 'Finished') DEFAULT 'New',
    submitted_at DATETIME,
    process_at DATETIME DEFAULT NULL,
    finish_at DATETIME DEFAULT NULL,
    INDEX idx_email (email)
);

-- Certification Forms Table
CREATE TABLE certification_forms (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NULL,
    address TEXT,
    birth_date DATE,
    birth_place VARCHAR(255),
    civil_status ENUM('MARRIED', 'SINGLE', 'WIDOWED'),
    gender ENUM('MALE', 'FEMALE'),
    purpose TEXT NOT NULL,
    citizenship VARCHAR(40),
    start_year YEAR,
    job_position VARCHAR(50),
    start_of_work VARCHAR(30),
    monthly_income VARCHAR(40),
    month_year VARCHAR(40),
    valid_id VARCHAR(50) NOT NULL,
    id_image LONGBLOB,
    status ENUM('New', 'Processing', 'Finished') DEFAULT 'New',
    submitted_at DATETIME,
    process_at DATETIME,
    finish_at DATETIME,
    INDEX idx_email (email)
);

-- Clearance Forms Table
CREATE TABLE clearance_forms (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NULL,
    business_name VARCHAR(100),
    location VARCHAR(255),
    address TEXT,
    start_year YEAR,
    birth_date DATE,
    birth_place VARCHAR(255),
    civil_status ENUM('MARRIED', 'SINGLE', 'WIDOWED'),
    citizenship VARCHAR(40),
    age INT,
    gender ENUM('MALE', 'FEMALE'),
    purpose TEXT NOT NULL,
    valid_id VARCHAR(50) NOT NULL,
    id_image LONGBLOB,
    status ENUM('New', 'Processing', 'Finished') DEFAULT 'New',
    submitted_at DATETIME,
    process_at DATETIME,
    finish_at DATETIME,
    INDEX idx_email (email)
);

-- COE Forms Table
CREATE TABLE coe_forms (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NULL,
    address TEXT,
    age INT,
    gender ENUM('MALE', 'FEMALE'),
    civil_status ENUM('SINGLE', 'MARRIED', 'WIDOW'),
    employment_type ENUM('ON_CALL', 'SELF_EMPLOYED', 'CONTRACTUAL'),
    position VARCHAR(255),
    date_started VARCHAR(30),
    monthly_salary DECIMAL(12,2),
    valid_id VARCHAR(50) NOT NULL,
    id_image LONGBLOB,
    status ENUM('New', 'Processing', 'Finished') DEFAULT 'New',
    submitted_at DATETIME,
    process_at DATETIME,
    finish_at DATETIME,
    INDEX idx_email (email)
);

-- Indigency Forms Table
CREATE TABLE indigency_forms (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NULL,
    address TEXT,
    birth_date DATE,
    birth_place VARCHAR(255),
    civil_status ENUM('MARRIED', 'SINGLE', 'WIDOWED'),
    age INT,
    gender ENUM('MALE', 'FEMALE'),
    purpose TEXT NOT NULL,
    valid_id VARCHAR(50) NOT NULL,
    id_image LONGBLOB,
    status ENUM('New', 'Processing', 'Finished') DEFAULT 'New',
    submitted_at DATETIME,
    process_at DATETIME,
    finish_at DATETIME,
    INDEX idx_email (email)
);

-- Announcements Table
CREATE TABLE announcements (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    date_and_time DATETIME NOT NULL,
    description TEXT,
    image LONGBLOB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- OTP Verifications Table
CREATE TABLE otp_verifications (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(100) NOT NULL,
    verification_code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Registration Logs Table
CREATE TABLE registration_logs (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(100) NOT NULL,
    success TINYINT(1) NOT NULL,
    ip_address VARCHAR(40),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Census Form Table
CREATE TABLE census_form (
    id INT AUTO_INCREMENT PRIMARY KEY,
    census_id INT NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    suffix VARCHAR(10),
    age INT,
    sex ENUM('Male', 'Female', 'Other'),
    birthday DATE,
    civil_status VARCHAR(50),
    contact_number VARCHAR(20),
    occupation VARCHAR(100),
    place_of_work VARCHAR(150),
    barangay_supported_benefits TEXT,
    complete_address TEXT,
    relation_to_household VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

