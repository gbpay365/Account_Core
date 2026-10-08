/**
 * FR-STD-002 :: AUDCIF-prescribed statement layouts.
 *
 * Formula mini-language, evaluated by services/reporting.service.js:
 *   segments are separated by ';', each segment is FUNC:term,term,...
 *   FUNC  BAL   closing balance as at the report date   (debit - credit)
 *         OPEN  balance at the day before the from-date
 *         MVT   movement inside the reporting window    (debit - credit)
 *         DR    debit movements only inside the window
 *         CR    credit movements only inside the window
 *         REF   signed sum of other line codes in the same statement
 *   term  [+|-] followed by an account-code prefix, or a line code for REF
 *
 * So `BAL:+41,-491` is "closing trade receivables net of impairment", and
 * `DR:-22,-23,-24` is "cash paid to acquire tangible assets" (a cash outflow,
 * hence the negative sign).
 */

const L = (statement, side, rows) =>
  rows.map(([line_code, fr, en, line_type, opts = {}], i) => ({
    statement_code: statement,
    line_code,
    label: fr,
    label_en: en,
    line_type,
    side,
    sort_order: (i + 1) * 10,
    is_bold: line_type === 'total' || line_type === 'subtotal' ? 1 : 0,
    ...opts,
  }));

// ---------------------------------------------------------------------------
// BILAN - Statement of Financial Position (Systeme Normal)
// Gross / depreciation / net three-column presentation.
// ---------------------------------------------------------------------------
const BILAN_ACTIF = L('BILAN', 'assets', [
  ['AD', 'IMMOBILISATIONS INCORPORELLES', 'INTANGIBLE ASSETS', 'subtotal', { formula: 'REF:+AE,+AF,+AG,+AH', note_ref: '3A' }],
  ['AE', 'Frais de developpement et de prospection', 'Development and prospecting costs', 'detail', { gross_formula: 'BAL:+211', depr_formula: 'BAL:-2811' }],
  ['AF', 'Brevets, licences, logiciels et droits similaires', 'Patents, licences, software and similar rights', 'detail', { gross_formula: 'BAL:+212,+213', depr_formula: 'BAL:-2812' }],
  ['AG', 'Fonds commercial et droit au bail', 'Goodwill and leasehold rights', 'detail', { gross_formula: 'BAL:+214,+216', depr_formula: 'BAL:-2816' }],
  ['AH', 'Autres immobilisations incorporelles', 'Other intangible assets', 'detail', { gross_formula: 'BAL:+218,+219', depr_formula: 'BAL:-2818,-291' }],
  ['AI', 'IMMOBILISATIONS CORPORELLES', 'PROPERTY, PLANT AND EQUIPMENT', 'subtotal', { formula: 'REF:+AJ,+AK,+AL,+AM,+AN', note_ref: '3B' }],
  ['AJ', 'Terrains', 'Land', 'detail', { gross_formula: 'BAL:+22', depr_formula: 'BAL:-292' }],
  ['AK', 'Batiments', 'Buildings', 'detail', { gross_formula: 'BAL:+231,+232,+233', depr_formula: 'BAL:-2831,-293' }],
  ['AL', 'Amenagements, agencements et installations', 'Fittings, fixtures and installations', 'detail', { gross_formula: 'BAL:+234,+235,+238,+239', depr_formula: 'BAL:-2834,-2835' }],
  ['AM', 'Materiel, mobilier et actifs biologiques', 'Equipment, furniture and biological assets', 'detail', { gross_formula: 'BAL:+241,+243,+244,+248,+249', depr_formula: 'BAL:-2841,-2842,-2844,-294' }],
  ['AN', 'Materiel de transport', 'Transport equipment', 'detail', { gross_formula: 'BAL:+245', depr_formula: 'BAL:-2845' }],
  ['AP', 'Avances et acomptes verses sur immobilisations', 'Advances paid on fixed assets', 'detail', { gross_formula: 'BAL:+25' }],
  ['AQ', 'IMMOBILISATIONS FINANCIERES', 'FINANCIAL ASSETS', 'subtotal', { formula: 'REF:+AR,+AS' }],
  ['AR', 'Titres de participation', 'Equity investments', 'detail', { gross_formula: 'BAL:+26', depr_formula: 'BAL:-296' }],
  ['AS', 'Autres immobilisations financieres', 'Other financial assets', 'detail', { gross_formula: 'BAL:+27', depr_formula: 'BAL:-297' }],
  ['AZ', 'TOTAL ACTIF IMMOBILISE', 'TOTAL NON-CURRENT ASSETS', 'total', { formula: 'REF:+AD,+AI,+AP,+AQ' }],
  ['BA', 'Actif circulant H.A.O.', 'Non-operating current assets', 'detail', { gross_formula: 'BAL:+485,+4881' }],
  ['BB', 'Stocks et encours', 'Inventories and work in progress', 'detail', { gross_formula: 'BAL:+31,+32,+33,+34,+35,+36,+37,+38', depr_formula: 'BAL:-39' }],
  ['BG', 'CREANCES ET EMPLOIS ASSIMILES', 'RECEIVABLES AND SIMILAR', 'subtotal', { formula: 'REF:+BH,+BI,+BJ' }],
  ['BH', 'Fournisseurs, avances versees', 'Advances paid to suppliers', 'detail', { gross_formula: 'BAL:+409' }],
  ['BI', 'Clients', 'Trade receivables', 'detail', { gross_formula: 'BAL:+411,+412,+416,+418', depr_formula: 'BAL:-491', note_ref: '7' }],
  ['BJ', 'Autres creances', 'Other receivables', 'detail', { gross_formula: 'BAL:+421,+445,+4449,+45,+46,+471,+476', depr_formula: 'BAL:-498' }],
  ['BK', 'TOTAL ACTIF CIRCULANT', 'TOTAL CURRENT ASSETS', 'total', { formula: 'REF:+BA,+BB,+BG' }],
  ['BQ', 'Titres de placement', 'Short-term investments', 'detail', { gross_formula: 'BAL:+50' }],
  ['BR', 'Valeurs a encaisser', 'Items for collection', 'detail', { gross_formula: 'BAL:+51' }],
  ['BS', 'Banques, cheques postaux, caisse et assimiles', 'Banks, postal cheques, cash and equivalents', 'detail', { gross_formula: 'BAL:+52,+53,+55,+57,+58' }],
  ['BT', 'TOTAL TRESORERIE-ACTIF', 'TOTAL CASH AND EQUIVALENTS', 'total', { formula: 'REF:+BQ,+BR,+BS' }],
  ['BU', 'Ecart de conversion-Actif', 'Translation difference - asset', 'detail', { gross_formula: 'BAL:+4781' }],
  ['BZ', 'TOTAL GENERAL', 'TOTAL ASSETS', 'total', { formula: 'REF:+AZ,+BK,+BT,+BU' }],
]);

