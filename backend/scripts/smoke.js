/**
 * Exercises the running API the way the frontend will: sign in, read the
 * session, and confirm permission guards actually refuse work the role is not
 * entitled to. Run the server first, then `npm run smoke`.
 */
const BASE = process.env.API_BASE || 'http://127.0.0.1:4700';
const PASSWORD = process.env.DEMO_PASSWORD || 'Ledger@2026';

let failures = 0;
const pad = (s, n) => String(s).padEnd(n);

function check(label, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `\n          ${detail}` : ''}`);
  if (!ok) failures += 1;
}

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON response */ }
  return { status: res.status, body: json, raw: text };
}

console.log(`\nLedgerCore API smoke test against ${BASE}\n`);

console.log('1. Service health and root route');
const root = await call('GET', '/');
check('root route returns 200 with service information',
  root.status === 200 && (root.body?.service === 'ledgercore-health-api' || /LedgerCore Health/i.test(root.raw)),
  `status ${root.status}`);

const health = await call('GET', '/api/health');
check('health endpoint reports the database it is bound to',
  health.status === 200 && health.body?.ok === true,
  `status ${health.status}  ${health.body?.database?.db ?? ''} ${health.body?.database?.version ?? ''}`);

console.log('\n2. Authentication');
const bad = await call('POST', '/api/auth/login', { body: { email: 'admin@ledgercore.health', password: 'wrong-password' } });
check('a wrong password is rejected with 401', bad.status === 401, bad.body?.error?.message);
check('the rejection does not reveal whether the account exists',
  /incorrect/i.test(bad.body?.error?.message || '') && !/no such|unknown|not found/i.test(bad.body?.error?.message || ''),
  bad.body?.error?.message);

const missing = await call('GET', '/api/auth/me');
check('a protected route without a token is rejected with 401', missing.status === 401, missing.body?.error?.message);

const garbage = await call('GET', '/api/auth/me', { token: 'not-a-real-token' });
check('a forged token is rejected with 401', garbage.status === 401, garbage.body?.error?.message);

const login = await call('POST', '/api/auth/login', { body: { email: 'admin@ledgercore.health', password: PASSWORD } });
check('the administrator can sign in', login.status === 200 && Boolean(login.body?.token),
  login.status === 200
    ? `${login.body.user.full_name} - ${login.body.user.role_name}`
    : login.body?.error?.message);

if (login.status !== 200) {
  console.log('\nCannot continue without a session.\n');
  process.exit(1);
}

const admin = login.body.token;
const me = await call('GET', '/api/auth/me', { token: admin });
check('the session carries organisation context and permissions',
  me.status === 200 && me.body.user.permissions.length > 0 && Boolean(me.body.user.org_name),
  me.status === 200
    ? `${me.body.user.org_name} - ${me.body.user.functional_currency} - tier ${me.body.user.reporting_tier} - ` +
      `frameworks [${me.body.user.frameworks}] - ${me.body.user.permissions.length} permissions`
    : me.body?.error?.message);

console.log('\n3. Role-based permissions');
const roleChecks = [
  ['grace.ntamack@hgy.cm', 'cfo', ['journal.post', 'report.financial', 'depr.post'], ['admin.users']],
  ['amina.bakari@hgy.cm', 'accounting_clerk', ['journal.create'], ['journal.post', 'depr.post', 'period.close']],
  ['samuel.eyenga@hgy.cm', 'biomedical_technician', ['calibration.record', 'wo.execute', 'safety.record'], ['journal.create', 'asset.dispose_approve']],
  ['derick.nji@hgy.cm', 'general_services_technician', ['wo.execute', 'wo.view', 'errand.view', 'errand.execute', 'shop.view', 'shop.buy'], ['asset.view', 'calibration.view', 'report.asset', 'journal.view', 'po.create']],
  ['fatou.diallo@hgy.cm', 'asset_manager', ['asset.create', 'maint.plan.manage', 'wo.assign', 'errand.assign'], ['journal.create', 'depr.post']],
  ['mensah.kouassi@hgy.cm', 'ward_head', ['wo.request', 'asset.view'], ['asset.create', 'journal.view']],
];

for (const [email, expectedRole, shouldHave, shouldNotHave] of roleChecks) {
  const r = await call('POST', '/api/auth/login', { body: { email, password: PASSWORD } });
  if (r.status !== 200) {
    check(`${pad(email, 34)} can sign in`, false, r.body?.error?.message);
    continue;
  }
  const held = new Set(r.body.user.permissions);
  const granted = shouldHave.filter((p) => held.has(p));
  const leaked = shouldNotHave.filter((p) => held.has(p));
  check(`${pad(r.body.user.role_code, 22)} holds ${shouldHave.join(', ')} and not ${shouldNotHave.join(', ')}`,
    r.body.user.role_code === expectedRole && granted.length === shouldHave.length && leaked.length === 0,
    leaked.length ? `unexpectedly granted: ${leaked.join(', ')}` : `${held.size} permissions`);
}

console.log('\n4. Chart of accounts (FR-GL-001)');
const coa = await call('GET', '/api/accounts?activeOnly=true', { token: admin });
check('the SYSCOHADA chart is served with IFRS mapping attached',
  coa.status === 200 && coa.body.total > 400,
  `${coa.body?.total} accounts, e.g. ${coa.body?.rows?.find((a) => a.code === '2412')?.name} -> IFRS ${coa.body?.rows?.find((a) => a.code === '2412')?.ifrs_code}`);

const tree = await call('GET', '/api/accounts?tree=true', { token: admin });
check('the hierarchy assembles into class roots',
  tree.status === 200 && tree.body.rows.length > 0 && tree.body.rows.every((r) => Array.isArray(r.children)),
  `${tree.body?.rows?.length} roots: ${tree.body?.rows?.map((r) => r.code).join(' ')}`);

const clerkLogin = await call('POST', '/api/auth/login', { body: { email: 'amina.bakari@hgy.cm', password: PASSWORD } });
const clerk = clerkLogin.body?.token;
const cfoLogin = await call('POST', '/api/auth/login', { body: { email: 'grace.ntamack@hgy.cm', password: PASSWORD } });
const cfo = cfoLogin.body?.token;

const denied = await call('POST', '/api/accounts', {
  token: clerk,
  body: { code: '9999', name: 'Test', account_class: 9, account_type: 'offbalance', normal_side: 'debit' },
});
check('a clerk cannot edit the chart of accounts', denied.status === 403, denied.body?.error?.message);

console.log('\n5. Journal entries (FR-GL-002 balancing, FR-GL-003 period control)');
const periods = await call('GET', '/api/periods', { token: admin });
const openPeriod = periods.body?.rows?.find((p) => p.status === 'open');
check('an open period is available to post into', Boolean(openPeriod), openPeriod?.code);
const postingDate = openPeriod ? `${openPeriod.start_date.slice(0, 8)}15` : '2026-09-15';

const closedPeriod = periods.body?.rows?.find((p) => p.status === 'closed');

const unbalanced = await call('POST', '/api/entries', {
  token: clerk,
  body: {
    journalCode: 'OD', date: postingDate, description: 'Test desequilibre', reference: 'REF-UNBALANCED',
    lines: [
      { accountCode: '6042', costCenterId: 1, debit: 100000, credit: 0 },
      { accountCode: '4011', debit: 0, credit: 90000, partnerType: 'supplier', partnerId: 7 },
    ],
  },
});
check('an out-of-balance entry is refused', unbalanced.status === 422 && /balance/i.test(unbalanced.body?.error?.message || ''),
  unbalanced.body?.error?.message);

const headingAccount = await call('POST', '/api/entries', {
  token: clerk,
  body: {
    journalCode: 'OD', date: postingDate, description: 'Test compte collectif', reference: 'REF-HEADING',
    lines: [
      { accountCode: '60', debit: 50000, credit: 0 },
      { accountCode: '4011', debit: 0, credit: 50000, partnerType: 'supplier', partnerId: 7 },
    ],
  },
});
check('posting to a heading account is refused',
  headingAccount.status === 422 && /heading/i.test(headingAccount.body?.error?.message || ''),
  headingAccount.body?.error?.message);

const missingAsset = await call('POST', '/api/entries', {
  token: clerk,
  body: {
    journalCode: 'OD', date: postingDate, description: 'Maintenance sans immobilisation', reference: 'REF-ASSET',
    lines: [
      { accountCode: '6243', costCenterId: 1, debit: 75000, credit: 0 },
      { accountCode: '4011', debit: 0, credit: 75000, partnerType: 'supplier', partnerId: 7 },
    ],
  },
});
check('a maintenance charge without an asset reference is refused (FR-AM-032)',
  missingAsset.status === 422 && /asset/i.test(missingAsset.body?.error?.message || ''),
  missingAsset.body?.error?.message);

const draft = await call('POST', '/api/entries', {
  token: clerk,
  body: {
    journalCode: 'OD', date: postingDate,
    description: 'Facture eau CAMWATER - septembre 2026',
    reference: 'SMOKE-001',
    lines: [
      { accountCode: '6051', costCenterId: 1, description: 'Consommation d eau', debit: 1250000, credit: 0 },
      { accountCode: '4011', description: 'CAMWATER', debit: 0, credit: 1250000, partnerType: 'supplier', partnerId: 7 },
    ],
  },
});
check('a clerk can capture a balanced draft entry',
  draft.status === 201 && draft.body?.entry?.status === 'draft',
  draft.status === 201 ? `${draft.body.entry.entry_no} in period ${draft.body.entry.period.code}` : draft.body?.error?.message);

const selfPost = await call('POST', '/api/entries', {
  token: clerk,
  body: {
    journalCode: 'OD', date: postingDate, description: 'Tentative de comptabilisation directe', autoPost: true, reference: 'REF-SELFPOST',
    lines: [
      { accountCode: '6051', costCenterId: 1, debit: 1000, credit: 0 },
      { accountCode: '4011', debit: 0, credit: 1000, partnerType: 'supplier', partnerId: 7 },
    ],
  },
});
check('a clerk cannot post their own entry straight to the ledger', selfPost.status === 403, selfPost.body?.error?.message);

const entryId = draft.body?.entry?.id;
const clerkPost = await call('POST', `/api/entries/${entryId}/post`, { token: clerk });
check('a clerk cannot post a draft either', clerkPost.status === 403, clerkPost.body?.error?.message);

const cfoPost = await call('POST', `/api/entries/${entryId}/post`, { token: cfo });
check('the CFO can post it', cfoPost.status === 200 && cfoPost.body?.entry?.status === 'posted',
  cfoPost.body?.entry?.entry_no ?? cfoPost.body?.error?.message);

const closedDate = `${closedPeriod.start_date.slice(0, 8)}15`;
const closedPeriodEntry = await call('POST', '/api/entries', {
  token: cfo,
  body: {
    journalCode: 'OD', date: closedDate, description: 'Ecriture sur periode cloturee', autoPost: true, reference: 'REF-CLOSED',
    lines: [
      { accountCode: '6051', costCenterId: 1, debit: 5000, credit: 0 },
      { accountCode: '4011', debit: 0, credit: 5000, partnerType: 'supplier', partnerId: 7 },
    ],
  },
});
check('posting into a closed period without an override reason is refused',
  closedPeriodEntry.status === 422 && /override reason/i.test(closedPeriodEntry.body?.error?.message || ''),
  closedPeriodEntry.body?.error?.message);

const withOverride = await call('POST', '/api/entries', {
  token: cfo,
  body: {
    journalCode: 'OD', date: closedDate, description: 'Regularisation sur periode cloturee', autoPost: true, reference: 'REF-OVERRIDE',
    overrideReason: 'Regularisation demandee par le commissaire aux comptes sur exercice clos.',
    lines: [
      { accountCode: '6051', costCenterId: 1, debit: 5000, credit: 0 },
      { accountCode: '4011', debit: 0, credit: 5000, partnerType: 'supplier', partnerId: 7 },
    ],
  },
});
check('the same entry succeeds with a logged override reason (FR-GL-003)',
  withOverride.status === 201, withOverride.body?.entry?.entry_no ?? withOverride.body?.error?.message);

const reversal = await call('POST', `/api/entries/${withOverride.body?.entry?.id}/reverse`, {
  token: cfo,
  body: { reason: 'Annulation de la regularisation de test' },
});
check('a posted entry is reversed rather than deleted',
  reversal.status === 201, reversal.body?.reversal?.entry_no ?? reversal.body?.error?.message);

const deletePosted = await call('DELETE', `/api/entries/${entryId}`, { token: cfo });
check('a posted entry cannot be deleted', deletePosted.status === 403, deletePosted.body?.error?.message);

console.log('\n6. General ledger and trial balance');
const tb = await call('GET', '/api/ledger/trial-balance?from=2026-01-01&to=2026-08-31', { token: admin });
check('the trial balance balances', tb.status === 200 && tb.body?.totals?.balanced === true,
  `${tb.body?.rows?.length} accounts, closing ${tb.body?.totals?.closing_debit} = ${tb.body?.totals?.closing_credit}`);

const bankAccount = coa.body?.rows?.find((a) => a.code === '5211') ?? coa.body?.rows?.find((a) => a.code === '521');
const gl = await call('GET', `/api/ledger/account/${bankAccount?.id}?from=2026-01-01&to=2026-08-31`, { token: admin });
check('account detail returns a running balance',
  gl.status === 200 && gl.body.rows.length > 0 &&
    Math.abs(gl.body.rows.at(-1).balance - gl.body.closing_balance) < 0.01,
  `5211 ${gl.body?.rows?.length} movements, opening ${gl.body?.opening_balance} closing ${gl.body?.closing_balance}`);

console.log('\n7. Period control and close checklist (FR-CN-002)');
// The period currently being worked: open, with a checklist not yet signed off.
const sept = periods.body?.rows?.find((p) => p.status === 'open' && p.checklist_id) ?? openPeriod;
const checklist = await call('GET', `/api/periods/${sept?.id}/checklist`, { token: admin });
check('the period being worked has a close checklist',
  checklist.status === 200 && checklist.body.items.length > 0,
  checklist.status === 200
    ? `${sept.code}: ${checklist.body.progress.done}/${checklist.body.progress.total} tasks done`
    : checklist.body?.error?.message);

const lockOpen = await call('POST', `/api/periods/${sept?.id}/lock`, { token: cfo });
check('an open period cannot be locked before it is closed', lockOpen.status === 409, lockOpen.body?.error?.message);

const clerkClose = await call('POST', `/api/periods/${sept?.id}/close`, { token: clerk });
check('a clerk cannot close a period', clerkClose.status === 403, clerkClose.body?.error?.message);

// An unposted entry left in the period is enough to block the close. The draft
// is removed afterwards so the smoke test leaves the period as it found it.
const blocker = await call('POST', '/api/entries', {
  token: clerk,
  body: {
    journalCode: 'OD', date: postingDate, description: 'Brouillon bloquant la cloture', reference: 'REF-BLOCKER',
    lines: [
      { accountCode: '6051', costCenterId: 1, debit: 1000, credit: 0 },
      { accountCode: '4011', debit: 0, credit: 1000, partnerType: 'supplier', partnerId: 7 },
    ],
  },
});
const closeWithDrafts = await call('POST', `/api/periods/${sept?.id}/close`, { token: cfo });
check('a period with draft entries cannot be closed',
  closeWithDrafts.status === 422 && /draft/i.test(closeWithDrafts.body?.error?.message || ''),
  closeWithDrafts.body?.error?.message);

const cleanup = await call('DELETE', `/api/entries/${blocker.body?.entry?.id}`, { token: clerk });
check('a draft entry can be deleted', cleanup.status === 200, cleanup.body?.deleted ?? cleanup.body?.error?.message);

const notSignedOff = await call('POST', `/api/periods/${sept?.id}/checklist/sign-off`, { token: cfo });
check('the close cannot be signed off with tasks outstanding',
  notSignedOff.status === 422 && /outstanding/i.test(notSignedOff.body?.error?.message || ''),
  notSignedOff.body?.error?.message);

console.log('\n8. Asset register and lifecycle (FR-AM-001 to FR-AM-042)');
const assetMgrLogin = await call('POST', '/api/auth/login', { body: { email: 'fatou.diallo@hgy.cm', password: PASSWORD } });
const assetMgr = assetMgrLogin.body?.token;
const techLogin = await call('POST', '/api/auth/login', { body: { email: 'samuel.eyenga@hgy.cm', password: PASSWORD } });
const tech = techLogin.body?.token;

const register = await call('GET', '/api/assets?pageSize=200', { token: admin });
check('the asset register lists every domain with a value summary',
  register.status === 200 && register.body.total > 0 && Number(register.body.summary.ohada_nbv) > 0,
  register.status === 200
    ? `${register.body.total} assets, cost ${register.body.summary.ohada_cost}, NBV ${register.body.summary.ohada_nbv}`
    : register.body?.error?.message);

const biomedical = await call('GET', '/api/assets?domain=biomedical&pageSize=200', { token: admin });
check('the register filters by domain',
  biomedical.status === 200 && biomedical.body.total > 0 && biomedical.body.total < register.body.total,
  `${biomedical.body?.total} biomedical of ${register.body?.total}`);

const sample = biomedical.body?.rows?.find((a) => a.status !== 'disposed') ?? register.body?.rows?.[0];
const detail = await call('GET', `/api/assets/${sample?.id}`, { token: admin });
check('asset detail carries the full lifecycle history',
  detail.status === 200 && Array.isArray(detail.body.movements) && detail.body.movements.length > 0 &&
    Array.isArray(detail.body.plans) && Number(detail.body.asset.total_cost_of_ownership) > 0,
  detail.status === 200
    ? `${detail.body.asset.asset_tag}: ${detail.body.movements.length} movements, ${detail.body.plans.length} plans, ` +
      `${detail.body.work_orders.length} work orders, ${detail.body.depreciation.length} depreciation lines, TCO ${detail.body.asset.total_cost_of_ownership}`
    : detail.body?.error?.message);

const scan = await call('GET', `/api/assets/scan/${encodeURIComponent(sample?.asset_tag)}`, { token: tech });
check('a technician can look an asset up by its scanned tag (FR-AM-002)',
  scan.status === 200 && scan.body.asset.id === sample.id, scan.body?.asset?.name ?? scan.body?.error?.message);

const badScan = await call('GET', '/api/assets/scan/NO-SUCH-TAG', { token: tech });
check('an unknown tag returns 404 rather than an empty result', badScan.status === 404, badScan.body?.error?.message);

const tag = await call('GET', `/api/assets/${sample?.id}/tag`, { token: tech });
check('a printable QR tag is generated for the asset',
  tag.status === 200 && String(tag.body?.qr_data_url).startsWith('data:image/png;base64,'),
  `${tag.body?.asset_tag} -> ${tag.body?.qr_payload}`);

const categories = await call('GET', '/api/asset-categories', { token: assetMgr });
check('asset categories expose their GL and compliance defaults',
  categories.status === 200 && categories.body.rows.some((c) => c.requires_calibration && c.asset_account_code),
  `${categories.body?.rows?.length} categories`);

const locations = await call('GET', '/api/asset-locations', { token: assetMgr });
check('locations are available for custody tracking',
  locations.status === 200 && locations.body.rows.length > 0, `${locations.body?.rows?.length} locations`);

const clerkRegister = await call('POST', '/api/assets', {
  token: clerk,
  body: { name: 'Test', categoryId: categories.body?.rows?.[0]?.id, acquisitionCost: 1000 },
});
check('a clerk cannot add to the asset register', clerkRegister.status === 403, clerkRegister.body?.error?.message);

// Reuse one test asset across runs so the smoke test does not grow the register.
const SMOKE_SERIAL = 'SMOKE-SN-0001';
const calibratedCategory = categories.body?.rows?.find((c) => c.requires_calibration && c.requires_safety_test && c.asset_account_code);
const existing = register.body?.rows?.find((a) => a.serial_number === SMOKE_SERIAL);
let testAssetId = existing?.id;

if (!testAssetId) {
  const created = await call('POST', '/api/assets', {
    token: assetMgr,
    body: {
      name: 'Moniteur multiparametrique - test de recette',
      categoryId: calibratedCategory?.id,
      manufacturer: 'Mindray', model: 'uMEC12', serialNumber: SMOKE_SERIAL,
      costCenterId: sample?.id ? detail.body?.asset?.cost_center_id : null,
      locationId: locations.body?.rows?.[0]?.id,
      acquisitionDate: postingDate, acquisitionCost: 4500000, incidentalCosts: 250000,
      fundingSource: 'purchase', criticality: 'high',
    },
  });
  check('the asset manager can register an asset, which mints its tag and schedules',
    created.status === 201 && Boolean(created.body?.asset?.asset_tag) && Boolean(created.body?.asset?.qr_payload),
    created.status === 201 ? `${created.body.asset.asset_tag} -> ${created.body.asset.qr_payload}` : created.body?.error?.message);
  testAssetId = created.body?.asset?.id;
} else {
  check('the asset manager can register an asset, which mints its tag and schedules', true,
    `reusing ${existing.asset_tag} from a previous run`);
}

const testBefore = await call('GET', `/api/assets/${testAssetId}`, { token: admin });
check('registration derives the maintenance, calibration and safety schedules (FR-AM-020)',
  testBefore.status === 200 && testBefore.body.plans.length === 3,
  testBefore.body?.plans?.map((p) => `${p.plan_type}/${p.interval_months}m`).join(' '));

const mgrCapitalize = await call('POST', `/api/assets/${testAssetId}/capitalize`, { token: assetMgr, body: {} });
check('the asset manager cannot post the capitalization entry themselves',
  mgrCapitalize.status === 403, mgrCapitalize.body?.error?.message);

if (!testBefore.body?.asset?.is_capitalized) {
  const capitalize = await call('POST', `/api/assets/${testAssetId}/capitalize`, {
    token: cfo, body: { date: postingDate },
  });
  check('capitalization posts the fixed-asset entry at cost plus incidentals (FR-AM-011)',
    capitalize.status === 200 && Number(capitalize.body?.entry?.total_debit) === 4750000,
    capitalize.status === 200
      ? `${capitalize.body.entry.entry_no} for ${capitalize.body.entry.total_debit}`
      : capitalize.body?.error?.message);
} else {
  check('capitalization posts the fixed-asset entry at cost plus incidentals (FR-AM-011)', true,
    `already capitalized on ${testBefore.body.asset.capitalization_date}`);
}

const earlyCommission = await call('POST', `/api/assets/${testAssetId}/commission`, {
  token: tech, body: { inServiceDate: postingDate },
});
check('equipment cannot be put in service without its calibration certificate (FR-AM-022)',
  earlyCommission.status === 422 && /calibration/i.test(earlyCommission.body?.error?.message || ''),
  earlyCommission.body?.error?.message);

if (!testBefore.body?.asset?.commissioning_done) {
  const commission = await call('POST', `/api/assets/${testAssetId}/commission`, {
    token: tech,
    body: { inServiceDate: postingDate, initialCalibrationDone: true, safetyCheckDone: true, notes: 'Recette technique validee' },
  });
  check('with both certificates recorded, commissioning puts it in service',
    commission.status === 200 && commission.body.in_service_date === postingDate,
    commission.body?.in_service_date ?? commission.body?.error?.message);
} else {
  check('with both certificates recorded, commissioning puts it in service', true,
    `already commissioned on ${testBefore.body.asset.commissioning_date}`);
}

const noDestination = await call('POST', `/api/assets/${testAssetId}/move`, {
  token: tech, body: { movementType: 'transfer', reason: 'Sans destination' },
});
check('a movement without a destination is refused', noDestination.status === 400, noDestination.body?.error?.message);

const destination = locations.body?.rows?.find((l) => l.id !== testBefore.body?.asset?.location_id);
const move = await call('POST', `/api/assets/${testAssetId}/move`, {
  token: tech,
  body: {
    movementType: 'transfer', movementDate: postingDate, toLocationId: destination?.id,
    reason: 'Reaffectation au bloc operatoire', scanned: true,
  },
});
check('a scanned transfer updates custody and appends to the movement history (FR-AM-040)',
  move.status === 200, move.status === 200 ? `moved to ${destination?.name}` : move.body?.error?.message);

const afterMove = await call('GET', `/api/assets/${testAssetId}`, { token: admin });
check('the movement history reflects the transfer',
  afterMove.body?.asset?.location_id === destination?.id &&
    afterMove.body?.movements?.some((m) => m.movement_type === 'transfer' && Number(m.scanned_tag) === 1),
  `${afterMove.body?.movements?.length} movements, now at ${afterMove.body?.asset?.location_name}`);

const dirtyDisposal = await call('POST', `/api/assets/${testAssetId}/disposal`, {
  token: assetMgr,
  body: { method: 'biomedical_waste', reason: 'Fin de vie apres panne irreparable de la carte mere' },
});
check('biomedical equipment cannot be disposed of without a decontamination record',
  dirtyDisposal.status === 400 && /decontaminated/i.test(dirtyDisposal.body?.error?.message || ''),
  dirtyDisposal.body?.error?.message);

const techDisposal = await call('POST', `/api/assets/${testAssetId}/disposal`, {
  token: tech,
  body: { method: 'scrap', reason: 'Tentative non autorisee', decontaminationDone: true },
});
check('a technician cannot raise a disposal request', techDisposal.status === 403, techDisposal.body?.error?.message);

const disposalReq = await call('POST', `/api/assets/${testAssetId}/disposal`, {
  token: assetMgr,
  body: {
    method: 'sale', reason: 'Remplacement par un modele plus recent, cession au personnel',
    requestDate: postingDate, proceeds: 3000000, decontaminationDone: true,
    buyerName: 'Clinique Saint-Luc', certificateNo: 'DECON-2026-014',
  },
});
check('a disposal request computes the gain or loss on both bases (FR-AM-042)',
  disposalReq.status === 201 && Boolean(disposalReq.body?.disposal?.disposal_no),
  disposalReq.status === 201
    ? `${disposalReq.body.disposal.disposal_no}, OHADA result ${disposalReq.body.disposal.ohada_gain_loss}`
    : disposalReq.body?.error?.message);

const duplicate = await call('POST', `/api/assets/${testAssetId}/disposal`, {
  token: assetMgr,
  body: { method: 'scrap', reason: 'Doublon de demande de sortie', decontaminationDone: true },
});
check('a second disposal request for the same asset is refused', duplicate.status === 409, duplicate.body?.error?.message);

const disposalId = disposalReq.body?.disposal?.id;
const mgrApprove = await call('POST', `/api/disposals/${disposalId}/decide`, { token: assetMgr, body: { approve: true } });
check('the requester cannot approve their own disposal', mgrApprove.status === 403, mgrApprove.body?.error?.message);

const pending = await call('GET', '/api/disposals?status=pending_approval', { token: cfo });
check('pending disposals are queued for approval',
  pending.status === 200 && pending.body.rows.some((d) => d.id === disposalId),
  `${pending.body?.total} awaiting approval`);

const earlyComplete = await call('POST', `/api/disposals/${disposalId}/complete`, { token: cfo, body: {} });
check('an unapproved disposal cannot be posted', earlyComplete.status === 409, earlyComplete.body?.error?.message);

// Rejecting returns the asset to service, so the test asset survives for the next run.
const reject = await call('POST', `/api/disposals/${disposalId}/decide`, {
  token: cfo, body: { approve: false, reason: 'Equipement encore utile au service de reanimation' },
});
check('rejecting the request returns the asset to service',
  reject.status === 200 && reject.body.disposal.status === 'rejected', reject.body?.error?.message);

const restored = await call('GET', `/api/assets/${testAssetId}`, { token: admin });
check('the asset is no longer flagged pending disposal',
  restored.body?.asset?.status === 'in_service' && restored.body?.asset?.disposal_id === null,
  `status ${restored.body?.asset?.status}`);

const sweep = await call('POST', '/api/assets/refresh-compliance', { token: assetMgr });
check('the compliance sweep re-evaluates restrictions and rolls up cost of ownership (FR-AM-022 / FR-AM-032)',
  sweep.status === 200 && sweep.body.assets_rolled_up > 0,
  `${sweep.body?.flagged} flag changes over ${sweep.body?.assets_rolled_up} assets`);

console.log('\n9. Maintenance, work orders and compliance (FR-AM-020 to FR-AM-023)');
const wardLogin = await call('POST', '/api/auth/login', { body: { email: 'mensah.kouassi@hgy.cm', password: PASSWORD } });
const ward = wardLogin.body?.token;

const overview = await call('GET', '/api/maintenance/overview', { token: assetMgr });
check('the maintenance overview counts the work order pipeline and what is due',
  overview.status === 200 && typeof overview.body?.work_orders?.in_progress === 'number' &&
    Array.isArray(overview.body.overdue),
  overview.status === 200
    ? `${overview.body.work_orders.in_progress} in progress, ${overview.body.work_orders.blocked} blocked, ` +
      `${overview.body.work_orders.past_due} past due, ${overview.body.overdue.length} overdue assets ` +
      `(${overview.body.restricted} restricted), ${overview.body.due_soon.length} due within 30 days`
    : overview.body?.error?.message);

const plans = await call('GET', '/api/maintenance-plans?pageSize=200', { token: assetMgr });
check('every asset carries preventive, calibration and safety plans',
  plans.status === 200 && plans.body.total > 0 &&
    ['preventive', 'calibration', 'safety_test'].every((t) => plans.body.rows.some((p) => p.plan_type === t)),
  `${plans.body?.total} plans`);

// The scheduler must be safe to run twice: the second pass finds the work
// orders it already raised and generates nothing.
const scheduled = await call('POST', '/api/maintenance-plans/run-scheduler', { token: assetMgr, body: { horizonDays: 45 } });
check('the scheduler turns plans that fall due into work orders (FR-AM-020)',
  scheduled.status === 200 && typeof scheduled.body.generated === 'number',
  `${scheduled.body?.generated} generated through ${scheduled.body?.horizon_to}`);

const rerun = await call('POST', '/api/maintenance-plans/run-scheduler', { token: assetMgr, body: { horizonDays: 45 } });
check('running the scheduler again generates no duplicates',
  rerun.status === 200 && rerun.body.generated === 0, `${rerun.body?.generated} generated on the second pass`);

const covered = await call(
  'GET', `/api/maintenance-plans?pageSize=200&dueBefore=${scheduled.body?.horizon_to}`, { token: assetMgr }
);
check('every plan falling due inside the horizon now has an open work order',
  covered.status === 200 && covered.body.rows.length > 0 &&
    covered.body.rows.every((p) => Number(p.open_work_orders) > 0),
  `${covered.body?.rows?.length} plans due by ${scheduled.body?.horizon_to}, ` +
  `${covered.body?.rows?.filter((p) => Number(p.open_work_orders) === 0).length} uncovered`);

const clerkScheduler = await call('POST', '/api/maintenance-plans/run-scheduler', { token: clerk, body: {} });
check('a clerk cannot run the maintenance scheduler', clerkScheduler.status === 403, clerkScheduler.body?.error?.message);

// A ward head reports a breakdown: the request must arrive unapproved.
const request = await call('POST', '/api/work-orders', {
  token: ward,
  body: {
    assetId: testAssetId, type: 'corrective', priority: 'high',
    title: 'Moniteur de recette - ecran qui se fige en cours de surveillance',
    problemDescription: "L ecran se fige apres environ vingt minutes de surveillance continue, l affichage des courbes s arrete mais les alarmes restent actives.",
    takeOffline: true,
  },
});
check('a ward head can raise a breakdown request, which arrives unapproved (FR-AM-021)',
  request.status === 201 && request.body.work_order.status === 'requested',
  request.status === 201 ? `${request.body.work_order.wo_no} - ${request.body.work_order.status}` : request.body?.error?.message);

const woId = request.body?.work_order?.id;
const offline = await call('GET', `/api/assets/${testAssetId}`, { token: admin });
check('an asset pulled from the ward is taken out of service immediately',
  offline.body?.asset?.status === 'out_of_service' && Number(offline.body?.asset?.use_restricted) === 1,
  `${offline.body?.asset?.status} - ${offline.body?.asset?.restriction_reason}`);

const wardApprove = await call('POST', `/api/work-orders/${woId}/approve`, { token: ward });
check('the requester cannot approve their own work order', wardApprove.status === 403, wardApprove.body?.error?.message);

const earlyStart = await call('POST', `/api/work-orders/${woId}/start`, { token: tech });
check('work cannot start before the order is approved', earlyStart.status === 409, earlyStart.body?.error?.message);

const approve = await call('POST', `/api/work-orders/${woId}/approve`, { token: assetMgr });
check('the asset manager approves it', approve.status === 200 && approve.body.work_order.status === 'approved',
  approve.body?.error?.message);

const blindAssign = await call('POST', `/api/work-orders/${woId}/assign`, { token: assetMgr, body: {} });
check('a work order cannot be assigned to nobody', blindAssign.status === 422, blindAssign.body?.error?.message);

const techId = overview.body?.technician_workload?.[0]?.id
  ?? (await call('GET', '/api/auth/me', { token: tech })).body.user.id;
const assign = await call('POST', `/api/work-orders/${woId}/assign`, {
  token: assetMgr, body: { assignedTo: techId, scheduledDate: postingDate, dueDate: postingDate },
});
check('assigning it records the technician and the schedule',
  assign.status === 200 && assign.body.work_order.status === 'assigned', assign.body?.error?.message);

const start = await call('POST', `/api/work-orders/${woId}/start`, { token: tech });
check('the technician starts the job', start.status === 200 && start.body.work_order.status === 'in_progress',
  start.body?.error?.message);

const part = await call('POST', `/api/work-orders/${woId}/parts`, {
  token: tech,
  body: { partName: 'Carte ecran uMEC12', partNumber: 'MDR-DISP-1120', quantity: 1, unitCost: 640000 },
});
check('parts consumed are costed on the work order',
  part.status === 201 && part.body.work_order.parts_cost === 640000,
  `parts ${part.body?.work_order?.parts_cost}, total ${part.body?.work_order?.total_cost}`);

const labour = await call('POST', `/api/work-orders/${woId}/labor`, {
  token: tech,
  body: { workDate: postingDate, hours: 3.5, hourlyRate: 6500, notes: 'Diagnostic et remplacement de la carte ecran.' },
});
check('in-house labour hours are costed too',
  labour.status === 201 && labour.body.work_order.labor_cost === 22750 &&
    labour.body.work_order.total_cost === 662750,
  `labour ${labour.body?.work_order?.labor_cost}, total ${labour.body?.work_order?.total_cost}`);

const terseClosure = await call('POST', `/api/work-orders/${woId}/complete`, { token: tech, body: { workPerformed: 'ok' } });
check('a work order cannot be closed without describing the work done',
  terseClosure.status === 422, terseClosure.body?.error?.message);

const complete = await call('POST', `/api/work-orders/${woId}/complete`, {
  token: tech,
  body: {
    workPerformed: "Remplacement de la carte ecran, mise a jour du firmware et test de surveillance continue de deux heures sans incident.",
    rootCause: 'Defaillance de la carte ecran (surchauffe du regulateur).',
    downtimeHours: 26.5,
  },
});
check('closing the work order returns the asset to service',
  complete.status === 200 && complete.body.work_order.status === 'completed',
  complete.body?.error?.message);

const backInService = await call('GET', `/api/assets/${testAssetId}`, { token: admin });
check('the asset is back in service with its cost of ownership updated',
  backInService.body?.asset?.status === 'in_service' &&
    Number(backInService.body?.asset?.total_maintenance_cost) >= 662750,
  `${backInService.body?.asset?.status}, TCO ${backInService.body?.asset?.total_cost_of_ownership}`);

const woDetail = await call('GET', `/api/work-orders/${woId}`, { token: assetMgr });
check('closing the work order raises the cost entry against the asset',
  woDetail.status === 200 && Boolean(woDetail.body.work_order.entry_id),
  `total ${woDetail.body?.work_order?.total_cost}, entry ${woDetail.body?.work_order?.entry_no}`);

const costEntry = await call('GET', `/api/entries/${woDetail.body?.work_order?.entry_id}`, { token: cfo });
check('only the external spend reaches the ledger: 640 000 of parts, not the 662 750 that includes payroll',
  costEntry.status === 200 && Number(costEntry.body.entry.total_debit) === 640000 &&
    costEntry.body.lines.some((l) => l.account_code === '6243' && Number(l.asset_id) === Number(testAssetId)),
  costEntry.status === 200
    ? `${costEntry.body.entry.entry_no} ${costEntry.body.entry.total_debit} on ` +
      costEntry.body.lines.map((l) => l.account_code).join(' / ')
    : costEntry.body?.error?.message);

check('a technician closing the job leaves the charge as a draft, not a ledger posting',
  costEntry.body?.entry?.status === 'draft', `entry is ${costEntry.body?.entry?.status}`);

const postCost = await call('POST', `/api/entries/${woDetail.body?.work_order?.entry_id}/post`, { token: cfo });
check('the accountant commits the maintenance charge to the ledger',
  postCost.status === 200 && postCost.body.entry.status === 'posted',
  postCost.body?.entry?.entry_no ?? postCost.body?.error?.message);

const techVerify = await call('POST', `/api/work-orders/${woId}/verify`, { token: tech });
check('the technician who did the work cannot verify it', techVerify.status === 403, techVerify.body?.error?.message);

const verify = await call('POST', `/api/work-orders/${woId}/verify`, {
  token: assetMgr, body: { closureNotes: 'Surveillance continue validee sur deux heures, appareil rendu au service.' },
});
check('the asset manager verifies and closes it',
  verify.status === 200 && verify.body.work_order.status === 'verified', verify.body?.error?.message);

const lateParts = await call('POST', `/api/work-orders/${woId}/parts`, {
  token: tech, body: { partName: 'Piece ajoutee trop tard', quantity: 1, unitCost: 1000 },
});
check('costs cannot be added to a closed work order', lateParts.status === 409, lateParts.body?.error?.message);

// A failed calibration must quarantine the device, not just warn about it.
const failedCal = await call('POST', `/api/assets/${testAssetId}/calibrations`, {
  token: tech,
  body: {
    calibrationDate: postingDate, performedByType: 'internal',
    standardReference: 'IEC 80601-2-30 (pression non invasive)',
    referenceEquipment: 'Simulateur patient Fluke ProSim 8 (etalon SN PS8-3390)',
    parameterTested: 'Pression non invasive 120/80 mmHg', measuredValue: '131/88 mmHg', nominalValue: '120/80 mmHg',
    deviation: 9.2, tolerance: '+/- 3 mmHg', result: 'fail',
    notes: 'Ecart hors tolerance sur toute la plage, module PNI a remplacer.',
  },
});
check('a failed calibration quarantines the device and shortens the interval (FR-AM-022)',
  failedCal.status === 201 && failedCal.body.restricted === true, failedCal.body?.next_due_date ?? failedCal.body?.error?.message);

const quarantined = await call('GET', `/api/assets/${testAssetId}`, { token: admin });
check('the quarantined device is flagged use-restricted',
  quarantined.body?.asset?.status === 'quarantined' && Number(quarantined.body?.asset?.use_restricted) === 1,
  `${quarantined.body?.asset?.status} - ${quarantined.body?.asset?.restriction_reason}`);

const passCal = await call('POST', `/api/assets/${testAssetId}/calibrations`, {
  token: tech,
  body: {
    calibrationDate: postingDate, performedByType: 'third_party',
    providerName: 'BioMed Services Afrique SARL',
    standardReference: 'IEC 80601-2-30 (pression non invasive)',
    parameterTested: 'Pression non invasive 120/80 mmHg', measuredValue: '121/80 mmHg', nominalValue: '120/80 mmHg',
    deviation: 0.8, tolerance: '+/- 3 mmHg', result: 'pass_with_adjustment', adjustmentMade: true,
    certificateNo: 'CAL-2026-SMOKE', cost: 385000,
  },
});
check('a passing calibration lifts the restriction and resets the schedule',
  passCal.status === 201 && passCal.body.restricted === false && passCal.body.interval_months === 12,
  `next due ${passCal.body?.next_due_date}`);

const safety = await call('POST', `/api/assets/${testAssetId}/safety-tests`, {
  token: tech,
  body: {
    testDate: postingDate, testStandard: 'IEC 60601-1', appliedPartType: 'BF',
    earthContinuityOhm: 0.12, insulationResistanceMohm: 134.0,
    earthLeakageUa: 118.0, enclosureLeakageUa: 27.0, patientLeakageUa: 14.0,
    result: 'pass', certificateNo: 'SEC-2026-SMOKE',
    testEquipment: 'Testeur de securite electrique Fluke ESA615 (SN ESA-2291)',
  },
});
check('an electrical safety test is recorded against IEC 60601 with its measurements',
  safety.status === 201 && safety.body.restricted === false, `next due ${safety.body?.next_due_date}`);

const clerkCal = await call('POST', `/api/assets/${testAssetId}/calibrations`, {
  token: clerk, body: { result: 'pass' },
});
check('a clerk cannot file a calibration certificate', clerkCal.status === 403, clerkCal.body?.error?.message);

const restored2 = await call('GET', `/api/assets/${testAssetId}`, { token: admin });
check('the device is back in service after both certificates are filed',
  restored2.body?.asset?.status === 'in_service' && Number(restored2.body?.asset?.use_restricted) === 0,
  `${restored2.body?.asset?.status}, calibration due ${restored2.body?.asset?.next_calibration_date}, ` +
  `safety test due ${restored2.body?.asset?.next_safety_test_date}`);

const contracts = await call('GET', '/api/service-contracts', { token: assetMgr });
check('service contracts report their days to expiry (FR-AM-023)',
  contracts.status === 200 && contracts.body.rows.length > 0 &&
    contracts.body.rows.every((c) => typeof c.days_to_expiry === 'number'),
  contracts.body?.rows?.map((c) => `${c.contract_no}:${c.days_to_expiry}d/${c.status}`).join(' '));

const contractSweep = await call('POST', '/api/service-contracts/refresh-status', { token: assetMgr });
check('the expiry sweep moves contracts to expiring / expired',
  contractSweep.status === 200 && typeof contractSweep.body.changed === 'number',
  `${contractSweep.body?.changed} of ${contractSweep.body?.reviewed} contracts restatused`);

const reliability = await call('GET', '/api/maintenance/reliability?from=2026-01-01&to=2026-09-30', { token: assetMgr });
check('reliability reporting gives availability, MTBF and repair cost against asset value',
  reliability.status === 200 && reliability.body.rows.length > 0 &&
    reliability.body.rows.every((r) => typeof r.availability_pct === 'number'),
  reliability.status === 200
    ? reliability.body.rows.slice(0, 3)
      .map((r) => `${r.asset_tag} ${r.availability_pct}% ${r.failures} failure(s)`).join(' | ')
    : reliability.body?.error?.message);

console.log('\n10. Depreciation on both bases (FR-AM-030 / FR-AM-031)');
const runs = await call('GET', '/api/depreciation-runs?pageSize=50', { token: cfo });
check('posted depreciation runs are listed with the OHADA / IFRS divergence',
  runs.status === 200 && runs.body.total > 0 && runs.body.rows.every((r) => typeof r.delta === 'number'),
  `${runs.body?.total} runs, latest ${runs.body?.rows?.[0]?.period_code} OHADA ${runs.body?.rows?.[0]?.total_ohada} / IFRS ${runs.body?.rows?.[0]?.total_ifrs}`);

const runDetail = await call('GET', `/api/depreciation-runs/${runs.body?.rows?.[0]?.id}`, { token: cfo });
check('a run shows each asset with both bases side by side and a domain summary',
  runDetail.status === 200 && runDetail.body.lines.length > 0 &&
    runDetail.body.lines.every((l) => l.ohada && l.ifrs) && runDetail.body.by_domain.length > 0,
  runDetail.status === 200
    ? `${runDetail.body.lines.length} assets; ` +
      runDetail.body.by_domain.map((d) => `${d.domain} ${d.ohada}/${d.ifrs}`).join(' | ')
    : runDetail.body?.error?.message);

// The open period has not been depreciated yet, so a simulation there is the
// honest test of the engine: it must produce a charge without writing anything.
const sim = await call('POST', `/api/periods/${openPeriod.id}/depreciation/simulate`, { token: cfo, body: {} });
check('simulating the open period charges both bases without writing anything',
  sim.status === 200 && sim.body.totals.assetCount > 0 && sim.body.totals.ohada > 0 && sim.body.totals.ifrs > 0,
  sim.status === 200
    ? `${sim.body.totals.assetCount} assets, OHADA ${sim.body.totals.ohada}, IFRS ${sim.body.totals.ifrs}, delta ${sim.body.totals.delta}`
    : sim.body?.error?.message);

check('the two bases diverge, which is the point of running both (FR-STD-020)',
  sim.body?.totals?.delta !== 0 && sim.body.lines.some((l) => l.ohada.method !== l.ifrs.method),
  `delta ${sim.body?.totals?.delta}; methods e.g. ` +
  (sim.body?.lines?.find((l) => l.ohada.method !== l.ifrs.method)
    ? `${sim.body.lines.find((l) => l.ohada.method !== l.ifrs.method).ohada.method} vs ${sim.body.lines.find((l) => l.ohada.method !== l.ifrs.method).ifrs.method}`
    : 'none differ'));

const simAgain = await call('POST', `/api/periods/${openPeriod.id}/depreciation/simulate`, { token: cfo, body: {} });
check('simulating twice gives the same answer, so nothing was written',
  simAgain.body?.totals?.ohada === sim.body?.totals?.ohada, `${simAgain.body?.totals?.ohada}`);

const clerkRun = await call('POST', `/api/periods/${openPeriod.id}/depreciation/runs`, { token: clerk, body: {} });
check('a clerk cannot prepare a depreciation run', clerkRun.status === 403, clerkRun.body?.error?.message);

const closedRun = await call('POST', `/api/periods/${closedPeriod.id}/depreciation/runs`, { token: cfo, body: {} });
check('a period already depreciated cannot be run a second time',
  closedRun.status === 422 && /already been posted/i.test(closedRun.body?.error?.message || ''),
  closedRun.body?.error?.message);

const prepared = await call('POST', `/api/periods/${openPeriod.id}/depreciation/runs`, {
  token: cfo, body: { notes: 'Calcul de recette - supprime aussitot.' },
});
check('the run is prepared for review before anything reaches the ledger',
  prepared.status === 201 && prepared.body.totals.ohada === sim.body.totals.ohada,
  prepared.status === 201 ? `run #${prepared.body.run_id}, OHADA ${prepared.body.totals.ohada}` : prepared.body?.error?.message);

