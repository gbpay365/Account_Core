# 📊 LedgerCore — Budget Module & Commitment Control Manual
**Enterprise & Institutional Budgetary Accounting, Commitment Control & Execution Engine**  
*Compliant with SYSCOHADA Revised, CEMAC/UEMOA Public & Private Finance Standards, and IFRS Frameworks*

---

## 📑 Table of Contents
1. [🏛️ Executive Overview & Architectural Philosophy](#1-executive-overview--architectural-philosophy)
2. [🧭 Module Navigation & Interactive UI Tour](#2-module-navigation--interactive-ui-tour)
3. [📋 Master Budget Planning & Dotation Structure](#3-master-budget-planning--dotation-structure)
4. [🔒 Multi-Step Commitment Accounting (Comptabilité des Engagements)](#4-multi-step-commitment-accounting-comptabilit%C3%A9-des-engagements)
5. [🔄 Credit Transfers, Amendments & Supplementary Appropriations](#5-credit-transfers-amendments--supplementary-appropriations)
6. [⏳ Year-End Carryforward & Roll-Over Engine (Report de Crédits N+1)](#6-year-end-carryforward--roll-over-engine-report-de-cr%C3%A9dits-n1)
7. [💡 Deep-Dive Practical Scenarios & Worked Examples](#7-deep-dive-practical-scenarios--worked-examples)
   - [Example 1: Formulating the 2027 Master Budget](#example-1-formulating-the-2027-master-budget)
   - [Example 2: Requisitioning & Committing a Capex Asset](#example-2-requisitioning--committing-a-capex-asset)
   - [Example 3: Executing an Internal Credit Transfer (Virement de Crédit)](#example-3-executing-an-internal-credit-transfer-virement-de-cr%C3%A9dit)
   - [Example 4: Handling an Unplanned Mid-Year Project (The Mining / Donor Contract Case Study)](#example-4-handling-an-unplanned-mid-year-project-the-mining--donor-contract-case-study)
   - [Example 5: Year-End Unconsumed Budget Carryforward](#example-5-year-end-unconsumed-budget-carryforward)
8. [📜 The 5-Stage Public & Institutional Expenditure Chain (Ordonnancement & Mandatement)](#8-the-5-stage-public--institutional-expenditure-chain-ordonnancement--mandatement)
9. [📦 Procurement Planning (PPM), Thresholds & Donor Non-Objection (ANO)](#9-procurement-planning-ppm-thresholds--donor-non-objection-ano)
10. [🤝 Donor Grant Conventions & Multi-Bailleur Co-Financing](#10-donor-grant-conventions--multi-bailleur-co-financing)
11. [🛡️ Role-Based Access Control (RBAC) & Governance Matrix](#11-role-based-access-control-rbac--governance-matrix)
12. [❓ Frequently Asked Questions (FAQ) & Troubleshooting](#12-frequently-asked-questions-faq--troubleshooting)

---

## 1. 🏛️ Executive Overview & Architectural Philosophy

### 1.1 The Golden Triad of Budgetary Governance
In modern enterprise management, healthcare institutions, and industrial corporations operating under **SYSCOHADA**, relying solely on General Ledger accounting means managing by looking in the rearview mirror. When an invoice lands on the Chief Accountant's desk, the statutory obligation has already occurred. 

**LedgerCore's Budget Module** shifts financial control upstream by introducing **Multi-Step Commitment Accounting (*Comptabilité des Engagements*)**, enforcing the classical triad of statutory finance:

```
  ┌─────────────────────────────────┐
  │ 1. ALLOCATION / DOTATION        │  Approved Budget voted by Board / Governance
  │    (Budgets Votés & Rectifiés)  │  Set per Account, Department, and Project
  └────────────────┬────────────────┘
                   │
                   ▼
  ┌─────────────────────────────────┐
  │ 2. COMMITMENT / ENGAGEMENT      │  Purchase Orders, Contracts & Work Orders
  │    (Réservation de Crédits)     │  Locks budget BEFORE contracts are signed
  └────────────────┬────────────────┘
                   │
                   ▼
  ┌─────────────────────────────────┐
  │ 3. LIQUIDATION & PAYMENT        │  Invoice reception, delivery verification,
  │    (Ordonnancement & Règlement) │  General Ledger posting (Class 6/2), Treasury outflow
  └─────────────────────────────────┘
```

> [!NOTE]
> **Unified Single-Ledger Harmony:**  
> In LedgerCore, budget commitments do not float in an isolated spreadsheet. They tie directly to your **General Ledger Chart of Accounts** (SYSCOHADA leaf accounts), your **Cost Centers / Departments**, your **Fixed Asset Register** (for Capex), and your **Maintenance Work Orders** (for repairs).

### 1.2 The Available Budget Equation
At any fraction of a second, the system computes the exact **Net Available Credit (*Disponible Budgétaire Net*)** for every budget line using the formula:

$$\mathbf{Available\ Balance} = (\mathbf{Initial\ Allocation} + \mathbf{Net\ Transfers}) - \mathbf{Committed\ Appropriations} - \mathbf{Actual\ GL\ Postings}$$

Where:
- **Initial Allocation (*Dotation Initiale*)**: Voted budget approved at the beginning of the fiscal period.
- **Net Transfers (*Virements Nets*)**: Algebraic sum of budget transfers received $(+)$ or transferred out $(-)$.
- **Committed Appropriations (*Crédits Engagés*)**: Active commitments in `approved` status reserving funds for pending purchase orders.
- **Actual GL Postings (*Réalisations Comptables*)**: Posted journal entry lines in General Ledger Classes 6 (Expenses) and 2 (Fixed Assets).

---

## 2. 🧭 Module Navigation & Interactive UI Tour

To access the Budget Module, log into LedgerCore and click **Accounting ➔ Budgeting & Commitments** (`/budgeting`) on the left navigation rail.

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 💰 Budgeting & Commitment Accounting (SYSCOHADA / CEMAC)                                📘 User Guide  │
│ Operating & capital expenditure plans, multi-axial commitments, credit transfers, and real-time controls  │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ [📊 Approved Budget: 3,450,000,000] [🔒 Committed: 842,500,000] [💳 Actual: 1,620,300,000] [✅ Net Avail: 987,200,000] │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 📑 Tabs:  [📈 Execution Dashboard]  [📋 Plans & Lines]  [🔒 Commitments]  [🔄 Transfers]  [⏳ Carryforwards]   │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 The Core Interactive Workspace Tabs
| Tab Icon | Tab Title | Primary Function | Primary Users |
| :--- | :--- | :--- | :--- |
| 📈 | **Execution Dashboard** | Real-time visual progress bars, department consumption, budget variance analysis | CFO, General Director, Internal Auditor |
| 📋 | **Plans & Lines** | Setting up annual budget master envelopes, quarterly phasing (T1-T4), spreading curves | CFO, Chief Accountant, Financial Controller |
| 🔒 | **Commitments** | Issuing purchase requisitions (DA), firm purchase orders (BC), availability checks | Procurement Officer, Department Heads, CFO |
| 🔄 | **Transfers & Amendments** | Inter-departmental credit reallocations (*virements*) and supplementary budget decisions | CFO, Budget Committee, Board of Directors |
| ⏳ | **Carryforwards** | Statutory rollover of unconsumed Capex/Opex appropriations from Year $N$ to $N+1$ | Chief Accountant, CFO, Statutory Auditors |
| 📜 | **Payment Orders** | Formal payment orders (*Mandats de Paiement*), Controller Visa, Tax AIR & Warranty retentions | Authorizing Officer, Controller, Treasury |
| 📦 | **Procurement Plans (PPM)**| Multi-year procurement plans, packaging (Lots), Donor No-Objection clearances (ANO) | Procurement Specialist, Project Coordinator |

### 2.2 Dynamic Color-Coded Execution Indicators
The module visually categorizes expenditure levels across all lines and departments:
- 🟢 **Green (0% – 74.9%)**: **Healthy Execution** — Adequate headroom available.
- 🟡 **Amber (75% – 89.9%)**: **Prudent Zone** — Consumption approaching target; require vigilance.
- 🟠 **Orange (90% – 99.9%)**: **Critical Threshold** — Approaching full depletion; requires CFO review.
- 🔴 **Red (100%+)**: **Exhausted / Overspent** — Blocked under strict policy; requires credit transfer or amendment.

---

## 3. 📋 Master Budget Planning & Dotation Structure

### 3.1 Multi-Axial Budget Sections
LedgerCore structures every budget plan across four distinct operational sections:

```
                               ┌────────────────────────────────┐
                               │   ANNUAL MASTER BUDGET PLAN    │
                               └───────────────┬────────────────┘
         ┌─────────────────────┬───────────────┴─────────────────────┬────────────────────┐
         ▼                     ▼                                     ▼                    ▼
┌──────────────────┐  ┌──────────────────┐                 ┌──────────────────┐  ┌──────────────────┐
│ 💼 Operating     │  │ 🏗️ Capital       │                 │ 🛠️ Maintenance   │  │ 💰 Revenue       │
│    (Opex)        │  │    (Capex)       │                 │    (Repairs)     │  │    (Inflows)     │
├──────────────────┤  ├──────────────────┤                 ├──────────────────┤  ├──────────────────┤
│ Class 6 Accounts │  │ Class 2 Accounts │                 │ Work Orders      │  │ Class 7 Accounts │
│ Consumables      │  │ Medical Imaging  │                 │ Biomedical Tests │  │ Patient Fees     │
│ Salaries, Travel │  │ Facilities, Fleet│                 │ Statutory Safety │  │ Donor Subsidies  │
└──────────────────┘  └──────────────────┘                 └──────────────────┘  └──────────────────┘
```

1. 💼 **Operating Budget (Opex - Charges d'Exploitation)**:
   - Targets SYSCOHADA **Class 6** accounts (e.g., `6011` Surgical Consumables, `6051` Water & Electricity, `6221` Travel & Missions).
   - Tracks consumable recurrent supplies and operating costs.
2. 🏗️ **Capital Investment Budget (Capex - Immobilisations)**:
   - Targets SYSCOHADA **Class 2** accounts (e.g., `2411` Biomedical Equipment, `2451` Fleet Vehicles, `2211` Buildings).
   - Integrates directly with the **Fixed Asset Register**, reserving tags and capitalizing upon receipt.
3. 🛠️ **Maintenance Budget (Grosses Réparations & Entretien)**:
   - Targets asset-linked maintenance and servicing costs (`6241` Equipment Servicing, `6243` Biomedical Calibration).
   - Directly links to **CMMS Work Orders** to enforce contract coverage.
4. 💰 **Revenue & Subsidy Budget (Recettes & Produits)**:
   - Targets SYSCOHADA **Class 7** accounts (e.g., `7011` Consultation Fees, `7111` Operating Grants, `7511` Project Contributions).
   - Monitors target collections versus recognized bank inflows.

### 3.2 Periodic Phasing Curves & Spread Profiles
Budget lines can be phased across the four quarters (T1–T4):
- ⚖️ **Equal Quarterly (25% / 25% / 25% / 25%)**: Standard for stable recurrent expenses.
- 📆 **Even Monthly (1/12th per month)**: Ideal for payroll and utility subscriptions.
- ⚡ **Front-Loaded (40% Q1, 30% Q2, 20% Q3, 10% Q4)**: Standard for clinical supply bulk orders and early investments.
- 📈 **Back-Loaded (10% Q1, 20% Q2, 30% Q3, 40% Q4)**: Common for end-of-year renovation works.

### 3.3 Budget Control Policies
When creating or editing a budget line, you assign one of two control policies:
- 🛑 **STRICT BLOCK (`strict`)**: The system mathematically blocks any commitment or requisition that would cause the available balance to drop below zero.
- ⚠️ **WARNING (`warning`)**: The system displays a clear warning modal indicating the overrun amount but permits authorized supervisors to proceed with an audited justification.

---

## 4. 🔒 Multi-Step Commitment Accounting (Comptabilité des Engagements)

### 4.1 The 4-Stage Commitment Lifecycle

```
  ┌────────────────────────────────────────────────────────────────────────┐
  │                      COMMITMENT LIFECYCLE                              │
  └────────────────────────────────────────────────────────────────────────┘
       │
       ▼
  [ 📝 DRAFT ] ──────────► [ ⏳ PENDING APPROVAL ] ────────► [ 🔒 APPROVED / RESERVED ] ─────► [ ✅ LIQUIDATED ]
   Created by clerk          Submitted for sign-off             Credits frozen in budget          Invoice posted to GL
   Can be modified           Balance checked automatically      PO can be dispatched              Commitment closed
```

1. 📝 **Draft (`draft`)**:
   - Initiated by a department assistant or procurement officer.
   - Line items, vendor, estimated cost, and target budget line are recorded. No budget is consumed yet.
2. ⏳ **Pending Approval (`pending_approval`)**:
   - Requisition submitted for departmental sign-off.
   - The engine performs an automated **real-time availability check**. If funds are insufficient under `strict` control, submission is rejected.
3. 🔒 **Approved (`approved`)**:
   - Signed off by the Department Head or Financial Controller.
   - Funds are **statutorily reserved** (*crédits engagés*). This amount is subtracted from the Available Balance, preventing other departments from spending it.
   - The official Purchase Order (`BC-2027-XXXX`) can now be legally issued to the supplier.
4. ✅ **Liquidated (`liquidated`)**:
   - Goods are delivered alongside the supplier's commercial invoice.
   - The accounting department records the General Ledger entry.
   - The commitment is marked liquidated, releasing the temporary reservation as it transitions into an **Actual Expenditure (*Réalisation*)**.

---

## 5. 🔄 Credit Transfers, Amendments & Supplementary Appropriations

Budgets are living financial blueprints. During the course of a fiscal year, business priorities shift, prices fluctuate, and external opportunities arise. LedgerCore supports two mechanisms to alter budgetary appropriations:

```
                                  BUDGET ALTERATIONS
                                          │
                 ┌────────────────────────┴────────────────────────┐
                 ▼                                                 ▼
       [ 🔄 CREDIT TRANSFERS ]                        [ 📈 BUDGET AMENDMENTS ]
       (Virements de Crédits)                         (Décisions Modificatives)
       ──────────────────────                         ─────────────────────────
       • Between existing lines                       • Increases total budget
       • SENDER (-) ➔ RECEIVER (+)                    • Backed by new revenue/contracts
       • Net Total Change = 0                         • Reallocates global envelope
```

### 5.1 Internal Credit Transfers (*Virements de Crédits*)
- Used when a department has surplus funds in one account and faces a deficit in another.
- **Rule of Fungibility:** Sender Line is debited by $(-X)$ and Receiver Line is credited by $(+X)$. The net change to the organization's total approved budget is **strictly zero**.

### 5.2 Budget Amendments & Supplementary Decisions (*Décisions Modificatives*)
- Used when the organization receives new funding, wins an unbudgeted project, or faces extraordinary statutory obligations.
- Increases the overall expenditure ceiling, justified by corresponding newly recognized revenue or grant conventions.

---

## 6. ⏳ Year-End Carryforward & Roll-Over Engine (Report de Crédits N+1)

### 6.1 Regulatory Context & Business Need
In both corporate and public accounting, projects spanning across December 31st often have unconsumed investment credits (*crédits d'investissement non consommés*) or committed purchase orders awaiting delivery in January.

Instead of losing these appropriations or artificially re-entering duplicate lines, LedgerCore provides an automated **Statutory Carryforward Engine (*Moteur de Report des Crédits*)**:

```
 ┌────────────────────────────────────────────────────────┐
 │   FISCAL YEAR N (2026)                                 │
 │   Line: Modernization of Intensive Care Unit (Capex)   │
 │   Approved: 80,000,000 XAF                             │
 │   Spent/Committed: 62,000,000 XAF                      │
 │   Remaining Unconsumed: 18,000,000 XAF                 │
 └───────────────────────────┬────────────────────────────┘
                             │
                             ▼  [ ⏳ Execute Carryforward ]
 ┌────────────────────────────────────────────────────────┐
 │   FISCAL YEAR N+1 (2027)                               │
 │   Target Line: Modernization of ICU (Capex)            │
 │   Carried Forward (N-1): +18,000,000 XAF               │
 │   New Adjusted Budget = Initial + 18,000,000 XAF       │
 └────────────────────────────────────────────────────────┘
```

### 6.2 Step-by-Step Procedure: Executing a Carryforward
1. 📂 Navigate to **Accounting ➔ Budgeting & Commitments**.
2. ⏳ Click the **Carryforwards** tab.
3. 🚀 Click the **Carryforward Unconsumed Budget** button.
4. 🎯 Select the **Destination Fiscal Year (N+1)** and the **Target Budget Plan**.
5. 🔍 The system lists all lines from Year $N$ with positive unconsumed available balance.
6. ✍️ Review or adjust the proposed carryforward amounts.
7. 💾 Click **Execute Carryforward**. The engine updates Year $N+1$ and records an indelible audit entry.

---

## 7. 💡 Deep-Dive Practical Scenarios & Worked Examples

---

### Example 1: Formulating the 2027 Master Budget

#### 🎯 Context & Objective
The hospital Board has approved the **2027 Annual Operating & Investment Budget** totaling **2,500,000,000 XAF**. As the Financial Controller, you must establish the master plan and endow key departmental budget lines.

#### 📝 Step-by-Step Execution
1. In the Budget module, click **New Budget Plan**.
2. Fill the modal parameters:
   - **Plan Name:** `Budget Principal d'Exploitation & Investissement 2027`
   - **Fiscal Year:** `2027`
   - **Status:** `approved`
   - **Notes:** `Adopté en Conseil d'Administration le 15 Décembre 2026.`
3. Click **Save Budget Plan**.
4. Click **Add Budget Line** to create initial dotations:
   - **Line 1 (Opex - Surgical Reagents):**
     - Section: `Operating (Opex)`
     - Account: `6011 - Matières premières et fournitures liées`
     - Department: `Bloc Opératoire & Chirurgie`
     - Initial Allocation: `150,000,000 XAF`
     - Policy: `STRICT BLOCK`
   - **Line 2 (Capex - Diagnostic Imaging):**
     - Section: `Capital Investment (Capex)`
     - Account: `2411 - Matériel médical et chirurgical`
     - Department: `Imagerie Médicale & Radiologie`
     - Initial Allocation: `350,000,000 XAF`
     - Policy: `STRICT BLOCK`

---

### Example 2: Requisitioning & Committing a Capex Asset

#### 🎯 Context & Objective
The Head of Radiology requests a **High-Resolution Color Ultrasound Machine** estimated at **38,500,000 XAF** from supplier *Siemens Healthineers*. You must create a commitment, verify availability, and obtain CFO approval.

#### 📝 Step-by-Step Execution
1. Navigate to the **Commitments** tab.
2. Click **New Commitment**.
3. Fill the requisition form:
   - **Budget Line:** Select `2411 - Matériel médical (Imagerie Médicale)`
   - **Vendor:** `Siemens Healthineers SARL`
   - **Object / Description:** `Acquisition Échographe Doppler couleur haute définition service Radiologie`
   - **Committed Amount:** `38,500,000 XAF`
   - **Reference / Purchase Requisition:** `DA-2027-0104`
4. Click **Check Availability**:
   - *System Response:* `🟢 Available Budget: 350,000,000 XAF. Sufficient headroom. Request is compliant.`
5. Click **Create Commitment**. Status is set to `pending_approval`.
6. As CFO, review the requisition and click **Approve**:
   - The commitment status transitions to `approved`.
   - The available balance of line `2411` automatically decreases from `350,000,000 XAF` to `311,500,000 XAF`.

---

### Example 3: Executing an Internal Credit Transfer (Virement de Crédit)

#### 🎯 Context & Objective
In April 2027, an unexpected price increase on specialized surgical suture kits threatens to exhaust the Operating Room's consumable budget. Meanwhile, the General Administration travel line has an unused surplus of **12,000,000 XAF**.

#### 📝 Step-by-Step Execution
1. Navigate to the **Credit Transfers** tab.
2. Click **New Credit Transfer**.
3. Fill the transfer voucher:
   - **Transfer Voucher Reference:** `VIR-2027-004`
   - **Effective Date:** `2027-04-18`
   - **Source Line (Sender - Dédotée):** `6221 - Voyages et Déplacements (Direction Générale)`
     - *Current Available Balance:* `18,500,000 XAF`
   - **Destination Line (Receiver - Abondée):** `6011 - Consommables Chirurgicaux (Bloc Opératoire)`
     - *Current Available Balance:* `2,100,000 XAF`
   - **Transfer Amount:** `10,000,000 XAF`
   - **Justification / Board Resolution:** `Régulation suite à hausse des tarifs fournisseurs sur fils de suture (Note DG/FIN/2027-042).`
4. Click **Execute Transfer**.
   - *Instant Result:*
     - Line `6221` allocation decreases by `-10,000,000 XAF` (New Available: `8,500,000 XAF`).
     - Line `6011` allocation increases by `+10,000,000 XAF` (New Available: `12,100,000 XAF`).
     - Total organization budget remains exactly balanced with zero net variance.

---

### Example 4: Handling an Unplanned Mid-Year Project (The Mining / Donor Contract Case Study)

#### 🎯 The Business Challenge
> *“Imagine that the budget for 2027 has been finalized and approved in December 2026. Then in July 2027, a mining enterprise or donor awards our organization a major health and safety contract worth 450,000,000 XAF. This project was completely unknown during the initial 2027 budget planning. How does LedgerCore handle this situation seamlessly?”*

#### 💡 The Professional Solution: 4-Step Resolution Architecture

```
 ┌────────────────────────────────────────────────────────────────────────┐
 │            MID-YEAR UNPLANNED CONTRACT WORKFLOW                        │
 └────────────────────────────────────────────────────────────────────────┘
     │
     ▼
 1. REGISTER THE CONTRACT & COST CENTER
    • Open Cost Center: "Projet Minier Bauxite — Base Sanitaire"
    • Link Donor/Client Convention & Financing Terms
     │
     ▼
 2. ISSUE A BUDGET AMENDMENT (DÉCISION MODIFICATIVE)
    • Pass Supplementary Budget Act: DM-2027-001 (+450,000,000 XAF)
    • Recognize Projected Revenue: Account 7511 / 7061 (+450,000,000 XAF)
     │
     ▼
 3. ENDOW PROJECT-SPECIFIC EXPENDITURE LINES
    • Capex: Specialized 4x4 Mobile Clinic (2451) -> 85,000,000 XAF
    • Opex: Mining Site Medical Supplies (6011) -> 120,000,000 XAF
    • Staff: Emergency Paramedic Contracts (6611) -> 145,000,000 XAF
    • Contingency / Overhead (6581) -> 100,000,000 XAF
     │
     ▼
 4. ENGAGE & EXECUTE WITH STRICT SEGREGATION
    • All requisitions tag the Project Cost Center
    • Real-time financial reports show 100% standalone accountability
```

#### 🛠️ Step-by-Step System Execution

##### Step 4.1: Register the Cost Center
1. Navigate to **Accounting ➔ Chart of Accounts ➔ Analytical Cost Centers**.
2. Click **+ New Cost Center**.
3. Name: `PROJ-MINE-2027 - Base Sanitaire Bauxite & Chantiers`.
4. Domain: `Industrial & Environmental Health`.

##### Step 4.2: Create the Supplementary Budget Decision
1. Navigate to **Accounting ➔ Budgeting & Commitments ➔ Transfers & Amendments**.
2. Click **New Credit Transfer / Amendment**.
3. Set type to **Budget Amendment / Decision Modificative (Rallonge Budgétaire)**.
4. Input Reference: `DM-2027-001 (Avenant Projet Minier)`.
5. Enter Amount: `450,000,000 XAF`.
6. Attach Justification: `Contrat de prestation médicale et de prise en charge sanitaire N° CTR-MIN-2027 signé le 02 Juillet 2027.`

##### Step 4.3: Create the Project Budget Lines
Under the **Plans & Lines** tab, click **Add Budget Line** and create the dedicated lines tagged to program `PROJ-MINE-2027`:
- 🏗️ **Line A (Capex):** Account `2451 - Matériel de transport (Clinique Mobile 4x4)` — `85,000,000 XAF`
- 💼 **Line B (Opex):** Account `6011 - Réactifs et consommables de traumatologie` — `120,000,000 XAF`
- 👨‍⚕️ **Line C (Staff):** Account `6611 - Personnel contractuel médical de site` — `145,000,000 XAF`
- 🛡️ **Line D (Overhead):** Account `6581 - Frais généraux et logistique de chantier` — `100,000,000 XAF`

##### Step 4.4: Execution & Isolated Donor Reporting
- Project managers can now issue purchase requisitions strictly against these lines.
- The hospital's baseline core operational budget is **never contaminated** or compromised.
- Financial reports can be filtered by `Program: PROJ-MINE-2027` at any moment to produce the donor liquidation statement.

---

### Example 5: Year-End Unconsumed Budget Carryforward

#### 🎯 Context & Objective
On December 31, 2026, the **Modernization of Neonatal Unit (Capex)** budget line had an approved dotation of **60,000,000 XAF**. Due to international maritime shipping delays, only **38,000,000 XAF** of equipment arrived before year-end. An unconsumed balance of **22,000,000 XAF** remains. You must carry this forward to the **2027 Budget**.

#### 📝 Step-by-Step Execution
1. Navigate to the **Carryforwards** tab.
2. Click **Carryforward Unconsumed Budget**.
3. In the modal:
   - **Source Budget Plan:** `Budget Annuel 2026`
   - **Destination Fiscal Year (N+1):** `2027`
   - **Target Budget Plan:** `Budget Annuel d'Exploitation & Investissement 2027`
4. The system presents the line:
   - *Line:* `2411 - Matériel Médical (Service Néonatalogie)`
   - *Unconsumed Available Balance:* `22,000,000 XAF`
   - *Proposed Carryforward Amount:* `22,000,000 XAF`
5. Click **Execute Carryforward**.
6. Navigate to the **Plans & Lines** tab for Fiscal Year `2027`:
   - Inspect the Neonatal line.
   - Column **Carried Forward (N-1)** displays: `+22,000,000 XAF`.
   - Column **Current Budget (Adjusted)** displays: `Initial 2027 Dotation + 22,000,000 XAF`.
   - The delayed incubator shipment can now be cleared and liquidated in 2027 without exceeding budget limits.

---

## 8. 📜 The 5-Stage Public & Institutional Expenditure Chain (Ordonnancement & Mandatement)

LedgerCore fully digitizes the **Five Statutory Milestones of Expenditure (*La Chaîne Complète de la Dépense*)** as codified under CEMAC/UEMOA Public Finance Directives and International Public Sector Accounting Standards (IPSAS):

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                        THE 5-STAGE STATUTORY EXPENDITURE CHAIN                                         │
├─────────────────┬─────────────────┬─────────────────┬─────────────────┬────────────────────────────────┤
│ 1. ENGAGEMENT   │ 2. LIQUIDATION  │ 3. ORDONNANCEMENT│ 4. VISA         │ 5. RÈGLEMENT                   │
│ (Commitment)    │ (Inspection PV) │ (Payment Order) │ (Clearance)     │ (Disbursement)                 │
├─────────────────┼─────────────────┼─────────────────┼─────────────────┼────────────────────────────────┤
│ • PR / PO       │ • Delivery Note │ • Mandat de     │ • Financial     │ • Bank Transfer / Check        │
│ • Vendor choice │ • Works accept. │   Paiement      │   Controller    │ • Statutory Tax (AIR) deducted │
│ • Budget frozen │ • Invoice audit │ • Gross Amount  │   Audit         │ • Warranty Retention deducted  │
│ • Strict control│ • Conformity PV │ • Net calculated│ • Bon à Payer   │ • Treasury Balance debited     │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┴────────────────────────────────┘
```

### 8.1 Detailed Step-by-Step Breakdown of the 5 Stages

#### 1️⃣ Stage 1: Engagement (Legal Obligation & Budget Reservation)
- Department raises a Purchase Requisition (`DA-2027-XXXX`), verified against budget line headroom.
- Upon approval, converts into a firm Purchase Order (`BC-2027-XXXX`).
- *System Effect:* Budget Available Balance decreases immediately; funds are ring-fenced.

#### 2️⃣ Stage 2: Liquidation (Verification of Service Rendered & Technical Reception)
- Supplier delivers equipment or completes civil works on site.
- An official **Acceptance Committee (*Commission de Réception*)** inspects goods and files an Acceptance Report (*Procès-Verbal de Réception / PV*).
- The certified invoice amount cannot exceed the firm commitment ceiling.

#### 3️⃣ Stage 3: Ordonnancement (Issuing the Mandat de Paiement)
- The Authorizing Officer (*Ordonnateur*) issues the statutory **Payment Order (*Mandat de Paiement*)**.
- The system automatically breaks down the gross invoice into statutory components:
  $$\mathbf{Net\ Payable\ to\ Vendor} = \mathbf{Gross\ Invoice} - \mathbf{Tax\ Withholding\ (AIR)} - \mathbf{Warranty\ Retention} - \mathbf{Penalties}$$

#### 4️⃣ Stage 4: Visa du Contrôleur Financier (Prior Statutory Audit)
- Independent Financial Controller examines:
  - 1. Legitimacy of the original commitment and procurement method.
  - 2. Exact arithmetic calculation of statutory tax retentions.
  - 3. Authenticity of delivery notes and certified PVs.
- *Outcome:* The Controller grants the **Visa (Bon à Payer)** or issues a documented refusal with remedial requirements.

#### 5️⃣ Stage 5: Règlement & Décaissement (Treasury Settlement)
- Transmitted to the Chief Accountant / Treasury Desk.
- Treasury officer selects the paying bank account and payment method (Bank Wire Transfer, Certified Check).
- *Accounting Effect:* LedgerCore executes the payment entry, credit Bank (`5211`), debit Supplier (`4011`), and holds the Warranty Retention in escrow account `4017` until final acceptance.

---

## 9. 📦 Procurement Planning (PPM), Thresholds & Donor Non-Objection (ANO)

In large-scale healthcare systems, mining projects, and donor-funded programs, procurement cannot happen ad-hoc. LedgerCore embeds a dedicated **Procurement Planning & Milestone Engine (*Plan de Passation des Marchés - PPM*)**:

```
                              PROCUREMENT PLAN (PPM) LIFECYCLE
                                             │
      ┌──────────────────────────────────────┴──────────────────────────────────────┐
      ▼                                                                             ▼
[ 📋 PPM Preparation & Budget Tagging ]                             [ ⚖️ Regulatory Threshold Check ]
• Consolidated list of packages / lots                               • Goods: RFQ < 25M | Open Tender > 25M
• Cost estimation and source budget line                             • Works: RFQ < 50M | Open Tender > 50M
      │                                                                             │
      └──────────────────────────────────────┬──────────────────────────────────────┘
                                             │
                                             ▼
                             [ 🕊️ Donor Clearance (ANO) ]
                             • Prior Review for high-value lots
                             • Official Non-Objection Notice recorded
                                             │
                                             ▼
                             [ 🏁 Tender ➔ Award ➔ PO ]
                             • Launch Tender ➔ Evaluate Bids ➔ Award
                             • Generates firm commitment automatically
```

### 9.1 Procurement Methods Supported
| Method Code | Method Title | Description | Standard Threshold |
| :--- | :--- | :--- | :--- |
| **AON** | National Competitive Bidding | Open public competitive tender in national gazettes | Above statutory threshold |
| **AOI** | International Competitive Bidding | Global tender for high-tech biomedical or plant equipment | Multi-billion projects |
| **DC / RFQ** | Request for Quotations | Comparison of at least 3 sealed competitive price bids | Below tender ceiling |
| **ED** | Direct Contracting (*Gré à Gré*) | Single-source negotiated contract (exceptional emergency) | Requires Board / Ministry Visa |
| **SFQ / QCBS**| Quality & Cost Selection | Consultancy firms, architectural engineering, statutory audit | Technical + Financial scoring |

---

## 10. 🤝 Donor Grant Conventions & Multi-Bailleur Co-Financing

When operating with international partners (World Bank / IDA, Global Fund, USAID, AfDB, European Union, or Corporate Social Responsibility / Mining Conventions), projects frequently involve **Co-Financing (*Co-financement*)**:

- **Donor Share (Part Bailleur):** 80% funded via international grant convention.
- **National / Counterpart Share (Part État / Entreprise):** 20% funded via local treasury.

LedgerCore's analytical derivation engine tags every budget line and commitment with the exact financing convention (`CONV-IDA-6890`, `FM-PALU-2027`), automatically generating donor financial monitoring reports (IFR / FMR) with zero manual consolidation.

---

## 11. 🛡️ Role-Based Access Control (RBAC) & Governance Matrix

LedgerCore strictly enforces the **Four-Eyes Principle (*Principe des Quatre Yeux*)** and statutory segregation of duties:

| Role Title | View Dashboards | Create Requisitions | Approve Commitments | Liquidate Invoices | Issue Mandats | Grant Visa | Disburse Treasury |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 👑 **Chief Financial Officer (CFO)** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| 🧑‍⚖️ **Financial Controller** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| 🧑‍💼 **Chief Accountant** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| 📝 **Accounting Clerk** | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| 🏥 **Department Head / Ward Chief**| ✅ (Own Dept) | ✅ | ⚠️ (Limit: <5M) | ❌ | ❌ | ❌ | ❌ |
| 🔬 **Biomedical & Asset Manager** | ✅ (Assets) | ✅ | ⚠️ (Capex <10M)| ❌ | ❌ | ❌ | ❌ |
| 🕵️ **Internal Auditor / Board Member**| ✅ (Read-Only) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 12. ❓ Frequently Asked Questions (FAQ) & Troubleshooting

### Q1: What happens if an emergency expenditure must be approved, but the budget line has zero balance?
> **Answer:**  
> If the line is configured with policy `warning`, authorized managers may approve the commitment after inputting a mandatory audit rationale. If the line is configured with `strict`, the engine will block the approval. You must first execute a **Credit Transfer (*Virement de Crédit*)** from a line with available surplus, or pass a **Budget Amendment (*Décision Modificative*)**.

### Q2: Does a Commitment create entries in the General Ledger (Journal Entries)?
> **Answer:**  
> **No.** A commitment is a budgetary credit reservation (*engagement juridique / réservation de crédits*). It does not affect Balance Sheet accounts or Cash/Bank accounts. The General Ledger entry is posted during the **Liquidation / Mandatement** phase when physical goods are received and the vendor invoice is validated.

### Q3: Can a liquidated commitment be cancelled?
> **Answer:**  
> Once a commitment is liquidated into a posted General Ledger journal entry, it cannot be arbitrarily deleted. To cancel the transaction, the corresponding GL journal entry must be reversed (*contre-passation*), which re-opens the commitment line or credit balance with full audit traceability.

### Q4: How does Capex commitment link to the Asset Register?
> **Answer:**  
> When creating a commitment on a Class 2 account (e.g. `2411`), you can select **Linked Asset Tag** or pre-reserve a new asset code. Once liquidated, LedgerCore automatically links the acquisition invoice to the asset's historical acquisition cost, ensuring that **Asset Register NBV ties to the General Ledger with 0 variance**.

### Q5: How do Warranty Retentions (*Retenues de Garantie*) work in payment orders?
> **Answer:**  
> In public works and equipment procurement, 5% to 10% of the invoice is withheld as guarantee against defects. LedgerCore deducts this amount from the net payment to the contractor and credits account `4017 - Fournisseurs, Retenues de garantie`. After the one-year warranty expiration and technical clearance, a final release payment order is issued to clear account `4017`.

---

*LedgerCore Health & Enterprise Financial Suite — Certified Dual-Standard OHADA / IFRS.*  
*Official Documentation & In-App Operational Manual.*
