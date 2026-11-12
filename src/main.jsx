import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import './styles.css';
import { sb, useSession, useStore } from './data.js';
import { Icon, ToastHost, MenuCtx } from './ui.jsx';
import { tasksWithStatus } from './actions.js';
import { billInfo } from './lib/bills.js';
import { Hoje } from './screens/hoje.jsx';
import { Casa } from './screens/casa.jsx';
import { Mercado } from './screens/mercado.jsx';
import { Ajustes } from './screens/ajustes.jsx';
import { Agenda } from './screens/agenda.jsx';
import { Reclame } from './screens/reclame.jsx';

const MENU = [
  ['reclame', null, '😼', 'Reclame aqui', 'Mural de brincadeira'],
  ['casa', 'contas', '🧾', 'Contas a pagar', 'Vencimentos e lembretes'],
  ['mercado', 'compras', '🛒', 'Histórico de compras', 'Notinhas e pedidos'],
  ['mercado', 'gastos', '📊', 'Gastos no mercado', 'Por mês, categoria e cartão'],
  ['ajustes', 'meds', '💊', 'Remédios e estoque', 'Horários e doses'],
  ['ajustes', 'notifs', '🔔', 'Notificações', 'Ativar e testar'],
  ['ajustes', 'install', '📱', 'Instalar no iPhone', 'Passo a passo'],
  ['ajustes', null, '⚙️', 'Ajustes', 'Conta, casa e convite'],
];

function Drawer({ open, onClose, go }) {
  if (!open) return null;
  return (
    <>
      <div class="scrim" style={{ zIndex: 52 }} onClick={onClose} />
      <aside class="drawer" role="dialog" aria-label="Menu">
        <div class="row" style={{ marginBottom: 14 }}>
          <img class="dr-logo" src={import.meta.env.BASE_URL + "icon-192.png"} alt="" width="44" height="44" />
          <div class="grow"><h3 style={{ margin: 0, fontSize: 20 }}>GarrinchApp</h3><div class="muted small">Bruno e Gabi</div></div>
          <button class="iconbtn" onClick={onClose} aria-label="Fechar">{Icon.x}</button>
        </div>
        {MENU.map(([tab, intent, emoji, label, sub]) => (
          <button key={label} class="dr-item" onClick={() => { onClose(); go(tab, intent); }}>
            <span class="e">{emoji}</span>
            <span class="grow"><b>{label}</b><div class="muted small">{sub}</div></span>
            {Icon.chev}
          </button>
        ))}
      </aside>
    </>
  );
}

