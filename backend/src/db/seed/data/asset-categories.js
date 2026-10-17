/**
 * FR-AM-003 :: asset classification taxonomy covering the four categories in
 * SRS 5.1, with the accounting and compliance defaults that drive automatic
 * postings (FR-AM-030) and schedule generation (FR-AM-020 / FR-AM-022).
 *
 * Every interval is configurable per category rather than hard-coded, which is
 * the mitigation recorded in SRS section 11 for varying manufacturer intervals.
 * OHADA and IFRS useful lives are held separately so the two bases can diverge.
 */

const accounts = (asset, accum, expense) => ({
  asset_account: asset,
  accum_depr_account: accum,
  depr_expense_account: expense,
  disposal_gain_account: '822',
  disposal_loss_account: '812',
  revaluation_surplus_account: '106',
  impairment_account: '6941',
});

const BIO = accounts('2412', '2842', '68132');
const bio = (asset) => ({ ...BIO, asset_account: asset, maintenance_account: '6243' });
const fac = (asset) => ({ ...accounts(asset, '2834', '68131'), maintenance_account: '6244' });
const bld = (asset) => ({ ...accounts(asset, '2831', '68131'), maintenance_account: '6241' });
const flt = (asset) => ({ ...accounts(asset, '2845', '68134'), maintenance_account: '6245' });
const it = (asset) => ({ ...accounts(asset, '2844', '68133'), maintenance_account: '6246' });

