import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { todayStr, nowHM, taskStatus, addDays, diffDays, weekday } from './schedule.js';

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret' } });

const tmin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0); };
const dm = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const plural = (n: number, a: string, b: string) => (n === 1 ? a : b);

function dueDate(day: number, ym: string) {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ym}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: cfg } = await admin.rpc('get_private_config');
  const body = await req.json().catch(() => ({}));

  // Autorização: cron (segredo) ou usuário logado pedindo notificação de teste
  let testUser: string | null = null;
  if (req.headers.get('x-cron-secret') !== cfg.cron_secret) {
    const auth = req.headers.get('Authorization') || '';
    const { data: u } = await admin.auth.getUser(auth.replace('Bearer ', ''));
    if (!u?.user || body.mode !== 'test') return json({ error: 'unauthorized' }, 401);
    testUser = u.user.id;
  }

  webpush.setVapidDetails('mailto:garrinchapp@example.com', cfg.vapid_public, cfg.vapid_private);
  const sent: string[] = [];
  const errors: string[] = [];

  // Envia para todos os aparelhos do usuário e registra o resultado em push_log
  async function pushTo(userId: string, payload: Record<string, unknown>, kind: string) {
    const { data: subs } = await admin.from('push_subscriptions').select('*').eq('user_id', userId);
    if (!subs?.length) {
      await admin.from('push_log').insert({ user_id: userId, kind, ok: false, status: 0, detail: 'nenhum aparelho inscrito' });
      return { delivered: 0, retryable: false };
    }
    let delivered = 0;
    let retryable = false;
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: 'high' });
        sent.push(userId);
        delivered++;
        await admin.from('push_log').insert({ user_id: userId, kind, ok: true, status: 201 });
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode ?? 0;
        const detail = String((e as { body?: string }).body || (e as Error).message || e).slice(0, 300);
        errors.push(`${code}: ${detail}`);
        await admin.from('push_log').insert({ user_id: userId, kind, ok: false, status: code, detail });
        if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('id', s.id);
        else if (code === 0 || code === 429 || code >= 500) retryable = true;
      }
    }
    return { delivered, retryable };
  }

  // Garante um único aviso por usuário/tipo/ref/dia; se o envio falhar por motivo temporário, libera para tentar de novo
  async function notifyOnce(userId: string, kind: string, ref: string, today: string, payload: Record<string, unknown>) {
    const { error } = await admin.from('notification_log').insert({ user_id: userId, kind, ref, sent_on: today });
    if (error) return;
    const r = await pushTo(userId, payload, kind);
    if (!r.delivered && r.retryable) await admin.from('notification_log').delete().match({ user_id: userId, kind, ref, sent_on: today });
  }

  if (testUser) {
    await pushTo(testUser, { title: 'GarrinchApp 🐱', body: 'Miau! As notificações estão funcionando.', url: '/' }, 'test');
    return json({ ok: true, sent: sent.length, errors });
  }

  const today = todayStr();
  const hm = nowHM();
  const [H, M] = hm.split(':').map(Number);
  const nowMin = H * 60 + M;
  const wd = weekday(today);

  // Faxina de dados antigos, uma vez por noite
  if (H === 3 && M < 5) {
    await admin.from('push_log').delete().lt('created_at', new Date(Date.now() - 30 * 86400000).toISOString());
    await admin.from('notification_log').delete().lt('sent_on', addDays(today, -60));
  }

  async function once(userId: string, kind: string, ref: string, d: string) {
    const { error } = await admin.from('notification_log').insert({ user_id: userId, kind, ref, sent_on: d });
    return !error;
  }

  const { data: profiles } = await admin.from('profiles').select('id, household_id, display_name');
  const { data: subsAll } = await admin.from('push_subscriptions').select('user_id');
  const withSubs = new Set((subsAll || []).map((s) => s.user_id));

  const households = [...new Set((profiles || []).map((p) => p.household_id))];
  for (const hid of households) {
    const members = (profiles || []).filter((p) => p.household_id === hid && withSubs.has(p.id));
    if (!members.length) continue;

    const ymPrev = addDays(today.slice(0, 7) + '-15', -30).slice(0, 7);
    const ymNext = addDays(today.slice(0, 7) + '-15', 30).slice(0, 7);
    const [{ data: hh }, { data: allMeds }, { data: medLogs }, { data: tasks }, { data: bills }, { data: payments }, { data: habits }, { data: habitLogs }, { data: events }] = await Promise.all([
      admin.from('households').select('*').eq('id', hid).single(),
      admin.from('meds').select('*').eq('household_id', hid).eq('active', true),
      admin.from('med_logs').select('med_id').eq('household_id', hid).eq('log_date', today),
      admin.from('tasks').select('*').eq('household_id', hid).eq('active', true),
      admin.from('bills').select('*').eq('household_id', hid).eq('active', true),
      admin.from('bill_payments').select('bill_id, ym').eq('household_id', hid).in('ym', [ymPrev, today.slice(0, 7), ymNext]),
      admin.from('habits').select('*').eq('household_id', hid).eq('active', true),
      admin.from('habit_logs').select('habit_id, amount').eq('household_id', hid).eq('log_date', today),
      admin.from('events').select('*').eq('household_id', hid).eq('alert', true).gte('start_date', today).lte('start_date', addDays(today, 120)),
    ]);
    const taken = new Set((medLogs || []).map((l) => l.med_id));
    const paid = new Set((payments || []).map((p) => `${p.bill_id}|${p.ym}`));

    // Contas com vencimento próximo ou atrasadas (até 3 dias), ainda não pagas
    const billsDue: { b: Record<string, any>; due: string; diff: number }[] = [];
    for (const b of bills || []) {
      if (!b.due_day) continue;
      for (const ym of [ymPrev, today.slice(0, 7), ymNext]) {
        if (paid.has(`${b.id}|${ym}`)) continue;
        const due = dueDate(b.due_day, ym);
        const diff = diffDays(due, today);
        if (diff <= (b.alert_days ?? 3) && diff >= -3) billsDue.push({ b, due, diff });
      }
    }

    // Eventos já avisados alguma vez (para o caso de o alerta ter ficado para trás)
    const evIds = (events || []).map((e) => e.id);
    const { data: evSent } = evIds.length ? await admin.from('notification_log').select('user_id, ref').eq('kind', 'event').in('ref', evIds) : { data: [] };
    const evSentSet = new Set((evSent || []).map((x) => `${x.user_id}|${x.ref}`));

    for (const p of members) {
      // 1) Remédio/suplemento no horário cadastrado, e um lembrete extra 30 min depois se continuar sem check
      for (const m of (allMeds || []).filter((x) => x.owner_id === p.id)) {
        if (!m.time_of_day || taken.has(m.id)) continue;
        const t = tmin(m.time_of_day);
        const late = nowMin - t;
        const ic = m.kind === 'remedio' ? '💊' : '🥤';
        if (late >= 0 && late < 120) {
          await notifyOnce(p.id, 'med', m.id, today, { title: `${ic} Hora do ${m.name}`, body: m.dose ? `Dose: ${m.dose}. Toque pra dar o check.` : 'Toque pra dar o check.', url: '/?tab=hoje', tag: 'med-' + m.id });
        }
        if (late >= 30 && late < 120) {
          await notifyOnce(p.id, 'med2', m.id, today, { title: `${ic} Ainda não marcou: ${m.name}`, body: `Era pras ${m.time_of_day.slice(0, 5)}. Toque pra dar o check.`, url: '/?tab=hoje', tag: 'med-' + m.id });
        }
      }

      // 2) Contas a pagar (a partir das 9h, uma vez por dia por conta, até pagar)
      if (nowMin >= 9 * 60) {
        for (const { b, due, diff } of billsDue) {
          const when = diff > 1 ? `vence em ${diff} dias (${dm(due)})` : diff === 1 ? 'vence amanhã' : diff === 0 ? 'vence hoje' : `venceu há ${-diff} ${plural(-diff, 'dia', 'dias')}`;
          await notifyOnce(p.id, 'bill', `${b.id}:${due.slice(0, 7)}`, today, { title: `${b.icon || '🧾'} ${b.name} ${when}`, body: 'Quando pagar, marque como paga no app.', url: '/?tab=casa', tag: 'bill-' + b.id });
        }
      }

      // 3) Eventos da agenda
      for (const e of events || []) {
        if (e.owner_id && e.owner_id !== p.id) continue;
        const alertDate = addDays(e.start_date, -(e.alert_days ?? 1));
        const at = tmin(e.alert_time || '09:00');
        const days = diffDays(e.start_date, today);
        const rel = days === 0 ? 'hoje' : days === 1 ? 'amanhã' : `em ${days} dias`;
        const hora = e.start_time ? ` às ${e.start_time.slice(0, 5)}` : '';
        const span = e.end_date && e.end_date !== e.start_date ? ` (${dm(e.start_date)} a ${dm(e.end_date)})` : '';
        const due = alertDate < today ? !evSentSet.has(`${p.id}|${e.id}`) && nowMin >= at : alertDate === today && nowMin >= at;
        if (due) {
          await notifyOnce(p.id, 'event', e.id, today, { title: `${e.icon || '📅'} ${e.title}`, body: `É ${rel}${hora}${span}.`, url: '/?tab=agenda', tag: 'event-' + e.id });
        }
        if (e.alert_hours && e.start_time && e.start_date === today) {
          const st = tmin(e.start_time);
          if (nowMin >= st - e.alert_hours * 60 && nowMin < st) {
            await notifyOnce(p.id, 'event2', e.id, today, { title: `${e.icon || '📅'} ${e.title}`, body: `Hoje${hora}.`, url: '/?tab=agenda', tag: 'event-' + e.id });
          }
        }
      }

      // 4) Resumos das 8h e 19h
      const slot = H === 8 ? '08' : H === 19 ? '19' : null;
      if (slot) {
        const ids = (tasks || []).map((t) => t.id);
        const { data: logs } = ids.length ? await admin.from('task_logs').select('task_id, done_on').in('task_id', ids).order('done_on', { ascending: false }) : { data: [] };
        const last = new Map<string, string>();
        for (const l of logs || []) if (!last.has(l.task_id)) last.set(l.task_id, l.done_on);
        const pendingTasks = (tasks || []).filter((t) => {
          if (t.assignee_id && t.assignee_id !== p.id) return false;
          const st = taskStatus(t, last.get(t.id) || null, today, hh);
          return st.status === 'due' || st.status === 'late';
        });
        const pendingMeds = (allMeds || []).filter((m) => {
          if (m.owner_id !== p.id || taken.has(m.id)) return false;
          if (slot === '08' && m.time_of_day) return tmin(m.time_of_day) <= nowMin;
          return slot === '19';
        });
        const doneHabit = new Map((habitLogs || []).map((l) => [l.habit_id, Number(l.amount)]));
        const pendingHabits = (habits || []).filter((h) => {
          if (h.owner_id !== p.id) return false;
          if (h.weekdays && h.weekdays.length && !h.weekdays.includes(wd)) return false;
          const v = doneHabit.get(h.id);
          if (v == null) return true;
          return h.kind === 'count' && h.target ? v < Number(h.target) : false;
        });
        const pendingBills = billsDue.filter((x) => x.diff <= 1);
        if ((pendingTasks.length || pendingMeds.length || pendingHabits.length || pendingBills.length) && (await once(p.id, 'summary', slot, today))) {
          const parts: string[] = [];
          if (pendingMeds.length) parts.push('💊 ' + pendingMeds.map((m) => m.name).join(', '));
          if (pendingHabits.length) parts.push('💪 ' + pendingHabits.map((h) => h.name).join(', '));
          if (pendingTasks.length) parts.push('🏠 ' + pendingTasks.map((t) => t.name).join(', '));
          if (pendingBills.length) parts.push('🧾 ' + pendingBills.map((x) => x.b.name).join(', '));
          const r = await pushTo(p.id, {
            title: slot === '08' ? `Bom dia, ${p.display_name}! Pra hoje:` : `Ainda falta, ${p.display_name}:`,
            body: parts.join('\n'), url: '/?tab=hoje', tag: 'summary-' + slot,
          }, 'summary');
          if (!r.delivered && r.retryable) await admin.from('notification_log').delete().match({ user_id: p.id, kind: 'summary', ref: slot, sent_on: today });
        }
      }
    }
  }

  return json({ ok: true, at: hm, sent: sent.length, errors });
});
