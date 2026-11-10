import { useState, useEffect, useMemo, useRef } from 'preact/hooks';
import { Sheet, Icon, Field, toast, Check, haptic } from '../ui.jsx';
import { sb, callFn, brl, PAYMENTS, firstName } from '../data.js';
import { CATEGORY_META, CATEGORY_NAMES, guessCategory, productKey } from '../lib/categories.js';
import { suggestions, productHistory } from '../lib/suggest.js';
import { todayStr, fmtRel } from '../lib/schedule.js';
import { medStockDays } from '../actions.js';

const dayOf = (iso) => todayStr(new Date(iso));
const monthKey = (iso) => dayOf(iso).slice(0, 7);
const monthLabel = (k, opt = { month: 'short' }) => new Intl.DateTimeFormat('pt-BR', { ...opt, timeZone: 'UTC' }).format(new Date(k + '-15T12:00:00Z')).replace('.', '').replace(/^./, (c) => c.toUpperCase());

async function compress(file, max = 1600) {
  const url = URL.createObjectURL(file);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  return c.toDataURL('image/jpeg', 0.82);
}

/* ---------------- Lançar notinha ---------------- */
function ScanSheet({ open, onClose, store, onDone }) {
  const [photos, setPhotos] = useState([]);
  const [payment, setPayment] = useState(localStorage.getItem('ga-pay') || PAYMENTS[0]);
  const [kind, setKind] = useState('foto');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const input = useRef();
  useEffect(() => { if (open) { setPhotos([]); setErr(''); setBusy(false); } }, [open]);

  const add = async (e) => {
    const files = [...(e.target.files || [])];
    const out = [];
    for (const f of files) out.push(await compress(f));
    setPhotos((p) => [...p, ...out].slice(0, 4));
    e.target.value = '';
  };
  const send = async () => {
    setBusy(true); setErr('');
    try {
      localStorage.setItem('ga-pay', payment);
      const r = await callFn('receipt', { images: photos.map((p) => p.split(',')[1]), payment, source: kind });
      haptic();
      toast(r.duplicate ? 'Essa compra já estava lançada' : `🧾 ${r.items} itens lidos · ${brl(r.total)}`);
      await store.reload();
      onClose();
      onDone && onDone(r.purchase_id);
    } catch (e) {
      setErr(e.message);
    } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={busy ? () => {} : onClose} title="Lançar compra">
      <div class="seg">
        <button class={kind === 'foto' ? 'on' : ''} onClick={() => setKind('foto')}>🧾 Notinha</button>
        <button class={kind === 'online' ? 'on' : ''} onClick={() => setKind('online')}>📦 Pedido online</button>
      </div>
      <p class="muted small" style={{ marginTop: 0 }}>
        {kind === 'foto'
          ? 'Tire uma foto da notinha esticada e bem iluminada. Se for comprida, tire 2 ou 3 fotos em partes.'
          : 'Mande um print da tela do pedido (Amazon, Mercado Livre...) ou do e-mail de confirmação, com os itens e preços aparecendo.'}
      </p>
      <input ref={input} type="file" accept="image/*" multiple {...(kind === 'foto' ? { capture: 'environment' } : {})} style={{ display: 'none' }} onChange={add} />
      {photos.length > 0 && <div class="photos">{photos.map((p, i) => <img key={i} src={p} onClick={() => setPhotos(photos.filter((_, j) => j !== i))} />)}</div>}
      <button class={photos.length ? 'btn ghost block' : 'btn block'} onClick={() => input.current.click()} disabled={busy || photos.length >= 4}>
        {Icon.camera} {photos.length ? 'Adicionar outra foto' : kind === 'foto' ? 'Tirar foto da notinha' : 'Escolher print'}
      </button>
      <Field label="Pago com"><div class="chips" style={{ marginTop: 2 }}>{PAYMENTS.map((p) => <button key={p} class={'chip' + (payment === p ? ' on' : '')} onClick={() => setPayment(p)}>{p}</button>)}</div></Field>
      {err && <div class="err">{err}</div>}
      <button class="btn block" disabled={!photos.length || busy} onClick={send}>{busy ? <><span class="spin" /> Lendo a notinha...</> : 'Ler e salvar'}</button>
      <p class="muted small" style={{ textAlign: 'center' }}>Toque numa foto pra remover. A leitura leva uns 10–20 segundos.</p>
    </Sheet>
  );
}

