# Arena do Boteco — backlog de implementação

Versão: 1.0 · 11/11/2026.
Status: planejamento técnico; não autoriza desenvolvimento ou deploy.
Origem: `backlog-duelos-gamificados.md` (proposta G01–G13).
Repositórios: boteco12-api, boteco12-frontend e boteco12-infra.

## 1. Capacidade a entregar

O jogador reconhece adversários por um cartão de identidade, acompanha sua
evolução em níveis e conquista itens visuais ao concluir duelos. O encerramento
explica pontos, resultado, tampinhas e evolução. A operação consegue ativar um
piloto, verificar concessões e interromper a gamificação sem interromper duelos.

O primeiro release entrega G01–G07. Rivalidade, revanche, missões e temporadas
ficam em releases posteriores. As tarefas abaixo têm escopo técnico proposto;
valores e nomes ainda não aprovados estão identificados na seção 8.

## 2. Restrições e regras de implementação

### Regras existentes a preservar

- Gamificação não escreve em Wallet, WalletLedger, Round, Ticket ou rankings.
- Reservas, prêmio integral, devoluções, fechamento, palpites definitivos e
  desempate por cadastro continuam como estão.
- MiniDuel SETTLED, sua liquidação e resultados confirmados são a fonte dos fatos.
  Não aceitar do navegador vencedor, XP, nível ou conquista.
- Convites privados continuam restritos. Perfil e analytics não expõem palpites,
  CPF, email, saldo total ou confrontos privados a terceiros.
- Reprocessamento não repete XP, conquistas, estatísticas ou desbloqueios.
- Falha na camada de gamificação não pode desfazer ou impedir pagamento.

### Parâmetros propostos, sujeitos a aprovação em DG-01

- 20 XP por usuário/mini elegível, até 60 XP por dia de fechamento da mini,
  calculado em America/Sao_Paulo. Sem bônus por vitória ou valor comprometido.
- Elegível: ao menos um duelo SETTLED do usuário na mini e ao menos um resultado
  válido 1/X/2. Empate pode gerar XP. Cancelados e expirados não geram XP.
- O limite é global por jogador, inclusive entre minis processadas em paralelo.
  Proposta: as três primeiras concessões registradas pelo servidor ocupam o
  limite do dia de fechamento; registrar a ordem e não redistribuir no replay.
- Mesmo com limite de XP atingido, duelo elegível pode contar para conquistas.
- Níveis e limiares: Chegando no Boteco/0, Da Casa/100, Respeitado/300,
  Casca-grossa/700, Lenda do Balcão/1500.
- Sem XP retroativo: recomendar elegibilidade somente para minis com closeAt
  posterior ou igual à entrada do usuário no piloto. Reprocessar posteriormente
  os fatos elegíveis perdidos durante indisponibilidade, sem ampliar o corte.
- Estatísticas próprias podem incluir todos os duelos; propor que terceiros vejam
  apenas agregados de duelos públicos, com opção de ocultar estatísticas.
  O rótulo deve explicar a diferença. Histórico não concede XP retroativamente.

## 3. Contrato técnico proposto

### Responsabilidades e pontos de integração existentes

- API: `src/services/mini/mini.service.ts`, especialmente `detail` e `reconcile`.
- Rotas: `src/routes/mini.routes.ts`; manter autenticação e RBAC existentes.
- Worker: `src/jobs/constants.ts`, `register-schedules.ts` e
  `processors/process-boteco12-job.ts`.
- Banco: `prisma/schema.prisma`, migration aditiva e baseline conforme política.
- Frontend: `src/pages/Duels.tsx`, `src/modules/minis/mini.api.ts` e componentes
  do design system em `src/components/ds`.
- Testes: suites de minis PostgreSQL/HTTP e
  `tests/e2e/minis-location.spec.ts`; ampliar com suites específicas.
- Infra: incluir novo scheduler obrigatório na auditoria somente quando a
  funcionalidade estiver habilitada; identificar o arquivo na implementação.

### Processamento e recuperação

Preferência arquitetural: worker de gamificação independente consulta duelos
SETTLED sem recibo de processamento. Não inserir chamada obrigatória de XP nem
gravação de evento de gamificação na transação financeira. Essa escolha evita
que erro nas tabelas de gamificação cause rollback de prêmio.

