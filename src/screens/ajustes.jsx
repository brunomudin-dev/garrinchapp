import { useState, useEffect } from 'preact/hooks';
import { Sheet, Icon, Field, toast, Avatar, MenuBtn } from '../ui.jsx';
import { sb, callFn, VAPID_PUBLIC, firstName } from '../data.js';
import { medStockDays } from '../actions.js';

function b64ToU8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

function MedForm({ med, st, onClose, reload }) {
  const [f, setF] = useState(() => ({
    name: med?.name || '', kind: med?.kind || 'suplemento', dose: med?.dose || '',
    time: med?.time_of_day ? med.time_of_day.slice(0, 5) : '', owner_id: med?.owner_id || st.me.id,
    stock: med?.stock_qty ?? '', per_day: med?.per_day ?? 1, low_days: med?.low_days ?? 5,
  }));
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  const save = async () => {
    if (!f.name.trim()) return toast('Dê um nome');
    const row = {
      name: f.name.trim(), kind: f.kind, dose: f.dose || null, time_of_day: f.time || null, owner_id: f.owner_id,
      stock_qty: f.stock === '' ? null : Number(f.stock), per_day: Number(f.per_day) || 1, low_days: Number(f.low_days) || 5,
    };
    const { error } = med ? await sb.from('meds').update(row).eq('id', med.id) : await sb.from('meds').insert({ ...row, sort: 99 });
    if (error) return toast('Erro: ' + error.message);
    onClose(); reload();
  };
  const del = async () => { if (!confirm(`Remover ${med.name}?`)) return; await sb.from('meds').delete().eq('id', med.id); onClose(); reload(); };
  return (
    <div>
      <Field label="Nome"><input value={f.name} onInput={(e) => set('name', e.target.value)} placeholder="Ex.: Creatina" /></Field>
      <div class="seg"><button class={f.kind === 'suplemento' ? 'on' : ''} onClick={() => set('kind', 'suplemento')}>🥤 Suplemento</button><button class={f.kind === 'remedio' ? 'on' : ''} onClick={() => set('kind', 'remedio')}>💊 Remédio</button></div>
      <Field label="De quem"><select value={f.owner_id} onChange={(e) => set('owner_id', e.target.value)}>{st.profiles.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}</select></Field>
      <div class="row">
        <Field label="Dose (opcional)"><input value={f.dose} onInput={(e) => set('dose', e.target.value)} placeholder="5 g, 1 cápsula" /></Field>
        <Field label="Horário do lembrete"><input type="time" value={f.time} onInput={(e) => set('time', e.target.value)} /></Field>
      </div>
      <p class="muted small" style={{ marginTop: -4 }}>Sem horário: não tem lembrete na hora, mas entra no resumo das 19h se não tiver check.</p>
      <div class="divider" />
      <p class="small" style={{ fontWeight: 700, margin: '6px 4px' }}>Controle de estoque (opcional)</p>
      <div class="row">
        <Field label="Doses restantes"><input type="number" inputMode="decimal" value={f.stock} onInput={(e) => set('stock', e.target.value)} placeholder="ex.: 60" /></Field>
        <Field label="Avisar com (dias)"><input type="number" inputMode="numeric" value={f.low_days} onInput={(e) => set('low_days', e.target.value)} /></Field>
      </div>
      <p class="muted small" style={{ marginTop: -4 }}>Cada check desconta 1 dose. Quando estiver acabando, o item aparece nas sugestões da lista de compras.</p>
      <button class="btn block" onClick={save}>Salvar</button>
      {med && <button class="btn danger block" style={{ marginTop: 10 }} onClick={del}>Remover</button>}
    </div>
  );
}

const KIND = { med: 'lembrete de remédio', med2: 'segundo lembrete de remédio', summary: 'resumo do dia', bill: 'conta a pagar', event: 'evento', event2: 'evento', test: 'teste' };
const fmtWhen = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

