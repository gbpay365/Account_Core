/**
 * FR-STD-010 / FR-STD-020 :: IFRS presentation layer.
 *
 * SYSCOHADA stays the single chart of record. These are presentation lines
 * (IAS 1) that SYSCOHADA accounts map onto, so one transaction produces both
 * statutory and IFRS output without a second data entry.
 */

// [code, name_en, name_fr, statement, section, sub_section, sign, sort]
export const IFRS_ACCOUNTS = [
  // --- Statement of Financial Position -------------------------------------
  ['SOFP.PPE', 'Property, plant and equipment', 'Immobilisations corporelles', 'sofp', 'non_current_assets', null, 1, 100, '5'],
  ['SOFP.INTANGIBLE', 'Intangible assets', 'Immobilisations incorporelles', 'sofp', 'non_current_assets', null, 1, 110, '6'],
  ['SOFP.RIGHT_OF_USE', 'Right-of-use assets', "Droits d'utilisation", 'sofp', 'non_current_assets', null, 1, 120, '7'],
  ['SOFP.FIN_NC', 'Non-current financial assets', 'Actifs financiers non courants', 'sofp', 'non_current_assets', null, 1, 130, null],
  ['SOFP.OTHER_NC', 'Other non-current assets', 'Autres actifs non courants', 'sofp', 'non_current_assets', null, 1, 140, null],
  ['SOFP.INVENTORY', 'Inventories', 'Stocks', 'sofp', 'current_assets', null, 1, 200, '8'],
  ['SOFP.TRADE_RECV', 'Trade and other receivables', 'Clients et autres debiteurs', 'sofp', 'current_assets', null, 1, 210, '9'],
  ['SOFP.TAX_RECV', 'Current tax assets', "Creances d'impot exigible", 'sofp', 'current_assets', null, 1, 220, null],
  ['SOFP.PREPAID', 'Prepayments', "Charges payees d'avance", 'sofp', 'current_assets', null, 1, 230, null],
  ['SOFP.CASH', 'Cash and cash equivalents', 'Tresorerie et equivalents de tresorerie', 'sofp', 'current_assets', null, 1, 240, '10'],

  ['SOFP.SHARE_CAPITAL', 'Share capital and endowment', 'Capital et dotation', 'sofp', 'equity', null, -1, 300, '11'],
  ['SOFP.SHARE_PREMIUM', 'Share premium', 'Primes liees au capital', 'sofp', 'equity', null, -1, 310, null],
  ['SOFP.REVAL_SURPLUS', 'Revaluation surplus', 'Ecarts de reevaluation', 'sofp', 'equity', null, -1, 320, '5'],
  ['SOFP.OTHER_RESERVES', 'Other reserves', 'Autres reserves', 'sofp', 'equity', null, -1, 330, null],
  ['SOFP.RETAINED', 'Retained earnings', 'Report a nouveau', 'sofp', 'equity', null, -1, 340, null],
  ['SOFP.RESULT', 'Profit or loss for the year', "Resultat de l'exercice", 'sofp', 'equity', null, -1, 350, null],

  ['SOFP.LT_BORROW', 'Long-term borrowings', 'Emprunts a long terme', 'sofp', 'non_current_liabilities', null, -1, 400, '12'],
  ['SOFP.LEASE_NC', 'Lease liabilities', 'Dettes de location', 'sofp', 'non_current_liabilities', null, -1, 410, '7'],
  ['SOFP.PROV_NC', 'Non-current provisions', 'Provisions non courantes', 'sofp', 'non_current_liabilities', null, -1, 420, '13'],
  ['SOFP.DEF_GRANT', 'Deferred income - government grants', "Subventions d'investissement differees", 'sofp', 'non_current_liabilities', null, -1, 430, '14'],
  ['SOFP.TRADE_PAY', 'Trade and other payables', 'Fournisseurs et autres crediteurs', 'sofp', 'current_liabilities', null, -1, 500, '15'],
  ['SOFP.ST_BORROW', 'Short-term borrowings and bank overdrafts', 'Emprunts a court terme et decouverts', 'sofp', 'current_liabilities', null, -1, 510, '12'],
  ['SOFP.TAX_PAY', 'Current tax liabilities', "Dettes d'impot exigible", 'sofp', 'current_liabilities', null, -1, 520, null],
  ['SOFP.PROV_C', 'Current provisions', 'Provisions courantes', 'sofp', 'current_liabilities', null, -1, 530, '13'],
  ['SOFP.DEF_INCOME', 'Deferred income', "Produits constates d'avance", 'sofp', 'current_liabilities', null, -1, 540, null],

  // --- Statement of Profit or Loss ------------------------------------------
  ['PL.REVENUE', 'Revenue from contracts with customers', 'Produits des activites hospitalieres', 'pl', 'revenue', null, -1, 100, '3'],
  ['PL.GRANT_INCOME', 'Government grants and donor funding', 'Subventions et financements bailleurs', 'pl', 'revenue', null, -1, 110, '14'],
  ['PL.OTHER_INCOME', 'Other operating income', "Autres produits d'exploitation", 'pl', 'revenue', null, -1, 120, null],
  ['PL.CONSUMABLES', 'Medical consumables and pharmaceuticals', 'Consommables medicaux et produits pharmaceutiques', 'pl', 'operating_expenses', null, 1, 200, null],
  ['PL.STAFF', 'Employee benefit expenses', 'Charges de personnel', 'pl', 'operating_expenses', null, 1, 210, '4'],
  ['PL.DEPRECIATION', 'Depreciation and amortisation', 'Dotations aux amortissements', 'pl', 'operating_expenses', null, 1, 220, '5'],
  ['PL.MAINTENANCE', 'Repairs, maintenance and calibration', 'Entretien, maintenance et etalonnage', 'pl', 'operating_expenses', null, 1, 230, null],
  ['PL.UTILITIES', 'Utilities and energy', 'Energie et fluides', 'pl', 'operating_expenses', null, 1, 240, null],
  ['PL.OTHER_OPEX', 'Other operating expenses', "Autres charges d'exploitation", 'pl', 'operating_expenses', null, 1, 250, null],
  ['PL.IMPAIRMENT', 'Impairment losses', 'Pertes de valeur', 'pl', 'operating_expenses', null, 1, 260, '5'],
  // Sits in operating expenses, which the P&L subtracts, so the sign must make
  // a loss on disposal positive: carrying amount (debit) less proceeds (credit).
  ['PL.DISPOSAL_RESULT', 'Loss / (gain) on disposal of assets', "Resultat sur cessions d'immobilisations", 'pl', 'operating_expenses', null, 1, 270, '5'],
  // The finance section is presented net and added to operating profit, so a
  // cost has to carry a negative sign here.
  ['PL.FINANCE_INCOME', 'Finance income', 'Produits financiers', 'pl', 'finance', null, -1, 300, null],
  ['PL.FINANCE_COST', 'Finance costs', 'Charges financieres', 'pl', 'finance', null, -1, 310, null],
  ['PL.FX_RESULT', 'Net foreign exchange gain / (loss)', 'Resultat de change net', 'pl', 'finance', null, -1, 320, '2'],
  ['PL.TAX', 'Income tax expense', "Charge d'impot sur le resultat", 'pl', 'tax', null, 1, 400, null],

  // --- Other Comprehensive Income -------------------------------------------
  ['OCI.REVAL', 'Revaluation surplus on property, plant and equipment', 'Ecart de reevaluation sur immobilisations', 'oci', 'not_reclassified', null, -1, 100, '5'],
  ['OCI.FX_TRANSLATION', 'Exchange differences on translating foreign operations', 'Ecarts de conversion', 'oci', 'reclassified', null, -1, 200, '2'],

  // --- Cash flow (IAS 7, indirect) ------------------------------------------
  ['CF.OPERATING', 'Net cash from operating activities', "Flux net de tresorerie lies a l'exploitation", 'cf', 'operating', null, 1, 100, null],
  ['CF.INVESTING', 'Net cash used in investing activities', "Flux net de tresorerie lies a l'investissement", 'cf', 'investing', null, 1, 200, null],
  ['CF.FINANCING', 'Net cash from financing activities', 'Flux net de tresorerie lies au financement', 'cf', 'financing', null, 1, 300, null],
];

