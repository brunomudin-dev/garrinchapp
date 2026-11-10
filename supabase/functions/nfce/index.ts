import { createClient } from 'npm:@supabase/supabase-js@2';
import { parseNfce, keyFromUrl } from './nfce-parse.js';
import { guessCategory, productKey, prettyName } from './categories.js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { url, payment } = await req.json();
    if (!url || !/^https?:\/\//.test(url)) return json({ error: 'Link do QR Code inválido.' }, 400);
    const key = keyFromUrl(url);
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    });
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: hh } = await sb.rpc('my_household');
    if (!hh) return json({ error: 'Sessão inválida.' }, 401);

    if (key) {
      const { data: dup } = await sb.from('purchases').select('id').eq('nfce_key', key).maybeSingle();
      if (dup) return json({ purchase_id: dup.id, duplicate: true });
    }

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      redirect: 'follow',
    });
    const buf = new Uint8Array(await res.arrayBuffer());
    let html = new TextDecoder('utf-8').decode(buf);
    if (/charset=(iso-8859-1|windows-1252)/i.test(html) || html.includes('�')) html = new TextDecoder('windows-1252').decode(buf);

    const parsed = parseNfce(html);
    if (!parsed.items.length) {
      await admin.from('nfce_debug').insert({ household_id: hh, url, status: res.status, html: html.slice(0, 200000) });
      return json({ error: 'Não consegui ler os itens dessa nota. Já guardei a página pra ajustar o leitor. Tente de novo mais tarde ou lance a compra manualmente.', status: res.status }, 422);
    }

    const { data: purchase, error: pErr } = await sb.from('purchases').insert({
      store_name: parsed.store_name, store_cnpj: parsed.store_cnpj,
      purchased_at: parsed.purchased_at || new Date().toISOString(),
      total: parsed.total, payment: payment || null, source: 'nfce', nfce_key: key, nfce_url: url,
    }).select().single();
    if (pErr) throw pErr;

    // produtos
    const keys = [...new Set(parsed.items.map((i) => productKey(i.raw_name)))];
    const { data: existing } = await sb.from('products').select('id,key').in('key', keys);
    const map = new Map((existing || []).map((p) => [p.key, p.id]));
    const toCreate = keys.filter((k) => !map.has(k)).map((k) => {
      const raw = parsed.items.find((i) => productKey(i.raw_name) === k)!.raw_name;
      return { key: k, name: prettyName(raw), category: guessCategory(raw) };
    });
    if (toCreate.length) {
      const { data: created, error: cErr } = await sb.from('products').insert(toCreate).select('id,key');
      if (cErr) throw cErr;
      for (const p of created || []) map.set(p.key, p.id);
    }
    const { error: iErr } = await sb.from('purchase_items').insert(parsed.items.map((i) => ({
      purchase_id: purchase.id, product_id: map.get(productKey(i.raw_name)) || null,
      raw_name: i.raw_name, code: i.code, qty: i.qty, unit: i.unit, unit_price: i.unit_price, total: i.total,
    })));
    if (iErr) throw iErr;
    return json({ purchase_id: purchase.id, items: parsed.items.length, total: parsed.total, store: parsed.store_name });
  } catch (e) {
    return json({ error: 'Erro ao importar a nota: ' + ((e as Error).message || e) }, 500);
  }
});
