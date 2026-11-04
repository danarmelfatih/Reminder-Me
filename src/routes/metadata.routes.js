import express from 'express';
import { HttpError } from '../lib/errors.js';
import { metadataLimiter } from '../middleware/rateLimit.js';
import { extractMetadata, fetchImage } from '../services/metadata.service.js';

export const metadataRouter = express.Router();

function requestUrl(req) {
  const url = String(req.query.url ?? '').trim();
  if (!url) throw new HttpError(422, 'URL wajib diisi', 'invalid_url');
  if (url.length > 2048) throw new HttpError(422, 'URL terlalu panjang', 'invalid_url');
  return url;
}

metadataRouter.get('/', metadataLimiter, async (req, res) => {
  const metadata = await extractMetadata(requestUrl(req));
  res.json({ metadata });
});

metadataRouter.get('/image', metadataLimiter, async (req, res) => {
  const image = await fetchImage(requestUrl(req));
  res.setHeader('Content-Type', image.contentType);
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.send(image.buffer);
});

export default metadataRouter;