/**
 * Longest-prefix mapping from SYSCOHADA account codes to IFRS presentation
 * lines. The seeder resolves this to explicit rows in `account_mappings`, so a
 * finance team can then override any single account without touching code.
 */
export const IFRS_MAPPING_RULES = [
  // Non-current assets. PP&E is presented net, so accumulated depreciation and
  // impairment of tangibles map onto the same line as the gross cost.
  ['22', 'SOFP.PPE'], ['23', 'SOFP.PPE'], ['24', 'SOFP.PPE'], ['249', 'SOFP.PPE'],
  ['283', 'SOFP.PPE'], ['284', 'SOFP.PPE'], ['292', 'SOFP.PPE'], ['293', 'SOFP.PPE'], ['294', 'SOFP.PPE'],
  ['21', 'SOFP.INTANGIBLE'], ['281', 'SOFP.INTANGIBLE'], ['291', 'SOFP.INTANGIBLE'],
  ['17', 'SOFP.LEASE_NC'],
  ['25', 'SOFP.OTHER_NC'],
  ['26', 'SOFP.FIN_NC'], ['27', 'SOFP.FIN_NC'], ['296', 'SOFP.FIN_NC'], ['297', 'SOFP.FIN_NC'],

  // Current assets
  ['3', 'SOFP.INVENTORY'], ['39', 'SOFP.INVENTORY'],
  ['409', 'SOFP.TRADE_RECV'], ['41', 'SOFP.TRADE_RECV'], ['421', 'SOFP.TRADE_RECV'],
  ['45', 'SOFP.TRADE_RECV'], ['46', 'SOFP.TRADE_RECV'], ['471', 'SOFP.TRADE_RECV'],
  ['485', 'SOFP.TRADE_RECV'], ['4881', 'SOFP.TRADE_RECV'], ['49', 'SOFP.TRADE_RECV'],
  ['4781', 'SOFP.TRADE_RECV'],
  ['445', 'SOFP.TAX_RECV'], ['4449', 'SOFP.TAX_RECV'],
  ['476', 'SOFP.PREPAID'],
  ['50', 'SOFP.CASH'], ['51', 'SOFP.CASH'], ['52', 'SOFP.CASH'], ['53', 'SOFP.CASH'],
  ['55', 'SOFP.CASH'], ['57', 'SOFP.CASH'], ['58', 'SOFP.CASH'], ['59', 'SOFP.CASH'],

  // Equity
  ['101', 'SOFP.SHARE_CAPITAL'], ['102', 'SOFP.SHARE_CAPITAL'], ['109', 'SOFP.SHARE_CAPITAL'],
  ['104', 'SOFP.OTHER_RESERVES'],
  ['105', 'SOFP.SHARE_PREMIUM'],
  ['106', 'SOFP.REVAL_SURPLUS'], ['154', 'SOFP.REVAL_SURPLUS'],
  ['11', 'SOFP.OTHER_RESERVES'], ['151', 'SOFP.OTHER_RESERVES'], ['152', 'SOFP.OTHER_RESERVES'],
  ['12', 'SOFP.RETAINED'],
  ['13', 'SOFP.RESULT'],
  ['14', 'SOFP.DEF_GRANT'],

  // Liabilities
  ['16', 'SOFP.LT_BORROW'], ['18', 'SOFP.LT_BORROW'],
  ['19', 'SOFP.PROV_NC'],
  ['40', 'SOFP.TRADE_PAY'], ['419', 'SOFP.TRADE_PAY'], ['422', 'SOFP.TRADE_PAY'],
  ['428', 'SOFP.TRADE_PAY'], ['43', 'SOFP.TRADE_PAY'], ['442', 'SOFP.TRADE_PAY'],
  ['443', 'SOFP.TRADE_PAY'], ['444', 'SOFP.TRADE_PAY'], ['447', 'SOFP.TRADE_PAY'],
  ['449', 'SOFP.TRADE_PAY'], ['48', 'SOFP.TRADE_PAY'], ['4782', 'SOFP.TRADE_PAY'],
  ['441', 'SOFP.TAX_PAY'],
  ['56', 'SOFP.ST_BORROW'],
  ['477', 'SOFP.DEF_INCOME'],

  // Profit or loss
  ['70', 'PL.REVENUE'], ['73', 'PL.REVENUE'],
  ['71', 'PL.GRANT_INCOME'], ['845', 'PL.GRANT_INCOME'], ['865', 'PL.GRANT_INCOME'], ['88', 'PL.GRANT_INCOME'],
  ['72', 'PL.OTHER_INCOME'], ['75', 'PL.OTHER_INCOME'], ['78', 'PL.OTHER_INCOME'],
  ['79', 'PL.OTHER_INCOME'], ['841', 'PL.OTHER_INCOME'], ['848', 'PL.OTHER_INCOME'],
  ['861', 'PL.OTHER_INCOME'], ['862', 'PL.OTHER_INCOME'],
  ['754', 'PL.DISPOSAL_RESULT'], ['654', 'PL.DISPOSAL_RESULT'],
  ['81', 'PL.DISPOSAL_RESULT'], ['82', 'PL.DISPOSAL_RESULT'],

  ['601', 'PL.CONSUMABLES'], ['602', 'PL.CONSUMABLES'], ['603', 'PL.CONSUMABLES'],
  ['604', 'PL.CONSUMABLES'], ['608', 'PL.CONSUMABLES'],
  ['66', 'PL.STAFF'], ['637', 'PL.STAFF'], ['633', 'PL.STAFF'],
  ['681', 'PL.DEPRECIATION'], ['852', 'PL.DEPRECIATION'],
  ['624', 'PL.MAINTENANCE'], ['621', 'PL.MAINTENANCE'], ['6044', 'PL.MAINTENANCE'],
  ['6051', 'PL.UTILITIES'], ['6052', 'PL.UTILITIES'], ['6053', 'PL.UTILITIES'],
  ['605', 'PL.OTHER_OPEX'], ['61', 'PL.OTHER_OPEX'], ['622', 'PL.OTHER_OPEX'],
  ['623', 'PL.OTHER_OPEX'], ['625', 'PL.OTHER_OPEX'], ['626', 'PL.OTHER_OPEX'],
  ['627', 'PL.OTHER_OPEX'], ['628', 'PL.OTHER_OPEX'], ['63', 'PL.OTHER_OPEX'],
  ['64', 'PL.OTHER_OPEX'], ['65', 'PL.OTHER_OPEX'], ['691', 'PL.OTHER_OPEX'],
  ['83', 'PL.OTHER_OPEX'], ['85', 'PL.OTHER_OPEX'], ['87', 'PL.OTHER_OPEX'],
  ['694', 'PL.IMPAIRMENT'], ['6941', 'PL.IMPAIRMENT'], ['853', 'PL.IMPAIRMENT'],

  ['77', 'PL.FINANCE_INCOME'], ['771', 'PL.FINANCE_INCOME'],
  ['67', 'PL.FINANCE_COST'], ['671', 'PL.FINANCE_COST'], ['687', 'PL.FINANCE_COST'], ['697', 'PL.FINANCE_COST'],
  ['676', 'PL.FX_RESULT'], ['776', 'PL.FX_RESULT'],
  ['89', 'PL.TAX'],

  // Off-balance and analytical classes carry no IFRS presentation line.
];
