import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { todayStr, nowHM, taskStatus } from './schedule.js';

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret' } });

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

  async function pushTo(userId: string, payload: Record<string, unknown>) {
    const { data: subs } = await admin.from('push_subscriptions').select('*').eq('user_id', userId);
    for (const s of subs || []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: 'high' });
        sent.push(userId);
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('id', s.id);
      }
    }
  }
  async function once(userId: string, kind: string, ref: string, today: string) {
    const { error } = await admin.from('notification_log').insert({ user_id: userId, kind, ref, sent_on: today });
    return !error; // false se já enviado (unique)
  }

  if (testUser) {
    await pushTo(testUser, { title: 'GarrinchApp 🐱', body: 'Miau! As notificações estão funcionando.', url: '/' });
    return json({ ok: true, sent: sent.length });
  }

  const today = todayStr();
  const hm = nowHM();
  const [H, M] = hm.split(':').map(Number);
  const nowMin = H * 60 + M;

  const { data: profiles } = await admin.from('profiles').select('id, household_id, display_name');
  const { data: subsAll } = await admin.from('push_subscriptions').select('user_id');
  const withSubs = new Set((subsAll || []).map((s) => s.user_id));

  for (const p of profiles || []) {
    if (!withSubs.has(p.id)) continue;
    const [{ data: hh }, { data: meds }, { data: medLogs }, { data: tasks }] = await Promise.all([
      admin.from('households').select('*').eq('id', p.household_id).single(),
      admin.from('meds').select('*').eq('owner_id', p.id).eq('active', true),
      admin.from('med_logs').select('med_id').eq('household_id', p.household_id).eq('log_date', today),
      admin.from('tasks').select('*').eq('household_id', p.household_id).eq('active', true),
    ]);
    const taken = new Set((medLogs || []).map((l) => l.med_id));

    // 1) Remédio/suplemento no horário cadastrado
    for (const m of meds || []) {
      if (!m.time_of_day || taken.has(m.id)) continue;
      const [mh, mm] = m.time_of_day.split(':').map(Number);
      const t = mh * 60 + mm;
      if (nowMin >= t && nowMin - t < 120 && (await once(p.id, 'med', m.id, today))) {
        await pushTo(p.id, { title: `${m.kind === 'remedio' ? '💊' : '🥤'} Hora do ${m.name}`, body: m.dose ? `Dose: ${m.dose}. Toque pra dar o check.` : 'Toque pra dar o check.', url: '/?tab=hoje', tag: 'med-' + m.id });
      }
    }

    // 2) Resumos das 8h e 19h
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
      const pendingMeds = (meds || []).filter((m) => {
        if (taken.has(m.id)) return false;
        if (slot === '08' && m.time_of_day) { const [a, b] = m.time_of_day.split(':').map(Number); return a * 60 + b <= nowMin; }
        return slot === '19';
      });
      if ((pendingTasks.length || pendingMeds.length) && (await once(p.id, 'summary', slot, today))) {
        const parts: string[] = [];
        if (pendingMeds.length) parts.push('💊 ' + pendingMeds.map((m) => m.name).join(', '));
        if (pendingTasks.length) parts.push('🏠 ' + pendingTasks.map((t) => t.name).join(', '));
        await pushTo(p.id, {
          title: slot === '08' ? `Bom dia, ${p.display_name}! Pra hoje:` : `Ainda falta, ${p.display_name}:`,
          body: parts.join('\n'), url: '/?tab=hoje', tag: 'summary-' + slot,
        });
      }
    }
  }
  return json({ ok: true, at: hm, sent: sent.length });
});
