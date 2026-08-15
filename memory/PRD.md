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
- Landing page baseada no HTML de referência do usuário: hero escuro "Gás e água na sua casa!", nav (Início/Produtos/Promoções/Sobre/Contato), seção promoções, sobre, contato com mapa Google embed, footer, botão WhatsApp flutuante
- Dados reais: WhatsApp 5583999170131, horário todos os dias 07–19h, endereço Rua Herotildes Bulhões Pinheiros 166 Cidade Verde, Instagram @santafedistribuidora
- 3 produtos: Gás P13 Supergasbras R$120 (R$125 cartão), Água Sublime R$17, Água Itacoatiara R$15 — visuais desenhados em CSS (sem fotos; campos image_url prontos p/ quando o usuário enviar logo/fotos)
- Produto ganhou campos: card_price, description, tag, visual (admin edita tudo)
- Fluxo de pedido usa card_price quando pagamento = cartão
- Home com 2 produtos, banner loja fechada, cartão fidelidade (logado)
- Fluxo de pedido: quantidade → formulário (ViaCEP, bloqueio fora de João Pessoa, pagamento dinheiro/PIX/cartão) → resumo → WhatsApp (wa.me com mensagem formatada) + fallback tel:
- Debounce/anti-duplo-clique no envio; pedido registrado no banco (guest ou logado)
- Fidelidade: a cada 10 pedidos o 11º marcado com desconto (flag na mensagem WhatsApp 🎁)
- Meus Pedidos: histórico + cartão de selos 1–10
- Admin (/admin): tabs Pedidos (status enviado/em_entrega/entregue/cancelado), Produtos (CRUD com card_price/descrição/etiqueta), Clientes (contagem pedidos), Config (WhatsApp, horários, % fidelidade)
- Endereço/telefone salvos no perfil ao pedir logado
- Testes: backend 16/16 pass (/app/backend/tests/backend_test.py); E2E frontend ok; bug de overlay do botão qty corrigido (transform do fade-up quebrava fixed)

## Atualizações (jun/2026 — indicação, cupons, comércios, auth telefone)
- Auth: clientes/comércios usam telefone+senha (bcrypt, brute force 5 tent./15min por telefone, cookie session_token). Google agora EXCLUSIVO para admin (whitelist; outros emails recebem 403). Página /entrar com tabs Entrar/Cadastrar e tipo Cliente/Comércio
- Indique e Ganhe: desbloqueado após comprar 1 P13 logado; link ?ref=CODIGO + QR code (backend qrcode) + botão compartilhar WhatsApp em Meus Pedidos; cada compra de P13 pelo link credita R$5 (settings.referral_credit_value, editável no admin) ao indicador; auto-indicação bloqueada; crédito usado quando o cliente quiser (checkbox no pedido, abatido do total e refletido na mensagem)
- Cupons: admin CRUD (código, fixo/percentual, só-primeira-compra, ativo); cliente aplica no formulário. Cupom de exemplo BEMVINDO (R$10 fixo) criado — admin pode editar/excluir
- Comércios: cadastro com foto de fachada (Emergent Object Storage, POST /api/upload/facade + GET /api/files/...), status pendente→aprovado/recusado pelo admin; vitrine pública /comercios (só aprovados); pedido de comércio = "preço a combinar" (total 0, price_negotiable, crédito informado na mensagem)
- Pedir novamente: botão em Meus Pedidos prefill do pedido anterior e pula pro resumo
- Foto do depósito na seção Sobre (com logo sobreposta)
- Testes: iteração 2 — 14/15 backend pass; 3 bugs corrigidos e verificados: brute force (identifier por telefone, 429 OK), Google 403 p/ não-admin, UI de cupom/crédito que havia sido perdida em corrupção de arquivo (re-adicionada, testada E2E: R$120−R$10=R$110)

## Pendente do usuário
- Foto do depósito (deposito.jpeg) — opcional, pode substituir/complementar o card da seção Sobre
- Desconto automático no valor do 11º pedido — usuário pediu para deixar por último

## Atualizações (jun/2026 — logo)
- Logo real aplicada: header e footer usam /images/logo-mark.png (só o desenho, recortado da logo via PIL); seção Sobre mostra logo completa (/images/logo-full.jpeg)
- PWA: ícones 192/512 gerados do desenho da logo, manifest.json atualizado, favicon.png, apple-touch-icon, título e theme-color (#0c2d48) no index.html
- Painel admin: polling a cada 20s com toast "novo pedido recebido" + beep sonoro (WebAudio)

## Backlog priorizado
- P0: nenhum pendente
- P1: aplicar % de desconto no valor total do 11º pedido (hoje só flag/aviso); ícones PWA reais (192/512px)
- P2: pagamento online (PIX/gateway), push notifications, rastreamento entregador, programa de indicação, API oficial WhatsApp Business

## Notas
- Auth playbook de teste: /app/auth_testing.md
- Credenciais de teste: /app/memory/test_credentials.md
