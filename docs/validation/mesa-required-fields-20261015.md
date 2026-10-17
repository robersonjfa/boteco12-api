# Mesa: tipo e público obrigatórios no contrato HTTP

Execução iniciada em 15/10/2026 (America/Sao_Paulo).
RED `775ad68`; GREEN `77f4a59`. Base: incremento de captura consolidada, PR #3.

O schema HTTP agora exige `category` e `eligibility` explicitamente, em vez de
adicionar PAID e SUBSCRIBERS_ONLY quando ausentes. A alteração de produto remove
somente os dois defaults Zod; serviços internos e dados legados mantêm seus defaults.
Nenhum schema Prisma, migração, backfill, frontend ou regra de elegibilidade mudou.

Como o mesmo schema valida os payloads completos de edição, a exigência também
vale para PUT do proprietário e PATCH administrativo. O formulário atual já envia
ambos os campos. Clientes HTTP que os omitem passarão a receber 400.

## Evidências

- **RED:** 23 testes executados, 11 falhas 201 em vez de 400 e 12 aprovações.
  Os testes usam schema e middleware de produção em um servidor Express isolado,
  com handler controlado; não afirmam validar autenticação ou persistência.
- **GREEN:** os mesmos 23 testes passaram. Cobrem ausência individual/conjunta,
  null, vazio, tipos errados, enums desconhecidos, nove combinações explícitas e
  o alias financeiro entryFee.
- **PASSOU:** competição/Mesa 146/146, incluindo os novos testes adicionados ao gate.
- **PASSOU:** referência e captura PostgreSQL 18/18, sequenciais em banco isolado.
- **PASSOU:** 18 testes complementares de identidade/privacidade e listagens de Mesa.
- **PASSOU:** build TypeScript, auditoria da cadeia/baseline (20 migrações,
  zero erros/avisos) e política de migração.
- Dois fixtures anteriores receberam eligibility explícito para continuarem
  validando suas próprias regras de capacidade/janela.

## HTTP real com autenticação e PostgreSQL

API compilada do GREEN em `127.0.0.1:3102`, Redis exclusivo em `127.0.0.1:6382`,
banco sintético `b12_mesa_e2e_20261016` em `127.0.0.1:55433`.
Sessões, perfis de identidade, RBAC e CSRF reais; somente usuários sintéticos.

**PASSOU:** 21 verificações registradas e uma criação válida pelo usuário PRO.
Os nove pares category/eligibility foram criados administrativamente e conferidos
no banco. A ausência de cada campo foi rejeitada nas cinco rotas abaixo; a
contagem de Rankings e o conteúdo das Mesas de edição permaneceram idênticos.
PUT/PATCH completos também foram aceitos e preservaram o público explícito.

- POST `/api/mesas`
- POST `/api/admin/mesas`
- POST `/api/admin/boloes`
- PUT `/api/mesas/:rankingId`
- PATCH `/api/admin/mesas/:rankingId`

[Resultado sanitizado](mesa-required-fields-20261015.json). A preparação precisou
usar nomes únicos por execução, conforme a constraint existente de Rankings.
Sem manipulação de saldos ou persistência de cookies neste relatório.

Premiação inválida com HTTP 500, política de data passada e alinhamento da
capacidade mínima continuam como incrementos separados. Nenhum merge ou deploy.
Alterações locais preexistentes do usuário foram preservadas e excluídas.