function Notifs({ st }) {
  const [state, setState] = useState('checando');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null);
  const loadLast = async () => {
    const [ok, bad] = await Promise.all([
      sb.from('push_log').select('kind,created_at').eq('ok', true).order('created_at', { ascending: false }).limit(1),
      sb.from('push_log').select('kind,created_at,status,detail').eq('ok', false).gt('status', 0).order('created_at', { ascending: false }).limit(1),
    ]);
    setLast({ ok: ok.data?.[0] || null, bad: bad.data?.[0] || null });
  };
  useEffect(() => { loadLast(); }, []);
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const check = async () => {
    if (!supported) return setState(isStandalone() ? 'sem-suporte' : 'instalar');
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    setState(sub && Notification.permission === 'granted' ? 'ativo' : Notification.permission === 'denied' ? 'negado' : 'inativo');
  };
  useEffect(() => { check(); }, []);
  const enable = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setState('negado'); return; }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(VAPID_PUBLIC) });
      const j = sub.toJSON();
      const { error } = await sb.from('push_subscriptions').upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_id: st.me.id }, { onConflict: 'endpoint' });
      if (error) throw error;
      setState('ativo');
      await callFn('notify', { mode: 'test' });
      toast('Notificações ativadas! 🔔');
    } catch (e) { toast('Erro: ' + e.message); } finally { setBusy(false); }
  };
  const test = async () => {
    try {
      const r = await callFn('notify', { mode: 'test' });
      toast(r.sent ? 'Enviada! Deve chegar em segundos.' : r.errors?.length ? 'A Apple/Google recusou o envio: ' + r.errors[0] : 'Nenhum aparelho inscrito');
      loadLast();
    } catch (e) { toast('Erro: ' + e.message); }
  };

  return (
    <div class="card">
      {state === 'instalar' && <p class="small" style={{ margin: 0 }}>Pra receber notificações no iPhone, primeiro instale o app na tela inicial (veja o passo a passo abaixo) e abra por lá.</p>}
      {state === 'sem-suporte' && <p class="small" style={{ margin: 0 }}>Esse aparelho não suporta notificações web. Atualize o iOS (16.4 ou mais novo).</p>}
      {state === 'negado' && <p class="small" style={{ margin: 0 }}>As notificações foram bloqueadas. Libere em Ajustes do iPhone → Notificações → GarrinchApp.</p>}
      {state === 'inativo' && <><p class="small" style={{ marginTop: 0 }}>Lembretes dos remédios no horário cadastrado, e resumos às 8h e às 19h com o que ainda falta.</p><button class="btn block" disabled={busy} onClick={enable}>🔔 Ativar notificações</button></>}
      {state === 'ativo' && (
        <>
          <div class="row"><span class="grow"><b>🔔 Ativas neste aparelho</b><div class="muted small">Remédios no horário (e de novo 30 min depois) · resumo 8h e 19h · contas e agenda</div></span><button class="btn ghost" onClick={test}>Testar</button></div>
          {last && (
            <div class="small muted" style={{ marginTop: 10 }}>
              {last.ok ? `Último aviso entregue: ${fmtWhen(last.ok.created_at)} (${KIND[last.ok.kind] || last.ok.kind})` : 'Nenhum aviso entregue ainda.'}
              {last.bad && (!last.ok || last.bad.created_at > last.ok.created_at) && <div style={{ color: 'var(--red)', marginTop: 4 }}>Última falha: {fmtWhen(last.bad.created_at)} · {last.bad.detail || last.bad.status}</div>}
            </div>
          )}
        </>
      )}
      {state === 'checando' && <span class="spin dark" />}
    </div>
  );
}

