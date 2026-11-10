import { todayStr, diffDays } from './schedule.js';

const day = (iso) => todayStr(new Date(iso));

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

export function suggestions(st, today) {
  const hist = productHistory(st);
  const inList = new Set(st.list.filter((l) => !l.checked).map((l) => l.product_id).filter(Boolean));
  const inListNames = new Set(st.list.filter((l) => !l.checked).map((l) => l.name.toLowerCase()));
  const out = [];
  for (const p of st.products) {
    if (p.ignore_suggest || inList.has(p.id) || inListNames.has(p.name.toLowerCase())) continue;
    const h = hist.get(p.id);
    if (!h) continue;
    const dates = [...new Set(h.map((x) => x.date))].sort();
    if (dates.length < 2) continue;
    const span = diffDays(dates[dates.length - 1], dates[0]);
    const avg = span / (dates.length - 1);
    if (avg < 3) continue;
    const since = diffDays(today, dates[dates.length - 1]);
    if (since >= avg * 0.85) out.push({ product: p, avg: Math.round(avg), since, ratio: since / avg });
  }
  return out.sort((a, b) => b.ratio - a.ratio);
}
