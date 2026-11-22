import { useState } from 'preact/hooks';
import { Sheet, toast } from '../ui.jsx';
import { sb } from '../data.js';
import { PendingForm } from './pendencias.jsx';
import { ItemForm } from './listas.jsx';

/** Botão "+" flutuante: anotar rápido de qualquer tela. */
export function QuickAdd({ store, today, go }) {
  const [mode, setMode] = useState(null);
  const [txt, setTxt] = useState('');
  const close = () => { setMode(null); setTxt(''); };
  const addMarket = async () => {
    const names = txt.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
    if (!names.length) return toast('Escreva o item');
    const { error } = await sb.from('shopping_list').insert(names.map((name) => ({ name, source: 'manual' })));
    if (error) return toast('Erro: ' + error.message);
    toast(names.length > 1 ? `🛒 ${names.length} itens na lista` : `🛒 ${names[0]} na lista`);
    close(); store.reload();
  };
  const titles = { menu: 'Anotar rápido', pend: 'Nova pendência', mercado: 'Lista do mercado', dica: 'Anotar uma dica' };
  return (
    <>
      <button class="fab" aria-label="Anotar rápido" onClick={() => setMode('menu')}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      </button>
      <Sheet open={!!mode} onClose={close} title={titles[mode] || ''}>
        {mode === 'menu' && (
          <div class="quick">
            <button onClick={() => setMode('pend')}><span>📌</span><b>Pendência</b><small>Algo pra resolver</small></button>
            <button onClick={() => setMode('mercado')}><span>🛒</span><b>Mercado</b><small>Item pra comprar</small></button>
            <button onClick={() => setMode('dica')}><span>🎬</span><b>Dica</b><small>Filme, lugar, receita, livro</small></button>
            <button onClick={() => { close(); go('agenda', 'novo'); }}><span>📅</span><b>Evento</b><small>Algo na agenda</small></button>
          </div>
        )}
        {mode === 'pend' && <PendingForm item={null} store={store} today={today} onClose={close} />}
        {mode === 'mercado' && (
          <div>
            <label class="f"><span>O que comprar? (separe com vírgula)</span>
              <input autoFocus value={txt} onInput={(e) => setTxt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addMarket()} placeholder="Ex.: leite, pão, ração" /></label>
            <button class="btn block" onClick={addMarket}>Adicionar à lista</button>
          </div>
        )}
        {mode === 'dica' && store.st.lists?.length > 0 && <ItemForm item={null} list={store.st.lists[0]} store={store} onClose={close} />}
      </Sheet>
    </>
  );
}
