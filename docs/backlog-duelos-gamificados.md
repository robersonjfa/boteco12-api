# Duelos gamificados — proposta de produto e backlog

Status: proposta para alinhamento, sem autorização de implementação.
Data: 11/11/2026.
Base: fluxo de mini rodadas e duelos existente, descrito em `mini-duels.md`.

Desdobramento técnico: [backlog de implementação](backlog-implementacao-duelos-gamificados.md),
com tarefas DG-01–DG-21, contratos, dependências e critérios de aceite.

## Conceito: Arena do Boteco

A vitrine de desafios vira um lugar para reconhecer jogadores, acompanhar a
própria evolução e reencontrar adversários. Cada jogador tem um cartão com
apelido, título, nível e conquistas; cada disputa termina com um resumo que
explica resultado, tampinhas e evolução pessoal.

Hipótese a validar: identidade e memória das disputas aumentam a volta dos
jogadores e a proporção de desafios aceitos. Não há evidência ainda de que
gamificação seja a principal barreira à adoção; medir o fluxo atual primeiro.

Público inicial: jogadores que já participam das minis e procuram adversários.
Primeiro valor: reconhecer quem está desafiando e entender o próprio progresso.

## Regras propostas

- Tampinhas continuam como saldo de participação e prêmio do duelo. XP é
  experiência pessoal, sem compra, transferência, resgate ou poder competitivo.
- Valor comprometido, compra de tampinhas e quantidade de desafios criados não
  aumentam o XP. Não há multiplicadores pagos nem vantagens por nível.
- Uma mini elegível rende 20 XP por jogador após ao menos um duelo liquidado.
  Outros duelos na mesma mini não rendem XP adicional.
- Limite de 60 XP por dia de fechamento das minis, em America/Sao_Paulo.
- Mini elegível tem ao menos um jogo com resultado válido (1/X/2). Duelo
  cancelado, expirado ou mini com todos os jogos anulados não gera XP.
- Empate de duelo elegível também gera experiência. Vitória não dá XP extra.
- Progressão sugerida: Chegando no Boteco (0 XP), Da Casa (100), Respeitado
  (300), Casca-grossa (700) e Lenda do Balcão (1.500). Os limiares são proposta.
- Níveis desbloqueiam apenas títulos, molduras e selos visuais.
- Não há classificação pública por XP nem alteração de rankings existentes.
- Pontuação, cadastro mais antigo como desempate, prazo, reservas, prêmios e
  imutabilidade dos palpites continuam seguindo as regras atuais.
- Replay de liquidação não repete XP, conquistas, desbloqueios ou notificações.
- XP começa após ativação da funcionalidade. Não distribuir XP retroativo no MVP.

## Jornada desejada

1. Jogador entra na Arena e reconhece nome, apelido, título e nível de quem desafia.
2. Confere mini, valor por pessoa e prêmio, salva os palpites e aceita.
3. A disputa mostra claramente se aguarda jogos, confirmação do Admin ou liquidação.
4. Após a liquidação, vê placar, critério de desempate e movimentação de tampinhas.
5. Vê a experiência conquistada, o avanço de nível e eventual conquista.
6. Pode preparar uma revanche em outra mini aberta, com nova confirmação de valor.

## Fase 1 — MVP: identidade e evolução pessoal

| ID | Entrega | Critérios de aceite principais | Dependências | Esforço relativo |
| --- | --- | --- | --- | --- |
| G01 | Medição do fluxo atual | Medir desafio criado, abertura de detalhe, aceite confirmado, expiração, liquidação e retorno; separar público de convite; não registrar palpites em analytics. | Nenhuma | P |
| G02 | Cartão do jogador | Exibir nome, apelido, nível e título na vitrine; abrir perfil de duelos com vitórias, derrotas e empates liquidados; não expor saldo total, CPF ou email; tratar jogador sem histórico. | G01 | M |
| G03 | Resumo de fim de duelo | Mostrar pontos de cada um, vencedor ou empate, desempate aplicado e tampinhas recebidas/devolvidas; separar prêmio total de ganho líquido; não anunciar pagamento enquanto estiver pendente. | G01 | M |
| G04 | Experiência e níveis | Aplicar elegibilidade, limite diário e unicidade por jogador/mini; mostrar progresso até o próximo nível e explicação de XP não concedido; processamento concorrente e repetido não duplica XP; falha de gamificação não desfaz nem bloqueia liquidação financeira. | G01 | M |
| G05 | Primeiras conquistas | Selos: Estreia na Mesa (primeiro duelo elegível), Primeiro Brinde (primeira vitória elegível), Na Mosca (todos os jogos válidos de uma mini acertados, mínimo dois jogos válidos) e Rodou o Boteco (cinco adversários distintos em duelos elegíveis); conceder cada selo uma vez. | G02, G04 | M |
| G06 | Personalização do cartão | Equipar um título e uma moldura desbloqueados; padrão para iniciantes; servidor recusa item não obtido; manter nome, apelido, valor e mini legíveis em 375 px. | G02, G04 | P |
| G07 | Liberação controlada | Habilitar por configuração, começar com grupo piloto, verificar histórico de XP e desligar a camada de gamificação sem interromper duelos ou movimentar tampinhas. | G02–G06 | M |

