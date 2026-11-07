import { RRule } from 'rrule';
import { config, ensureStorageDirs } from './config.js';
import { query, withTransaction } from './db/pool.js';
import { logger } from './lib/logger.js';
import { extractDocumentText } from './services/extraction.service.js';
import { sendMail } from './services/mail.service.js';
import { reminderEmail, trashWarningEmail } from './services/mail.templates.js';
import {
  absolutePath,
  releaseStorage,
  removeItemDirectory,
  removeRelativeFiles,
} from './services/storage.service.js';

const TRASH_RETENTION_DAYS = 30;
const TRASH_WARNING_DAYS = 27;
const BATCH_SIZE = 50;

function formatInZone(date, timezone) {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone || 'Asia/Jakarta',
    }).format(date);
  } catch {
    return new Date(date).toISOString();
  }
}

function dedupeKey(prefix, id, date) {
  return `${prefix}:${id}:${new Date(date).toISOString()}`;
}

async function enqueueEmail(client, { userId, notificationId, to, template }) {
  await client.query(
    `INSERT INTO email_outbox
      (user_id, notification_id, to_email, subject, html, text)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (notification_id) DO NOTHING`,
    [userId, notificationId, to, template.subject, template.html, template.text],
  );
}

async function notify(client, { userId, itemId, occurrenceId, type, title, body, key }) {
  const result = await client.query(
    `INSERT INTO notifications
      (user_id, item_id, occurrence_id, type, title, body, dedupe_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING id`,
    [userId, itemId, occurrenceId, type, title, body, key],
  );
  return result.rows[0]?.id ?? null;
}

export async function heartbeat() {
  await query(
    `INSERT INTO system_heartbeats (name, last_seen_at, metadata)
     VALUES ('worker', now(), $1)
     ON CONFLICT (name) DO UPDATE SET last_seen_at = now(), metadata = EXCLUDED.metadata`,
    [JSON.stringify({ pid: process.pid, pollMs: config.workerPollMs })],
  );
}

async function deliverReminder(reminder) {
  return withTransaction(async (client) => {
    const locked = await client.query('SELECT * FROM reminders WHERE id = $1 FOR UPDATE', [
      reminder.id,
    ]);
    const current = locked.rows[0];
    if (!current?.is_active || !current.next_run_at) return false;
    if (new Date(current.next_run_at).getTime() > Date.now()) return false;

    const scheduledFor = current.next_run_at;
    const occurrence = await client.query(
      `INSERT INTO reminder_occurrences
        (reminder_id, user_id, item_id, kind, scheduled_for, status, delivered_at)
       VALUES ($1, $2, $3, 'series', $4, 'delivered', now())
       ON CONFLICT (reminder_id, kind, scheduled_for)
       DO UPDATE SET status = 'delivered', delivered_at = coalesce(reminder_occurrences.delivered_at, now())
       RETURNING id`,
      [current.id, current.user_id, current.item_id, scheduledFor],
    );

    const dueLabel = formatInZone(scheduledFor, current.timezone);
    const notificationId = await notify(client, {
      userId: current.user_id,
      itemId: current.item_id,
      occurrenceId: occurrence.rows[0].id,
      type: 'reminder',
      title: `Pengingat: ${reminder.item_title}`,
      body: `Jadwal ${dueLabel} (${current.timezone}).`,
      key: dedupeKey('reminder', current.id, scheduledFor),
    });

    if (notificationId) {
      await enqueueEmail(client, {
        userId: current.user_id,
        notificationId,
        to: reminder.user_email,
        template: reminderEmail({
          name: reminder.user_name,
          itemTitle: reminder.item_title,
          dueAt: scheduledFor,
          timezone: current.timezone,
          itemId: current.item_id,
        }),
      });
    }

    if (current.type === 'once') {
      await client.query(
        'UPDATE reminders SET is_active = false, next_run_at = NULL WHERE id = $1',
        [current.id],
      );
      return true;
    }

    let nextRun = null;
    try {
      const rule = RRule.fromString(current.rrule);
      nextRun = rule.after(new Date(scheduledFor), false);
    } catch (error) {
      logger.warn({ err: error, reminderId: current.id }, 'Invalid recurrence rule');
    }

    if (nextRun && (!current.repeat_until || nextRun <= new Date(current.repeat_until))) {
      await client.query('UPDATE reminders SET next_run_at = $1 WHERE id = $2', [
        nextRun,
        current.id,
      ]);
    } else {
      await client.query(
        'UPDATE reminders SET is_active = false, next_run_at = NULL WHERE id = $1',
        [current.id],
      );
    }
    return true;
  });
}

