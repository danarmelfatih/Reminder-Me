import { config } from '../config.js';

export function storageSummary(user) {
  const used = Number(user.storage_used_bytes);
  const quota = Number(user.storage_quota_bytes);
  const percent = quota > 0 ? Math.min(100, (used / quota) * 100) : 0;
  let level = 'normal';
  if (percent >= 100) level = 'full';
  else if (percent >= config.storageCriticalPercent) level = 'critical';
  else if (percent >= config.storageWarnPercent) level = 'warning';
  return { used, quota, remaining: Math.max(0, quota - used), percent, level };
}
