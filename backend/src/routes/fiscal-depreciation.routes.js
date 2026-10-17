import { Router } from 'express';
import { handler } from '../middleware/index.js';
import * as fiscalDeprService from '../services/fiscal-depreciation.service.js';

export const fiscalDepreciationRoutes = Router();

fiscalDepreciationRoutes.get('/depreciation/fiscal/:year/simulate', handler(async (req, res) => {
  const result = await fiscalDeprService.simulateFiscalDepreciation(req.orgId, Number(req.params.year));
  res.json(result);
}));

fiscalDepreciationRoutes.post('/depreciation/fiscal/:year/post', handler(async (req, res) => {
  const result = await fiscalDeprService.postFiscalDepreciation(req.orgId, Number(req.params.year), req.user);
  res.status(201).json(result);
}));
