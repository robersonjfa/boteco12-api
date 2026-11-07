# Mini rodadas e duelos por tampinhas

Implementação do backlog v0.2 aprovado em 06/11/2026. A especificação de origem
fica em `output/pdf/boteco12-duelos-backlog-v0.2.md` no workspace da stack.

## Operação

- Admin: `/admin/minis`. Cadastrar 2 ou 3 jogos com horários, conferir e publicar.
- Cliente: `/duelos`, acessível pelo início e pelo menu da conta.
- Cada usuário salva uma única sequência de palpites por mini. Salvar é definitivo.
- O prazo é uma hora antes do primeiro jogo, derivado dos horários informados.
- O duelo é público ou direcionado a um destinatário. Dois aportes iguais,
  positivos, sem taxa; o saldo disponível limita as participações.
- Cancelar antes do aceite ou expirar sem adversário libera a reserva.
- A reserva é um débito identificado no extrato. `/api/minis/balance` distingue
  disponível e reservado; reservado não pode financiar outra operação.
- Depois do fechamento, participantes podem consultar os dois palpites no detalhe.

## Pontuação e apuração

As minis usam escolhas simples `1`, `X`, `2`: acerto +1, erro 0. Não há concessão
ou consumo de Duplas/Super Duplas neste fluxo, que não foi definido no backlog
das minis. A implementação reutiliza o calculador oficial e preenche com jogos
anulados as posições fora da mini; não duplica a fórmula.

Os desempates usam `RankingTiebreakService`: pontuação, acertos com Super Duplas,
acertos com Duplas e cadastro mais antigo. Nas escolhas simples, as métricas de
multiplicadores são zero. User ID ordena tecnicamente, mas não desfaz empate.
Empate em todos os critérios oficiais devolve os dois aportes.

Admin confirma todos os resultados após o fechamento. `C` identifica jogo
adiado, cancelado, interrompido ou com resultado invalidado e vale zero para
ambos. Antes de confirmar, o Admin revisa os resultados na tela. Resultados
confirmados são imutáveis: repetir a confirmação reconcilia pagamentos pendentes,
sem trocar placares nem pagar novamente. Correções depois do pagamento exigem
operação de suporte; não há recálculo nem cobrança retroativa automática.

Não há escrita em Round, Ticket, rankings ou histórico de pontuação global.

## Consistência e recuperação

- Palpites, criação, aceite, expiração, cancelamento e liquidação bloqueiam a
  linha da mini no PostgreSQL. Concorrentes revalidam prazo, participantes e estado.
- O débito de carteira usa atualização condicional de saldo, inclusive entre minis.
- Cliente gera `requestKey` UUID por criação; repetir a mesma chave/payload
  retorna o mesmo duelo sem novo débito. Chave com outro payload é recusada.
- Crédito e transição de estado acontecem na mesma transação. O ledger recebe
  uma chave única por duelo, usuário e finalidade para pagamento/devolução.
- O worker executa `scheduler:reconcile-mini-duels` a cada minuto; expira sem
  precisar de navegador aberto e recupera liquidações confirmadas interrompidas.
- Cada execução processa até 500 duelos, em transações individuais. Lotes
  restantes ficam para a próxima execução. Admin também pode reconciliar pela tela.
- Prazo de participação é verificado na requisição, sem depender do atraso do worker.

## Banco e release

Migration aditiva `20261106150000_mini_duels`: mini_rounds, mini_matches,
mini_predictions e mini_duels, com índices e chaves estrangeiras. Nenhum backfill
ou alteração de saldo existente. Palpites e duelos preservam vínculo ao usuário
para auditoria financeira, com exclusão referencial restrita; solicitações de
eliminação de conta exigem a avaliação de retenção financeira do runbook de privacidade.

Seguir `docs/production-deploy.md`: gates, backup verificado, workflow explícito
`apply-production-migrations.yml`, confirmação do estado do banco e só então
release da API/worker. Publicar frontend depois da API saudável.

## Validação

- `npm run ci:check`
- `B12_POSTGRES_INTEGRATION=true npm run test:minis:postgres` em banco isolado
- Integrações PostgreSQL de descoberta e inicialização de Mesas
- Frontend: unitários, typecheck, build, SEO e Playwright, incluindo
  `minis-location.spec.ts` e regressões de regionalização
