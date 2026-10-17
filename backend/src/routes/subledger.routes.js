import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, transaction } from '../db/pool.js';
import { handler, requirePermission, validate, requestContext } from '../middleware/index.js';
import { writeAudit } from '../services/auth.service.js';
import {
  listSubledgerAccounts,
  buildAuxiliaryBalance,
  buildAuxiliaryLedger,
  getOpenItems,
  matchLines,
  unmatchLines,
} from '../services/subledger.service.js';
import { actorOf, isoDate, optionalId, boolish, reportRange } from './helpers.js';

export const subledgerRoutes = Router();

subledgerRoutes.get(
  '/subledger/accounts',
  requirePermission('journal.view'),
  validate({
    query: z.object({
      collectiveAccountId: optionalId,
      partnerType: z.enum(['supplier', 'customer', 'employee', 'other']).optional(),
      activeOnly: boolish.default(true),
    }),
  }),
  handler(async (req, res) => {
    const rows = await listSubledgerAccounts({ query }, req.orgId, req.query);
    res.json({ rows, total: rows.length });
  })
);

subledgerRoutes.post(
  '/subledger/accounts',
  requirePermission('coa.manage'),
  validate({
    body: z.object({
      code: z.string().trim().min(2).max(30),
      name: z.string().trim().min(2).max(200),
      collectiveAccountId: z.coerce.number().positive(),
      partnerType: z.enum(['supplier', 'customer', 'employee', 'other']).default('other'),
      partnerId: optionalId.nullable(),
    }),
  }),
  handler(async (req, res) => {
    const { code, name, collectiveAccountId, partnerType, partnerId } = req.body;
    const coll = await queryOne('SELECT * FROM accounts WHERE id = ? AND org_id = ?', [
      collectiveAccountId,
      req.orgId,
    ]);
    if (!coll) return res.status(404).json({ error: 'Collective account not found.' });

    const result = await query(
      `INSERT INTO subledger_accounts (org_id, code, name, collective_account_id, partner_type, partner_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.orgId, code, name, collectiveAccountId, partnerType, partnerId ?? null]
    );

    const created = await queryOne('SELECT * FROM subledger_accounts WHERE id = ?', [result.insertId]);
    await writeAudit({
      orgId: req.orgId,
      userId: req.user.id,
      action: 'create',
      entity: 'subledger_account',
      entityId: created.id,
      summary: `Compte auxiliaire tiers créé : ${created.code} - ${created.name}`,
      after: created,
      context: requestContext(req),
    });

    res.status(201).json({ subledger: created });
  })
);

subledgerRoutes.get(
  '/subledger/balance',
  requirePermission('journal.view', 'report.financial'),
  validate({
    query: z.object({
      from: isoDate.optional(),
      to: isoDate.optional(),
      costCenterId: optionalId,
      collectiveAccountId: optionalId,
      partnerType: z.enum(['supplier', 'customer', 'employee', 'other']).optional(),
      includeZero: boolish.default(false),
    }),
  }),
  handler(async (req, res) => {
    const result = await buildAuxiliaryBalance({ query }, req.orgId, req.query);
    res.json(result);
  })
);

subledgerRoutes.get(
  '/subledger/ledger/:id',
  requirePermission('journal.view'),
  validate({
    query: z.object({
      from: isoDate.optional(),
      to: isoDate.optional(),
      costCenterId: optionalId,
      matchFilter: z.enum(['all', 'unmatched', 'matched']).default('all'),
    }),
  }),
  handler(async (req, res) => {
    const result = await buildAuxiliaryLedger({ query, queryOne }, req.orgId, {
      subledgerId: Number(req.params.id),
      ...req.query,
    });
    res.json(result);
  })
);

subledgerRoutes.get(
  '/subledger/open-items',
  requirePermission('journal.view'),
  validate({
    query: z.object({
      subledgerId: optionalId,
      collectiveAccountId: optionalId,
      partnerType: z.enum(['supplier', 'customer', 'employee', 'other']).optional(),
      from: isoDate.optional(),
      to: isoDate.optional(),
    }),
  }),
  handler(async (req, res) => {
    const rows = await getOpenItems({ query }, req.orgId, req.query);
    res.json({ rows, total: rows.length });
  })
);

subledgerRoutes.post(
  '/subledger/match',
  requirePermission('journal.post'),
  validate({
    body: z.object({
      lineIds: z.array(z.coerce.number().positive()).min(2, 'Select at least two lines to match.'),
      customMatchCode: z.string().trim().max(10).optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const result = await transaction((tx) =>
      matchLines(tx, req.orgId, {
        lineIds: req.body.lineIds,
        customMatchCode: req.body.customMatchCode,
        actor: actorOf(req),
      })
    );

    await writeAudit({
      orgId: req.orgId,
      userId: req.user.id,
      action: 'match',
      entity: 'journal_lines',
      entityId: result.match_code,
      summary: `Lettrage effectué [${result.match_code}] sur ${result.count} lignes (${result.matched_amount} XAF)`,
      after: result,
      context: requestContext(req),
    });

    res.json(result);
  })
);

subledgerRoutes.post(
  '/subledger/unmatch',
  requirePermission('journal.post'),
  validate({
    body: z.object({
      matchCode: z.string().trim().max(10).optional(),
      lineIds: z.array(z.coerce.number().positive()).optional(),
    }),
  }),
  handler(async (req, res) => {
    const result = await transaction((tx) =>
      unmatchLines(tx, req.orgId, {
        matchCode: req.body.matchCode,
        lineIds: req.body.lineIds,
        actor: actorOf(req),
      })
    );

    await writeAudit({
      orgId: req.orgId,
      userId: req.user.id,
      action: 'unmatch',
      entity: 'journal_lines',
      entityId: req.body.matchCode || 'selection',
      summary: `Délettrage effectué sur ${result.unmatched_count} lignes`,
      context: requestContext(req),
    });

    res.json(result);
  })
);
