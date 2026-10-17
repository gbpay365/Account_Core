import { Router } from 'express';
import { handler } from '../middleware/index.js';
import { actorOf } from './helpers.js';
import * as dfeService from '../services/dfe.service.js';

export const dfeRoutes = Router();

dfeRoutes.get(
  '/dfe/invoices',
  handler(async (req, res) => {
    const rows = await dfeService.listDfeInvoices(req.orgId);
    res.json({ rows, total: rows.length });
  })
);

dfeRoutes.get(
  '/dfe/invoices/:id',
  handler(async (req, res) => {
    const invoice = await dfeService.getDfeInvoiceDetails(req.orgId, Number(req.params.id));
    res.json(invoice);
  })
);

dfeRoutes.post(
  '/dfe/invoices',
  handler(async (req, res) => {
    const invoice = await dfeService.issueDfeInvoice(
      req.orgId,
      req.body,
      actorOf(req).name
    );
    res.status(201).json(invoice);
  })
);
