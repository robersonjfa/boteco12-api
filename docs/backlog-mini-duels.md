# Boteco12 - Duelos por tampinhas em mini rodadas

Versão 0.2 | 06/11/2026 | Regras e backlog para alinhamento, antes da implementação

Esta versão consolida as respostas do PO e substitui as propostas correspondentes da versão 0.1. Não representa início da implementação.

## Atualização da execução - 06/11/2026

Implementação autorizada posteriormente pelo usuário. B01 a B10 implementados e
validados localmente; release de produção em preparação. Código e operação estão
documentados em `boteco12-api/docs/mini-duels.md`.

- API: testes em PostgreSQL e HTTP cobrem saldo, concorrência, convite, prazo,
  imutabilidade, cancelamento, expiração, apuração e pagamentos idempotentes.
- Frontend: formulários de minis no Admin e área de duelos no cliente; E2E cobre
  criação, palpites definitivos, convite, aceite público e histórico.
- Minis usam escolhas simples 1/X/2 e o calculador oficial (+1 por acerto, 0 por
  erro), sem concessão ou consumo de multiplicadores. Os desempates existentes
  são reutilizados, incluindo cadastro mais antigo; não consultam ranking.
- P01 operacionalizado pela confirmação definitiva: Admin revisa resultados antes
  de confirmar e marca C para ocorrências invalidadas, com zero para ambos.
  Resultados confirmados não podem ser trocados por reenvio; após pagamento não
  existe recálculo nem cobrança retroativa automática.
- Publicação exige migration aditiva com backup e verificação pelo runbook, antes
  do release da API/worker e do frontend.

## 1. Objetivo e escopo

Permitir duelos entre dois usuários por tampinhas, usando mini rodadas publicadas pela administração. As minis contêm 2 ou 3 jogos, com previsão operacional de 2 ou 3 minis por dia. Não participam de nenhum ranking.

O produto reutiliza a carteira de tampinhas, a pontuação e os critérios de desempate existentes. A primeira versão depende do Admin para a confirmação dos resultados; após essa confirmação e o encerramento da mini, o sistema calcula o resultado do duelo e distribui as tampinhas.

## 2. Regras consolidadas

| ID | Regra |
| --- | --- |
| RN01 | O Admin cria e publica minis com 2 ou 3 jogos. A previsão de 2 ou 3 minis por dia é uma programação operacional, sem criação automática nesta versão. |
| RN02 | Cada duelo usa uma mini existente e admite exatamente dois usuários distintos. |
| RN03 | A entrada pode ocorrer por convite direto ou por desafio público. No convite, apenas o destinatário pode aceitar; no público, apenas um adversário pode ocupar a vaga. |
| RN04 | Todo duelo exige valor positivo em tampinhas. Não existe duelo gratuito. |
| RN05 | Os dois participantes comprometem o mesmo valor. O vencedor recebe a soma integral, sem taxa, mantendo a proposta anterior aprovada pelo PO. |
| RN06 | O saldo disponível limita o valor e a quantidade de duelos simultâneos. Não há teto adicional de quantidade definido pelo produto. |
| RN07 | O valor do criador é reservado ao criar; o do adversário é reservado ao aceitar. Uma reserva não pode financiar outro duelo. |
| RN08 | Cada usuário salva seus palpites dos 2 ou 3 jogos na mini. Os palpites pertencem ao usuário naquela mini e são usados nos seus duelos vinculados a ela. |
| RN09 | Após salvar, os palpites não podem ser editados, alterados ou substituídos, mesmo antes do fechamento. Isso também vale para palpites já usados em duelos aceitos. |
| RN10 | Criar e aceitar um duelo exige palpites completos e salvos, saldo suficiente e prazo aberto. |
| RN11 | O fechamento ocorre exatamente 1 hora antes do horário de início da primeira partida da mini, seguindo a rodada normal. A partir do fechamento, não se pode salvar palpites, criar nem aceitar duelos. |
| RN12 | Os palpites permanecem ocultos ao adversário até o fechamento, conforme a proposta anterior aprovada. |
| RN13 | A pontuação e a sequência dos desempates seguem as regras atuais do sistema. Nenhum critério depende de ranking. |
| RN14 | Se todos os critérios terminarem empatados, cada participante recebe suas próprias tampinhas de volta. |
| RN15 | Jogo adiado, cancelado ou interrompido vale 0 pontos para ambos. Não haverá espera pela realização posterior desse jogo para dar pontos, conforme a regra informada pelo PO. |
| RN16 | O tratamento de resultado corrigido precisa de uma confirmação de redação antes da implementação: a resposta do PO agrupou esse caso com as ocorrências que dão 0 pontos. Ver pendência P01. |
| RN17 | O Admin confirma os resultados nesta versão. O sistema apura o vencedor após o encerramento e a confirmação dos resultados e credita o prêmio ou executa a devolução. |
| RN18 | Se ninguém aceitar até o fechamento, o duelo expira e o valor reservado volta ao criador. |
| RN19 | O criador pode cancelar antes do aceite, com devolução da reserva. Após o aceite, não há cancelamento unilateral. |
| RN20 | Minis e duelos não modificam pontos, posições ou prêmios de nenhum ranking. |
| RN21 | Reservas, devoluções e pagamentos ficam registrados com vínculo ao duelo. Repetir a mesma operação ou apuração não pode duplicar movimentações. |
| RN22 | Jogos, prazos e regras de uma mini com participação ativa não podem ser modificados silenciosamente. Qualquer exceção precisa preservar os compromissos já assumidos. |

