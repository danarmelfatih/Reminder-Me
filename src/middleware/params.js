import { HttpError } from '../lib/errors.js';
import { uuidSchema } from '../lib/validation.js';

export function uuidParam(_req, _res, next, value) {
  if (!uuidSchema.safeParse(value).success) {
    return next(new HttpError(404, 'Data tidak ditemukan', 'not_found'));
  }
  return next();
}
