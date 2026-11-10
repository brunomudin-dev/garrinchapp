# GarrinchApp 🐱

A rotina da casa do Bruno e da Gabi num lugar só: tarefas da casa, remédios e suplementos, lista de compras e gastos de mercado (lidos por foto da notinha).

- Frontend: Preact + Vite, PWA instalável no iPhone (publicado no GitHub Pages)
- Backend: Supabase (banco, login, funções `receipt` e `notify`, agendamento a cada 15 min)
- Leitura de notinha: Gemini (plano gratuito)

Nenhuma senha ou chave secreta fica neste repositório. A chave pública do Supabase é feita pra ficar no app, e os dados são protegidos por regras de acesso (RLS).
