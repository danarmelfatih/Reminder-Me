import { h, toDateTimeLocalValue } from './ui.js';

const WEEKDAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function field(label, input) {
  return h('div', { class: 'field' }, h('label', { text: label }), input);
}

export function createReminderControls({ timezone = 'Asia/Jakarta', reminder = null } = {}) {
  const activeTimezone = reminder?.timezone || timezone;

  const typeSelect = h(
    'select',
    { name: 'reminderType' },
    h('option', { value: 'once', text: 'Sekali' }),
    h('option', { value: 'recurring', text: 'Berulang' }),
  );
  typeSelect.value = reminder?.type ?? 'once';

  const startInput = h('input', {
    type: 'datetime-local',
    name: 'reminderStartAt',
    required: true,
    value: toDateTimeLocalValue(
      reminder?.nextRunAt ?? new Date(Date.now() + 3600000),
      activeTimezone,
    ),
  });

  const timezoneInput = h('input', {
    type: 'text',
    name: 'reminderTimezone',
    value: activeTimezone,
    maxlength: 64,
    required: true,
  });

  const frequencySelect = h(
    'select',
    { name: 'reminderFrequency' },
    h('option', { value: 'daily', text: 'Harian' }),
    h('option', { value: 'weekly', text: 'Mingguan' }),
    h('option', { value: 'monthly', text: 'Bulanan' }),
    h('option', { value: 'yearly', text: 'Tahunan' }),
  );
  const intervalInput = h('input', {
    type: 'number',
    name: 'reminderInterval',
    min: 1,
    max: 99,
    value: 1,
  });
  const repeatUntilInput = h('input', {
    type: 'datetime-local',
    name: 'reminderRepeatUntil',
  });

  const weekdayInputs = WEEKDAY_LABELS.map((label, index) => {
    const input = h('input', { type: 'checkbox', value: String(index) });
    return {
      input,
      node: h('label', { class: 'checkbox-row' }, input, h('span', { text: label })),
    };
  });

  if (reminder?.recurrence) {
    frequencySelect.value = reminder.recurrence.frequency;
    intervalInput.value = String(reminder.recurrence.interval ?? 1);
    const selectedWeekdays = new Set(reminder.recurrence.weekdays ?? []);
    for (const [index, entry] of weekdayInputs.entries()) {
      entry.input.checked = selectedWeekdays.has(index);
    }
    if (reminder.recurrence.repeatUntil) {
      repeatUntilInput.value = toDateTimeLocalValue(
        reminder.recurrence.repeatUntil,
        activeTimezone,
      );
    }
  }

  const recurringFields = h(
    'div',
    { class: 'form-stack' },
    h(
      'div',
      { class: 'form-row' },
      field('Frekuensi', frequencySelect),
      field('Setiap', intervalInput),
    ),
    field(
      'Hari (untuk mingguan)',
      h(
        'div',
        { class: 'form-row' },
        weekdayInputs.map((entry) => entry.node),
      ),
    ),
    field('Berulang sampai (opsional)', repeatUntilInput),
  );

  const updateVisibility = () => {
    recurringFields.hidden = typeSelect.value !== 'recurring';
  };
  typeSelect.addEventListener('change', updateVisibility);
  updateVisibility();

  const node = h(
    'div',
    { class: 'form-stack reminder-controls' },
    h(
      'div',
      { class: 'form-row' },
      field('Jenis pengingat', typeSelect),
      field('Tanggal dan waktu', startInput),
    ),
    field('Zona waktu', timezoneInput),
    recurringFields,
  );

  function validate() {
    if (!startInput.value) throw new Error('Tanggal dan waktu wajib diisi.');
    const zone = timezoneInput.value.trim();
    if (!zone) throw new Error('Zona waktu wajib diisi.');

    const startAt = zonedTimeToUtc(startInput.value, zone);
    if (Number.isNaN(Date.parse(startAt))) throw new Error('Tanggal dan waktu tidak valid.');

    if (typeSelect.value === 'recurring' && repeatUntilInput.value) {
      const repeatUntil = zonedTimeToUtc(repeatUntilInput.value, zone);
      if (Date.parse(repeatUntil) <= Date.parse(startAt)) {
        throw new Error('Batas pengulangan harus setelah waktu mulai.');
      }
    }
  }

  function getPayload() {
    const zone = timezoneInput.value.trim();
    return {
      type: typeSelect.value,
      startAt: zonedTimeToUtc(startInput.value, zone),
      timezone: zone,
      recurrence:
        typeSelect.value === 'recurring'
          ? {
              frequency: frequencySelect.value,
              interval: Math.max(1, Number(intervalInput.value) || 1),
              weekdays:
                frequencySelect.value === 'weekly'
                  ? weekdayInputs
                      .filter((entry) => entry.input.checked)
                      .map((entry) => Number(entry.input.value))
                  : undefined,
              repeatUntil: repeatUntilInput.value
                ? zonedTimeToUtc(repeatUntilInput.value, zone)
                : null,
            }
          : null,
    };
  }

  return { node, validate, getPayload, typeSelect, startInput, timezoneInput };
}

export function zonedTimeToUtc(localValue, timeZone) {
  if (!localValue) return '';
  const [datePart, timePart] = localValue.split('T');
  if (!datePart || !timePart) return new Date(localValue).toISOString();
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(utcGuess)).map((part) => [part.type, part.value]),
    );
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour) % 24,
      Number(parts.minute),
    );
    return new Date(utcGuess - (asUtc - utcGuess)).toISOString();
  } catch {
    return new Date(localValue).toISOString();
  }
}
