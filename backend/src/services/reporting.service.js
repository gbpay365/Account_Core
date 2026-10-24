import { money } from '../utils/money.js';
import { toISO, addDays } from '../utils/dates.js';
import { ApiError } from '../utils/errors.js';
import { OHADA_REPORT_LINES } from '../db/seed/data/reports-ohada.js';

/**
 * FR-RP-001 :: produce statutory OHADA/SYSCOHADA statements and IFRS
 * statements from the same underlying ledger.
 *
 * OHADA statements are driven by the `report_lines` templates and their formula
 * mini-language. IFRS statements are driven by `account_mappings`, so the two
 * are two presentations of one set of postings rather than two data sets.
 *
 * Framework filtering is what makes this work: an OHADA statement reads
 * entries tagged 'both' or 'ohada'; an IFRS statement reads 'both' or 'ifrs'.
 */

const FRAMEWORK_FILTER = {
  ohada: ['both', 'ohada'],
  ifrs: ['both', 'ifrs'],
  all: ['both', 'ohada', 'ifrs'],
};

/**
 * One pass over the ledger, returning opening / movement / closing per account.
 * Everything downstream works from this so a statement is a single scan.
 */
export async function loadBalances(db, orgId, { from, to, framework = 'ohada', costCenterId = null }) {
  const frameworks = FRAMEWORK_FILTER[framework] || FRAMEWORK_FILTER.ohada;
  const fw = frameworks.map(() => '?').join(',');
  const ccFilter = costCenterId ? ' AND jl.cost_center_id = ?' : '';
  const ccParam = costCenterId ? [costCenterId] : [];

  const rows = await db.query(
    `SELECT a.id, a.code, a.name, a.name_en, a.account_class, a.account_type, a.normal_side,
            COALESCE(SUM(CASE WHEN je.entry_date <  ? THEN jl.debit  - jl.credit END), 0) AS opening,
            COALESCE(SUM(CASE WHEN je.entry_date >= ? AND je.entry_date <= ? THEN jl.debit  END), 0) AS period_debit,
            COALESCE(SUM(CASE WHEN je.entry_date >= ? AND je.entry_date <= ? THEN jl.credit END), 0) AS period_credit
       FROM accounts a
       LEFT JOIN journal_lines jl ON jl.account_id = a.id${ccFilter}
       LEFT JOIN journal_entries je
              ON je.id = jl.entry_id
             AND je.status = 'posted'
             AND je.framework IN (${fw})
             AND je.entry_date <= ?
      WHERE a.org_id = ?
      GROUP BY a.id
      ORDER BY a.code`,
    [from, from, to, from, to, ...ccParam, ...frameworks, to, orgId]
  );

  const byCode = new Map();
  for (const r of rows) {
    const opening = money(r.opening);
    const debit = money(r.period_debit);
    const credit = money(r.period_credit);
    byCode.set(r.code, {
      id: r.id,
      code: r.code,
      name: r.name,
      name_en: r.name_en,
      account_class: r.account_class,
      account_type: r.account_type,
      normal_side: r.normal_side,
      opening,
      debit,
      credit,
      movement: money(debit - credit),
      closing: money(opening + debit - credit),
    });
  }
  return byCode;
}

const FUNCS = {
  BAL: (a) => a.closing,
  OPEN: (a) => a.opening,
  MVT: (a) => a.movement,
  DR: (a) => a.debit,
  CR: (a) => a.credit,
};

/** `BAL:+41,-491;MVT:+706` -> [{ func, terms: [{ sign, prefix }] }] */
function parseFormula(formula) {
  if (!formula) return [];
  return formula
    .split(';')
    .map((seg) => seg.trim())
    .filter(Boolean)
    .map((seg) => {
      const [rawFunc, rawTerms = ''] = seg.split(':');
      const func = rawFunc.trim().toUpperCase();
      const terms = rawTerms
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => ({
          sign: t.startsWith('-') ? -1 : 1,
          prefix: t.replace(/^[+-]/, '').trim(),
        }))
        // Longest prefix first so `+41,+412` never double-counts 412.
        .sort((a, b) => b.prefix.length - a.prefix.length);
      return { func, terms };
    });
}

function evaluate(formula, balances, lineValues) {
  const segments = parseFormula(formula);
  let total = 0;

  for (const { func, terms } of segments) {
    if (func === 'REF') {
      for (const { sign, prefix } of terms) {
        if (!(prefix in lineValues)) return { value: null, pending: prefix };
        total = money(total + sign * lineValues[prefix]);
      }
      continue;
    }
    const pick = FUNCS[func];
    if (!pick) throw new ApiError(500, `Unknown report formula function "${func}".`);

    const counted = new Set();
    for (const { sign, prefix } of terms) {
      for (const acct of balances.values()) {
        if (!acct.code.startsWith(prefix) || counted.has(acct.code)) continue;
        counted.add(acct.code);
        total = money(total + sign * pick(acct));
      }
    }
  }
  return { value: total, pending: null };
}

