// Categorização automática por palavras-chave (sem custo de IA)
export const CATEGORIES = [
  { name: 'Pet', emoji: '🐱', color: '#EE7F1B', keys: ['RACAO', 'AREIA GAT', 'AREIA SANIT', 'AREIA HIG', 'AREIA', 'SACHE', 'PETISCO', 'WHISKAS', 'FELIX', 'GOLDEN GAT', 'PREMIER', 'GRANPLUS', 'GRAN PLUS', 'PIPICAT', 'KITEKAT', 'FRISKIES', 'PET '] },
  { name: 'Limpeza', emoji: '🧽', color: '#4F8FBF', keys: ['DETERG', 'LAVA LOUCA', 'LAVA ROUP', 'SABAO', 'AMACIANTE', 'AMAC ', 'DESINF', 'AGUA SANIT', 'ALVEJ', 'MULTIUSO', 'MULTI USO', 'ESPONJA', 'LIMPADOR', 'LIMP ', 'SACO LIXO', 'SACO P LIXO', 'SACO PARA LIXO', 'SC LIXO', 'PAPEL TOALHA', 'PAP TOALHA', 'LUSTRA', 'CLORO', 'OMO', 'YPE', 'TIRA MANCHA', 'PANO', 'VEJA', 'PINHO', 'LYSOFORM', 'BOM AR', 'INSETIC', 'LUVA', 'RODO', 'VASSOURA', 'PAPEL ALUM', 'FILME PVC', 'GUARDANAPO'] },
  { name: 'Higiene', emoji: '🧴', color: '#9B7FD1', keys: ['SABONETE', 'SAB LIQ', 'SHAMP', 'CONDICION', 'CREME DENT', 'CR DENT', 'PASTA DENT', 'ESCOVA DENT', 'ESC DENT', 'FIO DENT', 'DESOD', 'PAPEL HIG', 'PAP HIG', 'ABSORV', 'FRALDA', 'HASTE', 'COTONETE', 'ALGODAO', 'BARBEAR', 'APAR BARB', 'GILLETTE', 'ENXAG', 'PROTETOR', 'HIDRAT', 'COLGATE', 'ORAL B', 'LENCO'] },
  { name: 'Congelados', emoji: '🧊', color: '#6CB4C4', keys: ['CONGEL', 'SORVETE', 'PIZZA', 'LASANHA', 'NUGGET', 'POLPA', 'BATATA PALITO', 'EMPANADO', 'ACAI', 'AÇAI'] },
  { name: 'Hortifrúti', emoji: '🥬', color: '#5E9C5A', exact: true, keys: ['BANANA', 'MACA', 'LARANJA', 'LIMAO', 'TOMATE', 'CEBOLA', 'ALHO', 'BATATA', 'CENOURA', 'ALFACE', 'MAMAO', 'MELANCIA', 'MELAO', 'ABACAXI', 'UVA', 'MORANGO', 'PERA', 'MANGA', 'ABOBORA', 'ABOBRINHA', 'BROCOLIS', 'COUVE', 'PIMENTAO', 'PEPINO', 'CHUCHU', 'BETERRABA', 'MANDIOCA', 'AIPIM', 'INHAME', 'RUCULA', 'AGRIAO', 'ESPINAFRE', 'CHEIRO VERDE', 'SALSA', 'COENTRO', 'KIWI', 'ABACATE', 'GENGIBRE', 'BERINJELA', 'VAGEM', 'QUIABO', 'MILHO VERDE', 'HORTIFRUTI', 'FLV'] },
  { name: 'Frios', emoji: '🧀', color: '#E0B33C', keys: ['PRESUNTO', 'PRES ', 'MUSSAR', 'MUCAR', 'MUÇAR', 'QUEIJO', 'QJO', 'PEITO PERU', 'PEITO DE PERU', 'SALAME', 'MORTADELA', 'BLANQUET', 'PROVOLONE', 'PARMESAO', 'RICOTA', 'COTTAGE'] },
  { name: 'Carnes e peixes', emoji: '🥩', color: '#C8553D', keys: ['CARNE', 'FRANGO', 'FGO', 'PEITO', 'COXA', 'SOBRECOXA', 'ASA ', 'PATINHO', 'ALCATRA', 'PICANHA', 'MAMINHA', 'ACEM', 'COSTELA', 'LINGUICA', 'LING ', 'BACON', 'PEIXE', 'TILAPIA', 'SALMAO', 'CAMARAO', 'BOVIN', 'SUIN', 'LOMBO', 'FILE', 'MOIDA', 'HAMBURG', 'CONTRA FILE', 'CONTRAFILE', 'FRALDINHA', 'CUPIM', 'MUSCULO', 'PERNIL', 'BISTECA', 'ALMONDEGA', 'KAFTA'] },
  { name: 'Laticínios e ovos', emoji: '🥛', color: '#7FA7C9', keys: ['LEITE', 'IOGURTE', 'IOG ', 'MANTEIGA', 'MARGARINA', 'REQUEIJ', 'REQ ', 'CREME DE LEITE', 'CR LEITE', 'NATA', 'OVO', 'OVOS', 'COALHADA', 'KEFIR', 'DANONE', 'BEBIDA LACT', 'LEITE FERM', 'YAKULT'] },
  { name: 'Padaria', emoji: '🍞', color: '#C9925B', keys: ['PAO', 'BISNAG', 'TORRADA', 'BOLO', 'BAGUETE', 'CROISSANT', 'ROSCA', 'BROA', 'PAO DE QUEIJO', 'SONHO'] },
  { name: 'Bebidas', emoji: '🥤', color: '#D46A8C', keys: ['CERVEJA', 'CERV ', 'REFRIG', 'REFRI ', 'COCA', 'GUARANA', 'SUCO', 'AGUA MIN', 'AGUA COCO', 'AGUA C/ GAS', 'AGUA S/ GAS', 'AGUA', 'VINHO', 'ENERG', 'ISOTON', 'GATORADE', 'KOMBUCHA', 'SPRITE', 'FANTA', 'PEPSI', 'HEINEKEN', 'BRAHMA', 'SKOL', 'STELLA', 'VODKA', 'GIN ', 'WHISKY', 'CACHACA', 'ESPUMANTE', 'CHOPP'] },
  { name: 'Mercearia', emoji: '🥫', color: '#A88B6A', keys: ['ARROZ', 'FEIJAO', 'MACARRAO', 'MAC ', 'ESPAGUETE', 'AZEITE', 'OLEO', 'ACUCAR', 'ACUC', 'SAL ', 'SAL REF', 'FARINHA', 'FAR ', 'CAFE', 'MOLHO', 'EXTRATO', 'MILHO', 'ERVILHA', 'ATUM', 'SARDINHA', 'BISCOITO', 'BISC', 'BOLACHA', 'CHOCOLATE', 'CHOC', 'AVEIA', 'GRANOLA', 'TEMPERO', 'VINAGRE', 'MAIONESE', 'KETCHUP', 'MOSTARDA', 'GELATINA', 'ACHOC', 'CEREAL', 'PIPOCA', 'AMENDOIM', 'CASTANHA', 'MEL ', 'FUBA', 'POLVILHO', 'TAPIOCA', 'LENTILHA', 'GRAO DE BICO', 'CHA ', 'ADOCANTE', 'LEITE COND', 'CREME DE AVELA', 'NUTELLA', 'GELEIA', 'PALMITO', 'AZEITONA', 'CALDO', 'CATCHUP', 'SHOYU', 'WHEY', 'CREATINA', 'BARRA', 'SALGADINHO', 'BATATA CHIPS', 'DOCE'] },
];

export function normalize(s) {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9/%,. ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function guessCategory(name) {
  const n = ' ' + normalize(name) + ' ';
  // checagem por prioridade (Pet/Limpeza/Higiene antes de alimentos genéricos)
  for (const c of CATEGORIES) {
    for (const k of c.keys) {
      if (n.includes(' ' + k + (c.exact ? ' ' : ''))) return c.name;
    }
  }
  return 'Outros';
}

export function productKey(name) {
  return normalize(name).replace(/\b\d{6,}\b/g, '').replace(/\s+/g, ' ').trim();
}

export function prettyName(name) {
  const n = (name || '').trim().replace(/\s+/g, ' ');
  return n.toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(\d+)(Ml|L|G|Kg|Un)\b/g, (m, a, b) => a + b.toLowerCase());
}
