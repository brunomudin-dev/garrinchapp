import { useState } from 'preact/hooks';
import { Check, Avatar, Sheet, Field, Icon, EMOJIS, toast, haptic } from '../ui.jsx';
import { sb, firstName } from '../data.js';
import { habitsToday, scheduledOn, nextOccurrence } from '../lib/habits.js';
import { fmtRel } from '../lib/schedule.js';

const WD = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const WDN = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const num = (v) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 });

async function toggleCheck(store, h, today) {
  const { st, setSt, reload } = store;
  haptic();
  if (h.log) {
    setSt({ ...st, habitLogs: st.habitLogs.filter((l) => l.id !== h.log.id) });
    await sb.from('habit_logs').delete().eq('id', h.log.id);
  } else {
    setSt({ ...st, habitLogs: [{ id: 'tmp' + Date.now(), habit_id: h.id, log_date: today, amount: 1 }, ...st.habitLogs] });
    const { error } = await sb.from('habit_logs').insert({ habit_id: h.id, log_date: today, amount: 1 });
    if (error) toast('Erro: ' + error.message);
    else toast(`${h.icon} ${h.name}: feito!`);
  }
  reload();
}

function CountSheet({ h, today, store, onClose }) {
  const [v, setV] = useState(String(h.amount || ''));
  const save = async () => {
    const n = Number(String(v).replace(',', '.')) || 0;
    if (n < 0) return toast('Use um número maior que zero');
    if (n === 0) { if (h.log) await sb.from('habit_logs').delete().eq('id', h.log.id); }
    else {
      const { error } = await sb.from('habit_logs').upsert({ habit_id: h.id, log_date: today, amount: n }, { onConflict: 'habit_id,log_date' });
      if (error) return toast('Erro: ' + error.message);
      if (h.target && n >= Number(h.target)) toast(`${h.icon} Meta de hoje batida!`);
    }
    onClose(); store.reload();
  };
  const add = (n) => setV(String((Number(String(v).replace(',', '.')) || 0) + n));
  return (
    <div>
      <p class="muted small" style={{ marginTop: 0 }}>Meta de hoje: {num(h.target)} {h.unit || ''}. Digite o total do dia ou some o que fez agora.</p>
      <Field label={`Total de hoje (${h.unit || 'unidades'})`}><input type="number" inputMode="decimal" value={v} onInput={(e) => setV(e.target.value)} placeholder="0" /></Field>
      <div class="chips" style={{ marginBottom: 14 }}>
        {[5, 10, 20].map((n) => <button key={n} class="chip" onClick={() => add(n)}>+{n}</button>)}
        <button class="chip" onClick={() => setV(String(h.target))}>Meta ({num(h.target)})</button>
      </div>
      <button class="btn block" onClick={save}>Salvar</button>
    </div>
  );
}

export function HabitForm({ habit, st, onClose, reload }) {
  const [f, setF] = useState(() => ({
    name: habit?.name || '', icon: habit?.icon || '🏋️', kind: habit?.kind || 'check', target: habit?.target ?? 20, unit: habit?.unit || 'páginas',
    weekdays: habit?.weekdays || [], owner_id: habit?.owner_id || st.me.id,
  }));
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  const save = async () => {
    if (!f.name.trim()) return toast('Dê um nome ao hábito');
    const row = {
      name: f.name.trim(), icon: f.icon, kind: f.kind, owner_id: f.owner_id,
      target: f.kind === 'count' ? Number(f.target) || 1 : null, unit: f.kind === 'count' ? f.unit || null : null,
      weekdays: f.weekdays.length && f.weekdays.length < 7 ? f.weekdays : null,
    };
    const { error } = habit ? await sb.from('habits').update(row).eq('id', habit.id) : await sb.from('habits').insert({ ...row, sort: 99 });
    if (error) return toast('Erro: ' + error.message);
    onClose(); reload();
  };
  const del = async () => { if (!confirm(`Apagar "${habit.name}" e o histórico dele?`)) return; await sb.from('habits').delete().eq('id', habit.id); onClose(); reload(); };
  return (
    <div>
      <Field label="Nome"><input value={f.name} onInput={(e) => set('name', e.target.value)} placeholder="Ex.: Treino, Leitura, Corrida" /></Field>
      <Field label="Ícone"><div class="chips">{EMOJIS.slice(0, 14).map((e) => <button key={e} class={'chip' + (f.icon === e ? ' on' : '')} style={{ padding: '8px 10px', fontSize: 20 }} onClick={() => set('icon', e)}>{e}</button>)}</div></Field>
      <div class="seg"><button class={f.kind === 'check' ? 'on' : ''} onClick={() => set('kind', 'check')}>✅ Marcar feito</button><button class={f.kind === 'count' ? 'on' : ''} onClick={() => set('kind', 'count')}>🔢 Meta numérica</button></div>
      {f.kind === 'count' && (
        <div class="row">
          <Field label="Meta por dia"><input type="number" inputMode="decimal" value={f.target} onInput={(e) => set('target', e.target.value)} /></Field>
          <Field label="Unidade"><input value={f.unit} onInput={(e) => set('unit', e.target.value)} placeholder="páginas, km, min" /></Field>
        </div>
      )}
      <Field label="Dias da semana (deixe vazio para todos os dias)">
        <div class="days">{WD.map((d, i) => <button key={i} class={f.weekdays.includes(i) ? 'on' : ''} onClick={() => set('weekdays', f.weekdays.includes(i) ? f.weekdays.filter((x) => x !== i) : [...f.weekdays, i])}>{d}</button>)}</div>
      </Field>
      <Field label="De quem"><select value={f.owner_id} onChange={(e) => set('owner_id', e.target.value)}>{st.profiles.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}</select></Field>
      <button class="btn block" onClick={save}>Salvar</button>
      {habit && <button class="btn danger block" style={{ marginTop: 10 }} onClick={del}>Apagar hábito</button>}
    </div>
  );
}

