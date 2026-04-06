-- Run once on your RICH_APP database (e.g. phpMyAdmin or mysql CLI).
-- Stores English|Tagalog title in one column, e.g. GOVERNOR|Punong Lalawigan

ALTER TABLE indigency_forms
  ADD COLUMN `position` VARCHAR(128) NULL DEFAULT NULL AFTER para_kay;
