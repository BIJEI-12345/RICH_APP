-- Update clearance_forms table to add new columns
-- Run this SQL to update the existing database

-- Add citizenship column
ALTER TABLE clearance_forms 
ADD COLUMN IF NOT EXISTS citizenship VARCHAR(50) DEFAULT NULL AFTER purpose;

-- Add business_name column
ALTER TABLE clearance_forms 
ADD COLUMN IF NOT EXISTS business_name VARCHAR(255) DEFAULT NULL AFTER citizenship;

-- Add location column  
ALTER TABLE clearance_forms 
ADD COLUMN IF NOT EXISTS location VARCHAR(255) DEFAULT NULL AFTER business_name;

