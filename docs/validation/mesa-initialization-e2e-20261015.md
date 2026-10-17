# Validação E2E — inicialização da Mesa Tampinhas, incremento 2

Execução em 15/10/2026 (America/Sao_Paulo; evidências em UTC de 16/10).
API: `fdd18a23d7b128e45ec4ab3bd5ca3f8053403479`. Frontend: `7be4e04`.
PR #3 sobre o PR #2, ambos em rascunho. Sem merge, deploy ou comandos em produção.

**Ciclo temporal HTTP/PostgreSQL: PASSOU — 16 verificações.**
O contrato completo de criação não foi revalidado neste ciclo; este resultado não
substitui a validação de todos os grupos do modelo oficial.

## Ambiente e método

- Node 22, PostgreSQL local em `127.0.0.1:55433`, banco exclusivo
  `b12_mesa_e2e_20261016` e role `b12_mesa_e2e_test`, com as 20 migrações aplicadas.
- API real em `127.0.0.1:3102`, Redis exclusivo em `127.0.0.1:6382`, frontend real
  em `127.0.0.1:4176`; sessões por cookie e autenticação/RBAC/CSRF ativos.
- Contas, perfis, assinaturas, times e históricos anteriores inteiramente sintéticos.
  Históricos 30/31 preparados em 143/153; fórmula de pontuação não reimplementada.
- Criação/publicação de Mesas, entrada, crédito administrativo, criação/abertura
  de rodadas, envio de escolhas, resultado, apuração e jobs executados por HTTP.
  Os saldos nunca foram alterados diretamente pelo teste.
- Para acelerar o tempo, apenas `closeAt` das rodadas sintéticas abertas foi
  antecipado no banco local antes da apuração. A API impede editar uma rodada OPEN.
  Status SCORED, históricos novos, captura, scores e liquidação foram produzidos
  pelos caminhos reais, sem mocks de rede ou substituição dos serviços.
- Leituras HTTP foram cruzadas com participantes, Ranking, carteira e ledger reais.
  JSON reduzido e sem sessões: [evidência persistida](mesa-initialization-e2e-20261015.json).

## Linha do tempo confirmada

| Marco | Inicialização | Baseline oficial | Score da Mesa | Encerramento |
|---|---|---|---|---|
| Uma vaga preenchida | WAITING_FOR_REGISTRATION_CLOSE | pendente; número legado 153 | 0 | não |
| Última vaga durante 32 OPEN | WAITING_FOR_REFERENCE_ROUND | pendente; número legado 153 | 0 | não |
| Rodada 32 apurada | READY | 163, com timestamps | 0 | não |
| Rodada 33 apurada | READY | 163 preservado | 10 | não |
| API reiniciada | READY | 163 e timestamps preservados | 10 | não |
| Rodada 34 apurada e job executado | READY | 163 preservado | 20 | CLOSED e settledAt |

Mesa principal: `6c8dcf76-f1c7-41c8-95f3-b0cb3a0db944`.
A referência permanece a rodada 32: `16d50d90-4244-4ea4-aa18-3ea7625d6512`.

## Casos adicionais

- **PASSOU:** ADMIN cria/publica; PRO ativo cria rascunho. FREE, PRO expirado e
  anônimo recebem 403/403/401 ao tentar criar uma Mesa paga.
- **PASSOU:** duas chamadas simultâneas à última vaga retornam 200/400; apenas
  uma aprovação/débito, saldo do participante de 500 para 480, caixa de 40.
- **PASSOU:** última vaga sem saldo retorna 400 sem participante, fechamento ou
  referência parcial; após crédito pela API administrativa, a repetição funciona.
- **PASSOU:** participante sem escolhas/histórico captura zero legítimo com timestamp.
- **PASSOU:** repetição da apuração/job preserva baseline e timestamp.
- **PASSOU:** reinício real do processo da API preserva sessão Redis, referência,
  captura, score e duração ainda incompleta.
- **PASSOU:** liquidação somente após 33 e 34, com bruto 40, taxa 4 e recompensa 36.
  Repetir os jobs depois da liquidação não cria lançamentos financeiros adicionais.

Histórico incompleto, falha durante captura, recuperação concorrente, totais
individuais distintos e captura atrasada já estão cobertos pela suíte PostgreSQL
do PR; não se afirma nova injeção dessas falhas no processo HTTP desta execução.

## Interface real

Login e detalhe da Mesa executados com Playwright local sem interceptações, em
1440×900, 768×1024 e 375×812, nos estados pendente, rodada 33 e encerrado.

- **PASSOU:** placar 0/10/20 conforme os respectivos marcos; nove capturas sem
  overflow horizontal, erro de execução JavaScript ou sobreposição observada.
  Título longo truncado com reticências no mobile.
- **FALHOU:** a espera pela captura ainda aparece com o rótulo genérico ATIVO.
  A API distingue a inicialização; a interface ainda não consome esse estado.
  Também apresenta posição 0 durante a espera. Tratar a apresentação em incremento
  próprio do frontend, sem confundir esse rótulo com liberação de pontuação.
- 401 de `/api/me` antes do login são esperados. O dashboard chegou a consultar
  um ranking mensal ausente no fixture; o job oficial de criação mensal foi
  executado antes da checagem visual final.
- Preview T3 teve dois timeouts; o runtime Browser falhou na inicialização e o
  conector Playwright não encontrou a extensão. As capturas foram concluídas com
  o Playwright local instalado no frontend.

Capturas e resultados detalhados ficam em `/Users/roberson/dev/personal/output`,
com prefixos `Boteco12_Mesa_` e `Boteco12_E2E_Mesa_Incremento2_2026-10-15`.
Os arquivos de estado privados usados pelo teste, incluindo cookies sintéticos,
não fazem parte desta evidência nem deste commit.

## Limites e próximos incrementos

- **NÃO EXECUTADO:** nova matriz completa de contrato, acessibilidade, métricas
  de desempenho e auditoria de segurança do frontend nesta execução.
- O relatório anterior mantém pendentes tipo/público obrigatórios, HTTP 400 para
  premiação inválida, política de data passada e alinhamento da capacidade mínima.
- Dados legados sem referência/inicialização permanecem sem backfill.
- A captura depende de SCORED e da completude dos históricos dos tickets. Ausência
  de histórico necessário mantém a Mesa pendente; não é substituída por zero.
- Build/release checks e Docker do CI remoto do commit validado: **PASSOU**.
  Job Deploy production: ignorado pela condição do workflow.

Nenhum arquivo preexistente do usuário ou código do frontend foi alterado.
