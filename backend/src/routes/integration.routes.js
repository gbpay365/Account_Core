import { Router } from 'express';
import { z } from 'zod';
import { handler, requirePermission, validate, requestContext } from '../middleware/index.js';
import * as integrationService from '../services/integration.service.js';
import { badRequest, unauthorized } from '../utils/errors.js';

export const integrationRoutes = Router();

// Admin guard for setup & configuration
const adminGuard = requirePermission('admin.settings', 'admin.users', 'coa.manage', 'journal.create');

// ============================================================================
// ADMIN: INTEGRATION CLIENTS (API KEYS)
// ============================================================================

integrationRoutes.get(
  '/admin/integrations/clients',
  adminGuard,
  handler(async (req, res) => {
    const result = await integrationService.listClients(req.orgId);
    res.json(result);
  })
);

integrationRoutes.get(
  '/admin/integrations/clients/:id',
  adminGuard,
  handler(async (req, res) => {
    const result = await integrationService.getClient(req.orgId, req.params.id);
    res.json(result);
  })
);

integrationRoutes.post(
  '/admin/integrations/clients',
  adminGuard,
  validate({
    body: z.object({
      name: z.string().trim().min(2),
      clientCode: z.string().trim().min(2).max(50),
      defaultJournalId: z.coerce.number().int().positive().nullable().optional(),
      defaultStatus: z.enum(['draft', 'posted']).default('draft'),
      ipWhitelist: z.string().trim().nullable().optional(),
      webhookUrl: z.string().trim().url().nullable().optional().or(z.literal('')),
      description: z.string().trim().nullable().optional(),
    }),
  }),
  handler(async (req, res) => {
    const result = await integrationService.createClient(req.orgId, req.body, req.user?.id);
    res.status(201).json(result);
  })
);

integrationRoutes.put(
  '/admin/integrations/clients/:id',
  adminGuard,
  validate({
    body: z.object({
      name: z.string().trim().min(2).optional(),
      defaultJournalId: z.coerce.number().int().positive().nullable().optional(),
      defaultStatus: z.enum(['draft', 'posted']).optional(),
      ipWhitelist: z.string().trim().nullable().optional(),
      webhookUrl: z.string().trim().url().nullable().optional().or(z.literal('')),
      description: z.string().trim().nullable().optional(),
      isActive: z.boolean().optional(),
    }),
  }),
  handler(async (req, res) => {
    const result = await integrationService.updateClient(req.orgId, req.params.id, req.body);
    res.json(result);
  })
);

integrationRoutes.post(
  '/admin/integrations/clients/:id/regenerate-key',
  adminGuard,
  handler(async (req, res) => {
    const result = await integrationService.regenerateApiKey(req.orgId, req.params.id);
    res.json(result);
  })
);

integrationRoutes.delete(
  '/admin/integrations/clients/:id',
  adminGuard,
  handler(async (req, res) => {
    const result = await integrationService.deleteClient(req.orgId, req.params.id);
    res.json(result);
  })
);

// ============================================================================
// ADMIN: EVENT MAPPING RULES
// ============================================================================

integrationRoutes.get(
  '/admin/integrations/mappings',
  adminGuard,
  validate({
    query: z.object({
      clientId: z.coerce.number().int().positive().optional(),
    }),
  }),
  handler(async (req, res) => {
    const result = await integrationService.listMappings(req.orgId, req.query.clientId);
    res.json(result);
  })
);

integrationRoutes.post(
  '/admin/integrations/mappings',
  adminGuard,
  validate({
    body: z.object({
      clientId: z.coerce.number().int().positive().nullable().optional(),
      eventCode: z.string().trim().min(2).max(100),
      name: z.string().trim().min(2).max(150),
      defaultJournalId: z.coerce.number().int().positive().nullable().optional(),
      debitAccountId: z.coerce.number().int().positive(),
      creditAccountId: z.coerce.number().int().positive(),
      defaultCostCenterId: z.coerce.number().int().positive().nullable().optional(),
      taxCodeId: z.coerce.number().int().positive().nullable().optional(),
      descriptionTemplate: z.string().trim().nullable().optional(),
    }),
  }),
  handler(async (req, res) => {
    const result = await integrationService.createMapping(req.orgId, req.body);
    res.status(201).json(result);
  })
);

integrationRoutes.put(
  '/admin/integrations/mappings/:id',
  adminGuard,
  validate({
    body: z.object({
      name: z.string().trim().min(2).max(150).optional(),
      defaultJournalId: z.coerce.number().int().positive().nullable().optional(),
      debitAccountId: z.coerce.number().int().positive().optional(),
      creditAccountId: z.coerce.number().int().positive().optional(),
      defaultCostCenterId: z.coerce.number().int().positive().nullable().optional(),
      taxCodeId: z.coerce.number().int().positive().nullable().optional(),
      descriptionTemplate: z.string().trim().nullable().optional(),
      isActive: z.boolean().optional(),
    }),
  }),
  handler(async (req, res) => {
    const result = await integrationService.updateMapping(req.orgId, req.params.id, req.body);
    res.json(result);
  })
);

