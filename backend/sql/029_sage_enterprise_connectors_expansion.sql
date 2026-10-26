-- 029_sage_enterprise_connectors_expansion.sql
-- Enterprise Connector Expansion: Sage X3, Sage Intacct, Sage 300, Sage 200 Professional

-- 1. Extend branch_establishments with erp_flavor, auth_type, connector_config
ALTER TABLE branch_establishments
  ADD COLUMN IF NOT EXISTS erp_flavor VARCHAR(50) NOT NULL DEFAULT 'sage_100c',
  ADD COLUMN IF NOT EXISTS auth_type VARCHAR(50) NOT NULL DEFAULT 'api_key',
  ADD COLUMN IF NOT EXISTS connector_config JSON NULL;

-- 2. Modify sage_sync_logs format column to VARCHAR(50) for future-proof support of all Sage variants
ALTER TABLE sage_sync_logs
  MODIFY COLUMN format VARCHAR(50) NOT NULL;

-- 3. Seed / Update representative branches for all 4 Sage enterprise tiers

-- A. Sage X3 Finance: Douala Regional Medical Center & Hub
UPDATE branch_establishments
   SET erp_system = 'sage_x3',
       erp_flavor = 'sage_x3',
       auth_type = 'oauth2',
       sage_company_id = 'SAGE_DOUALA_X3',
       api_endpoint_url = 'https://syracuse-douala.shisong.health/api/v1/budget',
       api_key_or_token = 'x3_syracuse_token_dla_9918',
       connector_config = JSON_OBJECT(
         'syracuse_folder', 'SEED',
         'financial_site', 'DOUALA_CLINIC',
         'analytical_ledger', 'SYSCOHADA_X3',
         'axis_cost_center', 'AXE_CC',
         'axis_program', 'AXE_PRG',
         'web_service_pool', 'WSSAGE_X3'
       ),
       sync_frequency = 'realtime',
       last_sync_status = 'success',
       last_sync_at = NOW(),
       last_sync_message = 'Sage X3 Syracuse Web Services connected (REST & GraphQL)',
       budget_allocation_total = 120000000.00
 WHERE code = 'DOUALA-BR' AND org_id = 1;

-- B. Sage Intacct: Bafoussam Referral Polyclinic
INSERT INTO branch_establishments 
  (org_id, code, name, city, branch_type, liaison_account_code, is_active, erp_system, erp_flavor, auth_type, sage_company_id, api_endpoint_url, api_key_or_token, connector_config, sync_frequency, last_sync_status, last_sync_at, last_sync_message, budget_allocation_total)
VALUES 
  (1, 'BAFOUSSAM-POLY', 'Polyclinique de Référence de Bafoussam', 'Bafoussam', 'hospital', '1852', 1, 'sage_intacct', 'sage_intacct', 'xml_rpc', 'INTACCT_BAFOUSSAM_CORP', 'https://api.intacct.com/ia/xml/xmlgw.phtml', 'intacct_live_token_bfs_7781', 
   JSON_OBJECT(
     'company_id', 'SHISONG_HEALTH_BAF',
     'entity_id', 'ENT_BAFOUSSAM',
     'sender_id', 'TSSF_GATEWAY',
     'location_id', 'LOC-BAF-01',
     'department_id', 'DEPT-CLINICAL',
     'budget_book', 'ORIGINAL_APPROVED_2026'
   ),
   'hourly', 'success', NOW(), 'Sage Intacct Web Services 3.0 gateway active (XML-RPC & JSON)', 85000000.00)
ON DUPLICATE KEY UPDATE 
  erp_system = 'sage_intacct',
  erp_flavor = 'sage_intacct',
  auth_type = 'xml_rpc',
  sage_company_id = 'INTACCT_BAFOUSSAM_CORP',
  api_endpoint_url = 'https://api.intacct.com/ia/xml/xmlgw.phtml',
  api_key_or_token = 'intacct_live_token_bfs_7781',
  connector_config = JSON_OBJECT(
     'company_id', 'SHISONG_HEALTH_BAF',
     'entity_id', 'ENT_BAFOUSSAM',
     'sender_id', 'TSSF_GATEWAY',
     'location_id', 'LOC-BAF-01',
     'department_id', 'DEPT-CLINICAL',
     'budget_book', 'ORIGINAL_APPROVED_2026'
  ),
  last_sync_status = 'success',
  budget_allocation_total = 85000000.00;

-- C. Sage 300 (Accpac): Garoua Regional Medical Supply & Distribution Hub
INSERT INTO branch_establishments 
  (org_id, code, name, city, branch_type, liaison_account_code, is_active, erp_system, erp_flavor, auth_type, sage_company_id, api_endpoint_url, api_key_or_token, connector_config, sync_frequency, last_sync_status, last_sync_at, last_sync_message, budget_allocation_total)