function Auth() {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ name: '', email: '', pass: '', code: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      if (mode === 'signup') {
        if (!f.name.trim()) throw new Error('Diga seu nome');
        if (f.pass.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres');
        const { error } = await sb.auth.signUp({ email: f.email.trim(), password: f.pass, options: { data: { display_name: f.name.trim(), invite_code: f.code.trim().toUpperCase() } } });
        if (error && !/confirm|email/i.test(error.message)) throw error;
      }
      const { error } = await sb.auth.signInWithPassword({ email: f.email.trim(), password: f.pass });
      if (error) throw new Error(/invalid/i.test(error.message) ? 'E-mail ou senha incorretos' : error.message);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div class="auth">
      <img class="logo" src={import.meta.env.BASE_URL + 'icon-512.png'} alt="Garrincha" />
      <h1>GarrinchApp</h1>
      <p class="lead">A casa do Bruno e da Gabi, em dia.</p>
      <div class="seg"><button class={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>Entrar</button><button class={mode === 'signup' ? 'on' : ''} onClick={() => setMode('signup')}>Criar conta</button></div>
      <form onSubmit={submit}>
        {mode === 'signup' && <label class="f"><span>Seu nome</span><input value={f.name} onInput={(e) => set('name', e.target.value)} placeholder="Bruno" autocomplete="given-name" /></label>}
        <label class="f"><span>E-mail</span><input type="email" value={f.email} onInput={(e) => set('email', e.target.value)} autocomplete="email" autocapitalize="off" /></label>
        <label class="f"><span>Senha</span><input type="password" value={f.pass} onInput={(e) => set('pass', e.target.value)} autocomplete={mode === 'signup' ? 'new-password' : 'current-password'} /></label>
        {mode === 'signup' && <label class="f"><span>Código da casa (se alguém te convidou)</span><input value={f.code} onInput={(e) => set('code', e.target.value.toUpperCase())} placeholder="Deixe vazio se for o primeiro" autocapitalize="characters" /></label>}
        {err && <div class="err">{err}</div>}
        <button class="btn block" disabled={busy}>{busy ? <span class="spin" /> : mode === 'login' ? 'Entrar' : 'Criar conta'}</button>
      </form>
    </div>
  );
}

function Shell({ session }) {
  const store = useStore(session);
  const { st, today } = store;
  const initTab = new URLSearchParams(location.search).get('tab') || 'hoje';
  const [tab, setTab] = useState(initTab);
  const [intent, setIntent] = useState(null);
  const [menu, setMenu] = useState(false);
  const go = (t, i) => { setTab(t); setIntent(i || null); window.scrollTo(0, 0); };
  useEffect(() => { if (location.search) history.replaceState(null, '', import.meta.env.BASE_URL); }, []);

  if (!st) return <div class="auth" style={{ textAlign: 'center' }}><img class="logo" src={import.meta.env.BASE_URL + 'icon-512.png'} alt="" /><span class="spin dark" style={{ display: 'inline-block', marginTop: 20 }} /></div>;
  if (st.error) return <div class="auth"><div class="err">Não consegui carregar: {st.error}</div><button class="btn block" onClick={store.reload}>Tentar de novo</button><button class="btn ghost block" style={{ marginTop: 10 }} onClick={() => sb.auth.signOut()}>Sair</button></div>;

  const pendingTasks = tasksWithStatus(st, today).filter((t) => ['late', 'due'].includes(t.st.status)).length;
  const pendingBills = st.bills.filter((b) => b.active && ['late', 'today', 'soon'].includes(billInfo(b, st.billPays, today).state)).length;
  const next7 = st.events.filter((e) => e.start_date >= today && e.start_date <= new Date(Date.parse(today + 'T12:00:00Z') + 2 * 86400000).toISOString().slice(0, 10)).length;
  const tabs = [['hoje', 'Hoje', Icon.today], ['casa', 'Casa', Icon.home, pendingTasks + pendingBills], ['mercado', 'Mercado', Icon.cart], ['agenda', 'Agenda', Icon.cal, next7]];

  return (
    <MenuCtx.Provider value={() => setMenu(true)}>
      <main class="app">
        {tab === 'hoje' && <Hoje store={store} today={today} go={go} />}
        {tab === 'casa' && <Casa store={store} today={today} intent={intent} clearIntent={() => setIntent(null)} />}
        {tab === 'mercado' && <Mercado store={store} today={today} intent={intent} clearIntent={() => setIntent(null)} />}
        {tab === 'agenda' && <Agenda store={store} today={today} />}
        {tab === 'reclame' && <Reclame store={store} />}
        {tab === 'ajustes' && <Ajustes store={store} intent={intent} clearIntent={() => setIntent(null)} />}
      </main>
      <Drawer open={menu} onClose={() => setMenu(false)} go={go} />
      <nav class="tabbar"><div class="in">
        {tabs.map(([k, l, ic, badge]) => (
          <button key={k} class={'tab' + (tab === k ? ' on' : '')} onClick={() => go(k)}>
            {ic}<span>{l}</span>{badge > 0 && <span class="badge">{badge}</span>}
          </button>
        ))}
      </div></nav>
      <ToastHost />
    </MenuCtx.Provider>
  );
}

function App() {
  const session = useSession();
  if (session === undefined) return null;
  return session ? <Shell session={session} /> : <><Auth /><ToastHost /></>;
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js', { scope: import.meta.env.BASE_URL }).catch(() => {});
render(<App />, document.getElementById('app'));
