import express from 'express';
import { notificationQuerySchema, parse } from '../lib/validation.js';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  unreadCount,
} from '../services/notification.service.js';

export const notificationsRouter = express.Router();

notificationsRouter.get('/', async (req, res) => {
  const data = parse(notificationQuerySchema, req.query);
  const result = await listNotifications(req.user.id, {
    unread: data.unread === 'true',
    page: data.page,
  });
  res.json(result);
});

notificationsRouter.get('/count', async (req, res) => {
  res.json({ unread: await unreadCount(req.user.id) });
});

notificationsRouter.post('/read-all', async (req, res) => {
  const count = await markAllNotificationsRead(req.user.id);
  res.json({ message: `${count} notifikasi ditandai dibaca`, count });
});

notificationsRouter.post('/:id/read', async (req, res) => {
  await markNotificationRead(req.user.id, req.params.id);
  res.json({ message: 'Notifikasi ditandai dibaca' });
});

export default notificationsRouter;