/** Template-driven OHADA statement (BILAN / CR / TAFIRE). */
export async function buildOhadaStatement(db, orgId, statementCode, { from, to, costCenterId = null }) {
  let template = await db.query(
    `SELECT * FROM report_lines
      WHERE org_id = ? AND framework = 'ohada' AND statement_code = ?
      ORDER BY side, sort_order`,
    [orgId, statementCode]
  );
  if (template.length === 0) {
    const linesToInsert = OHADA_REPORT_LINES.filter((l) => l.statement_code === statementCode);
    for (const line of linesToInsert) {
      await db.query(
        `INSERT INTO report_lines
           (org_id, framework, statement_code, line_code, label, label_en, side, line_type,
            sign, gross_formula, depr_formula, formula, is_bold, note_ref, sort_order)
         VALUES (?, 'ohada', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE label=VALUES(label), label_en=VALUES(label_en), formula=VALUES(formula)`,
        [
          orgId, line.statement_code, line.line_code, line.label, line.label_en,
          line.side, line.line_type, line.sign ?? 1,
          line.gross_formula ?? null, line.depr_formula ?? null, line.formula ?? null,
          line.is_bold ?? 0, line.note_ref ?? null, line.sort_order,
        ]
      ).catch(() => {});
    }
    template = await db.query(
      `SELECT * FROM report_lines
        WHERE org_id = ? AND framework = 'ohada' AND statement_code = ?
        ORDER BY side, sort_order`,
      [orgId, statementCode]
    );
  }
  if (template.length === 0) throw new ApiError(404, `No OHADA template found for ${statementCode}.`);

  const balances = await loadBalances(db, orgId, { from, to, framework: 'ohada', costCenterId });

  const values = {};
  const gross = {};
  const depr = {};

  // Multiple passes so REF lines resolve once their dependencies are known.
  for (let pass = 0; pass < 8; pass += 1) {
    let progressed = false;
    for (const line of template) {
      if (line.line_code in values) continue;

      if (line.gross_formula || line.depr_formula) {
        const g = evaluate(line.gross_formula, balances, values);
        const d = evaluate(line.depr_formula, balances, values);
        if (g.pending || d.pending) continue;
        gross[line.line_code] = g.value ?? 0;
        depr[line.line_code] = d.value ?? 0;
        values[line.line_code] = money((g.value ?? 0) - (d.value ?? 0));
        progressed = true;
        continue;
      }

      const r = evaluate(line.formula, balances, values);
      if (r.pending) continue;
      values[line.line_code] = r.value ?? 0;
      progressed = true;
    }
    if (!progressed) break;
  }

  // A line left unresolved means its formula references a code that this
  // template never defines. Silently rendering it as zero would quietly
  // unbalance the statement, so surface it instead.
  const unresolved = template
    .filter((l) => !(l.line_code in values) && (l.formula || l.gross_formula || l.depr_formula))
    .map((l) => ({
      line_code: l.line_code,
      label: l.label,
      missing: evaluate(l.formula || l.gross_formula, balances, values).pending,
    }));
  if (unresolved.length > 0) {
    throw new ApiError(
      500,
      `${statementCode} template has unresolvable lines: ` +
        unresolved.map((u) => `${u.line_code} (needs "${u.missing}")`).join(', ')
    );
  }

  // A REF subtotal also aggregates its children's gross / depreciation columns.
  for (const line of template) {
    if (line.gross_formula || line.depr_formula) continue;
    const segments = parseFormula(line.formula);
    const ref = segments.find((s) => s.func === 'REF');
    if (!ref) continue;
    let g = 0;
    let d = 0;
    let any = false;
    for (const { sign, prefix } of ref.terms) {
      if (prefix in gross) {
        g = money(g + sign * gross[prefix]);
        d = money(d + sign * depr[prefix]);
        any = true;
      }
    }
    if (any) {
      gross[line.line_code] = g;
      depr[line.line_code] = d;
    }
  }

  const lines = template.map((l) => ({
    line_code: l.line_code,
    label: l.label,
    label_en: l.label_en,
    side: l.side,
    line_type: l.line_type,
    is_bold: Boolean(l.is_bold),
    note_ref: l.note_ref,
    gross: gross[l.line_code] ?? null,
    depreciation: depr[l.line_code] ?? null,
    net: money((values[l.line_code] ?? 0) * (l.sign ?? 1)),
  }));

  const result = { statement: statementCode, framework: 'ohada', from, to, lines };

  if (statementCode === 'BILAN') {
    const totalAssets = values.BZ ?? 0;
    const totalLiabilities = values.DZ ?? 0;
    result.check = {
      label: 'Total actif = Total passif',
      total_assets: totalAssets,
      total_liabilities: totalLiabilities,
      difference: money(totalAssets - totalLiabilities),
      balanced: money(totalAssets - totalLiabilities) === 0,
    };
  }
  if (statementCode === 'CR') {
    result.check = { label: 'Resultat net', net_result: values.XI ?? 0 };
  }
  if (statementCode === 'TAFIRE') {
    const closing = values.ZH ?? 0;
    const actual = evaluate('BAL:+50,+51,+52,+53,+55,+57,+58,-561,-565', balances, values).value ?? 0;
    result.check = {
      label: 'Tresorerie de cloture calculee = tresorerie comptable',
      statement_closing: closing,
      ledger_closing: actual,
      difference: money(closing - actual),
      balanced: money(closing - actual) === 0,
    };
  }

  return result;
}

const IFRS_SECTION_LABELS = {
  non_current_assets: ['Actifs non courants', 'Non-current assets'],
  current_assets: ['Actifs courants', 'Current assets'],
  equity: ['Capitaux propres', 'Equity'],
  non_current_liabilities: ['Passifs non courants', 'Non-current liabilities'],
  current_liabilities: ['Passifs courants', 'Current liabilities'],
  revenue: ['Produits', 'Revenue and other income'],
  operating_expenses: ["Charges d'exploitation", 'Operating expenses'],
  finance: ['Resultat financier', 'Finance result'],
  tax: ['Impot sur le resultat', 'Income tax'],
  not_reclassified: ['Elements non recyclables en resultat', 'Items that will not be reclassified to profit or loss'],
  reclassified: ['Elements recyclables en resultat', 'Items that may be reclassified to profit or loss'],
};