const duplicate2 = await call('POST', `/api/periods/${openPeriod.id}/depreciation/runs`, { token: cfo, body: {} });
check('a second prepared run for the same period is refused',
  duplicate2.status === 422 && /already prepared/i.test(duplicate2.body?.error?.message || ''),
  duplicate2.body?.error?.message);

const clerkPostRun = await call('POST', `/api/depreciation-runs/${prepared.body?.run_id}/post`, { token: clerk, body: {} });
check('a clerk cannot post depreciation to the ledger', clerkPostRun.status === 403, clerkPostRun.body?.error?.message);

// Discarded rather than posted, so re-running the smoke test starts clean and
// the September charge stays where the close process expects it.
const discard = await call('DELETE', `/api/depreciation-runs/${prepared.body?.run_id}`, { token: cfo });
check('a prepared run can be discarded before posting', discard.status === 200, `${discard.body?.deleted}`);

const schedule = await call('GET', `/api/assets/${sample?.id}/depreciation-schedule`, { token: cfo });
check('an asset carries its full life schedule on both bases',
  schedule.status === 200 && schedule.body.ohada.length > 0 && schedule.body.ifrs.length > 0,
  `${schedule.body?.asset?.asset_tag}: ${schedule.body?.ohada?.length} OHADA periods (${schedule.body?.asset?.ohada?.method}), ` +
  `${schedule.body?.ifrs?.length} IFRS periods (${schedule.body?.asset?.ifrs?.method})`);

