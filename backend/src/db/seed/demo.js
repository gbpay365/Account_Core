import bcrypt from 'bcryptjs';
import { money } from '../../utils/money.js';
import { toISO, addMonths, addDays, daysInMonth, compare } from '../../utils/dates.js';
import { createJournalEntry, nextSequence } from '../../services/ledger.service.js';
import { registerAsset, capitalizeAsset, openingAccumulated, refreshComplianceFlags, rollUpMaintenanceCost } from '../../services/asset.service.js';
import { createRun, postRun } from '../../services/depreciation-run.service.js';
import { ensureDefaultKinds } from '../../services/errand.service.js';
import { DEMO_ASSETS, DEMO_COST_CENTERS, DEMO_LOCATIONS, DEMO_SUPPLIERS, DEMO_USERS } from './data/demo-assets.js';

const DEMO_PASSWORD = 'Ledger@2026';
const OPENING_DATE = '2026-01-01';
const CUTOVER = '2025-12-31';

/**
 * Allocates `total` across weighted buckets, giving the remainder to the last
 * one so the parts always add back to the total to the centime.
 */
function split2(total, buckets) {
  let allocated = 0;
  return buckets.map(([code, weight, label], i) => {
    const amount = i === buckets.length - 1 ? money(total - allocated) : money(total * weight);
    allocated = money(allocated + amount);
    return [code, amount, label];
  });
}

/** Deterministic pseudo-random so every seed produces the same demo numbers. */
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