/**
 * FR-STD-010 :: IFRS statement built through the mapping engine. Nothing is
 * re-keyed - each SYSCOHADA account's balance is routed to its IFRS line.
 */
export async function buildIfrsStatement(db, orgId, statement, { from, to, costCenterId = null }) {
  const balances = await loadBalances(db, orgId, { from, to, framework: 'ifrs', costCenterId });

  const mappings = await db.query(
    `SELECT m.allocation_pct, a.code AS account_code, a.name AS account_name,
            i.code AS ifrs_code, i.name AS ifrs_name, i.name_fr AS ifrs_name_fr,
            i.statement, i.section, i.sub_section, i.sign, i.sort_order, i.note_ref
       FROM account_mappings m
       JOIN accounts a      ON a.id = m.account_id
       JOIN ifrs_accounts i ON i.id = m.ifrs_account_id
      WHERE m.org_id = ? AND i.statement = ?`,
    [orgId, statement]
  );

  const useMovement = statement === 'pl' || statement === 'oci';
  const lines = new Map();

  for (const m of mappings) {
    const acct = balances.get(m.account_code);
    if (!acct) continue;
    const raw = useMovement ? acct.movement : acct.closing;
    const share = (Number(m.allocation_pct) || 100) / 100;
    const contribution = money(raw * share * m.sign);

    const line = lines.get(m.ifrs_code) || {
      code: m.ifrs_code,
      label: m.ifrs_name,
      label_fr: m.ifrs_name_fr,
      section: m.section,
      sub_section: m.sub_section,
      note_ref: m.note_ref,
      sort_order: m.sort_order,
      amount: 0,
      components: [],
    };
    line.amount = money(line.amount + contribution);
    if (money(raw) !== 0) {
      line.components.push({ code: m.account_code, name: m.account_name, amount: money(raw * share) });
    }
    lines.set(m.ifrs_code, line);
  }

  // OCI is not reachable by account mapping alone: the revaluation surplus and
  // translation reserve movements are the OCI items for this entity.
  if (statement === 'oci') {
    const sum = (prefixes) =>
      money(prefixes.reduce((t, p) => {
        let v = 0;
        for (const a of balances.values()) if (a.code.startsWith(p)) v = money(v + a.movement);
        return money(t + v);
      }, 0));
    lines.set('OCI.REVAL', {
      code: 'OCI.REVAL', label: 'Revaluation surplus on property, plant and equipment',
      label_fr: 'Ecart de reevaluation sur immobilisations',
      section: 'not_reclassified', note_ref: '5', sort_order: 100,
      amount: money(-sum(['106', '154'])), components: [],
    });
    lines.set('OCI.FX_TRANSLATION', {
      code: 'OCI.FX_TRANSLATION', label: 'Exchange differences on translating foreign operations',
      label_fr: 'Ecarts de conversion', section: 'reclassified', note_ref: '2', sort_order: 200,
      amount: money(-sum(['4781', '4782'])), components: [],
    });
  }

  const ordered = [...lines.values()].sort((a, b) => a.sort_order - b.sort_order);
  const sections = [];
  for (const line of ordered) {
    let section = sections.find((s) => s.key === line.section);
    if (!section) {
      const [fr, en] = IFRS_SECTION_LABELS[line.section] || [line.section, line.section];
      section = { key: line.section, label_fr: fr, label: en, lines: [], subtotal: 0 };
      sections.push(section);
    }
    section.lines.push(line);
    section.subtotal = money(section.subtotal + line.amount);
  }

  const result = { statement, framework: 'ifrs', from, to, sections };

  if (statement === 'sofp') {
    // Classes 6, 7 and 8 map to the P&L, so the result for the period would
    // otherwise never reach equity and the SOFP could not balance until the
    // year-end appropriation entry was posted.
    const periodResult = money(
      -[...balances.values()]
        .filter((a) => [6, 7, 8].includes(Number(a.account_class)))
        .reduce((t, a) => money(t + a.movement), 0)
    );
    if (periodResult !== 0) {
      const equity = sections.find((x) => x.key === 'equity');
      if (equity) {
        equity.lines.push({
          code: 'EQ.RESULT',
          label: 'Profit or loss for the period',
          label_fr: "Resultat de la periode",
          section: 'equity',
          sub_section: null,
          note_ref: null,
          sort_order: 9990,
          amount: periodResult,
          components: [],
        });
        equity.subtotal = money(equity.subtotal + periodResult);
      }
    }

    const s = (k) => sections.find((x) => x.key === k)?.subtotal ?? 0;
    const totalAssets = money(s('non_current_assets') + s('current_assets'));
    const totalEquity = s('equity');
    const totalLiabilities = money(s('non_current_liabilities') + s('current_liabilities'));
    result.totals = {
      total_assets: totalAssets,
      total_equity: totalEquity,
      total_liabilities: totalLiabilities,
      total_equity_and_liabilities: money(totalEquity + totalLiabilities),
    };
    result.check = {
      label: 'Total assets = Total equity and liabilities',
      difference: money(totalAssets - totalEquity - totalLiabilities),
      balanced: money(totalAssets - totalEquity - totalLiabilities) === 0,
    };
  }

  if (statement === 'pl') {
    const s = (k) => sections.find((x) => x.key === k)?.subtotal ?? 0;
    const revenue = s('revenue');
    const opex = s('operating_expenses');
    const operating = money(revenue - opex);
    const finance = s('finance');
    const tax = s('tax');
    result.totals = {
      total_income: revenue,
      total_operating_expenses: opex,
      operating_profit: operating,
      finance_result: finance,
      profit_before_tax: money(operating + finance),
      income_tax: tax,
      profit_for_the_year: money(operating + finance - tax),
    };
  }

  if (statement === 'oci') {
    result.totals = { total_oci: money(sections.reduce((t, s) => money(t + s.subtotal), 0)) };
  }

  return result;
}

