import { Router } from 'express';
import { handler } from '../middleware/index.js';
import * as bankService from '../services/bank-reconciliation.service.js';
import { seedPhase1 } from '../db/seed_phase1.js';

export const bankRoutes = Router();

bankRoutes.get('/bank/accounts', handler(async (req, res) => {
  const accounts = await bankService.listBankAccounts(req.orgId);
  res.json({ rows: accounts });
}));

bankRoutes.get('/bank/accounts/:id', handler(async (req, res) => {
  const ba = await bankService.getBankAccount(req.orgId, Number(req.params.id));
  res.json(ba);
}));

bankRoutes.get('/bank/accounts/:id/statements', handler(async (req, res) => {
  let statements = await bankService.listStatements(req.orgId, Number(req.params.id));
  if (!statements || statements.length === 0) {
    await seedPhase1(req.orgId).catch(console.error);
    statements = await bankService.listStatements(req.orgId, Number(req.params.id));
  }
  res.json({ rows: statements });
}));

bankRoutes.post('/bank/accounts/:id/statements', handler(async (req, res) => {
  const result = await bankService.importStatement(req.orgId, Number(req.params.id), req.body, req.user?.id);
  res.status(201).json(result);
}));

bankRoutes.get('/bank/statements/:id/lines', handler(async (req, res) => {
  const result = await bankService.getStatementLines(req.orgId, Number(req.params.id));
  res.json(result);
}));

bankRoutes.get('/bank/accounts/:id/unreconciled-ledger', handler(async (req, res) => {
  const rows = await bankService.getUnreconciledLedgerLines(req.orgId, Number(req.params.id), req.query);
  res.json({ rows });
}));

bankRoutes.post('/bank/statements/:id/auto-reconcile', handler(async (req, res) => {
  const result = await bankService.autoReconcile(req.orgId, Number(req.params.id), req.user?.id);
  res.json(result);
}));

bankRoutes.post('/bank/reconcile-manual', handler(async (req, res) => {
  const { statement_line_id, journal_line_id } = req.body;
  const result = await bankService.manualReconcile(req.orgId, Number(statement_line_id), Number(journal_line_id), req.user?.id);
  res.json(result);
}));

bankRoutes.post('/bank/statement-lines/:id/unreconcile', handler(async (req, res) => {
  const result = await bankService.unreconcile(req.orgId, Number(req.params.id));
  res.json(result);
}));

bankRoutes.get('/bank/accounts/:id/statements/:stmtId/reconciliation-report', handler(async (req, res) => {
  const report = await bankService.getReconciliationReport(
    req.orgId,
    Number(req.params.id),
    Number(req.params.stmtId)
  );
  res.json(report);
}));

bankRoutes.post('/bank/accounts/:id/post-charge', handler(async (req, res) => {
  const result = await bankService.postBankCharge(
    req.orgId,
    Number(req.params.id),
    req.body,
    req.user
  );
  res.status(201).json(result);
}));
