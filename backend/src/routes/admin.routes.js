import { Router } from 'express';
import { z } from 'zod';
import { handler, requirePermission, validate } from '../middleware/index.js';
import * as adminService from '../services/admin.service.js';

export const adminRoutes = Router();

// Require admin or settings permissions for administrative actions
const adminGuard = requirePermission('admin.users', 'admin.settings', 'coa.manage', 'admin.audit');

// ============================================================================
// USERS MANAGEMENT
// ============================================================================

adminRoutes.get(
  '/admin/users',
  adminGuard,
  validate({
    query: z.object({
      search: z.string().trim().optional(),
      roleId: z.coerce.number().int().positive().optional(),
      status: z.enum(['active', 'inactive', 'all']).optional(),
    }),
  }),
  handler(async (req, res) => {
    const result = await adminService.listUsers(req.orgId, req.query);
    res.json(result);
  })
);

adminRoutes.get(
  '/admin/users/:id',
  adminGuard,
  handler(async (req, res) => {
    const result = await adminService.getUser(req.orgId, req.params.id);
    res.json(result);
  })
);

adminRoutes.post(
  '/admin/users',
  adminGuard,
  validate({
    body: z.object({
      email: z.string().email().trim(),
      password: z.string().min(6),
      fullName: z.string().min(1).trim(),
      roleId: z.coerce.number().int().positive(),
      costCenterId: z.coerce.number().int().positive().nullable().optional(),
      jobTitle: z.string().trim().nullable().optional(),
      phone: z.string().trim().nullable().optional(),
      locale: z.enum(['fr', 'en']).optional(),
      isTechnician: z.boolean().optional(),
      hourlyRate: z.coerce.number().min(0).optional(),
      mustChangePw: z.boolean().optional(),
    }),
  }),
  handler(async (req, res) => {
    const result = await adminService.createUser(req.orgId, req.body, req.user.id);
    res.status(201).json(result);
  })
);

adminRoutes.put(
  '/admin/users/:id',
  adminGuard,
  validate({
    body: z.object({
      email: z.string().email().trim().optional(),
      fullName: z.string().min(1).trim().optional(),
      roleId: z.coerce.number().int().positive().optional(),
      costCenterId: z.coerce.number().int().positive().nullable().optional(),
      jobTitle: z.string().trim().nullable().optional(),
      phone: z.string().trim().nullable().optional(),
      locale: z.enum(['fr', 'en']).optional(),
      isTechnician: z.boolean().optional(),
      hourlyRate: z.coerce.number().min(0).optional(),
      isActive: z.boolean().optional(),
      mustChangePw: z.boolean().optional(),
    }),
  }),
  handler(async (req, res) => {
    const result = await adminService.updateUser(req.orgId, req.params.id, req.body, req.user.id);
    res.json(result);
  })
);

adminRoutes.post(
  '/admin/users/:id/reset-password',
  adminGuard,
  validate({
    body: z.object({
      password: z.string().min(6),
    }),
  }),
  handler(async (req, res) => {
    const result = await adminService.resetPassword(req.orgId, req.params.id, req.body.password, req.user.id);
    res.json(result);
  })
);

adminRoutes.post(
  '/admin/users/:id/toggle-status',
  adminGuard,
  handler(async (req, res) => {
    const result = await adminService.toggleUserStatus(req.orgId, req.params.id, req.user.id);
    res.json(result);
  })
);

// ============================================================================
// USER GROUPS & ROLES MANAGEMENT
// ============================================================================

adminRoutes.get(
  '/admin/groups',
  adminGuard,
  handler(async (_req, res) => {
    const result = await adminService.listRolesAndGroups();
    res.json(result);
  })
);

adminRoutes.get(
  '/admin/groups/:id',
  adminGuard,
  handler(async (req, res) => {
    const result = await adminService.getRoleOrGroup(req.params.id);
    res.json(result);
  })
);

adminRoutes.post(
  '/admin/groups',
  adminGuard,
  validate({
    body: z.object({
      code: z.string().min(2).max(50).trim(),
      name: z.string().min(2).max(100).trim(),
      nameEn: z.string().max(100).trim().optional(),
      description: z.string().trim().optional(),
      descriptionEn: z.string().trim().optional(),
      permissionIds: z.array(z.coerce.number().int().positive()).optional(),
    }),
  }),
  handler(async (req, res) => {
    const result = await adminService.createRoleOrGroup(req.orgId, req.body, req.user.id);
    res.status(201).json(result);
  })
);