VALUES 
  (1, 'GAROUA-DIST', 'Centre Logistique & Pharmacie Régionale de Garoua', 'Garoua', 'pharmacy', '1852', 1, 'sage_300', 'sage_300', 'api_key', 'SAGE300_GAROUA_MED', 'https://sage300.shisong.health/Sage300WebApi/v1.0/-/GL', 'sage300_api_key_garoua_5521', 
   JSON_OBJECT(
     'database_id', 'GAROUALTD',
     'fiscal_year', '2026',
     'budget_set_id', 1,
     'currency_code', 'XAF',
     'default_account_segment', 'GAR-PHARMA'
   ),
   'daily', 'success', NOW(), 'Sage 300 Web API OData v4 synchronized (Budget Set 1)', 60000000.00)
ON DUPLICATE KEY UPDATE 
  erp_system = 'sage_300',
  erp_flavor = 'sage_300',
  auth_type = 'api_key',
  sage_company_id = 'SAGE300_GAROUA_MED',
  api_endpoint_url = 'https://sage300.shisong.health/Sage300WebApi/v1.0/-/GL',
  api_key_or_token = 'sage300_api_key_garoua_5521',
  connector_config = JSON_OBJECT(
     'database_id', 'GAROUALTD',
     'fiscal_year', '2026',
     'budget_set_id', 1,
     'currency_code', 'XAF',
     'default_account_segment', 'GAR-PHARMA'
  ),
  last_sync_status = 'success',
  budget_allocation_total = 60000000.00;

-- D. Sage 200 Professional: Kumba Community Medical Center
INSERT INTO branch_establishments 
  (org_id, code, name, city, branch_type, liaison_account_code, is_active, erp_system, erp_flavor, auth_type, sage_company_id, api_endpoint_url, api_key_or_token, connector_config, sync_frequency, last_sync_status, last_sync_at, last_sync_message, budget_allocation_total)
VALUES 
  (1, 'KUMBA-CARE', 'Centre de Soins de Proximité de Kumba', 'Kumba', 'clinic', '1852', 1, 'sage_200', 'sage_200', 'oauth2', 'SAGE200_KUMBA_CORP', 'https://api.columbus.sage.com/uk/sage200/v1/companies/KUMBA_01', 'sage200_oauth_kumba_3310', 
   JSON_OBJECT(
     'company_id', 'KUMBA_01',
     'subscription_key', 'SUB_KEY_KUMBA_2026',
     'cost_centre_code', 'CC_KUMBA',
     'department_code', 'DEPT_CARE',
     'monthly_distribution', 'equal_twelfths'
   ),
   'daily', 'success', NOW(), 'Sage 200 Professional REST API linked (Columbus Gateway)', 45000000.00)
ON DUPLICATE KEY UPDATE 
  erp_system = 'sage_200',
  erp_flavor = 'sage_200',
  auth_type = 'oauth2',
  sage_company_id = 'SAGE200_KUMBA_CORP',
  api_endpoint_url = 'https://api.columbus.sage.com/uk/sage200/v1/companies/KUMBA_01',
  api_key_or_token = 'sage200_oauth_kumba_3310',
  connector_config = JSON_OBJECT(
     'company_id', 'KUMBA_01',
     'subscription_key', 'SUB_KEY_KUMBA_2026',
     'cost_centre_code', 'CC_KUMBA',
     'department_code', 'DEPT_CARE',
     'monthly_distribution', 'equal_twelfths'
  ),
  last_sync_status = 'success',
  budget_allocation_total = 45000000.00;

-- E. Sage 100c: Yaoundé Liaison
UPDATE branch_establishments
   SET erp_system = 'sage_100c',
       erp_flavor = 'sage_100c',
       auth_type = 'api_key',
       connector_config = JSON_OBJECT(
         'dossier_id', 'SAGE_YAOUNDE_CLINIC',
         'pnm_format', 'PARAMETRABLE_STANDARD',
         'encoding', 'WINDOWS-1252',
         'accounting_plan', 'SYSCOHADA'
       )
 WHERE code = 'YAOUNDE-LIAISON' AND org_id = 1;

-- F. Sage 100c: Bamenda Satellite
UPDATE branch_establishments
   SET erp_system = 'sage_100c',
       erp_flavor = 'sage_100c',
       auth_type = 'api_key',
       connector_config = JSON_OBJECT(
         'dossier_id', 'SAGE_BAMENDA_SAT',
         'pnm_format', 'PARAMETRABLE_STANDARD',
         'encoding', 'WINDOWS-1252',
         'accounting_plan', 'SYSCOHADA'
       )
 WHERE code = 'BAMENDA-SAT' AND org_id = 1;