/** IAS 7 statement of cash flows, indirect method. */
export async function buildCashFlow(db, orgId, { from, to }) {
  const balances = await loadBalances(db, orgId, { from, to, framework: 'ifrs' });
  const ev = (f) => evaluate(f, balances, {}).value ?? 0;

  // Movements are debit-positive, so income carries a negative movement and
  // expense a positive one; negating the whole of classes 6, 7 and 8 gives the
  // result for the period without having to enumerate every account.
  const netResult = money(-ev('MVT:+6,+7,+8'));

  const operating = [
    { label: 'Profit / (loss) for the year', label_fr: "Resultat net de l'exercice", amount: netResult },
    { label: 'Depreciation and amortisation', label_fr: 'Dotations aux amortissements', amount: ev('MVT:+681,+687,+852') },
    { label: 'Impairment losses net of reversals', label_fr: 'Pertes de valeur nettes des reprises', amount: money(ev('MVT:+694,+853') + ev('MVT:+794')) },
    { label: 'Provisions net of reversals', label_fr: 'Provisions nettes des reprises', amount: money(ev('MVT:+691,+697,+851,+854') + ev('MVT:+791,+799,+861')) },
    { label: 'Loss / (gain) on disposal of assets', label_fr: "Resultat de cession d'immobilisations", amount: money(ev('MVT:+81,+654') + ev('MVT:+82,+754')) },
    { label: 'Government grants released to income', label_fr: "Quote-part de subventions virees au resultat", amount: ev('MVT:+865') },
    { label: 'Change in inventories', label_fr: 'Variation des stocks', amount: ev('MVT:-31,-32,-33,-34,-35,-36,-37,-38,+39') },
    { label: 'Change in trade and other receivables', label_fr: 'Variation des creances', amount: ev('MVT:-409,-411,-412,-416,-418,+491,-421,-445,-4449,-45,-46,-471,-476,-485,-4881,+498') },
    { label: 'Change in trade and other payables', label_fr: 'Variation des dettes courantes', amount: ev('MVT:-401,-402,-408,-419,-422,-428,-431,-432,-438,-442,-4431,-4434,-4441,-447,-449,-462,-477,-4882,-499') },
    { label: 'Income tax paid', label_fr: 'Impots sur le resultat payes', amount: ev('MVT:-441') },
    // Interest is presented as a financing outflow below, so the expense that
    // is already inside the result has to be added back here.
    { label: 'Finance costs added back', label_fr: 'Charges financieres neutralisees', amount: ev('MVT:+671,+672,+674') },
  ];

  const investing = [
    { label: 'Purchase of intangible assets', label_fr: "Acquisitions d'immobilisations incorporelles", amount: ev('DR:-21') },
    { label: 'Purchase of property, plant and equipment', label_fr: "Acquisitions d'immobilisations corporelles", amount: ev('DR:-22,-23,-24,-25') },
    { label: 'Purchase of financial assets', label_fr: "Acquisitions d'immobilisations financieres", amount: ev('DR:-26,-27') },
    // An asset capitalised against a supplier of fixed assets has not been paid
    // for yet, so the unpaid part is added back: only cash actually paid is an
    // investing outflow (IAS 7.43 keeps the non-cash part out of the statement).
    { label: 'Movement in amounts payable for capital expenditure', label_fr: "Variation des dettes sur acquisitions d'immobilisations", amount: ev('MVT:-481,-482') },
    { label: 'Proceeds from disposal of assets', label_fr: "Produits de cession d'immobilisations", amount: ev('CR:+82,+754') },
  ];

  const financing = [
    { label: 'Proceeds from capital contributions', label_fr: 'Augmentations de capital', amount: ev('CR:+101,+102,+104') },
    { label: 'Government capital grants received', label_fr: "Subventions d'investissement recues", amount: ev('CR:+141,+142,+143,+148') },
    { label: 'Proceeds from borrowings', label_fr: "Emprunts contractes", amount: ev('CR:+16,+17,+18') },
    { label: 'Repayment of borrowings and lease liabilities', label_fr: 'Remboursements d emprunts et de dettes de location', amount: ev('DR:-16,-17,-18') },
    { label: 'Interest paid', label_fr: 'Interets payes', amount: ev('MVT:-671,-672,-674') },
    { label: 'Dividends paid', label_fr: 'Dividendes verses', amount: ev('DR:-462') },
  ];

  const total = (rows) => money(rows.reduce((t, r) => money(t + r.amount), 0));
  const openingCash = ev('OPEN:+50,+51,+52,+53,+55,+57,+58,-561,-565');
  const closingCash = ev('BAL:+50,+51,+52,+53,+55,+57,+58,-561,-565');

  const sections = [
    { key: 'operating', label: 'Cash flows from operating activities', label_fr: "Flux de tresorerie lies a l'exploitation", lines: operating, subtotal: total(operating) },
    { key: 'investing', label: 'Cash flows from investing activities', label_fr: "Flux de tresorerie lies a l'investissement", lines: investing, subtotal: total(investing) },
    { key: 'financing', label: 'Cash flows from financing activities', label_fr: 'Flux de tresorerie lies au financement', lines: financing, subtotal: total(financing) },
  ];

  const netChange = money(sections.reduce((t, s) => money(t + s.subtotal), 0));
  return {
    statement: 'cf',
    framework: 'ifrs',
    from,
    to,
    sections,
    totals: {
      net_change: netChange,
      opening_cash: openingCash,
      closing_cash_calculated: money(openingCash + netChange),
      closing_cash_ledger: closingCash,
    },
    check: {
      label: 'Calculated closing cash = ledger cash',
      difference: money(openingCash + netChange - closingCash),
      balanced: money(openingCash + netChange - closingCash) === 0,
    },
  };
}

