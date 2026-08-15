# PRD — Santa Fé Distribuidora de Gás (João Pessoa/PB)

## Problema original
Site/PWA para pedidos de gás e água via WhatsApp. React + FastAPI + MongoDB.
- WhatsApp da loja: 5583999170131 · Horário: todos os dias 7h–19h
- Produtos: Gás P13 Supergasbras R$120, Gás do Povo (taxa entrega R$20, 1ª compra cupom auto R$10), Água Itacoatiara R$15, Água Sublime R$17
- Instagram: _santafedistribuidora · Entrega grátis (exceto Gás do Povo) · Instalação e cupons grátis
- Só entrega em João Pessoa

## Decisões-chave
- Auth: clientes telefone+senha; Google só admin (whitelist). Admin por telefone: 83988331044 (ver test_credentials.md)
- Fidelidade: 3 pedidos → ganha cupom FIELxxxx de R$10 (valor editável no admin), cicla; não combina com cupom/crédito
- Indicação: desbloqueada após compra P13; crédito R$5/indicação (editável); QR code; ranking + prêmio mensal (cron)
- Gás do Povo: cupom automático GASDOPOVO10 na 1ª compra, campo CPF, mensagem WhatsApp destacada
- Comércios: cadastro com foto de fachada (Object Storage), aprovação admin, preço a combinar
- Portaria: preço de retirada por produto no admin (vazio = Grátis)
- Roleta REMOVIDA por pedido do usuário — não reintroduzir

## Implementado (histórico)
- MVP completo, iterações 1–4 testadas (test_reports/iteration_1..4.json)
- 2026-06 (fork atual):
  - Revisão de qualidade de código aplicada: create_order() e build_whatsapp_message() refatoradas em helpers (_wa_*, _auto_gdp_coupon, _resolve_manual_coupon, _coupon_discount_value, _grant_referral_credit, _apply_post_order_updates) sem mudar comportamento/textos; catches do Admin.jsx com toast de erro; loadAll com tratamento de falha; ternários aninhados → lookup maps (RANK_STYLES, BUSINESS_STATUS_STYLES, FOOTER_NAV_LABELS); código morto removido (loyaltyApplies, cache da roleta); card de incentivo de login corrigido (texto 3 pedidos + botão vai para /entrar)
  - Regressão iteration_5.json: 41/41 backend PASS, frontend E2E PASS
  - NOVO: Excluir pedido no admin — DELETE /api/admin/orders/{id} + botão lixeira (data-testid delete-order-N) com window.confirm; testado via curl (200/404/401) e screenshot
  - Admin 83988331044 recriado no banco (havia sido apagado por testes); pedidos de teste limpos do banco

## Backlog
- P1: Revalidar fluxo Google admin (/api/auth/session — finding da iteration 2)
- P2: Verificar execução real do cron do prêmio mensal do ranking
- P2: Deploy definitivo (usuário ainda não confirmou; app passou no deployment_agent sem bloqueadores)
