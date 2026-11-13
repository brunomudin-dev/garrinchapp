// Lógica de recorrência compartilhada (app + função de notificações)
// Datas sempre como 'YYYY-MM-DD' no fuso de São Paulo.

export const TZ = 'America/Sao_Paulo';

export function todayStr(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
export function nowHM(d = new Date()) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}
export function toDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
export function fromDate(dt) { return dt.toISOString().slice(0, 10); }
export function addDays(s, n) { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return fromDate(d); }
export function diffDays(a, b) { return Math.round((toDate(a) - toDate(b)) / 86400000); } // a - b
export function weekday(s) { return toDate(s).getUTCDay(); }

function lastCleanerDay(hh, today) {
  if (!hh?.cleaner_start) return null;
  const step = hh.cleaner_interval_days || 14;
  const diff = diffDays(today, hh.cleaner_start);
  if (diff < 0) return null;
  return addDays(hh.cleaner_start, Math.floor(diff / step) * step);
}
export function nextCleanerDay(hh, today) {
  if (!hh?.cleaner_start) return null;
  const step = hh.cleaner_interval_days || 14;
  const diff = diffDays(today, hh.cleaner_start);
  if (diff <= 0) return hh.cleaner_start;
  const k = Math.ceil(diff / step);
  return addDays(hh.cleaner_start, k * step);
}
export function isCleanerDay(hh, today) { return lastCleanerDay(hh, today) === today; }

/**
 * status: 'done' (feito hoje) | 'due' (é hoje) | 'late' (atrasada) | 'ok' (em dia) | 'cleaner'
 * retorna { status, lateDays, next, since, label }
 */
export function taskStatus(task, lastDone, today, hh) {
  const start = task.start_date || today;
  if (lastDone === today && task.rule !== 'cleaner') return { status: 'done', label: 'Feito hoje' };

  if (task.rule === 'once') {
    if (lastDone) return { status: 'finished', label: `Feita ${fmtRel(lastDone, today)}` };
    const d = diffDays(today, start);
    if (d < 0) return { status: 'ok', next: start, label: `Para ${fmtRel(start, today)}` };
    if (d === 0) return { status: 'due', next: start, label: 'Hoje' };
    return { status: 'late', next: start, lateDays: d, label: `Atrasada ${d} dia${d > 1 ? 's' : ''}` };
  }

  if (task.rule === 'interval') {
    const n = task.interval_days || 7;
    const next = lastDone ? addDays(lastDone, n) : (start <= today ? today : start);
    const d = diffDays(today, next);
    if (d < 0) return { status: 'ok', next, label: `Próxima ${fmtRel(next, today)}` };
    if (d === 0) return { status: 'due', next, label: 'Hoje' };
    return { status: 'late', next, lateDays: d, label: `Atrasada ${d} dia${d > 1 ? 's' : ''}` };
  }

  if (task.rule === 'weekdays') {
    const days = task.weekdays || [];
    if (!days.length) return { status: 'ok', label: 'Sem dias definidos' };
    let sched = null;
    for (let i = 0; i < 7; i++) { const c = addDays(today, -i); if (days.includes(weekday(c))) { sched = c; break; } }
    let next = null;
    for (let i = 1; i <= 7; i++) { const c = addDays(today, i); if (days.includes(weekday(c))) { next = c; break; } }
    if (!sched || sched < start || (lastDone && lastDone >= sched)) return { status: 'ok', next, label: `Próxima ${fmtRel(next, today)}` };
    if (sched === today) return { status: 'due', next, label: 'Hoje' };
    const d = diffDays(today, sched);
    return { status: 'late', next, lateDays: d, label: `Atrasada ${d} dia${d > 1 ? 's' : ''}` };
  }

  if (task.rule === 'as_needed') {
    const ref = lastDone || null;
    const max = task.max_days || 3;
    if (!ref) return { status: 'ok', label: 'Quando precisar' };
    const since = diffDays(today, ref);
    if (since >= max) return { status: since > max ? 'late' : 'due', since, lateDays: since - max, label: `Há ${since} dias, máximo ${max}` };
    return { status: 'ok', since, label: since === 1 ? 'Feito ontem' : `Feito há ${since} dias` };
  }

  if (task.rule === 'cleaner') {
    if (isCleanerDay(hh, today)) return { status: 'cleaner', label: 'Faxina hoje: a faxineira cuida' };
    const next = nextCleanerDay(hh, today);
    return { status: 'ok', next, label: next ? `Próxima faxina ${fmtRel(next, today)}` : 'Defina o dia da faxina' };
  }
  return { status: 'ok', label: '' };
}

const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export function fmtRel(s, today) {
  if (!s) return '';
  const d = diffDays(s, today);
  if (d === 0) return 'hoje';
  if (d === 1) return 'amanhã';
  if (d === -1) return 'ontem';
  if (d > 1 && d < 7) return `${WD[weekday(s)]} (${s.slice(8, 10)}/${s.slice(5, 7)})`;
  return `${s.slice(8, 10)}/${s.slice(5, 7)}`;
}

export function ruleLabel(t) {
  if (t.rule === 'interval') return t.interval_days === 1 ? 'Todo dia' : t.interval_days === 2 ? 'Dia sim, dia não' : t.interval_days === 7 ? '1x por semana' : `A cada ${t.interval_days} dias`;
  if (t.rule === 'weekdays') return (t.weekdays || []).slice().sort().map((d) => WD[d]).join(', ');
  if (t.rule === 'as_needed') return `Quando precisar (máx. ${t.max_days || 3} dias)`;
  if (t.rule === 'cleaner') return 'Dia da faxineira';
  if (t.rule === 'once') return 'Uma vez só';
  return '';
}
