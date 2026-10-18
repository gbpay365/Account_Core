# LedgerCore Health — Comprehensive User Guide & Operational Manual
**Hospital Core Accounting, Asset Lifecycle & Maintenance Management System**  
*Dual-Standard SYSCOHADA Revised (AUDCIF) & IFRS Compliance*

---

## Table of Contents

1. [System Overview & Architecture](#1-system-overview--architecture)
   - [Core Mission & Capabilities](#core-mission--capabilities)
   - [Dual-Framework Accounting (OHADA & IFRS)](#dual-framework-accounting-ohada--ifrs)
   - [Biomedical & Healthcare CMMS Integration](#biomedical--healthcare-cmms-integration)
2. [Getting Started & Authentication](#2-getting-started--authentication)
   - [Accessing the Application](#accessing-the-application)
   - [Bilingual Interface (English & French)](#bilingual-interface-english--french)
   - [Roles & Permissions Matrix](#roles--permissions-matrix)
   - [Demonstration Accounts](#demonstration-accounts)
3. [Module 1: Executive Dashboard & KPIs](#3-module-1-executive-dashboard--kpis)
   - [Financial Performance & Funding Metrics](#financial-performance--funding-metrics)
   - [Asset Net Book Value & Register Overview](#asset-net-book-value--register-overview)
   - [Maintenance Pipeline & Equipment Safety Status](#maintenance-pipeline--equipment-safety-status)
4. [Module 2: Chart of Accounts & Analytical Structure](#4-module-2-chart-of-accounts--analytical-structure)
   - [SYSCOHADA Revised Classification (Classes 1–9)](#syscohada-revised-classification-classes-19)
   - [Posting Level Constraints & Child Account Generator](#posting-level-constraints--child-account-generator)
   - [IFRS Line Mapping Configuration](#ifrs-line-mapping-configuration)
   - [Analytical Cost Centres (Departments & Wards)](#analytical-cost-centres-departments--wards)
5. [Module 3: Journal Entries & AUDCIF Statutory Capture](#5-module-3-journal-entries--audcif-statutory-capture)
   - [Statutory Principles (AUDCIF Articles 17–24)](#statutory-principles-audcif-articles-1724)
   - [Specialized Journals (Journaux Divisionnaires)](#specialized-journals-journaux-divisionnaires)
   - [Capturing a Double-Entry Voucher](#capturing-a-double-entry-voucher)
   - [Auto-Counterpart Suggestion Engine](#auto-counterpart-suggestion-engine)
   - [Posting, Immutability & Reversals (Extourne)](#posting-immutability--reversals-extourne)
   - [Recurring Journals & Scheduled Accruals](#recurring-journals--scheduled-accruals)
6. [Module 4: General Ledger, Auxiliary Subledgers & Lettrage](#6-module-4-general-ledger-auxiliary-subledgers--lettrage)
   - [General Ledger Account Statements](#general-ledger-account-statements)
   - [Statutory 8-Column Trial Balance](#statutory-8-column-trial-balance)
   - [Auxiliary Third-Party Subledgers (Clients & Fournisseurs)](#auxiliary-third-party-subledgers-clients--fournisseurs)
   - [Lettrage (Open-Item Invoice & Payment Matching)](#lettrage-open-item-invoice--payment-matching)
7. [Module 5: Accounting Periods, Fiscal Year & Year-End Close](#7-module-5-accounting-periods-fiscal-year--year-end-close)
   - [Period Statuses (Open, Closed, Locked)](#period-statuses-open-closed-locked)
   - [Structured 12-Step Close Checklist](#structured-12-step-close-checklist)
   - [Closed Period Overrides & Governance](#closed-period-overrides--governance)
   - [Cryptographic Audit Sealing (SHA-256 Chaining)](#cryptographic-audit-sealing-sha-256-chaining)
8. [Module 6: Treasury, Bank Reconciliation & Cash Registers](#8-module-6-treasury-bank-reconciliation--cash-registers)
   - [Bank Account Reconciliation (MT940 / CSV Import)](#bank-account-reconciliation-mt940--csv-import)
   - [Automated & Manual Transaction Matching](#automated--manual-transaction-matching)
   - [Petty Cash Registers & Mobile Money (MTN MoMo / Orange Money)](#petty-cash-registers--mobile-money-mtn-momo--orange-money)
   - [Cash Audits & Discrepancy Settlements](#cash-audits--discrepancy-settlements)
9. [Module 7: Fiscal Compliance & Withholding Tax (WHT / TSR)](#9-module-7-fiscal-compliance--withholding-tax-wht--tsr)
   - [Cameroon / CEMAC Tax Retentions](#cameroon--cemac-tax-retentions)
   - [Generating WHT Certificates (Acomptes & Prélèvements)](#generating-wht-certificates-acomptes--prélèvements)
   - [Monthly Tax Declaration Summary](#monthly-tax-declaration-summary)
10. [Module 8: Donor-Funded Projects & Grant Accounting](#10-module-8-donor-funded-projects--grant-accounting)
    - [Project Budgeting & Multi-Currency Setup](#project-budgeting--multi-currency-setup)
    - [Restricted Funding & Eligible Expense Allocation](#restricted-funding--eligible-expense-allocation)
    - [Donor Financial Reports & Burn-Rate Tracking](#donor-financial-reports--burn-rate-tracking)
11. [Module 9: Healthcare Payroll & Social Declarations (DIPE)](#11-module-9-healthcare-payroll--social-declarations-dipe)
    - [Salary Grid, Allowances & On-Call Primes](#salary-grid-allowances--on-call-primes)
    - [CNPS Social Security & IRPP Tax Computations](#cnps-social-security--irpp-tax-computations)
    - [DIPE (Document d'Information sur le Personnel Employé)](#dipe-document-dinformation-sur-le-personnel-employé)
    - [Automated Wage Journal Integration](#automated-wage-journal-integration)
12. [Module 10: Patient Billing, DFE & Inter-Branch Transfers](#12-module-10-patient-billing-dfe--inter-branch-transfers)
    - [Direction des Forfaits et Évacuations (DFE) Invoicing](#direction-des-forfaits-et-évacuations-dfe-invoicing)
    - [Medical Procedures & Patient Accounts](#medical-procedures--patient-accounts)
    - [Inter-Branch Reconciliations (Account 181 / 185)](#inter-branch-reconciliations-account-181--185)
13. [Module 11: Enterprise Fixed Asset Register](#13-module-11-enterprise-fixed-asset-register)
    - [Asset Classification (Biomedical, Facility, IT, Fleet, Furniture)](#asset-classification-biomedical-facility-it-fleet-furniture)
    - [Capitalisation & Work-In-Progress Transfers (Account 23 -> 21)](#capitalisation--work-in-progress-transfers-account-23---21)
    - [Asset Tagging, QR Code Generation & Custody Tracking](#asset-tagging-qr-code-generation--custody-tracking)
    - [Disposals, Scrap & Asset Sales (Accounts 28, 654, 81/82)](#disposals-scrap--asset-sales-accounts-28-654-8182)
14. [Module 12: Asset Depreciation & Leases (IFRS 16)](#14-module-12-asset-depreciation--leases-ifrs-16)
    - [Automated Monthly & Annual Depreciation Runs](#automated-monthly--annual-depreciation-runs)
    - [OHADA vs IFRS Depreciation Delta Calculation](#ohada-vs-ifrs-depreciation-delta-calculation)
    - [Donated Asset Subsidy Amortisation (Accounts 14 -> 799)](#donated-asset-subsidy-amortisation-accounts-14---799)
    - [IFRS 16 Lease Accounting (Right-of-Use & Liabilities)](#ifrs-16-lease-accounting-right-of-use--liabilities)
    - [Fiscal Tax Depreciation vs Book Depreciation](#fiscal-tax-depreciation-vs-book-depreciation)
15. [Module 13: Physical Inventory & Barcode Reconciliation](#15-module-13-physical-inventory--barcode-reconciliation)
    - [Launching an Annual / Periodic Asset Audit](#launching-an-annual--periodic-asset-audit)
    - [Scanner Verification & Mobile Auditing](#scanner-verification--mobile-auditing)
    - [Discrepancy Resolution & General Ledger Adjustments](#discrepancy-resolution--general-ledger-adjustments)
16. [Module 14: Hospital CMMS, Work Orders & Calibration](#16-module-14-hospital-cmms-work-orders--calibration)
    - [Preventive & Corrective Maintenance Workflows](#preventive--corrective-maintenance-workflows)
    - [Raising, Approving & Assigning Work Orders](#raising-approving--assigning-work-orders)
    - [Electrical Safety (IEC 60601) & Metrological Calibration](#electrical-safety-iec-60601--metrological-calibration)
    - [Quarantine Flags & Restriction Management](#quarantine-flags--restriction-management)
17. [Module 15: General Services, Errands & Procurement Logistics](#17-module-15-general-services-errands--procurement-logistics)
    - [Errands & Shopping Lists Execution](#errands--shopping-lists-execution)
    - [Vehicle Fleet Logs & Trip Dispatch](#vehicle-fleet-logs--trip-dispatch)
18. [Module 16: Mobile Technician Worklist](#18-module-16-mobile-technician-worklist)
    - [Mobile Interface for Field Technicians](#mobile-interface-for-field-technicians)
    - [Parts Usage & Time Logging](#parts-usage--time-logging)
19. [Module 17: Financial Statements, DSF & Tax Packet](#19-module-17-financial-statements-dsf--tax-packet)
    - [OHADA Statutory Statements (Bilan, Compte de Résultat, TAFIRE)](#ohada-statutory-statements-bilan-compte-de-résultat-tafire)
    - [IFRS Financial Statements (SOFP, P&L, Cash Flows, SOCE)](#ifrs-financial-statements-sofp-pl-cash-flows-soce)
    - [Dual-Standard Bridge Analysis](#dual-standard-bridge-analysis)
    - [FEC Dematerialized Tax Audit File Export](#fec-dematerialized-tax-audit-file-export)
    - [Déclaration Statistique et Fiscale (DSF CEMAC)](#déclaration-statistique-et-fiscale-dsf-cemac)
20. [Module 18: Security, Governance & Administration](#20-module-18-security-governance--administration)
    - [User Management & Role Assignment](#user-management--role-assignment)
    - [Immutable Audit Trail Inspection](#immutable-audit-trail-inspection)
    - [System Backup & Disaster Recovery Protocols](#system-backup--disaster-recovery-protocols)
21. [Standard Operating Procedures (SOPs) & Cheat Sheets](#21-standard-operating-procedures-sops--cheat-sheets)

---

## 1. System Overview & Architecture

### Core Mission & Capabilities
**LedgerCore Health** is an enterprise-grade Core Accounting, Asset Lifecycle, and Healthcare Facility Management (CMMS) software system engineered specifically for hospitals, clinics, and healthcare networks operating under the **OHADA (*Organisation pour l'Harmonisation en Afrique du Droit des Affaires*)** jurisdiction and international accounting frameworks (**IFRS**).

### Dual-Framework Accounting (OHADA & IFRS)
Unlike conventional ERPs that require redundant data entry or parallel databases, LedgerCore Health utilizes a **unified double-entry transactional engine** that captures each event once and evaluates it across both standards:
- **Statutory Presentation (OHADA / SYSCOHADA Revised):** Formatted for local legal compliance, tax filings, and regional CEMAC/UEMOA banking compliance.
- **Investor & International Presentation (IFRS):** Formatted for international donors, development banks, and corporate stakeholders.
- **Dual-Standard Bridge:** Real-time reconciliation quantifying every difference (e.g., IFRS 16 lease capitalisation, fair value adjustments, depreciation period variances).

### Biomedical & Healthcare CMMS Integration
LedgerCore seamlessly links medical equipment (CT scanners, ventilators, surgical autoclaves) with the General Ledger. When a biomedical engineer conducts maintenance or when an asset is depreciated, the operational and financial records remain permanently synchronised with zero variance between the physical register and the balance sheet.

---

## 2. Getting Started & Authentication

### Accessing the Application
- **Web Application URL:** `http://localhost:8700` (or your hospital's secure domain, e.g., `https://ledgercore.shisong.health`)
- **API Endpoint:** `http://localhost:4700/api`
- **Supported Browsers:** Google Chrome, Mozilla Firefox, Microsoft Edge, Safari (modern desktop and tablet browsers).

### Bilingual Interface (English & French)
The entire application operates in full bilingual mode:
- **Toggle Language:** Click the **Language** toggle button in the top navigation bar or the sign-in screen to instantly switch between **English** and **Français**.
- All account names, financial statements, validation alerts, and technical terms are natively translated according to official SYSCOHADA terminology.

### Roles & Permissions Matrix

| Role | Default Access Scope | Key Permissions |
| :--- | :--- | :--- |
| **System Administrator** | Full System & Configuration | User provisioning, role assignment, audit log inspection, organization settings, backup. |
| **CFO / Chief Accountant** | Financial Leadership | Post journal entries, lock periods, execute depreciation, approve reversals, sign off financial statements. |
| **Accounting Clerk** | Operational Bookkeeping | Saisie of journal entries, vendor bill capture, patient invoice review, bank statement import. Cannot post to General Ledger. |
| **Asset Manager** | Asset Register & Procurement | Asset registration, disposal requests, preventive plan scheduling, physical inventory management. |
| **Biomedical Technician** | Medical Equipment CMMS | Execute work orders, log calibration certificates, perform IEC 60601 safety tests, record parts used. |
| **General Services Technician**| Facility & Logistics | Execute errand runs, shopping list purchasing, non-clinical facility repairs, vehicle fleet logs. |
| **Ward / Department Head** | Operational Unit View | Request equipment repair, inspect custody of ward assets, view departmental budget consumption. |

### Demonstration Accounts
For testing and onboarding, predefined demonstration users are available (Password for all: `Ledger@2026`):

- **System Administrator:** `admin@ledgercore.health`
- **CFO:** `grace.ntamack@hgy.cm`
- **Accounting Clerk:** `amina.bakari@hgy.cm`
- **Asset Manager:** `fatou.diallo@hgy.cm`
- **Biomedical Technician:** `samuel.eyenga@hgy.cm`
- **General Services Tech:** `derick.nji@hgy.cm`
- **Ward Head (Surgery):** `mensah.kouassi@hgy.cm`

---

## 3. Module 1: Executive Dashboard & KPIs

The Executive Dashboard provides hospital directors and department heads with an instantaneous snapshot of financial and operational health.

### Financial Performance & Funding Metrics
- **Net Result (Résultat Net):** Tracks the surplus or deficit for the fiscal year to date under both OHADA and IFRS presentations.
- **Operating Turnover:** Patient fees, surgery billing, and medical services rendered.
- **Grants & Subsidies:** Operating subsidies received from the State, donor funding, and foundation grants.
- **Cash & Liquidity Positions:** Aggregated balances across commercial banks, petty cash, and mobile money accounts.

### Asset Net Book Value & Register Overview
- **Total Asset Cost (Valeur Brute):** Historical acquisition cost of all capitalised assets.
- **Cumulative Depreciation (Amortissements Cumulés):** Total statutory depreciation charged to date.
- **Net Book Value (Valeur Nette Comptable - VNC):** Residual book balance matching account Class 2 minus Class 28 in the General Ledger.

### Maintenance Pipeline & Equipment Safety Status
- **Work Orders Breakdown:** Real-time counter of tickets awaiting approval, scheduled, in progress, blocked, or awaiting verification.
- **Restricted / Quarantined Equipment:** Instant alert showing any medical equipment whose metrological calibration or electrical safety certification has lapsed.

---

## 4. Module 2: Chart of Accounts & Analytical Structure

### SYSCOHADA Revised Classification (Classes 1–9)
LedgerCore Health implements the complete **SYSCOHADA Revised Chart of Accounts** structured into 9 statutory classes:
- **Classe 1:** Comptes de ressources durables (Capitaux propres, emprunts, subventions d'investissement).
- **Classe 2:** Comptes de l'actif immobilisé (Immobilisations corporelles, incorporelles et financières).
- **Classe 3:** Comptes de stocks (Médicaments, consommables médicaux, pièces détachées).
- **Classe 4:** Comptes de tiers (Fournisseurs, clients hospitalisés, personnel, État et organismes sociaux).
- **Classe 5:** Comptes de trésorerie (Banques, caisses régies, mobile money).
- **Classe 6:** Comptes de charges des activités ordinaires (Achats médicaux, salaires, entretiens).
- **Classe 7:** Comptes de produits des activités ordinaires (Prestations de soins, hospitalisations, subventions).
- **Classe 8:** Comptes des autres charges et autres produits (Charges et produits Hors Activités Ordinaires - HAO).
- **Classe 9:** Comptes des engagements hors bilan et comptabilité analytique hospitalière.

### Posting Level Constraints & Child Account Generator
To maintain statutory integrity, LedgerCore enforces the **Niveau d'Imputation Rule**:
- **Heading Accounts (*Comptes de Regroupement*):** 2-digit and 3-digit accounts (e.g., `60`, `401`) are non-postable (`is_postable = 0`). Postings made directly to heading accounts are rejected.
- **Configurable Posting Length:** System administrators can set the posting length (typically 4, 6, or 8 characters).
- **Default Child Generator:** If a user selects a heading account, clicking **Create Default Child** automatically creates the first compliant postable sub-account (e.g., under `4011`, it creates `401100`).

### IFRS Line Mapping Configuration
Every postable SYSCOHADA account has a corresponding 1-to-1 IFRS presentation mapping:
- Example: SYSCOHADA `2411` (Matériel médical) maps to IFRS `Property, Plant and Equipment - Medical Equipment`.
- Example: SYSCOHADA `6611` (Rémunérations directes au personnel) maps to IFRS `Employee Benefits Expense`.

### Analytical Cost Centres (Departments & Wards)
To satisfy internal cost management, charges in Class 6 require an assigned **Cost Centre**:
- Clinical Wards: Surgery, Intensive Care Unit (ICU), Maternity, Outpatient, Cardiology.
- Support Services: Medical Laboratory, Pharmacy, Biomedical Engineering, Administration.

---

## 5. Module 3: Journal Entries & AUDCIF Statutory Capture

### Statutory Principles (AUDCIF Articles 17–24)
LedgerCore Health complies strictly with the OHADA Uniform Act (*AUDCIF*):
1. **Article 17 (Pièce Justificative Obligatoire):** Every entry must have a supporting voucher reference (e.g., Invoice number, Receipt number, Bank advice). Unreferenced manual entries are prohibited.
2. **Article 17 (Partie Double):** Total Debits must exactly equal Total Credits. Every entry requires at least two lines.
3. **Article 17 (Interdiction des Montants Négatifs):** Negative numbers in debit or credit fields are rejected. Adjustments must be made by swapping debit and credit positions or through contra-entries.
4. **Article 19 (Comptabilité Auxiliaire):** Collective accounts (`401`, `411`, `421`) must specify the individual third-party partner.
5. **Article 20 (Intangibilité des Écritures):** Once an entry is validated and posted, it cannot be modified or deleted. Errors are corrected strictly via contra-entry (*extourne*).

### Specialized Journals (Journaux Divisionnaires)
LedgerCore provides 10 standard auxiliary journals:
- `ACH` — Journal des Achats (Supplier invoices for pharmaceuticals, medical supplies)
- `VTE` — Journal des Ventes (Patient billing, clinic consultations, insurer billings)
- `BQ` — Journal de Banque (Bank deposits, transfers, direct debits)
- `CA` — Journal de Caisse (Cash desk receipts and petty cash expenses)
- `OD` — Journal des Opérations Diverses (General accruals, adjustments)
- `IMM` — Journal des Immobilisations (Asset acquisitions, WIP capitalisation)
- `AMO` — Journal des Amortissements (Monthly and year-end depreciation runs)
- `PAI` — Journal de Paie (Monthly wage and social charge integrations)
- `CHG` — Journal des Charges (Miscellaneous recurring overhead charges)
- `AN` — Journal des À-Nouveaux (Opening balances carried forward)

### Capturing a Double-Entry Voucher
1. Navigate to **Accounting -> Journal Entries** and click **New Entry**.
2. Select the **Journal Code** (e.g., `ACH` for Purchases).
3. Set the **Entry Date** (must be within an open period).
4. Enter the **Reference \*** (e.g., `FAC-2026-9912` from the supplier invoice).
5. Enter the **Description** of the transaction.
6. In the **Lines Table**:
   - Choose the debit account (e.g., `6011 — Fournitures médicales`). Enter amount. Select the **Cost Centre**.
   - Choose the counterpart credit account (e.g., `4011 — Fournisseurs`).
   - Select the **Third Party / Partner** (e.g., `[FRN] Air Liquide Santé`).
7. Inspect the **Out of Balance Indicator**: The badge displays `0.00` in green when balanced.
8. Click **Save as Draft** or **Save and Post** (requires `journal.post` permission).

### Auto-Counterpart Suggestion Engine
When typing the first line of a transaction, the intelligent auto-propose engine evaluates transaction templates and historical postings:
- Entering an expense line automatically suggests the default balancing liability or treasury account.
- The user can accept the proposal or modify lines as necessary.

### Posting, Immutability & Reversals (Extourne)
- **Drafts:** Can be reviewed, edited, or deleted prior to validation.
- **Posting:** Commits lines to the General Ledger, assigns a sequential entry number, and locks the record.
- **Reversals (*Extourne*):** Click **Reverse** on any posted entry. Enter the reversal date and mandatory justification. LedgerCore automatically generates an inverted contra-entry, linking both transactions in the audit trail.

---

## 6. Module 4: General Ledger, Auxiliary Subledgers & Lettrage

### General Ledger Account Statements
The General Ledger view displays running movements and balances for any account across any chosen timeframe:
- Filter by date range, journal, or analytical cost centre.
- Running balance is recalculated instantly with drill-down to the originating voucher.

### Statutory 8-Column Trial Balance
Accessible via **Accounting -> General Ledger -> Trial Balance**, the statutory OHADA trial balance presents 8 columns:
1. **Soldes d'ouverture Débit** (Opening Debit Balance)
2. **Soldes d'ouverture Crédit** (Opening Credit Balance)
3. **Mouvements Période Débit** (Period Movements Debit)
4. **Mouvements Période Crédit** (Period Movements Credit)
5. **Cumul Exercice Débit** (Year-to-Date Cumulative Debit)
6. **Cumul Exercice Crédit** (Year-to-Date Cumulative Credit)
7. **Solde de Clôture Débit** (Closing Debit Balance)
8. **Solde de Clôture Crédit** (Closing Credit Balance)

### Auxiliary Third-Party Subledgers (Clients & Fournisseurs)
- Collective general ledger accounts (e.g., `401100`, `411100`) can be expanded into individual partner cards.
- View individual supplier aging, outstanding invoices, and payment histories.

### Lettrage (Open-Item Invoice & Payment Matching)
Lettrage allows accountants to match vendor invoices against payments:
1. Select the third-party account in the General Ledger.
2. Filter for **Unmatched (*Non-lettrées*)** entries.
3. Select the invoice credit line and the corresponding bank payment debit line.
4. Click **Match (Lettrer)**. LedgerCore assigns an uppercase letter code (`AA`, `AB`...) and records the reconciliation timestamp.

---

## 7. Module 5: Accounting Periods, Fiscal Year & Year-End Close

### Period Statuses (Open, Closed, Locked)
- **Open:** Standard transactional state; all authorized clerks can capture and post entries.
- **Closed:** Standard month-end closure; general postings blocked. Posting requires the `journal.post_closed` permission and a mandatory written audit justification.
- **Locked:** Finalized state; sealed against all modifications after the year-end audit is completed.

### Structured 12-Step Close Checklist
Before closing a monthly or annual period, the system enforces a comprehensive pre-close checklist:
1. All drafts in the period posted or cleared.
2. Bank and mobile money reconciliations completed with zero unreconciled variance.
3. Petty cash registers audited and reconciled.
4. Monthly depreciation runs executed and posted to General Ledger.
5. Monthly payroll entry posted and reconciled against DIPE.
6. Withholding tax declarations generated.
7. Patient billing (DFE) reconciled against pharmacy and ward logs.
8. Foreign currency monetary assets/liabilities revalued at month-end closing rates.
9. Inter-branch accounts (181/185) reconciled with zero discrepancy.
10. Inventory count variances booked.
11. Analytical cost allocations verified.
12. Final Trial Balance verified for equilibrium.

### Cryptographic Audit Sealing (SHA-256 Chaining)
When a period is locked, LedgerCore executes a **cryptographic blockchain-style hash seal**:
- Every journal line is hashed using SHA-256, incorporating the previous entry's hash, timestamp, user ID, and entry contents.
- Any attempt to tamper with the database at the SQL level breaks the hash chain, immediately alerting auditors to data manipulation.

---

## 8. Module 6: Treasury, Bank Reconciliation & Cash Registers

### Bank Account Reconciliation (MT940 / CSV Import)
1. Navigate to **Accounting -> Bank Reconciliation**.
2. Select the bank account (e.g., `5211 — BICEC Main Account`).
3. Import the electronic bank statement (`MT940`, `OFX`, or standardized `CSV`).
4. LedgerCore displays the bank statement lines side-by-side with the General Ledger cash book movements.

### Automated & Manual Transaction Matching
- **Automated Matching:** Matches transactions based on exact amount, reference number, and value date.
- **Manual Reconciliation:** Allows matching a single bank deposit to multiple patient consultation receipts, or resolving bank charges (Account 631) directly into the bank journal.

### Petty Cash Registers & Mobile Money (MTN MoMo / Orange Money)
In African healthcare environments, digital mobile payments represent a critical revenue and expenditure channel:
- Create dedicated cash books for **MTN Mobile Money** and **Orange Money**.
- Record daily merchant settlement payouts, cash collection from patients, and urgent cash errand disbursements.

---

## 9. Module 7: Fiscal Compliance & Withholding Tax (WHT / TSR)

### Cameroon / CEMAC Tax Retentions
LedgerCore incorporates statutory tax retention schedules:
- **TSR (Taxe Spéciale sur le Revenu):** Withheld on foreign technical assistance, IT licenses, and foreign medical consultancy.
- **Prélèvement sur Achats / Acompte d'Impôt:** Withheld on local supplier payments without a certified tax number (*Attestation de Non-Redevance*).
- **Precompte TVA:** Automatic retention of VAT for designated withholding agents.

### Generating WHT Certificates
- Under **Accounting -> Withholding Tax**, click **Generate Certificate**.
- Filter by supplier and date range. The system formats and prints the statutory CEMAC deduction certificate to accompany payment.

---

## 10. Module 8: Donor-Funded Projects & Grant Accounting

### Project Budgeting & Multi-Currency Setup
Healthcare institutions often manage donor grants (e.g., Global Fund, USAID, Misereor, Catholic Relief Services):
- Assign unique Project Codes (e.g., `PRJ-HIV-2026`, `PRJ-MATERNAL-EU`).
- Record multi-currency grant allocations (EUR, USD, XAF) with statutory conversion tracking.

### Restricted Funding & Eligible Expense Allocation
- Tag operational expenses, equipment purchases, and salary lines directly to donor project codes.
- Restrict expenditures exceeding approved line-item budget envelopes.

---

## 11. Module 9: Healthcare Payroll & Social Declarations (DIPE)

### Salary Grid, Allowances & On-Call Primes
- Configured for medical salary structures: Base salary, technical medical allowance, on-call night duty (*gardes et astreintes*), and hazard allowances (*primes de risque*).

### CNPS Social Security & IRPP Tax Computations
- Automated deduction of **CNPS** employee and employer social contributions according to statutory ceilings.
- **IRPP (*Impôt sur le Revenu des Personnes Physiques*)** and local municipal taxes (*Centimes Additionnels Communaux - CAC*).

### DIPE (Document d'Information sur le Personnel Employé)
- Generates the monthly electronic DIPE file required for submission to the National Social Insurance Fund and Tax Directorate.

---

## 12. Module 10: Patient Billing, DFE & Inter-Branch Transfers

### Direction des Forfaits et Évacuations (DFE) Invoicing
- Standardized billing for inpatient packages, surgeries, cardiology procedures, and outpatient clinics.
- Multi-payer splitting: Automatically calculates the share payable by the patient vs. insurance companies vs. employer mutual funds.

### Inter-Branch Reconciliations (Account 181 / 185)
- For hospital networks operating secondary clinics, health centres, or pharmacies:
- Tracks reciprocal cross-branch transfers (e.g., pharmaceuticals transferred from Central Pharmacy to Outpatient Dispensary).

---

## 13. Module 11: Enterprise Fixed Asset Register

### Asset Classification
LedgerCore tracks physical assets across five distinct domains:
1. **Biomedical Equipment:** Anaesthesia machines, ultrasound, dialysis units, laboratory analysers.
2. **Facility & Infrastructure:** Generators, solar power installations, water purification plants, HVAC.
3. **IT & Telecommunications:** Hospital servers, network switches, clinical workstations.
4. **Fleet & Transport:** Ambulances, patient transport vans, utility vehicles.
5. **Furniture & Fixtures:** Hospital beds, surgical tables, administrative furniture.

### Capitalisation & WIP Transfers (Account 23 -> 21)
When construction works or complex installations are completed:
1. Navigate to **Assets -> Register -> Capitalise WIP**.
2. Select accumulated costs in Account `231` (Immobilisations en cours).
3. Post the capitalisation voucher transferring balances to Account `215` (Installations techniques) and create the asset register card.

### Asset Tagging, QR Code Generation & Custody Tracking
- Every registered asset receives a unique system tag (e.g., `AST-BIO-2026-0042`).
- Clicking **Print QR Tag** generates a waterproof label containing the asset tag, serial number, and quick-scan URL.
- Record internal asset movements across departments, wards, and individual custodians with digital signature logging.

---

## 14. Module 12: Asset Depreciation & Leases (IFRS 16)

### Automated Monthly & Annual Depreciation Runs
1. Navigate to **Assets -> Depreciation**.
2. Click **Run Depreciation**. Choose the fiscal period.
3. LedgerCore computes statutory straight-line or degressive depreciation line-by-line across all active assets.
4. Click **Simulate** to review calculations; click **Post Run** to generate the automated entry in Journal `AMO`.

### Donated Asset Subsidy Amortisation (Accounts 14 -> 799)
For equipment acquired through grants or donor gifts:
- The initial equipment cost is balanced in Account `14` (Subventions d'investissement).
- Each depreciation run simultaneously generates the subsidy write-back entry (`Debit 14 / Credit 799`), ensuring that donor-funded assets have a neutral impact on the hospital's net operating result.

### IFRS 16 Lease Accounting
- Leased medical imaging systems or buildings are recorded as **Right-of-Use (ROU) Assets** with corresponding lease liabilities.
- Automatically generates the monthly split between principal liability repayment and interest expense.

---

## 15. Module 13: Physical Inventory & Barcode Reconciliation

### Launching an Asset Audit
1. Navigate to **Assets -> Physical Inventory**.
2. Create an **Inventory Campaign** targeting a specific building, ward, or asset class.
3. Technicians and auditors scan asset QR tags on mobile tablets.
4. Real-time status flags: **Verified**, **Missing**, **Displaced (Found in Wrong Location)**, or **Unregistered**.

### Discrepancy Resolution
- Displaced assets are re-assigned to the verified ward with one click.
- Unfound assets are flagged for scrap or insurance write-off.

---

## 16. Module 14: Hospital CMMS, Work Orders & Calibration

### Preventive & Corrective Maintenance Workflows
1. **Breakdown Request:** Ward nurse or doctor logs an issue (e.g., "Surgical autoclave door seal leaking").
2. **Triaging & Approval:** Biomedical manager reviews, sets priority (Urgent / High / Medium), and assigns a technician.
3. **Execution:** Technician performs maintenance, logs parts used from inventory, and records labor hours.
4. **Verification & Closeout:** Biomedical manager signs off after testing functionality.

### Electrical Safety (IEC 60601) & Metrological Calibration
To ensure clinical safety:
- Record protective earth resistance, chassis leakage current, and patient lead isolation tests.
- Upload third-party calibration certificates for incubators, centrifuges, and radiation equipment.
- **Automatic Quarantine:** If calibration expires or safety testing fails, the asset is automatically marked **Restricted / Quarantined** on the dashboard and cannot be scheduled for patient procedures.

---

## 17. Module 15: General Services, Errands & Procurement Logistics

### Errands & Shopping Lists Execution
Facility drivers and logistics officers:
- View assigned purchase runs (e.g., "Collect oxygen cylinders from depot", "Purchase diesel for emergency generator").
- Check off items purchased with unit prices and attach digital receipt photos.

---

## 18. Module 16: Mobile Technician Worklist

Designed specifically for smartphone and rugged warehouse tablets:
- Touch-friendly interface displaying **My Work Orders Today**.
- Start timer, pause job, scan asset QR code to pull up service history, and sign off with customer signature.

---

## 19. Module 17: Financial Statements, DSF & Tax Packet

### OHADA Statutory Statements
- **Bilan (Balance Sheet):** Full comparative display of Actif Immobilisé, Actif Circulant, Trésorerie-Actif, Capitaux Propres, Dettes Financières, Passif Circulant, and Trésorerie-Passif.
- **Compte de Résultat (Profit and Loss):** Segmented into Marge Brute, Valeur Ajoutée, EBE, Résultat d'Exploitation, Résultat Financier, Résultat HAO, and Résultat Net.
- **TAFIRE:** Cash flow and financial resources/applications statement.

### IFRS Financial Statements
- Instant toggle to IFRS presentation: Statement of Financial Position, Statement of Comprehensive Income, Statement of Cash Flows, and Statement of Changes in Equity.

### FEC (Fichier des Écritures Comptables)
- Export dematerialized electronic tax audit file strictly adhering to regional CEMAC tax inspection specifications (18 standard columns).

---

## 20. Module 18: Security, Governance & Administration

### User Management & Role Assignment
- System administrators can create users, assign multiple granular roles, and enforce strong password policies.
- Temporary permission delegation (e.g., Acting CFO while principal is on medical leave).

### Immutable Audit Trail Inspection
- Accessible under **Reporting -> Action History**.
- Every single creation, update, reversal, login, and export is recorded with user identity, client IP address, timestamp, and before/after JSON payloads.

---

## 21. Standard Operating Procedures (SOPs) & Cheat Sheets

### SOP 1: Daily Cash Desk Balancing
1. At shift close, the cashier accesses **Treasury -> Cash Registers**.
2. Counts physical bills and coins; enters breakdown into the **Denomination Sheet**.
3. Reconciles against receipt vouchers issued.
4. Transfers excess cash to the hospital vault or bank deposit box.

### SOP 2: Month-End General Ledger Close
1. CFO verifies all clerks have completed their daily journal postings.
2. Run automated bank reconciliation for all bank and mobile money accounts.
3. Execute the monthly asset depreciation run (**Assets -> Depreciation**).
4. Review the 12-Step Close Checklist under **Accounting -> Periods**.
5. When all checklist items show green checkmarks, click **Close Period**.

---

*LedgerCore Health — Engineered for Statutory Excellence, Clinical Safety, and Operational Integrity.*