const impairment = await call('POST', `/api/assets/${sample?.id}/impairments`, {
  token: cfo,
  body: {
    testDate: postingDate, indicator: 'technology_change',
    valueInUse: 1, fairValueLessCosts: 1, discountRate: 12.5,
    assumptions: 'Test de recette : valeur recouvrable volontairement basse pour verifier le calcul.',
  },
});
check('an impairment test takes the higher of value in use and fair value (IAS 36.18)',
  impairment.status === 201 && impairment.body.recoverable === 1 &&
    impairment.body.loss === Math.round((impairment.body.carrying - 1) * 100) / 100,
  `carrying ${impairment.body?.carrying}, recoverable ${impairment.body?.recoverable}, loss ${impairment.body?.loss}`);

check('the draft impairment is not posted, so the ledger is untouched',
  impairment.body?.entry === null, 'entry is null');

const noMeasure = await call('POST', `/api/assets/${sample?.id}/impairments`, {
  token: cfo, body: { testDate: postingDate, indicator: 'idle_asset' },
});
check('an impairment test without a recoverable amount is refused', noMeasure.status === 400, noMeasure.body?.error?.message);

const costModel = await call('POST', `/api/assets/${sample?.id}/revaluations`, {
  token: cfo, body: { revaluationDate: postingDate, fairValue: 1000000 },
});
check('an asset class measured at cost cannot be revalued (IAS 16.31)',
  costModel.status === 422 && /cost under IFRS/i.test(costModel.body?.error?.message || ''),
  costModel.body?.error?.message);