O MVP pode começar sem catálogo extenso: cinco níveis, quatro conquistas e uma
moldura por nível são suficientes para testar a hipótese. G03 e G04 devem ser
integrados no mesmo fechamento visual da disputa.

## Fase 2 — Rivalidade e reencontro

| ID | Entrega | Critérios de aceite principais | Dependências | Esforço relativo |
| --- | --- | --- | --- | --- |
| G08 | Histórico entre dois jogadores | Mostrar confrontos liquidados, vitórias de cada lado e empates; separar cancelados e expirados; respeitar visibilidade de convites e não publicar histórico privado a terceiros. | G02, G03 | M |
| G09 | Pedir revanche | Partir de duelo encerrado para novo convite ao mesmo adversário; exigir outra mini aberta, novos palpites quando necessário e confirmação explícita de valor e saldo; não reutilizar aceite nem aumentar valor automaticamente. | G08 | M |
| G10 | Missões semanais opcionais | Oferecer objetivos como concluir duas minis distintas ou enfrentar dois adversários diferentes; contar apenas duelos elegíveis; recompensas cosméticas, sem tampinhas e sem XP extra no primeiro ciclo; expiração sem perda de progresso permanente. | G04–G07 | M |
| G11 | Central de novidades no app | Avisar convite recebido, aceite, resultado, nível e conquista; deduplicar mensagens; respeitar preferências e limitar avisos; deep link abre a disputa correta. Email e push ficam para decisão posterior. | G03–G05 | M |

## Fase 3 — Temporadas, somente após validar o MVP

| ID | Entrega | Critérios de aceite principais | Dependências | Esforço relativo |
| --- | --- | --- | --- | --- |
| G12 | Álbum de temporada | Coleção temática mensal com conquistas cosméticas; progresso visível; preservar nível permanente e histórico após o fim; sem ranking ou prêmio financeiro. | G05, G10 | M |
| G13 | Operação de temporadas | Admin agenda tema, período e itens de catálogo; valida configuração antes de publicar; não altera objetivos de temporada ativa silenciosamente; mantém registro das mudanças. | G07, G12 | M |

P/M são tamanhos relativos, não estimativas de dias. Refinar após decisões de
produto e levantamento técnico.

## Critérios de sucesso

Instrumentar G01 antes de liberar o MVP. Comparar grupo piloto e grupo sem a
funcionalidade, quando houver volume suficiente; caso contrário, tratar a
comparação antes/depois como indício, sujeito ao calendário das minis.

- Retorno em sete dias de quem concluiu seu primeiro duelo.
- Proporção de desafios públicos aceitos antes do fechamento.
- Tempo mediano entre criação e aceite de desafio público.
- Quantidade de adversários distintos por jogador ativo na semana.
- Abandono entre abertura da janela, salvamento de palpites e aceite.
- Erros de liquidação, duplicações de recompensa e chamados sobre resultados.

Não usar aumento de valor comprometido ou de compra de tampinhas como indicador
principal de sucesso. Não fixar meta percentual antes de levantar a linha de base.

## Validação obrigatória

- Vitória, derrota, empate e vitória por desempate mantêm regras e saldos atuais.
- Vários duelos da mesma mini geram no máximo uma concessão de XP por jogador.
- Cancelamento, expiração e anulação completa não geram XP nem conquistas elegíveis.
- Anulação parcial mantém pontuação oficial e respeita elegibilidade de Na Mosca.
- Concorrência, replay e recuperação de falha não duplicam recompensas.
- Limite diário respeita fuso e data de fechamento, inclusive com liquidação tardia.
- Falha ou desativação da camada de gamificação não impede pagamento.
- Cartão e resumo funcionam em celular, teclado e movimento reduzido.
- Dados de convites privados não passam a ser públicos com perfis ou histórico.

## Decisões para aprovar antes de implementar

1. Validar o nome Arena do Boteco e os títulos dos cinco níveis.
2. Validar XP por participação elegível, limite diário e ausência de bônus por vitória.
3. Confirmar que as recompensas da primeira versão são apenas cosméticas.
4. Definir visibilidade e possibilidade de ocultação das estatísticas públicas.
5. Escolher participantes do piloto e período mínimo de observação conforme volume.

## Fora desta proposta

- Ranking competitivo de duelos, ligas com rebaixamento ou prêmios de temporada.
- Alteração da fórmula de pontuação ou dos critérios oficiais de desempate.
- XP por valor comprometido, gasto, compra, derrota ou criação de desafio.
- Recompensas aleatórias, caixas-surpresa, sequência diária com penalidade ou
  incentivo para recuperar uma derrota aumentando o valor do próximo duelo.
- Chat aberto, grupos, torneios eliminatórios e duelos com mais de dois jogadores.
- Resultados esportivos ao vivo: o fluxo segue dependendo da confirmação do Admin.

Recomendação: refinar e entregar G01–G07 primeiro. Decidir G08–G13 com evidência
de uso e retorno, em vez de construir toda a camada de uma vez.
