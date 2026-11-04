import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import expressLayouts from 'express-ejs-layouts';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { config } from './config.js';
import { query } from './db/pool.js';
import { logger } from './lib/logger.js';
import { attachUserLocals, loadUser, requireAdmin, requireAuth } from './middleware/auth.js';
import { ensureCsrf, verifyCsrf } from './middleware/csrf.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { readFlash } from './middleware/flash.js';
import { appLocals } from './middleware/locals.js';
import { apiLimiter, exportLimiter } from './middleware/rateLimit.js';
import { adminRouter } from './routes/admin.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { dashboardRouter } from './routes/dashboard.routes.js';
import { exportRouter } from './routes/export.routes.js';
import { foldersRouter } from './routes/folders.routes.js';
import { itemsRouter } from './routes/items.routes.js';
import { meRouter } from './routes/me.routes.js';
import { metadataRouter } from './routes/metadata.routes.js';
import { notificationsRouter } from './routes/notifications.routes.js';
import { pagesRouter } from './routes/pages.routes.js';
import { tagsRouter } from './routes/tags.routes.js';

export function createApp() {
  const app = express();

  if (config.trustProxy > 0) {
    app.set('trust proxy', config.trustProxy);
  }

  app.disable('x-powered-by');
  app.set('view engine', 'ejs');
  app.set('views', path.join(config.rootDir, 'src', 'views'));
  app.use(expressLayouts);
  app.set('layout', 'layouts/app');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: null,
        },
      },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: 'no-referrer' },
      hsts: config.isProd,
    }),
  );

  app.use(
    pinoHttp({
      logger,
      autoLogging: !config.isTest,
      redact: ['req.headers.cookie', 'req.headers.authorization'],
    }),
  );

  app.use(
    express.static(path.join(config.rootDir, 'public'), {
      maxAge: config.isProd ? '1d' : 0,
      index: false,
      fallthrough: true,
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());

  app.use(ensureCsrf);
  app.use(verifyCsrf);
  app.use(loadUser);
  app.use(attachUserLocals);
  app.use(readFlash);
  app.use(appLocals);

  app.get('/api/health', async (req, res) => {
    const started = Date.now();
    try {
      await query('SELECT 1');
      res.json({
        status: 'ok',
        database: 'ok',
        latencyMs: Date.now() - started,
        uptimeSeconds: Math.round(process.uptime()),
      });
    } catch (error) {
      logger.error({ err: error }, 'Health check database failed');
      res.status(503).json({ status: 'degraded', database: 'down' });
    }
  });

  app.use('/api', apiLimiter);
  app.use('/api/auth', authRouter);
  app.use('/api/me', requireAuth, meRouter);
  app.use('/api/dashboard', requireAuth, dashboardRouter);
  app.use('/api/items', requireAuth, itemsRouter);
  app.use('/api/folders', requireAuth, foldersRouter);
  app.use('/api/tags', requireAuth, tagsRouter);
  app.use('/api/notifications', requireAuth, notificationsRouter);
  app.use('/api/export', requireAuth, exportLimiter, exportRouter);
  app.use('/api/metadata', requireAuth, metadataRouter);
  app.use('/api/admin', requireAdmin, adminRouter);
  app.use('/admin', requireAdmin);
  app.use('/', pagesRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
