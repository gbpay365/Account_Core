import { Router } from 'express';
import { handler } from '../middleware/index.js';
import { actorOf } from './helpers.js';
import * as payrollService from '../services/payroll.service.js';

export const payrollRoutes = Router();

payrollRoutes.get(
  '/payroll/employees',
  handler(async (req, res) => {
    const rows = await payrollService.listEmployees(req.orgId);
    res.json({ rows, total: rows.length });
  })
);

payrollRoutes.post(
  '/payroll/employees',
  handler(async (req, res) => {
    const emp = await payrollService.createEmployee(req.orgId, req.body);
    res.status(201).json(emp);
  })
);

payrollRoutes.get(
  '/payroll/runs',
  handler(async (req, res) => {
    const rows = await payrollService.listPayrollRuns(req.orgId);
    res.json({ rows, total: rows.length });
  })
);

payrollRoutes.get(
  '/payroll/runs/:id',
  handler(async (req, res) => {
    const details = await payrollService.getPayrollRunDetails(req.orgId, Number(req.params.id));
    res.json(details);
  })
);

payrollRoutes.post(
  '/payroll/runs/generate',
  handler(async (req, res) => {
    const result = await payrollService.generatePayrollRun(req.orgId, {
      ...req.body,
      createdBy: actorOf(req).name,
    });
    res.status(201).json(result);
  })
);

payrollRoutes.post(
  '/payroll/runs/:id/post',
  handler(async (req, res) => {
    const result = await payrollService.postPayrollRunToLedger(
      req.orgId,
      Number(req.params.id),
      actorOf(req).name
    );
    res.json(result);
  })
);

payrollRoutes.get(
  '/payroll/runs/:id/dipe',
  handler(async (req, res) => {
    const dipe = await payrollService.generateDipeExport(req.orgId, Number(req.params.id));
    res.json(dipe);
  })
);
