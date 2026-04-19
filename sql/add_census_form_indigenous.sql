-- Indigenous Peoples (IP) — head of household row on census_form
ALTER TABLE census_form
    ADD COLUMN indigenous TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = Oo (IP), 0 = Hindi';