/** IAS 1 statement of changes in equity. */
export async function buildChangesInEquity(db, orgId, { from, to }) {
  const balances = await loadBalances(db, orgId, { from, to, framework: 'ifrs' });
  const ev = (f) => evaluate(f, balances, {}).value ?? 0;

  const columns = [
    { key: 'capital', label: 'Share capital and endowment', label_fr: 'Capital et dotation', formula: '+101,+102,+109' },
    { key: 'premium', label: 'Share premium', label_fr: 'Primes liees au capital', formula: '+104' },
    { key: 'revaluation', label: 'Revaluation surplus', label_fr: 'Ecarts de reevaluation', formula: '+105,+154' },
    { key: 'reserves', label: 'Other reserves', label_fr: 'Autres reserves', formula: '+11,+151,+152' },
    { key: 'retained', label: 'Retained earnings', label_fr: 'Report a nouveau', formula: '+12,+13' },
  ];
  // Capital grants (class 14) are deliberately absent: the IFRS mapping presents
  // them as deferred income under IAS 20, so including them here would make the
  // closing equity disagree with the statement of financial position.

  const opening = {};
  const closing = {};
  const movement = {};
  for (const c of columns) {
    opening[c.key] = money(-ev(`OPEN:${c.formula}`));
    closing[c.key] = money(-ev(`BAL:${c.formula}`));
    movement[c.key] = money(closing[c.key] - opening[c.key]);
  }

  // Until the year-end appropriation entry is posted, the result is still in
  // classes 6/7/8 rather than account 13, so read it from the movement there
  // and carry it into the retained earnings column.
  const profit = money(-ev('MVT:+6,+7,+8'));
  closing.retained = money(closing.retained + profit);
  const revalMovement = movement.revaluation;

  const totalOf = (obj) => money(columns.reduce((t, c) => money(t + obj[c.key]), 0));
  const contributions = money(movement.capital + movement.premium);

  const rows = [
    { label: 'Balance at the beginning of the period', label_fr: 'Solde a l ouverture', values: { ...opening }, total: totalOf(opening), is_total: true },
    { label: 'Profit or loss for the period', label_fr: "Resultat de la periode", values: { ...empty(columns), retained: profit }, total: profit },
    { label: 'Other comprehensive income - revaluation surplus', label_fr: 'Autres elements du resultat global - reevaluation', values: { ...empty(columns), revaluation: revalMovement }, total: revalMovement },
    { label: 'Capital contributions', label_fr: 'Apports en capital', values: { ...empty(columns), capital: movement.capital, premium: movement.premium }, total: contributions },
    { label: 'Appropriations and transfers', label_fr: 'Affectations et virements', values: { ...empty(columns), reserves: movement.reserves, retained: movement.retained }, total: money(movement.reserves + movement.retained) },
    { label: 'Balance at the end of the period', label_fr: 'Solde a la cloture', values: { ...closing }, total: totalOf(closing), is_total: true },
  ];

  // The statement articulates when the movement rows bridge opening to closing.
  const bridged = money(rows.slice(0, -1).reduce((t, r) => money(t + r.total), 0));
  return {
    statement: 'soce',
    framework: 'ifrs',
    from,
    to,
    columns,
    rows,
    check: {
      label: 'Opening equity + movements = closing equity',
      difference: money(bridged - totalOf(closing)),
      balanced: money(bridged - totalOf(closing)) === 0,
    },
  };
}

const empty = (columns) => Object.fromEntries(columns.map((c) => [c.key, 0]));

/**
 * IAS 16 property, plant and equipment note, sourced from the asset register
 * (FR-STD-002 / FR-STD-010 both require the fixed-asset note to come from the
 * register rather than being keyed separately).
 */
