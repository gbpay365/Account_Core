import { Router } from 'express';
import { handler } from '../middleware/index.js';
import * as withholdingService from '../services/withholding-tax.service.js';

export const withholdingRoutes = Router();

withholdingRoutes.post('/withholding/calculate', handler(async (req, res) => {
  const result = withholdingService.computeTaxSplit(req.body);
  res.json(result);
}));

withholdingRoutes.get('/withholding/suppliers', handler(async (req, res) => {
  const suppliers = await withholdingService.listSuppliers(req.orgId);
  res.json({ rows: suppliers });
}));

withholdingRoutes.get('/withholding/certificates', handler(async (req, res) => {
  const certs = await withholdingService.listCertificates(req.orgId, req.query);
  res.json({ rows: certs });
}));

withholdingRoutes.get('/withholding/certificates/:id', handler(async (req, res) => {
  const cert = await withholdingService.getCertificate(req.orgId, Number(req.params.id));
  res.json(cert);
}));

withholdingRoutes.post('/withholding/certificates', handler(async (req, res) => {
  const result = await withholdingService.issueCertificate(req.orgId, req.body, req.user);
  res.status(201).json(result);
}));

withholdingRoutes.patch('/withholding/certificates/:id/status', handler(async (req, res) => {
  const result = await withholdingService.updateCertificateStatus(req.orgId, Number(req.params.id), req.body);
  res.json(result);
}));
