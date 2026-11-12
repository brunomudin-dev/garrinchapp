import { createClient } from '@supabase/supabase-js';
import { useEffect, useState, useCallback, useRef } from 'preact/hooks';
import { todayStr, addDays } from './lib/schedule.js';

export const SUPABASE_URL = 'https://rajskpsiohysjsduhoqa.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_bSa7P9bxM39XX1Ag3nwXdQ_dSoQbMFk';
export const VAPID_PUBLIC = 'BLBo5t3W-hFHbhO7IzA_kUOGEESSQIra3Rz--qT3EWwIFphDEWqjaQpqvtdftlJMnbq_gHRqhg026Emt_mMO4B0';
export const PAYMENTS = ['Refeição Gabi', 'Inter', 'Outro cartão', 'Pix / dinheiro'];

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'garrinchapp-auth' },
});

async function fetchAll(q) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q().range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

export function useSession() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}

export function useStore(session) {
  const [st, setSt] = useState(null);
  const [today, setToday] = useState(todayStr());
  const loading = useRef(false);

  const load = useCallback(async () => {
    if (!session || loading.current) return;
    loading.current = true;
    try {
      const t = todayStr();
      setToday(t);
      const since = addDays(t, -400);
      const [me, profiles, hh, meds, medLogs, tasks, taskLogs, list, products, purchases, items, bills, billPays, habits, habitLogs, events, complaints, reacts] = await Promise.all([
        sb.from('profiles').select('*').eq('id', session.user.id).single(),
        sb.from('profiles').select('*').order('created_at'),
        sb.from('households').select('*').single(),
        sb.from('meds').select('*').order('sort').order('created_at'),
        sb.from('med_logs').select('*').gte('log_date', addDays(t, -40)),
        sb.from('tasks').select('*').order('sort').order('created_at'),
        fetchAll(() => sb.from('task_logs').select('*').gte('done_on', addDays(t, -180)).order('done_on', { ascending: false })),
        sb.from('shopping_list').select('*').order('created_at'),
        fetchAll(() => sb.from('products').select('*').order('name')),
        fetchAll(() => sb.from('purchases').select('id,store_name,purchased_at,total,payment,source,created_by').gte('purchased_at', since).order('purchased_at', { ascending: false })),
        fetchAll(() => sb.from('purchase_items').select('id,purchase_id,product_id,raw_name,qty,unit,unit_price,total')),
        sb.from('bills').select('*').order('sort').order('created_at'),
        sb.from('bill_payments').select('*').gte('ym', addDays(t, -100).slice(0, 7)),
        sb.from('habits').select('*').order('sort').order('created_at'),
        fetchAll(() => sb.from('habit_logs').select('*').gte('log_date', addDays(t, -120)).order('log_date', { ascending: false })),
        sb.from('events').select('*').order('start_date').order('start_time', { nullsFirst: true }),
        sb.from('complaints').select('*').order('created_at', { ascending: false }).limit(60),
        sb.from('complaint_reactions').select('*'),
      ]);
      for (const r of [me, profiles, hh, meds, medLogs, tasks, list, bills, billPays, habits, events, complaints, reacts]) if (r.error) throw r.error;
      setSt({
        me: me.data, profiles: profiles.data, hh: hh.data, meds: meds.data, medLogs: medLogs.data,
        tasks: tasks.data, taskLogs, list: list.data, products, purchases, items,
        bills: bills.data, billPays: billPays.data, habits: habits.data, habitLogs, events: events.data,
        complaints: complaints.data, reacts: reacts.data,
      });
    } catch (e) {
      console.error(e);
      setSt((s) => s || { error: e.message || String(e) });
    } finally {
      loading.current = false;
    }
  }, [session?.user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!session) return;
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    let timer;
    const ch = sb.channel('casa')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => { clearTimeout(timer); timer = setTimeout(load, 400); })
      .subscribe();
    return () => { document.removeEventListener('visibilitychange', onVis); sb.removeChannel(ch); };
  }, [session?.user?.id, load]);

  return { st, today, reload: load, setSt };
}

export async function callFn(name, body) {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify(body || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || j.message || `Erro ${r.status}`);
  return j;
}

export const brl = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
export const firstName = (s) => (s || '').split(' ')[0];
