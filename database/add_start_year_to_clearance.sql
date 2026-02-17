-- Add start_year column to clearance_forms table
-- Run this SQL to update the existing database

ALTER TABLE clearance_forms 
ADD COLUMN IF NOT EXISTS start_year VARCHAR(50) DEFAULT NULL AFTER location;
