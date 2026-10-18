# LedgerCore Health — Role Guide: System Administrator
**System Deployment, RBAC Provisioning, Database Maintenance & Cryptographic Security**

---

## 1. System Deployment & Environment Setup

LedgerCore Health operates as a high-performance decoupled architecture:
- **Backend API:** Node.js (Express, ES Modules, MySQL2/MariaDB connection pool) on port `4700`.
- **Frontend UI:** Python 3.10+ (NiceGUI, Quasar/Vue3, TailwindCSS) on port `8700`.
- **Database:** MariaDB 10.5+ / MySQL 8.0 on port `3306` (Database: `ledgercore`).

### Starting the Services (Windows / Production Server):
1. **Database:** Ensure MariaDB / MySQL is running (e.g., XAMPP Control Panel).
2. **Backend Service:**
   ```powershell
   cd "C:\Core Accounting and asset\backend"
   npm start
   ```
   API health check: `http://127.0.0.1:4700/api/health`
3. **Frontend Service:**
   ```powershell
   cd "C:\Core Accounting and asset\frontend"
   python main.py
   ```
   Access Web UI: `http://127.0.0.1:8700`

---

## 2. User Provisioning & Granular RBAC Permissions

Under **Administration -> Users & Permissions**:
1. Click **+ Add User**.
2. Enter email, full name, phone number, and default language (`en` or `fr`).
3. Set the initial password and force password change on first sign-in.
4. Assign one or multiple roles:
   - `admin`: System-wide configuration.
   - `cfo`: Full financial posting, period close, depreciation, and reporting.
   - `accountant`: Voucher preparation, lettrage, bank reconciliation.
   - `asset_manager`: Asset register, maintenance scheduling, physical inventory.
   - `biomed_tech`: Work order execution, IEC 60601 testing, calibration logging.
   - `services_tech`: Errands, shopping lists, vehicle fleet logs.
   - `ward_head`: Departmental asset view and breakdown ticket submission.

---

## 3. Organization Settings & Posting Rules

Under **Administration -> Organization Settings**:
- **Functional Currency:** Default `XAF` (Central African CFA franc).
- **Accounting Frameworks:** Select `OHADA`, `IFRS`, or `Both` (Dual-Standard).
- **Posting Length (Longueur des Comptes):** Set statutory account digits (4, 6, or 8 digits). Note: Once transactions exist, posting length is permanently locked to preserve historical audit integrity.
- **Suspense Account (*Compte d'Attente*):** Default `471100` for unclassified banking receipts awaiting allocation.

---

## 4. Cryptographic Seal Verification & Audit Forensics

LedgerCore incorporates an immutable **SHA-256 blockchain-style seal** on journal entries:
- Every posted entry hashes the previous entry's hash, timestamp, user ID, account lines, and monetary amounts.
- Under **Reporting -> Audit Seal Verification**, run the integrity scanner:
  - If any row in the `journal_entries` or `journal_lines` database table was altered outside the application (e.g., direct SQL injection or manual database update), the cryptographic verification fails immediately with the exact tampered row number highlighted.

---

## 5. Automated Database Backup & Recovery

### Automated Daily Dump (PowerShell Script):
```powershell
$Date = Get-Date -Format "yyyy-MM-dd_HH-mm"
$BackupFile = "C:\Backups\ledgercore_backup_$Date.sql"
mysqldump.exe -u root -p"your_password" --single-transaction --quick --routines --triggers ledgercore > $BackupFile
```

### Restoration Protocol:
```powershell
mysql.exe -u root -p"your_password" ledgercore < "C:\Backups\ledgercore_backup_2026-10-18.sql"
```