export async function seedDemo(tx, ctx, log) {
  const { orgId, accountId, catId, periodId } = ctx;
  const A = (code) => accountId.get(code);

  // --- cost centres (wards / departments as cost centres, SRS 2.5) ---------
  const ccId = new Map();
  for (const [code, name, nameEn, type] of DEMO_COST_CENTERS) {
    const res = await tx.query(
      `INSERT INTO cost_centers (org_id, code, name, name_en, cc_type) VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), name_en=VALUES(name_en)`,
      [orgId, code, name, nameEn, type]
    );
    let id = res.insertId;
    if (!id) {
      const existing = await tx.queryOne('SELECT id FROM cost_centers WHERE org_id = ? AND code = ?', [orgId, code]);
      id = existing?.id;
    }
    ccId.set(code, id);
  }

  // --- locations -------------------------------------------------------------
  const locId = new Map();
  for (const [code, name, type, parent, cc] of DEMO_LOCATIONS) {
    const res = await tx.query(
      `INSERT INTO asset_locations (org_id, code, name, location_type, parent_id, cost_center_id) VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE name=VALUES(name)`,
      [orgId, code, name, type, parent ? locId.get(parent) : null, cc ? ccId.get(cc) : null]
    );
    let id = res.insertId;
    if (!id) {
      const existing = await tx.queryOne('SELECT id FROM asset_locations WHERE org_id = ? AND code = ?', [orgId, code]);
      id = existing?.id;
    }
    locId.set(code, id);
  }

  // --- users ---------------------------------------------------------------
  const roleRows = await tx.query('SELECT id, code FROM roles');
  const roleId = new Map(roleRows.map((r) => [r.code, r.id]));
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const userId = new Map();
  for (const [email, fullName, role, jobTitle, cc, isTech, rate] of DEMO_USERS) {
    const res = await tx.query(
      `INSERT INTO users (org_id, email, password_hash, full_name, job_title, role_id, cost_center_id, locale, is_technician, hourly_rate)
       VALUES (?,?,?,?,?,?,?,'fr',?,?)
       ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role_id=VALUES(role_id), cost_center_id=VALUES(cost_center_id)`,
      [orgId, email, hash, fullName, jobTitle, roleId.get(role), ccId.get(cc) ?? null, isTech, rate]
    );
    let id = res.insertId;
    if (!id) {
      const existing = await tx.queryOne('SELECT id FROM users WHERE email = ?', [email]);
      id = existing?.id;
    }
    userId.set(email, id);
  }
  const admin = { id: userId.get('admin@ledgercore.health'), permissions: new Set(['journal.post_closed']) };
  const assetMgr = userId.get('fatou.diallo@hgy.cm');
  const techs = ['samuel.eyenga@hgy.cm', 'pierre.kamga@hgy.cm', 'andre.fotso@hgy.cm'].map((e) => userId.get(e));

  for (const [cc, email] of [['REA', 'mensah.kouassi@hgy.cm'], ['IMG', 'esther.nkodo@hgy.cm'], ['TECH', 'fatou.diallo@hgy.cm'], ['FIN', 'grace.ntamack@hgy.cm']]) {
    await tx.query('UPDATE cost_centers SET manager_user_id = ? WHERE id = ?', [userId.get(email), ccId.get(cc)]);
  }
  log(`${DEMO_COST_CENTERS.length} cost centres, ${DEMO_LOCATIONS.length} locations, ${DEMO_USERS.length} users (password: ${DEMO_PASSWORD})`);

  // --- suppliers -----------------------------------------------------------
  const supId = new Map();
  for (const [code, name, type, taxId, address, email, phone, currency, terms] of DEMO_SUPPLIERS) {
    const res = await tx.query(
      `INSERT INTO suppliers (org_id, code, name, supplier_type, tax_id, address, email, phone,
                              country_code, currency, payment_terms_days, account_id, is_service_provider)
       VALUES (?,?,?,?,?,?,?,?,'CM',?,?,?,?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), supplier_type=VALUES(supplier_type)`,
      [orgId, code, name, type, taxId, address, email, phone, currency, terms, A('401'),
        ['biomedical_service', 'services'].includes(type) ? 1 : 0]
    );
    let id = res.insertId;
    if (!id) {
      const existing = await tx.queryOne('SELECT id FROM suppliers WHERE org_id = ? AND code = ?', [orgId, code]);
      id = existing?.id;
    }
    supId.set(code, id);
  }

  // --- customers (third-party payers behind hospital receivables) ----------
  const custId = new Map();
  const CUSTOMERS = [
    ['CLI-001', 'Patients payants - comptant', 'patient', '4111'],
    ['CLI-002', 'CNPS - Caisse Nationale de Prevoyance Sociale', 'government', '4114'],
    ['CLI-003', 'Activa Assurances Sante', 'insurer', '4112'],
    ['CLI-004', 'Chanas Assurances - Branche Sante', 'insurer', '4112'],
    ['CLI-005', 'Mutuelle des Personnels de l Etat', 'mutuelle', '4112'],
    ['CLI-006', 'Ministere de la Sante Publique - conventions', 'government', '4114'],
    ['CLI-007', 'Medecins Sans Frontieres - programme', 'ngo', '4115'],
  ];
  for (const [code, name, type, acct] of CUSTOMERS) {
    const res = await tx.query(
      `INSERT INTO customers (org_id, code, name, customer_type, currency, payment_terms_days, account_id)
       VALUES (?,?,?,?, 'XAF', ?, ?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), customer_type=VALUES(customer_type)`,
      [orgId, code, name, type, type === 'patient' ? 0 : 60, A(acct)]
    );
    let id = res.insertId;
    if (!id) {
      const existing = await tx.queryOne('SELECT id FROM customers WHERE org_id = ? AND code = ?', [orgId, code]);
      id = existing?.id;
    }
    custId.set(code, id);
  }

  // --- bank accounts & FX rates --------------------------------------------
  const bankId = new Map();
  const BANKS = [
    ['BQ-AFB', 'Compte courant Afriland First Bank', 'Afriland First Bank', '10005 00001 09876543210 41', 'XAF', '521', 'bank', 1250000000],
    ['BQ-SGC', 'Compte courant Societe Generale Cameroun', 'Societe Generale Cameroun', '10003 00300 11223344556 78', 'XAF', '521', 'bank', 380000000],
    ['BQ-EUR', 'Compte devise EUR - importations', 'Societe Generale Cameroun', '10003 00300 99887766554 12', 'EUR', '524', 'bank', 145000],
    ['CAISSE', 'Caisse centrale', null, null, 'XAF', '571', 'cash', 15000000],
    ['MOMO', 'Mobile money - encaissements patients', 'MTN Mobile Money', '+237 677 00 11 22', 'XAF', '556', 'mobile_money', 8500000],
  ];
  for (const [code, name, bank, number, currency, acct, kind, opening] of BANKS) {
    const res = await tx.query(
      `INSERT INTO bank_accounts (org_id, code, name, bank_name, account_number, currency, account_id, account_kind, opening_balance)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), account_kind=VALUES(account_kind)`,
      [orgId, code, name, bank, number, currency, A(acct), kind, opening]
    );
    let id = res.insertId;
    if (!id) {
      const existing = await tx.queryOne('SELECT id FROM bank_accounts WHERE org_id = ? AND code = ?', [orgId, code]);
      id = existing?.id;
    }
    bankId.set(code, id);
  }

  // XAF is pegged to the euro at 655.957; USD moves, so a small series is seeded.
  for (let m = 0; m < 12; m += 1) {
    const d = addMonths('2026-01-31', m);
    const end = `${d.slice(0, 8)}${String(daysInMonth(Number(d.slice(0, 4)), Number(d.slice(5, 7)))).padStart(2, '0')}`;
    for (const [from, to, rate] of [['EUR', 'XAF', 655.957], ['USD', 'XAF', 601.4 + m * 2.35], ['XOF', 'XAF', 1.0]]) {
      await tx.query(
        'INSERT IGNORE INTO exchange_rates (org_id, from_currency, to_currency, rate_date, rate, rate_type, source) VALUES (?,?,?,?,?, "closing", ?)',
        [orgId, from, to, end, rate, from === 'EUR' ? 'Parite fixe BEAC' : 'BEAC']
      );
    }
  }
  log(`${DEMO_SUPPLIERS.length} suppliers, ${CUSTOMERS.length} third-party payers, ${BANKS.length} bank/cash accounts, FX rate series`);

  // --- asset register --------------------------------------------------------
  const assets = [];
  const existingAssetRows = await tx.query('SELECT * FROM assets WHERE org_id = ?', [orgId]);
  const assetBySerial = new Map(existingAssetRows.map((r) => [r.serial_number, r]));

  for (const a of DEMO_ASSETS) {
    let row = assetBySerial.get(a.serial);
    if (!row) {
      const inService = a.inService || a.acquired;
      const created = await registerAsset(tx, orgId, {
        name: a.name,
        categoryId: catId.get(a.category),
        manufacturer: a.manufacturer,
        model: a.model,
        serialNumber: a.serial,
        yearOfManufacture: Number(a.acquired.slice(0, 4)),
        costCenterId: ccId.get(a.cc),
        locationId: locId.get(a.loc),
        custodianUserId: a.cc === 'REA' ? userId.get('mensah.kouassi@hgy.cm')
          : a.cc === 'IMG' ? userId.get('esther.nkodo@hgy.cm')
          : assetMgr,
        isMobile: a.mobile ?? 1,
        status: 'in_service',
        condition: compare(a.acquired, '2023-01-01') < 0 ? 'fair' : 'good',
        criticality: a.criticality,
        acquisitionDate: a.acquired,
        capitalizationDate: a.acquired,
        inServiceDate: inService,
        fundingSource: a.funding || 'purchase',
        fundingReference: a.fundingRef,
        donorName: a.donor,
        supplierId: a.supplier ? supId.get(a.supplier) : null,
        currency: 'XAF',
        acquisitionCost: a.cost,
        warrantyStart: a.warrantyMonths ? a.acquired : null,
        warrantyEnd: a.warrantyMonths ? addMonths(a.acquired, a.warrantyMonths) : null,
        warrantyTerms: a.warrantyMonths ? `Garantie constructeur ${a.warrantyMonths} mois, pieces et main d oeuvre.` : null,
        hasRfid: a.criticality === 'critical' && (a.mobile ?? 1) === 1 ? 1 : 0,
        rfidTag: a.criticality === 'critical' && (a.mobile ?? 1) === 1 ? `RF-${a.serial || a.name.slice(0, 6).toUpperCase()}` : null,
      }, { id: assetMgr });

      row = await tx.queryOne('SELECT * FROM assets WHERE id = ?', [created.id]);

      await tx.query(
        'UPDATE assets SET commissioning_done = 1, commissioning_date = ?, commissioning_notes = ? WHERE id = ?',
        [inService, 'Installation, controle de securite electrique et etalonnage initial valides a la reception.', created.id]
      );

      if (a.vehicle) {
        const v = a.vehicle;
        await tx.query(
          `INSERT INTO vehicle_details
             (asset_id, registration_no, vin, vehicle_type, fuel_type, current_mileage_km,
              service_interval_km, last_service_km, next_service_km, insurance_provider,
              insurance_policy_no, insurance_expiry, license_expiry, medical_equipment_onboard, driver_user_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE registration_no=VALUES(registration_no)`,
          [
            created.id, v.registration, a.serial, v.type, v.fuel, v.mileage,
            v.serviceIntervalKm, v.mileage - 3200, v.mileage - 3200 + v.serviceIntervalKm,
            v.insurance, v.policy, v.insuranceExpiry, v.licenseExpiry, v.onboard ?? null,
            userId.get('andre.fotso@hgy.cm'),
          ]
        );
      }

      const facilityTypes = { 'FAC-BLD': 'structure', 'FAC-GEN': 'generator', 'FAC-GAS': 'oxygen_supply', 'FAC-HVAC': 'hvac', 'FAC-LIFT': 'elevator', 'FAC-FIRE': 'fire_safety', 'FAC-WATER': 'water_treatment', 'FAC-STERIL': 'sterilisation' };
      if (facilityTypes[a.category]) {
        await tx.query(
          `INSERT INTO facility_details
             (asset_id, system_type, capacity_rating, year_built, inspection_interval_months,
              last_inspection_date, next_inspection_date, compliance_authority, certificate_no, certificate_expiry)
           VALUES (?,?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE system_type=VALUES(system_type)`,
          [
            created.id, facilityTypes[a.category],
            { 'FAC-GEN': '500 kVA / 400 kW', 'FAC-GAS': '60 Nm3/h - purete 93%', 'FAC-HVAC': '350 kW froid - classe ISO 7', 'FAC-LIFT': '1600 kg / 21 personnes', 'FAC-FIRE': '820 detecteurs - 4 zones', 'FAC-BLD': '4 200 m2 sur 3 niveaux' }[a.category] ?? null,
            Number(a.acquired.slice(0, 4)),
            a.category === 'FAC-LIFT' || a.category === 'FAC-GAS' ? 6 : 12,
            '2026-03-15', a.category === 'FAC-LIFT' || a.category === 'FAC-GAS' ? '2026-09-15' : '2027-03-15',
            a.category === 'FAC-LIFT' ? 'Bureau Veritas' : a.category === 'FAC-FIRE' ? 'Corps National de Sapeurs-Pompiers' : 'Ministere de la Sante Publique',
            `CERT-${a.category}-2026-001`,
            a.category === 'FAC-LIFT' || a.category === 'FAC-GAS' ? '2026-09-15' : '2027-03-15',
          ]
        );
        if (a.category === 'FAC-BLD') {
          await tx.query('UPDATE facility_details SET building_area_sqm = 4200 WHERE asset_id = ?', [created.id]);
        }
      }
    }
    assets.push({ ...row, _def: a });
  }
  log(`${assets.length} assets registered with QR/RFID tags, maintenance and calibration plans`);

  // --- opening balances at cutover (FR migration + SRS 8.2 lineage) --------
  const preCutover = assets.filter((a) => compare(a.acquisition_date, OPENING_DATE) < 0);
  const post2026 = assets.filter((a) => compare(a.acquisition_date, OPENING_DATE) >= 0);

  const grossByAccount = new Map();
  const accumByAccountOhada = new Map();
  const accumByAccountIfrs = new Map();
  const add = (map, code, amount) => map.set(code, money((map.get(code) || 0) + amount));

  for (const a of preCutover) {
    const cat = await tx.queryOne('SELECT * FROM asset_categories WHERE id = ?', [a.category_id]);
    let grossCode = '2411';
    let accumCode = '2841';
    if (cat?.asset_account_id) {
      const gross = await tx.queryOne('SELECT code FROM accounts WHERE id = ?', [cat.asset_account_id]);
      if (gross?.code) grossCode = gross.code;
    }
    if (cat?.accum_depr_account_id) {
      const accum = await tx.queryOne('SELECT code FROM accounts WHERE id = ?', [cat.accum_depr_account_id]);
      if (accum?.code) accumCode = accum.code;
    }
    const opening = openingAccumulated(a, CUTOVER);

    add(grossByAccount, grossCode, money(a.ohada_cost));
    add(accumByAccountOhada, accumCode, opening.ohada);
    add(accumByAccountIfrs, accumCode, opening.ifrs);

    await tx.query(
      `UPDATE assets
          SET is_capitalized = 1,
              ohada_accum_depr = ?, ohada_nbv = ?,
              ifrs_accum_depr = ?, ifrs_nbv = ?
        WHERE id = ?`,
      [
        opening.ohada, money(a.ohada_cost - opening.ohada),
        opening.ifrs, money(a.ifrs_cost - opening.ifrs),
        a.id,
      ]
    );
  }

  const totalGross = money([...grossByAccount.values()].reduce((s, v) => s + v, 0));
  const totalAccumOhada = money([...accumByAccountOhada.values()].reduce((s, v) => s + v, 0));

  const openingLines = [];
  for (const [code, amount] of grossByAccount) {
    openingLines.push({ accountCode: code, description: 'Gross carrying amount of fixed assets brought forward at opening', debit: amount, credit: 0 });
  }
  for (const [code, amount] of accumByAccountOhada) {
    if (amount > 0) openingLines.push({ accountCode: code, description: 'Accumulated depreciation brought forward at opening', debit: 0, credit: amount });
  }

  // Working capital and treasury brought over from the legacy system.
  const openingCash = [['521', 1630000000], ['571', 15000000], ['556', 8500000], ['524', 95120765]];
  for (const [code, amount] of openingCash) {
    openingLines.push({ accountCode: code, description: 'Cash and bank balances brought forward at opening', debit: amount, credit: 0 });
  }
  const openingReceivables = [['4111', 42500000], ['4112', 188400000], ['4114', 264900000], ['4115', 31200000], ['4452', 12800000]];
  for (const [code, amount] of openingReceivables) {
    openingLines.push({ accountCode: code, description: 'Receivables brought forward at opening', debit: amount, credit: 0 });
  }
  openingLines.push({ accountCode: '332', description: 'Inventory of pharmaceuticals and medical consumables', debit: 96400000, credit: 0 });
  openingLines.push({ accountCode: '333', description: 'Inventory of biomedical spare parts', debit: 28700000, credit: 0 });

  const openingCredits = [
    ['102', 1800000000, 'State endowment (capital by endowment)'],
    ['143', 356000000, 'Equipment grants received from donors'],
    ['111', 45000000, 'Legal reserve'],
    ['162', 420000000, 'Equipment loan from a credit institution'],
    ['401', 184600000, 'Trade payables brought forward'],
    ['481', 96400000, 'Capital-expenditure payables brought forward'],
    ['422', 78900000, 'Staff remuneration payable'],
    ['431', 24300000, 'Social-security contributions payable'],
    ['4441', 18700000, 'VAT payable brought forward at opening'],
  ];
  for (const [code, amount, label] of openingCredits) {
    openingLines.push({ accountCode: code, description: label, debit: 0, credit: amount });
  }

  const debitTotal = money(openingLines.reduce((s, l) => s + l.debit, 0));
  const creditTotal = money(openingLines.reduce((s, l) => s + l.credit, 0));
  const plug = money(debitTotal - creditTotal);
  // Retained earnings absorbs the migration difference, which is the standard
  // cutover treatment and keeps the trial balance in balance from day one.
  openingLines.push(
    plug >= 0
      ? { accountCode: '121', description: 'Retained earnings — balances brought forward from the prior system', debit: 0, credit: plug }
      : { accountCode: '129', description: 'Accumulated deficit — balances brought forward from the prior system', debit: -plug, credit: 0 }
  );

  const openingEntry = await createJournalEntry(tx, {
    orgId,
    journalCode: 'AN',
    // Dated at the cutover, not the first day of FY2026: opening balances must
    // sit *before* the period so FY2026 statements show them as opening
    // positions rather than as movements of the year.
    date: CUTOVER,
    description: 'Opening trial balance at 31/12/2025 — prior-system cutover',
    reference: 'AN-2026',
    narration:
      'Balances brought forward from the general ledger closed at 31/12/2025, including gross carrying amounts and ' +
      'accumulated depreciation of the fixed-asset register after a contradictory physical inventory (SRS section 10 acceptance criterion).',
    source: 'import',
    framework: 'both',
    autoPost: true,
    actor: admin,
    overrideReason: 'Opening-balance cutover at migration — period locked by construction.',
    lines: openingLines,
  });

  for (const a of preCutover) {
    await tx.query('UPDATE assets SET acquisition_entry_id = ? WHERE id = ?', [openingEntry.id, a.id]);
  }

  // The IFRS basis carried a different accumulated depreciation at cutover;
  // post only the difference, tagged 'ifrs' (FR-STD-020).
  const ifrsDeltaLines = [];
  let ifrsDeltaTotal = 0;
  for (const [code, ifrsAmount] of accumByAccountIfrs) {
    const delta = money(ifrsAmount - (accumByAccountOhada.get(code) || 0));
    if (delta === 0) continue;
    ifrsDeltaTotal = money(ifrsDeltaTotal + delta);
    ifrsDeltaLines.push(
      delta > 0
        ? { accountCode: code, description: 'Additional IFRS accumulated depreciation at opening', debit: 0, credit: delta }
        : { accountCode: code, description: 'Reduction of IFRS accumulated depreciation at opening', debit: -delta, credit: 0 }
    );
  }
  if (ifrsDeltaLines.length > 0) {
    ifrsDeltaLines.push(
      ifrsDeltaTotal > 0
        ? { accountCode: '121', description: 'Retained earnings — IFRS useful-life difference', debit: ifrsDeltaTotal, credit: 0 }
        : { accountCode: '121', description: 'Retained earnings — IFRS useful-life difference', debit: 0, credit: -ifrsDeltaTotal }
    );
    await createJournalEntry(tx, {
      orgId,
      journalCode: 'AN',
      date: CUTOVER,
      description: 'Opening balance — IFRS vs SYSCOHADA accumulated-depreciation difference',
      reference: 'AN-2026-IFRS',
      narration:
        'Useful lives and residual values adopted in the group policy (IAS 16) differ from the statutory SYSCOHADA lives. ' +
        'Only the difference is posted, tagged IFRS, so both sets of statements come from the same general ledger.',
      source: 'import',
      framework: 'ifrs',
      autoPost: true,
      actor: admin,
      overrideReason: 'IFRS opening-balance cutover at migration.',
      lines: ifrsDeltaLines,
    });
  }
  log(`opening balance posted: gross assets ${totalGross.toLocaleString('fr-FR')} XAF, accumulated depreciation ${totalAccumOhada.toLocaleString('fr-FR')} XAF`);

  // --- 2026 acquisitions go through the real capitalisation path -----------
  for (const a of post2026) {
    await capitalizeAsset(tx, orgId, a.id, {
      date: a.capitalization_date,
      // Medical equipment is VAT-exempt in Cameroon, so no recoverable VAT.
      recoverableVat: 0,
      actor: admin,
      overrideReason: 'Demonstration asset capitalized during initial system setup.',
    });
  }
  log(`${post2026.length} asset(s) capitalised in FY2026 through the acquisition workflow`);

  // --- procurement & payables ------------------------------------------------
  await seedProcurement(tx, orgId, { accountId, ccId, supId, catId, assets, admin, log });

  // --- operating transactions for FY2026 -----------------------------------
  await seedOperations(tx, orgId, { accountId, ccId, custId, assets, admin, log });

  // --- maintenance, work orders, calibration -------------------------------
  await seedMaintenance(tx, orgId, { assets, ccId, locId, supId, techs, userId, assetMgr, admin, log });

  // --- general-services errands and shopping lists -------------------------
  await seedServices(tx, orgId, { userId, ccId, log });

  // --- budget ---------------------------------------------------------------
  await seedBudget(tx, orgId, { accountId, ccId, periodId, userId, log });

  // --- depreciation runs for the closed months of FY2026 -------------------
  let posted = 0;
  for (let m = 1; m <= 8; m += 1) {
    const code = `2026-${String(m).padStart(2, '0')}`;
    const run = await createRun(tx, orgId, periodId.get(code), { actor: admin, notes: `Monthly depreciation ${code} (demonstration data).` });
    await postRun(tx, orgId, run.runId, {
      actor: admin,
      basisOfRecord: 'ohada',
      overrideReason: 'Depreciation charges posted to closed periods during system go-live.',
    });
    posted += 1;
  }
  log(`${posted} monthly depreciation runs posted on both bases (Jan-Aug 2026)`);

  await refreshComplianceFlags(tx, orgId);
  for (const a of assets) await rollUpMaintenanceCost(tx, orgId, a.id);

  return { assets: assets.length, users: DEMO_USERS.length };
}