export async function processDueReminders() {
  const due = await query(
    `SELECT r.id, r.user_id, r.item_id, r.type, r.timezone, r.rrule, r.repeat_until,
            r.next_run_at, i.title AS item_title, u.name AS user_name, u.email AS user_email
     FROM reminders r
     JOIN items i ON i.id = r.item_id
     JOIN users u ON u.id = r.user_id
     WHERE r.is_active = true
       AND r.completed_at IS NULL
       AND r.next_run_at IS NOT NULL
       AND r.next_run_at <= now()
       AND i.deleted_at IS NULL
       AND u.status = 'active'
     ORDER BY r.next_run_at
     LIMIT $1`,
    [BATCH_SIZE],
  );

  let delivered = 0;
  for (const reminder of due.rows) {
    try {
      if (await deliverReminder(reminder)) delivered += 1;
    } catch (error) {
      logger.error({ err: error, reminderId: reminder.id }, 'Failed to deliver reminder');
    }
  }
  return delivered;
}

export async function processSnoozes() {
  const due = await query(
    `SELECT ro.id, ro.scheduled_for, ro.user_id, ro.item_id, r.timezone,
            i.title AS item_title, i.deleted_at, u.name AS user_name, u.email AS user_email,
            u.status AS user_status
     FROM reminder_occurrences ro
     JOIN reminders r ON r.id = ro.reminder_id
     JOIN items i ON i.id = ro.item_id
     JOIN users u ON u.id = ro.user_id
     WHERE ro.kind = 'snooze' AND ro.status = 'pending' AND ro.scheduled_for <= now()
     ORDER BY ro.scheduled_for
     LIMIT $1`,
    [BATCH_SIZE],
  );

  let delivered = 0;
  for (const occurrence of due.rows) {
    try {
      const done = await withTransaction(async (client) => {
        const locked = await client.query(
          `SELECT * FROM reminder_occurrences
           WHERE id = $1 AND kind = 'snooze' AND status = 'pending'
           FOR UPDATE`,
          [occurrence.id],
        );
        if (locked.rowCount === 0) return false;

        if (occurrence.deleted_at || occurrence.user_status !== 'active') {
          await client.query("UPDATE reminder_occurrences SET status = 'cancelled' WHERE id = $1", [
            occurrence.id,
          ]);
          return false;
        }

        const notificationId = await notify(client, {
          userId: occurrence.user_id,
          itemId: occurrence.item_id,
          occurrenceId: occurrence.id,
          type: 'reminder',
          title: `Pengingat: ${occurrence.item_title}`,
          body: `Pengingat ditunda, jadwal ${formatInZone(occurrence.scheduled_for, occurrence.timezone)}.`,
          key: `snooze:${occurrence.id}`,
        });

        if (notificationId) {
          await enqueueEmail(client, {
            userId: occurrence.user_id,
            notificationId,
            to: occurrence.user_email,
            template: reminderEmail({
              name: occurrence.user_name,
              itemTitle: occurrence.item_title,
              dueAt: occurrence.scheduled_for,
              timezone: occurrence.timezone,
              itemId: occurrence.item_id,
            }),
          });
        }

        await client.query(
          `UPDATE reminder_occurrences
           SET status = 'delivered', delivered_at = now()
           WHERE id = $1`,
          [occurrence.id],
        );
        return true;
      });
      if (done) delivered += 1;
    } catch (error) {
      logger.error({ err: error, occurrenceId: occurrence.id }, 'Failed to deliver snooze');
    }
  }
  return delivered;
}