/* ---------------- Lançamento manual ---------------- */
function ManualSheet({ open, onClose, store }) {
  const [f, setF] = useState({});
  useEffect(() => { if (open) setF({ store: '', date: todayStr(), total: '', payment: PAYMENTS[0], source: 'manual', items: '' }); }, [open]);
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  const save = async () => {
    const total = Number(String(f.total).replace(',', '.'));
    if (!total) return toast('Informe o valor total');
    const { data: p, error } = await sb.from('purchases').insert({ store_name: f.store || null, purchased_at: f.date + 'T12:00:00-03:00', total, payment: f.payment, source: f.source }).select().single();
    if (error) return toast('Erro: ' + error.message);
    const lines = f.items.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length) {
      const parsed = lines.map((l) => { const m = l.match(/^(.*?)[\s;-]+(?:R\$\s*)?(\d+(?:[.,]\d{1,2})?)$/); return m ? { name: m[1].trim(), total: Number(m[2].replace(',', '.')) } : { name: l, total: null }; });
      const keys = parsed.map((x) => productKey(x.name));
      const { data: ex } = await sb.from('products').select('id,key').in('key', keys);
      const map = new Map((ex || []).map((x) => [x.key, x.id]));
      const create = [...new Set(keys)].filter((k) => !map.has(k)).map((k) => { const n = parsed[keys.indexOf(k)].name; return { key: k, name: n, category: guessCategory(n) }; });
      if (create.length) { const { data: c } = await sb.from('products').insert(create).select('id,key'); (c || []).forEach((x) => map.set(x.key, x.id)); }
      await sb.from('purchase_items').insert(parsed.map((x, i) => ({ purchase_id: p.id, product_id: map.get(keys[i]), raw_name: x.name, qty: 1, unit_price: x.total, total: x.total })));
    }
    toast('Compra lançada'); onClose(); store.reload();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Lançar à mão">
      <Field label="Onde"><input value={f.store} onInput={(e) => set('store', e.target.value)} placeholder="Verdemar, Amazon, farmácia..." /></Field>
      <div class="row">
        <Field label="Data"><input type="date" value={f.date} onInput={(e) => set('date', e.target.value)} /></Field>
        <Field label="Total (R$)"><input inputMode="decimal" value={f.total} onInput={(e) => set('total', e.target.value)} placeholder="0,00" /></Field>
      </div>
      <Field label="Tipo">
        <div class="seg" style={{ margin: 0 }}><button class={f.source === 'manual' ? 'on' : ''} onClick={() => set('source', 'manual')}>Loja física</button><button class={f.source === 'online' ? 'on' : ''} onClick={() => set('source', 'online')}>Online</button></div>
      </Field>
      <Field label="Pago com"><div class="chips">{PAYMENTS.map((p) => <button key={p} class={'chip' + (f.payment === p ? ' on' : '')} onClick={() => set('payment', p)}>{p}</button>)}</div></Field>
      <Field label="Itens (opcional, um por linha: nome e valor)"><textarea rows="4" value={f.items} onInput={(e) => set('items', e.target.value)} placeholder={'Sabão em pó Omo 4kg 52,90\nAreia do Garrincha 34,50'} /></Field>
      <button class="btn block" onClick={save}>Salvar</button>
    </Sheet>
  );
}

/* ---------------- Detalhe de compra ---------------- */
function PurchaseSheet({ id, onClose, store, openProduct }) {
  const { st, reload } = store;
  const p = st.purchases.find((x) => x.id === id);
  const items = st.items.filter((i) => i.purchase_id === id);
  const prod = new Map(st.products.map((x) => [x.id, x]));
  if (!id || !p) return null;
  const setPay = async (pay) => { await sb.from('purchases').update({ payment: pay }).eq('id', id); reload(); };
  const del = async () => { if (!confirm('Apagar essa compra e os itens dela?')) return; await sb.from('purchases').delete().eq('id', id); onClose(); reload(); };
  return (
    <Sheet open onClose={onClose} title={p.store_name || 'Compra'}>
      <div class="row" style={{ marginBottom: 10 }}>
        <div class="grow"><div class="big">{brl(p.total)}</div><div class="muted small">{new Date(p.purchased_at).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })} · {items.length} itens</div></div>
      </div>
      <div class="chips" style={{ marginBottom: 14 }}>{PAYMENTS.map((x) => <button key={x} class={'chip' + (p.payment === x ? ' on' : '')} onClick={() => setPay(x)}>{x}</button>)}</div>
      <div class="card">
        <table class="t"><tbody>
          {items.map((i) => {
            const pr = prod.get(i.product_id);
            const meta = CATEGORY_META[pr?.category || 'Outros'];
            return (
              <tr key={i.id} onClick={() => pr && openProduct(pr.id)}>
                <td style={{ width: 26 }}>{meta?.emoji}</td>
                <td><div style={{ fontWeight: 600 }}>{pr?.name || i.raw_name}</div><div class="muted small">{Number(i.qty).toLocaleString('pt-BR')} {i.unit || ''} × {brl(i.unit_price)}</div></td>
                <td class="r">{brl(i.total)}</td>
              </tr>
            );
          })}
        </tbody></table>
      </div>
      <button class="btn danger block" style={{ marginTop: 14 }} onClick={del}>Apagar compra</button>
    </Sheet>
  );
}