// ---------------------------------------------------------------------------
async function seedProcurement(tx, orgId, { accountId, ccId, supId, catId, assets, admin, log }) {
  const A = (code) => accountId.get(code);

  // A three-way matched equipment purchase: PO -> receipt -> invoice.
  const poNo = await nextSequence(tx, orgId, 'purchase_order', '2026-02-05');
  const poTotal = 88000000;
  const po = await tx.query(
    `INSERT INTO purchase_orders (org_id, po_no, supplier_id, order_date, expected_date, cost_center_id,
       currency, is_capex, subtotal, tax_total, total_amount, status, approved_by, approved_at, notes, created_by)
     VALUES (?,?,?,?,?,?,'XAF',1,?,0,?, 'invoiced', ?, '2026-02-06 09:20:00', ?, ?)`,
    [
      orgId, poNo, supId.get('SUP-001'), '2026-02-05', '2026-02-28', ccId.get('IMG'),
      poTotal, poTotal, admin.id,
      'Acquisition d un mammographe numerique - financement AFD, exoneration de TVA sur materiel medical.',
      admin.id,
    ]
  );
  const poLine = await tx.query(
    `INSERT INTO purchase_order_lines (po_id, line_no, description, asset_category_id, creates_asset,
       quantity, unit_price, line_total, received_qty, invoiced_qty)
     VALUES (?,1,?,?,1,1,?,?,1,1)`,
    [po.insertId, 'Mammographe numerique Siemens Mammomat Revelation', catId.get('BIO-IMG-MAMMO'), poTotal, poTotal]
  );

  const grnNo = await nextSequence(tx, orgId, 'goods_receipt', '2026-02-26');
  const grn = await tx.query(
    `INSERT INTO goods_receipts (org_id, grn_no, po_id, receipt_date, delivery_note, received_by, notes)
     VALUES (?,?,?,?,?,?,?)`,
    [orgId, grnNo, po.insertId, '2026-02-26', 'BL-SIEMENS-2026-0412', admin.id,
      'Materiel recu complet et conforme. Installation et etalonnage initial planifies avec le service biomedical.']
  );
  await tx.query(
    'INSERT INTO goods_receipt_lines (grn_id, po_line_id, quantity, condition_note) VALUES (?,?,1,?)',
    [grn.insertId, poLine.insertId, 'Emballage intact, numero de serie conforme au bon de commande.']
  );

  const invNo = await nextSequence(tx, orgId, 'supplier_invoice', '2026-03-02');
  const inv = await tx.query(
    `INSERT INTO supplier_invoices (org_id, invoice_no, supplier_ref, supplier_id, po_id, invoice_date,
       received_date, due_date, currency, subtotal, tax_total, total, match_status, status, approved_by, approved_at, notes, created_by)
     VALUES (?,?,?,?,?,?,?,?,'XAF',?,0,?, 'three_way','approved',?,'2026-03-03 11:05:00',?,?)`,
    [
      orgId, invNo, 'SIE-2026-004411', supId.get('SUP-001'), po.insertId, '2026-03-02',
      '2026-03-02', '2026-04-16', poTotal, poTotal, admin.id,
      'Rapprochement trois voies concluant : commande, bon de reception et facture concordants (FR-AP-001).',
      admin.id,
    ]
  );
  await tx.query(
    `INSERT INTO supplier_invoice_lines (invoice_id, line_no, description, asset_category_id, cost_center_id,
       creates_asset, po_line_id, quantity, unit_price, line_total)
     VALUES (?,1,?,?,?,1,?,1,?,?)`,
    [inv.insertId, 'Mammographe numerique Siemens Mammomat Revelation', catId.get('BIO-IMG-MAMMO'), ccId.get('IMG'), poLine.insertId, poTotal, poTotal]
  );
  const mammo = assets.find((a) => a._def.category === 'BIO-IMG-MAMMO');
  if (mammo) {
    await tx.query('UPDATE assets SET purchase_order_id = ?, supplier_invoice_id = ? WHERE id = ?', [po.insertId, inv.insertId, mammo.id]);
    await tx.query('UPDATE supplier_invoice_lines SET asset_id = ? WHERE invoice_id = ?', [mammo.id, inv.insertId]);
  }

  // A pending maintenance-services invoice awaiting approval.
  const invNo2 = await nextSequence(tx, orgId, 'supplier_invoice', '2026-09-08');
  const svcAmount = 14250000;
  const svcVat = money(svcAmount * 0.1925);
  const inv2 = await tx.query(
    `INSERT INTO supplier_invoices (org_id, invoice_no, supplier_ref, supplier_id, invoice_date, received_date,
       due_date, currency, subtotal, tax_total, total, match_status, status, notes, created_by)
     VALUES (?,?,?,?,?,?,?,'XAF',?,?,?, 'unmatched','pending_approval',?,?)`,
    [
      orgId, invNo2, 'BMS-2026-0219', supId.get('SUP-004'), '2026-09-08', '2026-09-09', '2026-10-08',
      svcAmount, svcVat, money(svcAmount + svcVat),
      'Prestation de maintenance preventive trimestrielle sur les ventilateurs et moniteurs de reanimation.',
      admin.id,
    ]
  );
  await tx.query(
    `INSERT INTO supplier_invoice_lines (invoice_id, line_no, description, account_id, cost_center_id,
       quantity, unit_price, tax_code_id, tax_amount, line_total)
     VALUES (?,1,?,?,?,1,?,(SELECT id FROM tax_codes WHERE org_id=? AND code='TVA-SRV-1925'),?,?)`,
    [inv2.insertId, 'Maintenance preventive T3 2026 - equipements de reanimation', A('6243'), ccId.get('REA'), svcAmount, orgId, svcVat, svcAmount]
  );

  log('procurement: 1 three-way matched capex PO chain + 1 service invoice pending approval');
}

