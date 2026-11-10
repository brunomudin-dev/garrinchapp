import { createClient } from 'npm:@supabase/supabase-js@2';
import { guessCategory, productKey, prettyName } from './categories.js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const CATS = ['Hortifrúti', 'Carnes e peixes', 'Frios', 'Laticínios e ovos', 'Padaria', 'Mercearia', 'Bebidas', 'Congelados', 'Limpeza', 'Higiene', 'Pet', 'Farmácia', 'Casa e utilidades', 'Outros'];
const MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest'];

const PROMPT = `Você recebe a foto de um cupom fiscal brasileiro (NFC-e / cupom de supermercado ou farmácia) OU o print de um pedido de compra online (Amazon, Mercado Livre, Shopee, e-mail de confirmação).
Extraia os dados com precisão. Regras:
- items: um por linha de produto do cupom. "raw_name" = descrição exatamente como impressa (maiúsculas, abreviações). "name" = nome legível em português (ex.: "Detergente Ypê Neutro 500 ml").
- qty = quantidade (pode ser decimal para KG). unit = UN, KG, L, etc. unit_price e total em reais (número com ponto decimal).
- Se houver desconto em um item, use o total líquido do item.
- category: escolha uma de: ${CATS.join(', ')}.
- store_name: nome fantasia do estabelecimento (ou o site, ex.: "Amazon"). cnpj se visível.
- Ignore frete, taxas e descontos gerais como itens; o total pago deve incluí-los.
- purchased_at: data e hora da emissão no formato YYYY-MM-DDTHH:MM:SS (horário de Brasília). Se não legível, deixe vazio.
- total: valor total pago (Valor a pagar).
- Se a imagem não for um cupom nem um pedido de compra, retorne items vazio.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    store_name: { type: 'STRING' }, cnpj: { type: 'STRING' }, purchased_at: { type: 'STRING' }, total: { type: 'NUMBER' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { raw_name: { type: 'STRING' }, name: { type: 'STRING' }, qty: { type: 'NUMBER' }, unit: { type: 'STRING' }, unit_price: { type: 'NUMBER' }, total: { type: 'NUMBER' }, category: { type: 'STRING', enum: CATS } },
        required: ['raw_name', 'name', 'total'],
      },
    },
  },
  required: ['items'],
};

async function readReceipt(images: string[], key: string) {
  const parts = [...images.map((d) => ({ inline_data: { mime_type: 'image/jpeg', data: d } })), { text: PROMPT }];
  let lastErr = '';
  for (const m of MODELS) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA } }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      const t = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '{}';
      return JSON.parse(t);
    }
    lastErr = `${m}: ${r.status} ${j?.error?.message || ''}`;
    if (r.status === 429) throw new Error('Limite gratuito da IA atingido por agora. Tente em 1 minuto.');
    if (r.status === 400 && /API key/i.test(j?.error?.message || '')) throw new Error('Chave do Gemini inválida. Confira nos Ajustes do Supabase.');
  }
  throw new Error('IA indisponível (' + lastErr + ')');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const key = Deno.env.get('GEMINI_API_KEY');
    if (!key) return json({ error: 'Falta configurar a chave gratuita do Gemini (GEMINI_API_KEY).' }, 500);
    const { images, payment, source } = await req.json();
    if (!Array.isArray(images) || !images.length) return json({ error: 'Envie a foto da notinha.' }, 400);
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    });
    const { data: hh } = await sb.rpc('my_household');
    if (!hh) return json({ error: 'Sessão inválida.' }, 401);

    const r = await readReceipt(images.slice(0, 4), key);
    const items = (r.items || []).filter((i: { raw_name?: string; total?: number }) => i.raw_name && i.total != null);
    if (!items.length) return json({ error: 'Não encontrei itens nessa foto. Tente uma foto mais próxima, bem iluminada e com a notinha esticada.' }, 422);

    let purchased_at = new Date().toISOString();
    if (r.purchased_at && /^\d{4}-\d{2}-\d{2}/.test(r.purchased_at)) {
      const s = r.purchased_at.length === 10 ? r.purchased_at + 'T12:00:00' : r.purchased_at.slice(0, 19);
      const d = new Date(s + '-03:00');
      if (!isNaN(+d) && d.getTime() < Date.now() + 86400000) purchased_at = d.toISOString();
    }
    const total = r.total ?? +items.reduce((a: number, i: { total: number }) => a + (i.total || 0), 0).toFixed(2);

    // evita duplicata (mesma loja, mesmo horário, mesmo total)
    const { data: dup } = await sb.from('purchases').select('id').eq('purchased_at', purchased_at).eq('total', total).maybeSingle();
    if (dup) return json({ purchase_id: dup.id, duplicate: true });

    const { data: purchase, error: pErr } = await sb.from('purchases').insert({
      store_name: r.store_name ? prettyName(r.store_name) : null, store_cnpj: r.cnpj || null,
      purchased_at, total, payment: payment || null, source: source || 'foto',
    }).select().single();
    if (pErr) throw pErr;

    const keys = [...new Set(items.map((i: { raw_name: string }) => productKey(i.raw_name)))] as string[];
    const { data: existing } = await sb.from('products').select('id,key').in('key', keys);
    const map = new Map((existing || []).map((p) => [p.key, p.id]));
    const toCreate = keys.filter((k) => !map.has(k)).map((k) => {
      const it = items.find((i: { raw_name: string }) => productKey(i.raw_name) === k);
      const cat = CATS.includes(it.category) && it.category !== 'Outros' ? it.category : guessCategory(it.raw_name);
      return { key: k, name: it.name || prettyName(it.raw_name), category: cat };
    });
    if (toCreate.length) {
      const { data: created, error: cErr } = await sb.from('products').insert(toCreate).select('id,key');
      if (cErr) throw cErr;
      for (const p of created || []) map.set(p.key, p.id);
    }
    const { error: iErr } = await sb.from('purchase_items').insert(items.map((i: Record<string, unknown>) => {
      const qty = Number(i.qty) || 1;
      const tot = Number(i.total);
      return {
        purchase_id: purchase.id, product_id: map.get(productKey(i.raw_name as string)) || null,
        raw_name: i.raw_name, qty, unit: (i.unit as string)?.toUpperCase() || null,
        unit_price: i.unit_price != null ? Number(i.unit_price) : +(tot / qty).toFixed(4), total: tot,
      };
    }));
    if (iErr) throw iErr;
    return json({ purchase_id: purchase.id, items: items.length, total, store: purchase.store_name });
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 500);
  }
});
