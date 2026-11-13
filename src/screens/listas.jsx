import { useState, useEffect } from 'preact/hooks';
import { Check, Sheet, Field, Icon, MenuBtn, toast, haptic } from '../ui.jsx';
import { sb } from '../data.js';
import { fmtRel } from '../lib/schedule.js';

const DONE_LABEL = { filmes: 'Já vi', lugares: 'Já fui', receitas: 'Já fiz', livros: 'Já li' };
const PLACEHOLDER = { filmes: 'Ex.: Ainda Estou Aqui', lugares: 'Ex.: Bar do Toninho', receitas: 'Ex.: Arroz de fraldinha', livros: 'Ex.: Torto Arado' };
const PAGE = 60;
const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function tags(it, kind) {
  const d = it.data || {};
  const out = [];
  if (kind === 'filmes' && d.tipo) out.push(d.tipo === 'serie' ? 'Série' : 'Filme');
  if (d.onde_assistir) out.push(d.onde_assistir);
  if (d.bairro) out.push(d.bairro);
  if (d.tipo && kind === 'lugares') out.push(d.tipo);
  return out;
}

function ItemForm({ item, list: list0, store, onClose }) {
  const [lid, setLid] = useState(list0.id);
  const list = store.st.lists.find((l) => l.id === lid) || list0;
  const [f, setF] = useState(() => ({ title: item?.title || '', details: item?.details || '', notes: item?.notes || '', url: item?.url || '' }));
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  const save = async () => {
    if (!f.title.trim()) return toast('Dê um nome');
    const row = { title: f.title.trim(), details: f.details.trim() || null, notes: f.notes.trim() || null, url: f.url.trim() || null };
    const { error } = item
      ? await sb.from('list_items').update({ ...row, needs_review: false }).eq('id', item.id)
      : await sb.from('list_items').insert({ ...row, list_id: list.id, added_by: store.st.me.id, source: 'manual' });
    if (error) return toast('Erro: ' + error.message);
    toast(item ? 'Salvo' : `${list.icon} Adicionado em ${list.name}`);
    onClose(); store.reload();
  };
  const del = async () => {
    if (!confirm(`Excluir "${item.title}" da lista?`)) return;
    await sb.from('list_items').delete().eq('id', item.id);
    onClose(); store.reload();
  };
  const ig = item?.source === 'instagram';
  const mapUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(f.title + ' Belo Horizonte');
  return (
    <div>
      {item?.needs_review && <div class="card" style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)', marginBottom: 14, fontSize: 14 }}>A leitura automática não teve certeza do nome. Abra o post, confira e corrija o título. Ao salvar, o aviso some.</div>}
      {!item && <Field label="Lista"><div class="chips">{store.st.lists.map((l) => <button key={l.id} class={'chip' + (l.id === lid ? ' on' : '')} onClick={() => setLid(l.id)}>{l.icon} {l.name}</button>)}</div></Field>}
      <Field label="Nome"><input value={f.title} onInput={(e) => set('title', e.target.value)} placeholder={PLACEHOLDER[list.kind] || ''} /></Field>
      <Field label="Detalhes"><input value={f.details} onInput={(e) => set('details', e.target.value)} placeholder={list.kind === 'lugares' ? 'Bairro, tipo, o que pedir...' : list.kind === 'filmes' ? 'Onde assistir, quem indicou...' : 'Quem indicou, observação...'} /></Field>
      <Field label="Anotações"><textarea rows="2" value={f.notes} onInput={(e) => set('notes', e.target.value)} placeholder="O que acharam, nota, lembrete..." /></Field>
      <Field label="Link (opcional)"><input type="url" value={f.url} onInput={(e) => set('url', e.target.value)} placeholder="https://" autocapitalize="off" /></Field>
      <div class="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {f.url && <a class="btn soft" href={f.url} target="_blank" rel="noopener">{ig ? 'Abrir no Instagram' : 'Abrir link'}</a>}
        {list.kind === 'lugares' && f.title && <a class="btn soft" href={mapUrl} target="_blank" rel="noopener">📍 Abrir no mapa</a>}
      </div>
      <button class="btn block" onClick={save}>Salvar</button>
      {item && <button class="btn danger block" style={{ marginTop: 10 }} onClick={del}>Excluir da lista</button>}
      {item && <p class="muted small" style={{ textAlign: 'center' }}>{ig ? 'Veio do Instagram' : 'Adicionado à mão'} · {fmtRel(item.created_at.slice(0, 10), new Date().toISOString().slice(0, 10))}</p>}
    </div>
  );
}

async function toggleDone(store, it) {
  const { st, setSt, reload } = store;
  haptic();
  const done = it.status !== 'feito';
  const patch = { status: done ? 'feito' : 'quero', done_at: done ? new Date().toISOString() : null };
  setSt({ ...st, listItems: st.listItems.map((x) => (x.id === it.id ? { ...x, ...patch } : x)) });
  const { error } = await sb.from('list_items').update(patch).eq('id', it.id);
  if (error) toast('Erro: ' + error.message);
  reload();
}

