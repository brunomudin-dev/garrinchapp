import { useState } from 'preact/hooks';
import { Sheet, Field, Icon, EMOJIS, MenuBtn, toast } from '../ui.jsx';
import { sb, firstName } from '../data.js';
import { diffDays } from '../lib/schedule.js';

const wdShort = (s) => new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(new Date(s + 'T12:00:00Z')).replace('.', '');
const monthName = (s) => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(s.slice(0, 7) + '-15T12:00:00Z')).replace(/^./, (c) => c.toUpperCase());
const nick = (p) => { const n = firstName(p.display_name); return n === 'Gabriela' ? 'Gabi' : n; };
const dm = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;

export function dateLabel(e) {
  if (e.end_date && e.end_date !== e.start_date) {
    const same = e.start_date.slice(0, 7) === e.end_date.slice(0, 7);
    return same ? `${e.start_date.slice(8, 10)} a ${dm(e.end_date)}` : `${dm(e.start_date)} a ${dm(e.end_date)}`;
  }
  return `${wdShort(e.start_date)}, ${dm(e.start_date)}`;
}

export function whenPill(e, today) {
  const end = e.end_date || e.start_date;
  const d = diffDays(e.start_date, today);
  if (d > 1) return { text: `em ${d} dias`, cls: d <= 7 ? 'due' : '' };
  if (d === 1) return { text: 'amanhã', cls: 'due' };
  if (d === 0) return { text: 'hoje', cls: 'due' };
  if (diffDays(end, today) >= 0) return { text: 'acontecendo', cls: 'ok' };
  return { text: 'passou', cls: '' };
}

function EventForm({ ev, st, onClose, reload, today }) {
  const [f, setF] = useState(() => ({
    title: ev?.title || '', icon: ev?.icon || '📅', start_date: ev?.start_date || today, end_date: ev?.end_date || '',
    start_time: ev?.start_time ? ev.start_time.slice(0, 5) : '', notes: ev?.notes || '', alert: ev ? ev.alert : true,
    alert_days: ev?.alert_days ?? 1, alert_time: ev?.alert_time ? ev.alert_time.slice(0, 5) : '09:00', alert_hours: ev?.alert_hours ?? '', owner_id: ev?.owner_id || '',
  }));
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  const save = async () => {
    if (!f.title.trim()) return toast('Dê um nome ao evento');
    if (!f.start_date) return toast('Escolha a data');
    if (f.end_date && f.end_date < f.start_date) return toast('O fim não pode ser antes do início');
    const row = {
      title: f.title.trim(), icon: f.icon, start_date: f.start_date, end_date: f.end_date || null, start_time: f.start_time || null,
      notes: f.notes.trim() || null, alert: f.alert, alert_days: Number(f.alert_days) || 0, alert_time: f.alert_time || '09:00',
      alert_hours: f.start_time && f.alert_hours !== '' ? Number(f.alert_hours) : null,
      owner_id: f.owner_id || null,
    };
    const { error } = ev ? await sb.from('events').update(row).eq('id', ev.id) : await sb.from('events').insert(row);
    if (error) return toast('Erro: ' + error.message);
    onClose(); reload();
  };
  const del = async () => { if (!confirm(`Apagar "${ev.title}"?`)) return; await sb.from('events').delete().eq('id', ev.id); onClose(); reload(); };
  return (
    <div>
      <Field label="Nome"><input value={f.title} onInput={(e) => set('title', e.target.value)} placeholder="Ex.: Jantar com amigos" /></Field>
      <Field label="De quem é">
        <div class="days">
          <button class={!f.owner_id ? 'on' : ''} onClick={() => set('owner_id', '')}>Ambos</button>
          {st.profiles.map((p) => <button key={p.id} class={f.owner_id === p.id ? 'on' : ''} onClick={() => set('owner_id', p.id)}>{nick(p)}</button>)}
        </div>
      </Field>
      <Field label="Ícone"><div class="chips">{EMOJIS.slice(18, 30).concat(['🎸', '🎤', '🥩']).map((e) => <button key={e} class={'chip' + (f.icon === e ? ' on' : '')} style={{ padding: '8px 10px', fontSize: 20 }} onClick={() => set('icon', e)}>{e}</button>)}</div></Field>
      <div class="row">
        <Field label="Data"><input type="date" value={f.start_date} onInput={(e) => set('start_date', e.target.value)} /></Field>
        <Field label="Até (opcional)"><input type="date" value={f.end_date} min={f.start_date} onInput={(e) => set('end_date', e.target.value)} /></Field>
      </div>
      <Field label="Horário (opcional)"><input type="time" value={f.start_time} onInput={(e) => set('start_time', e.target.value)} /></Field>
      <Field label="Observações (voos, reservas, endereço...)"><textarea rows="4" value={f.notes} onInput={(e) => set('notes', e.target.value)} /></Field>
      <div class="divider" />
      <button class="row" style={{ width: '100%', margin: '4px 0 12px', textAlign: 'left' }} onClick={() => set('alert', !f.alert)}>
        <span class="grow"><b>{f.alert ? '🔔 Avisar vocês dois' : '🔕 Sem alerta'}</b><div class="muted small">Toque para {f.alert ? 'desligar' : 'ligar'}</div></span>
      </button>
      {f.alert && (
        <>
          <Field label="Avisar com antecedência">
            <div class="days">{[0, 1, 2, 3, 7].map((n) => <button key={n} class={Number(f.alert_days) === n ? 'on' : ''} onClick={() => set('alert_days', n)}>{n === 0 ? 'No dia' : n + 'd'}</button>)}</div>
          </Field>
          <div class="row">
            <Field label="Aviso às"><input type="time" value={f.alert_time} onInput={(e) => set('alert_time', e.target.value)} /></Field>
            {f.start_time && (
              <Field label="E mais um aviso antes do horário">
                <select value={f.alert_hours} onChange={(e) => set('alert_hours', e.target.value)}>
                  <option value="">Não</option><option value="1">1 hora antes</option><option value="2">2 horas antes</option><option value="3">3 horas antes</option><option value="5">5 horas antes</option>
                </select>
              </Field>
            )}
          </div>
        </>
      )}
      <button class="btn block" onClick={save}>Salvar</button>
      {ev && <button class="btn danger block" style={{ marginTop: 10 }} onClick={del}>Apagar evento</button>}
    </div>
  );
}

