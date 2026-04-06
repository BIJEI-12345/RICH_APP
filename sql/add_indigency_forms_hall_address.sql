-- Run once on your RICH_APP database (e.g. phpMyAdmin).
-- Hall / capitol address derived from Para Kay position_code on the server.

ALTER TABLE indigency_forms
  ADD COLUMN hall_address VARCHAR(255) NULL DEFAULT NULL AFTER `position`;
