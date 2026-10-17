import { Router } from 'express';
import { z } from 'zod';
import { handler, requirePermission, validate } from '../middleware/index.js';
import * as leaseService from '../services/lease.service.js';

export const leaseRoutes = Router();

leaseRoutes.get(
  '/leases',
  requirePermission('asset.view'),
  handler(async (req, res) => {
    const data = await leaseService.listLeaseContracts(req.orgId);
    res.json(data);
  })
);

leaseRoutes.get(
  '/leases/:id',
  requirePermission('asset.view'),
  handler(async (req, res) => {
    const data = await leaseService.getLeaseContract(req.orgId, Number(req.params.id));
    res.json(data);
  })
);

leaseRoutes.post(
  '/leases',
  requirePermission('asset.manage'),
  validate({
    body: z.object({
      contract_ref: z.string().min(1),
      asset_name: z.string().min(1),
      lessor_name: z.string().min(1),
      start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      term_months: z.coerce.number().int().min(1).max(360),
      monthly_payment: z.coerce.number().positive(),
      discount_rate_pct: z.coerce.number().min(0).max(100),
      currency: z.string().default('XAF'),
      notes: z.string().optional(),
    }),
  }),
  handler(async (req, res) => {
    const created = await leaseService.createLeaseContract(req.orgId, req.body);
    res.status(201).json(created);
  })
);
