import { useState, useEffect, useRef } from 'preact/hooks';
import { Avatar, Icon, MenuBtn, toast, haptic } from '../ui.jsx';
import { sb, firstName } from '../data.js';
import { compressBlob } from '../lib/image.js';
import { todayStr } from '../lib/schedule.js';

const BUCKET = 'reclamacoes';

function when(iso) {
  const d = new Date(iso);
  const day = todayStr(d);
  const t = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  const today = todayStr();
  if (day === today) return `hoje ${t}`;
  return `${day.slice(8)}/${day.slice(5, 7)} ${t}`;
}

export function Reclame({ store }) {
  const { st, reload, setSt } = store;
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [urls, setUrls] = useState({});
  const input = useRef();
  const me = st.me;

  // links temporários das fotos (bucket privado)
  useEffect(() => {
    const need = st.complaints.map((c) => c.photo_path).filter((p) => p && !urls[p]);
    if (!need.length) return;
    sb.storage.from(BUCKET).createSignedUrls(need, 3600).then(({ data }) => {
      if (!data) return;
      setUrls((u) => { const n = { ...u }; for (const x of data) if (x.signedUrl) n[x.path] = x.signedUrl; return n; });
    });
  }, [st.complaints]);

  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const b = await compressBlob(f);
      setPhoto(b);
      setPreview(URL.createObjectURL(b));
    } catch { toast('Não consegui abrir essa foto'); }
  };
  const clearPhoto = () => { if (preview) URL.revokeObjectURL(preview); setPhoto(null); setPreview(''); };

  const post = async () => {
    if (!text.trim() && !photo) return toast('Escreva algo ou escolha uma foto');
    setBusy(true);
    try {
      let photo_path = null;
      if (photo) {
        photo_path = `${st.hh.id}/${crypto.randomUUID()}.jpg`;
        const { error } = await sb.storage.from(BUCKET).upload(photo_path, photo, { contentType: 'image/jpeg' });
        if (error) throw error;
      }
      const { error } = await sb.from('complaints').insert({ body: text.trim() || null, photo_path });
      if (error) throw error;
      setText(''); clearPhoto();
      toast('Reclamação registrada 😼');
      reload();
    } catch (e) { toast('Erro: ' + (e.message || e)); } finally { setBusy(false); }
  };

  const del = async (c) => {
    if (!confirm('Apagar essa reclamação?')) return;
    setSt({ ...st, complaints: st.complaints.filter((x) => x.id !== c.id) });
    await sb.from('complaints').delete().eq('id', c.id);
    if (c.photo_path) await sb.storage.from(BUCKET).remove([c.photo_path]);
    reload();
  };

  const react = async (c, value) => {
    haptic();
    const mine = st.reacts.find((r) => r.complaint_id === c.id && r.user_id === me.id);
    if (mine && mine.value === value) {
      setSt({ ...st, reacts: st.reacts.filter((r) => r !== mine) });
      await sb.from('complaint_reactions').delete().match({ complaint_id: c.id, user_id: me.id });
    } else {
      const row = { complaint_id: c.id, user_id: me.id, household_id: st.hh.id, value };
      setSt({ ...st, reacts: [...st.reacts.filter((r) => r !== mine), row] });
      const { error } = await sb.from('complaint_reactions').upsert({ complaint_id: c.id, value, user_id: me.id }, { onConflict: 'complaint_id,user_id' });
      if (error) toast('Erro: ' + error.message);
    }
    reload();
  };

  return (
    <div>
      <div class="top">
        <div class="t"><h1>Reclame aqui</h1><div class="sub">Só de brincadeira. Sem direito de resposta.</div></div>
        <MenuBtn />
      </div>

      <div class="card" style={{ marginBottom: 14 }}>
        <textarea rows="3" value={text} onInput={(e) => setText(e.target.value)} placeholder="O que te irritou hoje?" />
        {preview && (
          <div class="photos" style={{ alignItems: 'center' }}>
            <img src={preview} alt="" style={{ width: 96, height: 96 }} />
            <button class="btn danger" onClick={clearPhoto}>{Icon.trash} Tirar foto</button>
          </div>
        )}
        <input ref={input} type="file" accept="image/*" style={{ display: 'none' }} onChange={pick} />
        <div class="row" style={{ marginTop: 10 }}>
          <button class="btn ghost" onClick={() => input.current.click()} disabled={busy}>{Icon.photo} Foto</button>
          <button class="btn grow" onClick={post} disabled={busy}>{busy ? <span class="spin" /> : 'Postar reclamação'}</button>
        </div>
      </div>

      {st.complaints.length === 0 && <div class="card empty"><img src={import.meta.env.BASE_URL + 'icon-192.png'} alt="" /><div>Nenhuma reclamação.<br />Tá tudo em paz. Por enquanto.</div></div>}
      <div class="stack">
        {st.complaints.map((c) => {
          const author = st.profiles.find((p) => p.id === c.author_id);
          const mine = c.author_id === me.id;
          const rs = st.reacts.filter((r) => r.complaint_id === c.id);
          const ups = rs.filter((r) => r.value === 1).length;
          const downs = rs.filter((r) => r.value === -1).length;
          const my = rs.find((r) => r.user_id === me.id)?.value;
          return (
            <div key={c.id} class="card">
              <div class="row" style={{ marginBottom: 8 }}>
                <Avatar p={author} />
                <span class="grow"><b>{mine ? 'Você' : firstName(author?.display_name)}</b> <span class="muted small">· {when(c.created_at)}</span></span>
                {mine && <button class="iconbtn" onClick={() => del(c)} aria-label="Apagar">{Icon.trash}</button>}
              </div>
              {c.photo_path && (urls[c.photo_path]
                ? <img src={urls[c.photo_path]} alt="" style={{ width: '100%', borderRadius: 14, marginBottom: 8, display: 'block' }} />
                : <div style={{ height: 160, borderRadius: 14, background: 'var(--bg2)', marginBottom: 8 }} />)}
              {c.body && <p style={{ margin: '0 0 10px', whiteSpace: 'pre-wrap' }}>{c.body}</p>}
              <div class="row" style={{ gap: 8 }}>
                <button class={'rx' + (my === 1 ? ' on' : '')} disabled={mine} onClick={() => react(c, 1)}>{Icon.up} {ups}</button>
                <button class={'rx' + (my === -1 ? ' on' : '')} disabled={mine} onClick={() => react(c, -1)}>{Icon.down} {downs}</button>
                <span class="grow" />
                <span class="muted small">🔒 sem resposta</span>
              </div>
            </div>
          );
        })}
      </div>
      {st.complaints.length >= 60 && <p class="muted small" style={{ textAlign: 'center', marginTop: 14 }}>Mostrando as 60 mais recentes.</p>}
    </div>
  );
}
