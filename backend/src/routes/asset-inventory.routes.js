import { Router } from 'express';
import { handler } from '../middleware/index.js';
import * as inventoryService from '../services/asset-inventory.service.js';

export const assetInventoryRoutes = Router();

assetInventoryRoutes.get('/asset-inventory/campaigns', handler(async (req, res) => {
  const campaigns = await inventoryService.listCampaigns(req.orgId);
  res.json({ rows: campaigns });
}));

assetInventoryRoutes.post('/asset-inventory/campaigns', handler(async (req, res) => {
  const result = await inventoryService.createCampaign(req.orgId, req.body, req.user?.id);
  res.status(201).json(result);
}));

assetInventoryRoutes.get('/asset-inventory/campaigns/:id', handler(async (req, res) => {
  const details = await inventoryService.getCampaignDetails(req.orgId, Number(req.params.id));
  res.json(details);
}));

assetInventoryRoutes.post('/asset-inventory/campaigns/:id/scan', handler(async (req, res) => {
  const result = await inventoryService.recordScan(req.orgId, Number(req.params.id), req.body, req.user?.id);
  res.status(201).json(result);
}));

assetInventoryRoutes.post('/asset-inventory/campaigns/:id/reconcile', handler(async (req, res) => {
  const result = await inventoryService.reconcileCampaign(req.orgId, Number(req.params.id));
  res.json(result);
}));
