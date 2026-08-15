# PRD — Santa Fe v1 (Depósito de Gás, João Pessoa)

## Problema original
Site responsivo (PWA) para pedidos de botijão P13 e água mineral 20L. Cliente escolhe produto, preenche dados e é redirecionado ao WhatsApp da loja com mensagem pronta. Login Google (Emergent) para cliente (histórico + fidelidade + endereço salvo) e admin (painel com whitelist).

## Arquitetura
- Frontend: React + Tailwind + Shadcn, mobile-first (max-w-md), PWA manifest. Fontes: Manrope/Figtree. Paleta azul (#0284c7) + laranja (#f97316).
- Backend: FastAPI + MongoDB (collections: users, user_sessions, products, orders, settings).
- Auth: Emergent-managed Google Auth (cookie httpOnly session_token, 7 dias).
- ViaCEP para autocomplete de endereço; wa.me para envio de pedido.
- Timezone loja: America/Fortaleza.

## Escolhas do usuário
- Preços seed: P13 R$110, Água 20L R$12 (admin edita)
- WhatsApp placeholder: 5583999999999 (admin edita)
- Horário: Seg–Sáb 07–18h, Dom 07–12h
- Admin: santafedistribuidoradeglp@gmail.com (ADMIN_EMAILS em backend/.env)
- Desconto fidelidade: 10% default (admin edita %)

## Implementado (jun/2026)
- Home com 2 produtos, banner loja fechada, cartão fidelidade (logado)
- Fluxo de pedido: quantidade → formulário (ViaCEP, bloqueio fora de João Pessoa, pagamento dinheiro/PIX/cartão) → resumo → WhatsApp (wa.me com mensagem formatada) + fallback tel:
- Debounce/anti-duplo-clique no envio; pedido registrado no banco (guest ou logado)
- Fidelidade: a cada 10 pedidos o 11º marcado com desconto (flag na mensagem WhatsApp 🎁)
- Meus Pedidos: histórico + cartão de selos 1–10
- Admin (/admin): tabs Pedidos (status enviado/em_entrega/entregue/cancelado), Produtos (CRUD), Clientes (contagem pedidos), Config (WhatsApp, horários, % fidelidade)
- Endereço/telefone salvos no perfil ao pedir logado
- Testes: backend 16/16 pass (/app/backend/tests/backend_test.py); E2E frontend ok; bug de overlay do botão qty corrigido (transform do fade-up quebrava fixed)

## Backlog priorizado
- P0: nenhum pendente
- P1: aplicar % de desconto no valor total do 11º pedido (hoje só flag/aviso); ícones PWA reais (192/512px)
- P2: pagamento online (PIX/gateway), push notifications, rastreamento entregador, programa de indicação, API oficial WhatsApp Business

## Notas
- Auth playbook de teste: /app/auth_testing.md
- Credenciais de teste: /app/memory/test_credentials.md
