import * as sageService from '../src/services/sage.service.js';
import { query, queryOne } from '../src/db/pool.js';

console.log('='.repeat(70));
console.log('LEDGERCORE HEALTH — SAGE 100c / SAGE X3 & MULTI-BRANCH VERIFICATION');
console.log('='.repeat(70));

let passCount = 0;
let failCount = 0;

function assert(condition, testName, extra = '') {
  if (condition) {
    console.log(`  PASS  ${testName}${extra ? ` -> ${extra}` : ''}`);
    passCount++;
  } else {
    console.error(`  FAIL  ${testName}${extra ? ` -> ${extra}` : ''}`);
    failCount++;
  }
}

async function run() {
  const orgId = 1;

  // 1. Technical API Specification
  console.log('\n1. Sage Integration Specification & Service Metadata');
  const spec = sageService.getSageIntegrationSpec();
  assert(spec && spec.service.includes('Sage'), 'Specification metadata returned');
  assert(spec.endpoints.push_commitment && spec.endpoints.export_budget, 'Core Sage endpoints declared in specification');

  // 2. Branch Establishments with ERP Profiles
  console.log('\n2. Enterprise Establishments & ERP Profiles (Multi-Branch)');
  const branchesRes = await sageService.listSageBranches(orgId);
  assert(branchesRes.total >= 4, 'Branch network established', `${branchesRes.total} branches found`);
  
  const sage100Branches = branchesRes.rows.filter(b => b.erp_system.includes('sage_100'));
  const sageX3Branches = branchesRes.rows.filter(b => b.erp_system === 'sage_x3');
  assert(sage100Branches.length >= 2, 'Sage 100c branches active in network', `${sage100Branches.map(b => b.code).join(', ')}`);
  assert(sageX3Branches.length >= 1, 'Sage X3 branch active in network', `${sageX3Branches.map(b => b.code).join(', ')}`);

  // 3. Sage Budget Export (PNM, CSV, JSON)
  console.log('\n3. Sage 100 Budget Exchange Exports');
  const pnmExp = await sageService.exportBudgetToSageFormat(orgId, 1, 'pnm');
  assert(pnmExp.filename.endsWith('.PNM'), 'Sage 100 PNM format export generated', pnmExp.filename);
  assert(pnmExp.content.includes('#SAGE100_BUDGET_EXPORT'), 'PNM header matches Sage 100 standard');
  assert(pnmExp.lineCount > 50, 'Budget envelopes exported in PNM', `${pnmExp.lineCount} lines`);

  const csvExp = await sageService.exportBudgetToSageFormat(orgId, 1, 'csv');
  assert(csvExp.filename.endsWith('.csv'), 'Sage CSV format export generated', csvExp.filename);
  assert(csvExp.content.includes('Code Poste;Intitulé'), 'CSV header matches Sage Import Wizard standard');

  const jsonExp = await sageService.exportBudgetToSageFormat(orgId, 1, 'json');
  assert(jsonExp.filename.endsWith('.json'), 'Sage REST JSON export generated', jsonExp.filename);
  const parsedJson = JSON.parse(jsonExp.content);
  assert(parsedJson.postes_budgetaires && parsedJson.postes_budgetaires.length > 0, 'JSON contains structured postes_budgetaires');

  // 4. Sage Budget Import (File-based batch ingestion)
  console.log('\n4. Sage Budget Import & Parser');
  const sampleImport = `
#SAGE100_BUDGET_EXPORT;VERSION=10.0
#CODE_POSTE;INTITULE;COMPTE;SECTION;MONTANT;T1;T2;T3;T4
BGT-2412-IMG;Equipements radiologie numerique;2412;ADM;15000000;3750000;3750000;3750000;3750000
BGT-2442-INF;Parc informatique et serveurs;2442;ADM;8000000;2000000;2000000;2000000;2000000
`;
  const dryRun = await sageService.importBudgetFromSage(orgId, {
    budgetId: 1,
    content: sampleImport,
    dryRun: true,
  });
  assert(dryRun.dryRun === true && dryRun.validCount === 2, 'Sage import dry-run validation verified', '2 lines validated');

  const liveImport = await sageService.importBudgetFromSage(orgId, {
    budgetId: 1,
    content: sampleImport,
    dryRun: false,
  });
  assert(liveImport.success === true, 'Sage import committed to budget', liveImport.message);

  // Clean previous verify commitments on 2412
  await query(`DELETE FROM budget_commitments WHERE commitment_number LIKE 'PO-SAGE-VERIFY-%'`);

  // 5. Sage Purchase Commitment Ingestion with Real-Time AVC
  console.log('\n5. Sage Purchase Commitment Ingestion & AVC Availability Check');
  const testCommitNum = `PO-SAGE-VERIFY-${Date.now()}`;
  const commitRes = await sageService.ingestSageCommitment(orgId, {
    branch_code: 'YAOUNDE-LIAISON',
    commitment_number: testCommitNum,
    account_code: '2412',
    amount: 2000000,
    vendor_name: 'Siemens Healthineers Africa',
    description: 'Contrat maintenance Doppler cardiaque',
  });
  assert(commitRes.success === true, 'Sage commitment approved within budget envelope', `Auth Code: ${commitRes.authorization_code}`);
  assert(commitRes.remaining_available >= 0, 'Remaining budget correctly calculated', `Available: ${commitRes.remaining_available} XAF`);

  // Test idempotency
  const dupCommit = await sageService.ingestSageCommitment(orgId, {
    branch_code: 'YAOUNDE-LIAISON',
    commitment_number: testCommitNum,
    account_code: '2412',
    amount: 2000000,
  });
  assert(dupCommit.duplicate === true, 'Idempotent ingestion prevents duplicate commitments from Sage');

  // Test budget breach blocking
  console.log('\n6. Statutory Overrun Protection (AVC Strict Block)');
  let breachBlocked = false;
  try {
    await sageService.ingestSageCommitment(orgId, {
      branch_code: 'YAOUNDE-LIAISON',
      commitment_number: `PO-SAGE-BREACH-${Date.now()}`,
      account_code: '2412',
      amount: 999999999, // Exceeds budget
      description: 'Massive unauthorized expenditure attempt',
    });
  } catch (err) {
    breachBlocked = err.status === 409 || err.message.includes('Plafond budgétaire dépassé');
  }
  assert(breachBlocked, 'Strict AVC check blocks budget breach and logs incident');

  // 7. Multi-Branch Budget Consolidation
  console.log('\n7. Consolidated Network Budget Execution Matrix');
  const consol = await sageService.getConsolidatedBranchBudget(orgId);
  const consolBranches = consol.matrix || consol.branches || [];
  const totAlloc = consol.summary ? consol.summary.total_allocated : consol.totals.totalAllocated;
  assert(consolBranches.length >= 4, 'Multi-branch consolidation matrix assembled', `${consolBranches.length} branches`);
  assert(totAlloc > 0, 'Consolidated network budget calculated', `${totAlloc} XAF`);

  // 8. Inter-Branch Budget Appropriation & Account 18 Liaison
  console.log('\n8. Inter-Branch Budget Appropriation & Reciprocal Liaison (Compte 18)');
  const alloc = await sageService.createInterbranchBudgetAllocation(orgId, {
    budget_id: 1,
    source_branch_id: 1,
    dest_branch_id: 4,
    allocation_date: '2026-10-26',
    amount: 5000000,
    notes: 'Dotation complémentaire urgences cardiologie Yaoundé (Sage 100)',
    post_liaison_entry: true,
  });
  assert(alloc.success === true, 'Inter-branch budget allocation issued', alloc.allocation_number);
  assert(alloc.remote_sync_ref && alloc.remote_sync_ref.includes('SAGE'), 'Remote Sage synchronization reference generated', alloc.remote_sync_ref);

  // 9. Audit Logging
  console.log('\n9. Sage Synchronization Audit Trail');
  const logs = await sageService.listSageSyncLogs(orgId, 10);
  assert(logs.total > 0, 'Audit trail logs recorded for all Sage interactions', `${logs.total} events logged`);

  console.log('\n' + '='.repeat(70));
  if (failCount === 0) {
    console.log(`ALL SAGE & MULTI-BRANCH TESTS PASSED (${passCount} passed, 0 failed).`);
    console.log('='.repeat(70));
    process.exit(0);
  } else {
    console.error(`TESTS FAILED (${passCount} passed, ${failCount} failed).`);
    console.log('='.repeat(70));
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('FATAL TEST ERROR:', err);
  process.exit(1);
});
