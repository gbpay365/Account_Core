/** Demo asset register: 35 assets spanning the four categories in SRS 5.1. */
export const DEMO_ASSETS = [
  // --- Biomedical : imaging -------------------------------------------------
  { name: 'IRM 1.5 Tesla', category: 'BIO-IMG-MRI', manufacturer: 'Siemens Healthineers', model: 'MAGNETOM Sempra', serial: 'MRS-2021-8841', cc: 'IMG', loc: 'IMG-01', acquired: '2023-03-15', cost: 485000000, supplier: 'SUP-001', warrantyMonths: 24, criticality: 'critical', mobile: 0 },
  { name: 'Scanner 64 barrettes', category: 'BIO-IMG-CT', manufacturer: 'GE HealthCare', model: 'Revolution ACT', serial: 'CT-2022-3310', cc: 'IMG', loc: 'IMG-02', acquired: '2022-07-01', cost: 245000000, supplier: 'SUP-002', warrantyMonths: 24, criticality: 'critical', mobile: 0 },
  { name: 'Table de radiologie numerique', category: 'BIO-IMG-XRAY', manufacturer: 'Siemens Healthineers', model: 'Multix Impact', serial: 'XR-2024-1190', cc: 'IMG', loc: 'IMG-03', acquired: '2024-02-10', cost: 68000000, supplier: 'SUP-001', funding: 'grant', fundingRef: 'BM-SANTE-2023-114', donor: 'Banque Mondiale - Projet Sante', warrantyMonths: 12, criticality: 'high', mobile: 0 },
  { name: 'Echographe Doppler couleur', category: 'BIO-IMG-US', manufacturer: 'GE HealthCare', model: 'Voluson S8', serial: 'US-2025-4471', cc: 'MAT', loc: 'MAT-01', acquired: '2025-05-20', cost: 32500000, supplier: 'SUP-002', warrantyMonths: 24, criticality: 'high' },
  { name: 'Mammographe numerique', category: 'BIO-IMG-MAMMO', manufacturer: 'Siemens Healthineers', model: 'Mammomat Revelation', serial: 'MG-2026-0221', cc: 'IMG', loc: 'IMG-03', acquired: '2026-03-02', cost: 88000000, supplier: 'SUP-001', funding: 'grant', fundingRef: 'AFD-CMR-2025-007', donor: 'Agence Francaise de Developpement', warrantyMonths: 24, criticality: 'high', mobile: 0 },

  // --- Biomedical : ICU / critical care -------------------------------------
  { name: 'Ventilateur de reanimation - Box 1', category: 'BIO-ICU-VENT', manufacturer: 'Draeger', model: 'Evita V300', serial: 'VT-2023-7712', cc: 'REA', loc: 'REA-01', acquired: '2023-09-05', cost: 28500000, supplier: 'SUP-003', warrantyMonths: 24, criticality: 'critical' },
  { name: 'Ventilateur de reanimation - Box 2', category: 'BIO-ICU-VENT', manufacturer: 'Draeger', model: 'Evita V300', serial: 'VT-2023-7713', cc: 'REA', loc: 'REA-02', acquired: '2023-09-05', cost: 28500000, supplier: 'SUP-003', warrantyMonths: 24, criticality: 'critical' },
  { name: 'Moniteur multiparametrique - Box 1', category: 'BIO-ICU-MON', manufacturer: 'Philips', model: 'IntelliVue MX450', serial: 'MN-2024-2201', cc: 'REA', loc: 'REA-01', acquired: '2024-06-11', cost: 6800000, supplier: 'SUP-004', warrantyMonths: 12, criticality: 'critical' },
  { name: 'Moniteur multiparametrique - Box 2', category: 'BIO-ICU-MON', manufacturer: 'Philips', model: 'IntelliVue MX450', serial: 'MN-2024-2202', cc: 'REA', loc: 'REA-02', acquired: '2024-06-11', cost: 6800000, supplier: 'SUP-004', warrantyMonths: 12, criticality: 'critical' },
  { name: 'Pompe a perfusion volumetrique', category: 'BIO-ICU-PUMP', manufacturer: 'B. Braun', model: 'Infusomat Space', serial: 'PP-2025-5510', cc: 'REA', loc: 'REA-01', acquired: '2025-01-15', cost: 1950000, supplier: 'SUP-004', warrantyMonths: 24, criticality: 'high' },
  { name: 'Defibrillateur biphasique', category: 'BIO-ICU-DEFIB', manufacturer: 'Zoll', model: 'R Series', serial: 'DF-2022-9004', cc: 'URG', loc: 'URG-01', acquired: '2022-11-20', cost: 9200000, supplier: 'SUP-004', warrantyMonths: 24, criticality: 'critical' },
  { name: 'Couveuse neonatale', category: 'BIO-ICU-INCUB', manufacturer: 'Draeger', model: 'Caleo', serial: 'IN-2024-6650', cc: 'MAT', loc: 'NEO-01', acquired: '2024-08-01', cost: 12400000, supplier: 'SUP-003', funding: 'donation', donor: 'Fondation Sante Afrique', warrantyMonths: 12, criticality: 'critical' },

  // --- Biomedical : laboratory ----------------------------------------------
  { name: 'Automate de biochimie', category: 'BIO-LAB-CHEM', manufacturer: 'Roche Diagnostics', model: 'Cobas c311', serial: 'BC-2023-4420', cc: 'LAB', loc: 'LAB-01', acquired: '2023-04-18', cost: 54000000, supplier: 'SUP-004', warrantyMonths: 24, criticality: 'high', mobile: 0 },
  { name: 'Automate d hematologie', category: 'BIO-LAB-HEMA', manufacturer: 'Sysmex', model: 'XN-550', serial: 'HM-2024-8830', cc: 'LAB', loc: 'LAB-01', acquired: '2024-10-09', cost: 38500000, supplier: 'SUP-004', warrantyMonths: 24, criticality: 'high', mobile: 0 },
  { name: 'Centrifugeuse de laboratoire', category: 'BIO-LAB-CENTRI', manufacturer: 'Hettich', model: 'Rotina 380', serial: 'CF-2025-1120', cc: 'LAB', loc: 'LAB-01', acquired: '2025-03-25', cost: 4300000, supplier: 'SUP-004', warrantyMonths: 12, criticality: 'medium' },
  { name: 'Congelateur -80 degres', category: 'BIO-LAB-COLD', manufacturer: 'Thermo Fisher', model: 'TSX400', serial: 'FZ-2025-3301', cc: 'LAB', loc: 'LAB-01', acquired: '2025-06-30', cost: 15800000, supplier: 'SUP-004', warrantyMonths: 24, criticality: 'critical', mobile: 0 },

  // --- Biomedical : theatre & sterilisation ---------------------------------
  { name: 'Respirateur d anesthesie', category: 'BIO-OT-ANES', manufacturer: 'Draeger', model: 'Primus', serial: 'AN-2022-5580', cc: 'CHIR', loc: 'OT-01', acquired: '2022-05-12', cost: 42000000, supplier: 'SUP-003', warrantyMonths: 24, criticality: 'critical' },
  { name: 'Bistouri electrique', category: 'BIO-OT-ESU', manufacturer: 'Erbe', model: 'VIO 300D', serial: 'ES-2024-7710', cc: 'CHIR', loc: 'OT-01', acquired: '2024-04-22', cost: 11500000, supplier: 'SUP-004', warrantyMonths: 24, criticality: 'critical' },
  { name: 'Table operatoire hydraulique', category: 'BIO-OT-TABLE', manufacturer: 'Maquet', model: 'Alphamaxx', serial: 'OT-2023-2290', cc: 'CHIR', loc: 'OT-02', acquired: '2023-01-30', cost: 24700000, supplier: 'SUP-004', warrantyMonths: 24, criticality: 'high', mobile: 0 },
  { name: 'Autoclave 250 litres', category: 'BIO-OT-STERIL', manufacturer: 'Getinge', model: 'GSS67', serial: 'AC-2023-6612', cc: 'TECH', loc: 'STER-01', acquired: '2023-06-14', cost: 36000000, supplier: 'SUP-004', warrantyMonths: 24, criticality: 'critical', mobile: 0 },
  { name: 'Generateur de dialyse', category: 'BIO-DIAL', manufacturer: 'Fresenius Medical Care', model: '4008 S', serial: 'DL-2025-9910', cc: 'DIAL', loc: 'DIAL-01', acquired: '2025-09-01', cost: 19600000, supplier: 'SUP-004', warrantyMonths: 24, criticality: 'critical' },

  // --- Facilities & infrastructure ------------------------------------------
  { name: 'Batiment A - Consultations et urgences', category: 'FAC-BLD', manufacturer: null, model: null, serial: null, cc: 'TECH', loc: 'BLD-A', acquired: '2015-01-01', cost: 1450000000, funding: 'own_construction', criticality: 'critical', mobile: 0 },
  { name: 'Groupe electrogene 500 kVA', category: 'FAC-GEN', manufacturer: 'Caterpillar', model: 'DE500GC', serial: 'GE-2021-3040', cc: 'TECH', loc: 'TECH-02', acquired: '2021-08-15', cost: 92000000, supplier: 'SUP-009', warrantyMonths: 24, criticality: 'critical', mobile: 0 },
  { name: 'Centrale d oxygene medical PSA', category: 'FAC-GAS', manufacturer: 'Air Liquide Sante', model: 'Oxyplus 60', serial: 'OX-2022-1180', cc: 'TECH', loc: 'TECH-03', acquired: '2022-03-10', cost: 148000000, supplier: 'SUP-008', funding: 'grant', fundingRef: 'UNICEF-OXY-2021-33', donor: 'UNICEF', warrantyMonths: 36, criticality: 'critical', mobile: 0 },
  { name: 'Centrale de climatisation bloc operatoire', category: 'FAC-HVAC', manufacturer: 'Carrier', model: 'AquaSnap 30RB', serial: 'HV-2023-5520', cc: 'CHIR', loc: 'BLD-C', acquired: '2023-11-05', cost: 76000000, supplier: 'SUP-009', warrantyMonths: 24, criticality: 'high', mobile: 0 },
  { name: 'Ascenseur monte-malade Batiment B', category: 'FAC-LIFT', manufacturer: 'Schindler', model: '5500', serial: 'LF-2020-7790', cc: 'TECH', loc: 'BLD-B', acquired: '2020-06-01', cost: 58000000, supplier: 'SUP-009', warrantyMonths: 24, criticality: 'high', mobile: 0 },
  { name: 'Systeme de detection et extinction incendie', category: 'FAC-FIRE', manufacturer: 'Siemens', model: 'Cerberus PRO', serial: 'FS-2024-4410', cc: 'TECH', loc: 'BLD-A', acquired: '2024-01-20', cost: 34500000, supplier: 'SUP-009', warrantyMonths: 24, criticality: 'critical', mobile: 0 },

  // --- Fleet -----------------------------------------------------------------
  { name: 'Ambulance de reanimation A-01', category: 'FLT-AMB', manufacturer: 'Toyota', model: 'Land Cruiser Hardtop', serial: 'JTERB71J50K012841', cc: 'LOG', loc: 'GAR-01', acquired: '2024-03-12', cost: 78000000, supplier: 'SUP-005', warrantyMonths: 36, criticality: 'critical',
    vehicle: { registration: 'LT-4821-AM', type: 'ambulance', fuel: 'diesel', mileage: 68420, serviceIntervalKm: 10000, insurance: 'Chanas Assurances', policy: 'AUTO-2026-114872', insuranceExpiry: '2026-11-30', licenseExpiry: '2027-03-11', onboard: 'Respirateur de transport, defibrillateur, aspirateur de mucosites, obus d oxygene 5 L x2' } },
  { name: 'Ambulance de transport A-02', category: 'FLT-AMB', manufacturer: 'Toyota', model: 'Hiace', serial: 'JTFR22P300K55410', cc: 'LOG', loc: 'GAR-01', acquired: '2021-09-20', cost: 46000000, supplier: 'SUP-005', warrantyMonths: 24, criticality: 'high',
    vehicle: { registration: 'LT-2210-AM', type: 'ambulance', fuel: 'diesel', mileage: 154900, serviceIntervalKm: 10000, insurance: 'Activa Assurances', policy: 'AUTO-2026-093311', insuranceExpiry: '2026-10-14', licenseExpiry: '2026-09-19', onboard: 'Brancard, obus d oxygene 5 L, trousse de premiers secours' } },
  { name: 'Vehicule de service - Direction', category: 'FLT-VEH', manufacturer: 'Toyota', model: 'Corolla', serial: 'JTNBV58E90J221904', cc: 'ADM', loc: 'GAR-01', acquired: '2023-02-14', cost: 18500000, supplier: 'SUP-005', warrantyMonths: 24, criticality: 'low',
    vehicle: { registration: 'LT-7734-CE', type: 'car', fuel: 'petrol', mileage: 91200, serviceIntervalKm: 10000, insurance: 'Chanas Assurances', policy: 'AUTO-2026-114873', insuranceExpiry: '2027-01-31', licenseExpiry: '2027-02-13' } },

  // --- IT & office -----------------------------------------------------------
  { name: 'Serveur SIH principal', category: 'IT-SRV', manufacturer: 'Dell', model: 'PowerEdge R750', serial: 'SRV-2024-0091', cc: 'IT', loc: 'IT-01', acquired: '2024-05-02', cost: 28000000, supplier: 'SUP-010', warrantyMonths: 36, criticality: 'critical', mobile: 0 },
  { name: 'Baie reseau et commutateurs coeur', category: 'IT-NET', manufacturer: 'Cisco', model: 'Catalyst 9200', serial: 'NW-2024-0092', cc: 'IT', loc: 'IT-01', acquired: '2024-05-02', cost: 14500000, supplier: 'SUP-010', warrantyMonths: 36, criticality: 'high', mobile: 0 },
  { name: 'Licence Systeme d Information Hospitalier', category: 'IT-SW', manufacturer: 'LedgerCore Health', model: 'SIH v4 - 300 utilisateurs', serial: null, cc: 'IT', loc: 'IT-01', acquired: '2025-01-01', cost: 45000000, supplier: 'SUP-010', criticality: 'critical', mobile: 0 },
  { name: 'Lot de 25 postes de travail', category: 'IT-PC', manufacturer: 'HP', model: 'ProDesk 400 G9', serial: 'PC-2025-LOT-25', cc: 'IT', loc: 'BLD-A', acquired: '2025-02-18', cost: 18750000, supplier: 'SUP-010', warrantyMonths: 36, criticality: 'medium' },
  { name: 'Lot de 60 lits d hospitalisation', category: 'MED-FURN', manufacturer: 'Hill-Rom', model: 'Centra', serial: 'BED-2023-LOT-60', cc: 'MED', loc: 'BLD-B', acquired: '2023-07-01', cost: 42000000, supplier: 'SUP-004', warrantyMonths: 24, criticality: 'medium' },
];