Fluxo: SETTLED elegível → pendente de gamificação → processamento transacional
→ recibo concluído, com XP concedido ou motivo de não concessão. Erro transitório
mantém o fato pendente. Erro persistente fica identificado para repetição e
suporte, sem interromper os outros duelos do lote.

- Paginação estável; consultar ausência de recibo, sem depender só de cursor
  temporal que possa pular commits atrasados.
- Serializar alterações de cada jogador e de seu limite diário; ordem estável
  de bloqueio quando houver dois jogadores. Mini lock sozinho não protege minis
  diferentes do mesmo usuário.
- Aplicação de efeitos e gravação do recibo na mesma transação de gamificação.
- Recuperação após crash, worker concorrente e repetição manual usam as mesmas
  chaves únicas. BullMQ não é a fonte única de verdade dos fatos.
- Estatísticas históricas usam projeção separada: rebuild de estatísticas não
  concede XP, conquistas ou itens anteriores à ativação.
- Flag de exposição e chave de processamento são separadas. Ocultar a interface
  não apaga progresso. Pausar processamento permite recuperar o período elegível
  ao retomar; remover um usuário do piloto encerra sua janela de elegibilidade.

### Dados novos — nomes indicativos

| Entidade | Finalidade e restrições |
| --- | --- |
| DuelGameEnrollment | Participação no piloto e intervalo de elegibilidade por usuário; registrar início/fim e versão de regra. |
| DuelGameProfile | XP projetado, título/moldura equipados e visibilidade; um perfil por usuário. Nível derivado do catálogo versionado. |
| DuelGameReceipt | Duelo processado, versão, data e resultados de processamento; único por duelo/versão de efeitos, com regra explícita para impedir replay em nova versão. |
| DuelXpGrant | Registro imutável da decisão por usuário/mini; único por usuário/mini, com delta 0 ou 20, motivo, dia local e origem. Trocar versão não libera nova concessão. |
| DuelXpDay | Consumo de XP por usuário/dia, atualizado atomicamente; restrição de teto e unicidade. |
| DuelAchievement | Conquista obtida e fato de origem; único por usuário/código da conquista. |
| DuelCosmeticUnlock | Posse de título/moldura; único por usuário/item. Catálogo fixo e versionado no MVP. |
| DuelStats / DuelOpponentFact | Projeção reconstruível de resultados e adversários distintos, separando público/privado; não contar replay duas vezes. |

Definir índices de busca de pendências, usuário/mini, usuário/dia e estatísticas.
Relacionamentos e exclusão devem seguir a política de retenção já existente;
não impor retenção financeira automaticamente a todos os dados cosméticos.

### Interfaces — propostas, não implementadas

Todas exigem sessão válida e seguem o formato de erros/paginação existente.

| Interface | Entrada / resposta esperada |
| --- | --- |
| GET /api/duels/gamification/me | enabled, versão, XP, nível, próximo limiar, conquistas, itens, equipamento e estatísticas próprias; flags desligadas têm resposta estável. |
| GET /api/duels/gamification/players/:userId | Identidade e aparência pública; estatísticas apenas conforme visibilidade e escopo público; nunca incluir grants privados ou saldo. |
| PATCH /api/duels/gamification/me/equipment | titleId e frameId; validar catálogo e posse no servidor; rejeitar itens indevidos sem alteração parcial. |
| PATCH /api/duels/gamification/me/privacy | visibility conforme política aprovada; dono apenas. |
| GET /api/duels/:id | Extensão opcional gameSummary: pending/applied/ineligible, XP desta mini e conquistas atribuídas ao usuário logado; preservar autorização do duelo. |
| GET /api/duels | Extensão opcional da identidade: nível, título e moldura; buscar em lote para até 20 cards, sem consulta por card. |

Registrar rotas estáticas de gamificação antes de `/duels/:id`. Detalhe de duelo
continua funcionando em versões antigas do cliente e durante rollout parcial.

## 4. Backlog do primeiro release

P0 = necessário ao MVP; P1 = entrega posterior. Esforço P/M/G é relativo, não prazo.
Cada item deve resultar em mudança revisável com os testes que comprovam seu aceite.

### DG-01 — Fechar regras e contratos [P0 · Produto/API · P]

- Relacionado a G02–G07. Dependência: nenhuma.
- Resolver as decisões da seção 8; versionar regras, níveis e cosméticos.
- Fixar DTOs, tratamento de flag desligada, corte do piloto e política de dados.
- Aceite: exemplos de vitória, empate, mini anulada, quarto XP do dia e liquidação
  tardia têm saída esperada; nenhuma decisão de produto fica implícita no código.

