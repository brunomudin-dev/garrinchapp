import { useEffect, useState } from 'preact/hooks';

export const Icon = {
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
  today: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" /></svg>,
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 10.5L12 3.5l8.5 7" /><path d="M5.5 9v10.5h13V9" /><path d="M10 19.5v-5h4v5" /></svg>,
  cart: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2.2l2.3 11h10.8l2-7.5H6.4" /><circle cx="9.5" cy="19" r="1.4" /><circle cx="17" cy="19" r="1.4" /></svg>,
  gear: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z" /></svg>,
  plus: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>,
  camera: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>,
  dots: <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>,
  x: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>,
  chev: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>,
};

export function Check({ on }) {
  return <span class={'check' + (on ? ' on' : '')}>{on && Icon.check}</span>;
}

export function Avatar({ p, size = 26 }) {
  if (!p) return null;
  return <span class="avatar" style={{ background: p.color || '#EE7F1B', width: size, height: size, fontSize: size * 0.48 }}>{(p.display_name || '?')[0].toUpperCase()}</span>;
}

export function Ring({ value, total }) {
  const pct = total ? value / total : 1;
  const r = 27, c = 2 * Math.PI * r;
  return (
    <div class="ring">
      <svg width="64" height="64" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,.28)" stroke-width="7" />
        <circle cx="32" cy="32" r={r} fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-dasharray={c} stroke-dashoffset={c * (1 - pct)} style={{ transition: 'stroke-dashoffset .5s ease' }} />
      </svg>
      <b>{value}/{total}</b>
    </div>
  );
}

export function Sheet({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);
  if (!open) return null;
  return (
    <>
      <div class="scrim" onClick={onClose} />
      <div class="sheet" role="dialog">
        <div class="grab" />
        {title && <div class="row" style={{ marginBottom: 6 }}><h3 class="grow" style={{ margin: 0 }}>{title}</h3><button class="iconbtn" onClick={onClose} aria-label="Fechar">{Icon.x}</button></div>}
        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
    </>
  );
}

let toastSet = null;
export function toast(msg, action) { toastSet && toastSet({ msg, action, id: Math.random() }); }
export function ToastHost() {
  const [t, setT] = useState(null);
  toastSet = setT;
  useEffect(() => {
    if (!t) return;
    const h = setTimeout(() => setT(null), t.action ? 4500 : 2600);
    return () => clearTimeout(h);
  }, [t]);
  if (!t) return null;
  return (
    <div class="toast">
      <span>{t.msg}</span>
      {t.action && <button onClick={() => { t.action.fn(); setT(null); }}>{t.action.label}</button>}
    </div>
  );
}

export function Field({ label, children }) {
  return <label class="f"><span>{label}</span>{children}</label>;
}

export function haptic() { try { navigator.vibrate && navigator.vibrate(12); } catch {} }