/* ---------------- Produto: histórico de preço ---------------- */
function ProductSheet({ id, onClose, store }) {
  const { st, reload } = store;
  const p = st.products.find((x) => x.id === id);
  const hist = useMemo(() => (id ? productHistory(st).get(id) || [] : []), [id, st]);
  if (!id || !p) return null;
  const prices = hist.map((h) => h.unit_price).filter((x) => x > 0);
  const min = Math.min(...prices), max = Math.max(...prices), avg = prices.reduce((a, b) => a + b, 0) / (prices.length || 1);
  const best = hist.find((h) => h.unit_price === min);
  const upd = async (row) => { await sb.from('products').update(row).eq('id', id); reload(); };
  const addList = async () => { await sb.from('shopping_list').insert({ name: p.name, product_id: p.id }); toast('Adicionado à lista'); reload(); };
  return (
    <Sheet open onClose={onClose} title={p.name}>
      {prices.length > 0 && (
        <div class="row" style={{ gap: 8, marginBottom: 14 }}>
          <div class="card grow" style={{ padding: 12 }}><div class="muted small">Último</div><b>{brl(hist[0].unit_price)}</b></div>
          <div class="card grow" style={{ padding: 12 }}><div class="muted small">Menor</div><b style={{ color: 'var(--green)' }}>{brl(min)}</b></div>
          <div class="card grow" style={{ padding: 12 }}><div class="muted small">Média</div><b>{brl(avg)}</b></div>
        </div>
      )}
      {best && prices.length > 1 && max > min && <p class="small" style={{ marginTop: 0 }}>💡 Mais barato em <b>{best.store || 'loja sem nome'}</b> ({fmtRel(best.date, todayStr())}).</p>}
      <div class="card" style={{ marginBottom: 14 }}>
        <table class="t"><tbody>
          {hist.map((h, i) => <tr key={i}><td>{h.date.slice(8)}/{h.date.slice(5, 7)}/{h.date.slice(2, 4)}</td><td class="muted">{h.store || '—'}</td><td class="r">{Number(h.qty).toLocaleString('pt-BR')} {h.unit || ''}</td><td class="r"><b>{brl(h.unit_price)}</b></td></tr>)}
        </tbody></table>
      </div>
      <Field label="Nome"><input value={p.name} onChange={(e) => upd({ name: e.target.value })} /></Field>
      <Field label="Categoria"><select value={p.category} onChange={(e) => upd({ category: e.target.value })}>{CATEGORY_NAMES.map((c) => <option key={c} value={c}>{CATEGORY_META[c].emoji} {c}</option>)}</select></Field>
      <label class="row" style={{ margin: '6px 4px 16px' }}><input type="checkbox" style={{ width: 22, height: 22 }} checked={p.ignore_suggest} onChange={(e) => upd({ ignore_suggest: e.target.checked })} /><span>Não sugerir na lista de compras</span></label>
      <button class="btn block" onClick={addList}>{Icon.plus} Adicionar à lista</button>
    </Sheet>
  );
}

