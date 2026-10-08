import { Router } from 'express';
import { z } from 'zod';
import { transaction } from '../db/pool.js';
import { handler, requirePermission, validate, requestContext } from '../middleware/index.js';
import { writeAudit } from '../services/auth.service.js';
import {
  listErrands, getErrand, createErrand, transitionErrand,
  listShoppingLists, getShoppingList, createShoppingList, addShoppingItem,
  updateShoppingItem, transitionShoppingList, servicesOverview,
  listErrandKinds, createErrandKind,
} from '../services/errand.service.js';
import { notFound } from '../utils/errors.js';
import { actorOf, isoDate, optionalId, boolish, pagination, paged } from './helpers.js';

export const errandRoutes = Router();

const errandKind = z.string().trim().min(1).max(40);
const priority = z.enum(['low', 'normal', 'high', 'urgent']);
const errandAction = z.enum(['assign', 'start', 'complete', 'cancel']);
const shopAction = z.enum(['start', 'receive', 'cancel', 'assign']);
const itemStatus = z.enum(['needed', 'bought', 'unavailable']);

errandRoutes.get(
  '/services/overview',
  requirePermission('errand.view', 'shop.view'),
  handler(async (req, res) => {
    const overview = await transaction((tx) => servicesOverview(tx, req.orgId));
    res.json(overview);
  })
);

errandRoutes.get(
  '/services/technicians',
  requirePermission('errand.view', 'errand.assign', 'shop.view'),
  handler(async (req, res) => {
    const overview = await transaction((tx) => servicesOverview(tx, req.orgId));
    res.json({ rows: overview.technicians });
  })
);

errandRoutes.get(
  '/errand-kinds',
  requirePermission('errand.view'),
  handler(async (req, res) => {
    const rows = await transaction((tx) => listErrandKinds(tx, req.orgId));
    res.json({ rows });
  })
);

errandRoutes.post(
  '/errand-kinds',
  requirePermission('errand.create'),
  validate({
    body: z.object({
      name: z.string().trim().min(1).max(80).optional(),
      nameEn: z.string().trim().min(1).max(80).optional(),
    }).refine((body) => Boolean(body.nameEn || body.name), {
      message: 'Give the kind a name.',
    }),
  }),
  handler(async (req, res) => {
    const kind = await transaction((tx) => createErrandKind(tx, req.orgId, req.body));
    await writeAudit({
      orgId: req.orgId, userId: req.user.id, action: 'create', entity: 'errand_kind', entityId: kind.id,
      summary: `Errand kind ${kind.code} added`, after: kind, context: requestContext(req),
    });
    res.status(201).json({ kind });
  })
);

errandRoutes.get(
  '/errands',
  requirePermission('errand.view'),
  validate({
    query: pagination.extend({
      search: z.string().trim().max(120).optional(),
      status: z.string().trim().max(80).optional(),
      kind: errandKind.optional(),
      priority: priority.optional(),
      assignedTo: optionalId,
      mine: boolish.optional(),
      openOnly: boolish.optional(),
      pastDueOnly: boolish.optional(),
    }),
  }),
  handler(async (req, res) => {
    const q = { ...req.query, actorId: req.user.id };
    const { rows, total } = await transaction((tx) => listErrands(tx, req.orgId, q));
    res.json(paged(rows, total, q));
  })
);

errandRoutes.get(
  '/errands/:id',
  requirePermission('errand.view'),
  handler(async (req, res) => {
    const errand = await transaction((tx) => getErrand(tx, req.orgId, req.params.id));
    if (!errand) throw notFound('Errand not found.');
    res.json({ errand });
  })
);

errandRoutes.post(
  '/errands',
  requirePermission('errand.create'),
  validate({
    body: z.object({
      title: z.string().trim().min(1).max(200),
      description: z.string().trim().max(800).optional().nullable(),
      kind: errandKind.default('general'),
      priority: priority.default('normal'),
      dueDate: isoDate.optional().nullable(),
      locationNote: z.string().trim().max(200).optional().nullable(),
      vehicleNote: z.string().trim().max(200).optional().nullable(),
      costCenterId: optionalId.nullable(),
      assignedTo: optionalId.nullable(),
      shoppingListId: optionalId.nullable(),
    }),
  }),
  handler(async (req, res) => {
    const errand = await transaction((tx) => createErrand(tx, req.orgId, req.body, actorOf(req)));
    await writeAudit({
      orgId: req.orgId, userId: req.user.id, action: 'create', entity: 'errand', entityId: errand.id,
      summary: `Errand ${errand.errand_no} raised`, after: errand, context: requestContext(req),
    });
    res.status(201).json({ errand });
  })
);