### DG-02 — Instrumentar funil e linha de base [P0 · API/Frontend · M]

- Relacionado a G01. Dependência: DG-01.
- Eventos de criação, detalhe aberto, aceite confirmado, expiração, liquidação e
  retorno. Efeitos confirmados vêm do servidor; cliques não contam como aceite.
- Documentar denominadores, coorte, data local e como obter cada métrica.
- Aceite: eventos de negócio deduplicados; nenhum palpite ou dado pessoal em
  payload; relatório básico funciona antes de habilitar gamificação.

### DG-03 — Criar esquema e migration aditiva [P0 · API/Banco · G]

- Relacionado a G04–G07. Dependência: DG-01.
- Implementar entidades necessárias, chaves únicas, FKs e índices da seção 3.
- Atualizar baseline/verificações exigidas pelo repositório.
- Aceite: banco novo e banco com duelos existentes migram; API/worker anteriores
  continuam funcionando; nenhum saldo, palpite ou ranking é alterado.

### DG-04 — Implementar corte do piloto e controles [P0 · API/Worker · M]

- Relacionado a G07. Dependência: DG-03.
- Persistir elegibilidade de usuários e versão; validar configuração no boot.
- Separar exposição, participação e pausa de processamento; auditar mudanças.
- Aceite: desligar UI preserva dados; pausa/retomada recupera só fatos elegíveis;
  usuário externo ao piloto segue usando duelos sem depender da nova camada.

### DG-05 — Construir processador recuperável [P0 · API/Worker · G]

- Relacionado a G04/G07. Dependências: DG-03, DG-04.
- Buscar SETTLED pendentes em lotes limitados; produzir recibos transacionais.
- Isolar erros por duelo, controlar retries e evitar que um erro persistente
  ocupe sempre o começo do lote. Definir atendimento dos pendentes antigos.
- Aceite: queda antes/depois do commit e dois workers simultâneos não perdem nem
  duplicam efeitos; indisponibilidade de gamificação não bloqueia liquidação.

### DG-06 — Implementar XP e níveis [P0 · API · G]

- Relacionado a G04. Dependência: DG-05.
- Avaliar mini elegível, data local, concessão única, teto diário e nível.
- Registrar motivos como ALREADY_REWARDED, DAILY_CAP, ALL_MATCHES_VOID e
  BEFORE_ENROLLMENT sem misturar com estado financeiro.
- Aceite: minis concorrentes do mesmo usuário respeitam 60 XP; vários duelos de
  uma mini dão no máximo 20; empate elegível dá XP; replay não muda a decisão.
- Testes PostgreSQL obrigatórios para unicidade, concorrência e virada do dia.

### DG-07 — Implementar estatísticas e conquistas [P0 · API · G]

- Relacionado a G02/G05. Dependências: DG-05, DG-06.
- Projetar vitórias, derrotas, empates e adversários distintos com escopo de
  visibilidade; permitir reconstrução sem disparar recompensas.
- Selos: Estreia na Mesa, Primeiro Brinde, Na Mosca e Rodou o Boteco.
- Aceite: Na Mosca exige ao menos dois jogos válidos e acerto em todos eles;
  limite de XP não impede conquista; replay e adversário repetido não inflam
  contadores. Separar vitória por pontos de vitória por desempate no resumo.

### DG-08 — Implementar posse e equipamento cosmético [P0 · API · M]

- Relacionado a G06. Dependências: DG-03, DG-06.
- Catálogo fixo, desbloqueio por nível e operação atômica de equipamento.
- Aceite: não equipar item não obtido ou de outra categoria; repetição não gera
  duplicata; erro não deixa metade do equipamento alterada; padrão para novato.

### DG-09 — Expor contratos e privacidade [P0 · API · M]

- Relacionado a G02–G06. Dependências: DG-06, DG-07, DG-08.
- Implementar interfaces da seção 3 e extensões opcionais nos contratos atuais.
- Testes HTTP de autenticação, dono/terceiro, conta bloqueada, visibilidade e
  convite privado. Seleção explícita de campos e consultas em lote.
- Aceite: cliente antigo funciona; terceiro não acessa fatos privados; listar
  20 duelos não faz 20 consultas extras; sem serializar Prisma User completo.

### DG-10 — Montar cartão e perfil do jogador [P0 · Frontend · M]