export async function buildPpeNote(db, orgId, { from, to, basis = 'ifrs' }) {
  const b = basis === 'ohada' ? 'ohada' : 'ifrs';

  const rows = await db.query(
    `SELECT c.domain,
            c.code AS category_code,
            COALESCE(c.parent_id, c.id) AS group_id,
            COUNT(*) AS asset_count,
            SUM(a.${b}_cost) AS cost,
            SUM(a.${b}_accum_depr) AS accum_depr,
            ${b === 'ifrs' ? 'SUM(a.ifrs_accum_impairment)' : '0'} AS accum_impairment,
            ${b === 'ifrs' ? 'SUM(a.ifrs_revaluation_surplus)' : '0'} AS revaluation_surplus,
            SUM(a.${b}_cost - a.${b}_accum_depr${b === 'ifrs' ? ' - a.ifrs_accum_impairment' : ''}) AS carrying
       FROM assets a
       JOIN asset_categories c ON c.id = a.category_id
      WHERE a.org_id = ? AND a.is_capitalized = 1 AND a.status <> 'disposed'
      GROUP BY c.domain
      ORDER BY FIELD(c.domain, 'mining','production','biomedical','facility','fleet','it_office','services')`,
    [orgId]
  );

  const additions = await db.query(
    `SELECT c.domain, COUNT(*) AS n, SUM(a.${b}_cost) AS amount
       FROM assets a
       JOIN asset_categories c ON c.id = a.category_id
      WHERE a.org_id = ? AND a.is_capitalized = 1
        AND a.capitalization_date BETWEEN ? AND ?
      GROUP BY c.domain`,
    [orgId, from, to]
  );

  const disposals = await db.query(
    `SELECT c.domain, COUNT(*) AS n,
            SUM(d.${b}_cost) AS cost, SUM(d.${b}_accum_depr) AS accum_depr,
            SUM(d.${b}_carrying_amount) AS carrying, SUM(d.${b}_gain_loss) AS gain_loss
       FROM asset_disposals d
       JOIN assets a ON a.id = d.asset_id
       JOIN asset_categories c ON c.id = a.category_id
      WHERE d.org_id = ? AND d.status = 'completed' AND d.disposal_date BETWEEN ? AND ?
      GROUP BY c.domain`,
    [orgId, from, to]
  );

  const charge = await db.query(
    `SELECT c.domain, SUM(dl.depreciation_amount) AS amount
       FROM depreciation_lines dl
       JOIN depreciation_runs r ON r.id = dl.run_id
       JOIN assets a ON a.id = dl.asset_id
       JOIN asset_categories c ON c.id = a.category_id
       JOIN accounting_periods p ON p.id = dl.period_id
      WHERE dl.org_id = ? AND dl.basis = ? AND r.status = 'posted'
        AND p.start_date >= ? AND p.end_date <= ?
      GROUP BY c.domain`,
    [orgId, b, from, to]
  );

  const idx = (list, key = 'domain') => Object.fromEntries(list.map((r) => [r[key], r]));
  const addIdx = idx(additions);
  const dispIdx = idx(disposals);
  const chgIdx = idx(charge);

  const DOMAIN_LABEL = {
    mining: ['Installations et materiel minier', 'Mining and heavy extraction plant'],
    production: ['Materiel et outillage industriel de production', 'Production and manufacturing equipment'],
    facility: ['Terrains, batiments et installations techniques', 'Land, buildings and technical installations'],
    biomedical: ['Materiel biomedical et clinique', 'Biomedical and clinical equipment'],
    fleet: ['Materiel de transport et engins', 'Transport fleet and heavy mobile equipment'],
    it_office: ['Materiel, mobilier et informatique', 'Equipment, furniture and IT'],
    services: ['Equipements de services generaux', 'General services and operations equipment'],
  };

  const classes = rows.map((r) => {
    const [fr, en] = DOMAIN_LABEL[r.domain] || [r.domain, r.domain];
    const additionsAmount = money(addIdx[r.domain]?.amount ?? 0);
    const disposalCost = money(dispIdx[r.domain]?.cost ?? 0);
    const disposalAccum = money(dispIdx[r.domain]?.accum_depr ?? 0);
    const chargeAmount = money(chgIdx[r.domain]?.amount ?? 0);
    const cost = money(r.cost);
    const accum = money(r.accum_depr);
    return {
      domain: r.domain,
      label_fr: fr,
      label: en,
      asset_count: Number(r.asset_count),
      opening_cost: money(cost - additionsAmount + disposalCost),
      additions: additionsAmount,
      disposals_cost: disposalCost,
      revaluation: money(r.revaluation_surplus),
      closing_cost: cost,
      opening_accum_depr: money(accum - chargeAmount + disposalAccum),
      depreciation_charge: chargeAmount,
      disposals_accum_depr: disposalAccum,
      closing_accum_depr: accum,
      accum_impairment: money(r.accum_impairment),
      carrying_amount: money(r.carrying),
    };
  });

  const sum = (k) => money(classes.reduce((t, c) => money(t + c[k]), 0));
  return {
    statement: 'PPE_NOTE',
    basis: b,
    from,
    to,
    classes,
    totals: {
      opening_cost: sum('opening_cost'),
      additions: sum('additions'),
      disposals_cost: sum('disposals_cost'),
      revaluation: sum('revaluation'),
      closing_cost: sum('closing_cost'),
      opening_accum_depr: sum('opening_accum_depr'),
      depreciation_charge: sum('depreciation_charge'),
      disposals_accum_depr: sum('disposals_accum_depr'),
      closing_accum_depr: sum('closing_accum_depr'),
      accum_impairment: sum('accum_impairment'),
      carrying_amount: sum('carrying_amount'),
    },
  };
}

/**
 * Ties the asset register back to the fixed-asset accounts in the general
 * ledger. This is the acceptance test in SRS section 10: "depreciation
 * postings from the asset module tie out to the general ledger with zero
 * variance".
 */
