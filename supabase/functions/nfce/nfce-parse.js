// Parser tolerante da página pública de consulta da NFC-e (SEFAZ-MG e layouts padrão)

export function parseBRNumber(s) {
  if (s == null) return null;
  let t = String(s).replace(/[^\d.,-]/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function decode(s) {
  return s
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(Number(d)))
    .replace(/&([a-z]+);/gi, (m, e) => ({ aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', atilde: 'ã', otilde: 'õ', ccedil: 'ç', ecirc: 'ê', ocirc: 'ô', acirc: 'â', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Atilde: 'Ã', Otilde: 'Õ', Ccedil: 'Ç' }[e] || ' '));
}
function text(html) {
  return decode(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' | ')).replace(/\s*\|\s*(\|\s*)*/g, ' | ').replace(/\s+/g, ' ').trim();
}

export function keyFromUrl(url) {
  const m = String(url).match(/(\d{44})/);
  return m ? m[1] : null;
}

export function parseNfce(html) {
  const items = [];
  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const r of rows) {
    const t = text(r);
    if (!/Qtd|Qtde/i.test(t) || !/(Vl|Valor)/i.test(t)) continue;
    const qty = parseBRNumber((t.match(/Qtde?\.?[^:]*:\s*([\d.,]+)/i) || [])[1]);
    const unit = ((t.match(/UN:?\s*\|?\s*([A-Za-z]{1,4})\b/) || [])[1] || '').toUpperCase() || null;
    const unitPrice = parseBRNumber((t.match(/Vl\.?\s*Unit\.?:?\s*\|?\s*(?:R\$)?\s*([\d.,]+)/i) || [])[1]);
    const total = parseBRNumber(
      (t.match(/(?:Valor\s*total\s*R?\$?|Vl\.?\s*Total)\s*:?\s*\|?\s*(?:R\$)?\s*:?\s*([\d.,]+)/i) || [])[1]
    );
    const code = (t.match(/C[óo]digo:?\s*([\w-]+)/i) || [])[1] || null;
    let name = t.split(/\(\s*C[óo]digo|Qtde?|C[óo]digo:/i)[0].replace(/^\|\s*/, '').replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();
    name = name.replace(/^\d+\s*[-.]\s*/, '');
    if (!name || name.length < 2) continue;
    const q = qty ?? 1;
    items.push({
      raw_name: name,
      code,
      qty: q,
      unit,
      unit_price: unitPrice ?? (total != null && q ? +(total / q).toFixed(4) : null),
      total: total ?? (unitPrice != null ? +(unitPrice * q).toFixed(2) : null),
    });
  }

  const full = text(html);
  const cnpj = (full.match(/CNPJ:?\s*\|?\s*([\d./-]{14,18})/i) || [])[1] || null;
  let store = null;
  const before = cnpj ? full.split(/CNPJ/i)[0] : '';
  if (before) {
    const parts = before.split('|').map((s) => s.trim()).filter((s) => s && s.length > 2 && !/consulta|nfc-?e|nota fiscal|documento auxiliar|secretaria|fazenda|portal|voltar|imprimir/i.test(s));
    store = parts[parts.length - 1] || null;
  }
  const dt = full.match(/Emiss[ãa]o:?\s*\|?\s*(\d{2})\/(\d{2})\/(\d{4})\s*\|?\s*(\d{2}):(\d{2})(?::(\d{2}))?/i) || full.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  const purchased_at = dt ? `${dt[3]}-${dt[2]}-${dt[1]}T${dt[4]}:${dt[5]}:${dt[6] || '00'}-03:00` : null;
  const totalM = full.match(/Valor\s*a\s*pagar\s*R?\$?:?\s*\|?\s*(?:R\$)?\s*([\d.,]+)/i) || full.match(/Valor\s*total\s*R?\$?:?\s*\|?\s*(?:R\$)?\s*([\d.,]+)\s*\|?\s*(?:Desconto|Valor a pagar|Forma)/i);
  let total = totalM ? parseBRNumber(totalM[1]) : null;
  if (total == null && items.length) total = +items.reduce((a, i) => a + (i.total || 0), 0).toFixed(2);
  return { store_name: store, store_cnpj: cnpj, purchased_at, total, items };
}
