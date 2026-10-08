import { ZodError } from 'zod';
import { ApiError, unauthorized, forbidden, badRequest } from '../utils/errors.js';
import { verifyToken, loadSession, writeAudit } from '../services/auth.service.js';

/** Wraps an async handler so rejected promises reach the error handler. */
export const handler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Request metadata carried into the audit trail. */
export const requestContext = (req) => ({
  ip: req.ip,
  userAgent: req.get('user-agent'),
  userEmail: req.user?.email ?? null,
});

/**
 * Resolves the bearer token into `req.user` (identity, org, permissions).
 * The session is re-read per request so a deactivated account or a changed
 * role takes effect immediately rather than when the token expires.
 */
export const authenticate = handler(async (req, _res, next) => {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) throw unauthorized('Sign in to continue.');

  const claims = verifyToken(token);
  req.user = await loadSession(claims.sub);
  req.orgId = req.user.org_id;
  next();
});

/** Guards a route: the caller must hold at least one of the listed permissions. */
export const requirePermission = (...codes) =>
  handler(async (req, _res, next) => {
    if (!req.user) throw unauthorized();
    const held = new Set(req.user.permissions);
    if (codes.some((c) => held.has(c))) return next();
    throw forbidden(
      `Your role (${req.user.role_name}) does not include permission to do that. Required: ${codes.join(' or ')}.`
    );
  });

/**
 * Validates and replaces `req.body` / `req.query` / `req.params` with the
 * parsed result, so handlers receive coerced values rather than raw strings.
 */
export const validate = (schemas) =>
  handler(async (req, _res, next) => {
    for (const key of ['body', 'query', 'params']) {
      if (!schemas[key]) continue;
      try {
        const parsed = await schemas[key].parseAsync(req[key]);
        if (key === 'query') Object.assign(req.query, parsed);
        else req[key] = parsed;
      } catch (err) {
        if (err instanceof ZodError) {
          throw badRequest(
            'Some of the values submitted are not valid.',
            err.issues.map((i) => ({ field: i.path.join('.') || key, message: i.message }))
          );
        }
        throw err;
      }
    }
    next();
  });

/** Records a successful state-changing request in the action history. */
export const audit = (action, entity, describe) =>
  handler(async (req, res, next) => {
    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      writeAudit({
        orgId: req.orgId,
        userId: req.user?.id,
        action,
        entity,
        entityId: res.locals.auditId ?? req.params?.id ?? null,
        summary: typeof describe === 'function' ? describe(req, res) : describe,
        after: res.locals.auditAfter ?? null,
        before: res.locals.auditBefore ?? null,
        context: requestContext(req),
      });
    });
    next();
  });

export const notFoundHandler = (req, _res, next) =>
  next(new ApiError(404, `No route matches ${req.method} ${req.originalUrl}.`));

/** Single error responder: every failure leaves the API in the same shape. */
export function errorHandler(err, req, res, _next) {
  const status = err instanceof ApiError ? err.status : mapDriverError(err);
  const body = {
    error: {
      message: status === 500 ? 'Something went wrong on the server.' : err.message,
      status,
      ...(err.details ? { details: err.details } : {}),
    },
  };

  if (status >= 500) {
    console.error('[api] %s %s -> %s', req.method, req.originalUrl, err.stack || err.message);
    if (process.env.NODE_ENV !== 'production') body.error.detail = err.message;
  }

  res.status(status).json(body);
}

/** Turns the driver's constraint errors into something a user can act on. */
function mapDriverError(err) {
  switch (err.code) {
    case 'ER_DUP_ENTRY':
      err.message = 'That record already exists.';
      return 409;
    case 'ER_NO_REFERENCED_ROW':
    case 'ER_NO_REFERENCED_ROW_2':
      err.message = 'A referenced record does not exist.';
      return 422;
    case 'ER_ROW_IS_REFERENCED':
    case 'ER_ROW_IS_REFERENCED_2':
      err.message = 'That record is still referenced elsewhere and cannot be removed.';
      return 409;
    default:
      return 500;
  }
}
