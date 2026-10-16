# Validação da política de início — 2026-10-16

Regra aprovada pelo usuário: bloquear dias anteriores, permitir hoje em São
Paulo e preservar data histórica inalterada na edição. Definição completa em
`../mesa-start-date-policy.md`.

## TDD e regressão

- RED `48c2b2f`: build passou; 23 testes executados, oito passaram e 15 falharam
  porque datas passadas eram aceitas (201/200 ou ausência da rejeição esperada).
  Inclui controladores e serviços reais com identidade e persistência simuladas.
- GREEN `7fda388`: os mesmos 23 testes passaram.
- `5aaa53a` amplia controles de data futura, publicação NOW hoje e snapshot
  obsoleto na edição: 26/26 testes passaram.
- Regressão competition final: 215/215. PostgreSQL inicialização: 18/18.
- Fixtures financeiras usam datas futuras; fixtures de edição administrativa
  agora informam a data original persistida. Uma criação PostgreSQL usa agora.
  A criação com janela expirada continua rejeitada, agora primeiro pela data
  inicial passada. Cenários históricos de participação continuam preservados.
- Prisma generate, build TypeScript, auditoria da cadeia (20 migrations) e
  política de migrations passaram. Nenhuma migration neste incremento.

## API autenticada e banco isolado

API local 3102 e PostgreSQL `127.0.0.1:55433/b12_mesa_e2e_20261016`.
Login real de PRO e administrador; apenas dados sintéticos.

Dezessete checks passaram: dez rejeições DRAFT/NOW nos cinco caminhos HTTP
(criação PRO, admin, legado e duas edições), duas edições preservando o instante
histórico e cinco operações aceitando hoje. As rejeições preservaram contagem
de Mesas e snapshots das duas Mesas de controle. Duas criações prévias montam
os controles; o início histórico foi definido diretamente só nessas fixtures
locais. Nenhuma mutação de carteira.

Evidência estruturada: `mesa-start-date-policy-20261016.json`.
As verificações determinísticas cobrem UTC com dia diferente em São Paulo e
a virada exata às 03:00 UTC. As verificações autenticadas usam o relógio real.

Produção: `create-bolao.service.ts`, `update-mesa.service.ts` e novo
`mesa-start-date-rules.ts`, reutilizando `SaoPauloPeriodService`.
PR empilhado sobre #6. Sem merge ou deploy.