integrationRoutes.delete(
  '/admin/integrations/mappings/:id',
  adminGuard,
  handler(async (req, res) => {
    const result = await integrationService.deleteMapping(req.orgId, req.params.id);
    res.json(result);
  })
);

// ============================================================================
// ADMIN: INGESTION LOGS & AUDIT HISTORY
// ============================================================================

integrationRoutes.get(
  '/admin/integrations/logs',
  adminGuard,
  validate({
    query: z.object({
      clientId: z.coerce.number().int().positive().optional(),
      status: z.enum(['draft_created', 'auto_posted', 'rejected', 'duplicate']).optional(),
      search: z.string().trim().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    }),
  }),
  handler(async (req, res) => {
    const result = await integrationService.listLogs(req.orgId, req.query);
    res.json(result);
  })
);

// Admin Simulator: Test Ingestion from the UI
integrationRoutes.post(
  '/admin/integrations/test-ingest',
  adminGuard,
  handler(async (req, res) => {
    const { clientId, payload } = req.body;
    let client;
    if (clientId) {
      const c = await integrationService.getClient(req.orgId, clientId);
      client = c.client;
    } else {
      const list = await integrationService.listClients(req.orgId);
      if (!list.rows.length) throw badRequest('No integration client configured yet.');
      client = list.rows[0];
    }

    const result = await integrationService.ingestExternalEntry(client, payload, { ip: req.ip });
    res.json(result);
  })
);

// ============================================================================
// PUBLIC INGESTION API (FOR EXTERNAL SYSTEMS: BILLING, POS, ERP, BANKING)
// Mounted separately to handle API Key authentication
// ============================================================================

export const integrationIngestRoutes = Router();

integrationIngestRoutes.post(
  '/entries',
  handler(async (req, res) => {
    // 1. Resolve API key from header: X-API-Key or Authorization Bearer
    const apiKey = req.get('x-api-key') ||
      (req.get('authorization')?.startsWith('Bearer ') ? req.get('authorization').slice(7).trim() : null);

    if (!apiKey) {
      throw unauthorized('Authentication required. Send your API key in header "X-API-Key: lch_live_..."');
    }

    const client = await integrationService.authenticateApiKey(apiKey, req.ip);
    const result = await integrationService.ingestExternalEntry(client, req.body, { ip: req.ip });
    res.status(result.duplicate ? 200 : 201).json(result);
  })
);

integrationIngestRoutes.get(
  '/spec',
  handler(async (req, res) => {
    res.json({
      service: 'LedgerCore Universal External Systems Financial Gateway',
      version: '1.0.0',
      description: 'Universal API gateway for external systems (Billing, Point of Sale, ERP, Invoicing, Banking, HR/Payroll) to automatically ingest financial transactions as Draft entries for accounting verification prior to posting.',
      auth: {
        type: 'api_key',
        header: 'X-API-Key: lch_live_...',
      },
      endpoint: {
        method: 'POST',
        path: '/api/integrations/entries',
      },
      sample_payloads: {
        event_based: {
          description: 'High-level financial business event mapped to accounts & cost centers in Admin setup',
          payload: {
            event_type: 'SALES_INVOICE',
            reference: 'INV-2026-9901',
            date: '2026-10-23',
            amount: 250000,
            currency: 'XAF',
            payment_method: 'BANK',
            department_code: 'ADM',
            customer_name: 'AfricTech Solutions SARL',
            customer_id: 'CLI-4401',
            notes: 'Annual software maintenance and support contract',
          },
        },
        payment_collection: {
          description: 'Cash / Bank receipt and customer payment collection',
          payload: {
            event_type: 'PAYMENT_COLLECTION',
            reference: 'REC-2026-8802',
            date: '2026-10-23',
            amount: 75000,
            currency: 'XAF',
            payment_method: 'CASH',
            department_code: 'ADM',
            customer_name: 'Société Générale de Distribution',
            notes: 'Cash payment on outstanding invoice settlement',
          },
        },
        direct_double_entry: {
          description: 'Pre-balanced multi-line direct debit/credit journal entry',
          payload: {
            journal_code: 'VTE',
            date: '2026-10-23',
            reference: 'ERP-SALES-2026-8802',
            description: 'Daily Commercial Sales & Merchandise Revenue',
            currency: 'XAF',
            lines: [
              { account_code: '5711', debit: 120000, credit: 0, cost_center_code: 'ADM', description: 'Cash register collection' },
              { account_code: '7011', debit: 0, credit: 120000, cost_center_code: 'ADM', description: 'Merchandise sales revenue' },
            ],
          },
        },
      },
    });
  })
);
