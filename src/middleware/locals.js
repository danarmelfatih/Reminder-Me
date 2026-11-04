import { config } from '../config.js';
import {
  escapeHtml,
  formatBytes,
  formatDate,
  formatDateTime,
  initials,
  priorityLabels,
  safeHttpUrl,
  statusLabel,
  timeAgo,
  toDateTimeLocal,
  truncate,
  typeLabels,
} from '../lib/format.js';

export function appLocals(req, res, next) {
  res.locals.appName = 'Reminder Me';
  res.locals.currentPath = req.path;
  res.locals.googleEnabled = config.googleEnabled;
  res.locals.pageScript = null;
  res.locals.pageId = '';
  res.locals.bodyClass = '';
  res.locals.flash = res.locals.flash ?? null;
  res.locals.helpers = {
    escapeHtml,
    formatBytes,
    formatDate,
    formatDateTime,
    initials,
    priorityLabels,
    safeHttpUrl,
    statusLabel,
    timeAgo,
    toDateTimeLocal,
    truncate,
    typeLabels,
  };
  next();
}
