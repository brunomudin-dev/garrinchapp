import { useState, useEffect } from 'preact/hooks';
import { Check, Sheet, Icon, Field, toast, Avatar, MenuBtn } from '../ui.jsx';
import { Contas } from './contas.jsx';
import { tasksWithStatus, toggleTask } from '../actions.js';
import { ruleLabel, fmtRel, nextCleanerDay, isCleanerDay, diffDays } from '../lib/schedule.js';
import { sb, firstName } from '../data.js';

const WD = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const EMOJIS = ['🐱', '🤖', '👕', '🪴', '🛁', '🛏️', '🗑️', '🧹', '🍽️', '🧺', '🧽', '🚿', '❄️', '🐟', '💧', '🔧', '🚗', '📦', '✨'];

function TaskForm({ task, st, onClose, reload }) {
  const [f, setF] = useState(() => ({
    name: task?.name || '', icon: task?.icon || '✨', rule: task?.rule || 'interval',
    interval_days: task?.interval_days || 7, weekdays: task?.weekdays || [], max_days: task?.max_days || 3,
    assignee_id: task?.assignee_id || '', start_date: task?.start_date || new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }),
  }));
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  const save = async () => {
    if (!f.name.trim()) return toast('Dê um nome pra tarefa');
    const row = {
      name: f.name.trim(), icon: f.icon || '✨', rule: f.rule,
      interval_days: f.rule === 'interval' ? Number(f.interval_days) || 1 : null,
      weekdays: f.rule === 'weekdays' ? f.weekdays : null,
      max_days: f.rule === 'as_needed' ? Number(f.max_days) || 3 : null,
      assignee_id: f.assignee_id || null,
      ...(f.rule === 'once' ? { start_date: f.start_date } : {}),
    };
    const { error } = task ? await sb.from('tasks').update(row).eq('id', task.id) : await sb.from('tasks').insert({ ...row, sort: 99 });
    if (error) return toast('Erro: ' + error.message);
    toast(task ? 'Tarefa atualizada' : 'Tarefa criada');
    onClose(); reload();
  };
  const del = async () => {
    if (!confirm(`Apagar "${task.name}"?`)) return;
    await sb.from('tasks').delete().eq('id', task.id);
    onClose(); reload();
  };
  return (
    <div>
      <Field label="Nome"><input value={f.name} onInput={(e) => set('name', e.target.value)} placeholder="Ex.: Limpar a geladeira" /></Field>
      <Field label="Ícone">
        <div class="chips">{EMOJIS.map((e) => <button key={e} class={'chip' + (f.icon === e ? ' on' : '')} style={{ padding: '8px 10px', fontSize: 20 }} onClick={() => set('icon', e)}>{e}</button>)}</div>
      </Field>
      <Field label="Repetir">
        <div class="days">
          {[['once', 'Uma vez só'], ['interval', 'A cada X dias'], ['weekdays', 'Dias fixos'], ['as_needed', 'Quando precisar'], ['cleaner', 'Dia da faxina']].map(([k, l]) => (
            <button key={k} class={f.rule === k ? 'on' : ''} onClick={() => set('rule', k)}>{l}</button>
          ))}
        </div>
      </Field>
      {f.rule === 'interval' && (
        <Field label="A cada quantos dias?">
          <div class="days">{[1, 2, 3, 7, 14, 30].map((n) => <button key={n} class={Number(f.interval_days) === n ? 'on' : ''} onClick={() => set('interval_days', n)}>{n === 1 ? 'Diário' : n === 7 ? 'Semana' : n === 14 ? '15 dias' : n === 30 ? 'Mês' : n + ' dias'}</button>)}</div>
          <div class="row after" style={{ gap: 10 }}>
            <span class="muted small">Ou digite:</span>
            <input type="number" min="1" inputMode="numeric" value={f.interval_days} onInput={(e) => set('interval_days', e.target.value)} style={{ width: 80, textAlign: 'center' }} aria-label="Número de dias" />
            <span class="muted small">dias</span>
          </div>
        </Field>
      )}
      {f.rule === 'weekdays' && (
        <Field label="Quais dias?">
          <div class="days">{WD.map((d, i) => <button key={i} class={f.weekdays.includes(i) ? 'on' : ''} onClick={() => set('weekdays', f.weekdays.includes(i) ? f.weekdays.filter((x) => x !== i) : [...f.weekdays, i])}>{d}</button>)}</div>
        </Field>
      )}
      {f.rule === 'once' && (
        <Field label="Para quando?"><input type="date" value={f.start_date} onInput={(e) => set('start_date', e.target.value)} /></Field>
      )}
      {f.rule === 'once' && <p class="muted small" style={{ marginTop: -6 }}>Depois de marcada como feita, ela sai da lista.</p>}
      {f.rule === 'as_needed' && (
        <Field label="Avisar depois de quantos dias sem fazer?"><input type="number" min="1" inputMode="numeric" value={f.max_days} onInput={(e) => set('max_days', e.target.value)} /></Field>
      )}
      <Field label="Responsável">
        <select value={f.assignee_id} onChange={(e) => set('assignee_id', e.target.value)}>
          <option value="">Qualquer um</option>
          {st.profiles.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
        </select>
      </Field>
      <button class="btn block" onClick={save}>Salvar</button>
      {task && <button class="btn danger block" style={{ marginTop: 10 }} onClick={del}>Apagar tarefa</button>}
    </div>
  );
}

