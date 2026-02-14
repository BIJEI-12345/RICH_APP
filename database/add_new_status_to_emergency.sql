-- Add 'New' status to emergency_reports table
ALTER TABLE emergency_reports MODIFY COLUMN status ENUM('New', 'pending', 'processing', 'resolved', 'cancelled') DEFAULT 'New';