- Relacionado a G02. Dependência: DG-09; pode iniciar com fixtures do contrato.
- Adicionar título, nível e moldura aos cards; abrir perfil de duelos com
  estatísticas permitidas, conquistas e estado de iniciante.
- Aceite: nome, apelido, valor, mini e CTA continuam claros em 375 px; loading,
  erro, estatísticas ocultas e feature desligada têm apresentação definida.

### DG-11 — Evoluir o resumo de encerramento [P0 · Frontend/API · M]

- Relacionado a G03/G04. Dependência: DG-09.
- Mostrar pontos, razão do desempate, prêmio/devolução e ganho líquido; integrar
  XP, nível e conquista. Atualizar detalhe/saldo quando o resultado ficar pronto.
- Exemplo: aporte 25, vitória → recebidos 50, ganho líquido +25; derrota → -25;
  empate com devolução → recebidos 25, ganho líquido 0.
- Aceite: CONFIRMED com resultados oficiais ainda não é pagamento concluído;
  SETTLED com gamificação pendente mostra pagamento concluído e evolução pendente.
  Reabrir não repete celebrações; respeitar movimento reduzido.

### DG-12 — Montar evolução e personalização [P0 · Frontend · M]

- Relacionado a G04–G06. Dependências: DG-09, DG-10.
- Mostrar XP atual/próximo nível, catálogo obtido/bloqueado, conquistas e ações
  de equipar título/moldura; aplicar preferência de privacidade aprovada.
- Aceite: progresso no último nível, erro de gravação, concessão pendente e XP
  limitado têm texto correto; refresh restaura equipamento salvo no servidor.

### DG-13 — Operação, scheduler e diagnóstico [P0 · API/Infra · M]

- Relacionado a G07. Dependência: DG-05.
- Registrar scheduler dedicado; integrar constantes, roteador de jobs, testes e
  auditoria operacional condicionada à ativação.
- Medir pendentes, idade da pendência mais antiga, concessões, skips, retries e
  erros; fornecer procedimento de repetição limitado por usuário/duelo.
- Aceite: falha persistente é localizável; reprocessamento não toca na carteira;
  modo pausado e rollout parcial não produzem falso sucesso operacional.

### DG-14 — Validar release e ativar piloto [P0 · API/Frontend/Infra · G]

- Relacionado a G07. Dependências: DG-02, DG-10–DG-13.
- Executar matriz da seção 6; registrar backup e migration pelo runbook atual.
- Publicar esquema/API/worker com feature desligada, depois frontend compatível;
  verificar saúde e ativar piloto definido. Não habilitar para todos implicitamente.
- Aceite: versões e contratos conferidos, métricas coletadas e desligamento
  ensaiado; rollback de aplicação mantém tabelas aditivas e preserva histórico.

## 5. Backlog posterior — sem bloquear o MVP

| ID | Prioridade / área | Implementação e aceite | Dependências |
| --- | --- | --- | --- |
| DG-15 | P1 · API/Frontend | Histórico entre dois jogadores: endpoint paginado e painel; dono vê confrontos permitidos, terceiros apenas públicos; cancelados/expirados não entram no placar. | DG-07, DG-09 |
| DG-16 | P1 · API/Frontend | Revanche: origem em duelo encerrado, outra mini aberta, convite ao adversário e confirmação nova; usar createDuel e requestKey existentes; sem reaproveitar reserva/aceite ou aumentar valor automaticamente. | DG-15 |
| DG-17 | P1 · API/Worker | Missões semanais versionadas: período local, participantes, objetivos e concessão cosmética única; contar somente minis/duelos elegíveis; replay não repete prêmio, sem XP adicional no ciclo inicial. | DG-07, DG-08 |
| DG-18 | P1 · Frontend | Painel de missões: progresso, prazo, recompensa e estado concluído; missões opcionais, sem perda de nível ao expirar. | DG-17 |
| DG-19 | P1 · API/Frontend | Central no app: persistência, deduplicação por destinatário/tipo/fato, não lidas, preferências e deep links; notificações de convite exigem captura recuperável própria, não só leitura de SETTLED. Sem envio de email/push nesta tarefa. | DG-09, DG-13 |
| DG-20 | P1 · API/Frontend | Álbum de temporada: progresso separado do XP permanente; selos persistem após fechamento e nenhuma classificação financeira é criada. | DG-17, DG-18 |
| DG-21 | P1 · Admin/API | Configuração de temporada: rascunho → publicada → encerrada, RBAC e auditoria; revisar datas e catálogo antes de publicar; regras publicadas não mudam silenciosamente. | DG-20 |

