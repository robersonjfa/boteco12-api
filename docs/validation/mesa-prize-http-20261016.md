# Mesa: HTTP 400 para premiação inválida

Data: 16/10/2026 (America/Sao_Paulo). RED `294ca61`; GREEN `a90f700`.
Incremento baseado no PR #4, sem merge ou deploy.

## Correção

As violações conhecidas da distribuição passam a usar
`InvalidPrizeDistributionError`. Criação e edição chamam a validação de entrada,
que converte somente essa classe em AppError 400, código
`mesa_prize_distribution_invalid`, preservando a mensagem da regra violada.

Falhas inesperadas são propagadas. A leitura de configuração persistida por
`fromJson` continua no caminho de validação de domínio: uma distribuição inválida
ali não é atribuída ao payload do cliente. As regras de percentual, sequência,
taxa e cálculo de premiação permanecem as mesmas.

## TDD e regressão

- **RED:** 35 testes HTTP executados com controllers, serviços, schema e error
  handler reais; 30 retornaram 500 em vez de 400 e cinco controles passaram.
  Leituras de identidade/banco foram fixtures, sem autenticação real nesse teste.
  A mensagem da regra era conferida e nenhuma transação de escrita era iniciada
  antes de verificar o status, isolando a causa do RED.
- **GREEN:** os mesmos 35 passaram. Cobrem soma 90%/110%, posições repetidas,
  puladas ou começando em 2 e percentuais fracionários nas cinco rotas.
- **PASSOU:** erros inesperados de leitura ou do validador continuam 500 com
  resposta genérica; configuração persistida inválida via fromJson continua 500.
- **PASSOU:** valores estruturais já rejeitados pelo Zod continuam 400.
- **PASSOU:** competição/Mesa 181/181, incluindo os novos testes no gate.
- **PASSOU:** referência/captura PostgreSQL 18/18 em banco isolado.
- **PASSOU:** build TypeScript, auditoria da cadeia/baseline e política de migração
  (20 migrações, zero erros e avisos).

## API real e PostgreSQL

Executado o GREEN compilado em `127.0.0.1:3102`, Redis exclusivo
`127.0.0.1:6382`, banco sintético `b12_mesa_e2e_20261016` em `127.0.0.1:55433`.
Sessões, perfis de identidade, autorização e proteção CSRF reais.

**PASSOU:** 32 verificações registradas, mais duas criações válidas de preparação.
São 30 rejeições de distribuição inválida e duas edições válidas.
Para cada rejeição, a contagem de Rankings e os registros completos das Mesas de
edição foram comparados antes/depois e permaneceram idênticos.

- POST `/api/mesas`
- POST `/api/admin/mesas`
- POST `/api/admin/boloes`
- PUT `/api/mesas/:rankingId`
- PATCH `/api/admin/mesas/:rankingId`

[Respostas e resultados sanitizados](mesa-prize-http-20261016.json).
Somente usuários e dados sintéticos. As Mesas de teste eram rascunhos; não houve
manipulação de saldos nem alteração de pagamentos reais.

O frontend existente já apresenta a mensagem recebida da API pelo interceptor
HTTP. Não foi necessário alterar seu código neste incremento; não se afirma
nova execução de navegador nesta validação.

Sem migração, backfill ou mudança de infraestrutura. Alterações preexistentes do
usuário excluídas. Política de datas passadas e capacidade mínima continuam como
itens separados; a política de datas não deve ser inventada neste incremento.