errandRoutes.post(
  '/errands/:id/:action',
  (req, res, next) => {
    const permission = {
      assign: 'errand.assign',
      start: 'errand.execute',
      complete: 'errand.execute',
      cancel: 'errand.create',
    }[req.params.action];
    if (!permission) return next();
    return requirePermission(permission)(req, res, next);
  },
  validate({
    params: z.object({ id: z.coerce.number().int().positive(), action: errandAction }),
    body: z.object({
      assignedTo: optionalId,
      completionNote: z.string().trim().max(500).optional().nullable(),
    }).default({}),
  }),
  handler(async (req, res) => {
    const errand = await transaction((tx) =>
      transitionErrand(tx, req.orgId, req.params.id, req.params.action, req.body, actorOf(req))
    );
    await writeAudit({
      orgId: req.orgId, userId: req.user.id, action: req.params.action, entity: 'errand', entityId: errand.id,
      summary: `Errand ${errand.errand_no} ${req.params.action}`, after: errand, context: requestContext(req),
    });
    res.json({ errand });
  })
);

errandRoutes.get(
  '/shopping-lists',
  requirePermission('shop.view'),
  validate({
    query: pagination.extend({
      search: z.string().trim().max(120).optional(),
      status: z.string().trim().max(80).optional(),
      assignedTo: optionalId,
      mine: boolish.optional(),
      openOnly: boolish.optional(),
    }),
  }),
  handler(async (req, res) => {
    const q = { ...req.query, actorId: req.user.id };
    const { rows, total } = await transaction((tx) => listShoppingLists(tx, req.orgId, q));
    res.json(paged(rows, total, q));
  })
);

errandRoutes.get(
  '/shopping-lists/:id',
  requirePermission('shop.view'),
  handler(async (req, res) => {
    const list = await transaction((tx) => getShoppingList(tx, req.orgId, req.params.id));
    if (!list) throw notFound('Shopping list not found.');
    res.json({ list });
  })
);

errandRoutes.post(
  '/shopping-lists',
  requirePermission('shop.create'),
  validate({
    body: z.object({
      title: z.string().trim().min(1).max(200),
      notes: z.string().trim().max(500).optional().nullable(),
      neededBy: isoDate.optional().nullable(),
      destination: z.string().trim().max(200).optional().nullable(),
      assignedTo: optionalId.nullable(),
      items: z.array(z.object({
        description: z.string().trim().min(1).max(200),
        quantity: z.coerce.number().min(0.01).default(1),
        unit: z.string().trim().max(20).default('ea'),
        estimatedUnitCost: z.coerce.number().min(0).default(0),
        notes: z.string().trim().max(300).optional().nullable(),
      })).max(80).optional(),
    }),
  }),
  handler(async (req, res) => {
    const list = await transaction((tx) => createShoppingList(tx, req.orgId, req.body, actorOf(req)));
    await writeAudit({
      orgId: req.orgId, userId: req.user.id, action: 'create', entity: 'shopping_list', entityId: list.id,
      summary: `Shopping list ${list.list_no} created`, after: list, context: requestContext(req),
    });
    res.status(201).json({ list });
  })
);

errandRoutes.post(
  '/shopping-lists/:id/items',
  requirePermission('shop.create'),
  validate({
    body: z.object({
      description: z.string().trim().min(1).max(200),
      quantity: z.coerce.number().min(0.01).default(1),
      unit: z.string().trim().max(20).default('ea'),
      estimatedUnitCost: z.coerce.number().min(0).default(0),
      notes: z.string().trim().max(300).optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const list = await transaction((tx) => addShoppingItem(tx, req.orgId, req.params.id, req.body));
    res.status(201).json({ list });
  })
);

errandRoutes.patch(
  '/shopping-lists/:id/items/:itemId',
  requirePermission('shop.buy', 'shop.create'),
  validate({
    body: z.object({
      status: itemStatus.optional(),
      boughtQty: z.coerce.number().min(0).optional().nullable(),
      actualUnitCost: z.coerce.number().min(0).optional().nullable(),
      vendorNote: z.string().trim().max(200).optional().nullable(),
      notes: z.string().trim().max(300).optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const list = await transaction((tx) =>
      updateShoppingItem(tx, req.orgId, req.params.id, req.params.itemId, req.body)
    );
    res.json({ list });
  })
);

errandRoutes.post(
  '/shopping-lists/:id/:action',
  (req, res, next) => {
    const permission = {
      start: 'shop.buy',
      receive: 'shop.buy',
      cancel: 'shop.create',
      assign: 'errand.assign',
    }[req.params.action];
    if (!permission) return next();
    return requirePermission(permission)(req, res, next);
  },
  validate({
    params: z.object({ id: z.coerce.number().int().positive(), action: shopAction }),
    body: z.object({
      assignedTo: optionalId,
      force: boolish.optional(),
    }).default({}),
  }),
  handler(async (req, res) => {
    const list = await transaction((tx) =>
      transitionShoppingList(tx, req.orgId, req.params.id, req.params.action, req.body, actorOf(req))
    );
    await writeAudit({
      orgId: req.orgId, userId: req.user.id, action: req.params.action, entity: 'shopping_list', entityId: list.id,
      summary: `Shopping list ${list.list_no} ${req.params.action}`, after: list, context: requestContext(req),
    });
    res.json({ list });
  })
);
