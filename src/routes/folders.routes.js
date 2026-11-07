import express from 'express';
import { HttpError } from '../lib/errors.js';
import { folderSchema, parse } from '../lib/validation.js';
import { uuidParam } from '../middleware/params.js';
import {
  createFolder,
  deleteFolder,
  listFolders,
  renameFolder,
} from '../services/folder.service.js';

export const foldersRouter = express.Router();

foldersRouter.param('id', uuidParam);

foldersRouter.get('/', async (req, res) => {
  const folders = await listFolders(req.user.id);
  res.json({ folders, limit: req.user.folder_limit });
});

foldersRouter.post('/', async (req, res) => {
  const data = parse(folderSchema, req.body);
  const folder = await createFolder(req.user.id, data.name);
  res.status(201).json({ message: 'Folder dibuat', folder });
});

foldersRouter.patch('/:id', async (req, res) => {
  const data = parse(folderSchema, req.body);
  const folder = await renameFolder(req.user.id, req.params.id, data.name);
  res.json({ message: 'Folder diperbarui', folder });
});

foldersRouter.delete('/:id', async (req, res) => {
  const result = await deleteFolder(req.user.id, req.params.id);
  res.json({
    message:
      result.movedItems > 0
        ? `Folder dihapus. ${result.movedItems} item dipindahkan ke Tanpa Folder.`
        : 'Folder dihapus.',
    movedItems: result.movedItems,
  });
});

foldersRouter.get('/:id', async (req, res) => {
  const folders = await listFolders(req.user.id);
  const folder = folders.find((entry) => entry.id === req.params.id);
  if (!folder) throw new HttpError(404, 'Folder tidak ditemukan', 'not_found');
  res.json({ folder });
});

export default foldersRouter;