adminRoutes.put(
  '/admin/groups/:id',
  adminGuard,
  validate({
    body: z.object({
      name: z.string().min(2).max(100).trim().optional(),
      nameEn: z.string().max(100).trim().optional(),
      description: z.string().trim().optional(),
      descriptionEn: z.string().trim().optional(),
      permissionIds: z.array(z.coerce.number().int().positive()).optional(),
    }),
  }),
  handler(async (req, res) => {
    const result = await adminService.updateRoleOrGroup(req.orgId, req.params.id, req.body, req.user.id);
    res.json(result);
  })
);

adminRoutes.delete(
  '/admin/groups/:id',
  adminGuard,
  handler(async (req, res) => {
    const result = await adminService.deleteRoleOrGroup(req.orgId, req.params.id, req.user.id);
    res.json(result);
  })
);

adminRoutes.get(
  '/admin/permissions',
  adminGuard,
  handler(async (_req, res) => {
    const result = await adminService.listAllPermissions();
    res.json(result);
  })
);

// ============================================================================
// SYSTEM & ENTITY SETUP
// ============================================================================

adminRoutes.get(
  '/admin/organization',
  adminGuard,
  handler(async (req, res) => {
    const result = await adminService.getOrganizationDetails(req.orgId);
    res.json(result);
  })
);

adminRoutes.put(
  '/admin/organization',
  adminGuard,
  validate({
    body: z.object({
      name: z.string().min(1).trim().optional(),
      legalName: z.string().trim().nullable().optional(),
      code: z.string().trim().optional(),
      orgType: z.string().trim().optional(),
      taxId: z.string().trim().nullable().optional(),
      vatNumber: z.string().trim().nullable().optional(),
      address: z.string().trim().nullable().optional(),
      city: z.string().trim().nullable().optional(),
      country: z.string().length(2).optional(),
      phone: z.string().trim().nullable().optional(),
      email: z.string().email().trim().nullable().optional(),
      website: z.string().trim().nullable().optional(),
      currency: z.string().length(3).optional(),
      frameworks: z.enum(['ohada', 'ifrs', 'both']).optional(),
      reportingTier: z.enum(['normal', 'allege', 'smt']).optional(),
      metadata: z.record(z.any()).optional(),
    }),
  }),
  handler(async (req, res) => {
    const result = await adminService.updateOrganizationDetails(req.orgId, req.body, req.user.id);
    res.json(result);
  })
);

// ============================================================================
// VAT, TVA & TAX PARAMETERS SETUP
// ============================================================================

adminRoutes.get(
  '/admin/taxes',
  adminGuard,
  handler(async (req, res) => {
    const result = await adminService.listTaxParameters(req.orgId);
    res.json(result);
  })
);

adminRoutes.post(
  '/admin/taxes',
  adminGuard,
  validate({
    body: z.object({
      code: z.string().min(1).max(20).trim(),
      name: z.string().min(1).max(100).trim(),
      taxType: z.enum(['vat', 'air', 'withholding', 'customs', 'other']),
      rate: z.coerce.number().min(0).max(100),
      isRecoverable: z.boolean().optional(),
      inputAccountId: z.coerce.number().int().positive().nullable().optional(),
      outputAccountId: z.coerce.number().int().positive().nullable().optional(),
      appliesTo: z.enum(['purchase', 'sale', 'both']).optional(),
      declarationBox: z.string().max(20).trim().nullable().optional(),
    }),
  }),
  handler(async (req, res) => {
    const result = await adminService.createTaxParameter(req.orgId, req.body, req.user.id);
    res.status(201).json(result);
  })
);

adminRoutes.put(
  '/admin/taxes/:id',
  adminGuard,
  validate({
    body: z.object({
      name: z.string().min(1).max(100).trim().optional(),
      taxType: z.enum(['vat', 'air', 'withholding', 'customs', 'other']).optional(),
      rate: z.coerce.number().min(0).max(100).optional(),
      isRecoverable: z.boolean().optional(),
      inputAccountId: z.coerce.number().int().positive().nullable().optional(),
      outputAccountId: z.coerce.number().int().positive().nullable().optional(),
      appliesTo: z.enum(['purchase', 'sale', 'both']).optional(),
      declarationBox: z.string().max(20).trim().nullable().optional(),
      isActive: z.boolean().optional(),
    }),
  }),
  handler(async (req, res) => {
    const result = await adminService.updateTaxParameter(req.orgId, req.params.id, req.body, req.user.id);
    res.json(result);
  })
);

adminRoutes.post(
  '/admin/taxes/:id/toggle',
  adminGuard,
  handler(async (req, res) => {
    const result = await adminService.toggleTaxParameter(req.orgId, req.params.id, req.user.id);
    res.json(result);
  })
);