## 3. Fluxo consolidado

1. Admin cadastra os jogos e publica a mini.
2. Usuário escolhe a mini, registra todos os palpites e salva definitivamente.
3. Usuário cria um duelo público ou por convite, informa um valor positivo e compromete suas tampinhas.
4. Adversário salva seus próprios palpites e aceita; o sistema reserva o mesmo valor e confirma o duelo.
5. Uma hora antes da primeira partida, o sistema fecha as participações, revela os palpites e expira os desafios sem aceite, devolvendo as reservas.
6. Os jogos acontecem. Ocorrências cobertas pela regra de anulação valem 0 para os dois participantes.
7. Admin confirma os resultados e as ocorrências; a mini é encerrada para apuração.
8. Sistema calcula pontos, aplica os desempates e define o desfecho.
9. Sistema entrega todo o prêmio ao vencedor ou devolve as reservas em empate completo. O histórico registra o encerramento, sem alterar rankings.

## 4. Backlog da primeira versão

Todos os itens abaixo estão em alinhamento. A sequência indica dependências de entrega, não uma estimativa de esforço ou prazo.

### B01 - Publicar e administrar mini rodadas

**Entrega:** área administrativa para cadastrar e publicar minis e consultar sua situação.

**Critérios de aceite:**
- Exigir exatamente 2 ou 3 jogos por mini, com horários válidos.
- Calcular e exibir o fechamento 1 hora antes da primeira partida.
- Permitir à operação programar 2 ou 3 minis por dia, sem exigir geração automática.
- Preservar os jogos e as regras das minis que já tenham participação ativa.

**Dependência:** nenhuma funcional; validar o reaproveitamento do cadastro de jogos atual durante o planejamento técnico.

### B02 - Consultar minis e salvar palpites definitivos

**Entrega:** lista de minis, detalhes dos jogos, prazo e formulário de palpites.

**Critérios de aceite:**
- Exigir palpite em todos os jogos antes de salvar.
- Informar claramente, antes da confirmação, que salvar é definitivo.
- Impedir qualquer edição posterior, inclusive por chamadas diretas ao sistema.
- Reutilizar o conjunto de palpites do usuário na mini em todos os seus duelos dessa mini.
- Recusar o salvamento quando o prazo já estiver encerrado.
- Ocultar os palpites dos adversários até o fechamento.

**Dependência:** B01.

### B03 - Reservar e movimentar tampinhas com segurança

**Entrega:** usar a carteira existente para reservas, liberações e prêmios vinculados aos duelos.

**Critérios de aceite:**
- Distinguir saldo disponível de saldo comprometido.
- Recusar valores nulos, negativos, gratuitos ou superiores ao saldo disponível, respeitando a unidade da carteira atual.
- Impedir uso simultâneo das mesmas tampinhas em operações concorrentes.
- Registrar cada movimentação com identificação do duelo e permitir conferir seu histórico.
- Garantir que uma tentativa recusada não deixe saldo reservado nem participação parcial.
- Impedir duplicação de reserva, liberação ou prêmio em novas tentativas da mesma operação.

