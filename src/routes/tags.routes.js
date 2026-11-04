import express from 'express';
import { HttpError } from '../lib/errors.js';
import { parse, tagSchema } from '../lib/validation.js';
import { createTag, deleteTag, listTags, renameTag } from '../services/tag.service.js';

export const tagsRouter = express.Router();

tagsRouter.get('/', async (req, res) => {
  const tags = await listTags(req.user.id);
  res.json({ tags, limit: req.user.tag_limit });
});

tagsRouter.post('/', async (req, res) => {
  const data = parse(tagSchema, req.body);
  const tag = await createTag(req.user.id, data.name);
  res.status(201).json({ message: 'Tag dibuat', tag });
});

tagsRouter.patch('/:id', async (req, res) => {
  const data = parse(tagSchema, req.body);
  const tag = await renameTag(req.user.id, req.params.id, data.name);
  res.json({ message: 'Tag diperbarui', tag });
});

tagsRouter.delete('/:id', async (req, res) => {
  await deleteTag(req.user.id, req.params.id);
  res.json({ message: 'Tag dihapus. Item tetap tersimpan.' });
});

tagsRouter.get('/:id', async (req, res) => {
  const tags = await listTags(req.user.id);
  const tag = tags.find((entry) => entry.id === req.params.id);
  if (!tag) throw new HttpError(404, 'Tag tidak ditemukan', 'not_found');
  res.json({ tag });
});

export default tagsRouter;
