-- Update certification_forms table to add new columns
-- Run this SQL to update the existing database

-- Add citizenship column
ALTER TABLE certification_forms 
ADD COLUMN IF NOT EXISTS citizenship VARCHAR(50) DEFAULT NULL AFTER purpose;

-- Add job column
ALTER TABLE certification_forms 
ADD COLUMN IF NOT EXISTS job VARCHAR(100) DEFAULT NULL AFTER citizenship;

-- Add date_hire column  
ALTER TABLE certification_forms 
ADD COLUMN IF NOT EXISTS date_hire DATE DEFAULT NULL AFTER job;

-- Add monthly_income column
ALTER TABLE certification_forms 
ADD COLUMN IF NOT EXISTS monthly_income DECIMAL(10,2) DEFAULT NULL AFTER date_hire;

-- Add year_residing column
ALTER TABLE certification_forms 
ADD COLUMN IF NOT EXISTS year_residing VARCHAR(50) DEFAULT NULL AFTER monthly_income;

-- Add month_year_passing column
ALTER TABLE certification_forms 
ADD COLUMN IF NOT EXISTS month_year_passing VARCHAR(50) DEFAULT NULL AFTER year_residing;