export const DEMO_COST_CENTERS = [
  ['ADM', 'Direction generale et administration', 'General management and administration', 'administration'],
  ['FIN', 'Direction financiere et comptabilite', 'Finance and accounting', 'administration'],
  ['URG', 'Service des urgences', 'Emergency department', 'ward'],
  ['REA', 'Reanimation et soins intensifs', 'ICU and critical care', 'ward'],
  ['CHIR', 'Bloc operatoire et chirurgie', 'Operating theatre and surgery', 'ward'],
  ['MAT', 'Maternite et neonatologie', 'Maternity and neonatology', 'ward'],
  ['PED', 'Pediatrie', 'Paediatrics', 'ward'],
  ['MED', 'Medecine interne', 'Internal medicine', 'ward'],
  ['DIAL', 'Unite de dialyse', 'Dialysis unit', 'clinical_service'],
  ['IMG', 'Service d imagerie medicale', 'Medical imaging', 'clinical_service'],
  ['LAB', 'Laboratoire d analyses medicales', 'Medical laboratory', 'clinical_service'],
  ['PHAR', 'Pharmacie hospitaliere', 'Hospital pharmacy', 'clinical_service'],
  ['BIOM', 'Service biomedical', 'Biomedical engineering', 'technical'],
  ['TECH', 'Services techniques et maintenance', 'Technical services and maintenance', 'technical'],
  ['IT', 'Service informatique', 'IT department', 'technical'],
  ['LOG', 'Logistique et transport sanitaire', 'Logistics and patient transport', 'support'],
];

