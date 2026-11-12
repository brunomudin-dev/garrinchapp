import { todayStr, diffDays } from './schedule.js';

const day = (iso) => todayStr(new Date(iso));
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// Aprende quanto dura cada produto e sugere a reposição
export function productHistory(st) {
  const pDate = new Map(st.purchases.map((p) => [p.id, p]));
  const byProd = new Map();
  for (const it of st.items) {
    if (!it.product_id) continue;
    const p = pDate.get(it.purchase_id);
    if (!p) continue;
    if (!byProd.has(it.product_id)) byProd.set(it.product_id, []);
    byProd.get(it.product_id).push({ date: day(p.purchased_at), store: p.store_name, unit_price: Number(it.unit_price), qty: Number(it.qty), total: Number(it.total), unit: it.unit, purchase_id: p.id });
  }
  for (const arr of byProd.values()) arr.sort((a, b) => (a.date < b.date ? 1 : -1));
  return byProd;
}

export const fmtQty = (q, unit) => {
  const u = (unit || 'UN').toLowerCase();
  const n = Number.isInteger(q) ? String(q) : q.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  return `${n} ${['un', 'und', 'pc'].includes(u) ? 'un' : u}`;
};

/**
 * Sugestões de reposição.
 * tier 'now'  : já passou de ~85% do intervalo típico de compra (provavelmente acabando)
 * tier 'soon' : passou de ~60% (talvez precise)
 * Precisa de pelo menos 2 datas de compra do produto e intervalo típico de 3 dias ou mais.
 * A quantidade é o que costumam levar por compra (mediana das últimas 5).
 */
export function suggestions(st, today) {
  const hist = productHistory(st);
  const inList = new Set(st.list.filter((l) => !l.checked).map((l) => l.product_id).filter(Boolean));
  const inListNames = new Set(st.list.filter((l) => !l.checked).map((l) => l.name.toLowerCase()));
  const out = [];
  for (const p of st.products) {
    if (p.ignore_suggest || inList.has(p.id) || inListNames.has(p.name.toLowerCase())) continue;
    const h = hist.get(p.id);
    if (!h) continue;
    const byDate = new Map();
    for (const x of h) byDate.set(x.date, (byDate.get(x.date) || 0) + (x.qty || 1));
    const dates = [...byDate.keys()].sort();
    if (dates.length < 2) continue;
    const gaps = [];
    for (let i = 1; i < dates.length; i++) gaps.push(diffDays(dates[i], dates[i - 1]));
    const interval = gaps.length >= 3 ? median(gaps.slice(-6)) : gaps.reduce((a, b) => a + b, 0) / gaps.length;
    if (interval < 3) continue;
    const since = diffDays(today, dates[dates.length - 1]);
    const ratio = since / interval;
    const tier = ratio >= 0.85 ? 'now' : ratio >= 0.6 ? 'soon' : null;
    if (!tier) continue;
    const qty = Math.max(1, Math.round(median(dates.slice(-5).map((d) => byDate.get(d))) * 100) / 100);
    const unit = h[0].unit;
    out.push({ product: p, avg: Math.round(interval), since, ratio, tier, qty, unit, label: fmtQty(qty, unit), purchases: dates.length });
  }
  return out.sort((a, b) => b.ratio - a.ratio);
}