console.log('\n11. Financial statements, both frameworks from one ledger');
const YTD = 'from=2026-01-01&to=2026-08-31';

const catalog = await call('GET', '/api/reports/catalog', { token: cfo });
check('the report catalog names both statement packs and the fiscal years',
  catalog.status === 200 && catalog.body.statements.ohada.length === 3 && catalog.body.statements.ifrs.length >= 5,
  `${catalog.body?.organisation?.name} tier ${catalog.body?.organisation?.reporting_tier}, ` +
  `${catalog.body?.fiscal_years?.length} fiscal years`);

const ohadaPack = await call('GET', `/api/reports/ohada?${YTD}`, { token: cfo });
check('the OHADA pack returns Bilan, Compte de resultat and TAFIRE, all balanced',
  ohadaPack.status === 200 && ohadaPack.body.checks.length === 2 &&
    ohadaPack.body.checks.every((c) => c.balanced) && typeof ohadaPack.body.net_result === 'number',
  ohadaPack.status === 200
    ? ohadaPack.body.checks.map((c) => `${c.label}: ${c.difference}`).join(' | ') +
      ` | net result ${ohadaPack.body.net_result}`
    : ohadaPack.body?.error?.message);

const bilan = await call('GET', `/api/reports/ohada/bilan?${YTD}`, { token: cfo });
check('the Bilan presents gross, depreciation and net columns (SYSCOHADA)',
  bilan.status === 200 && bilan.body.check.balanced &&
    bilan.body.lines.some((l) => l.gross !== null && l.depreciation !== null),
  `${bilan.body?.lines?.length} lines, difference ${bilan.body?.check?.difference}, ` +
  `e.g. ${bilan.body?.lines?.find((l) => l.gross)?.line_code} gross ${bilan.body?.lines?.find((l) => l.gross)?.gross}`);

