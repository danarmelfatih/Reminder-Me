export class HttpError extends Error {
  constructor(status, message, code = 'error', details = undefined) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function notFound(message = 'Data tidak ditemukan') {
  return new HttpError(404, message, 'not_found');
}

export function forbidden(message = 'Anda tidak memiliki akses') {
  return new HttpError(403, message, 'forbidden');
}

export function badRequest(message = 'Permintaan tidak valid', details) {
  return new HttpError(400, message, 'bad_request', details);
}
