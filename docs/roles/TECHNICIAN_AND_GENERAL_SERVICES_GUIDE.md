# LedgerCore Health — Role Guide: Technicians & General Services
**Field Execution, Work Orders, Errand Purchasing & Vehicle Fleet Dispatch**

---

![Biomedical Asset Lifecycle](../images/03_biomedical_asset_lifecycle.jpg)
*Figure 1: Medical Equipment Lifecycle & Field Service Engineering — From Breakdown Triage to Mobile QR Tag Verification, Spare Parts Logging, and Supervisor Sign-Off.*

---

## 1. Role Scope & Primary Responsibilities
This guide serves both **Biomedical Engineering Technicians** and **General Services & Logistics Officers**:
- 📱 Managing daily field work orders via mobile smartphone or tablet.
- ⏱️ Logging repair labor hours, diagnostic notes, and spare parts consumed.
- 🛒 Executing hospital purchase errands and warehouse shopping lists.
- 🚗 Recording vehicle trip logs, fuel consumption, and emergency generator maintenance.

---

## 2. Step-by-Step Procedure: Using the Mobile Technician Worklist

![Work Orders Queue Screen](../images/screenshot_work_orders.png)
*Figure 2: Clinical Work Orders Queue — Reviewing Tasks by Urgency, Target Location, and Equipment Model.*

When working in clinical wards, surgical theatres, workshops, or utility plant rooms, use the mobile-optimized interface:

1. 📱 **Sign In on Mobile Device:** Log in on your smartphone or tablet (Demo: `samuel.eyenga@hgy.cm` for biomedical or `derick.nji@hgy.cm` for general services).
2. 📋 **Open Today's Worklist:** The home screen immediately displays **My Worklist Today**.
3. ▶️ **Starting a Task:**
   - Tap on the assigned work order (e.g., `WO-2026-0042: Repair operating light in Theatre 2`).
   - Tap **Start Job**. The system records the start timestamp.
4. 📷 **Scanning Asset QR Code:**
   - Tap the **Scan QR Tag** camera icon on your device.
   - Point at the sticker on the equipment chassis to immediately verify serial number, warranty status, and past repair history.
5. 🔩 **Logging Spare Parts Consumed:**
   - Under **Parts Used**, tap **+ Add Part**.
   - Select the part from warehouse inventory (e.g., `Halogen Bulb 24V 50W`, quantity: `2`).
   - The system automatically debits warehouse inventory and assigns the cost to the department.
6. ✅ **Completing the Job:**
   - Enter your technical resolution notes (e.g., `Replaced burnt lamp, cleaned reflector, verified lux output at 100,000 lux`).
   - Have the ward nurse or head doctor sign on your touchscreen.
   - Tap **Complete Job**.

---

## 3. Step-by-Step Procedure: Electrical Safety Testing & Calibration Tracking

![Biomedical Electrical Safety & Calibration Dashboard](../images/screenshot_compliance.png)
*Figure 3: Electrical Safety (IEC 60601-1) Testing Workspace — Recording Protective Earth Resistance and Earth Leakage Values.*

When servicing or commissioning electromedical equipment:
1. 🔌 Connect the equipment to an electrical safety analyzer (e.g., Fluke ESA612 or Rigel 288+).
2. ⚡ Record the measured values into the safety record:
   - Protective Earth Resistance ($\le 0.2\ \Omega$).
   - Chassis & Earth Leakage Current ($\le 500\ \mu\text{A}$).
3. 🛑 If values exceed regulatory tolerances, the device is automatically marked **Quarantined** and cannot be assigned to clinical wards.

---

## 4. Step-by-Step Procedure: General Services, Errands & Shopping Lists

For facility technicians, drivers, and procurement officers:

1. 🔑 **Log In:** Log in with your logistics account (Demo: `derick.nji@hgy.cm` / `Ledger@2026`).
2. 🛒 **Navigate to Errands:** Go to **General Services -> Shopping Lists** or **Errands** (`/shopping-lists`).
3. 🛍️ **Executing a Purchase Run:**
   - Open the assigned shopping run (e.g., `City Central Pharmacy & Regional Depot Run`).
   - View items required by each hospital department.
   - As you acquire each item, check the **Purchased** box and enter the actual price paid.
   - Tap **Attach Receipt** to snap a photo of the cash receipt or delivery note using your phone camera.
4. 🚗 **Trip & Vehicle Dispatch:**
   - Under **General Services -> Vehicle Fleet**, select the vehicle (e.g., `Toyota Hilux Ambulance 4x4`).
   - Enter departure odometer reading, destination, purpose, and fuel dispensed.
   - On return, enter the closing odometer reading to calculate fuel consumption per kilometer.

---

## 5. Key Rules for Field Staff
> [!TIP]
> - 📷 Always scan the QR code before touching equipment to ensure you are servicing the correct machine.
> - 🛑 Never return quarantined equipment to patient service until the Biomedical Manager has cleared the safety certificate.
> - 🧾 Always photograph paper receipts immediately during errand runs to prevent lost expense vouchers.