export const DEMO_LOCATIONS = [
  ['SITE-01', 'Site principal - Shisong SOA', 'site', null, null],
  ['BLD-A', 'Batiment A - Consultations et urgences', 'building', 'SITE-01', 'URG'],
  ['BLD-B', 'Batiment B - Hospitalisation', 'building', 'SITE-01', 'MED'],
  ['BLD-C', 'Batiment C - Plateau technique', 'building', 'SITE-01', 'CHIR'],
  ['BLD-T', 'Batiment technique et logistique', 'building', 'SITE-01', 'TECH'],
  ['URG-01', 'Salle de dechoquage', 'room', 'BLD-A', 'URG'],
  ['URG-02', 'Box de consultation urgences', 'room', 'BLD-A', 'URG'],
  ['REA-01', 'Reanimation - Box 1', 'room', 'BLD-B', 'REA'],
  ['REA-02', 'Reanimation - Box 2', 'room', 'BLD-B', 'REA'],
  ['MED-01', 'Medecine interne - Salle commune', 'ward', 'BLD-B', 'MED'],
  ['PED-01', 'Pediatrie - Salle commune', 'ward', 'BLD-B', 'PED'],
  ['MAT-01', 'Salle d accouchement', 'room', 'BLD-B', 'MAT'],
  ['NEO-01', 'Neonatologie', 'ward', 'BLD-B', 'MAT'],
  ['DIAL-01', 'Unite de dialyse', 'room', 'BLD-B', 'DIAL'],
  ['OT-01', 'Bloc operatoire 1', 'theatre', 'BLD-C', 'CHIR'],
  ['OT-02', 'Bloc operatoire 2', 'theatre', 'BLD-C', 'CHIR'],
  ['IMG-01', 'Salle IRM', 'room', 'BLD-C', 'IMG'],
  ['IMG-02', 'Salle scanner', 'room', 'BLD-C', 'IMG'],
  ['IMG-03', 'Salle de radiologie et mammographie', 'room', 'BLD-C', 'IMG'],
  ['LAB-01', 'Laboratoire central', 'lab', 'BLD-C', 'LAB'],
  ['STER-01', 'Sterilisation centrale', 'room', 'BLD-C', 'TECH'],
  ['TECH-01', 'Atelier biomedical', 'workshop', 'BLD-T', 'BIOM'],
  ['TECH-02', 'Local groupes electrogenes', 'room', 'BLD-T', 'TECH'],
  ['TECH-03', 'Centrale oxygene', 'room', 'BLD-T', 'TECH'],
  ['IT-01', 'Salle serveurs', 'room', 'BLD-T', 'IT'],
  ['GAR-01', 'Garage ambulances', 'vehicle_bay', 'BLD-T', 'LOG'],
  ['STORE-01', 'Magasin central', 'store', 'BLD-T', 'LOG'],
];

