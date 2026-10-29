# Boteco12 — Validação E2E: Rankings Mensais FREE/Calçada e PRO

**Executado em:** 2026-10-29  
**Ambiente:** PostgreSQL 16 local + migrations de produção + serviços compilados  
**Escopo:** RM-01 a RM-20  
**Método:** cada caso executado contra banco real.

## Resumo

| Status | Quantidade |
|---|---|
| PASSOU | 20 |
| FALHOU | 0 |
| BLOQUEADO | 0 |
| NÃO EXECUTADO | 0 |
| **Total** | **20** |

**Resultado: APROVADO.** Todos os 20 casos passaram após as correções desta rodada.

## Casos

| ID | Cenário | Esperado | Observado | Status |
|---|---|---|---|---|
| RM-01 | Janeiro inclui rodada até 23:59 de 31/01 (São Paulo) | rodada de 31/01 23:00 BRT entra em janeiro | pontos=7 | PASSOU |
| RM-10 | Usuário FREE entra no Ranking FREE/Calçada | incluído | GLOBAL com 7 participantes | PASSOU |
| RM-11 | Usuário PRO também entra no Ranking FREE/Calçada | incluído | PRO presente no GLOBAL | PASSOU |
| RM-19 | Rankings separados: FREE amplo, PRO elegível no fechamento | GLOBAL 7 / PRO 4 | GLOBAL=7 PRO=4 | PASSOU |
| RM-12 | PRO ativo no fechamento entra no PRO do ciclo | proLate incluído | proLate incluído | PASSOU |
| RM-13 | PRO expirado depois do fechamento permanece no mês | permanece | permanece no PRO | PASSOU |
| RM-14 | PRO cancelado depois do fechamento permanece no mês | permanece | permanece no PRO | PASSOU |
| RM-15 | PRO que perde elegibilidade antes do fechamento não entra | proEndsBeforeClose fora | fora do PRO | PASSOU |
| RM-16 | PRO contratado após o fechamento entra somente no mês seguinte | proAfterClose fora de janeiro | fora de janeiro | PASSOU |
| RM-04 | Score Inicial corresponde ao total consolidado da referência | inicial = 120 | inicial=120 | PASSOU |
| RM-09 | Reprocessar a captura não duplica nem altera o inicial | idempotente | participantes=4 inicial=120 | PASSOU |
| RM-05 | Rodada de referência não entra na pontuação do ciclo | pontos = 20 | pontos=20 | PASSOU |
| RM-06 | Primeira rodada contabilizada é a seguinte à referência | total = 20 (só a rodada 2) | total=20 | PASSOU |
| RM-02 | Janeiro não fecha antes da finalização/consolidação da referência | ranking permanece ACTIVE | ACTIVE | PASSOU |
| RM-03 | Fechamento após consolidação permanece associado a janeiro | periodRef=2020-01 | periodRef=2020-01 status=CLOSED | PASSOU |
| RM-20 | Reprocessar fechamento não altera indevidamente | idempotente | status=CLOSED periodRef=2020-01 | PASSOU |
| RM-18 | Desempate respeita a ordem oficial | maior superDouble antes de double | b antes de a | PASSOU |
| RM-17 | Regra de pontuação reutilizada sem alteração | soma dos scoreRound contabilizados | scoreRound do ciclo somado | PASSOU |
| RM-07 | Falha na finalização impede captura prematura | sem captura antes de SCORED | nenhuma captura | PASSOU |
| RM-08 | Rodada finalizada sem consolidação não captura parcial | sem captura parcial | nenhuma captura parcial | PASSOU |

## Correções aplicadas

1. **Fuso:** o build mensal passou a usar `SaoPauloPeriodService.parse`, não `Date.UTC` (RM-01).
2. **Referência:** `BuildMonthlyRankingFromHistory` encontra a primeira rodada do mês e a passa como `excludeRoundId`; ela não soma pontos (RM-05, RM-06).
3. **Score Inicial:** só é capturado quando a referência está `SCORED`, a partir do histórico consolidado; idempotente por `scoreInitialCapturedAt` (RM-04, RM-07, RM-08, RM-09).
4. **Fechamento:** o mês só fecha quando a rodada de referência está `SCORED` (RM-02, RM-03, RM-20).
5. **PRO:** a coorte é reconciliada no fechamento da referência, com `hasActiveProSubscriptionAt(subscription, closeAt)`; quem perdeu a elegibilidade sai e quem assinou antes do fechamento entra (RM-12, RM-15, RM-16).

## Evidência complementar

- `test:competition` — **224/224**
- `tests/monthly-ranking-cohort.test.js` — **8/8**
- `npm run ci:check` — **7/7 gates**
