-- Add emergency_image and landmark columns to emergency_reports table
-- Run this SQL to add the missing columns

ALTER TABLE emergency_reports ADD COLUMN emergency_image LONGBLOB DEFAULT NULL AFTER description;

ALTER TABLE emergency_reports ADD COLUMN landmark TEXT DEFAULT NULL AFTER location;

-- Verify the columns were added
SHOW COLUMNS FROM emergency_reports;

