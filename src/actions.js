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
  });
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
