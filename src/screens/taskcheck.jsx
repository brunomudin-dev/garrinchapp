import { useState, useRef } from 'preact/hooks';
import { Sheet } from '../ui.jsx';
import { toggleTask, markTaskOn } from '../actions.js';
import { addDays, weekday, taskStatus } from '../lib/schedule.js';
import { nick } from './pendencias.jsx';

const WDN = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const dm = (s) => `${s.slice(8)}/${s.slice(5, 7)}`;

/** Botão de tarefa: toque marca como feita hoje; segurar abre "Quando foi feita?". */
export function TaskHold({ task, store, today, children, class: cls, style, label }) {
  const [open, setOpen] = useState(false);
  const timer = useRef(null);
  const held = useRef(false);
  const start = () => {
    held.current = false;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { held.current = true; try { navigator.vibrate && navigator.vibrate(20); } catch {} setOpen(true); }, 450);
  };
  const cancel = () => clearTimeout(timer.current);
  const click = (e) => {
    cancel();
    if (held.current) { held.current = false; e.preventDefault(); return; }
    toggleTask(store, task, today);
  };
  return (
    <>
      <button
        class={cls} style={{ ...(style || {}), WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }} aria-label={label || 'Marcar feito (segure para escolher o dia)'}
        onPointerDown={start} onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel}
        onContextMenu={(e) => { e.preventDefault(); cancel(); setOpen(true); held.current = true; }}
        onClick={click}
      >{children}</button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Quando foi feita?">
        {open && <RetroForm task={task} store={store} today={today} onClose={() => setOpen(false)} />}
      </Sheet>
    </>
  );
}

function RetroForm({ task, store, today, onClose }) {
  const { st } = store;
  const [date, setDate] = useState(addDays(today, -1));
  const [who, setWho] = useState(st.me.id);
  const opts = [[today, 'Hoje'], [addDays(today, -1), 'Ontem'], [addDays(today, -2), 'Anteontem']];
  const custom = !opts.some(([d]) => d === date);
  const sim = taskStatus(task, date, today, st.hh);
  const nextTxt = task.rule === 'interval' && task.interval_days
    ? `Próxima: ${WDN[weekday(addDays(date, task.interval_days))]}, ${dm(addDays(date, task.interval_days))} (${task.interval_days} dias depois)`
    : sim.next ? `Próxima: ${WDN[weekday(sim.next)]}, ${dm(sim.next)}` : '';
  const save = async () => { await markTaskOn(store, task, date, who); onClose(); };
  return (
    <div>
      <p class="muted" style={{ marginTop: -6 }}>{task.icon} {task.name}</p>
      <div class="pick3">
        {opts.map(([d, l]) => (
          <button key={d} class={date === d ? 'on' : ''} onClick={() => setDate(d)}><b>{l}</b><span>{WDN[weekday(d)]}, {dm(d)}</span></button>
        ))}
      </div>
      <label class="f" style={{ marginTop: 12 }}><span>Outra data</span>
        <input type="date" value={custom ? date : ''} max={today} onInput={(e) => e.target.value && setDate(e.target.value)} />
      </label>
      <label class="f"><span>Quem fez</span>
        <div class="days">
          <button class={who === st.me.id ? 'on' : ''} onClick={() => setWho(st.me.id)}>Eu</button>
          {st.profiles.filter((p) => p.id !== st.me.id).map((p) => <button key={p.id} class={who === p.id ? 'on' : ''} onClick={() => setWho(p.id)}>{nick(p)}</button>)}
          <button class={who === 'cleaner' ? 'on' : ''} onClick={() => setWho('cleaner')}>Faxineira</button>
        </div>
      </label>
      {nextTxt && <div class="card" style={{ padding: '12px 14px', marginBottom: 14 }}><span class="muted small">{nextTxt}</span></div>}
      <button class="btn block" onClick={save}>Marcar como feita</button>
      <p class="muted small" style={{ textAlign: 'center' }}>Toque rápido no círculo marca como feita hoje, por você.</p>
    </div>
  );
}