const BILAN_PASSIF = L('BILAN', 'liabilities', [
  ['CA', 'Capital', 'Capital', 'detail', { formula: 'BAL:-101,-102' }],
  ['CB', 'Apporteurs capital non appele (-)', 'Unpaid called-up capital (-)', 'detail', { formula: 'BAL:-109' }],
  ['CD', 'Primes liees au capital social', 'Share premium', 'detail', { formula: 'BAL:-104' }],
  ['CE', 'Ecarts de reevaluation', 'Revaluation differences', 'detail', { formula: 'BAL:-105', note_ref: '3C' }],
  ['CF', 'Reserves indisponibles', 'Restricted reserves', 'detail', { formula: 'BAL:-111,-113' }],
  ['CG', 'Reserves libres', 'Free reserves', 'detail', { formula: 'BAL:-112,-118' }],
  ['CH', 'Report a nouveau (+ ou -)', 'Retained earnings (+ or -)', 'detail', { formula: 'BAL:-12' }],
  // Before the year-end appropriation entry, the result still sits in the
  // management classes; after it, account 13 carries it and 6/7/8 are nil.
  // Taking 13 as a balance but 6/7/8 as movement over the reporting period
  // keeps the Bilan balanced at any date without picking up prior years.
  ['CJ', "Resultat net de l'exercice (benefice + ou perte -)", 'Net result for the year', 'detail', { formula: 'BAL:-13;MVT:-6,-7,-8' }],
  ['CL', "Subventions d'investissement", 'Capital grants', 'detail', { formula: 'BAL:-14', note_ref: '15' }],
  ['CM', 'Provisions reglementees', 'Regulated provisions', 'detail', { formula: 'BAL:-15' }],
  ['CP', 'TOTAL CAPITAUX PROPRES ET RESSOURCES ASSIMILEES', 'TOTAL EQUITY AND SIMILAR RESOURCES', 'total', { formula: 'REF:+CA,+CB,+CD,+CE,+CF,+CG,+CH,+CJ,+CL,+CM' }],
  ['DA', 'Emprunts et dettes financieres diverses', 'Borrowings and other financial debt', 'detail', { formula: 'BAL:-16,-18', note_ref: '16' }],
  ['DB', 'Dettes de location acquisition', 'Finance lease liabilities', 'detail', { formula: 'BAL:-17' }],
  ['DC', 'Provisions pour risques et charges', 'Provisions for risks and charges', 'detail', { formula: 'BAL:-19' }],
  ['DD', 'TOTAL DETTES FINANCIERES ET RESSOURCES ASSIMILEES', 'TOTAL FINANCIAL DEBT AND SIMILAR', 'total', { formula: 'REF:+DA,+DB,+DC' }],
  ['DF', 'TOTAL RESSOURCES STABLES', 'TOTAL STABLE RESOURCES', 'total', { formula: 'REF:+CP,+DD' }],
  ['DH', 'Dettes circulantes H.A.O.', 'Non-operating current liabilities', 'detail', { formula: 'BAL:-481,-482,-4882' }],
  ['DI', 'Clients, avances recues', 'Advances received from customers', 'detail', { formula: 'BAL:-419' }],
  ['DJ', "Fournisseurs d'exploitation", 'Trade payables', 'detail', { formula: 'BAL:-401,-402,-408' }],
  ['DK', 'Dettes fiscales et sociales', 'Tax and social security liabilities', 'detail', { formula: 'BAL:-422,-428,-431,-432,-438,-441,-442,-4431,-4434,-4441,-447,-449' }],
  ['DM', 'Autres dettes', 'Other liabilities', 'detail', { formula: 'BAL:-462,-477' }],
  ['DN', 'Provisions pour risques a court terme', 'Short-term provisions', 'detail', { formula: 'BAL:-499' }],
  ['DP', 'TOTAL PASSIF CIRCULANT', 'TOTAL CURRENT LIABILITIES', 'total', { formula: 'REF:+DH,+DI,+DJ,+DK,+DM,+DN' }],
  ['DQ', "Banques, credits d'escompte", 'Bank discount facilities', 'detail', { formula: 'BAL:-565' }],
  ['DR', 'Banques, credits de tresorerie', 'Bank overdrafts and cash facilities', 'detail', { formula: 'BAL:-561' }],
  ['DT', 'TOTAL TRESORERIE-PASSIF', 'TOTAL CASH LIABILITIES', 'total', { formula: 'REF:+DQ,+DR' }],
  ['DV', 'Ecart de conversion-Passif', 'Translation difference - liability', 'detail', { formula: 'BAL:-4782' }],
  ['DZ', 'TOTAL GENERAL', 'TOTAL EQUITY AND LIABILITIES', 'total', { formula: 'REF:+DF,+DP,+DT,+DV' }],
]);