export const ASSET_CATEGORIES = [
  // --- Biomedical / medical equipment --------------------------------------
  {
    code: 'BIO-IMG', name: 'Imagerie et radiologie', name_en: 'Imaging and radiology',
    domain: 'biomedical', taxonomy_system: 'umdns', taxonomy_code: '16-000',
    ...bio('2412'),
    ohada_useful_life_months: 120, ifrs_useful_life_months: 144, ifrs_residual_pct: 5,
    requires_calibration: 1, calibration_interval_months: 12,
    requires_safety_test: 1, safety_test_standard: 'IEC 60601-1', safety_interval_months: 12,
    pm_interval_months: 6, allow_component_depr: 1, default_criticality: 'critical',
    capitalization_threshold: 500000,
    children: [
      { code: 'BIO-IMG-MRI', name: 'IRM et resonance magnetique', name_en: 'MRI systems', taxonomy_code: '16-759' },
      { code: 'BIO-IMG-CT', name: 'Scanners tomodensitometres', name_en: 'CT scanners', taxonomy_code: '16-897' },
      { code: 'BIO-IMG-XRAY', name: 'Radiologie conventionnelle et mobile', name_en: 'Conventional and mobile X-ray', taxonomy_code: '16-526' },
      { code: 'BIO-IMG-US', name: 'Echographes', name_en: 'Ultrasound scanners', taxonomy_code: '14-278' },
      { code: 'BIO-IMG-MAMMO', name: 'Mammographes', name_en: 'Mammography systems', taxonomy_code: '16-635' },
    ],
  },
  {
    code: 'BIO-ICU', name: 'Reanimation et soins intensifs', name_en: 'ICU and critical care',
    domain: 'biomedical', taxonomy_system: 'umdns', taxonomy_code: '17-000',
    ...bio('2413'),
    ohada_useful_life_months: 84, ifrs_useful_life_months: 96, ifrs_residual_pct: 5,
    requires_calibration: 1, calibration_interval_months: 6,
    requires_safety_test: 1, safety_test_standard: 'IEC 60601-1', safety_interval_months: 6,
    pm_interval_months: 3, default_criticality: 'critical',
    capitalization_threshold: 300000,
    children: [
      { code: 'BIO-ICU-VENT', name: 'Ventilateurs et respirateurs', name_en: 'Ventilators', taxonomy_code: '17-429' },
      { code: 'BIO-ICU-MON', name: 'Moniteurs multiparametriques', name_en: 'Multiparameter patient monitors', taxonomy_code: '12-636' },
      { code: 'BIO-ICU-PUMP', name: 'Pompes a perfusion et seringues electriques', name_en: 'Infusion and syringe pumps', taxonomy_code: '13-215' },
      { code: 'BIO-ICU-DEFIB', name: 'Defibrillateurs', name_en: 'Defibrillators', taxonomy_code: '11-129' },
      { code: 'BIO-ICU-INCUB', name: 'Incubateurs et couveuses neonatales', name_en: 'Neonatal incubators', taxonomy_code: '12-113' },
    ],
  },
  {
    code: 'BIO-LAB', name: 'Laboratoire et analyses', name_en: 'Laboratory and diagnostics',
    domain: 'biomedical', taxonomy_system: 'umdns', taxonomy_code: '15-000',
    ...bio('2414'),
    ohada_useful_life_months: 84, ifrs_useful_life_months: 96, ifrs_residual_pct: 5,
    requires_calibration: 1, calibration_interval_months: 6,
    requires_safety_test: 1, safety_test_standard: 'IEC 61010-1', safety_interval_months: 12,
    pm_interval_months: 6, default_criticality: 'high',
    capitalization_threshold: 200000,
    children: [
      { code: 'BIO-LAB-CHEM', name: 'Automates de biochimie', name_en: 'Chemistry analysers', taxonomy_code: '15-105' },
      { code: 'BIO-LAB-HEMA', name: 'Automates d hematologie', name_en: 'Haematology analysers', taxonomy_code: '15-362' },
      { code: 'BIO-LAB-MICRO', name: 'Microscopes et microbiologie', name_en: 'Microscopes and microbiology', taxonomy_code: '12-535' },
      { code: 'BIO-LAB-CENTRI', name: 'Centrifugeuses', name_en: 'Centrifuges', taxonomy_code: '10-756' },
      { code: 'BIO-LAB-COLD', name: 'Refrigerateurs et congelateurs de laboratoire', name_en: 'Laboratory refrigerators and freezers', taxonomy_code: '15-598' },
    ],
  },
  {
    code: 'BIO-OT', name: 'Bloc operatoire et anesthesie', name_en: 'Operating theatre and anaesthesia',
    domain: 'biomedical', taxonomy_system: 'umdns', taxonomy_code: '11-000',
    ...bio('2415'),
    ohada_useful_life_months: 96, ifrs_useful_life_months: 120, ifrs_residual_pct: 5,
    requires_calibration: 1, calibration_interval_months: 6,
    requires_safety_test: 1, safety_test_standard: 'IEC 60601-1', safety_interval_months: 6,
    pm_interval_months: 3, default_criticality: 'critical',
    capitalization_threshold: 300000,
    children: [
      { code: 'BIO-OT-ANES', name: 'Respirateurs d anesthesie', name_en: 'Anaesthesia machines', taxonomy_code: '10-134' },
      { code: 'BIO-OT-ESU', name: 'Bistouris electriques', name_en: 'Electrosurgical units', taxonomy_code: '11-490' },
      { code: 'BIO-OT-TABLE', name: 'Tables operatoires', name_en: 'Operating tables', taxonomy_code: '13-956' },
      { code: 'BIO-OT-LIGHT', name: 'Eclairages operatoires', name_en: 'Surgical lights', taxonomy_code: '12-282' },
      { code: 'BIO-OT-STERIL', name: 'Autoclaves et sterilisateurs', name_en: 'Autoclaves and sterilisers', taxonomy_code: '15-660' },
    ],
  },
  {
    code: 'BIO-DIAG', name: 'Monitorage et diagnostic', name_en: 'Monitoring and diagnostics',
    domain: 'biomedical', taxonomy_system: 'umdns', taxonomy_code: '12-000',
    ...bio('2416'),
    ohada_useful_life_months: 60, ifrs_useful_life_months: 72, ifrs_residual_pct: 0,
    requires_calibration: 1, calibration_interval_months: 12,
    requires_safety_test: 1, safety_test_standard: 'IEC 60601-1', safety_interval_months: 12,
    pm_interval_months: 6, default_criticality: 'high',
    capitalization_threshold: 100000,
    children: [
      { code: 'BIO-DIAG-ECG', name: 'Electrocardiographes', name_en: 'Electrocardiographs', taxonomy_code: '11-407' },
      { code: 'BIO-DIAG-VITALS', name: 'Moniteurs de signes vitaux', name_en: 'Vital signs monitors', taxonomy_code: '12-647' },
      { code: 'BIO-DIAG-SPO2', name: 'Oxymetres de pouls', name_en: 'Pulse oximeters', taxonomy_code: '17-148' },
      { code: 'BIO-DIAG-BP', name: 'Tensiometres', name_en: 'Blood pressure monitors', taxonomy_code: '11-072' },
    ],
  },
  {
    code: 'BIO-DIAL', name: 'Dialyse et perfusion', name_en: 'Dialysis and infusion',
    domain: 'biomedical', taxonomy_system: 'umdns', taxonomy_code: '11-218',
    ...bio('2417'),
    ohada_useful_life_months: 84, ifrs_useful_life_months: 96, ifrs_residual_pct: 5,
    requires_calibration: 1, calibration_interval_months: 6,
    requires_safety_test: 1, safety_test_standard: 'IEC 60601-2-16', safety_interval_months: 6,
    pm_interval_months: 3, default_criticality: 'critical',
    capitalization_threshold: 300000,
  },
  {
    code: 'BIO-OTH', name: 'Autres materiels biomedicaux', name_en: 'Other biomedical equipment',
    domain: 'biomedical', ...bio('2418'),
    ohada_useful_life_months: 60, ifrs_useful_life_months: 72,
    requires_calibration: 0, requires_safety_test: 1, safety_interval_months: 12,
    pm_interval_months: 12, default_criticality: 'medium',
  },

  // --- Facilities & infrastructure ------------------------------------------
  {
    code: 'FAC-BLD', name: 'Batiments hospitaliers', name_en: 'Hospital buildings',
    domain: 'facility', ...bld('2311'),
    ohada_useful_life_months: 240, ifrs_useful_life_months: 480, ifrs_residual_pct: 10,
    ifrs_measurement_model: 'revaluation', allow_component_depr: 1,
    pm_interval_months: 12, default_criticality: 'critical', capitalization_threshold: 1000000,
  },
  {
    code: 'FAC-HVAC', name: 'Climatisation et ventilation (CVC)', name_en: 'HVAC systems',
    domain: 'facility', ...fac('2341'),
    ohada_useful_life_months: 120, ifrs_useful_life_months: 180,
    pm_interval_months: 3, default_criticality: 'high', capitalization_threshold: 500000,
  },
  {
    code: 'FAC-GAS', name: 'Oxygene et gaz medicaux', name_en: 'Oxygen and medical gas',
    domain: 'facility', ...fac('2342'),
    ohada_useful_life_months: 180, ifrs_useful_life_months: 240,
    requires_safety_test: 1, safety_test_standard: 'ISO 7396-1', safety_interval_months: 6,
    pm_interval_months: 3, default_criticality: 'critical', capitalization_threshold: 500000,
  },
  {
    code: 'FAC-GEN', name: 'Groupes electrogenes et alimentation de secours', name_en: 'Generators and backup power',
    domain: 'facility', ...fac('2343'),
    ohada_useful_life_months: 120, ifrs_useful_life_months: 180,
    pm_interval_months: 1, pm_interval_hours: 250, default_criticality: 'critical',
    capitalization_threshold: 500000,
  },
  {
    code: 'FAC-LIFT', name: 'Ascenseurs et monte-charges', name_en: 'Lifts and hoists',
    domain: 'facility', ...fac('2344'),
    ohada_useful_life_months: 180, ifrs_useful_life_months: 240,
    requires_safety_test: 1, safety_test_standard: 'EN 81-20', safety_interval_months: 6,
    pm_interval_months: 3, default_criticality: 'high', capitalization_threshold: 1000000,
  },
  {
    code: 'FAC-FIRE', name: 'Securite incendie', name_en: 'Fire safety systems',
    domain: 'facility', ...fac('2345'),
    ohada_useful_life_months: 120, ifrs_useful_life_months: 150,
    requires_safety_test: 1, safety_test_standard: 'NFPA 25', safety_interval_months: 12,
    pm_interval_months: 6, default_criticality: 'critical', capitalization_threshold: 200000,
  },
  {
    code: 'FAC-WATER', name: 'Traitement et distribution d eau', name_en: 'Water treatment and distribution',
    domain: 'facility', ...fac('2346'),
    ohada_useful_life_months: 120, ifrs_useful_life_months: 180,
    pm_interval_months: 3, default_criticality: 'high', capitalization_threshold: 300000,
  },
  {
    code: 'FAC-STERIL', name: 'Sterilisation centrale', name_en: 'Central sterilisation',
    domain: 'facility', ...fac('2347'),
    ohada_useful_life_months: 120, ifrs_useful_life_months: 144,
    requires_calibration: 1, calibration_interval_months: 12,
    requires_safety_test: 1, safety_test_standard: 'EN 285', safety_interval_months: 12,
    pm_interval_months: 3, default_criticality: 'critical', capitalization_threshold: 500000,
  },
  {
    code: 'FAC-FIT', name: 'Amenagements et agencements', name_en: 'Fittings and fixtures',
    domain: 'facility', ...accounts('235', '2835', '68131'),
    maintenance_account: '6241',
    ohada_useful_life_months: 120, ifrs_useful_life_months: 120,
    pm_interval_months: 12, default_criticality: 'low', capitalization_threshold: 200000,
  },

  // --- Fleet -----------------------------------------------------------------
  {
    code: 'FLT-AMB', name: 'Ambulances et vehicules medicalises', name_en: 'Ambulances and medicalised vehicles',
    domain: 'fleet', ...flt('2451'),
    // Statutory practice allows the declining-balance method here while the
    // group IFRS policy is straight line over a longer life - the divergence
    // FR-AM-030 requires the engine to carry on both bases.
    ohada_useful_life_months: 60, ohada_method: 'declining_balance', ohada_declining_factor: 2,
    ifrs_useful_life_months: 84, ifrs_method: 'straight_line', ifrs_residual_pct: 10,
    pm_interval_months: 6, pm_interval_km: 10000, default_criticality: 'critical',
    capitalization_threshold: 1000000,
  },
  {
    code: 'FLT-VEH', name: 'Vehicules de service et utilitaires', name_en: 'Service and utility vehicles',
    domain: 'fleet', ...flt('2452'),
    ohada_useful_life_months: 60, ohada_method: 'declining_balance', ohada_declining_factor: 2,
    ifrs_useful_life_months: 72, ifrs_method: 'straight_line', ifrs_residual_pct: 10,
    pm_interval_months: 6, pm_interval_km: 10000, default_criticality: 'medium',
    capitalization_threshold: 500000,
  },
  {
    code: 'FLT-MOTO', name: 'Motos et deux-roues', name_en: 'Motorcycles and two-wheelers',
    domain: 'fleet', ...flt('2458'),
    ohada_useful_life_months: 36, ifrs_useful_life_months: 48, ifrs_residual_pct: 5,
    pm_interval_months: 3, pm_interval_km: 5000, default_criticality: 'low',
    capitalization_threshold: 100000,
  },

  // --- IT & office equipment ------------------------------------------------
  {
    code: 'IT-SRV', name: 'Serveurs et infrastructure', name_en: 'Servers and infrastructure',
    domain: 'it_office', ...it('2442'),
    ohada_useful_life_months: 60, ifrs_useful_life_months: 60,
    pm_interval_months: 6, default_criticality: 'critical', capitalization_threshold: 200000,
  },
  {
    code: 'IT-PC', name: 'Postes de travail et ordinateurs portables', name_en: 'Workstations and laptops',
    domain: 'it_office', ...it('2442'),
    ohada_useful_life_months: 36, ifrs_useful_life_months: 48,
    pm_interval_months: 12, default_criticality: 'low', capitalization_threshold: 50000,
  },
  {
    code: 'IT-NET', name: 'Reseau et telecommunications', name_en: 'Network and telecom equipment',
    domain: 'it_office', ...it('2443'),
    ohada_useful_life_months: 60, ifrs_useful_life_months: 72,
    pm_interval_months: 6, default_criticality: 'high', capitalization_threshold: 100000,
  },
  {
    code: 'IT-PRN', name: 'Imprimantes et peripheriques', name_en: 'Printers and peripherals',
    domain: 'it_office', ...it('2441'),
    ohada_useful_life_months: 36, ifrs_useful_life_months: 36,
    pm_interval_months: 12, default_criticality: 'low', capitalization_threshold: 50000,
  },
  {
    code: 'IT-SW', name: 'Logiciels et licences', name_en: 'Software and licences',
    domain: 'it_office', ...accounts('2131', '2812', '6811'),
    maintenance_account: '6246',
    ohada_useful_life_months: 36, ifrs_useful_life_months: 60,
    default_criticality: 'high', capitalization_threshold: 100000,
  },
  {
    code: 'OFF-FURN', name: 'Mobilier de bureau', name_en: 'Office furniture',
    domain: 'it_office', ...accounts('2444', '2844', '68133'),
    maintenance_account: '6242',
    ohada_useful_life_months: 120, ifrs_useful_life_months: 120,
    default_criticality: 'low', capitalization_threshold: 50000,
  },
  {
    code: 'MED-FURN', name: 'Mobilier et literie hospitaliers', name_en: 'Hospital furniture and beds',
    domain: 'it_office', ...accounts('2445', '2844', '68133'),
    maintenance_account: '6242',
    ohada_useful_life_months: 96, ifrs_useful_life_months: 120,
    pm_interval_months: 12, default_criticality: 'medium', capitalization_threshold: 50000,
  },
];