export async function sendTrashWarnings() {
  const due = await query(
    `SELECT i.id, i.user_id, i.title, i.deleted_at, u.name AS user_name, u.email AS user_email,
            u.timezone AS user_timezone
     FROM items i
     JOIN users u ON u.id = i.user_id
     WHERE i.deleted_at IS NOT NULL
       AND i.trash_warning_sent_at IS NULL
       AND i.deleted_at <= now() - make_interval(days => $1)
       AND i.deleted_at > now() - make_interval(days => $2)
     ORDER BY i.deleted_at
     LIMIT $3`,
    [TRASH_WARNING_DAYS, TRASH_RETENTION_DAYS, BATCH_SIZE],
  );

  let sent = 0;
  for (const item of due.rows) {
    try {
      const done = await withTransaction(async (client) => {
        const locked = await client.query(
          `SELECT id, user_id, title, deleted_at, trash_warning_sent_at
           FROM items WHERE id = $1 FOR UPDATE`,
          [item.id],
        );
        const current = locked.rows[0];
        if (!current || current.trash_warning_sent_at) return false;

        const purgeAt = new Date(
          new Date(current.deleted_at).getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000,
        );
        const notificationId = await notify(client, {
          userId: item.user_id,
          itemId: item.id,
          occurrenceId: null,
          type: 'trash_warning',
          title: 'Item akan dihapus permanen',
          body: `"${current.title}" akan dihapus permanen pada ${formatInZone(purgeAt, item.user_timezone)}.`,
          key: `trash-warning:${item.id}`,
        });

        if (notificationId) {
          await enqueueEmail(client, {
            userId: item.user_id,
            notificationId,
            to: item.user_email,
            template: trashWarningEmail({
              name: item.user_name,
              itemTitle: current.title,
              purgeAt,
              timezone: item.user_timezone,
              itemId: item.id,
            }),
          });
        }

        await client.query('UPDATE items SET trash_warning_sent_at = now() WHERE id = $1', [
          item.id,
        ]);
        return true;
      });
      if (done) sent += 1;
    } catch (error) {
      logger.error({ err: error, itemId: item.id }, 'Failed to send trash warning');
    }
  }
  return sent;
}

export async function purgeTrash() {
  const due = await query(
    `SELECT id, user_id, file_size, file_path, thumbnail_path, og_image_path, favicon_path,
            custom_thumbnail_path
     FROM items
     WHERE deleted_at IS NOT NULL AND deleted_at <= now() - make_interval(days => $1)
     ORDER BY deleted_at
     LIMIT $2`,
    [TRASH_RETENTION_DAYS, BATCH_SIZE],
  );

  let purged = 0;
  for (const item of due.rows) {
    try {
      const removed = await withTransaction(async (client) => {
        const result = await client.query(
          `DELETE FROM items
           WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL
           RETURNING id`,
          [item.id, item.user_id],
        );
        if (result.rowCount === 0) return false;
        await releaseStorage(client, item.user_id, Number(item.file_size));
        return true;
      });
      if (!removed) continue;

      await removeRelativeFiles([
        item.file_path,
        item.thumbnail_path,
        item.og_image_path,
        item.favicon_path,
        item.custom_thumbnail_path,
      ]);
      await removeItemDirectory(item.user_id, item.id);
      purged += 1;
    } catch (error) {
      logger.error({ err: error, itemId: item.id }, 'Failed to purge trash item');
    }
  }
  return purged;
}

export async function processDocumentExtractions() {
  const claimed = await query(
    `UPDATE item_contents ic
     SET extraction_status = 'processing',
         extraction_attempts = extraction_attempts + 1,
         updated_at = now()
     WHERE ic.item_id IN (
       SELECT pending.item_id
       FROM item_contents pending
       JOIN items i ON i.id = pending.item_id
       WHERE pending.extraction_attempts < $1
         AND (
           pending.extraction_status = 'pending'
           OR (
             pending.extraction_status = 'processing'
             AND pending.updated_at < now() - make_interval(mins => $2)
           )
         )
       ORDER BY pending.updated_at
       LIMIT $3
       FOR UPDATE SKIP LOCKED
     )
     RETURNING ic.item_id, ic.extraction_attempts`,
    [config.documentExtractionMaxAttempts, config.documentExtractionStaleMinutes, BATCH_SIZE],
  );

  let processed = 0;
  let failed = 0;
  for (const content of claimed.rows) {
    const itemResult = await query('SELECT id, file_path, file_ext FROM items WHERE id = $1', [
      content.item_id,
    ]);
    const item = itemResult.rows[0];
    if (!item) continue;

    const file = absolutePath(item.file_path);
    try {
      if (!file) throw new Error('File item tidak ditemukan');
      const result = await extractDocumentText(file, item.file_ext);
      await query(
        `UPDATE item_contents
         SET extraction_status = $1,
             extracted_text = $2,
             extraction_error = $3,
             extracted_at = now(),
             char_count = $4,
             updated_at = now()
         WHERE item_id = $5`,
        [result.status, result.text || null, result.error, result.text.length, item.id],
      );
      processed += 1;
    } catch (error) {
      const attempts = Number(content.extraction_attempts);
      const exhausted = attempts >= config.documentExtractionMaxAttempts;
      await query(
        `UPDATE item_contents
         SET extraction_status = $1,
             extraction_error = $2,
             updated_at = now()
         WHERE item_id = $3`,
        [exhausted ? 'failed' : 'pending', String(error.message).slice(0, 500), item.id],
      );
      failed += 1;
      logger.error({ err: error, itemId: item.id, exhausted }, 'Failed to extract document text');
    }
  }
  return { processed, failed };
}