// ---------------------------------------------------------------------------
async function seedOperations(tx, orgId, { accountId, ccId, custId, assets, admin, log }) {
  const rand = rng(20260927);
  const domainOf = (a) => a._def.category.split('-')[0];
  // Accounts 6243/6244/6245/6247 carry requires_asset so the total-cost-of-
  // ownership roll-up (FR-AM-032) always has an asset to attribute cost to.
  const pool = {
    BIO: assets.filter((a) => domainOf(a) === 'BIO'),
    FAC: assets.filter((a) => domainOf(a) === 'FAC'),
    FLT: assets.filter((a) => domainOf(a) === 'FLT'),
  };
  const pickAsset = (domain, i) => {
    const list = pool[domain] || [];
    return list.length ? list[i % list.length].id : null;
  };
  const ASSET_DOMAIN_BY_ACCOUNT = { 6243: 'BIO', 6247: 'BIO', 6244: 'FAC', 6245: 'FLT' };
  // Annual budgeted amounts in XAF, spread over the year with a monthly
  // seasonality factor. Sized so the hospital runs a small operating surplus
  // once the State subsidy is included, which is the realistic shape for a
  // public referral hospital of this asset base.
  const REVENUE = [
    ['7061', 'URG', 'Emergency consultations and procedures', 590000000],
    ['7061', 'MED', 'Internal-medicine consultations', 370000000],
    ['7062', 'MED', 'Inpatient care and accommodation — medicine', 480000000],
    ['7062', 'PED', 'Inpatient care and accommodation — paediatrics', 260000000],
    ['7063', 'CHIR', 'Surgical procedures and operating theatre', 820000000],
    ['7064', 'LAB', 'Laboratory tests', 440000000],
    ['7065', 'IMG', 'Imaging and radiology', 710000000],
    ['7068', 'DIAL', 'Dialysis sessions', 305000000],
    ['7068', 'MAT', 'Deliveries and neonatal follow-up', 225000000],
  ];
  const SUBSIDY_ANNUAL = 1150000000; // State operating grant
  const EXPENSES = [
    ['6042', 'PHAR', 'Pharmaceuticals and medical consumables', 620000000],
    ['6042', 'LAB', 'Laboratory reagents and consumables', 230000000],
    ['6043', 'TECH', 'Hospital cleaning and hygiene supplies', 72000000],
    ['6052', 'TECH', 'Electricity — ENEO', 190000000],
    ['6051', 'TECH', 'Water — CAMWATER', 46000000],
    ['6053', 'LOG', 'Fuel and lubricants for the hospital fleet', 59000000],
    ['6243', 'BIOM', 'Biomedical-equipment maintenance', 110000000],
    ['6244', 'TECH', 'Technical-installation maintenance', 82000000],
    ['6245', 'LOG', 'Vehicle-fleet maintenance', 32000000],
    ['6247', 'BIOM', 'Calibration and metrological verification', 24000000],
    ['6255', 'ADM', 'Medical professional-liability insurance', 36000000],
    ['628', 'IT', 'Telecommunications and internet charges', 27000000],
  ];

  const monthsToSeed = 9; // January through September 2026
  let entries = 0;

  for (let m = 1; m <= monthsToSeed; m += 1) {
    const mm = String(m).padStart(2, '0');
    const year = 2026;
    const last = daysInMonth(year, m);
    const factor = 0.9 + rand() * 0.25;
    const closedPeriod = m <= 8;
    const override = closedPeriod
      ? 'Demonstration data posted to closed periods during system go-live.'
      : null;

    // --- billing: revenue against third-party payers ------------------------
    const revLines = [];
    let revTotal = 0;
    for (const [acct, cc, label, annual] of REVENUE) {
      const amount = money((annual / 12) * factor);
      revTotal = money(revTotal + amount);
      revLines.push({ accountCode: acct, costCenterId: ccId.get(cc), description: label, debit: 0, credit: amount });
    }
    // Split receivables across the payer mix typical of a public hospital.
    const split = [['4114', 0.42, 'CLI-002'], ['4112', 0.31, 'CLI-003'], ['4111', 0.21, 'CLI-001'], ['4115', 0.06, 'CLI-007']];
    let allocated = 0;
    split.forEach(([acct, pct], i) => {
      const amount = i === split.length - 1 ? money(revTotal - allocated) : money(revTotal * pct);
      allocated = money(allocated + amount);
      revLines.push({
        accountCode: acct,
        description: `Billing for services — ${year}-${mm}`,
        debit: amount,
        credit: 0,
        partnerType: 'customer',
      });
    });
    await createJournalEntry(tx, {
      orgId, journalCode: 'VTE', date: `${year}-${mm}-${last}`,
      description: `Hospital service billing — ${year}-${mm}`,
      reference: `FACT-${year}-${mm}`, source: 'ar_invoice', framework: 'both',
      autoPost: true, actor: admin, overrideReason: override, lines: revLines,
    });
    entries += 1;

    // --- State operating subsidy (dotation de fonctionnement) ---------------
    // A public hospital's tariffs do not cover its cost base; the monthly
    // Treasury allocation is recognised as it is earned and settled in arrears.
    const subsidy = money(SUBSIDY_ANNUAL / 12);
    await createJournalEntry(tx, {
      orgId, journalCode: 'OD', date: `${year}-${mm}-${last}`,
      description: `State operating grant — ${year}-${mm}`,
      reference: `SUBV-EXP-${year}-${mm}`, source: 'accrual', framework: 'both',
      autoPost: true, actor: admin, overrideReason: override,
      lines: [
        { accountCode: '449', description: 'State — operating grant receivable', debit: subsidy, credit: 0 },
        { accountCode: '711', costCenterId: ccId.get('ADM'), description: 'Operating subsidy — State', debit: 0, credit: subsidy },
      ],
    });
    entries += 1;

    if (m > 1) {
      const received = money(SUBSIDY_ANNUAL / 12);
      await createJournalEntry(tx, {
        orgId, journalCode: 'BQ', date: `${year}-${mm}-12`,
        description: `Receipt of the operating grant — ${year}-${String(m - 1).padStart(2, '0')}`,
        reference: `ENC-SUBV-${year}-${mm}`, source: 'bank', framework: 'both',
        autoPost: true, actor: admin, overrideReason: override,
        lines: [
          { accountCode: '521', description: 'Public Treasury transfer', debit: received, credit: 0 },
          { accountCode: '449', description: 'State — operating grant received', debit: 0, credit: received },
        ],
      });
      entries += 1;
    }

    // --- operating expenses --------------------------------------------------
    const expLines = [];
    let expTotal = 0;
    for (const [acct, cc, label, annual] of EXPENSES) {
      const domain = ASSET_DOMAIN_BY_ACCOUNT[acct];
      if (domain) {
        // Split the month's maintenance spend across the equipment it relates
        // to, so each asset's cost of ownership stays attributable.
        const list = pool[domain] || [];
        const share = Math.min(3, list.length) || 1;
        for (let k = 0; k < share; k += 1) {
          const amount = money(((annual / 12) * (0.88 + rand() * 0.3)) / share);
          expTotal = money(expTotal + amount);
          expLines.push({
            accountCode: acct,
            costCenterId: ccId.get(cc),
            assetId: pickAsset(domain, m + k),
            description: label,
            debit: amount,
            credit: 0,
          });
        }
        continue;
      }
      const amount = money((annual / 12) * (0.88 + rand() * 0.3));
      expTotal = money(expTotal + amount);
      expLines.push({ accountCode: acct, costCenterId: ccId.get(cc), description: label, debit: amount, credit: 0 });
    }
    const recoverableVat = money(expTotal * 0.0925);
    expLines.push({ accountCode: '4452', description: 'Recoverable VAT on purchases and services', debit: recoverableVat, credit: 0 });
    expLines.push({ accountCode: '401', description: `Trade suppliers — ${year}-${mm}`, debit: 0, credit: money(expTotal + recoverableVat), partnerType: 'supplier' });
    await createJournalEntry(tx, {
      orgId, journalCode: 'ACH', date: `${year}-${mm}-25`,
      description: `Operating expenses and purchases for the month — ${year}-${mm}`,
      reference: `ACH-${year}-${mm}`, source: 'ap_invoice', framework: 'both',
      autoPost: true, actor: admin, overrideReason: override, lines: expLines,
    });
    entries += 1;

    // --- payroll -------------------------------------------------------------
    const gross = money(214000000 * (0.98 + rand() * 0.05));
    const social = money(gross * 0.168);
    const payrollByCc = [['URG', 0.13], ['REA', 0.14], ['CHIR', 0.15], ['MED', 0.11], ['PED', 0.07], ['MAT', 0.08], ['LAB', 0.07], ['IMG', 0.07], ['DIAL', 0.04], ['PHAR', 0.03], ['BIOM', 0.03], ['TECH', 0.04], ['ADM', 0.02], ['FIN', 0.01], ['IT', 0.005], ['LOG', 0.005]];
    const payLines = [];
    let allocatedPay = 0;
    payrollByCc.forEach(([cc, pct], i) => {
      const amount = i === payrollByCc.length - 1 ? money(gross - allocatedPay) : money(gross * pct);
      allocatedPay = money(allocatedPay + amount);
      payLines.push({ accountCode: '661', costCenterId: ccId.get(cc), description: `Staff remuneration — ${cc}`, debit: amount, credit: 0 });
    });
    payLines.push({ accountCode: '664', description: 'Employer social-security charges', debit: social, credit: 0 });
    const netPay = money(gross * 0.86);
    const payrollTax = money(gross * 0.05);
    payLines.push({ accountCode: '422', description: `Net remuneration payable — ${year}-${mm}`, debit: 0, credit: netPay });
    payLines.push({ accountCode: '447', description: 'Payroll tax withheld at source', debit: 0, credit: payrollTax });
    payLines.push({
      accountCode: '431',
      description: 'Social-security contributions payable (employer and employee shares, CNPS)',
      debit: 0,
      credit: money(gross + social - netPay - payrollTax),
    });
    await createJournalEntry(tx, {
      orgId, journalCode: 'PAI', date: `${year}-${mm}-${last}`,
      description: `Staff payroll — ${year}-${mm}`,
      reference: `PAIE-${year}-${mm}`, source: 'manual', framework: 'both',
      autoPost: true, actor: admin, overrideReason: override, lines: payLines,
    });
    entries += 1;

    // --- treasury: collections and disbursements ----------------------------
    const collected = money(revTotal * (0.72 + rand() * 0.12));
    const collectionLines = split2(collected, [
      ['521', 0.82, 'Receipts by bank transfer and convention'],
      ['571', 0.11, 'Cash receipts at the cashier'],
      ['556', 0.07, 'Mobile-money receipts'],
    ]).map(([code, amount, label]) => ({ accountCode: code, description: label, debit: amount, credit: 0 }));
    collectionLines.push(
      ...split2(collected, [
        ['4114', 0.4, 'Settlement of public conventions'],
        ['4112', 0.32, 'Settlement by insurers and mutual funds'],
        ['4111', 0.28, 'Settlement by self-paying patients'],
      ]).map(([code, amount, label]) => ({ accountCode: code, description: label, debit: 0, credit: amount, partnerType: 'customer' }))
    );
    await createJournalEntry(tx, {
      orgId, journalCode: 'BQ', date: `${year}-${mm}-${last}`,
      description: `Collections for services and conventions — ${year}-${mm}`,
      reference: `ENC-${year}-${mm}`, source: 'ar_receipt', framework: 'both',
      autoPost: true, actor: admin, overrideReason: override, lines: collectionLines,
    });
    entries += 1;

    const disbursements = [
      ['401', money(expTotal * (0.76 + rand() * 0.14)), 'Payment of trade suppliers', 'supplier'],
      ['422', netPay, 'Transfer of net salaries', 'none'],
      ['431', money(social * 0.9), 'Payment of social-security contributions', 'none'],
      ['671', 2100000, 'Interest on the equipment loan', 'none'],
      ['631', 640000, 'Bank charges and commissions', 'none'],
      ['162', 5800000, 'Repayment of loan principal', 'none'],
    ];
    const disbursed = money(disbursements.reduce((s, [, amount]) => money(s + amount), 0));
    await createJournalEntry(tx, {
      orgId, journalCode: 'BQ', date: `${year}-${mm}-05`,
      description: `Supplier and salary payments — ${year}-${mm}`,
      reference: `DEC-${year}-${mm}`, source: 'ap_payment', framework: 'both',
      autoPost: true, actor: admin, overrideReason: override,
      lines: [
        ...disbursements.map(([code, amount, label, partner]) => ({
          accountCode: code, description: label, debit: amount, credit: 0, partnerType: partner,
        })),
        { accountCode: '521', description: `Debits on the main bank account — ${year}-${mm}`, debit: 0, credit: disbursed },
      ],
    });
    entries += 1;

    // --- VAT settlement ------------------------------------------------------
    await createJournalEntry(tx, {
      orgId, journalCode: 'OD', date: `${year}-${mm}-${last}`,
      description: `VAT determination for the period — ${year}-${mm}`,
      reference: `TVA-${year}-${mm}`, source: 'manual', framework: 'both',
      autoPost: true, actor: admin, overrideReason: override,
      lines: [
        { accountCode: '4441', description: 'VAT payable for the period', debit: money(recoverableVat * 0.35), credit: 0 },
        { accountCode: '4452', description: 'Allocation of recoverable VAT', debit: 0, credit: money(recoverableVat * 0.35) },
      ],
    });
    entries += 1;
  }

  // Grant amortisation: release capital grants to income over the asset lives.
  await createJournalEntry(tx, {
    orgId, journalCode: 'OD', date: '2026-08-31',
    description: 'Share of capital grants released to income (January to August 2026)',
    reference: 'SUBV-2026-08', source: 'manual', framework: 'both',
    autoPost: true, actor: admin,
    overrideReason: 'Grant regularisation posted to closed periods during go-live.',
    lines: [
      { accountCode: '149', description: 'Capital grants transferred to the income statement', debit: 18400000, credit: 0 },
      { accountCode: '865', description: 'Release of capital grants', debit: 0, credit: 18400000 },
    ],
  });
  entries += 1;

  // FX revaluation of the EUR account at the closing rate (FR-TR-002 / IAS 21).
  await createJournalEntry(tx, {
    orgId, journalCode: 'CHG', date: '2026-08-31',
    description: 'Revaluation of the EUR currency account at the closing rate (IAS 21)',
    reference: 'FX-2026-08', source: 'fx_revaluation', framework: 'both',
    autoPost: true, actor: admin,
    overrideReason: 'Foreign-currency revaluation posted to a closed period during go-live.',
    lines: [
      { accountCode: '524', description: 'Adjustment of the EUR balance at the closing rate', debit: 2840000, credit: 0 },
      { accountCode: '776', description: 'Unrealised foreign-exchange gain on the currency account', debit: 0, credit: 2840000 },
    ],
  });
  entries += 1;

  log(`${entries} operating journal entries posted across FY2026 (billing, purchases, payroll, treasury, VAT, grants, FX)`);
}

