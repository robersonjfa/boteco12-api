# Duelos gamificados — decisões congeladas (DG-01)

Versão da regra: `duel-game-v1` · 12/11/2026.
Base: `backlog-implementacao-duelos-gamificados.md`, seção 8. As propostas foram
tratadas como aprovadas para o primeiro release; qualquer mudança exige nova
versão de regra e não reabre concessões já registradas.

## Regras

- XP: 20 por usuário/mini elegível; teto de 60 por dia local de fechamento da
  mini, em `America/Sao_Paulo`; sem bônus por vitória, empate ou valor.
- Elegibilidade: ao menos um duelo `SETTLED` do usuário na mini e ao menos um
  jogo com resultado válido (`1`, `X` ou `2`). Cancelado, expirado ou mini sem
  resultado válido não gera XP. Empate elegível gera XP.
- Ordem do teto: a primeira concessão registrada ocupa o limite diário; replay
  não redistribui e não cria nova concessão.
- Níveis: Chegando no Boteco (0), Da Casa (100), Respeitado (300),
  Casca-grossa (700), Lenda do Balcão (1500).
- Cosméticos: catálogo fixo, sem bônus financeiro. Títulos liberados por nível;
  moldura padrão para todos e moldura `respeitado` a partir do nível 300.
- Piloto: todos os usuários, com corte em `DUEL_GAMIFICATION_ACTIVATED_AT`;
  sem XP retroativo anterior ao corte. A flag de exposição é
  `DUEL_GAMIFICATION_ENABLED` (default desligada).
- Privacidade: estatísticas próprias completas; terceiros veem apenas agregados
  públicos e podem ser ocultados pelo dono.
- Processamento: worker independente, recibo único por duelo/versão, efeitos e
  recibo na mesma transação. Falha de gamificação não bloqueia liquidação.

## Fora do primeiro release

Histórico entre jogadores, revanche, missões, notificações e temporadas
(DG-15..DG-21) permanecem no backlog posterior.