const cr = await call('GET', `/api/reports/ohada/resultat?${YTD}`, { token: cfo });
check('the Compte de resultat carries the OHADA intermediate balances XA to XI',
  cr.status === 200 && ['XA', 'XB', 'XC', 'XD', 'XE', 'XF', 'XG', 'XH', 'XI']
    .every((c) => cr.body.lines.some((l) => l.line_code === c)),
  `net result ${cr.body?.check?.net_result}, value added ` +
  `${cr.body?.lines?.find((l) => l.line_code === 'XC')?.net}`);

const badRange = await call('GET', '/api/reports/ohada/bilan?from=2026-08-31&to=2026-01-01', { token: cfo });
check('a reversed date range is refused', badRange.status === 400, badRange.body?.error?.message);

const noSuchStatement = await call('GET', `/api/reports/ohada/nonsense?${YTD}`, { token: cfo });
check('an unknown statement name returns a helpful 404', noSuchStatement.status === 404, noSuchStatement.body?.error?.message);

const ifrsPack = await call('GET', `/api/reports/ifrs?${YTD}`, { token: cfo });
check('the IFRS pack returns SOFP, P&L, OCI, cash flow and equity, all balanced',
  ifrsPack.status === 200 && ifrsPack.body.checks.length === 3 &&
    ifrsPack.body.checks.every((c) => c.balanced),
  ifrsPack.status === 200
    ? ifrsPack.body.checks.map((c) => `${c.label}: ${c.difference}`).join(' | ')
    : ifrsPack.body?.error?.message);

