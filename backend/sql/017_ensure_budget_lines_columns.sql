-- -----------------------------------------------------------------------------
-- Migration 017: Ensure budget_lines columns exist across all environments
-- -----------------------------------------------------------------------------

ALTER TABLE budget_lines ADD COLUMN budget_type ENUM('opex','capex','maintenance','replacement','revenue') NOT NULL DEFAULT 'opex';
ALTER TABLE budget_lines ADD COLUMN program_id INT UNSIGNED NULL;
ALTER TABLE budget_lines ADD COLUMN initial_amount DECIMAL(20,2) NOT NULL DEFAULT 0;
ALTER TABLE budget_lines ADD COLUMN control_mode ENUM('strict_block','warning','none') NOT NULL DEFAULT 'strict_block';

-- Backfill initial_amount with amount for existing lines
UPDATE budget_lines SET initial_amount = amount WHERE initial_amount = 0 AND amount > 0;