export async function reconcileAssetRegisterToLedger(db, orgId, { asOf, basis = 'ohada' }) {
  const framework = basis === 'ifrs' ? 'ifrs' : 'ohada';
  const balances = await loadBalances(db, orgId, { from: '1900-01-01', to: asOf, framework });

  const categories = await db.query(
    `SELECT c.id, c.code, c.name, c.domain,
            ga.code AS gross_account, aa.code AS accum_account
       FROM asset_categories c
       LEFT JOIN accounts ga ON ga.id = c.asset_account_id
       LEFT JOIN accounts aa ON aa.id = c.accum_depr_account_id
      WHERE c.org_id = ?`,
    [orgId]
  );

  // The register has to be read as it stood at the reporting date, not as it
  // stands today: an asset capitalized next month is not yet in the ledger
  // balance, and one disposed next month still is.
  const registerRows = await db.query(
    `SELECT a.category_id,
            SUM(${basis === 'ifrs' ? 'a.ifrs_cost' : 'a.ohada_cost'}) AS cost,
            SUM(${basis === 'ifrs' ? 'a.ifrs_accum_depr + a.ifrs_accum_impairment' : 'a.ohada_accum_depr'}) AS accum,
            COUNT(*) AS n
       FROM assets a
       LEFT JOIN asset_disposals d ON d.id = a.disposal_id AND d.status = 'completed'
      WHERE a.org_id = ? AND a.is_capitalized = 1
        AND COALESCE(a.capitalization_date, a.acquisition_date) <= ?
        AND (a.status <> 'disposed' OR d.disposal_date > ?)
      GROUP BY a.category_id`,
    [orgId, asOf, asOf]
  );
  const register = Object.fromEntries(registerRows.map((r) => [r.category_id, r]));

  // An asset carries its accumulated depreciation as a running total, so that
  // figure is current rather than as at the reporting date. The ledger side is
  // cut at asOf, so anything charged by a run dated later has to come back off
  // the register side or the two would never agree mid-period.
  // Scoped to the same assets the register side counted, so an asset that is
  // not yet in the register cannot have a charge deducted from it.
  const laterCharges = await db.query(
    `SELECT a.category_id, SUM(l.depreciation_amount) AS charged
       FROM depreciation_lines l
       JOIN depreciation_runs r ON r.id = l.run_id
       JOIN assets a ON a.id = l.asset_id
       LEFT JOIN asset_disposals d ON d.id = a.disposal_id AND d.status = 'completed'
      WHERE l.org_id = ? AND l.basis = ? AND r.status = 'posted' AND r.run_date > ?
        AND a.is_capitalized = 1
        AND COALESCE(a.capitalization_date, a.acquisition_date) <= ?
        AND (a.status <> 'disposed' OR d.disposal_date > ?)
      GROUP BY a.category_id`,
    [orgId, framework, asOf, asOf, asOf]
  );
  for (const row of laterCharges) {
    const r = register[row.category_id];
    if (r) r.accum = Number(r.accum) - Number(row.charged);
  }

  // Impairment is only carried on the IFRS basis, and the same cut applies.
  if (framework === 'ifrs') {
    const laterImpairments = await db.query(
      `SELECT a.category_id, SUM(i.impairment_loss - i.reversal_amount) AS net_loss
         FROM asset_impairments i
         JOIN assets a ON a.id = i.asset_id
         LEFT JOIN asset_disposals d ON d.id = a.disposal_id AND d.status = 'completed'
        WHERE i.org_id = ? AND i.status = 'posted' AND i.test_date > ?
          AND a.is_capitalized = 1
          AND COALESCE(a.capitalization_date, a.acquisition_date) <= ?
          AND (a.status <> 'disposed' OR d.disposal_date > ?)
        GROUP BY a.category_id`,
      [orgId, asOf, asOf, asOf]
    );
    for (const row of laterImpairments) {
      const r = register[row.category_id];
      if (r) r.accum = Number(r.accum) - Number(row.net_loss);
    }
  }

  // Many categories share one GL account - every biomedical class posts its
  // depreciation to 2842, for example - so the comparison has to be made once
  // per GL account, with the register side aggregated across all categories
  // that point at it. Comparing per category/account pair would measure the
  // same ledger balance several times over.
  const byAccount = new Map();
  const bucket = (code, kind) => {
    const key = `${kind}:${code}`;
    if (!byAccount.has(key)) {
      byAccount.set(key, { account: code, kind, categories: [], register: 0, asset_count: 0 });
    }
    return byAccount.get(key);
  };

  for (const c of categories) {
    const r = register[c.id];
    if (c.gross_account) {
      const b = bucket(c.gross_account, 'gross');
      b.categories.push(c.code);
      if (r) {
        b.register = money(b.register + Number(r.cost));
        b.asset_count += Number(r.n);
      }
    }
    if (c.accum_account) {
      const b = bucket(c.accum_account, 'accumulated');
      if (!b.categories.includes(c.code)) b.categories.push(c.code);
      if (r) b.register = money(b.register + Number(r.accum));
    }
  }

  // Postings land on the exact account carried by the category, so match on
  // the code rather than a prefix - a prefix would swallow sibling accounts.
  const ledgerOf = (code) => money(balances.get(code)?.closing ?? 0);

  const rows = [...byAccount.values()]
    .map((e) => {
      // Accumulated depreciation is a credit balance; state it positive so it
      // can be compared with the register figure directly.
      const ledger = e.kind === 'accumulated' ? money(-ledgerOf(e.account)) : ledgerOf(e.account);
      return {
        ...e,
        account_name: balances.get(e.account)?.name ?? null,
        ledger,
        variance: money(e.register - ledger),
      };
    })
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.account.localeCompare(b.account));

  const sumBy = (kind, field) =>
    money(rows.filter((r) => r.kind === kind).reduce((t, r) => money(t + r[field]), 0));

  const totals = {
    register_cost: sumBy('gross', 'register'),
    ledger_cost: sumBy('gross', 'ledger'),
    register_accum: sumBy('accumulated', 'register'),
    ledger_accum: sumBy('accumulated', 'ledger'),
  };
  totals.cost_variance = money(totals.register_cost - totals.ledger_cost);
  totals.accum_variance = money(totals.register_accum - totals.ledger_accum);
  totals.reconciled = rows.every((r) => r.variance === 0);

  return { as_of: asOf, basis, rows, totals };
}