const bridge = await call('GET', `/api/reports/dual-standard-bridge?${YTD}`, { token: cfo });
check('the dual-standard bridge reconciles OHADA to IFRS exactly (FR-STD-020)',
  bridge.status === 200 && bridge.body.reconciled === true,
  bridge.status === 200
    ? `OHADA ${bridge.body.ohada_result} + IFRS-only ${bridge.body.ifrs_only_adjustments} = ${bridge.body.ifrs_result} ` +
      `(difference ${bridge.body.difference}, ${bridge.body.adjustments.length} adjusting entries)`
    : bridge.body?.error?.message);

const ppe = await call('GET', `/api/reports/ifrs/ppe-note?${YTD}`, { token: cfo });
check('the IAS 16 PP&E note rolls cost and depreciation forward',
  ppe.status === 200 && ppe.body.checks.every((c) => c.balanced),
  ppe.status === 200 ? ppe.body.checks.map((c) => `${c.label}: ${c.difference}`).join(' | ') : ppe.body?.error?.message);

const recon = await call('GET', '/api/reports/register-reconciliation?asOf=2026-08-31&basis=ohada', { token: cfo });
check('the asset register ties to the general ledger with zero variance (SRS section 10)',
  recon.status === 200 && recon.body.totals.reconciled === true,
  recon.status === 200
    ? `${recon.body.rows.length} accounts compared, register cost ${recon.body.totals.register_cost}, ` +
      `accumulated ${recon.body.totals.register_accum}`
    : recon.body?.error?.message);

