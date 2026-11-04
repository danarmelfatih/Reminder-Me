import { RRule } from 'rrule';
import { query, withTransaction } from '../db/pool.js';
import { HttpError } from '../lib/errors.js';
import { assertItemOwnership } from './item.service.js';

const FREQUENCIES = {
  daily: RRule.DAILY,
  weekly: RRule.WEEKLY,
  monthly: RRule.MONTHLY,
  yearly: RRule.YEARLY,
};

const WEEKDAYS = [RRule.SU, RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA];

function buildRule(startAt, recurrence) {
  if (!recurrence?.frequency || !FREQUENCIES[recurrence.frequency]) {
    throw new HttpError(422, 'Pola pengulangan tidak valid', 'validation_error');
  }

  const options = {
    freq: FREQUENCIES[recurrence.frequency],
    interval: Math.max(1, Number(recurrence.interval) || 1),
    dtstart: startAt,
  };

  if (recurrence.frequency === 'weekly' && recurrence.weekdays?.length) {
    options.byweekday = recurrence.weekdays.map((day) => WEEKDAYS[day]).filter(Boolean);
  }
  if (recurrence.repeatUntil) {
    const until = new Date(recurrence.repeatUntil);
    if (Number.isNaN(until.getTime())) {
      throw new HttpError(422, 'Batas pengulangan tidak valid', 'validation_error');
    }
    options.until = until;
  }

  return new RRule(options);
}

export async function getReminder(userId, itemId) {
  const result = await query(
    `SELECT r.*, i.title AS item_title
     FROM reminders r
     JOIN items i ON i.id = r.item_id
     WHERE r.user_id = $1 AND r.item_id = $2`,
    [userId, itemId],
  );
  return result.rows[0] ?? null;
}

export async function upsertReminder(userId, itemId, data) {
  const item = await assertItemOwnership(userId, itemId);
  if (item.deleted_at) {
    throw new HttpError(400, 'Item di Trash tidak dapat memiliki pengingat', 'item_in_trash');
  }

  const startAt = new Date(data.startAt);
  if (Number.isNaN(startAt.getTime())) {
    throw new HttpError(422, 'Tanggal pengingat tidak valid', 'validation_error');
  }

  const now = new Date();
  let ruleText = null;
  let repeatUntil = null;
  let nextRunAt;

  if (data.type === 'recurring') {
    const rule = buildRule(startAt, data.recurrence);
    const next = rule.after(now, true);
    if (!next) {
      throw new HttpError(
        422,
        'Tidak ada jadwal pengingat berikutnya. Periksa tanggal dan batas pengulangan.',
        'invalid_recurrence',
      );
    }
    ruleText = rule.toString();
    repeatUntil = data.recurrence?.repeatUntil ? new Date(data.recurrence.repeatUntil) : null;
    nextRunAt = next;
  } else {
    if (startAt.getTime() <= now.getTime()) {
      throw new HttpError(422, 'Waktu pengingat harus di masa depan', 'invalid_start_at');
    }
    nextRunAt = startAt;
  }

  return withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO reminders
        (user_id, item_id, type, timezone, start_at, rrule, repeat_until, next_run_at, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
       ON CONFLICT (item_id) DO UPDATE SET
         type = EXCLUDED.type,
         timezone = EXCLUDED.timezone,
         start_at = EXCLUDED.start_at,
         rrule = EXCLUDED.rrule,
         repeat_until = EXCLUDED.repeat_until,
         next_run_at = EXCLUDED.next_run_at,
         is_active = true,
         completed_at = NULL,
         updated_at = now()
       RETURNING *`,
      [userId, itemId, data.type, data.timezone, startAt, ruleText, repeatUntil, nextRunAt],
    );
    const reminder = result.rows[0];
    await client.query(
      `UPDATE reminder_occurrences SET status = 'cancelled'
       WHERE reminder_id = $1 AND kind = 'snooze' AND status = 'pending'`,
      [reminder.id],
    );
    return reminder;
  });
}

export async function completeReminder(userId, itemId) {
  return withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE reminders
       SET is_active = false, completed_at = now(), next_run_at = NULL
       WHERE user_id = $1 AND item_id = $2
       RETURNING *`,
      [userId, itemId],
    );
    if (result.rowCount === 0) {
      throw new HttpError(404, 'Pengingat tidak ditemukan', 'not_found');
    }
    await client.query(
      `UPDATE reminder_occurrences SET status = 'completed'
       WHERE reminder_id = $1 AND status IN ('pending', 'delivered')`,
      [result.rows[0].id],
    );
    return result.rows[0];
  });
}

export async function snoozeReminder(userId, itemId, durationMinutes) {
  return withTransaction(async (client) => {
    const existing = await client.query(
      'SELECT * FROM reminders WHERE user_id = $1 AND item_id = $2 FOR UPDATE',
      [userId, itemId],
    );
    if (existing.rowCount === 0) {
      throw new HttpError(404, 'Pengingat tidak ditemukan', 'not_found');
    }
    const reminder = existing.rows[0];
    const snoozedUntil = new Date(Date.now() + durationMinutes * 60 * 1000);

    await client.query(
      `INSERT INTO reminder_occurrences
        (reminder_id, user_id, item_id, kind, scheduled_for, status)
       VALUES ($1, $2, $3, 'snooze', $4, 'pending')
       ON CONFLICT (reminder_id, kind, scheduled_for) DO NOTHING`,
      [reminder.id, userId, itemId, snoozedUntil],
    );

    return { ...reminder, snoozed_until: snoozedUntil };
  });
}

export async function deleteReminder(userId, itemId) {
  const result = await query(
    'DELETE FROM reminders WHERE user_id = $1 AND item_id = $2 RETURNING id',
    [userId, itemId],
  );
  if (result.rowCount === 0) {
    throw new HttpError(404, 'Pengingat tidak ditemukan', 'not_found');
  }
  return true;
}