**Dependência:** levantamento da carteira atual. Pode ser planejado junto de B01 e B02.

### B04 - Criar duelo público ou por convite

**Entrega:** criação do desafio a partir de uma mini aberta.

**Critérios de aceite:**
- Exigir mini aberta, palpites completos salvos e valor positivo com saldo suficiente.
- Reservar o valor e publicar o desafio como uma única operação consistente.
- Permitir escolher público ou convite e, no convite, identificar um usuário destinatário distinto do criador.
- Mostrar valor individual, prêmio total, jogos e prazo antes de confirmar.
- Não aplicar limite artificial de duelos simultâneos: cada criação exige nova reserva disponível.

**Dependências:** B01, B02 e B03.

### B05 - Encontrar e aceitar duelos

**Entrega:** lista de desafios públicos, acesso a convites e confirmação do aceite.

**Critérios de aceite:**
- Permitir que apenas o destinatário aceite um convite direto.
- Impedir que o criador aceite o próprio desafio.
- Exigir palpites salvos, prazo aberto e saldo para o mesmo aporte do criador.
- Reservar o saldo do adversário e confirmar o duelo de forma consistente.
- Quando duas pessoas tentarem aceitar um desafio público, confirmar apenas uma, sem cobrar a outra.
- Exibir prêmio total sem taxa e as regras de pontuação, desempate e devolução.

**Dependências:** B04 e B03.

### B06 - Fechar participações, expirar e cancelar desafios

**Entrega:** aplicação automática do prazo e devolução das reservas de desafios sem aceite.

**Critérios de aceite:**
- Aplicar o fechamento exatamente 1 hora antes da primeira partida, independentemente de a tela estar aberta.
- Após o prazo, recusar criação, aceite e salvamento de palpites.
- Expirar desafios sem adversário e devolver o valor uma única vez.
- Permitir cancelamento pelo criador somente enquanto não houve aceite, devolvendo a reserva uma única vez.
- Resolver tentativas simultâneas de aceite, expiração e cancelamento sem saldo ou estado inconsistente.
- Revelar os palpites dos duelos confirmados apenas quando fechar a mini.

**Dependências:** B04 e B05.

### B07 - Registrar resultados e ocorrências pelo Admin

**Entrega:** operação administrativa para confirmar resultados e o encerramento da mini.

**Critérios de aceite:**
- Registrar os resultados e identificar jogos adiados, cancelados ou interrompidos.
- Atribuir 0 pontos a ambos nesses jogos, sem projetar um vencedor para a partida.
- Não iniciar premiação com resultados ou ocorrências ainda sem confirmação.
- Registrar a confirmação administrativa que permite a apuração definitiva.
- Definir o comportamento de resultados corrigidos conforme P01 antes de concluir este item.

**Dependências:** B01; decisão P01.

### B08 - Apurar duelos e distribuir tampinhas

**Entrega:** cálculo do resultado e liquidação da disputa após a confirmação administrativa.

**Critérios de aceite:**
- Usar a pontuação e a sequência de desempates existentes, sem consultar posições em rankings.
- Calcular com os palpites salvos definitivamente na mini.
- Creditar ao vencedor a soma integral dos dois aportes.
- Devolver a cada participante o próprio aporte em empate após todos os critérios.
- Se todos os jogos valerem 0, aplicar as regras de empate e devolver as reservas quando os critérios não distinguirem os participantes.
- Impedir premiação ou devolução duplicada em reprocessamentos.
- Manter resultado e movimentações consistentes se a execução falhar e precisar ser retomada.

**Dependências:** B03, B06 e B07.

### B09 - Acompanhar duelos e consultar histórico

**Entrega:** área de meus duelos e detalhes de cada disputa.

**Critérios de aceite:**
- Exibir adversário ou vaga aberta, mini, valor individual, prêmio total e prazo.
- Diferenciar aguardando adversário, confirmado, em andamento, em apuração, encerrado, expirado e cancelado.
- Após o fechamento, exibir os palpites e a pontuação dos participantes, sinalizando resultados parciais quando existirem.
- No encerramento, mostrar vencedor, desempate aplicado ou motivo da devolução e movimentações correspondentes.
- Não apresentar pontuação das minis como pontuação de ranking.