const clerkStatements = await call('GET', `/api/reports/ifrs/sofp?${YTD}`, { token: tech });
check('a technician cannot read the financial statements', clerkStatements.status === 403, clerkStatements.body?.error?.message);

console.log('\n12. Asset, depreciation and compliance reports');
const registerReport = await call('GET', '/api/reports/asset-register?basis=ohada&groupBy=domain', { token: assetMgr });
check('the asset register report groups gross, depreciation and net by domain',
  registerReport.status === 200 && registerReport.body.rows.length > 0 &&
    registerReport.body.totals.gross > 0 &&
    Math.abs(registerReport.body.totals.gross - registerReport.body.totals.accumulated_depreciation
      - registerReport.body.totals.net) < 1,
  registerReport.status === 200
    ? `gross ${registerReport.body.totals.gross} - depreciation ${registerReport.body.totals.accumulated_depreciation} ` +
      `= net ${registerReport.body.totals.net}`
    : registerReport.body?.error?.message);

const deprReport = await call('GET', `/api/reports/depreciation?${YTD}`, { token: assetMgr });
check('the depreciation report breaks the charge down by period and category',
  deprReport.status === 200 && deprReport.body.by_period.length > 0 && deprReport.body.by_category.length > 0,
  `${deprReport.body?.by_period?.length} periods, OHADA ${deprReport.body?.totals?.ohada}, ` +
  `IFRS ${deprReport.body?.totals?.ifrs}, delta ${deprReport.body?.totals?.delta}`);