// ---------------------------------------------------------------------------
// COMPTE DE RESULTAT - by nature, with the AUDCIF intermediate balances
// ---------------------------------------------------------------------------
const COMPTE_DE_RESULTAT = L('CR', 'none', [
  ['TA', 'Ventes de marchandises', 'Sales of goods for resale', 'detail', { formula: 'MVT:-701' }],
  ['RA', 'Achats de marchandises', 'Purchases of goods for resale', 'detail', { formula: 'MVT:+601', sign: -1 }],
  ['RB', 'Variation de stocks de marchandises', 'Movement in goods inventory', 'detail', { formula: 'MVT:+6031', sign: -1 }],
  ['XA', 'MARGE COMMERCIALE', 'GROSS TRADING MARGIN', 'subtotal', { formula: 'REF:+TA,-RA,-RB' }],
  ['TB', 'Ventes de produits fabriques', 'Sales of manufactured products', 'detail', { formula: 'MVT:-702' }],
  ['TC', 'Travaux, services vendus', 'Work and services rendered', 'detail', { formula: 'MVT:-705,-706', note_ref: '21' }],
  ['TD', 'Produits accessoires', 'Ancillary income', 'detail', { formula: 'MVT:-707' }],
  ['XB', "CHIFFRE D'AFFAIRES", 'REVENUE', 'subtotal', { formula: 'REF:+TA,+TB,+TC,+TD' }],
  ['TE', 'Production stockee (ou destockage)', 'Change in inventory of produced goods', 'detail', { formula: 'MVT:-73' }],
  ['TF', 'Production immobilisee', 'Own work capitalised', 'detail', { formula: 'MVT:-72' }],
  ['TG', "Subventions d'exploitation", 'Operating grants', 'detail', { formula: 'MVT:-71' }],
  ['TH', 'Autres produits', 'Other operating income', 'detail', { formula: 'MVT:-75' }],
  ['TI', "Transferts de charges d'exploitation", 'Operating charge transfers', 'detail', { formula: 'MVT:-781' }],
  ['RC', 'Achats de matieres premieres et fournitures liees', 'Purchases of raw materials', 'detail', { formula: 'MVT:+602', sign: -1 }],
  ['RD', 'Variation de stocks de matieres premieres', 'Movement in raw material inventory', 'detail', { formula: 'MVT:+6032', sign: -1 }],
  ['RE', 'Autres achats', 'Other purchases', 'detail', { formula: 'MVT:+604,+605,+608', sign: -1 }],
  ['RF', 'Variation de stocks d autres approvisionnements', 'Movement in other supplies inventory', 'detail', { formula: 'MVT:+6033', sign: -1 }],
  ['RG', 'Transports', 'Transport', 'detail', { formula: 'MVT:+61', sign: -1 }],
  ['RH', 'Services exterieurs', 'External services', 'detail', { formula: 'MVT:+62,+63', sign: -1, note_ref: '22' }],
  ['RI', 'Impots et taxes', 'Taxes and duties', 'detail', { formula: 'MVT:+64', sign: -1 }],
  ['RJ', 'Autres charges', 'Other operating charges', 'detail', { formula: 'MVT:+65', sign: -1 }],
  ['XC', 'VALEUR AJOUTEE', 'VALUE ADDED', 'subtotal', { formula: 'REF:+XA,+TB,+TC,+TD,+TE,+TF,+TG,+TH,+TI,-RC,-RD,-RE,-RF,-RG,-RH,-RI,-RJ' }],
  ['RK', 'Charges de personnel', 'Staff costs', 'detail', { formula: 'MVT:+66', sign: -1, note_ref: '23' }],
  ['XD', "EXCEDENT BRUT D'EXPLOITATION", 'GROSS OPERATING SURPLUS', 'subtotal', { formula: 'REF:+XC,-RK' }],
  ['TJ', 'Reprises d amortissements, provisions et depreciations', 'Reversal of depreciation, provisions and impairment', 'detail', { formula: 'MVT:-759,-791,-794,-798' }],
  ['RL', 'Dotations aux amortissements, aux provisions et depreciations', 'Depreciation, provisions and impairment charges', 'detail', { formula: 'MVT:+659,+681,+691,+694', sign: -1, note_ref: '3D' }],
  ['XE', "RESULTAT D'EXPLOITATION", 'OPERATING RESULT', 'subtotal', { formula: 'REF:+XD,+TJ,-RL' }],
  ['TK', 'Revenus financiers et assimiles', 'Finance income', 'detail', { formula: 'MVT:-77' }],
  ['TL', 'Reprises de provisions et depreciations financieres', 'Reversal of financial provisions', 'detail', { formula: 'MVT:-799' }],
  ['RM', 'Frais financiers et charges assimilees', 'Finance costs', 'detail', { formula: 'MVT:+67', sign: -1 }],
  ['RN', 'Dotations aux provisions et depreciations financieres', 'Financial provisions and impairment charges', 'detail', { formula: 'MVT:+687,+697', sign: -1 }],
  ['XF', 'RESULTAT FINANCIER', 'FINANCE RESULT', 'subtotal', { formula: 'REF:+TK,+TL,-RM,-RN' }],
  ['XG', 'RESULTAT DES ACTIVITES ORDINAIRES', 'RESULT FROM ORDINARY ACTIVITIES', 'subtotal', { formula: 'REF:+XE,+XF' }],
  ['TN', "Produits des cessions d'immobilisations", 'Proceeds from asset disposals', 'detail', { formula: 'MVT:-82', note_ref: '3E' }],
  ['TO', 'Autres produits H.A.O.', 'Other non-operating income', 'detail', { formula: 'MVT:-84,-86,-88' }],
  ['RO', "Valeurs comptables des cessions d'immobilisations", 'Carrying amount of assets disposed of', 'detail', { formula: 'MVT:+81', sign: -1, note_ref: '3E' }],
  ['RP', 'Autres charges H.A.O.', 'Other non-operating charges', 'detail', { formula: 'MVT:+83,+85', sign: -1 }],
  ['XH', 'RESULTAT HORS ACTIVITES ORDINAIRES', 'NON-OPERATING RESULT', 'subtotal', { formula: 'REF:+TN,+TO,-RO,-RP' }],
  ['RQ', 'Participation des travailleurs', 'Employee profit sharing', 'detail', { formula: 'MVT:+87', sign: -1 }],
  ['RS', 'Impots sur le resultat', 'Income tax', 'detail', { formula: 'MVT:+89', sign: -1 }],
  ['XI', 'RESULTAT NET', 'NET RESULT', 'total', { formula: 'REF:+XG,+XH,-RQ,-RS' }],
]);