export function Listas({ store }) {
  const { st } = store;
  const lists = st.lists || [];
  const [cur, setCur] = useState(lists[0]?.id);
  const [view, setView] = useState('quero');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [edit, setEdit] = useState(null);
  useEffect(() => { setLimit(PAGE); }, [cur, view, q]);
  const list = lists.find((l) => l.id === cur) || lists[0];
  if (!list) return <div><div class="top"><div class="t"><h1>Listas</h1></div><MenuBtn /></div><div class="card empty">Nenhuma lista ainda.</div></div>;

  const all = st.listItems.filter((i) => i.list_id === list.id);
  const review = all.filter((i) => i.needs_review && i.status !== 'feito');
  let items = view === 'revisar' ? review : all.filter((i) => i.status === view);
  if (q.trim()) { const n = norm(q); items = all.filter((i) => norm(i.title + ' ' + (i.details || '') + ' ' + (i.notes || '')).includes(n)); }
  if (view === 'feito' && !q.trim()) items = items.slice().sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''));
  const pending = (id) => st.listItems.filter((i) => i.list_id === id && i.status === 'quero').length;

  return (
    <div>
      <div class="top"><div class="t"><h1>Listas</h1><div class="sub">Pra ver, ir, fazer e ler</div></div><button class="btn soft" onClick={() => setEdit({})}>{Icon.plus} Novo</button><MenuBtn /></div>

      <div class="chips" style={{ marginBottom: 12, flexWrap: 'nowrap', overflowX: 'auto', margin: '0 -18px 12px', padding: '2px 18px 6px' }}>
        {lists.map((l) => (
          <button key={l.id} class={'chip' + (l.id === list.id ? ' on' : '')} style={{ flex: 'none' }} onClick={() => { setCur(l.id); setView('quero'); setQ(''); }}>
            {l.icon} {l.name} <span class="tm">· {pending(l.id)}</span>
          </button>
        ))}
      </div>

      <input class="search" value={q} onInput={(e) => setQ(e.target.value)} placeholder={`Buscar em ${list.name}...`} style={{ marginBottom: 12 }} />

      {!q.trim() && (
        <div class="seg">
          <button class={view === 'quero' ? 'on' : ''} onClick={() => setView('quero')}>Pendentes</button>
          <button class={view === 'feito' ? 'on' : ''} onClick={() => setView('feito')}>{DONE_LABEL[list.kind] || 'Feitos'}</button>
          {review.length > 0 && <button class={view === 'revisar' ? 'on' : ''} onClick={() => setView('revisar')}>Revisar ({review.length})</button>}
        </div>
      )}

      {items.length === 0 && (
        <div class="card empty"><div>{q.trim() ? 'Nada encontrado.' : view === 'feito' ? 'Nada marcado ainda.' : 'Lista vazia. Toque em "+ Novo" pra anotar uma dica.'}</div></div>
      )}
      <div class="stack">
        {items.slice(0, limit).map((it) => {
          const done = it.status === 'feito';
          return (
            <div key={it.id} class={'item' + (done ? ' done' : '')}>
              <button class="grow" style={{ textAlign: 'left', minWidth: 0 }} onClick={() => setEdit(it)}>
                <div class="name">{it.title}</div>
                {(it.details || it.notes) && <div class="meta ellipsis">{it.notes || it.details}</div>}
                <div class="row" style={{ gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                  {it.needs_review && !done && <span class="pill due">Revisar</span>}
                  {tags(it, list.kind).map((t) => <span key={t} class="pill">{t}</span>)}
                  {it.source === 'instagram' && <span class="pill v">Instagram</span>}
                  {done && it.done_at && <span class="pill ok">{DONE_LABEL[list.kind] || 'Feito'} {fmtRel(it.done_at.slice(0, 10), new Date().toISOString().slice(0, 10))}</span>}
                </div>
              </button>
              <button onClick={() => toggleDone(store, it)} aria-label={DONE_LABEL[list.kind]}><Check on={done} /></button>
            </div>
          );
        })}
      </div>
      {items.length > limit && <button class="btn ghost block" style={{ marginTop: 12 }} onClick={() => setLimit(limit + PAGE)}>Mostrar mais ({items.length - limit})</button>}
      <p class="muted small" style={{ textAlign: 'center', marginTop: 16 }}>Toque no círculo quando {list.kind === 'lugares' ? 'forem' : list.kind === 'receitas' ? 'fizerem' : list.kind === 'livros' ? 'lerem' : 'assistirem'}. Toque no nome pra ver, editar ou excluir.</p>

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `${list.icon} ${list.name}` : "Anotar uma dica"}>
        {edit && <ItemForm item={edit.id ? edit : null} list={list} store={store} onClose={() => setEdit(null)} />}
      </Sheet>
    </div>
  );
}