const compliance = await call('GET', '/api/reports/compliance', { token: assetMgr });
check('the compliance report gives a calibration coverage rate per domain',
  compliance.status === 200 && compliance.body.calibration_coverage.length > 0 &&
    typeof compliance.body.overall_compliance_pct === 'number',
  `${compliance.body?.overall_compliance_pct}% overall; ` +
  compliance.body?.calibration_coverage?.map((c) => `${c.domain} ${c.compliance_pct}%`).join(' '));

const tco = await call('GET', `/api/reports/cost-of-ownership?from=2026-01-01&to=2026-09-30`, { token: assetMgr });
check('cost of ownership flags replace-rather-than-repair candidates (FR-AM-032)',
  tco.status === 200 && Array.isArray(tco.body.replacement_candidates),
  `${tco.body?.total} assets reviewed, ${tco.body?.replacement_candidates?.length} replacement candidate(s)`);

const dashboard = await call('GET', '/api/dashboard', { token: cfo });
check('the dashboard returns the open period, asset value, maintenance load and the result',
  dashboard.status === 200 && Boolean(dashboard.body.period) && dashboard.body.assets.total > 0 &&
    typeof dashboard.body.result.net_result === 'number',
  dashboard.status === 200
    ? `${dashboard.body.period.code}: ${dashboard.body.assets.total} assets worth ${dashboard.body.assets.net_book_value}, ` +
      `${dashboard.body.maintenance.work_orders.past_due} work orders past due, net result ${dashboard.body.result.net_result}`
    : dashboard.body?.error?.message);

const wardDashboard = await call('GET', '/api/dashboard', { token: ward });
check('the dashboard shows a ward head only what their role may see',
  wardDashboard.status === 200 && wardDashboard.body.result === null && wardDashboard.body.ledger === null &&
    wardDashboard.body.assets !== null,
  `assets ${wardDashboard.body?.assets?.total}, financials withheld`);

const audit = await call('GET', '/api/audit-log?pageSize=5', { token: admin });
check('the action history records who did what (SRS control objective)',
  audit.status === 200 && audit.body.rows.length > 0 && audit.body.rows.every((r) => r.action && r.summary),
  audit.status === 200
    ? `${audit.body.total} entries, latest: ${audit.body.rows[0].user_name} - ${audit.body.rows[0].summary}`
    : audit.body?.error?.message);

const auditDenied = await call('GET', '/api/audit-log', { token: assetMgr });
check('the action history is restricted to administrators', auditDenied.status === 403, auditDenied.body?.error?.message);

console.log('\n13. Errands and shopping lists');
const gstLogin = await call('POST', '/api/auth/login', { body: { email: 'derick.nji@hgy.cm', password: PASSWORD } });
const gst = gstLogin.body?.token;
const gstErrands = await call('GET', '/api/errands?openOnly=true', { token: gst });
check('Derick can read open errands',
  gstErrands.status === 200 && gstErrands.body.total >= 1,
  gstErrands.status === 200 ? `${gstErrands.body.total} open errand(s)` : gstErrands.body?.error?.message);
const gstShop = await call('GET', '/api/shopping-lists?openOnly=true', { token: gst });
check('Derick can read open shopping lists',
  gstShop.status === 200 && gstShop.body.total >= 1,
  gstShop.status === 200 ? `${gstShop.body.total} open list(s)` : gstShop.body?.error?.message);
const gstAssets = await call('GET', '/api/assets?pageSize=1', { token: gst });
check('Derick is still refused the asset register', gstAssets.status === 403, gstAssets.body?.error?.message);
const gstPo = await call('POST', '/api/purchase-orders', { token: gst, body: { supplierId: 1 } });
check('a shopping list is not a purchase-order bypass',
  gstPo.status === 403 || gstPo.status === 404,
  gstPo.body?.error?.message);

console.log('\n14. Error shape');
const nf = await call('GET', '/api/does-not-exist', { token: admin });
check('an unknown route returns a 404 in the standard error shape',
  nf.status === 404 && typeof nf.body?.error?.message === 'string', nf.body?.error?.message);

const invalid = await call('POST', '/api/auth/login', { body: { email: '' } });
check('a malformed request returns 400 with per-field details',
  invalid.status === 400 && Array.isArray(invalid.body?.error?.details),
  JSON.stringify(invalid.body?.error?.details));

console.log(failures === 0 ? '\nAll smoke checks passed.\n' : `\n${failures} smoke check(s) FAILED.\n`);
process.exit(failures ? 1 : 0);
