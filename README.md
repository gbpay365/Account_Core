# LedgerCore Health

Hospital core accounting and asset management for **TSSF Shisong SOA** (Catholic Hospital Shisong): one SYSCOHADA ledger, OHADA and IFRS presentations from the same postings, and a biomedical / facility / fleet register that ties to the general ledger. The interface is English and French — switch language on the sign-in screen or in the header.

## How to start (for testing)

XAMPP MariaDB must be running on `127.0.0.1:3306` with the `ledgercore` database already migrated and seeded.

**1. API** (from `backend`)

```
npm start
```

Listens on [http://127.0.0.1:4700](http://127.0.0.1:4700). Health check: [http://127.0.0.1:4700/api/health](http://127.0.0.1:4700/api/health).

**2. User interface** (from `frontend`, in a second terminal)

```
python main.py
```

Open [http://127.0.0.1:8700](http://127.0.0.1:8700).

If either process is not already running, start it as above. Both are required: the NiceGUI front end calls the Node API.

## Demonstration accounts

Every account uses the password **`Ledger@2026`**. Sign in from the login page, or click a demonstration account to fill the form.

| Role | Email | What they can do |
| --- | --- | --- |
| System administrator | `admin@ledgercore.health` | Everything, including users and the action history |
| CFO / Chief accountant | `grace.ntamack@hgy.cm` | Post journals, close periods, post depreciation, read statements |
| Accounting clerk | `amina.bakari@hgy.cm` | Capture drafts; cannot post or close |
| Asset manager | `fatou.diallo@hgy.cm` | Register assets, schedule maintenance, raise disposals |
| Biomedical technician | `samuel.eyenga@hgy.cm` | Execute work orders, file calibration and IEC 60601 tests |
| General services technician | `derick.nji@hgy.cm` | Run errands and shopping lists; execute assigned work orders; no register, calibration, or reports |
| Ward head | `mensah.kouassi@hgy.cm` | View assigned assets, raise a breakdown request |

Start with the **CFO** to see the full accounting and reporting spine, then the **technician** for the mobile-style worklist.

## What to exercise

1. **Dashboard** — year-to-date result, asset NBV, open work, overdue calibration.
2. **Chart of accounts** — SYSCOHADA classes 1–9 with IFRS mapping on each postable account.
3. **Journal entries** — clerk captures a balanced draft; CFO posts it. Unbalanced and heading-account postings are refused.
4. **General ledger / trial balance** — running balance on 521, trial balance that balances.
5. **Periods and close** — September 2026 is open; January–August are closed. The close checklist blocks lock until tasks are done.
6. **Asset register** — filter by domain, open an MRI or ventilator, print its QR tag, move custody.
7. **Work orders** — ward head raises a request; asset manager approves/assigns; technician starts, costs parts, completes; manager verifies.
8. **Errands / shopping list** — sign in as Derick (`derick.nji@hgy.cm`); start a purchase run, tick shopping-list items, complete the garage trip. Fatou assigns; Derick cannot open the register or raise a PO.
9. **Calibration / safety** — a failed calibration quarantines the device; a pass lifts the restriction.
10. **Depreciation** — simulate September (nothing left to charge if already posted for Jan–Aug), inspect a posted run’s OHADA vs IFRS delta.
11. **Financial statements** — Bilan / Compte de résultat / TAFIRE, then flip to IFRS SOFP / P&L / cash flow / SOCE, then the dual-standard bridge (OHADA result + IFRS-only deltas = IFRS profit).
12. **Asset reports** — register by category, register-to-GL reconciliation (zero variance), compliance coverage, cost of ownership.

## Rebuild the database (only if you need a clean slate)

From `backend`, with XAMPP running:

```
npm run reset
```

That drops, remigrates and reseeds TSSF Shisong SOA. Then:

```
npm run verify
npm run smoke
```

`verify` checks the ledger and statements. `smoke` exercises the running API the way the UI will.

## Stack

- Front end: Python / NiceGUI on port 8700
- API: Node.js / Express on port 4700
- Database: MariaDB via XAMPP (`ledgercore`)
