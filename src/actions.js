import { sb } from './data.js';
import { toast, haptic } from './ui.jsx';
import { taskStatus } from './lib/schedule.js';

export function lastDoneMap(taskLogs) {
  const m = new Map();
  for (const l of taskLogs) if (!m.has(l.task_id) || l.done_on > m.get(l.task_id).done_on) m.set(l.task_id, l);
  return m;
}

export function tasksWithStatus(st, today) {
  const last = lastDoneMap(st.taskLogs);
  return st.tasks.filter((t) => t.active).map((t) => {
    const l = last.get(t.id);
    return { ...t, last: l, st: taskStatus(t, l?.done_on || null, today, st.hh) };
  }).filter((t) => t.st.status !== 'finished');
}

export async function markTaskOn(store, task, date, who) {
  const { st, reload } = store;
  haptic();
  const row = { task_id: task.id, done_on: date };
  if (who === 'cleaner') { row.done_by = null; row.done_by_label = 'Faxineira'; }
  else if (who) row.done_by = who;
  const dup = st.taskLogs.find((l) => l.task_id === task.id && l.done_on === date);
  if (dup) await sb.from('task_logs').delete().eq('id', dup.id);
  const { data, error } = await sb.from('task_logs').insert(row).select().single();
  if (error) { toast('Erro: ' + error.message); return; }
  toast(`${task.icon} ${task.name}: feito${date === todayStrLocal() ? '' : ' em ' + date.slice(8) + '/' + date.slice(5, 7)}!`, {
    label: 'Desfazer',
    fn: async () => { await sb.from('task_logs').delete().eq('id', data.id); reload(); },
  });
  reload();
}
const todayStrLocal = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

export function pendingState(p, today) {
  if (p.done_at) return { cls: 'ok', text: 'feita', rank: 9 };
  if (p.due_date) {
    const d = Math.round((Date.parse(p.due_date) - Date.parse(today)) / 86400000);
    if (d < 0) return { cls: 'late', text: `atrasada ${-d} dia${d < -1 ? 's' : ''}`, rank: 0, late: true };
    if (d === 0) return { cls: 'due', text: 'hoje', rank: 1, soon: true };
    if (d === 1) return { cls: 'due', text: 'amanhã', rank: 2, soon: true };
    if (d === 2) return { cls: 'due', text: 'em 2 dias', rank: 3, soon: true };
    return { cls: '', text: `${p.due_date.slice(8)}/${p.due_date.slice(5, 7)}`, rank: 5 };
  }
  return { cls: '', text: '', rank: p.urgent ? 4 : 6 };
}

export async function togglePending(store, p) {
  const { st, setSt, reload } = store;
  haptic();
  const patch = p.done_at ? { done_at: null, done_by: null } : { done_at: new Date().toISOString(), done_by: st.me.id };
  setSt({ ...st, pendings: st.pendings.map((x) => (x.id === p.id ? { ...x, ...patch } : x)) });
  const { error } = await sb.from('pendings').update(patch).eq('id', p.id);
  if (error) toast('Erro: ' + error.message);
  else if (!p.done_at) toast(`✅ ${p.title}`, { label: 'Desfazer', fn: async () => { await sb.from('pendings').update({ done_at: null, done_by: null }).eq('id', p.id); reload(); } });
  reload();
}

export async function toggleTask(store, task, today) {
  const { st, setSt, reload } = store;
  haptic();
  const existing = st.taskLogs.find((l) => l.task_id === task.id && l.done_on === today);
  if (existing) {
    setSt({ ...st, taskLogs: st.taskLogs.filter((l) => l.id !== existing.id) });
    const { error } = await sb.from('task_logs').delete().eq('id', existing.id);
    if (error) { toast('Erro: ' + error.message); reload(); }
    return;
  }
  const tmp = { id: 'tmp' + Date.now(), task_id: task.id, done_on: today, done_by: st.me.id, done_at: new Date().toISOString() };
  setSt({ ...st, taskLogs: [tmp, ...st.taskLogs] });
  const { data, error } = await sb.from('task_logs').insert({ task_id: task.id, done_on: today }).select().single();
  if (error) { toast('Erro: ' + error.message); reload(); return; }
  toast(`${task.icon} ${task.name}: feito!`, {
    label: 'Desfazer',
    fn: async () => { await sb.from('task_logs').delete().eq('id', data.id); reload(); },
  });
  reload();
}

export async function toggleMed(store, med, today) {
  const { st, setSt, reload } = store;
  haptic();
  const existing = st.medLogs.find((l) => l.med_id === med.id && l.log_date === today);
  const perDose = 1;
  if (existing) {
    setSt({ ...st, medLogs: st.medLogs.filter((l) => l.id !== existing.id) });
    await sb.from('med_logs').delete().eq('id', existing.id);
    if (med.stock_qty != null) await sb.from('meds').update({ stock_qty: Number(med.stock_qty) + perDose }).eq('id', med.id);
  } else {
    setSt({ ...st, medLogs: [...st.medLogs, { id: 'tmp' + Date.now(), med_id: med.id, log_date: today }] });
    const { error } = await sb.from('med_logs').insert({ med_id: med.id, log_date: today });
    if (error) { toast('Erro: ' + error.message); }
    if (med.stock_qty != null) await sb.from('meds').update({ stock_qty: Math.max(0, Number(med.stock_qty) - perDose) }).eq('id', med.id);
  }
  reload();
}

export function medStockDays(m) {
  if (m.stock_qty == null) return null;
  const per = Number(m.per_day) || 1;
  return Math.floor(Number(m.stock_qty) / per);
}