export function Ajustes({ store, intent, clearIntent }) {
  const { st, reload } = store;
  const [med, setMed] = useState(null);
  const [name, setName] = useState(st.me.display_name);
  const [guide, setGuide] = useState(false);
  const saveName = async () => { if (name.trim() && name !== st.me.display_name) { await sb.from('profiles').update({ display_name: name.trim() }).eq('id', st.me.id); reload(); toast('Nome salvo'); } };
  const partner = st.profiles.find((p) => p.id !== st.me.id);
  useEffect(() => {
    if (!intent) return;
    if (intent === 'install') setGuide(true);
    else setTimeout(() => document.getElementById('aj-' + intent)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    clearIntent && clearIntent();
  }, [intent]);
  const share = async () => {
    const text = `Bora usar o GarrinchApp 🐱\n1) Abra ${location.origin}${import.meta.env.BASE_URL} no Safari\n2) Toque em "Criar conta" e use o código da casa: ${st.hh.join_code}`;
    if (navigator.share) navigator.share({ text }).catch(() => {}); else { navigator.clipboard.writeText(text); toast('Convite copiado'); }
  };

  return (
    <div>
      <div class="top"><div class="t"><h1>Ajustes</h1><div class="sub">Do jeito de vocês</div></div><MenuBtn /></div>

      <div class="section" id="aj-meds"><h2>Remédios e suplementos</h2><button class="link" onClick={() => setMed({})}>+ Adicionar</button></div>
      {st.profiles.map((p) => {
        const meds = st.meds.filter((m) => m.owner_id === p.id);
        return (
          <div key={p.id}>
            <div class="who"><Avatar p={p} /> {p.id === st.me.id ? 'Você' : firstName(p.display_name)}</div>
            <div class="stack">
              {meds.length === 0 && <p class="muted small" style={{ margin: 0 }}>Nada cadastrado.</p>}
              {meds.map((m) => {
                const d = medStockDays(m);
                return (
                  <button key={m.id} class="item" style={{ width: '100%', textAlign: 'left', padding: '10px 14px' }} onClick={() => setMed(m)}>
                    <span>{m.kind === 'remedio' ? '💊' : '🥤'}</span>
                    <span class="grow"><div class="name">{m.name}</div><div class="meta">{m.time_of_day ? '⏰ ' + m.time_of_day.slice(0, 5) : 'sem horário'}{m.dose ? ' · ' + m.dose : ''}{d != null ? ` · estoque p/ ${d} dias` : ''}</div></span>
                    {Icon.chev}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <div class="section" id="aj-notifs"><h2>Notificações</h2></div>
      <Notifs st={st} />

      <div class="section"><h2>A casa</h2></div>
      <div class="card stack">
        {partner ? (
          <div class="row"><Avatar p={partner} size={34} /><span class="grow"><b>{partner.display_name}</b><div class="muted small">Divide a casa com você</div></span></div>
        ) : (
          <>
            <div><b>Convide a Gabi</b><div class="muted small">Ela cria a conta com esse código e vocês passam a ver tudo junto.</div></div>
            <div><span class="code">{st.hh.join_code}</span></div>
            <button class="btn soft block" onClick={share}>Enviar convite</button>
          </>
        )}
        <div class="divider" />
        <Field label="Seu nome"><input value={name} onInput={(e) => setName(e.target.value)} onBlur={saveName} /></Field>
      </div>

      <div class="section"><h2>Instalar no iPhone</h2><button class="link" onClick={() => setGuide(true)}>Como fazer</button></div>
      <div class="card small muted">{isStandalone() ? '✅ Você já está usando o app instalado.' : 'Abra no Safari → Compartilhar → "Adicionar à Tela de Início".'}</div>

      <button class="btn ghost block" style={{ marginTop: 26 }} onClick={() => sb.auth.signOut()}>Sair da conta</button>
      <p class="muted small" style={{ textAlign: 'center', marginTop: 16 }}>GarrinchApp · feito pro Bruno e pra Gabi 🧡</p>

      <Sheet open={!!med} onClose={() => setMed(null)} title={med?.id ? med.name : 'Novo item'}>
        {med && <MedForm med={med.id ? med : null} st={st} onClose={() => setMed(null)} reload={reload} />}
      </Sheet>
      <Sheet open={guide} onClose={() => setGuide(false)} title="Instalar no iPhone">
        <ol class="stack" style={{ paddingLeft: 20, margin: 0 }}>
          <li>Abra o link do app no <b>Safari</b>, não no Chrome nem no navegador do WhatsApp.</li>
          <li>Toque no botão <b>Compartilhar</b> (quadrado com a seta pra cima).</li>
          <li>Role e toque em <b>"Adicionar à Tela de Início"</b> → <b>Adicionar</b>.</li>
          <li>Abra o <b>GarrinchApp</b> pelo ícone do Garrincha na tela inicial.</li>
          <li>Vá em <b>Ajustes → Ativar notificações</b> e permita.</li>
        </ol>
        <p class="muted small">Precisa de iOS 16.4 ou mais novo. Cada um faz isso no próprio iPhone.</p>
      </Sheet>
    </div>
  );
}
