import { Router } from 'express';
import { handler } from '../middleware/index.js';
import * as dsfService from '../services/dsf.service.js';

export const dsfRoutes = Router();

dsfRoutes.get('/dsf/:fyId/tableau-1', handler(async (req, res) => {
  const result = await dsfService.getTableau1ActifImmobilise(req.orgId, Number(req.params.fyId));
  res.json(result);
}));

dsfRoutes.get('/dsf/:fyId/tableau-2', handler(async (req, res) => {
  const result = await dsfService.getTableau2Amortissements(req.orgId, Number(req.params.fyId));
  res.json(result);
}));

dsfRoutes.get('/dsf/:fyId/tableau-3', handler(async (req, res) => {
  const result = await dsfService.getTableau3Cessions(req.orgId, Number(req.params.fyId));
  res.json(result);
}));

dsfRoutes.get('/dsf/:fyId/tableau-28', handler(async (req, res) => {
  const result = await dsfService.getTableau28ResultatFiscal(req.orgId, Number(req.params.fyId));
  res.json(result);
}));

dsfRoutes.post('/dsf/adjustments', handler(async (req, res) => {
  const result = await dsfService.addTaxAdjustment(req.orgId, req.body);
  res.status(201).json(result);
}));
