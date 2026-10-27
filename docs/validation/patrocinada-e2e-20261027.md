# Boteco12 — Validação E2E: Mesa Patrocinada

**Executado em:** 2026-10-26  
**Ambiente:** PostgreSQL 16 local + migrations da stack + serviços compilados  
**Método:** 45 casos executados contra banco real, complementados pelas suítes PostgreSQL oficiais.

## Resultado geral

**45 PASSOU · 0 FALHOU · 0 BLOQUEADO** — total 45

**Veredito: APROVADO.** Permissões, campos, datas, capacidade, pagamento, captura do Score Inicial e estados passaram em execução real.

## Grupo A — Permissões de criação (4/4 PASSOU)

| ID | Caso | Esperado | Observado | Status |
|---|---|---|---|---|
| A1 | ADMIN cria Mesa Patrocinada válida | 201/criada | id=ff8d063a-5f4d-44a6-91a4-145151f7b1a2 status=ACTIVE | PASSOU |
| A2 | PRO ativo NÃO cria Mesa Patrocinada | sponsored_mesa_admin_only | sponsored_mesa_admin_only | PASSOU |
| A3 | FREE/Calçada NÃO cria Mesa Patrocinada | sponsored_mesa_admin_only | sponsored_mesa_admin_only | PASSOU |
| A4 | Não autenticado NÃO cria Mesa Patrocinada | user_not_found | user_not_found | PASSOU |

## Grupo B — Validação dos campos (22/22 PASSOU)

| ID | Caso | Esperado | Observado | Status |
|---|---|---|---|---|
| B1 | Todos os campos válidos | aceito | accepted | PASSOU |
| B2 | Nome da Mesa ausente | rejeitado | name:Invalid input: expected string, received undefined | PASSOU |
| B3 | Regras ausentes | rejeitado | description:Invalid input: expected string, received undefined | PASSOU |
| B4 | Categoria ausente | rejeitado | category:Invalid option: expected one of "PAID"\|"FREE"\|"SPONSORED_FREE" | PASSOU |
| B5 | Nome do patrocinador ausente | rejeitado | sponsorName:Informe o nome do patrocinador | PASSOU |
| B6 | Logo ausente é aceito | aceito | accepted | PASSOU |
| B7 | Entrada gratuita válida | aceito | accepted | PASSOU |
| B8 | Entrada paga em Tampinhas válida | aceito | accepted | PASSOU |
| B9 | Entrada negativa rejeitada | rejeitado | accessCost:Too small: expected number to be >=0 | PASSOU |
| B10 | Público inválido rejeitado | rejeitado | eligibility:Invalid option: expected one of "ALL"\|"SUBSCRIBERS_ONLY"\|"FREE_ONLY" | PASSOU |
| B11 | Início das inscrições ausente | rejeitado | startDate:Invalid input: expected string, received undefined | PASSOU |
| B12 | Fechamento por limite sem limite | rejeitado | maxParticipants:Informe os lugares disponíveis | PASSOU |
| B13 | Fechamento por data com limite | rejeitado | maxParticipants:Mesa com inscrições por data não utiliza limite de lugares | PASSOU |
| B14 | Fechamento por data sem data limite | rejeitado | entryEndDate:Informe a data final das inscrições | PASSOU |
| B15 | Configuração simultânea de fechamento | rejeitado | maxParticipants:Mesa com inscrições por data não utiliza limite de lugares | PASSOU |
| B16 | Duração por rodadas sem rodadas | rejeitado | durationRounds:Informe a quantidade de rodadas | PASSOU |
| B17 | Duração por data sem endDate | rejeitado | endDate:Informe a data de fechamento da Mesa | PASSOU |
| B18 | Configuração simultânea de duração | rejeitado | durationRounds:Mesa com fechamento por data não utiliza quantidade de rodadas | PASSOU |
| B19 | Campos extras rejeitados | rejeitado | :Unrecognized key: "campoExtra" | PASSOU |
| B20 | Tipos incorretos rejeitados | rejeitado | accessCost:Invalid input: expected number, received string | PASSOU |
| B21 | Premiação ausente rejeitada | rejeitado | sponsorPrizePool:Informe a premiação patrocinada | PASSOU |
| B22 | Persistência grava nome e logo do patrocinador | sponsorName/logo persistidos | ok | PASSOU |

## Grupo C — Datas das inscrições (6/6 PASSOU)