// ---------------------------------------------------------------------------
// TAFIRE - Tableau Financier des Ressources et des Emplois
// ---------------------------------------------------------------------------
const TAFIRE = L('TAFIRE', 'none', [
  ['ZA', 'Tresorerie nette au debut de la periode', 'Net cash at the start of the period', 'subtotal', { formula: 'OPEN:+50,+51,+52,+53,+55,+57,+58,-561,-565' }],
  // CAFG is built from accounts rather than by referencing the Compte de
  // resultat, because REF only resolves line codes within the same statement.
  // Segments: the net result, plus non-cash charges added back, less non-cash
  // income, less the result on disposals (which belongs to investing).
  ['FA', 'Capacite d Autofinancement Globale (CAFG)', 'Global self-financing capacity', 'subtotal', {
    formula: 'MVT:-6,-7,-8'
      + ';MVT:+681,+687,+691,+697,+851,+852,+853,+854'
      + ';MVT:+791,+798,+799,+861,+862,+865'
      + ';MVT:+811,+812,+816,+821,+822,+826',
  }],
  ['FB', 'Variation de l actif circulant H.A.O.', 'Change in non-operating current assets', 'detail', { formula: 'MVT:-485,-4881' }],
  ['FC', 'Variation des stocks', 'Change in inventories', 'detail', { formula: 'MVT:-31,-32,-33,-34,-35,-36,-37,-38,+39' }],
  ['FD', 'Variation des creances', 'Change in receivables', 'detail', { formula: 'MVT:-409,-411,-412,-416,-418,+491,-421,-445,-4449,-45,-46,-471,-476,+498' }],
  ['FE', 'Variation du passif circulant', 'Change in current liabilities', 'detail', { formula: 'MVT:-401,-402,-408,-419,-422,-428,-431,-432,-438,-441,-442,-4431,-4434,-4441,-447,-449,-462,-477,-481,-482,-4882,-499' }],
  ['ZB', 'FLUX DE TRESORERIE PROVENANT DES ACTIVITES OPERATIONNELLES', 'NET CASH FROM OPERATING ACTIVITIES', 'total', { formula: 'REF:+FA,+FB,+FC,+FD,+FE' }],
  ['FF', 'Decaissements lies aux acquisitions d immobilisations incorporelles', 'Purchases of intangible assets', 'detail', { formula: 'DR:-21' }],
  ['FG', 'Decaissements lies aux acquisitions d immobilisations corporelles', 'Purchases of property, plant and equipment', 'detail', { formula: 'DR:-22,-23,-24,-25', note_ref: '3B' }],
  ['FH', 'Decaissements lies aux acquisitions d immobilisations financieres', 'Purchases of financial assets', 'detail', { formula: 'DR:-26,-27' }],
  ['FI', 'Encaissements lies aux cessions d immobilisations incorporelles et corporelles', 'Proceeds from disposal of intangible and tangible assets', 'detail', { formula: 'CR:+821,+822' }],
  ['FJ', 'Encaissements lies aux cessions d immobilisations financieres', 'Proceeds from disposal of financial assets', 'detail', { formula: 'CR:+826' }],
  ['ZC', "FLUX DE TRESORERIE PROVENANT DES ACTIVITES D'INVESTISSEMENT", 'NET CASH USED IN INVESTING ACTIVITIES', 'total', { formula: 'REF:+FF,+FG,+FH,+FI,+FJ' }],
  ['FK', 'Augmentations de capital par apports nouveaux', 'Capital increases', 'detail', { formula: 'CR:+101,+102,+104' }],
  ['FL', "Subventions d'investissement recues", 'Capital grants received', 'detail', { formula: 'CR:+141,+142,+143,+148' }],
  ['FM', 'Prelevements sur le capital', 'Capital withdrawals', 'detail', { formula: 'DR:-101,-102' }],
  ['FN', 'Dividendes verses', 'Dividends paid', 'detail', { formula: 'DR:-462' }],
  ['ZD', 'FLUX DE TRESORERIE DES CAPITAUX PROPRES', 'NET CASH FROM EQUITY', 'subtotal', { formula: 'REF:+FK,+FL,+FM,+FN' }],
  ['FO', 'Emprunts', 'New borrowings', 'detail', { formula: 'CR:+161,+162,+164,+168,+172,+173' }],
  ['FP', 'Autres dettes financieres', 'Other financial debt raised', 'detail', { formula: 'CR:+165,+18' }],
  ['FQ', 'Remboursements des emprunts et autres dettes financieres', 'Repayment of borrowings and other financial debt', 'detail', { formula: 'DR:-16,-17,-18' }],
  ['ZE', 'FLUX DE TRESORERIE PROVENANT DES CAPITAUX ETRANGERS', 'NET CASH FROM EXTERNAL FUNDING', 'subtotal', { formula: 'REF:+FO,+FP,+FQ' }],
  ['ZF', 'FLUX DE TRESORERIE PROVENANT DES ACTIVITES DE FINANCEMENT', 'NET CASH FROM FINANCING ACTIVITIES', 'total', { formula: 'REF:+ZD,+ZE' }],
  ['ZG', 'VARIATION DE LA TRESORERIE NETTE DE LA PERIODE', 'NET CHANGE IN CASH FOR THE PERIOD', 'total', { formula: 'REF:+ZB,+ZC,+ZF' }],
  ['ZH', 'Tresorerie nette a la fin de la periode', 'Net cash at the end of the period', 'total', { formula: 'REF:+ZA,+ZG' }],
]);

export const OHADA_REPORT_LINES = [...BILAN_ACTIF, ...BILAN_PASSIF, ...COMPTE_DE_RESULTAT, ...TAFIRE];
