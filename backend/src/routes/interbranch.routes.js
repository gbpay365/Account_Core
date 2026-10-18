import { Router } from 'express';
import { handler } from '../middleware/index.js';
import { actorOf } from './helpers.js';
import * as interbranchService from '../services/interbranch.service.js';
import { seedPhase4 } from '../db/seed_phase4.js';

export const interbranchRoutes = Router();

interbranchRoutes.get(
  '/interbranch/branches',
  handler(async (req, res) => {
    let rows = await interbranchService.listBranches(req.orgId);
    if (!rows || rows.length === 0) {
      await seedPhase4(req.orgId).catch(console.error);
      rows = await interbranchService.listBranches(req.orgId);
    }
    res.json({ rows, total: rows.length });
  })
);

interbranchRoutes.post(
  '/interbranch/branches',
  handler(async (req, res) => {
    const branch = await interbranchService.createBranch(req.orgId, req.body);
    res.status(201).json(branch);
  })
);

interbranchRoutes.get(
  '/interbranch/transfers',
  handler(async (req, res) => {
    let rows = await interbranchService.listInterbranchTransfers(req.orgId);
    if (!rows || rows.length === 0) {
      await seedPhase4(req.orgId).catch(console.error);
      rows = await interbranchService.listInterbranchTransfers(req.orgId);
    }
    res.json({ rows, total: rows.length });
  })
);

interbranchRoutes.post(
  '/interbranch/transfers',
  handler(async (req, res) => {
    const transfer = await interbranchService.createInterbranchTransfer(
      req.orgId,
      req.body,
      actorOf(req).name
    );
    res.status(201).json(transfer);
  })
);

interbranchRoutes.get(
  '/interbranch/reconciliation',
  handler(async (req, res) => {
    const recon = await interbranchService.getInterbranchReconciliation(req.orgId);
    res.json(recon);
  })
);