function CleanerForm({ st, onClose, reload }) {
  const [start, setStart] = useState(st.hh.cleaner_start || '');
  const [every, setEvery] = useState(st.hh.cleaner_interval_days || 14);
  const save = async () => {
    const { error } = await sb.from('households').update({ cleaner_start: start || null, cleaner_interval_days: Number(every) || 14 }).eq('id', st.hh.id);
    if (error) return toast('Erro: ' + error.message);
    onClose(); reload();
  };
  return (
    <div>
      <Field label="Data de uma faxina (referência)"><input type="date" value={start} onInput={(e) => setStart(e.target.value)} /></Field>
      <Field label="Repete a cada">
        <div class="days">{[7, 14, 21, 30].map((n) => <button key={n} class={Number(every) === n ? 'on' : ''} onClick={() => setEvery(n)}>{n === 7 ? 'Semana' : n === 14 ? '15 dias' : n + ' dias'}</button>)}</div>
      </Field>
      <p class="muted small">As tarefas marcadas como "dia da faxineira" (ex.: roupa de cama) aparecem como resolvidas nesse dia.</p>
      <button class="btn block" onClick={save}>Salvar</button>
    </div>
  );
}

export function Casa({ store, today, intent, clearIntent }) {
  const { st, reload } = store;
  const [edit, setEdit] = useState(null);
  const [cleaner, setCleaner] = useState(false);
  const all = tasksWithStatus(st, today);
  const order = { late: 0, due: 1, cleaner: 2, done: 3, ok: 4 };
  all.sort((a, b) => order[a.st.status] - order[b.st.status] || (b.st.lateDays || 0) - (a.st.lateDays || 0) || a.sort - b.sort);
  const groups = [
    ['Pra fazer', all.filter((t) => ['late', 'due'].includes(t.st.status))],
    ['Feito hoje', all.filter((t) => ['done', 'cleaner'].includes(t.st.status))],
    ['Em dia', all.filter((t) => t.st.status === 'ok')],
  ];
  const next = nextCleanerDay(st.hh, today);
  const cToday = isCleanerDay(st.hh, today);
  useEffect(() => {
    if (intent === 'contas') {
      setTimeout(() => document.getElementById('contas')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
      clearIntent && clearIntent();
    }
  }, [intent]);

  return (
    <div>
      <div class="top"><div class="t"><h1>Casa</h1><div class="sub">Tarefas e contas</div></div><button class="btn soft" onClick={() => setEdit({})}>{Icon.plus} Nova</button><MenuBtn /></div>

      <button class="card row" style={{ width: '100%', textAlign: 'left' }} onClick={() => setCleaner(true)}>
        <span class="item" style={{ padding: 0, boxShadow: 'none', background: 'none' }}><span class="ic">🧹</span></span>
        <span class="grow">
          <div style={{ fontWeight: 700 }}>Faxineira</div>
          <div class="muted small">{cToday ? 'Hoje é dia de faxina!' : next ? `Próxima: ${fmtRel(next, today)} · em ${diffDays(next, today)} dia${diffDays(next, today) > 1 ? 's' : ''}` : 'Toque para definir o dia'}</div>
        </span>
        {Icon.chev}
      </button>

      {groups.map(([title, list]) => list.length > 0 && (
        <div key={title}>
          <div class="section"><h2>{title}</h2><span class="muted small">{list.length}</span></div>
          <div class="stack">
            {list.map((t) => {
              const who = t.assignee_id && st.profiles.find((p) => p.id === t.assignee_id);
              const by = t.last && st.profiles.find((p) => p.id === t.last.done_by);
              const done = t.st.status === 'done' || t.st.status === 'cleaner';
              return (
                <div key={t.id} class={'item' + (done ? ' done' : '')}>
                  <button class="ic" onClick={() => setEdit(t)}>{t.icon}</button>
                  <button class="grow" style={{ textAlign: 'left' }} onClick={() => setEdit(t)}>
                    <div class="name">{t.name}</div>
                    <div class="meta">{ruleLabel(t)}{t.last && t.st.status !== 'done' && t.rule !== 'cleaner' ? ` · últ. ${fmtRel(t.last.done_on, today)}${by ? ' (' + firstName(by.display_name) + ')' : ''}` : ''}</div>
                    <div class="row" style={{ gap: 6, marginTop: 4 }}>
                      {t.st.status === 'late' && <span class="pill late">{t.st.label}</span>}
                      {t.st.status === 'due' && <span class="pill due">{t.rule === 'as_needed' ? t.st.label : 'Hoje'}</span>}
                      {t.st.status === 'ok' && t.st.label && <span class="pill ok">{t.st.label}</span>}
                      {t.st.status === 'cleaner' && <span class="pill ok">🧹 A faxineira cuida</span>}
                      {t.st.status === 'done' && <span class="pill ok">Feito{by ? ` por ${firstName(by.display_name)}` : ''}</span>}
                      {who && <span class="pill v">{firstName(who.display_name)}</span>}
                    </div>
                  </button>
                  {t.rule !== 'cleaner' && <button onClick={() => toggleTask(store, t, today)} aria-label="Marcar feito"><Check on={t.st.status === 'done'} /></button>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <p class="muted small" style={{ textAlign: 'center', marginTop: 20 }}>Toque no nome pra editar. Toque no círculo pra marcar como feito.</p>

      <Contas store={store} today={today} />

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar tarefa' : 'Nova tarefa'}>
        {edit && <TaskForm task={edit.id ? edit : null} st={st} onClose={() => setEdit(null)} reload={reload} />}
      </Sheet>
      <Sheet open={cleaner} onClose={() => setCleaner(false)} title="Dia da faxineira">
        {cleaner && <CleanerForm st={st} onClose={() => setCleaner(false)} reload={reload} />}
      </Sheet>
    </div>
  );
}