export async function processEmailOutbox() {
  const claimed = await query(
    `UPDATE email_outbox
     SET status = 'sending', locked_at = now(), attempts = attempts + 1
     WHERE id IN (
       SELECT id FROM email_outbox
       WHERE (
         status = 'pending' AND next_attempt_at <= now()
       ) OR (
         status = 'sending' AND locked_at < now() - make_interval(mins => $1)
       )
       ORDER BY next_attempt_at
       LIMIT 20
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [config.emailStaleLockMinutes],
  );

  let sent = 0;
  for (const email of claimed.rows) {
    try {
      await sendMail({
        to: email.to_email,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
      await query(
        "UPDATE email_outbox SET status = 'sent', sent_at = now(), locked_at = NULL, last_error = NULL WHERE id = $1",
        [email.id],
      );
      sent += 1;
    } catch (error) {
      const failed = email.attempts >= config.emailMaxAttempts;
      const backoffMinutes = Math.min(60, 2 ** Math.max(0, email.attempts - 1));
      await query(
        `UPDATE email_outbox
         SET status = $1,
             locked_at = NULL,
             last_error = $2,
             next_attempt_at = CASE WHEN $1 = 'pending'
               THEN now() + make_interval(mins => $3)
               ELSE next_attempt_at END
         WHERE id = $4`,
        [
          failed ? 'failed' : 'pending',
          String(error.message).slice(0, 500),
          backoffMinutes,
          email.id,
        ],
      );
      logger.error({ err: error, emailId: email.id, failed }, 'Failed to send outbox email');
    }
  }
  return sent;
}

export async function cleanupOldData() {
  const [notifications, sessions, tokens, outbox] = await Promise.all([
    query('DELETE FROM notifications WHERE created_at < now() - make_interval(days => $1)', [
      config.notificationRetentionDays,
    ]),
    query(
      `DELETE FROM sessions
       WHERE expires_at < now()
          OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '7 days')`,
    ),
    query(
      `DELETE FROM auth_tokens
       WHERE expires_at < now() - interval '7 days'
          OR (used_at IS NOT NULL AND used_at < now() - interval '7 days')`,
    ),
    query(
      `DELETE FROM email_outbox
       WHERE status IN ('sent', 'failed') AND created_at < now() - interval '30 days'`,
    ),
  ]);
  return {
    notifications: notifications.rowCount,
    sessions: sessions.rowCount,
    tokens: tokens.rowCount,
    outbox: outbox.rowCount,
  };
}

export async function runOnce() {
  await heartbeat();
  const reminders = await processDueReminders();
  const snoozes = await processSnoozes();
  const warnings = await sendTrashWarnings();
  const purged = await purgeTrash();
  const extractions = await processDocumentExtractions();
  const emails = await processEmailOutbox();
  const cleaned = await cleanupOldData();
  return { reminders, snoozes, warnings, purged, extractions, emails, cleaned };
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

let running = true;

function shutdown(signal) {
  running = false;
  logger.info({ signal }, 'Worker shutting down');
}

async function main() {
  ensureStorageDirs();
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  logger.info({ pollMs: config.workerPollMs }, 'Worker pengingat dimulai');

  while (running) {
    const started = Date.now();
    try {
      const result = await runOnce();
      if (
        result.reminders ||
        result.snoozes ||
        result.warnings ||
        result.purged ||
        result.extractions.processed ||
        result.extractions.failed ||
        result.emails
      ) {
        logger.info(result, 'Worker tick');
      }
    } catch (error) {
      logger.error({ err: error }, 'Worker tick failed');
    }
    const elapsed = Date.now() - started;
    await sleep(Math.max(1000, config.workerPollMs - elapsed));
  }
}

if (import.meta.main) {
  main().catch((error) => {
    logger.fatal({ err: error }, 'Worker berhenti karena error fatal');
    process.exit(1);
  });
}