/* ---------------- Lista de compras ---------------- */
function Lista({ store, today, openProduct }) {
  const { st, reload, setSt } = store;
  const [txt, setTxt] = useState('');
  const sugg = suggestions(st, today);
  const lowMeds = st.meds.filter((m) => m.active && medStockDays(m) != null && medStockDays(m) <= (m.low_days || 5) && !st.list.some((l) => !l.checked && l.name.toLowerCase() === m.name.toLowerCase()));
  const open = st.list.filter((l) => !l.checked);
  const done = st.list.filter((l) => l.checked);
  const prodMap = new Map(st.products.map((p) => [p.id, p]));
  const matches = txt.length >= 2 ? st.products.filter((p) => p.name.toLowerCase().includes(txt.toLowerCase())).slice(0, 5) : [];

  const add = async (name, product_id = null, source = 'manual') => {
    if (!name.trim()) return;
    setTxt('');
    const { error } = await sb.from('shopping_list').insert({ name: name.trim(), product_id, source });
    if (error) toast('Erro: ' + error.message);
    reload();
  };
  const toggle = async (l) => {
    haptic();
    setSt({ ...st, list: st.list.map((x) => (x.id === l.id ? { ...x, checked: !x.checked } : x)) });
    await sb.from('shopping_list').update({ checked: !l.checked }).eq('id', l.id);
    reload();
  };
  const clear = async () => { await sb.from('shopping_list').delete().in('id', done.map((d) => d.id)); reload(); };
  const addAll = async () => { await sb.from('shopping_list').insert(sugg.map((s) => ({ name: s.product.name, product_id: s.product.id, source: 'sugestao' }))); toast(`${sugg.length} itens adicionados`); reload(); };

  // agrupa por categoria pra facilitar no corredor
  const groups = {};
  for (const l of open) {
    const cat = (l.product_id && prodMap.get(l.product_id)?.category) || guessCategory(l.name);
    (groups[cat] = groups[cat] || []).push(l);
  }

  return (
    <div>
      <form class="list-add" onSubmit={(e) => { e.preventDefault(); add(txt); }}>
        <input value={txt} onInput={(e) => setTxt(e.target.value)} placeholder="Adicionar item..." enterkeyhint="done" />
        <button class="btn" type="submit">{Icon.plus}</button>
      </form>
      {matches.length > 0 && <div class="chips" style={{ marginTop: -4, marginBottom: 12 }}>{matches.map((p) => <button key={p.id} class="chip" onClick={() => add(p.name, p.id)}>{CATEGORY_META[p.category]?.emoji} {p.name}</button>)}</div>}

      {open.length === 0 && <div class="card empty"><img src={import.meta.env.BASE_URL + 'icon-192.png'} alt="" /><div>Lista vazia. Adicione itens ou use as sugestões abaixo.</div></div>}
      {Object.entries(groups).map(([cat, ls]) => (
        <div key={cat} style={{ marginBottom: 12 }}>
          <div class="muted small" style={{ fontWeight: 700, margin: '0 0 6px 4px' }}>{CATEGORY_META[cat]?.emoji} {cat}</div>
          <div class="stack">
            {ls.map((l) => (
              <button key={l.id} class="item" style={{ width: '100%', textAlign: 'left', padding: '10px 14px' }} onClick={() => toggle(l)}>
                <Check on={false} />
                <span class="grow name">{l.name}</span>
                {l.source !== 'manual' && <span class="pill">{l.source === 'estoque' ? 'estoque' : 'sugestão'}</span>}
              </button>
            ))}
          </div>
        </div>
      ))}

      {(sugg.length > 0 || lowMeds.length > 0) && (
        <>
          <div class="section"><h2>Sugestões do Garrincha</h2>{sugg.length > 1 && <button class="link" onClick={addAll}>Adicionar todas</button>}</div>
          <div class="suggest stack">
            {lowMeds.map((m) => (
              <div key={m.id} class="row"><span class="grow"><b>{m.name}</b><div class="muted small">Estoque acaba em ~{medStockDays(m)} dias</div></span><button class="iconbtn" onClick={() => add(m.name, null, 'estoque')}>{Icon.plus}</button></div>
            ))}
            {sugg.slice(0, 12).map((s) => (
              <div key={s.product.id} class="row">
                <button class="grow" style={{ textAlign: 'left' }} onClick={() => openProduct(s.product.id)}><b>{CATEGORY_META[s.product.category]?.emoji} {s.product.name}</b><div class="muted small">Costuma durar ~{s.avg} dias · comprado há {s.since}</div></button>
                <button class="iconbtn" onClick={() => add(s.product.name, s.product.id, 'sugestao')}>{Icon.plus}</button>
              </div>
            ))}
          </div>
        </>
      )}

      {done.length > 0 && (
        <>
          <div class="section"><h2>No carrinho</h2><button class="link" onClick={clear}>Limpar</button></div>
          <div class="stack">{done.map((l) => <button key={l.id} class="item done" style={{ width: '100%', textAlign: 'left', padding: '10px 14px' }} onClick={() => toggle(l)}><Check on /><span class="grow name">{l.name}</span></button>)}</div>
        </>
      )}
    </div>
  );
}