function Person({ p, store, today, label, onEdit, onCount }) {
  const { st } = store;
  const list = habitsToday(st, today, p.id);
  const others = st.habits.filter((h) => h.active && h.owner_id === p.id && !scheduledOn(h, today));
  if (!list.length && !others.length) return null;
  return (
    <div>
      <div class="who"><Avatar p={p} /> {label}</div>
      <div class="stack">
        {list.length === 0 && <p class="muted small" style={{ margin: 0 }}>Nada agendado para hoje.</p>}
        {list.map((h) => (
          <div key={h.id} class={'item' + (h.done ? ' done' : '')}>
            <button class="ic" onClick={() => onEdit(h)}>{h.icon}</button>
            <button class="grow" style={{ textAlign: 'left' }} onClick={() => (h.kind === 'count' ? onCount(h) : toggleCheck(store, h, today))}>
              <div class="name">{h.name}</div>
              {h.kind === 'count' ? (
                <>
                  <div class="meta">{num(h.amount)} de {num(h.target)} {h.unit || ''}</div>
                  <div class="hbar" style={{ margin: '6px 0 0' }}><div class="track"><i style={{ width: Math.min(100, (h.amount / Number(h.target)) * 100) + '%', background: 'var(--accent)' }} /></div></div>
                </>
              ) : (
                <div class="meta">{h.weekdays?.length ? h.weekdays.map((d) => WDN[d]).join(', ') : 'Todo dia'}</div>
              )}
              {h.streak >= 2 && <div style={{ marginTop: 4 }}><span class="pill due">🔥 {h.streak} {h.kind === 'count' ? 'dias' : 'seguidos'}</span></div>}
            </button>
            {h.kind === 'count'
              ? <button class="btn soft" style={{ padding: '9px 12px' }} onClick={() => onCount(h)}>+ {h.unit || ''}</button>
              : <button onClick={() => toggleCheck(store, h, today)} aria-label="Marcar feito"><Check on={h.done} /></button>}
          </div>
        ))}
      </div>
      {others.length > 0 && (
        <p class="muted small" style={{ margin: '8px 4px 0' }}>
          Outros dias: {others.map((h) => (
            <button key={h.id} class="link" style={{ color: 'var(--muted)', textDecoration: 'underline', marginRight: 8 }} onClick={() => onEdit(h)}>{h.icon} {h.name} ({fmtRel(nextOccurrence(h, today), today)})</button>
          ))}
        </p>
      )}
    </div>
  );
}

export function Habitos({ store, today }) {
  const { st, reload } = store;
  const [edit, setEdit] = useState(null);
  const [count, setCount] = useState(null);
  const me = st.me;
  const other = st.profiles.find((p) => p.id !== me.id);
  const any = st.habits.some((h) => h.active);
  return (
    <div>
      <div class="section"><h2>Hábitos</h2><button class="link" onClick={() => setEdit({})}>+ Novo</button></div>
      {!any && <div class="card empty"><div>Nenhum hábito ainda.<br />Cadastre treino, leitura, corrida...</div></div>}
      <Person p={me} label="Você" store={store} today={today} onEdit={setEdit} onCount={setCount} />
      {other && <Person p={other} label={firstName(other.display_name)} store={store} today={today} onEdit={setEdit} onCount={setCount} />}
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar hábito' : 'Novo hábito'}>
        {edit && <HabitForm habit={edit.id ? edit : null} st={st} onClose={() => setEdit(null)} reload={reload} />}
      </Sheet>
      <Sheet open={!!count} onClose={() => setCount(null)} title={count ? `${count.icon} ${count.name}` : ''}>
        {count && <CountSheet h={count} today={today} store={store} onClose={() => setCount(null)} />}
      </Sheet>
    </div>
  );
}