export function Agenda({ store, today }) {
  const { st, reload } = store;
  const [edit, setEdit] = useState(null);
  const [past, setPast] = useState(false);
  const isOver = (e) => (e.end_date || e.start_date) < today;
  const upcoming = st.events.filter((e) => !isOver(e));
  const done = st.events.filter(isOver).sort((a, b) => (a.start_date < b.start_date ? 1 : -1));

  const byMonth = {};
  for (const e of upcoming) (byMonth[e.start_date.slice(0, 7)] = byMonth[e.start_date.slice(0, 7)] || []).push(e);

  const toggleAlert = async (e) => {
    const { error } = await sb.from('events').update({ alert: !e.alert }).eq('id', e.id);
    if (error) toast('Erro: ' + error.message); else toast(e.alert ? 'Alerta desligado' : 'Alerta ligado');
    reload();
  };

  const row = (e) => {
    const w = whenPill(e, today);
    const who = e.owner_id && st.profiles.find((p) => p.id === e.owner_id);
    return (
      <div key={e.id} class="item" style={{ alignItems: 'flex-start' }}>
        <button class="ic" onClick={() => setEdit(e)}>{e.icon || '📅'}</button>
        <button class="grow" style={{ textAlign: 'left' }} onClick={() => setEdit(e)}>
          <div class="name">{e.title}</div>
          <div class="meta">{dateLabel(e)}{e.start_time ? ` · ${e.start_time.slice(0, 5)}` : ''}</div>
          {e.notes && <div class="meta" style={{ whiteSpace: 'pre-line', marginTop: 4 }}>{e.notes}</div>}
          <div class="row" style={{ marginTop: 6, gap: 6 }}>
            {w.text !== 'passou' && <span class={'pill ' + w.cls}>{w.text}</span>}
            <span class={'pill' + (who ? ' v' : '')}>{who ? nick(who) : 'Ambos'}</span>
          </div>
        </button>
        <button class="iconbtn" style={{ color: e.alert ? 'var(--accent)' : 'var(--muted)' }} onClick={() => toggleAlert(e)} aria-label={e.alert ? 'Desligar alerta' : 'Ligar alerta'}>{e.alert ? Icon.bell : Icon.bellOff}</button>
      </div>
    );
  };

  return (
    <div>
      <div class="top">
        <div class="t"><h1>Agenda</h1><div class="sub">Eventos do casal</div></div>
        <button class="btn soft" onClick={() => setEdit({})}>{Icon.plus} Novo</button>
        <MenuBtn />
      </div>

      {upcoming.length === 0 && <div class="card empty"><img src={import.meta.env.BASE_URL + 'icon-192.png'} alt="" /><div>Nenhum evento à frente.<br />Toque em Novo para cadastrar.</div></div>}
      {Object.entries(byMonth).map(([m, list]) => (
        <div key={m}>
          <div class="section"><h2>{monthName(m)}</h2><span class="muted small">{list.length}</span></div>
          <div class="stack">{list.map(row)}</div>
        </div>
      ))}

      {done.length > 0 && (
        <>
          <div class="section"><h2>Já passaram</h2><button class="link" onClick={() => setPast(!past)}>{past ? 'Esconder' : `Mostrar (${done.length})`}</button></div>
          {past && <div class="stack">{done.map(row)}</div>}
        </>
      )}
      <p class="muted small" style={{ textAlign: 'center', marginTop: 18 }}>O sino liga ou desliga o alerta de cada evento. Os dois recebem o aviso.</p>

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar evento' : 'Novo evento'}>
        {edit && <EventForm ev={edit.id ? edit : null} st={st} today={today} onClose={() => setEdit(null)} reload={reload} />}
      </Sheet>
    </div>
  );
}