| ID | Caso | Esperado | Observado | Status |
|---|---|---|---|---|
| C1 | Entrada antes do início é bloqueada | ainda não começaram | As inscrições para esta competição ainda não começaram. | PASSOU |
| C2 | Entrada no instante/depois do início é aceita | entrada aceita | status=APPROVED | PASSOU |
| C3 | Data de início inválida é rejeitada | mesa_start_date_invalid | mesa_start_date_invalid | PASSOU |
| C4 | Data de início no passado é rejeitada | mesa_start_date_in_past | mesa_start_date_in_past | PASSOU |
| C5 | Entrada após a data limite é bloqueada | encerradas | As inscrições para esta competição foram encerradas. | PASSOU |
| C6 | Mesa fechada bloqueia novas entradas | encerradas | Esta Mesa não está aberta para novos participantes | PASSOU |

## Grupo D — Capacidade e fechamento (5/5 PASSOU)

| ID | Caso | Esperado | Observado | Status |
|---|---|---|---|---|
| D1 | Última vaga fecha e terceira entrada é bloqueada | 2 aprovados, 3º bloqueado | currentParticipants=2 referenceRound=00000000-0000-4000-8000-000000000032 | PASSOU |
| D2 | Requisições concorrentes pela última vaga aprovam uma única vez | 1 sucesso / 1 bloqueio | ok=1 blocked=1 | PASSOU |
| D3 | Entrada paga debita Tampinhas e soma ao caixa | saldo 980, caixa 20 | saldo=980 caixa=20 | PASSOU |
| D4 | Entrada gratuita não debita Tampinhas | saldo 1000, caixa 0 | saldo=1000 caixa=0 | PASSOU |
| D5 | Reprocessamento da mesma entrada não duplica participante | 1 participante | participantes=1 | PASSOU |

## Grupo E — Captura temporal do Score Inicial (5/5 PASSOU)

| ID | Caso | Esperado | Observado | Status |
|---|---|---|---|---|
| E1 | Mesa Patrocinada inicia o ciclo de Score Inicial | initializationStatus definido na criação | create=WAITING_FOR_REGISTRATION_CLOSE | PASSOU |
| E2 | Última vaga registra a rodada 32 como referência | referenceRoundId=32 | referenceRoundId=00000000-0000-4000-8000-000000000032 status=WAITING_FOR_REFERENCE_ROUND | PASSOU |
| E3 | Fechamento por data grava a rodada de referência | referenceRoundId=32 | referenceRoundId=00000000-0000-4000-8000-000000000032 status=WAITING_FOR_REFERENCE_ROUND | PASSOU |
| E4 | Patrocinada lotada captura Score Inicial 163 | scoreInitial=163 | scoreInitial=163 status=READY | PASSOU |
| E5 | Patrocinada por data (não lotada) captura Score Inicial 163 | scoreInitial=163 | scoreInitial=163 status=READY | PASSOU |

## Grupo F — Consistência de estados (3/3 PASSOU)

| ID | Caso | Esperado | Observado | Status |
|---|---|---|---|---|
| F1 | Mesa publicada inicia ativa e com referência da rodada aberta | ACTIVE + round 32 | status=ACTIVE close=CAPACITY | PASSOU |
| F2 | Fechamento por lotação persiste a rodada 32 como referência | referenceRoundId=32 | referenceRoundId=00000000-0000-4000-8000-000000000032 initialization=WAITING_FOR_REFERENCE_ROUND | PASSOU |
| F3 | Estado de inscrição reflete a janela da Mesa | OPEN | state=OPEN | PASSOU |

## Correções aplicadas nesta rodada

1. `create-bolao`: toda Mesa inicia `initializationStatus = WAITING_FOR_REGISTRATION_CLOSE` (antes só `PAID`).
2. `join-bolao`: última vaga grava `referenceRoundId` + `initializationStatus` para qualquer categoria com fechamento por lotação.
3. `mesa-lifecycle`: fechamento por data grava a rodada aberta como referência.
4. `mesa-initial-score`: removida a exigência de Mesa lotada para capturar; basta todos os aprovados estarem contabilizados.

## Evidência complementar

- Suítes PostgreSQL oficiais (reference-round, baseline-capture, region-create): **19/19**.
- `test:competition`: **224/224**.
- `ci:check`: **7/7 gates**.

## Cobertura dos casos de captura

- **E4**: Patrocinada lotada (2/2) capturou **163** e ficou `READY`.
- **E5**: Patrocinada por data com **1/10** participantes capturou **163** e ficou `READY`.
