import { addDays, weekday } from './schedule.js';

export const scheduledOn = (h, date) => !h.weekdays || !h.weekdays.length || h.weekdays.includes(weekday(date));

export function habitDone(h, log) {
  if (!log) return false;
  return h.kind === 'count' && h.target ? Number(log.amount) >= Number(h.target) : true;
}

export function logsOf(st, habitId) {
  const m = new Map();
  for (const l of st.habitLogs) if (l.habit_id === habitId) m.set(l.log_date, l);
  return m;
}

// Dias agendados seguidos concluídos. Hoje ainda em aberto não quebra a sequência.
export function streak(h, logs, today) {
  let n = 0;
  let d = today;
  for (let i = 0; i < 120; i++) {
    if (scheduledOn(h, d)) {
      if (habitDone(h, logs.get(d))) n++;
      else if (d !== today) break;
    }
    d = addDays(d, -1);
  }
  return n;
}

// Hábitos de uma pessoa que valem para hoje
export function habitsToday(st, today, userId) {
  return st.habits
    .filter((h) => h.active && h.owner_id === userId && scheduledOn(h, today))
    .map((h) => {
      const logs = logsOf(st, h.id);
      const log = logs.get(today);
      return { ...h, log, done: habitDone(h, log), amount: log ? Number(log.amount) : 0, streak: streak(h, logs, today) };
    });
}

export function nextOccurrence(h, today) {
  for (let i = 1; i <= 7; i++) { const d = addDays(today, i); if (scheduledOn(h, d)) return d; }
  return null;
}
