import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { authenticate as verifyCredentials, changePassword, loadSession } from '../services/auth.service.js';
import { authenticate, handler, validate, requestContext } from '../middleware/index.js';
import { query } from '../db/pool.js';

export const authRoutes = Router();

/**
 * Brute-force protection lives here rather than in per-account lockout state,
 * so a forgotten password cannot be used to lock a colleague out of the system.
 *
 * Only failed attempts are counted, and the counter is keyed on the address
 * and the email together: the hospital's workstations all reach the API from
 * one gateway address, so a shared per-address budget would throttle a whole
 * ward the moment a night shift signed in.
 */
const tooMany = (message) => ({ error: { status: 429, message } });

const perAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${req.ip}|${String(req.body?.email || '').trim().toLowerCase()}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany('Too many failed sign-in attempts for this account. Try again in a few minutes.'),
});

// A second, wider net: one address working through a list of accounts.
const perAddressLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany('Too many failed sign-in attempts from this device. Try again later.'),
});

authRoutes.post(
  '/login',
  perAddressLimiter,
  perAccountLimiter,
  validate({ body: z.object({ email: z.string().min(1), password: z.string().min(1) }) }),
  handler(async (req, res) => {
    const { user, token } = await verifyCredentials(req.body.email, req.body.password, requestContext(req));
    res.json({ token, user });
  })
);

authRoutes.get('/me', authenticate, handler(async (req, res) => {
  res.json({ user: await loadSession(req.user.id) });
}));

authRoutes.patch(
  '/locale',
  authenticate,
  validate({ body: z.object({ locale: z.enum(['en', 'fr']) }) }),
  handler(async (req, res) => {
    await query('UPDATE users SET locale = ? WHERE id = ?', [req.body.locale, req.user.id]);
    res.json({ user: await loadSession(req.user.id) });
  })
);

authRoutes.post(
  '/change-password',
  authenticate,
  validate({
    body: z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(10, 'The new password must be at least 10 characters long.'),
    }),
  }),
  handler(async (req, res) => {
    await changePassword(req.user.id, req.body.currentPassword, req.body.newPassword, requestContext(req));
    res.json({ ok: true, message: 'Your password has been changed.' });
  })
);
