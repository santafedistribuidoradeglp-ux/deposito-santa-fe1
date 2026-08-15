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

## Atualizações (jun/2026 — notificações, senha, extrato, selo)
- Notificação de indicação: toast + registro quando alguém compra pelo link (GET /api/referral/notifications, marca visto)
- Extrato de créditos: collection credit_ledger (ganho/uso), GET /api/referral/ledger, UI expansível no ReferralCard
- Recuperar senha via WhatsApp: /api/auth/forgot gera código 6 dígitos (30min) + link wa.me; admin vê códigos pendentes na aba Clientes com botão "Enviar no WhatsApp"; /api/auth/reset valida e troca senha. Testado E2E
- Selo "Parceiro Santa Fé": página /selo imprimível (window.print) com QR do link de indicação; comércio aprovado ganha referral_unlocked automático
- Suporte respondido: código via Save to GitHub; site testável pelo preview URL ou deploy (não roda de pasta local)

## Atualizações (jun/2026 — carrinho, relatório, ranking, deploy-ready)
- Carrinho multi-produto: passo 1 do pedido virou "Monte seu pedido" com steppers para todos os produtos ativos (gás + águas juntos); resumo lista todos os itens; "Pedir novamente" restaura todas as quantidades. Testado E2E (1x P13 + 2x Água = R$154 ✓)
- Relatório de vendas: aba "Resumo" no admin (padrão ao abrir) — últimos 7 dias: pedidos, faturamento (+ contagem "a combinar"), novos clientes, créditos dados, produtos mais vendidos (GET /api/admin/report?days=7)
- Ranking de indicadores: top 20 por indicações com total ganho (GET /api/admin/referral-ranking, query batched com $in)
- Deploy: deployment_agent = PASS (sem bloqueadores); .gitignore exclui test_credentials; usuário instruído a clicar em Deploy na plataforma

## Atualizações (jun/2026 — roleta, fidelidade 5+1, filtros, cron mensal)
- Roleta da sorte na Home (acima de Nossos Produtos): 5 itens 20% cada (Gire novamente / Tente mais tarde / R$5 gás / R$10 gás / R$2 água); 1 giro/24h (contador regressivo; "Gire novamente" libera novo giro); prêmios viram cupons pessoais single_use com escopo de produto (p13/agua); exige login. Endpoints: GET /api/roulette/status, POST /api/roulette/spin (429 no cooldown)
- Fidelidade mudou: a cada 5 pedidos, o 6º tem R$10 OFF automático (settings.loyalty_discount_value, editável); NÃO combinável com cupom/crédito (backend 400 + frontend esconde campos e mostra banner). Testado: R$120→R$110 ✓, combinação bloqueada ✓
- Cupons ganharam campos: product_scope (p13/agua), owner_user_id, single_use/used (marcado usado após pedido)
- Filtro de pedidos no admin: chips de status + intervalo de datas (client-side)
- Prêmio mensal do ranking: cron plataforma (.emergent/crons.yml, dia 1 03h UTC) chama POST /api/cron/ranking-bonus (Bearer WEBHOOK_CRON_SECRET, idempotente por run_id, BackgroundTasks) → nº1 de indicações do mês anterior ganha settings.ranking_bonus_value (R$10, editável no admin) + ledger + notificação. Endpoint testado manualmente ✓
- Aviso "Fechamos em X minutos" (≤30min do fechamento) no topo da Home (settings.closing_soon/minutes_to_close)
- Layout centralizado: hero e cabeçalhos de seção centrados
- Instagram corrigido: @_santafedistribuidora (com underscore)
- Imagens reais dos produtos: busca em stock (Pexels/Unsplash) não retornou fotos adequadas de botijão P13/galão 20L — mantidos os desenhos CSS; usuário pode enviar fotos reais (campo URL da foto no admin)

