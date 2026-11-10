import { useState } from 'preact/hooks';
import { Check, Avatar, Ring, Sheet, Icon } from '../ui.jsx';
import { tasksWithStatus, toggleTask, toggleMed, medStockDays } from '../actions.js';
import { isCleanerDay, nextCleanerDay, fmtRel, addDays, weekday, nowHM } from '../lib/schedule.js';
import { suggestions } from '../lib/suggest.js';
import { firstName } from '../data.js';

const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function greeting() {
  const h = Number(nowHM().slice(0, 2));
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

export function MedChips({ store, meds, today }) {
  const { st } = store;
  const taken = new Set(st.medLogs.filter((l) => l.log_date === today).map((l) => l.med_id));
  const now = nowHM();
  if (!meds.length) return <p class="muted small" style={{ margin: '4px 0' }}>Nada cadastrado ainda. Dá pra adicionar em Ajustes.</p>;
  return (
    <div class="chips">
      {meds.map((m) => {
        const on = taken.has(m.id);
        const tm = m.time_of_day ? m.time_of_day.slice(0, 5) : null;
        const lateish = !on && tm && tm <= now;
        const days = medStockDays(m);
        return (
          <button key={m.id} class={'chip' + (on ? ' on' : '') + (lateish ? ' warn' : '')} onClick={() => toggleMed(store, m, today)}>
            <span class="dot">{on && Icon.check}</span>
            <span>{m.name}{tm && <span class="tm"> · {tm}</span>}{days != null && days <= (m.low_days || 5) && <span class="tm" style={{ color: 'var(--red)' }}> · acaba em {days}d</span>}</span>
          </button>
        );
      })}
    </div>
  );
}

function WeekSheet({ open, onClose, st, today }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const logs = new Set(st.medLogs.map((l) => l.med_id + '|' + l.log_date));
  return (
    <Sheet open={open} onClose={onClose} title="Últimos 7 dias">
      {st.profiles.map((p) => {
        const meds = st.meds.filter((m) => m.owner_id === p.id && m.active);
        if (!meds.length) return null;
        return (
          <div key={p.id} style={{ marginBottom: 18 }}>
            <div class="who"><Avatar p={p} /> {firstName(p.display_name)}</div>
            <div class="card">
              <div class="week">
                <span />
                {days.map((d) => <span class="h" key={d}>{WD[weekday(d)].slice(0, 3)}<br />{d.slice(8)}</span>)}
                {meds.map((m) => [
                  <span class="ellipsis" key={m.id}>{m.name}</span>,
                  ...days.map((d) => {
                    const ok = logs.has(m.id + '|' + d);
                    const before = d < (m.created_at || '').slice(0, 10);
                    return <span key={m.id + d} class={'c ' + (ok ? 'y' : before ? '' : d === today ? '' : 'n')}>{ok ? '✓' : before || d === today ? '' : '✕'}</span>;
                  }),
                ])}
              </div>
            </div>
          </div>
        );
      })}
      <p class="muted small">✕ = dia sem check. O dia de hoje fica em branco até você marcar.</p>
    </Sheet>
  );
}

export function Hoje({ store, today, go }) {
  const { st } = store;
  const [week, setWeek] = useState(false);
  const me = st.me;
  const other = st.profiles.find((p) => p.id !== me.id);
  const myMeds = st.meds.filter((m) => m.owner_id === me.id && m.active);
  const otherMeds = other ? st.meds.filter((m) => m.owner_id === other.id && m.active) : [];
  const taken = new Set(st.medLogs.filter((l) => l.log_date === today).map((l) => l.med_id));

  const all = tasksWithStatus(st, today);
  const todayTasks = all
    .filter((t) => ['due', 'late', 'done'].includes(t.st.status) && (t.st.status !== 'done' || t.last?.done_on === today))
    .sort((a, b) => ({ late: 0, due: 1, done: 2 }[a.st.status] - { late: 0, due: 1, done: 2 }[b.st.status]) || (b.st.lateDays || 0) - (a.st.lateDays || 0));
  const doneTasks = todayTasks.filter((t) => t.st.status === 'done').length;
  const myDone = myMeds.filter((m) => taken.has(m.id)).length;
  const total = todayTasks.length + myMeds.length;
  const done = doneTasks + myDone;

  const cleanerToday = isCleanerDay(st.hh, today);
  const nextClean = nextCleanerDay(st.hh, addDays(today, 1));
  const sugg = suggestions(st, today);
  const listCount = st.list.filter((l) => !l.checked).length;
  const dateLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Sao_Paulo' }).format(new Date()).replace(/^./, (c) => c.toUpperCase());

  return (
    <div>
      <div class="top">
        <img src={import.meta.env.BASE_URL + 'icon-192.png'} alt="" />
        <div class="t">
          <h1>{greeting()}, {firstName(me.display_name)}</h1>
          <div class="sub">{dateLabel}</div>
        </div>
      </div>

      <div class="hero">
        <Ring value={done} total={total} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h2>{total === 0 ? 'Dia tranquilo 😺' : done === total ? 'Tudo feito hoje! 🎉' : `Faltam ${total - done} ${total - done === 1 ? 'coisa' : 'coisas'}`}</h2>
          <p>{cleanerToday ? '🧹 Hoje é dia de faxina' : nextClean ? `Próxima faxina ${fmtRel(nextClean, today)}` : 'Bora deixar a casa em dia'}</p>
        </div>
      </div>

      <div class="section"><h2>Remédios e suplementos</h2><button class="link" onClick={() => setWeek(true)}>Ver semana</button></div>
      <div class="who"><Avatar p={me} /> Você</div>
      <MedChips store={store} meds={myMeds} today={today} />
      {other && (
        <>
          <div class="who"><Avatar p={other} /> {firstName(other.display_name)}</div>
          {otherMeds.length ? <MedChips store={store} meds={otherMeds} today={today} /> : <p class="muted small" style={{ margin: '4px 0' }}>{firstName(other.display_name)} ainda não cadastrou os dela.</p>}
        </>
      )}
      {!other && <p class="muted small" style={{ marginTop: 10 }}>💌 Convide a Gabi em Ajustes pra vocês dividirem a casa no app.</p>}

      <div class="section"><h2>Casa hoje</h2><button class="link" onClick={() => go('casa')}>Todas</button></div>
      <div class="stack">
        {todayTasks.length === 0 && <div class="card empty"><img src={import.meta.env.BASE_URL + 'icon-192.png'} alt="" /><div>Nada pendente na casa hoje.<br />O Garrincha aprova.</div></div>}
        {todayTasks.map((t) => {
          const who = t.assignee_id && st.profiles.find((p) => p.id === t.assignee_id);
          const by = t.st.status === 'done' && st.profiles.find((p) => p.id === t.last?.done_by);
          return (
            <button key={t.id} class={'item' + (t.st.status === 'done' ? ' done' : '')} style={{ width: '100%', textAlign: 'left' }} onClick={() => toggleTask(store, t, today)}>
              <span class="ic">{t.icon}</span>
              <span class="grow">
                <div class="name">{t.name}</div>
                <div class="meta row" style={{ gap: 6, marginTop: 2 }}>
                  {t.st.status === 'late' && <span class="pill late">{t.st.label}</span>}
                  {t.st.status === 'due' && <span class="pill due">Hoje</span>}
                  {t.st.status === 'done' && <span>Feito{by ? ` por ${firstName(by.display_name)}` : ''}</span>}
                  {who && t.st.status !== 'done' && <span class="pill v">{firstName(who.display_name)}</span>}
                </div>
              </span>
              <Check on={t.st.status === 'done'} />
            </button>
          );
        })}
      </div>

      <div class="section"><h2>Mercado</h2><button class="link" onClick={() => go('mercado')}>Abrir</button></div>
      <div class="card row" style={{ gap: 14 }}>
        <div class="grow">
          <div style={{ fontWeight: 700 }}>{listCount ? `${listCount} ${listCount === 1 ? 'item' : 'itens'} na lista` : 'Lista vazia'}</div>
          <div class="muted small">{sugg.length ? `${sugg.length} sugest${sugg.length === 1 ? 'ão' : 'ões'} de reposição` : 'Lance as notinhas pra eu aprender o que vocês consomem'}</div>
        </div>
        <button class="btn" onClick={() => go('mercado', 'scan')}>{Icon.camera} Notinha</button>
      </div>

      <WeekSheet open={week} onClose={() => setWeek(false)} st={st} today={today} />
    </div>
  );
}