function trialBalanceTotals(rows) {
  const totals = rows.reduce(
    (t, r) => ({
      opening_debit: money(t.opening_debit + r.opening_debit),
      opening_credit: money(t.opening_credit + r.opening_credit),
      period_debit: money(t.period_debit + r.period_debit),
      period_credit: money(t.period_credit + r.period_credit),
      ytd_debit: money(t.ytd_debit + (r.ytd_debit ?? (r.opening_debit + r.period_debit))),
      ytd_credit: money(t.ytd_credit + (r.ytd_credit ?? (r.opening_credit + r.period_credit))),
      closing_debit: money(t.closing_debit + r.closing_debit),
      closing_credit: money(t.closing_credit + r.closing_credit),
    }),
    {
      opening_debit: 0, opening_credit: 0,
      period_debit: 0, period_credit: 0,
      ytd_debit: 0, ytd_credit: 0,
      closing_debit: 0, closing_credit: 0,
    }
  );
  totals.balanced =
    totals.period_debit === totals.period_credit && totals.closing_debit === totals.closing_credit;
  return totals;
}

/**
 * IFRS trial balance: SYSCOHADA movements (both + IFRS-only) rolled up to the
 * IAS 1 presentation lines. One posting still lives on the statutory chart.
 */
export async function buildIfrsTrialBalance(db, orgId, { from, to, costCenterId = null, includeZero = false }) {
  const balances = await loadBalances(db, orgId, { from, to, framework: 'ifrs', costCenterId });
  const mappings = await db.query(
    `SELECT m.allocation_pct, a.code AS account_code, a.name AS account_name, a.name_en,
            i.id AS ifrs_id, i.code AS ifrs_code, i.name AS ifrs_name, i.name_fr,
            i.statement, i.section, i.sort_order
       FROM account_mappings m
       JOIN accounts a ON a.id = m.account_id
       JOIN ifrs_accounts i ON i.id = m.ifrs_account_id
      WHERE m.org_id = ? AND i.statement IN ('sofp', 'pl')
      ORDER BY i.sort_order, a.code`,
    [orgId]
  );

  const lines = new Map();
  for (const m of mappings) {
    const acct = balances.get(m.account_code);
    if (!acct) continue;
    const share = (Number(m.allocation_pct) || 100) / 100;
    const opening = money(acct.opening * share);
    const debit = money(acct.debit * share);
    const credit = money(acct.credit * share);
    const line = lines.get(m.ifrs_code) || {
      id: m.ifrs_id,
      code: m.ifrs_code,
      name: m.ifrs_name,
      name_fr: m.ifrs_name_fr,
      statement: m.statement,
      section: m.section,
      sort_order: m.sort_order,
      opening: 0,
      debit: 0,
      credit: 0,
      components: [],
    };
    line.opening = money(line.opening + opening);
    line.debit = money(line.debit + debit);
    line.credit = money(line.credit + credit);
    if (opening || debit || credit) {
      line.components.push({
        code: m.account_code,
        name: m.account_name,
        name_en: m.name_en,
        opening,
        debit,
        credit,
      });
    }
    lines.set(m.ifrs_code, line);
  }

  const rows = [...lines.values()]
    .filter((l) => includeZero || l.opening !== 0 || l.debit !== 0 || l.credit !== 0)
    .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code))
    .map((l) => {
      const closing = money(l.opening + l.debit - l.credit);
      const opDr = l.opening > 0 ? l.opening : 0;
      const opCr = l.opening < 0 ? money(-l.opening) : 0;
      return {
        id: l.id,
        code: l.code,
        name: l.name,
        name_fr: l.name_fr,
        statement: l.statement,
        section: l.section,
        opening_debit: opDr,
        opening_credit: opCr,
        period_debit: l.debit,
        period_credit: l.credit,
        ytd_debit: money(opDr + l.debit),
        ytd_credit: money(opCr + l.credit),
        closing_debit: closing > 0 ? closing : 0,
        closing_credit: closing < 0 ? money(-closing) : 0,
        components: l.components,
      };
    });

  return {
    from, to, framework: 'ifrs', presentation: 'ifrs',
    rows, totals: trialBalanceTotals(rows),
  };
}

export async function buildTrialBalance(db, orgId, { from, to, framework = 'ohada', costCenterId = null, includeZero = false }) {
  if (framework === 'ifrs') {
    return buildIfrsTrialBalance(db, orgId, { from, to, costCenterId, includeZero });
  }

  const balances = await loadBalances(db, orgId, { from, to, framework, costCenterId });
  const rows = [...balances.values()]
    .filter((a) => includeZero || a.opening !== 0 || a.debit !== 0 || a.credit !== 0)
    .map((a) => {
      const opDr = a.opening > 0 ? a.opening : 0;
      const opCr = a.opening < 0 ? money(-a.opening) : 0;
      return {
        code: a.code,
        name: a.name,
        name_en: a.name_en,
        account_class: a.account_class,
        opening_debit: opDr,
        opening_credit: opCr,
        period_debit: a.debit,
        period_credit: a.credit,
        ytd_debit: money(opDr + a.debit),
        ytd_credit: money(opCr + a.credit),
        closing_debit: a.closing > 0 ? a.closing : 0,
        closing_credit: a.closing < 0 ? money(-a.closing) : 0,
      };
    });

  return { from, to, framework, rows, totals: trialBalanceTotals(rows) };
}

export { evaluate as evaluateFormula, parseFormula, FRAMEWORK_FILTER, addDays, toISO };
