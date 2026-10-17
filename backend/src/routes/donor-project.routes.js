import { Router } from 'express';
import { z } from 'zod';
import { handler, requirePermission, validate } from '../middleware/index.js';
import {
  listProjects,
  getProjectDetails,
  createProject,
  addCategory,
  getDRFDetails,
  createDRF,
} from '../services/donor-project.service.js';

export const donorProjectRoutes = Router();

donorProjectRoutes.get(
  '/donor-projects',
  requirePermission('journal.view', 'budget.view'),
  handler(async (req, res) => {
    const rows = await listProjects(req.orgId);
    res.json({ rows, total: rows.length });
  })
);

donorProjectRoutes.get(
  '/donor-projects/:id',
  requirePermission('journal.view', 'budget.view'),
  handler(async (req, res) => {
    const data = await getProjectDetails(req.orgId, Number(req.params.id));
    res.json(data);
  })
);

donorProjectRoutes.post(
  '/donor-projects',
  requirePermission('journal.post', 'budget.manage'),
  validate({
    body: z.object({
      donor_name: z.string().trim().min(2),
      project_code: z.string().trim().min(2),
      project_name: z.string().trim().min(2),
      agreement_ref: z.string().optional().nullable(),
      currency: z.string().default('XAF'),
      total_budget: z.number().min(0),
      financing_rate: z.number().min(0).max(100).default(100.0),
      designated_bank_account_id: z.number().optional().nullable(),
      start_date: z.string(),
      end_date: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const result = await createProject(req.orgId, req.body);
    res.status(201).json(result);
  })
);

donorProjectRoutes.post(
  '/donor-projects/:id/categories',
  requirePermission('journal.post', 'budget.manage'),
  validate({
    body: z.object({
      category_code: z.string().trim().min(2),
      name: z.string().trim().min(2),
      budget_allocated: z.number().min(0).default(0),
      eligible_rate: z.number().min(0).max(100).default(100.0),
    }),
  }),
  handler(async (req, res) => {
    const result = await addCategory(req.orgId, Number(req.params.id), req.body);
    res.status(201).json(result);
  })
);

donorProjectRoutes.get(
  '/donor-projects/drfs/:drfId',
  requirePermission('journal.view', 'budget.view'),
  handler(async (req, res) => {
    const data = await getDRFDetails(req.orgId, Number(req.params.drfId));
    res.json(data);
  })
);

donorProjectRoutes.post(
  '/donor-projects/:id/drfs',
  requirePermission('journal.post', 'budget.manage'),
  validate({
    body: z.object({
      drf_number: z.string().trim().min(2),
      request_date: z.string(),
      period_start: z.string(),
      period_end: z.string(),
      initial_advance: z.number().min(0).default(0),
      designated_account_balance: z.number().min(0).default(0),
      notes: z.string().optional().nullable(),
      items: z.array(
        z.object({
          category_id: z.number(),
          voucher_ref: z.string(),
          voucher_date: z.string(),
          beneficiary_name: z.string(),
          description: z.string(),
          total_amount: z.number().min(0),
          currency: z.string().optional(),
          eligible_rate: z.number().min(0).max(100).default(100.0),
          notes: z.string().optional().nullable(),
        })
      ),
    }),
  }),
  handler(async (req, res) => {
    const result = await createDRF(req.orgId, Number(req.params.id), req.body);
    res.status(201).json(result);
  })
);