Detalhar DG-15–DG-21 antes de iniciar cada release; os contratos do MVP não
devem tentar antecipar todo o modelo de temporadas e notificações.

## 6. Matriz de aceite integrada

| Cenário | Resultado obrigatório |
| --- | --- |
| Vitória por pontos / por cadastro | Tampinhas e vencedor atuais preservados; resumo explica qual critério decidiu. |
| Empate elegível | Devolução atual preservada; uma concessão de XP por mini. |
| Cancelado ou expirado | Sem XP, conquista ou vitória; devolução atual preservada. |
| Todos os jogos C | Sem XP ou conquistas elegíveis; manter desfecho financeiro pelas regras existentes. |
| Anulação parcial | Elegibilidade geral se houver jogo válido; Na Mosca apenas com dois válidos ou mais. |
| Cinco duelos na mesma mini | No máximo 20 XP ao jogador; resultados por duelo e adversários distintos calculados sem duplicação. |
| Quatro minis no mesmo dia | No máximo 60 XP; decisão de não concessão registrada; conquistas continuam avaliadas. |
| Liquidação tardia e meia-noite | Atribuição ao dia local do closeAt, sem consumir indevidamente o dia de processamento. |
| Dois workers / minis concorrentes | Mesmo efeito que processamento único; nenhum excesso do limite diário. |
| Crash e erro persistente | Recuperação sem perda/duplicação; outros duelos continuam sendo processados. |
| Rebuild de estatísticas | Totais recompostos sem conceder XP ou itens históricos. |
| Acesso de terceiro | Sem confrontos privados, palpites, saldo, CPF ou email na resposta. |
| Gamificação indisponível ou oculta | Duelo continua aceitando, apurando e pagando; UI com fallback. |
| Navegação móvel e teclado | Cards e janelas sem overflow; foco, Escape e movimento reduzido verificados. |

Cobertura: regras puras para elegibilidade/níveis; PostgreSQL real para
concorrência e atomicidade; HTTP para permissões/contratos; E2E para jornada e
fallback. Evitar mocks como única comprovação de débito, crédito ou unicidade.

## 7. Ordem de execução e definição de pronto

1. Regras e linha de base: DG-01 → DG-02.
2. Fundação: DG-03 → DG-04 → DG-05.
3. Motor: DG-06, depois DG-07 e DG-08 → DG-09.
4. Experiência: DG-10, DG-11 e DG-12.
5. Operação: DG-13 pode avançar assim que DG-05 estiver pronto.
6. Release: DG-14. Avaliar uso antes de priorizar DG-15–DG-21.

Pronto por tarefa: critérios verificados, contratos documentados, erros e
permissões cobertos, testes apropriados passando e sem alterações financeiras
fora do escopo. Pronto por release: matriz integrada aprovada, configuração e
reversão documentadas, ausência de duplicações e acompanhamento operacional.

Não há compromisso de prazo nesta versão. Estimar após DG-01 e revisão da
migration e do processador; DG-03, DG-05 e DG-06 concentram a complexidade.

## 8. Decisões abertas e encaminhamento

| Decisão | Proposta para aprovação | Bloqueia |
| --- | --- | --- |
| Nome e níveis | Arena do Boteco e cinco níveis da seção 2 | Catálogo e textos finais |
| XP e teto | 20 por mini, 60/dia de fechamento, sem bônus por vitória; primeira concessão registrada ocupa limite | DG-06 |
| Elegibilidade inicial | closeAt dentro do intervalo de participação do usuário no piloto; sem XP anterior | DG-04–DG-07 |
| Estatísticas e privacidade | Próprias completas; terceiros apenas públicos e com opção de ocultar | DG-07, DG-09 |
| Cosméticos | Títulos e molduras de catálogo fixo, sem bônus ou valor de carteira | DG-08, DG-12 |
| Piloto | Grupo e duração definidos com o PO conforme volume | Ativação em DG-14 |

Este backlog está pronto para refinamento e divisão em issues. DG-01 precisa
encerrar as decisões de produto antes do código correspondente. A arquitetura
de processamento e a migration precisam de revisão técnica antes do release.
Não foram abertas issues, implementadas funcionalidades ou alterada produção
ao gerar este documento.