// ---------------------------------------------------------------------------
async function seedMaintenance(tx, orgId, { assets, ccId, locId, supId, techs, userId, assetMgr, admin, log }) {
  const byCategory = (code) => assets.filter((a) => a._def.category === code);
  const find = (namePart) => assets.find((a) => a.name.includes(namePart));

  // --- service contracts (FR-AM-023) ---------------------------------------
  const contracts = [
    ['CT-2024-001', 'Contrat de service complet - imagerie lourde (IRM et scanner)', 'SUP-001', 'full_service', '2024-01-01', '2026-12-31', 48000000, 4, 24, 'active',
      'Maintenance preventive trimestrielle, depannage sous 24 h, pieces et tube a rayons X inclus, mises a jour logicielles.', ['IRM 1.5 Tesla', 'Scanner 64 barrettes']],
    ['CT-2025-002', 'Contrat de maintenance preventive - equipements de reanimation', 'SUP-004', 'preventive_only', '2025-06-01', '2026-05-31', 12000000, 4, 48, 'expired',
      'Quatre visites preventives par an sur ventilateurs, moniteurs et pompes. Pieces facturees en supplement.', ['Ventilateur de reanimation - Box 1', 'Ventilateur de reanimation - Box 2']],
    ['CT-2023-003', 'Contrat de maintenance - centrale d oxygene medical', 'SUP-008', 'full_service', '2023-03-10', '2026-11-30', 22000000, 4, 8, 'expiring',
      'Maintenance de la centrale PSA, controle de purete de l oxygene et analyse trimestrielle, astreinte 24/7.', ['Centrale d oxygene medical PSA']],
    ['CT-2026-004', 'Contrat d etalonnage accredite - materiel de laboratoire', 'SUP-004', 'calibration', '2026-01-15', '2027-01-14', 8600000, 2, 72, 'active',
      'Etalonnage semestriel des automates et centrifugeuses par laboratoire accredite, certificats tracables.', ['Automate de biochimie', 'Automate d hematologie', 'Centrifugeuse de laboratoire']],
  ];
  for (const [no, title, sup, type, start, end, annual, visits, response, status, coverage, assetNames] of contracts) {
    const years = Math.max(1, Math.round((Number(end.slice(0, 4)) - Number(start.slice(0, 4))) || 1));
    const res = await tx.query(
      `INSERT INTO service_contracts (org_id, contract_no, title, supplier_id, contract_type, start_date, end_date,
         currency, annual_value, total_value, visits_per_year, response_time_hours, coverage_notes, alert_days_before, status)
       VALUES (?,?,?,?,?,?,?,'XAF',?,?,?,?,?,60,?)`,
      [orgId, no, title, supId.get(sup), type, start, end, annual, money(annual * years), visits, response, coverage, status]
    );
    for (const n of assetNames) {
      const a = find(n);
      if (a) {
        await tx.query('INSERT IGNORE INTO service_contract_assets (contract_id, asset_id, annual_cost) VALUES (?,?,?)', [res.insertId, a.id, money(annual / assetNames.length)]);
      }
    }
  }

  // --- work orders (FR-AM-021) ---------------------------------------------
  let woCount = 0;
  const makeWo = async (data) => {
    const woNo = await nextSequence(tx, orgId, 'work_order', data.requestedAt.slice(0, 10));
    const labour = data.labour || [];
    const parts = data.parts || [];
    const labourCost = money(labour.reduce((s, l) => s + l.hours * l.rate, 0));
    const labourHours = money(labour.reduce((s, l) => s + l.hours, 0));
    const partsCost = money(parts.reduce((s, p) => s + p.qty * p.unitCost, 0));
    const externalCost = money(data.externalCost || 0);

    const res = await tx.query(
      `INSERT INTO work_orders (org_id, wo_no, asset_id, plan_id, wo_type, priority, status, title,
         problem_description, cost_center_id, location_id, requested_by, requested_at, approved_by, approved_at,
         assigned_to, assigned_team, service_provider_id, assigned_at, scheduled_date, due_date,
         started_at, completed_at, verified_by, verified_at, closure_notes, root_cause, work_performed,
         asset_took_offline, downtime_hours, labor_hours, labor_cost, parts_cost, external_cost, total_cost,
         covered_by_warranty, covered_by_contract)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        orgId, woNo, data.assetId, data.planId ?? null, data.type, data.priority, data.status, data.title,
        data.problem ?? null, data.costCenterId ?? null, data.locationId ?? null,
        data.requestedBy ?? null, data.requestedAt, data.approvedBy ?? null, data.approvedAt ?? null,
        data.assignedTo ?? null, data.team || 'biomedical', data.providerId ?? null, data.assignedAt ?? null,
        data.scheduledDate ?? null, data.dueDate ?? null, data.startedAt ?? null, data.completedAt ?? null,
        data.verifiedBy ?? null, data.verifiedAt ?? null, data.closureNotes ?? null, data.rootCause ?? null,
        data.workPerformed ?? null, data.tookOffline ? 1 : 0, data.downtime || 0,
        labourHours, labourCost, partsCost, externalCost,
        money(labourCost + partsCost + externalCost),
        data.underWarranty ? 1 : 0, data.underContract ? 1 : 0,
      ]
    );
    for (const l of labour) {
      await tx.query(
        'INSERT INTO work_order_labor (work_order_id, technician_id, work_date, hours, hourly_rate, cost, notes) VALUES (?,?,?,?,?,?,?)',
        [res.insertId, l.techId, l.date, l.hours, l.rate, money(l.hours * l.rate), l.notes ?? null]
      );
    }
    for (const p of parts) {
      await tx.query(
        'INSERT INTO work_order_parts (work_order_id, part_name, part_number, quantity, unit_cost, total_cost, supplier_id, notes) VALUES (?,?,?,?,?,?,?,?)',
        [res.insertId, p.name, p.number ?? null, p.qty, p.unitCost, money(p.qty * p.unitCost), p.supplierId ?? null, p.notes ?? null]
      );
    }
    woCount += 1;
    return res.insertId;
  };

  const mri = find('IRM 1.5 Tesla');
  const vent1 = find('Ventilateur de reanimation - Box 1');
  const vent2 = find('Ventilateur de reanimation - Box 2');
  const gen = find('Groupe electrogene');
  const amb1 = find('Ambulance de reanimation A-01');
  const autoclave = find('Autoclave 250 litres');
  const chem = find('Automate de biochimie');
  const monitor1 = find('Moniteur multiparametrique - Box 1');
  const oxygen = find("Centrale d oxygene medical PSA");
  const lift = find('Ascenseur monte-malade');

  // Completed and verified preventive maintenance.
  if (mri) {
    await makeWo({
      assetId: mri.id, type: 'preventive', priority: 'high', status: 'verified',
      title: 'Maintenance preventive trimestrielle IRM - T2 2026',
      problem: 'Visite preventive contractuelle trimestrielle.',
      costCenterId: ccId.get('IMG'), locationId: locId.get('IMG-01'),
      requestedBy: assetMgr, requestedAt: '2026-06-01 08:00:00',
      approvedBy: assetMgr, approvedAt: '2026-06-01 09:15:00',
      assignedTo: techs[0], assignedAt: '2026-06-02 08:00:00', providerId: supId.get('SUP-001'),
      scheduledDate: '2026-06-15', dueDate: '2026-06-20',
      startedAt: '2026-06-15 07:30:00', completedAt: '2026-06-15 16:45:00',
      verifiedBy: assetMgr, verifiedAt: '2026-06-16 10:00:00',
      workPerformed: 'Controle des bobines, du niveau d helium (72%), du systeme de refroidissement et des sequences de test. Mise a jour logicielle appliquee.',
      closureNotes: 'Equipement conforme. Niveau d helium a surveiller au prochain passage.',
      tookOffline: 1, downtime: 9.25, underContract: 1,
      labour: [{ techId: techs[0], date: '2026-06-15', hours: 9.25, rate: 6500, notes: 'Accompagnement du technicien constructeur.' }],
      parts: [{ name: 'Filtres du circuit de refroidissement', number: 'SIE-COOL-F12', qty: 2, unitCost: 185000, supplierId: supId.get('SUP-001') }],
    });
  }

  if (autoclave) {
    await makeWo({
      assetId: autoclave.id, type: 'corrective', priority: 'emergency', status: 'verified',
      title: 'Autoclave 250 L - fuite de vapeur sur le joint de porte',
      problem: 'Fuite de vapeur importante au niveau du joint de porte, cycle de sterilisation interrompu. Bloc operatoire en tension sur les plateaux steriles.',
      costCenterId: ccId.get('TECH'), locationId: locId.get('STER-01'),
      requestedBy: userId.get('mensah.kouassi@hgy.cm'), requestedAt: '2026-07-08 06:40:00',
      approvedBy: assetMgr, approvedAt: '2026-07-08 07:00:00',
      assignedTo: techs[1], assignedAt: '2026-07-08 07:10:00', team: 'biomedical',
      scheduledDate: '2026-07-08', dueDate: '2026-07-08',
      startedAt: '2026-07-08 07:30:00', completedAt: '2026-07-08 14:20:00',
      verifiedBy: assetMgr, verifiedAt: '2026-07-09 09:00:00',
      rootCause: 'Joint de porte en fin de vie (vieillissement thermique), etancheite non conforme.',
      workPerformed: 'Remplacement du joint de porte et du presse-etoupe, reglage de la pression de fermeture, trois cycles de validation avec test Bowie-Dick concluant.',
      closureNotes: 'Cycle de sterilisation valide. Joint de rechange commande pour le stock de pieces critiques.',
      tookOffline: 1, downtime: 7.75,
      labour: [{ techId: techs[1], date: '2026-07-08', hours: 6.75, rate: 4500, notes: 'Intervention en urgence, demontage et remontage de la porte.' }],
      parts: [
        { name: 'Joint de porte silicone 250 L', number: 'GET-GSK-250', qty: 1, unitCost: 420000, supplierId: supId.get('SUP-004') },
        { name: 'Presse-etoupe vapeur', number: 'GET-PE-18', qty: 1, unitCost: 95000, supplierId: supId.get('SUP-004') },
      ],
    });
  }

  // Open corrective raised by a ward head (FR-AM-021 ward staff request).
  if (vent2) {
    await makeWo({
      assetId: vent2.id, type: 'corrective', priority: 'high', status: 'awaiting_parts',
      title: 'Ventilateur Box 2 - alarme de debit intermittente',
      problem: 'Alarme de debit inspiratoire qui se declenche de facon intermittente en mode VAC. Appareil retire du service par precaution.',
      costCenterId: ccId.get('REA'), locationId: locId.get('REA-02'),
      requestedBy: userId.get('mensah.kouassi@hgy.cm'), requestedAt: '2026-09-18 22:15:00',
      approvedBy: assetMgr, approvedAt: '2026-09-19 07:30:00',
      assignedTo: techs[0], assignedAt: '2026-09-19 07:45:00',
      scheduledDate: '2026-09-19', dueDate: '2026-09-26',
      startedAt: '2026-09-19 08:30:00',
      rootCause: 'Capteur de debit proximal suspecte defectueux - diagnostic confirme par test croise avec le Box 1.',
      workPerformed: 'Diagnostic realise, capteur de debit commande aupres du fournisseur. Appareil consigne et etiquete hors service.',
      tookOffline: 1, downtime: 196,
      labour: [{ techId: techs[0], date: '2026-09-19', hours: 3.5, rate: 6500, notes: 'Diagnostic et test croise des capteurs.' }],
      parts: [{ name: 'Capteur de debit proximal Evita V300', number: 'DRG-FLOW-8412', qty: 1, unitCost: 1280000, supplierId: supId.get('SUP-003'), notes: 'En commande - delai annonce 10 jours.' }],
    });
    await tx.query("UPDATE assets SET status = 'out_of_service', asset_condition = 'poor' WHERE id = ?", [vent2.id]);
  }

  // In-progress facility work.
  if (gen) {
    await makeWo({
      assetId: gen.id, type: 'preventive', priority: 'high', status: 'in_progress',
      title: 'Groupe electrogene 500 kVA - entretien des 250 heures',
      problem: 'Compteur horaire a 1 752 h, entretien des 250 heures du a echeance.',
      costCenterId: ccId.get('TECH'), locationId: locId.get('TECH-02'),
      requestedBy: assetMgr, requestedAt: '2026-09-22 08:00:00',
      approvedBy: assetMgr, approvedAt: '2026-09-22 08:20:00',
      assignedTo: techs[2], assignedAt: '2026-09-22 08:30:00', team: 'facilities',
      scheduledDate: '2026-09-26', dueDate: '2026-09-30',
      startedAt: '2026-09-26 08:00:00',
      workPerformed: 'Vidange realisee, filtres a huile et a gasoil remplaces. Essai en charge planifie apres reconstitution du stock de gasoil.',
      tookOffline: 0, downtime: 0,
      labour: [{ techId: techs[2], date: '2026-09-26', hours: 4, rate: 4000, notes: 'Vidange et remplacement des filtres.' }],
      parts: [
        { name: 'Huile moteur 15W40 - 40 L', number: 'CAT-OIL-1540', qty: 1, unitCost: 165000, supplierId: supId.get('SUP-009') },
        { name: 'Filtre a huile', number: 'CAT-1R-0716', qty: 1, unitCost: 48000, supplierId: supId.get('SUP-009') },
        { name: 'Filtre a gasoil', number: 'CAT-1R-0750', qty: 2, unitCost: 39000, supplierId: supId.get('SUP-009') },
      ],
    });
  }

  // Fleet service and a newly requested job awaiting approval.
  if (amb1) {
    await makeWo({
      assetId: amb1.id, type: 'vehicle_service', priority: 'normal', status: 'verified',
      title: 'Ambulance A-01 - revision des 60 000 km',
      problem: 'Revision periodique au kilometrage contractuel.',
      costCenterId: ccId.get('LOG'), locationId: locId.get('GAR-01'),
      requestedBy: assetMgr, requestedAt: '2026-05-04 09:00:00',
      approvedBy: assetMgr, approvedAt: '2026-05-04 10:00:00',
      assignedTo: techs[2], assignedAt: '2026-05-05 08:00:00', team: 'fleet', providerId: supId.get('SUP-005'),
      scheduledDate: '2026-05-12', dueDate: '2026-05-20',
      startedAt: '2026-05-12 08:00:00', completedAt: '2026-05-12 17:00:00',
      verifiedBy: assetMgr, verifiedAt: '2026-05-13 09:00:00',
      workPerformed: 'Vidange, filtres, plaquettes de frein avant, controle du gyrophare, de la sirene et du circuit d oxygene embarque.',
      closureNotes: 'Vehicule conforme. Prochaine revision a 70 000 km.',
      tookOffline: 1, downtime: 9, externalCost: 1450000,
      labour: [{ techId: techs[2], date: '2026-05-12', hours: 2, rate: 4000, notes: 'Reception et controle du materiel medical embarque.' }],
    });
  }

  if (lift) {
    await makeWo({
      assetId: lift.id, type: 'inspection', priority: 'normal', status: 'requested',
      title: 'Ascenseur monte-malade Batiment B - visite reglementaire semestrielle',
      problem: 'Visite reglementaire semestrielle a programmer avant le 15/09/2026, certificat de conformite a renouveler.',
      costCenterId: ccId.get('TECH'), locationId: locId.get('BLD-B'),
      requestedBy: assetMgr, requestedAt: '2026-09-24 11:30:00',
      team: 'facilities', providerId: supId.get('SUP-009'),
      scheduledDate: '2026-10-05', dueDate: '2026-10-15',
    });
  }

  if (monitor1) {
    await makeWo({
      assetId: monitor1.id, type: 'safety_test', priority: 'normal', status: 'assigned',
      title: 'Moniteur Box 1 - controle de securite electrique annuel',
      problem: 'Controle de securite electrique IEC 60601-1 annuel.',
      costCenterId: ccId.get('REA'), locationId: locId.get('REA-01'),
      requestedBy: assetMgr, requestedAt: '2026-09-20 09:00:00',
      approvedBy: assetMgr, approvedAt: '2026-09-20 09:30:00',
      assignedTo: techs[1], assignedAt: '2026-09-20 10:00:00',
      scheduledDate: '2026-10-02', dueDate: '2026-10-10',
    });
  }

  // --- calibrations (FR-AM-022), including one deliberately overdue --------
  let calCount = 0;
  const calibrate = async (asset, data) => {
    if (!asset) return;
    const res = await tx.query(
      `INSERT INTO calibrations (org_id, asset_id, calibration_date, performed_by_type, performed_by_user_id,
         provider_name, standard_reference, reference_equipment, parameter_tested, measured_value, nominal_value,
         deviation, tolerance, result, adjustment_made, interval_months, next_due_date, certificate_no, cost, notes, recorded_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        orgId, asset.id, data.date, data.by || 'third_party', data.techId ?? null,
        data.provider ?? null, data.standard, data.reference ?? null, data.parameter,
        data.measured, data.nominal, data.deviation, data.tolerance, data.result,
        data.adjusted ? 1 : 0, data.interval, data.nextDue, data.certificate, data.cost || 0,
        data.notes ?? null, data.techId ?? assetMgr,
      ]
    );
    await tx.query(
      'UPDATE assets SET last_calibration_date = ?, next_calibration_date = ? WHERE id = ?',
      [data.date, data.nextDue, asset.id]
    );
    calCount += 1;
    return res.insertId;
  };

  await calibrate(vent1, {
    date: '2026-04-14', by: 'third_party', provider: 'BioMed Services Afrique SARL', techId: techs[0],
    standard: 'ISO 80601-2-12 / specification constructeur Draeger',
    reference: 'Analyseur de ventilation Fluke VT650 (etalon SN VT650-1142)',
    parameter: 'Volume courant delivre a 500 mL', measured: '497 mL', nominal: '500 mL',
    deviation: -0.6, tolerance: '+/- 5 %', result: 'pass', interval: 6, nextDue: '2026-10-14',
    certificate: 'CAL-2026-0417', cost: 385000,
    notes: 'Ecart de -0,6 % sur le volume courant, tres largement dans la tolerance constructeur.',
  });
  await calibrate(vent2, {
    date: '2026-04-14', by: 'third_party', provider: 'BioMed Services Afrique SARL', techId: techs[0],
    standard: 'ISO 80601-2-12 / specification constructeur Draeger',
    reference: 'Analyseur de ventilation Fluke VT650 (etalon SN VT650-1142)',
    parameter: 'Volume courant delivre a 500 mL', measured: '511 mL', nominal: '500 mL',
    deviation: 2.2, tolerance: '+/- 5 %', result: 'pass_with_adjustment', adjusted: true,
    interval: 6, nextDue: '2026-10-14', certificate: 'CAL-2026-0418', cost: 385000,
    notes: 'Derive de +2,2 % corrigee par ajustement du capteur de debit. A surveiller au prochain passage.',
  });
  await calibrate(chem, {
    date: '2026-02-20', by: 'accredited_lab', provider: 'BioMed Services Afrique SARL (labo accredite)', techId: techs[1],
    standard: 'ISO 15189 - controle de justesse multi-niveaux',
    reference: 'Materiaux de reference certifies Roche PreciControl lots 41182 / 41183',
    parameter: 'Glucose, creatinine, uree - trois niveaux', measured: 'Biais moyen 1,4 %', nominal: 'Valeur cible CRM',
    deviation: 1.4, tolerance: '+/- 5 %', result: 'pass', interval: 6, nextDue: '2026-08-20',
    certificate: 'CAL-2026-0212', cost: 640000,
    notes: 'ECHEANCE DEPASSEE : l etalonnage semestriel etait du le 20/08/2026 et n a pas ete realise.',
  });
  await calibrate(autoclave, {
    date: '2026-07-09', by: 'internal', techId: techs[1],
    standard: 'EN 285 - validation thermometrique',
    reference: 'Enregistreur de temperature Ellab TrackSense (etalon SN ELL-7741)',
    parameter: 'Plateau de sterilisation 134 degres / 18 min', measured: '134,4 degres - 18,2 min', nominal: '134 degres - 18 min',
    deviation: 0.4, tolerance: '+1 / -0 degre', result: 'pass', interval: 12, nextDue: '2027-07-09',
    certificate: 'CAL-2026-0709', cost: 0,
    notes: 'Validation realisee apres remplacement du joint de porte, test Bowie-Dick conforme.',
  });
  await calibrate(find('Moniteur multiparametrique - Box 1'), {
    date: '2026-03-11', by: 'internal', techId: techs[1],
    standard: 'IEC 80601-2-30 (PNI) / IEC 80601-2-61 (SpO2)',
    reference: 'Simulateur patient Fluke ProSim 8 (etalon SN PS8-3390)',
    parameter: 'Pression non invasive 120/80 mmHg', measured: '119/79 mmHg', nominal: '120/80 mmHg',
    deviation: -1.0, tolerance: '+/- 3 mmHg', result: 'pass', interval: 12, nextDue: '2027-03-11',
    certificate: 'CAL-2026-0311', cost: 0,
  });
  await calibrate(find('Automate d hematologie'), {
    date: '2026-02-21', by: 'accredited_lab', provider: 'BioMed Services Afrique SARL (labo accredite)', techId: techs[1],
    standard: 'ISO 15189 - numeration formule sanguine',
    reference: 'Sang de controle Sysmex XN CHECK lot 88214',
    parameter: 'Numeration leucocytaire', measured: 'Biais 0,9 %', nominal: 'Valeur cible',
    deviation: 0.9, tolerance: '+/- 5 %', result: 'pass', interval: 6, nextDue: '2026-08-21',
    certificate: 'CAL-2026-0221', cost: 640000,
    notes: 'ECHEANCE DEPASSEE : etalonnage semestriel du le 21/08/2026.',
  });

  // --- electrical safety tests (IEC 60601) ---------------------------------
  const safetyTest = async (asset, d) => {
    if (!asset) return;
    await tx.query(
      `INSERT INTO safety_tests (org_id, asset_id, test_date, test_standard, applied_part_type,
         earth_continuity_ohm, insulation_resistance_mohm, earth_leakage_ua, enclosure_leakage_ua,
         patient_leakage_ua, visual_inspection_ok, functional_test_ok, result, defects_found,
         tested_by, tester_name, test_equipment, certificate_no, interval_months, next_due_date, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        orgId, asset.id, d.date, d.standard, d.part, d.earth, d.insulation, d.earthLeak,
        d.enclosureLeak, d.patientLeak, 1, 1, d.result, d.defects ?? null,
        d.techId, d.testerName, 'Testeur de securite electrique Fluke ESA615 (SN ESA-2291)',
        d.certificate, d.interval, d.nextDue, d.notes ?? null,
      ]
    );
    await tx.query('UPDATE assets SET last_safety_test_date = ?, next_safety_test_date = ? WHERE id = ?', [d.date, d.nextDue, asset.id]);
  };

  await safetyTest(vent1, { date: '2026-04-14', standard: 'IEC 60601-1', part: 'BF', earth: 0.11, insulation: 128.4, earthLeak: 142.0, enclosureLeak: 38.0, patientLeak: 21.0, result: 'pass', techId: techs[0], testerName: 'Samuel Eyenga', certificate: 'SEC-2026-0414-A', interval: 6, nextDue: '2026-10-14' });
  await safetyTest(find('Bistouri electrique'), { date: '2026-03-18', standard: 'IEC 60601-2-2', part: 'CF', earth: 0.09, insulation: 155.0, earthLeak: 96.0, enclosureLeak: 24.0, patientLeak: 8.0, result: 'pass', techId: techs[1], testerName: 'Pierre Kamga', certificate: 'SEC-2026-0318-B', interval: 6, nextDue: '2026-09-18', notes: 'ECHEANCE DEPASSEE : controle semestriel du le 18/09/2026.' });
  await safetyTest(find('Defibrillateur biphasique'), { date: '2026-05-06', standard: 'IEC 60601-2-4', part: 'BF', earth: 0.14, insulation: 112.0, earthLeak: 168.0, enclosureLeak: 42.0, patientLeak: 33.0, result: 'conditional', defects: 'Gaine du cordon secteur legerement fissuree cote appareil - remplacement a programmer, appareil maintenu en service sous surveillance.', techId: techs[0], testerName: 'Samuel Eyenga', certificate: 'SEC-2026-0506-C', interval: 12, nextDue: '2027-05-06' });
  await safetyTest(find('Respirateur d anesthesie'), { date: '2026-06-24', standard: 'IEC 60601-1', part: 'BF', earth: 0.10, insulation: 141.0, earthLeak: 131.0, enclosureLeak: 29.0, patientLeak: 18.0, result: 'pass', techId: techs[1], testerName: 'Pierre Kamga', certificate: 'SEC-2026-0624-D', interval: 6, nextDue: '2026-12-24' });

  // --- utilisation & downtime logs (FR-AM-041) -----------------------------
  const rand = rng(77001);
  let usageRows = 0;
  for (const asset of [mri, find('Scanner 64 barrettes'), vent1, chem, autoclave].filter(Boolean)) {
    for (let d = 0; d < 60; d += 1) {
      const logDate = addDays('2026-07-30', d);
      if (compare(logDate, '2026-09-27') > 0) break;
      const hours = money(6 + rand() * 7);
      const downtime = rand() > 0.9 ? money(1 + rand() * 4) : 0;
      await tx.query(
        `INSERT IGNORE INTO asset_usage_logs (org_id, asset_id, log_date, usage_hours, procedures_count,
           downtime_hours, downtime_reason, available_hours, recorded_by)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          orgId, asset.id, logDate, hours, Math.round(hours * (1.2 + rand())),
          downtime, downtime > 0 ? (rand() > 0.5 ? 'breakdown' : 'preventive_maintenance') : 'none',
          12, techs[0],
        ]
      );
      usageRows += 1;
    }
  }
  for (const asset of [mri, find('Scanner 64 barrettes'), vent1, chem, autoclave].filter(Boolean)) {
    const agg = await tx.queryOne(
      'SELECT COALESCE(SUM(usage_hours),0) AS h, COALESCE(SUM(downtime_hours),0) AS d FROM asset_usage_logs WHERE asset_id = ?',
      [asset.id]
    );
    await tx.query('UPDATE assets SET usage_hours = ?, total_downtime_hours = ? WHERE id = ?', [money(agg.h), money(agg.d), asset.id]);
  }

  // --- fuel logs for the fleet ---------------------------------------------
  for (const [asset, base] of [[amb1, 68420], [find('Ambulance de transport A-02'), 154900], [find('Vehicule de service'), 91200]]) {
    if (!asset) continue;
    for (let i = 0; i < 6; i += 1) {
      const litres = money(48 + rand() * 22);
      await tx.query(
        `INSERT INTO fuel_logs (org_id, asset_id, log_date, odometer_km, litres, unit_price, total_cost, station, driver_user_id)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [orgId, asset.id, addMonths('2026-04-08', i), base - (5 - i) * 850, litres, 840, money(litres * 840), 'Total Energies - Nsam', userId.get('andre.fotso@hgy.cm')]
      );
    }
  }

  // --- pending disposal awaiting CFO approval (FR-AM-042) ------------------
  const oldAmbulance = find('Ambulance de transport A-02');
  if (oldAmbulance) {
    const { requestDisposal } = await import('../../services/asset.service.js');
    await requestDisposal(tx, orgId, oldAmbulance.id, {
      requestDate: '2026-09-15',
      disposalDate: '2026-10-15',
      method: 'sale',
      reason:
        'Vehicule a 154 900 km, cout de maintenance cumule superieur a 35 % de la valeur de remplacement et immobilisations ' +
        'repetees. Remplacement prevu au budget d investissement 2026. Cession par appel d offres public.',
      proceeds: 9500000,
      disposalCosts: 350000,
      buyerName: 'Adjudication publique - a determiner',
      decontaminationDone: true,
      notes: 'Materiel medical embarque transfere sur l ambulance A-01. Certificat de radiation a obtenir apres cession.',
    }, { id: assetMgr });
  }

  // --- an IAS 36 impairment indicator on the oldest imaging asset ---------
  const ct = find('Scanner 64 barrettes');
  if (ct) {
    const carrying = money(ct.ifrs_cost - ct.ifrs_accum_depr);
    await tx.query(
      `INSERT INTO asset_impairments (org_id, asset_id, test_date, indicator, carrying_amount,
         value_in_use, fair_value_less_costs, recoverable_amount, impairment_loss, discount_rate, assumptions, status)
       VALUES (?,?,?,'technology_change',?,?,?,?,?,?,?, 'draft')`,
      [
        orgId, ct.id, '2026-09-30', carrying,
        money(carrying * 0.82), money(carrying * 0.74), money(carrying * 0.82),
        money(carrying * 0.18), 12.5,
        'Valeur d utilite calculee sur les flux de tresorerie actualises des cinq prochaines annees, avec une baisse de 20 % ' +
        'du volume d examens apres la mise en service du scanner du centre voisin. Taux d actualisation de 12,5 %.',
      ]
    );
  }

  log(`maintenance: ${contracts.length} service contracts, ${woCount} work orders, ${calCount} calibrations, 4 safety tests, ${usageRows} usage logs, 1 disposal pending approval, 1 impairment test drafted`);
}

// ---------------------------------------------------------------------------
async function seedBudget(tx, orgId, { accountId, ccId, periodId, userId, log }) {
  const fy = await tx.queryOne("SELECT id FROM fiscal_years WHERE org_id = ? AND code = 'FY2026'", [orgId]);
  const res = await tx.query(
    `INSERT INTO budgets (org_id, fiscal_year_id, code, name, version, status, approved_by, approved_at, notes)
     VALUES (?,?, 'BUD-2026','Budget de fonctionnement et d investissement 2026',1,'approved',?, '2025-12-18 15:00:00', ?)`,
    [orgId, fy.id, userId.get('grace.ntamack@hgy.cm'),
      'Budget vote par le conseil d administration, incluant les enveloppes de maintenance biomedicale et de renouvellement des equipements.']
  );
  const budgetId = res.insertId;

  const LINES = [
    ['7061', null, 'revenue', 192000000], ['7062', null, 'revenue', 148000000],
    ['7063', 'CHIR', 'revenue', 164000000], ['7064', 'LAB', 'revenue', 88000000],
    ['7065', 'IMG', 'revenue', 142000000], ['7068', 'DIAL', 'revenue', 106000000],
    ['6042', 'PHAR', 'opex', 130000000], ['6042', 'LAB', 'opex', 48000000],
    ['6052', 'TECH', 'opex', 40000000], ['6051', 'TECH', 'opex', 10000000],
    ['6053', 'LOG', 'opex', 12000000], ['661', null, 'opex', 3216000000],
    ['6243', 'BIOM', 'maintenance', 26000000], ['6244', 'TECH', 'maintenance', 18000000],
    ['6245', 'LOG', 'maintenance', 7000000], ['6247', 'BIOM', 'maintenance', 6000000],
    ['6241', 'TECH', 'maintenance', 14000000],
    ['2412', 'IMG', 'capex', 90000000], ['2413', 'REA', 'capex', 35000000],
    ['2451', 'LOG', 'replacement', 85000000], ['2442', 'IT', 'replacement', 22000000],
  ];
  let count = 0;
  for (const [acct, cc, type, annual] of LINES) {
    for (let m = 1; m <= 12; m += 1) {
      await tx.query(
        'INSERT INTO budget_lines (budget_id, account_id, cost_center_id, period_id, budget_type, amount) VALUES (?,?,?,?,?,?)',
        [budgetId, accountId.get(acct), cc ? ccId.get(cc) : null, periodId.get(`2026-${String(m).padStart(2, '0')}`), type, money(annual / 12)]
      );
      count += 1;
    }
  }
  log(`budget FY2026 approved with ${count} monthly budget lines (opex, maintenance, capex, replacement)`);
}

export async function seedServices(tx, orgId, { userId, ccId, log }) {
  await ensureDefaultKinds(tx, orgId);

  const derick = userId.get('derick.nji@hgy.cm');
  const fatou = userId.get('fatou.diallo@hgy.cm');
  if (!derick) {
    log('services: skipped (Derick Nji is not in this organisation)');
    return;
  }

  const techCc = ccId?.get('TECH') ?? null;
  const listNo = await nextSequence(tx, orgId, 'shopping_list', '2026-09-26');
  const listRes = await tx.query(
    `INSERT INTO shopping_lists
       (org_id, list_no, title, notes, status, needed_by, destination, requested_by, assigned_to)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      orgId, listNo,
      'IT hardware run — Admin block',
      'Pick up from the Kumbo computer shop. Keep receipts for Fatou.',
      'shopping', '2026-09-30', 'Admin block / IT closet', fatou ?? null, derick,
    ]
  );
  const listId = listRes.insertId;
  const items = [
    [1, 'DDR4 16 GB RAM module', 2, 'ea', 28000],
    [2, '1 TB SATA hard disk', 1, 'ea', 45000],
    [3, 'USB-C dock', 1, 'ea', 35000],
    [4, 'Cat6 network cable', 50, 'm', 400],
  ];
  for (const [line, description, qty, unit, cost] of items) {
    await tx.query(
      `INSERT INTO shopping_list_items
         (list_id, line_no, description, quantity, unit, estimated_unit_cost, status)
       VALUES (?,?,?,?,?,?, 'needed')`,
      [listId, line, description, qty, unit, cost]
    );
  }

  const consumablesNo = await nextSequence(tx, orgId, 'shopping_list', '2026-09-27');
  const consRes = await tx.query(
    `INSERT INTO shopping_lists
       (org_id, list_no, title, notes, status, needed_by, destination, requested_by, assigned_to)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      orgId, consumablesNo,
      'Workshop consumables',
      'Ordinary store run — not a purchase order.',
      'open', '2026-10-03', 'Technical workshop', fatou ?? null, derick,
    ]
  );
  for (const [line, description, qty, unit] of [
    [1, 'Electrical tape (roll)', 6, 'ea'],
    [2, 'Cable ties 200 mm', 100, 'ea'],
    [3, '5 A glass fuses', 20, 'ea'],
  ]) {
    await tx.query(
      `INSERT INTO shopping_list_items
         (list_id, line_no, description, quantity, unit, estimated_unit_cost, status)
       VALUES (?,?,?,?,?,?, 'needed')`,
      [consRes.insertId, line, description, qty, unit, 0]
    );
  }

  const jobs = [
    {
      title: 'Buy RAM, drives and cable for Admin PCs',
      description: 'Collect the shopping list from the Kumbo computer shop and drop items at the IT closet.',
      kind: 'purchase_run', priority: 'high', status: 'in_progress',
      due: '2026-09-30', location: 'Admin block / IT closet', vehicle: 'Staff pickup',
      listId,
    },
    {
      title: 'Take ambulance A-01 to the garage for an oil change',
      description: 'Drive A-01 to the Kumbo garage, wait for the oil change, and return the vehicle to the ambulance bay.',
      kind: 'fleet', priority: 'normal', status: 'assigned',
      due: '2026-09-30', location: 'Ambulance bay', vehicle: 'Ambulance A-01',
      listId: null,
    },
    {
      title: 'Run Cat6 from the IT closet to the Laboratory',
      description: 'Pull one Cat6 drop, terminate both ends, and label the port Lab-01.',
      kind: 'network', priority: 'high', status: 'assigned',
      due: '2026-10-02', location: 'IT closet → Laboratory', vehicle: null,
      listId: null,
    },
    {
      title: 'Replace corridor lights, maternity ward',
      description: 'Four dead bulb holders on the maternity corridor. Use stock from the workshop if available.',
      kind: 'electrical', priority: 'normal', status: 'requested',
      due: '2026-10-04', location: 'Maternity corridor', vehicle: null,
      listId: null,
    },
  ];

  let firstId = null;
  for (const job of jobs) {
    const no = await nextSequence(tx, orgId, 'errand', job.due);
    const res = await tx.query(
      `INSERT INTO errands
         (org_id, errand_no, title, description, kind, priority, status, due_date,
          location_note, vehicle_note, cost_center_id, requested_by, assigned_to, shopping_list_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        orgId, no, job.title, job.description, job.kind, job.priority, job.status, job.due,
        job.location, job.vehicle, techCc, fatou ?? null,
        job.status === 'requested' ? null : derick, job.listId,
      ]
    );
    if (!firstId) firstId = res.insertId;
  }
  if (firstId) {
    await tx.query('UPDATE shopping_lists SET errand_id = ? WHERE id = ?', [firstId, listId]);
  }

  log(`services: 4 errands and 2 shopping lists assigned around Derick Nji`);
}

export { DEMO_PASSWORD };
