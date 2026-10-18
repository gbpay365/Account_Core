# LedgerCore Health — Comprehensive User Guide & Operational Manual
**Hospital Core Accounting, Asset Lifecycle & Maintenance Management System**  
*Dual-Standard SYSCOHADA Revised (AUDCIF) & IFRS Compliance*

---

## Table of Contents

- [1. System Overview & Architecture](#1-system-overview--architecture)
- [2. Getting Started & Authentication](#2-getting-started--authentication)
- [3. Module 1: Executive Dashboard & Operational KPIs](#3-module-1-executive-dashboard--operational-kpis)
- [4. Module 2: Chart of Accounts & Analytical Structure](#4-module-2-chart-of-accounts--analytical-structure)
- [5. Module 3: Journal Entries & AUDCIF Statutory Capture](#5-module-3-journal-entries--audcif-statutory-capture)
- [6. Module 4: General Ledger, Auxiliary Subledgers & Lettrage](#6-module-4-general-ledger-auxiliary-subledgers--lettrage)
- [7. Module 5: Accounting Periods, Fiscal Year & Year-End Close](#7-module-5-accounting-periods-fiscal-year--year-end-close)
- [8. Module 6: Treasury, Bank Reconciliation & Cash Registers](#8-module-6-treasury-bank-reconciliation--cash-registers)
- [9. Module 7: Fiscal Compliance & Withholding Tax (WHT / TSR)](#9-module-7-fiscal-compliance--withholding-tax-wht--tsr)
- [10. Module 8: Donor-Funded Projects & Grant Accounting](#10-module-8-donor-funded-projects--grant-accounting)
- [11. Module 9: Healthcare Payroll & Social Declarations (DIPE)](#11-module-9-healthcare-payroll--social-declarations-dipe)
- [12. Module 10: Patient Billing, DFE & Inter-Branch Transfers](#12-module-10-patient-billing-dfe--inter-branch-transfers)
- [13. Module 11: Enterprise Fixed Asset Register & Lifecycle Management](#13-module-11-enterprise-fixed-asset-register--lifecycle-management)
- [14. Module 12: Asset Depreciation & Leases (IFRS 16)](#14-module-12-asset-depreciation--leases-ifrs-16)
- [15. Module 13: Physical Asset Inventory & Barcode Verification](#15-module-13-physical-asset-inventory--barcode-verification)
- [16. Module 14: Hospital CMMS, Work Orders & Calibration (IEC 60601)](#16-module-14-hospital-cmms-work-orders--calibration-iec-60601)
- [17. Module 15: General Services, Errands & Procurement Logistics](#17-module-15-general-services-errands--procurement-logistics)
- [18. Module 16: Mobile Technician Worklist](#18-module-16-mobile-technician-worklist)
- [19. Module 17: Financial Statements, DSF & Tax Packet](#19-module-17-financial-statements-dsf--tax-packet)
- [20. Module 18: Security, Governance & Administration](#20-module-18-security-governance--administration)
- [21. Standard Operating Procedures (SOPs) & Practical Workflows](#21-standard-operating-procedures-sops--practical-workflows)

---

## 1. System Overview & Architecture

### Purpose & Mission
**LedgerCore Health** is an integrated hospital ERP combining core general ledger accounting, hospital fixed asset tracking, biomedical equipment safety, and healthcare logistics. It is designed to satisfy the strict legal demands of the **OHADA Uniform Act on Accounting and Financial Reporting (*AUDCIF*)** while simultaneously providing **IFRS presentations** for external donors, partners, and international auditors.

### Dual-Standard Transaction Engine
Every financial movement entered into LedgerCore Health is evaluated through dual accounting lenses:
- **SYSCOHADA Revised Standard:** Generates the official French/English statutory Bilan, Compte de Résultat, and TAFIRE according to regional CEMAC/UEMOA business laws.
- **IFRS Presentation:** Produces Statement of Financial Position, Statement of Profit or Loss, and Cash Flows according to international accounting standards.
- **Dual-Standard Bridge:** Provides an exact mathematical variance bridge quantifying every divergence between local statutory accounting and IFRS (such as IFRS 16 lease capitalization, accelerated tax depreciation vs. useful life depreciation, and subsidy amortization).

---

## 2. Getting Started & Authentication

### Step-by-Step Procedure: Logging into the System
1. **Open the Web Browser:** Launch Google Chrome, Microsoft Edge, or Mozilla Firefox and navigate to the application URL (Default: `http://localhost:8700` or your hospital's secure domain).
2. **Select Preferred Language:**
   - On the top right of the login screen, click **English** or **Français** to load your interface language.
3. **Enter Credentials:**
   - In the **Email address** field, enter your assigned hospital email.
   - In the **Password** field, enter your secure password.
   - Click the **Sign in** button.
4. **Using Quick-Demo Accounts (For Evaluation/Testing):**
   - Click any demonstration role card on the sign-in screen to populate credentials automatically:
     - **CFO:** `grace.ntamack@hgy.cm` / `Ledger@2026`
     - **Accounting Clerk:** `amina.bakari@hgy.cm` / `Ledger@2026`
     - **Asset Manager:** `fatou.diallo@hgy.cm` / `Ledger@2026`
     - **Biomedical Technician:** `samuel.eyenga@hgy.cm` / `Ledger@2026`
     - **Administrator:** `admin@ledgercore.health` / `Ledger@2026`
5. **Inspect the Application Header:**
   - Once authenticated, verify the header indicators:
     - **Organization Badge:** Displays hospital entity name (e.g., `🏥 TSSF Shisong SOA`).
     - **Framework Badge:** Displays active standard (`📒 OHADA` or `🌐 IFRS`).
     - **Currency:** Functional currency indicator (`💱 XAF`).
     - **Quick Actions:** Help/User Guide (`help_outline`), Print (`print`), and Reload (`refresh`).

---

## 3. Module 1: Executive Dashboard & Operational KPIs

### Purpose & Scope
The Executive Dashboard provides hospital leadership, finance directors, and biomedical heads with an instant real-time operational pulse of revenue, asset values, work order pipelines, and clinical safety compliance.

### Step-by-Step Procedure: Reviewing Executive KPIs
1. **Navigate to Dashboard:** Click **Overview -> Dashboard** from the left navigation rail.
2. **Review Financial Performance Cards:**
   - **Net Result (Résultat Net):** Shows year-to-date surplus or deficit calculated from posted revenue and expense lines.
   - **Operating Turnover:** Displays patient consultation fees, surgical fees, laboratory revenues, and pharmacy sales.
   - **Operating Subsidies & Grants:** Displays State operational subsidies and recognized donor contributions.
3. **Inspect Asset Health & Net Book Value:**
   - **Asset Net Book Value (VNC):** Displays total capitalised gross cost minus cumulative depreciation.
   - Click **Open register** on the asset card to drill down into category-level gross book values.
4. **Audit Maintenance & Biomedical Safety Pipeline:**
   - Review open work orders grouped by status: *Awaiting Approval*, *Scheduled*, *In Progress*, *Blocked*, *Awaiting Verification*.
   - **Restricted / Quarantined Equipment Alert:**
     - If the badge is green (**All equipment holds a current certificate**), all clinical assets are compliant.
     - If the badge is red (**Equipment restricted from use**), click directly on the warning badge to view machines whose electrical safety (IEC 60601) or metrological calibration has lapsed.

---

## 4. Module 2: Chart of Accounts & Analytical Structure

### Purpose & Scope
The Chart of Accounts module provides the statutory backbone of the hospital, implementing the **SYSCOHADA Revised** 9-class chart of accounts with hierarchical parent-child relationships and 1-to-1 IFRS presentation mapping.

### Step-by-Step Procedure: Creating a New Postable Account
1. **Navigate to Accounts:** Click **Accounting -> Chart of accounts** (`/accounts`).
2. **Filter & Search:**
   - Select a class tab (e.g., **Class 6 — Charges**) or type an account code in the search bar (e.g., `6011`).
3. **Click Create Account:**
   - Click the **+ New Account** button in the header.
4. **Fill Account Parameters:**
   - **Account Code:** Must start with the class digit and follow the hierarchical structure of its parent (e.g., `601102`).
   - **Name (French statutory):** Mandatory official French title (e.g., `Fournitures de cardiologie interventionnelle`).
   - **Name (English):** English operational title (e.g., `Interventional Cardiology Supplies`).
   - **Parent Account:** Select the 3-digit or 4-digit heading under which this account sits (e.g., `6011`).
   - **Accepts Postings (Switch):** Enable to allow transactional entries.
   - **Requires Cost Centre (Switch):** Enable for clinical expenses requiring ward/department allocation.
   - **Requires Third Party (Switch):** Enable for supplier or client collective accounts (`401`, `411`).
   - **Requires Asset Reference (Switch):** Enable for maintenance and equipment accounts (`624`, `605`).
5. **Set IFRS Presentation Line:**
   - In the **IFRS Mapping** dropdown, select the corresponding international reporting line (e.g., `Operating Expenses - Medical Supplies`).
6. **Save Account:** Click **Save Account**. The system validates code length and hierarchy and registers the account immediately.

### Step-by-Step Procedure: Generating a Default Child Account
If you select a non-postable heading account (e.g., `4011` - Fournisseurs):
1. Click on the heading account in the tree.
2. In the information banner, click **Create Default Child Account**.
3. LedgerCore automatically calculates the next sequential code meeting the organization's posting length (e.g., `401100`) and provisions it ready for use.

---

## 5. Module 3: Journal Entries & AUDCIF Statutory Capture

### Purpose & Legal Requirements
In strict compliance with **AUDCIF Articles 17, 19, and 20**:
- Every entry must balance: $\sum \text{Debits} = \sum \text{Credits}$.
- Every manual entry must cite a verifiable supporting voucher reference (*Pièce justificative*).
- Negative numbers are strictly prohibited.
- Posted entries cannot be edited or deleted; corrections are handled exclusively via contra-entry (*extourne*).

### Step-by-Step Procedure: Capturing a Double-Entry Voucher
1. **Navigate to Journal Entries:** Click **Accounting -> Journal entries** (`/journal`).
2. **Open Capture Modal:** Click the **+ New Entry** button.
3. **Select Specialized Journal:**
   - In the **Journal** dropdown, choose the operational journal:
     - `ACH` (Purchases & vendor bills)
     - `VTE` (Patient consultations & medical sales)
     - `BQ` (Bank transactions)
     - `CA` (Cash desk & Mobile Money)
     - `OD` (General accruals & adjustments)
4. **Set Accounting Date:** In **Entry date**, enter the transaction date (must fall in an open period).
5. **Enter Mandatory Supporting Voucher Reference (AUDCIF Art. 17):**
   - In **Reference \***, type the invoice number, receipt number, or bank slip ID (e.g., `FAC-2026-9901`). Leaving this blank triggers an immediate validation rejection.
6. **Enter Header Description:** Provide an operational summary (e.g., `Achat réactifs de laboratoire - BioMed`).
7. **Populate Journal Lines (Minimum 2 Lines):**
   - **Line 1 (Debit):**
     - Select **Account** (e.g., `601100 — Fournitures médicales`).
     - Enter **Debit Amount** (e.g., `150,000.00`).
     - Select **Cost Centre** (e.g., `Medical Laboratory`).
   - **Line 2 (Credit):**
     - Select **Account** (e.g., `401100 — Fournisseurs`).
     - Enter **Credit Amount** (e.g., `150,000.00`).
     - Under **Third Party**, choose the specific vendor (e.g., `[FRN] BioMed Services Afrique`).
8. **Verify Balance Indicator:**
   - Check the **Out of Balance** counter at the bottom right. When balanced, it displays `0.00` in green.
9. **Save Voucher:**
   - Click **Save as Draft** to queue for chief accountant review.
   - Click **Save and Post** (if holding `journal.post` permission) to commit lines to the General Ledger immediately.

### Step-by-Step Procedure: Reversing a Posted Entry (*Extourne*)
1. Locate the posted entry in the journal list and click to open its detail modal.
2. In the footer, click the **Reverse (Extourner)** button (`undo` icon).
3. In the reversal dialog:
   - Verify the **Reversal Date** (defaults to today's date).
   - In **Reason for Reversal**, enter an audit justification of at least 5 characters (e.g., `Correction erreur imputation compte de tiers`).
4. Click **Reverse entry**.
5. LedgerCore automatically creates an inverted contra-entry, links it to the original voucher, and commits it with a distinct sequential entry number.

---

## 6. Module 4: General Ledger, Auxiliary Subledgers & Lettrage

### Purpose & Scope
The General Ledger provides complete chronological running balances, while auxiliary subledgers maintain itemized partner accounts for suppliers, patients, and insurers.

### Step-by-Step Procedure: Generating the 8-Column Trial Balance
1. Navigate to **Accounting -> General Ledger** (`/ledger`).
2. Click the **Trial Balance** tab.
3. Select the reporting date range (**From** and **To**).
4. Select the **Framework** (`OHADA` or `IFRS`).
5. Click **Apply Range**.
6. The system generates the statutory 8-column table:
   - *Columns 1 & 2:* Opening Debit & Opening Credit
   - *Columns 3 & 4:* Period Movement Debit & Period Movement Credit
   - *Columns 5 & 6:* Year-to-Date Cumulative Debit & Credit
   - *Columns 7 & 8:* Closing Debit & Closing Credit
7. Verify that total debits equal total credits across all column pairs. Click **Excel** or **PDF** to export.

### Step-by-Step Procedure: Executing Open-Item Lettrage (Matching)
1. In the General Ledger, select an auxiliary partner account (e.g., `401100 - Fournisseurs`).
2. Set the **Matching Filter** to **Unmatched (*Non-lettrées*)**.
3. Locate the original supplier bill credit entry and the corresponding bank payment debit entry.
4. Check the selection boxes next to both entries.
5. Verify that the net difference between selected debits and credits is zero.
6. Click **Match Selected (Lettrer)**. The system assigns a matching code (e.g., `AA`) and locks the matched pair.

---

## 7. Module 5: Accounting Periods, Fiscal Year & Year-End Close

### Purpose & Legal Controls
Under **AUDCIF Article 13**, books must be closed periodically. LedgerCore implements a strict 3-tier lifecycle:
- **Open:** Postings allowed by authorized clerks.
- **Closed:** General postings blocked; adjustments require CFO override and audit logging.
- **Locked:** Permanent immutable state sealed with a SHA-256 cryptographic hash.

### Step-by-Step Procedure: Executing Month-End Closure
1. Navigate to **Accounting -> Periods and close** (`/periods`).
2. Locate the active period (e.g., `2026-09`) and click **Inspect Period**.
3. Complete the **12-Step Close Checklist**:
   - [x] Step 1: All draft entries verified and posted or deleted.
   - [x] Step 2: Bank and Mobile Money reconciliations completed with zero variance.
   - [x] Step 3: Cash desk registers audited and vault transfers verified.
   - [x] Step 4: Monthly asset depreciation run posted to Journal `AMO`.
   - [x] Step 5: Monthly payroll wage entry posted and reconciled against DIPE.
   - [x] Step 6: Withholding taxes (WHT/TSR) reconciled and certificates generated.
   - [x] Step 7: Patient billing (DFE) reconciled against pharmacy/ward consumption.
   - [x] Step 8: Foreign currency accounts revalued at month-end closing exchange rates.
   - [x] Step 9: Inter-branch reciprocal accounts (`181`/`185`) reconciled.
   - [x] Step 10: Physical inventory adjustments booked.
   - [x] Step 11: Departmental cost allocations reviewed.
   - [x] Step 12: Trial balance equilibrium confirmed.
4. Click **Close Period**. Postings for the period are now locked to standard users.
5. For year-end closure, click **Lock Period (Final Seal)** to generate the cryptographic hash chain.

---

## 8. Module 6: Treasury, Bank Reconciliation & Cash Registers

### Step-by-Step Procedure: Reconciling a Bank Account
1. Navigate to **Accounting -> Bank reconciliation** (`/bank-reconciliation`).
2. In the **Bank Account** selector, choose the commercial bank account (e.g., `5211 — BICEC Main Account`).
3. Click **Import Statement** and upload the electronic bank file (`MT940`, `OFX`, or standardized `CSV`).
4. Review the side-by-side reconciliation table:
   - *Left column:* Bank statement lines.
   - *Right column:* General Ledger cash book lines.
5. Click **Auto-Match**. Transactions with identical amounts, dates, and references are automatically reconciled.
6. For unmatched bank charges (Account `631`) or interest fees, click **Post Adjustment** directly from the statement line to create the balancing voucher in Journal `BQ`.
7. Once the **Unreconciled Variance** reaches `0.00 XAF`, click **Sign Off Reconciliation**.

### Step-by-Step Procedure: Daily Cash Desk Balancing
1. Navigate to **Accounting -> Cash & Mobile Money** (`/cash-registers`).
2. Select the cash register (e.g., `Main Outpatient Cashier Desk`).
3. Click **Count Cash / Denomination Sheet**.
4. Enter physical bill and coin counts (10,000 XAF, 5,000 XAF, 2,000 XAF, etc.).
5. The system computes total counted cash against system recorded receipts.
6. If surplus or deficit exists, enter the explanation.
7. Click **Confirm Count & Transfer to Vault** to generate the transfer voucher (Account `571` $\to$ `585`).

---

## 9. Module 7: Fiscal Compliance & Withholding Tax (WHT / TSR)

### Step-by-Step Procedure: Generating Withholding Tax Certificates
1. Navigate to **Accounting -> Withholding tax (WHT)** (`/withholding-tax`).
2. Select the fiscal tax period (e.g., `September 2026`).
3. The table lists all supplier payments subject to statutory deductions:
   - **TSR (Taxe Spéciale sur le Revenu):** For international software licenses and foreign consulting.
   - **Acompte d'Impôt / Prélèvement sur Achats:** For vendors lacking certified tax clearance (*Attestation de Non-Redevance*).
   - **Precompte TVA:** VAT withheld at source.
4. Check the box next to the supplier payment.
5. Click **Generate Statutory Certificate**.
6. Download and print the official signed certificate to accompany vendor payment and tax filing.

---

## 10. Module 8: Donor-Funded Projects & Grant Accounting

### Step-by-Step Procedure: Creating and Tracking a Grant Budget
1. Navigate to **Accounting -> Donor Projects** (`/donor-projects`).
2. Click **+ New Project**.
3. Enter Project Code (e.g., `PRJ-GLOBALFUND-2026`), Title, Donor Agency, Grant Currency (USD/EUR), and Total Envelope.
4. Define approved line-item budget categories (Personnel, Medical Equipment, Consumables, Training).
5. **Tagging Expenses to Projects:**
   - When capturing purchase vouchers in Journal `ACH`, enter the Project Code in the **Project** field on each relevant line.
6. **Monitoring Project Execution:**
   - In the project overview, inspect the real-time **Budget vs. Actuals** comparison and burn rate percentage.
   - Click **Export Donor Report** to generate the formatted financial summary required by the granting agency.

---

## 11. Module 9: Healthcare Payroll & Social Declarations (DIPE)

### Step-by-Step Procedure: Monthly Payroll Processing & DIPE Generation
1. Navigate to **Accounting -> Payroll & DIPE** (`/payroll`).
2. Select the payroll month (e.g., `September 2026`).
3. Click **Compute Payroll**.
4. Review the salary components:
   - Base Salaries (*Salaires de base*)
   - Technical Medical Allowances (*Primes de technicité*)
   - On-Call Night Duty Primes (*Primes d'astreintes et de garde*)
   - Hazard Allowances (*Primes de risque*)
5. Review statutory social and tax withholdings:
   - **CNPS:** Employee share (4.2%) and employer share (family allowances, occupational risks, pension).
   - **IRPP & CAC:** Personal income tax and local council surcharges.
6. Click **Generate DIPE File**. The system compiles the statutory electronic format required for tax and social security electronic submission.
7. Click **Post Wage Journal Entry**. LedgerCore automatically creates the balanced double-entry in Journal `PAI` (Debit Class 66 / Credit Class 42 & 43).

---

## 12. Module 10: Patient Billing, DFE & Inter-Branch Transfers

### Step-by-Step Procedure: Raising a Patient Billing Package
1. Navigate to **Accounting -> DFE & Branches** (`/dfe-invoicing`).
2. Click **+ New Patient Invoice**.
3. Select Patient Name, Hospital File Number, and Ward.
4. Add billed services from the standardized medical fee schedule (e.g., Surgery Package, Anesthesia, Hospitalization Bed Nights, Laboratory Tests).
5. **Configure Multi-Payer Split:**
   - In the **Payer Allocation** section:
     - Enter Patient Share (e.g., 20% copay).
     - Enter Insurer / Employer Mutual Fund Share (e.g., 80% coverage).
     - Select Third-Party Insurer account (e.g., `[CLI] Activa Assurances Santé`).
6. Click **Issue Invoice**. The system prints the receipt and automatically creates the receivable entries in Journal `VTE`.

---

## 13. Module 11: Enterprise Fixed Asset Register & Lifecycle Management

### Step-by-Step Procedure: Registering New Medical Equipment
1. Navigate to **Assets -> Asset register** (`/assets`).
2. Click **+ Register Asset**.
3. **Fill General Attributes:**
   - **Asset Name:** Official equipment description (e.g., `Ventilateur de Réanimation Hamilton-C3`).
   - **Domain:** Select `Biomedical`.
   - **Category:** Choose category (e.g., `Matériel Médical & Chirurgical`).
   - **Serial Number & Model:** Manufacturer serial number and model designation.
4. **Valuation & Accounting Parameters:**
   - **Acquisition Cost:** Invoice gross cost in XAF.
   - **Commissioning Date:** Date equipment entered clinical service.
   - **Depreciation Method:** Straight-line (*Linéaire*) or Degressive (*Dégressif*).
   - **Useful Lifetime:** Set operational life (e.g., 5 years / 60 months).
5. **Location & Custody Assignment:**
   - **Department / Ward:** Assign to clinical unit (e.g., `Intensive Care Unit`).
   - **Room:** Room/bed location (e.g., `ICU Bay 2`).
   - **Custodian:** Assign supervising ward head.
6. **Save & Print QR Tag:**
   - Click **Save Asset**.
   - Click **Print QR Tag** to generate the barcode sticker to affix to the machine chassis.

### Step-by-Step Procedure: Capitalizing Work-in-Progress (WIP Transfer 23 -> 21)
1. In the Asset Register, click the **Capitalise WIP** button.
2. Select the accumulated WIP cost lines sitting in Account `231` (Immobilisations en cours).
3. Specify the final destination asset account (e.g., `2151 — Installations complexes`).
4. Click **Execute Capitalisation**. The system registers the completed physical asset and posts the balancing journal entry in Journal `IMM` (`Debit 2151 / Credit 231`).

---

## 14. Module 12: Asset Depreciation & Leases (IFRS 16)

### Step-by-Step Procedure: Executing a Monthly Depreciation Run
1. Navigate to **Assets -> Depreciation** (`/depreciation`).
2. Click **Run Depreciation**.
3. Select the period (e.g., `September 2026`).
4. Click **Simulate**. The engine computes depreciation charges line-by-line across all active assets under both OHADA and IFRS rules.
5. Review the simulation table:
   - *Statutory OHADA Dotation:* Debits Account `681` / Credits Account `28x`.
   - *IFRS Depreciation:* Evaluated on economic useful life.
   - *IFRS Delta:* Variance between statutory and international depreciation.
   - *Subsidy Amortization:* Write-back of donor subsidies (Debit Account `14` / Credit Account `799`).
6. Click **Post Run**. LedgerCore generates and commits the automated entry in Journal `AMO`.

---

## 15. Module 13: Physical Asset Inventory & Barcode Verification

### Step-by-Step Procedure: Conducting a Physical Asset Audit
1. Navigate to **Assets -> Physical inventory** (`/asset-inventory`).
2. Click **+ New Campaign** (e.g., `Annual Inventory 2026 - Surgery & ICU`).
3. Set the target building and asset domain.
4. **Conduct Field Auditing:**
   - Open the web application on a mobile tablet equipped with a camera or barcode scanner.
   - Scan the QR code on each physical machine.
   - The system checks off the asset as **Verified** and records the audit timestamp and GPS/room coordinates.
5. **Review Variance Analysis:**
   - **Verified:** Machine present in its assigned location.
   - **Displaced:** Machine found in a different ward than registered. Click **Reassign Location** to update custody.
   - **Missing:** Equipment not scanned during the sweep. Flag for clinical investigation or write-off.
6. Click **Finalize Campaign** to publish the audit report.

---

## 16. Module 14: Hospital CMMS, Work Orders & Calibration (IEC 60601)

### Step-by-Step Procedure: Raising, Executing & Closing a Work Order
1. **Raising a Breakdown Request (Ward Staff):**
   - Click **Maintenance -> Work orders** (`/maintenance`). Click **+ Raise Work Order**.
   - Select the affected Asset Tag (e.g., `AST-BIO-2026-0042`).
   - Describe the clinical fault (e.g., `Infusion pump alarming error E04 - occlusion sensor failure`).
   - Set urgency: *Critical*, *High*, *Medium*, *Low*. Click **Submit Request**.
2. **Triaging & Assignment (Biomedical Manager):**
   - In the work order queue, open the ticket under `Awaiting Approval`.
   - Assign to a Biomedical Technician (e.g., `samuel.eyenga@hgy.cm`). Click **Approve & Dispatch**.
3. **Execution & Parts Consumption (Technician):**
   - Technician opens ticket on mobile device and clicks **Start Job**.
   - Under **Parts Used**, click **+ Add Part**. Select parts consumed from warehouse stock (e.g., `Pressure Sensor Membrane`).
   - Enter technician diagnostic notes.
4. **Clinical Verification & Closeout:**
   - Ward nurse or doctor tests functionality and signs on screen.
   - Biomedical manager verifies electrical safety and clicks **Verify & Close**.

### Step-by-Step Procedure: Logging IEC 60601 Safety & Calibration Tests
1. In the asset card, select the **Compliance & Safety** tab.
2. Under **IEC 60601-1 Electrical Safety Test**, enter measured readings:
   - Protective Earth Resistance ($\le 0.2\ \Omega$)
   - Chassis Leakage Current ($\le 500\ \mu\text{A}$)
   - Patient Lead Leakage ($\le 10\ \mu\text{A}$)
3. Under **Calibration**, enter the test date, issuing laboratory, certificate number, and expiry date. Attach the PDF certificate.
4. **Automatic Quarantine Behavior:**
   - If an electrical safety reading fails, or if the calibration expiry date passes, LedgerCore instantly sets the asset's status to **Quarantined**.
   - A prominent red warning appears on the clinical dashboard prohibiting the machine from patient use until re-tested and passed.

---

## 17. Module 15: General Services, Errands & Procurement Logistics

### Step-by-Step Procedure: Executing Errand Runs & Shopping Lists
1. Navigate to **General Services -> Shopping list** (`/shopping`) or **Errands** (`/errands`).
2. General Services supervisor creates an errand run (e.g., `Procurement of Diesel for Standby Generator`).
3. Driver / Logistics officer opens the task on their mobile phone.
4. At the supply depot, check off each acquired item and enter the unit purchase price.
5. Tap **Attach Receipt** to snap a photo of the cash receipt or delivery note using the device camera.
6. Tap **Complete Errand**. The system routes the expense voucher to accounting for petty cash reimbursement.

---

## 18. Module 16: Mobile Technician Worklist

### Step-by-Step Procedure: Using the Touch-Friendly Mobile Interface
1. Log into LedgerCore on a mobile device as a technician (e.g., `samuel.eyenga@hgy.cm`).
2. Navigate to **Maintenance -> My worklist** (`/worklist`).
3. The screen displays prioritized tasks scheduled for today.
4. Tap **Scan Asset** to activate the camera; scan the equipment QR tag to immediately view service manual PDFs and historical repair logs.
5. Tap **Start Timer** to track active wrench time.
6. When work is completed, tap **Sign & Complete** to capture digital clinical sign-off.

---

## 19. Module 17: Financial Statements, DSF & Tax Packet

### Step-by-Step Procedure: Generating Statutory Financial Statements
1. Navigate to **Reporting -> Financial statements** (`/reports`).
2. Select the target fiscal period and standard (**OHADA** or **IFRS**).
3. **OHADA Presentation:**
   - **Bilan (Balance Sheet):** Actif Immobilisé, Actif Circulant, Trésorerie-Actif, Capitaux Propres, Dettes, Trésorerie-Passif.
   - **Compte de Résultat:** Production, Chiffre d'affaires, Valeur Ajoutée, EBE, Résultat d'Exploitation, Résultat Financier, Résultat HAO, Résultat Net.
   - **TAFIRE:** Cash flow and financing statement.
4. **IFRS Presentation:**
   - Statement of Financial Position, Statement of Profit or Loss, Statement of Cash Flows, Statement of Changes in Equity (SOCE).
5. **Inspecting the Dual-Standard Bridge:**
   - Click the **Dual-Standard Bridge** tab.
   - The table displays: $\text{OHADA Net Result} + \sum \text{IFRS Adjustments} = \text{IFRS Net Profit}$.
6. **Exporting the FEC (Fichier des Écritures Comptables):**
   - Click **Export FEC**. The system downloads the 18-column dematerialized journal file compliant with CEMAC tax inspection standards.

---

## 20. Module 18: Security, Governance & Administration

### Step-by-Step Procedure: Provisioning Users and Inspecting Audit Logs
1. Navigate to **Administration -> Admin console** (`/admin`).
2. **User Creation:**
   - Click **+ Add User**. Enter user details, email, and assign role permissions (`admin`, `cfo`, `accountant`, `asset_manager`, `biomed_tech`, `services_tech`, `ward_head`).
3. **Audit Trail Inspection:**
   - Click **Reporting -> Action history** (`/audit`).
   - Every transaction creation, posting, modification, deletion, and reversal is logged with timestamp, user ID, client IP address, and before/after JSON payloads.
4. **Verifying Cryptographic Seal:**
   - Under **Audit Seal Verification**, run the automated scanner. The system re-computes SHA-256 hashes across all journal entries to confirm zero manual SQL tampering.

---

## 21. Standard Operating Procedures (SOPs) & Practical Workflows

### SOP 1: Supplier Invoice Reception, 3-Way Match & Saisie
1. Procurement receives supplier delivery note and vendor invoice.
2. Verify delivery note against physical warehouse goods received note.
3. Accounting clerk opens LedgerCore: **Accounting -> Journal Entries -> + New Entry**.
4. Select Journal `ACH`. Enter supplier invoice number in **Reference \***.
5. Impute expense account (Class 6), input cost centre, and credit auxiliary supplier subledger (Account `401100`, partner selected).
6. Save as Draft for Chief Accountant verification.

### SOP 2: Clinical Equipment Breakdown to Return-to-Service Protocol
1. Nurse notices ventilator failure; navigates to **Maintenance -> Work orders -> + Raise Work Order**.
2. Selects equipment tag and marks priority *Critical*.
3. Biomedical manager receives instant dashboard notification; assigns ticket to technician.
4. Technician arrives in ward, scans asset QR tag, replaces sensor, and executes IEC 60601 electrical leakage test.
5. Technician logs safety test results: status updates from *Quarantined* to *Operational*.
6. Clinical head inspects machine, signs on mobile screen, and technician marks ticket *Completed*.

---

*LedgerCore Health — Engineered for Statutory Excellence, Clinical Safety, and Operational Integrity.*
