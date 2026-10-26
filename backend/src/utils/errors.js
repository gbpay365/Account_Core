export class ApiError extends Error {
  constructor(status, message, details = null, code = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    if (typeof details === 'string') {
      this.code = details;
      this.details = code;
    } else {
      this.details = details;
      this.code = code || details?.code;
    }
  }
}

export const badRequest = (m, d) => new ApiError(400, m, d);
export const unauthorized = (m = 'Authentication required.') => new ApiError(401, m);
export const forbidden = (m = 'You do not have permission to do that.') => new ApiError(403, m);
export const notFound = (m = 'Not found.') => new ApiError(404, m);
export const conflict = (m, d) => new ApiError(409, m, d);
export const unprocessable = (m, d) => new ApiError(422, m, d);