export const DEMO_SUPPLIERS = [
  ['SUP-001', 'Siemens Healthineers Cameroun', 'equipment', 'M001234567A', 'Yaounde, Bastos', 'contact@siemens-healthineers.cm', '+237 233 42 18 90', 'XAF', 45],
  ['SUP-002', 'GE HealthCare Africa', 'equipment', 'M001987654B', 'Douala, Bonapriso', 'sales.africa@gehealthcare.com', '+237 233 50 22 14', 'EUR', 60],
  ['SUP-003', 'Draeger Medical Afrique Centrale', 'equipment', 'M002445566C', 'Douala, Zone Industrielle', 'info@draeger.cm', '+237 233 39 77 40', 'EUR', 45],
  ['SUP-004', 'BioMed Services Afrique SARL', 'biomedical_service', 'M003112233D', 'Yaounde, Mvan', 'service@biomed-afrique.cm', '+237 677 88 21 05', 'XAF', 30],
  ['SUP-005', 'CFAO Motors Cameroun (Toyota)', 'equipment', 'M001556677E', 'Douala, Bali', 'flotte@cfao-motors.cm', '+237 233 42 60 00', 'XAF', 30],
  ['SUP-006', 'ENEO Cameroun SA', 'utilities', 'M000112233F', 'Douala, Bonanjo', 'clientele@eneocameroon.cm', '+237 233 42 10 00', 'XAF', 15],
  ['SUP-007', 'CAMWATER', 'utilities', 'M000445566G', 'Yaounde, Centre', 'clients@camwater.cm', '+237 222 23 04 00', 'XAF', 15],
  ['SUP-008', 'Air Liquide Sante Cameroun', 'services', 'M002778899H', 'Douala, Bassa', 'sante@airliquide.cm', '+237 233 37 55 12', 'XAF', 30],
  ['SUP-009', 'SOTECH Batiment et Installations', 'construction', 'M004001122J', 'Yaounde, Nsam', 'devis@sotech.cm', '+237 699 41 77 30', 'XAF', 45],
  ['SUP-010', 'CFAO Technologies Cameroun', 'equipment', 'M001889900K', 'Douala, Akwa', 'it@cfao-technologies.cm', '+237 233 43 12 88', 'XAF', 30],
  ['SUP-011', 'Pharmacentre Distribution', 'consumables', 'M003667788L', 'Yaounde, Elig-Essono', 'commandes@pharmacentre.cm', '+237 222 20 41 15', 'XAF', 30],
  ['SUP-012', 'Laborex Cameroun', 'consumables', 'M003554433M', 'Douala, Ndokotti', 'ventes@laborex.cm', '+237 233 40 19 22', 'XAF', 30],
];

