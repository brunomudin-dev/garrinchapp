import { useState, useEffect } from 'preact/hooks';
import { Check, Sheet, Field, Icon, toast, haptic } from '../ui.jsx';
import { sb, firstName } from '../data.js';
import { pendingState, togglePending } from '../actions.js';
import { compressBlob } from '../lib/image.js';
import { addDays } from '../lib/schedule.js';

const BUCKET = 'pendencias';
export const nick = (p) => { const n = firstName(p?.display_name || ''); return n === 'Gabriela' ? 'Gabi' : n; };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

export function sortPendings(list, today) {
  return list.slice().sort((a, b) => {
    const A = pendingState(a, today), B = pendingState(b, today);
    if (A.rank !== B.rank) return A.rank - B.rank;
    if (a.due_date && b.due_date && a.due_date !== b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    return (b.created_at || '').localeCompare(a.created_at || '');
  });
}

/** Pendências que pedem atenção: atrasadas, vencendo em até 2 dias e urgentes. */
export function attentionPendings(st, today) {
  return sortPendings(st.pendings.filter((p) => {
    if (p.done_at) return false;
    const s = pendingState(p, today);
    return s.late || s.soon || p.urgent;
  }), today);
}

export function PendingRow({ p, store, today, onOpen }) {
  const { st } = store;
  const s = pendingState(p, today);
  const owner = p.owner_id && st.profiles.find((x) => x.id === p.owner_id);
  const steps = st.pendSteps.filter((x) => x.pending_id === p.id);
  const doneSteps = steps.filter((x) => x.done).length;
  const meta = [owner ? nick(owner) : 'Ambos', steps.length ? `${doneSteps} de ${steps.length} passos` : null, p.photos?.length ? `📎 ${p.photos.length}` : null].filter(Boolean).join(' · ');
  return (
    <div class={'item' + (p.done_at ? ' done' : '') + (s.late ? ' late-edge' : '')}>
      <button onClick={() => togglePending(store, p)} aria-label="Marcar como feita"><Check on={!!p.done_at} /></button>
      <button class="grow" style={{ textAlign: 'left', minWidth: 0 }} onClick={() => onOpen(p)}>
        <div class="name">{p.title}</div>
        <div class="meta ellipsis">{meta}</div>
      </button>
      <span class="row" style={{ gap: 6, flex: 'none' }}>
        {p.urgent && !p.done_at && <span class="pill urgent">urgente</span>}
        {s.text && !p.done_at && <span class={'pill ' + s.cls}>{s.text}</span>}
      </span>
    </div>
  );
}

function Photos({ paths, onRemove }) {
  const [urls, setUrls] = useState({});
  useEffect(() => {
    const need = (paths || []).filter((x) => !urls[x]);
    if (!need.length) return;
    sb.storage.from(BUCKET).createSignedUrls(need, 3600).then(({ data }) => {
      if (!data) return;
      setUrls((u) => { const n = { ...u }; for (const x of data) if (x.signedUrl) n[x.path] = x.signedUrl; return n; });
    });
  }, [paths?.join('|')]);
  if (!paths?.length) return null;
  return (
    <div class="thumbs">
      {paths.map((x) => (
        <div class="thumb" key={x}>
          {urls[x] ? <a href={urls[x]} target="_blank" rel="noopener"><img src={urls[x]} alt="Anexo" /></a> : <span class="muted small">…</span>}
          {onRemove && <button class="x" aria-label="Remover anexo" onClick={() => onRemove(x)}>×</button>}
        </div>
      ))}
    </div>
  );
}

export function PendingForm({ item, store, today, onClose }) {
  const { st, reload } = store;
  const [f, setF] = useState(() => ({
    title: item?.title || '', owner_id: item?.owner_id || '', due_date: item?.due_date || '', urgent: !!item?.urgent, notes: item?.notes || '',
    photos: item?.photos || [], dueMode: item?.due_date ? 'date' : 'none',
  }));
  const [steps, setSteps] = useState(() => (item ? st.pendSteps.filter((x) => x.pending_id === item.id).map((x) => ({ ...x })) : []));
  const [newStep, setNewStep] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  const quick = (k) => {
    if (k === 'none') setF((o) => ({ ...o, dueMode: 'none', due_date: '' }));
    else if (k === 'date') setF((o) => ({ ...o, dueMode: 'date', due_date: o.due_date || today }));
    else {
      const wd = new Date(today + 'T12:00:00').getDay();
      const d = k === 'today' ? today : k === 'tomorrow' ? addDays(today, 1) : addDays(today, (7 - wd) % 7 || 7);
      setF((o) => ({ ...o, dueMode: k, due_date: d }));
    }
  };
  const addStep = () => { if (!newStep.trim()) return; setSteps((s) => [...s, { id: 'new' + Date.now(), title: newStep.trim(), done: false }]); setNewStep(''); };
  const addPhoto = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    try {
      const added = [];
      for (const file of files.slice(0, 4)) {
        const blob = await compressBlob(file);
        const path = `${st.me.household_id}/${uid()}.jpg`;
        const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
        if (error) throw error;
        added.push(path);
      }
      setF((o) => ({ ...o, photos: [...o.photos, ...added] }));
    } catch (err) { toast('Erro ao anexar: ' + (err.message || err)); }
    setBusy(false);
  };
  const removePhoto = async (path) => {
    setF((o) => ({ ...o, photos: o.photos.filter((x) => x !== path) }));
    await sb.storage.from(BUCKET).remove([path]);
  };
  const save = async () => {
    if (!f.title.trim()) return toast('Escreva o que precisa fazer');
    setBusy(true);
    const row = { title: f.title.trim(), owner_id: f.owner_id || null, due_date: f.dueMode === 'none' ? null : f.due_date || null, urgent: f.urgent, notes: f.notes.trim() || null, photos: f.photos };
    let id = item?.id;
    if (id) {
      const { error } = await sb.from('pendings').update(row).eq('id', id);
      if (error) { setBusy(false); return toast('Erro: ' + error.message); }
    } else {
      const { data, error } = await sb.from('pendings').insert(row).select().single();
      if (error) { setBusy(false); return toast('Erro: ' + error.message); }
      id = data.id;
    }
    const old = item ? st.pendSteps.filter((x) => x.pending_id === item.id) : [];
    const keep = new Set(steps.filter((x) => !String(x.id).startsWith('new')).map((x) => x.id));
    const del = old.filter((x) => !keep.has(x.id)).map((x) => x.id);
    if (del.length) await sb.from('pending_steps').delete().in('id', del);
    for (const [i, x] of steps.entries()) {
      if (String(x.id).startsWith('new')) await sb.from('pending_steps').insert({ pending_id: id, title: x.title, done: x.done, sort: i });
      else await sb.from('pending_steps').update({ title: x.title, done: x.done, sort: i }).eq('id', x.id);
    }
    toast(item ? 'Salvo' : '📌 Pendência criada');
    setBusy(false);
    onClose(); reload();
  };
  const del = async () => {
    if (!confirm(`Excluir "${item.title}"?`)) return;
    if (item.photos?.length) await sb.storage.from(BUCKET).remove(item.photos);
    await sb.from('pendings').delete().eq('id', item.id);
    onClose(); reload();
  };
  return (
    <div>
      <Field label="O que precisa fazer?"><input value={f.title} onInput={(e) => set('title', e.target.value)} placeholder="Ex.: Renovar CNH" /></Field>
      <Field label="De quem é">
        <div class="days">
          <button class={!f.owner_id ? 'on' : ''} onClick={() => set('owner_id', '')}>Ambos</button>
          {st.profiles.map((p) => <button key={p.id} class={f.owner_id === p.id ? 'on' : ''} onClick={() => set('owner_id', p.id)}>{nick(p)}</button>)}
        </div>
      </Field>
      <Field label="Prazo (opcional)">
        <div class="days">
          {[['none', 'Sem prazo'], ['today', 'Hoje'], ['tomorrow', 'Amanhã'], ['week', 'Esta semana'], ['date', 'Escolher data']].map(([k, l]) => (
            <button key={k} class={f.dueMode === k ? 'on' : ''} onClick={() => quick(k)}>{l}</button>
          ))}
        </div>
        {f.dueMode !== 'none' && <input class="after" type="date" value={f.due_date} onInput={(e) => setF((o) => ({ ...o, due_date: e.target.value, dueMode: 'date' }))} />}
        {f.dueMode !== 'none' && <p class="muted small" style={{ margin: '8px 0 0' }}>Com prazo, chega aviso às 9h do dia e entra nos resumos.</p>}
      </Field>
      <button class="toggle-row" onClick={() => set('urgent', !f.urgent)}>
        <span><b>Urgente</b><br /><span class="muted small">Aparece no topo e na tela Hoje</span></span>
        <span class={'switch' + (f.urgent ? ' on' : '')} aria-hidden="true"><span /></span>
      </button>
      <Field label="Passos (opcional)">
        {steps.length > 0 && (
          <div class="steps">
            {steps.map((x, i) => (
              <div class="step" key={x.id}>
                <button onClick={() => setSteps((s) => s.map((y, j) => (j === i ? { ...y, done: !y.done } : y)))} aria-label="Marcar passo"><Check on={x.done} /></button>
                <span class={'grow' + (x.done ? ' muted' : '')} style={x.done ? { textDecoration: 'line-through' } : null}>{x.title}</span>
                <button class="x" aria-label="Remover passo" onClick={() => setSteps((s) => s.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
          </div>
        )}
        <div class="step-add">
          <input value={newStep} onInput={(e) => setNewStep(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addStep()} placeholder="Ex.: agendar no Detran" />
          <button class="btn soft" onClick={addStep}>Adicionar</button>
        </div>
      </Field>
      <Field label="Observação (opcional)"><textarea rows="2" value={f.notes} onInput={(e) => set('notes', e.target.value)} placeholder="Ex.: levar comprovante de residência" /></Field>
      <Field label="Fotos e comprovantes (opcional)">
        <Photos paths={f.photos} onRemove={removePhoto} />
        <label class="btn ghost block" style={{ marginTop: 8 }}>
          {busy ? 'Enviando…' : '📎 Anexar foto'}
          <input type="file" accept="image/*" multiple onChange={addPhoto} style={{ display: 'none' }} />
        </label>
      </Field>
      <button class="btn block" onClick={save} disabled={busy}>{item ? 'Salvar' : 'Salvar pendência'}</button>
      {item && <button class="btn danger block" style={{ marginTop: 10 }} onClick={del}>Excluir pendência</button>}
    </div>
  );
}

export function Pendencias({ store, today, newSignal }) {
  const { st } = store;
  const [filter, setFilter] = useState('all');
  const [edit, setEdit] = useState(null);
  useEffect(() => { if (newSignal) setEdit({}); }, [newSignal]);
  const me = st.me.id;
  const other = st.profiles.find((p) => p.id !== me);
  let list = st.pendings;
  if (filter === 'done') list = list.filter((p) => p.done_at).sort((a, b) => b.done_at.localeCompare(a.done_at));
  else {
    list = list.filter((p) => !p.done_at);
    if (filter === 'mine') list = list.filter((p) => !p.owner_id || p.owner_id === me);
    if (filter === 'other') list = list.filter((p) => !p.owner_id || p.owner_id === other?.id);
    list = sortPendings(list, today);
  }
  const late = filter === 'done' ? [] : list.filter((p) => pendingState(p, today).late);
  const dated = filter === 'done' ? [] : list.filter((p) => p.due_date && !pendingState(p, today).late);
  const undated = filter === 'done' ? [] : list.filter((p) => !p.due_date);
  const row = (p) => <PendingRow key={p.id} p={p} store={store} today={today} onOpen={setEdit} />;
  return (
    <div>
      <div class="chips" style={{ marginBottom: 14 }}>
        {[['all', 'Todas'], ['mine', 'Minhas'], ['other', other ? `Da ${nick(other)}` : 'Outros'], ['done', 'Feitas']].map(([k, l]) => (
          <button key={k} class={'chip filter' + (filter === k ? ' sel' : '')} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>
      {filter === 'done' ? (
        list.length ? <div class="stack">{list.map(row)}</div> : <div class="card empty">Nenhuma pendência feita nos últimos 60 dias.</div>
      ) : list.length === 0 ? (
        <div class="card empty"><div>Nada pendente por aqui 🎉</div><button class="btn soft" style={{ marginTop: 10 }} onClick={() => setEdit({})}>+ Nova pendência</button></div>
      ) : (
        <div>
          {late.length > 0 && <><div class="grp late">Atrasadas</div><div class="stack">{late.map(row)}</div></>}
          {dated.length > 0 && <><div class="grp">Com prazo</div><div class="stack">{dated.map(row)}</div></>}
          {undated.length > 0 && <><div class="grp">Sem prazo</div><div class="stack">{undated.map(row)}</div></>}
        </div>
      )}
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Pendência' : 'Nova pendência'}>
        {edit && <PendingForm item={edit.id ? edit : null} store={store} today={today} onClose={() => setEdit(null)} />}
      </Sheet>
    </div>
  );
}
