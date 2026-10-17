import { Router } from 'express';
import { z } from 'zod';
import { handler, requirePermission, validate } from '../middleware/index.js';
import { actorOf } from './helpers.js';
import {
  listCashRegisters,
  getCashRegisterDetails,
  recordMobileMoneyTransaction,
  performDailyCashClose,
} from '../services/cash-register.service.js';

export const cashRegisterRoutes = Router();

cashRegisterRoutes.get(
  '/cash-registers',
  requirePermission('journal.view', 'coa.view'),
  handler(async (req, res) => {
    const rows = await listCashRegisters(req.orgId);
    res.json({ rows, total: rows.length });
  })
);

cashRegisterRoutes.get(
  '/cash-registers/:id',
  requirePermission('journal.view'),
  handler(async (req, res) => {
    const dateStr = req.query.date ? String(req.query.date) : null;
    const data = await getCashRegisterDetails(req.orgId, Number(req.params.id), dateStr);
    res.json(data);
  })
);

cashRegisterRoutes.post(
  '/cash-registers/momo-transactions',
  requirePermission('journal.post'),
  validate({
    body: z.object({
      cash_register_id: z.number().int().positive(),
      provider: z.enum(['mtn_momo', 'orange_money']),
      telecom_ref: z.string().trim().min(3),
      customer_phone: z.string().optional().nullable(),
      patient_name: z.string().optional().nullable(),
      patient_file_no: z.string().optional().nullable(),
      gross_amount: z.number().positive(),
      fee_amount: z.number().min(0).default(0),
      credit_account_id: z.number().optional().nullable(),
      notes: z.string().optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const result = await recordMobileMoneyTransaction(req.orgId, req.body, actorOf(req));
    res.status(201).json(result);
  })
);

cashRegisterRoutes.post(
  '/cash-registers/:id/daily-close',
  requirePermission('journal.post', 'period.close'),
  validate({
    body: z.object({
      close_date: z.string(),
      physical_cash_counted: z.number().min(0).default(0),
      system_cash_expected: z.number().min(0).default(0),
      bank_deposit_amount: z.number().min(0).default(0),
      bank_deposit_ref: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const result = await performDailyCashClose(req.orgId, Number(req.params.id), req.body, actorOf(req));
    res.status(201).json(result);
  })
);