/* ---------------- Compras ---------------- */
function Compras({ store, openPurchase, setScan, setManual }) {
  const { st } = store;
  const byMonth = {};
  for (const p of st.purchases) (byMonth[monthKey(p.purchased_at)] = byMonth[monthKey(p.purchased_at)] || []).push(p);
  const count = new Map();
  for (const i of st.items) count.set(i.purchase_id, (count.get(i.purchase_id) || 0) + 1);
  return (
    <div>
      <div class="row" style={{ marginBottom: 14 }}>
        <button class="btn grow" onClick={() => setScan(true)}>{Icon.camera} Lançar notinha</button>
        <button class="btn ghost" onClick={() => setManual(true)}>À mão</button>
      </div>
      {st.purchases.length === 0 && <div class="card empty"><img src={import.meta.env.BASE_URL + 'icon-192.png'} alt="" /><div>Nenhuma compra ainda.<br />Tire foto da próxima notinha do mercado!</div></div>}
      {Object.entries(byMonth).map(([m, ps]) => (
        <div key={m}>
          <div class="section"><h2>{monthLabel(m, { month: 'long', year: 'numeric' })}</h2><span class="muted small">{brl(ps.reduce((a, p) => a + Number(p.total || 0), 0))}</span></div>
          <div class="stack">
            {ps.map((p) => (
              <button key={p.id} class="item" style={{ width: '100%', textAlign: 'left' }} onClick={() => openPurchase(p.id)}>
                <span class="ic">{p.source === 'online' ? '📦' : '🧾'}</span>
                <span class="grow"><div class="name ellipsis">{p.store_name || 'Compra'}</div><div class="meta">{dayOf(p.purchased_at).slice(8)}/{dayOf(p.purchased_at).slice(5, 7)} · {count.get(p.id) || 0} itens{p.payment ? ' · ' + p.payment : ''}</div></span>
                <b>{brl(p.total)}</b>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Gastos ---------------- */
function Gastos({ store, openProduct }) {
  const { st } = store;
  const months = [];
  const now = todayStr().slice(0, 7);
  for (let i = 5; i >= 0; i--) { const d = new Date(now + '-15T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() - i); months.push(d.toISOString().slice(0, 7)); }
  const [sel, setSel] = useState(now);
  const [q, setQ] = useState('');
  const tot = (m) => st.purchases.filter((p) => monthKey(p.purchased_at) === m).reduce((a, p) => a + Number(p.total || 0), 0);
  const totals = months.map(tot);
  const maxT = Math.max(...totals, 1);
  const ps = st.purchases.filter((p) => monthKey(p.purchased_at) === sel);
  const psIds = new Set(ps.map((p) => p.id));
  const prod = new Map(st.products.map((p) => [p.id, p]));
  const cat = {}, top = {};
  for (const i of st.items) {
    if (!psIds.has(i.purchase_id)) continue;
    const p = prod.get(i.product_id);
    const c = p?.category || 'Outros';
    cat[c] = (cat[c] || 0) + Number(i.total || 0);
    const k = p?.id || i.raw_name;
    top[k] = top[k] || { name: p?.name || i.raw_name, id: p?.id, v: 0 };
    top[k].v += Number(i.total || 0);
  }
  const itemSum = Object.values(cat).reduce((a, b) => a + b, 0);
  const selTotal = tot(sel);
  if (selTotal - itemSum > 1) cat['Sem detalhe'] = selTotal - itemSum;
  const cats = Object.entries(cat).sort((a, b) => b[1] - a[1]);
  const pay = {}, stores = {};
  for (const p of ps) { pay[p.payment || 'Não informado'] = (pay[p.payment || 'Não informado'] || 0) + Number(p.total || 0); stores[p.store_name || 'Sem nome'] = (stores[p.store_name || 'Sem nome'] || 0) + Number(p.total || 0); }
  const prevIdx = months.indexOf(sel) - 1;
  const diff = prevIdx >= 0 && totals[prevIdx] > 0 ? (selTotal - totals[prevIdx]) / totals[prevIdx] : null;
  const found = q.length >= 2 ? st.products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : [];

  const HBars = ({ data, color }) => {
    const mx = Math.max(...data.map((d) => d[1]), 1);
    return data.map(([k, v]) => (
      <div class="hbar" key={k}>
        <div class="l"><span>{CATEGORY_META[k]?.emoji || ''} {k}</span><b>{brl(v)}</b></div>
        <div class="track"><i style={{ width: (v / mx) * 100 + '%', background: CATEGORY_META[k]?.color || color || 'var(--accent)' }} /></div>
      </div>
    ));
  };

  return (
    <div>
      <div class="card">
        <div class="muted small">{monthLabel(sel, { month: 'long', year: 'numeric' })}</div>
        <div class="row"><div class="big grow">{brl(selTotal)}</div>{diff != null && <span class={'pill ' + (diff > 0 ? 'late' : 'ok')}>{diff > 0 ? '▲' : '▼'} {Math.abs(diff * 100).toFixed(0)}% vs mês anterior</span>}</div>
        <div class="bars">
          {months.map((m, i) => <button key={m} class={'b' + (m === sel ? ' on' : '')} onClick={() => setSel(m)}><i style={{ height: (totals[i] / maxT) * 100 + '%' }} /><span>{monthLabel(m)}</span></button>)}
        </div>
      </div>

      <div class="section"><h2>Por categoria</h2></div>
      <div class="card">{cats.length ? <HBars data={cats} /> : <p class="muted small">Sem compras nesse mês.</p>}</div>

      <div class="section"><h2>Por cartão</h2></div>
      <div class="card">{Object.keys(pay).length ? <HBars data={Object.entries(pay).sort((a, b) => b[1] - a[1])} color="var(--violet)" /> : <p class="muted small">—</p>}</div>

      <div class="section"><h2>Por loja</h2></div>
      <div class="card">{Object.keys(stores).length ? <HBars data={Object.entries(stores).sort((a, b) => b[1] - a[1]).slice(0, 6)} color="var(--green)" /> : <p class="muted small">—</p>}</div>

      <div class="section"><h2>Onde mais gastaram</h2></div>
      <div class="card">
        <table class="t"><tbody>
          {Object.values(top).sort((a, b) => b.v - a.v).slice(0, 10).map((t, i) => <tr key={i} onClick={() => t.id && openProduct(t.id)}><td class="muted" style={{ width: 22 }}>{i + 1}</td><td>{t.name}</td><td class="r"><b>{brl(t.v)}</b></td></tr>)}
        </tbody></table>
        {!Object.keys(top).length && <p class="muted small">Os itens aparecem aqui quando você lança notinhas.</p>}
      </div>

      <div class="section"><h2>Comparar preços</h2></div>
      <input value={q} onInput={(e) => setQ(e.target.value)} placeholder="Buscar produto (ex.: café, detergente)" />
      <div class="stack" style={{ marginTop: 10 }}>
        {found.map((p) => <button key={p.id} class="item" style={{ width: '100%', textAlign: 'left', padding: '10px 14px' }} onClick={() => openProduct(p.id)}><span>{CATEGORY_META[p.category]?.emoji}</span><span class="grow name">{p.name}</span>{Icon.chev}</button>)}
      </div>
    </div>
  );
}

export function Mercado({ store, today, intent, clearIntent }) {
  const [tab, setTab] = useState('lista');
  const [scan, setScan] = useState(false);
  const [manual, setManual] = useState(false);
  const [purchase, setPurchase] = useState(null);
  const [product, setProduct] = useState(null);
  useEffect(() => { if (intent === 'scan') { setTab('compras'); setScan(true); clearIntent(); } }, [intent]);

  return (
    <div>
      <div class="top"><div class="t"><h1>Mercado</h1><div class="sub">Lista, compras e gastos</div></div><button class="btn soft" onClick={() => setScan(true)}>{Icon.camera}</button></div>
      <div class="seg">
        <button class={tab === 'lista' ? 'on' : ''} onClick={() => setTab('lista')}>Lista</button>
        <button class={tab === 'compras' ? 'on' : ''} onClick={() => setTab('compras')}>Compras</button>
        <button class={tab === 'gastos' ? 'on' : ''} onClick={() => setTab('gastos')}>Gastos</button>
      </div>
      {tab === 'lista' && <Lista store={store} today={today} openProduct={setProduct} />}
      {tab === 'compras' && <Compras store={store} openPurchase={setPurchase} setScan={setScan} setManual={setManual} />}
      {tab === 'gastos' && <Gastos store={store} openProduct={setProduct} />}

      <ScanSheet open={scan} onClose={() => setScan(false)} store={store} onDone={(id) => { setTab('compras'); setPurchase(id); }} />
      <ManualSheet open={manual} onClose={() => setManual(false)} store={store} />
      {purchase && !product && <PurchaseSheet id={purchase} onClose={() => setPurchase(null)} store={store} openProduct={setProduct} />}
      {product && <ProductSheet id={product} onClose={() => setProduct(null)} store={store} />}
    </div>
  );
}