**Dependências:** B04 a B08 para a experiência completa; a tela pode ser construída por etapas.

### B10 - Validar a jornada completa antes de liberar

**Entrega:** verificação funcional integrada das regras do produto e das movimentações de saldo.

**Critérios de aceite:**
- Validar convite e duelo público, prazo de 1 hora e bloqueio de edição após salvar.
- Validar saldo insuficiente, múltiplas reservas e aceite simultâneo.
- Validar vitória, desempate, empate completo e jogos com 0 pontos.
- Validar expiração, cancelamento e repetição da apuração sem pagamento duplicado.
- Conferir que nenhum resultado de mini alterou rankings existentes.
- Conferir histórico e conservação das tampinhas: reserva, prêmio e devolução sem criação ou perda indevida de saldo.

**Dependências:** B01 a B09 e decisões pendentes resolvidas.

## 5. Ordem sugerida de entrega

1. Confirmar a redação pendente de resultados corrigidos e registrar as regras atuais que serão reutilizadas.
2. Preparar administração de minis, palpites definitivos e movimentações da carteira: B01, B02 e B03.
3. Concluir criação, convites, desafios públicos, aceite e fechamento: B04, B05 e B06.
4. Concluir resultados administrativos, apuração, premiação e histórico: B07, B08 e B09.
5. Validar a jornada integrada e só então liberar: B10.

O levantamento técnico posterior deverá localizar a carteira, a pontuação, os desempates e a regra de horário existentes. Este documento não escolhe tabelas, endpoints, serviços ou tecnologias.

## 6. Pontos para encerrar o alinhamento

### P01 - Correção de resultado

A resposta do PO colocou jogos com resultados corrigidos na mesma regra de 0 pontos. É necessário distinguir duas situações: uma partida invalidada, que vale 0 para ambos, e uma correção de placar lançado incorretamente. Confirmar se a correção de placar também zera a partida ou se o placar corrigido passa a valer para a apuração. Também é necessário definir o tratamento de correção após uma premiação já executada.

Até essa confirmação, a versão não assume um recálculo automático nem uma cobrança retroativa.

### Esclarecimento sobre a origem das tampinhas

A pergunta anterior queria entender se as tampinhas são recebidas no app, compradas ou trocáveis por algum benefício. Não é necessário criar um novo mecanismo para os duelos: a proposta desta versão é consumir o saldo da carteira que já existe. Compra, transferência e resgate novos ficam fora do escopo; esta decisão de escopo não altera funcionalidades existentes.

## 7. Fora da primeira versão

- Confirmação automática de resultados por uma fonte externa, prevista como evolução futura pelo PO.
- Geração automática da programação diária de minis.
- Novos mecanismos de compra, transferência ou resgate de tampinhas.
- Ranking de minis, pontuação de minis em rankings existentes ou premiação de ranking por duelos.
- Duelo gratuito, participantes adicionais ou taxa sobre o prêmio.
- Edição de palpites depois de salvar.

## 8. Exemplos para validação do PO

| Cenário | Resultado esperado |
| --- | --- |
| Ana cria duelo de 50; Bruno aceita com 50; Ana vence | Ana recebe 100; nenhum ranking é alterado. |
| Ana cria duelo de 50 e ninguém aceita até o fechamento | O desafio expira e as 50 voltam para Ana. |
| Ana e Bruno empatam em todos os critérios | Cada um recebe suas 50 de volta. |
| Um jogo da mini é cancelado | Esse jogo vale 0 para ambos; os demais seguem a apuração normal. |
| Usuário tem 100 disponíveis e cria dois duelos de 50 | Fica sem saldo disponível para criar ou aceitar outro duelo com valor positivo até obter saldo livre. |
| Usuário salva os palpites e tenta mudar antes do prazo | Alteração recusada: salvar é definitivo. |
| Primeira partida às 20h | Participações fecham às 19h. |
| A mesma apuração é executada novamente | Não ocorre novo pagamento nem nova devolução. |

