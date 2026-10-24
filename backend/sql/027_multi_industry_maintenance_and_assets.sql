-- =============================================================================
-- LedgerCore :: 027_multi_industry_maintenance_and_assets.sql
-- Multi-Industry Maintenance, Asset Management & Reliability Engineering
-- Supports Mining, Manufacturing & Production, Services, Fleet, Facilities, IT, and Healthcare.
-- =============================================================================

-- 1. Expand asset_categories domain and taxonomy systems
ALTER TABLE asset_categories
  MODIFY COLUMN domain ENUM('mining','production','biomedical','facility','fleet','it_office','services') NOT NULL DEFAULT 'production',
  MODIFY COLUMN taxonomy_system ENUM('internal','iso14224','eclass','vmrs','umdns','gmdn','unspsc','none') NOT NULL DEFAULT 'internal';

-- 2. Expand work_orders assigned_team and wo_type
ALTER TABLE work_orders
  MODIFY COLUMN assigned_team ENUM('mechanical','electrical','production','heavy_equipment','biomedical','facilities','it','fleet','external') NOT NULL DEFAULT 'mechanical',
  MODIFY COLUMN wo_type ENUM('preventive','corrective','predictive','calibration','safety_test','overhaul','inspection','installation','vehicle_service') NOT NULL DEFAULT 'corrective';

-- 3. Expand maintenance_plans assigned_team, plan_type and interval_source
ALTER TABLE maintenance_plans
  MODIFY COLUMN assigned_team ENUM('mechanical','electrical','production','heavy_equipment','biomedical','facilities','it','fleet','external') NOT NULL DEFAULT 'mechanical',
  MODIFY COLUMN plan_type ENUM('preventive','corrective','predictive','calibration','safety_test','overhaul','inspection','statutory','vehicle_service') NOT NULL DEFAULT 'preventive',
  MODIFY COLUMN interval_source ENUM('manufacturer','local_regulation','internal','who_guideline','msha_osha','industry_standard') NOT NULL DEFAULT 'manufacturer';

-- 4. Expand asset_disposals method with hazardous industrial waste
ALTER TABLE asset_disposals
  MODIFY COLUMN method ENUM('sale','donation','scrap','trade_in','biomedical_waste','hazardous_waste','write_off','theft_loss','return_to_donor') NOT NULL;