export const DEMO_USERS = [
  ['admin@ledgercore.health', 'Administrateur Systeme', 'system_admin', 'Administrateur applicatif', 'ADM', 0, null],
  ['grace.ntamack@hgy.cm', 'Grace Ntamack', 'cfo', 'Directrice financiere', 'FIN', 0, null],
  ['amina.bakari@hgy.cm', 'Amina Bakari', 'accounting_clerk', 'Agent comptable', 'FIN', 0, null],
  ['samuel.eyenga@hgy.cm', 'Samuel Eyenga', 'biomedical_technician', 'Technicien biomedical senior', 'BIOM', 1, 6500],
  ['pierre.kamga@hgy.cm', 'Pierre Kamga', 'biomedical_technician', 'Technicien biomedical', 'BIOM', 1, 4500],
  ['andre.fotso@hgy.cm', 'Andre Fotso', 'biomedical_technician', 'Technicien services techniques', 'TECH', 1, 4000],
  ['derick.nji@hgy.cm', 'Derick Nji', 'general_services_technician', 'General Services Technician', 'TECH', 1, 3800],
  ['fatou.diallo@hgy.cm', 'Fatou Diallo', 'asset_manager', 'Responsable patrimoine et services techniques', 'TECH', 0, null],
  ['mensah.kouassi@hgy.cm', 'Dr. Mensah Kouassi', 'ward_head', 'Chef de service reanimation', 'REA', 0, null],
  ['esther.nkodo@hgy.cm', 'Dr. Esther Nkodo', 'ward_head', 'Chef de service imagerie', 'IMG', 0, null],
  ['jeanpaul.mbarga@hgy.cm', 'Jean-Paul Mbarga', 'procurement_officer', 'Responsable des achats', 'ADM', 0, null],
  ['claire.tchoumi@hgy.cm', 'Claire Tchoumi', 'auditor', 'Auditeur interne', 'ADM', 0, null],
];