## Atualizações (jun/2026 — fotos reais, cupom na home, promo editável, admin por telefone)
- Fotos reais dos produtos aplicadas (enviadas pelo usuário): /images/gas-p13.jpg, agua-sublime.jpeg, agua-itacoatiara.png — exibidas com object-contain (fundo branco) na Home e no carrinho
- Roleta REMOVIDA a pedido do usuário (componente + endpoints); no lugar, seção "Tem um cupom?" abaixo dos produtos: valida via POST /api/coupons/validate e salva em localStorage sf_coupon → pré-preenchido no checkout (removido ao aplicar)
- Faixa de promoções editável: settings.promo_title/promo_text (campos no admin Config), Home lê das settings
- Admin por telefone: 83988331044 / santafe2026 (role admin, login em /entrar) — atualizado em test_credentials.md

## Atualizações (jun/2026 — trocar senha + faixa entrega grátis)
- Trocar senha no perfil: POST /api/auth/change-password (auth, exige senha atual, só contas telefone); card expansível "Trocar senha" em /meus-pedidos. Testado E2E (troca + login com nova senha + rejeição de senha atual errada)
- Faixa destaque laranja abaixo do hero: "ENTREGA GRÁTIS* · INSTALAÇÃO GRÁTIS · CUPONS GRÁTIS" com nota pequena "*exceto Gás do Povo, que tem entrega cobrada"; bullet do hero atualizado para "Entrega grátis e rápida"
- Sem taxa de entrega (confirmado pelo usuário — não implementar cobrança por bairro)

## Atualizações (jun/2026 — Gás do Povo + fidelidade 3/3)
- Fidelidade: agora 3 pedidos → ao completar 3/3 gera automaticamente cupom pessoal FIELxxxx de R$10 (settings.loyalty_discount_value, editável no admin); 4º pedido (resgate) zera o ciclo (count % 4); UI mostra X/3 "cupom grátis" sem exibir valor na barra; card fidelidade da Home reposicionado (removido -mt-6/z-10 que sobrepunha)
- Produto "Gás do Povo" (4º card, imagem enviada pelo usuário): mostra "Taxa de entrega R$20"; 1ª compra logada aplica cupom automático GASDOPOVO10 (R$10, editável na aba Cupons, scope gasdopovo) → entrega por R$10, marcado gdp_first_used; formulário exige CPF quando gdp no carrinho; mensagem WhatsApp destaca "*PEDIDO GÁS DO POVO — verificar benefício/CPF*" + CPF + item como taxa de entrega
- Seção "Promoções" substituída por seção "Gás do Povo" abaixo do hero: 2 accordions (o que é / quem pode receber, com aviso de que a seleção é do Governo), link externo gasdopovo.mds.gov.br, botão central "Já tenho o benefício, quero solicitar" que rola e destaca o card do produto; nav/footer atualizados
- "Tem um cupom?" movido para ACIMA dos produtos; produtos em grade 2x2 na ordem: P13, Gás do Povo, Água Itacoatiara, Água Sublime (campo sort_order)
- Testes: iteração 3 (8/8 backend + frontend 100%) e iteração 4 (10/10, revalidação da mensagem WhatsApp sem emoji corrompido e sem texto legado "6º pedido")

## Atualizações (jun/2026 — cores GDP/cupom, portaria, ícone carrinho)
- Seção Gás do Povo recolorida: gradiente verde (emerald→green) com kicker e CTA amarelos (identidade do programa do Governo)
- "Tem um cupom?" recolorido: card azul-marinho (#0c2d48) com badge laranja e glow
- Ícone do "Pedir agora" trocado de balão (MessageCircle) para carrinho (ShoppingCart)
- Botão "Portaria" abaixo de Pedir agora em cada card: preço vem do campo pickup_price do produto (editável no admin; vazio = Grátis). Valores atuais: Gás R$100 / Águas R$10 / GDP Grátis; clique rola até #contato (Google Maps) para o cliente se dirigir à portaria
- card_price do Gás P13 removido (DB null) — mostra e cobra só R$120

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
