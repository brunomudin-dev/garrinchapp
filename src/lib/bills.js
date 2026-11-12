import { diffDays } from './schedule.js';

export function dueDateFor(day, ym) {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ym}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

const dm = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;

// Situação de uma conta no mês atual
export function billInfo(b, payments, today) {
  const ym = today.slice(0, 7);
  const pay = payments.find((p) => p.bill_id === b.id && p.ym === ym);
  if (pay) return { state: 'paid', pay, label: 'Paga neste mês', rank: 9 };
  if (!b.due_day) return { state: 'nodate', label: 'Sem vencimento definido', rank: 8 };
  const due = dueDateFor(b.due_day, ym);
  const diff = diffDays(due, today);
  if (diff < 0) return { state: 'late', due, diff, label: `Venceu há ${-diff} ${-diff === 1 ? 'dia' : 'dias'}`, rank: 0 + (diff / 100) };
  if (diff === 0) return { state: 'today', due, diff, label: 'Vence hoje', rank: 1 };
  if (diff <= (b.alert_days ?? 3)) return { state: 'soon', due, diff, label: diff === 1 ? 'Vence amanhã' : `Vence em ${diff} dias (${dm(due)})`, rank: 2 + diff / 100 };
  return { state: 'later', due, diff, label: `Vence ${dm(due)}`, rank: 3 + diff / 1000 };
}
