import { useState } from 'preact/hooks';
import { Check, Sheet, Field, EMOJIS, toast, haptic } from '../ui.jsx';
import { sb } from '../data.js';
import { billInfo } from '../lib/bills.js';

function BillForm({ bill, onClose, reload }) {
  const [f, setF] = useState(() => ({ name: bill?.name || '', icon: bill?.icon || '🧾', due_day: bill?.due_day ?? '', alert_days: bill?.alert_days ?? 3 }));
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  const save = async () => {
    if (!f.name.trim()) return toast('Dê um nome à conta');
    const day = f.due_day === '' ? null : Number(f.due_day);
    if (day != null && (day < 1 || day > 31)) return toast('O dia do vencimento vai de 1 a 31');
    const row = { name: f.name.trim(), icon: f.icon, due_day: day, alert_days: Number(f.alert_days) || 0 };
    const { error } = bill ? await sb.from('bills').update(row).eq('id', bill.id) : await sb.from('bills').insert({ ...row, sort: 99 });
    if (error) return toast('Erro: ' + error.message);
    onClose(); reload();
  };
  const del = async () => { if (!confirm(`Apagar a conta "${bill.name}"?`)) return; await sb.from('bills').delete().eq('id', bill.id); onClose(); reload(); };
  return (
    <div>
      <Field label="Nome"><input value={f.name} onInput={(e) => set('name', e.target.value)} placeholder="Ex.: Internet, Seguro do carro" /></Field>
      <Field label="Ícone"><div class="chips">{EMOJIS.slice(10, 30).map((e) => <button key={e} class={'chip' + (f.icon === e ? ' on' : '')} style={{ padding: '8px 10px', fontSize: 20 }} onClick={() => set('icon', e)}>{e}</button>)}</div></Field>
      <Field label="Vence todo mês no dia"><input type="number" inputMode="numeric" min="1" max="31" value={f.due_day} onInput={(e) => set('due_day', e.target.value)} placeholder="Ex.: 10" /></Field>
      <p class="muted small" style={{ marginTop: -4 }}>Sem o dia, a conta fica na lista mas não gera lembrete. Em meses curtos, vale o último dia do mês.</p>
      <Field label="Avisar antes">
        <div class="days">{[0, 1, 2, 3, 5, 7].map((n) => <button key={n} class={Number(f.alert_days) === n ? 'on' : ''} onClick={() => set('alert_days', n)}>{n === 0 ? 'No dia' : n + 'd'}</button>)}</div>
      </Field>
      <button class="btn block" onClick={save}>Salvar</button>
      {bill && <button class="btn danger block" style={{ marginTop: 10 }} onClick={del}>Apagar conta</button>}
    </div>
  );
}

export async function togglePaid(store, bill, today) {
  const { st, setSt, reload } = store;
  haptic();
  const ym = today.slice(0, 7);
  const pay = st.billPays.find((p) => p.bill_id === bill.id && p.ym === ym);
  if (pay) {
    setSt({ ...st, billPays: st.billPays.filter((p) => p.id !== pay.id) });
    await sb.from('bill_payments').delete().eq('id', pay.id);
  } else {
    setSt({ ...st, billPays: [...st.billPays, { id: 'tmp' + Date.now(), bill_id: bill.id, ym }] });
    const { error } = await sb.from('bill_payments').insert({ bill_id: bill.id, ym });
    if (error) toast('Erro: ' + error.message); else toast(`${bill.icon || '🧾'} ${bill.name}: marcada como paga`);
  }
  reload();
}

export function Contas({ store, today }) {
  const { st, reload } = store;
  const [edit, setEdit] = useState(null);
  const list = st.bills.filter((b) => b.active).map((b) => ({ ...b, info: billInfo(b, st.billPays, today) })).sort((a, b) => a.info.rank - b.info.rank);
  return (
    <div id="contas">
      <div class="section"><h2>Contas a pagar</h2><button class="link" onClick={() => setEdit({})}>+ Nova conta</button></div>
      {list.length === 0 && <div class="card empty"><div>Nenhuma conta cadastrada.<br />Cadastre IPTU, condomínio, luz...</div></div>}
      <div class="stack">
        {list.map((b) => {
          const s = b.info.state;
          return (
            <div key={b.id} class={'item' + (s === 'paid' ? ' done' : '')}>
              <button class="ic" onClick={() => setEdit(b)}>{b.icon || '🧾'}</button>
              <button class="grow" style={{ textAlign: 'left' }} onClick={() => setEdit(b)}>
                <div class="name">{b.name}</div>
                <div class="row" style={{ gap: 6, marginTop: 4 }}>
                  {s === 'late' && <span class="pill late">{b.info.label}</span>}
                  {(s === 'today' || s === 'soon') && <span class="pill due">{b.info.label}</span>}
                  {s === 'later' && <span class="pill">{b.info.label}</span>}
                  {s === 'nodate' && <span class="pill">Toque pra definir o vencimento</span>}
                  {s === 'paid' && <span class="pill ok">{b.info.label}</span>}
                </div>
              </button>
              <button onClick={() => togglePaid(store, b, today)} aria-label="Marcar como paga"><Check on={s === 'paid'} /></button>
            </div>
          );
        })}
      </div>
      <p class="muted small" style={{ textAlign: 'center', marginTop: 12 }}>Toque no círculo quando pagar. A marcação zera no mês seguinte.</p>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar conta' : 'Nova conta'}>
        {edit && <BillForm bill={edit.id ? edit : null} onClose={() => setEdit(null)} reload={reload} />}
      </Sheet>
    </div>
  );
}
