# Backlog especifico — Regionalizacao opcional de Mesas

Data da decisao: 2026-10-11

Status: Backlog aprovado para refinamento antes da implementacao

Prioridade sugerida: P2

Frentes: Produto / Backend / Frontend mobile-first / Dados / Privacidade

## Objetivo

Permitir que uma Mesa tenha contexto nacional, estadual ou municipal para
aproximar clientes, comunidades, bares e patrocinadores locais, sem criar
barreira obrigatoria no cadastro, na criacao ou na participacao.

## Decisoes fechadas

- regionalizar uma Mesa e opcional
- toda nova Mesa continua nacional por padrao
- todas as Mesas existentes continuam nacionais depois da migracao
- informar localizacao no perfil tambem e opcional
- no MVP, a regiao melhora descoberta, filtros, ordenacao e contexto visual
- no MVP, a regiao nao bloqueia a entrada de clientes de outras localidades
- Mesas regionais continuam acessiveis em `Todas`, respeitando as regras atuais
  de publicacao, inscricao, plano, saldo e capacidade
- nao usar GPS, localizacao automatica por IP nem coordenadas precisas
- regionalizacao nao altera o ciclo oficial de nenhuma categoria de Mesa

## Proposta de abrangencia

### Nacional

- comportamento padrao e equivalente ao atual
- visivel e recomendavel para clientes de qualquer localidade
- nao exige localizacao no perfil do criador nem do participante

### Estadual

- identifica uma unidade federativa
- recebe afinidade para clientes do mesmo estado
- continua aberta para clientes de outros estados no MVP

### Municipal

- identifica um municipio e sua unidade federativa
- recebe maior afinidade para clientes do mesmo municipio
- continua aberta para clientes de outros municipios no MVP

## Jornada de criacao

Adicionar uma etapa curta e opcional ao construtor de Mesa:

1. Pergunta: `Quem voce quer reunir?`
2. Opcoes:
   - `Todo o Brasil` — selecionada por padrao
   - `Meu estado`
   - `Minha cidade`
3. Se o cliente ainda nao informou localizacao, permitir:
   - manter a Mesa nacional; ou
   - informar estado e municipio antes de regionalizar
4. Exibir um resumo antes de salvar, por exemplo:
   - `Abrangencia: Brasil`
   - `Abrangencia: Santa Catarina`
   - `Abrangencia: Joacaba · SC`

Regras por perfil:

- cliente pode usar a propria cidade ou estado cadastrados
- admin pode escolher qualquer estado ou municipio para Mesas operacionais e
  patrocinadas
- mudar a abrangencia de uma Mesa segue as mesmas restricoes atuais de edicao:
  depois de publicada, a configuracao nao pode ser alterada de forma a enganar
  participantes ja inscritos

## Jornada de descoberta mobile-first

Adicionar ao fluxo atual de Mesas:

- chip frequente `Perto de mim` quando o perfil possuir localizacao
- filtros `Minha cidade`, `Meu estado` e `Todo o Brasil` no bottom sheet
- identificacao discreta no card, como `Joacaba · SC`
- identificacao completa nos detalhes e regras da Mesa
- contador de filtro regional coerente com a paginacao server-side
- preservacao do filtro ao abrir uma Mesa e voltar para a listagem

`Para voce` deve continuar separando estado e elegibilidade antes de aplicar a
afinidade regional:

1. Mesas em que o cliente ja participa
2. Mesas abertas em que pode entrar agora
3. Dentro do mesmo grupo de acesso, Mesas da cidade
4. Depois, Mesas do estado
5. Depois, Mesas nacionais e de outras regioes
6. Mesas futuras ou indisponiveis permanecem abaixo das oportunidades abertas

A afinidade regional nunca pode:

- esconder todas as Mesas abertas
- promover Mesa inelegivel como se o cliente pudesse entrar
- superar estados essenciais como `Participando`, `Lotada` ou `Inscricao encerrada`
- substituir o fallback atual por encerramento da inscricao e recencia

## Estados vazios e fallbacks

- usuario sem localizacao: manter descoberta atual e oferecer o filtro regional
  somente depois de informar cidade e estado
- nenhuma Mesa da cidade: mostrar Mesas do estado e nacionais
- nenhuma Mesa do estado: mostrar Mesas nacionais e demais Mesas abertas
- nenhuma Mesa regional aberta: nao apresentar uma tela vazia artificial
- Mesa regional acessada por link ou convite: permitir visualizacao e entrada
  pelas regras normais do MVP

## Modelo de dados proposto

Nao reutilizar `User.addressPreference`: esse campo representa preferencia de
tratamento e nao endereco.

### Usuario

Campos opcionais sugeridos:

- `countryCode` — iniciar com `BR`
- `stateCode` — sigla da unidade federativa
- `cityCode` — codigo oficial do municipio no IBGE
- `cityName` — snapshot para exibicao
- `locationUpdatedAt` — auditoria basica da ultima alteracao

### Mesa

Campos sugeridos apenas para rankings do tipo `BOLAO`:

- `regionScope`: `NATIONAL`, `STATE` ou `CITY`
- `countryCode`
- `stateCode`
- `cityCode`
- `cityName`

Regras de integridade:

- `NATIONAL` nao exige estado nem municipio
- `STATE` exige estado e nao aceita municipio
- `CITY` exige estado, codigo e nome do municipio
- registros existentes recebem `NATIONAL`
- indexar tipo, status, abrangencia, estado e municipio para preservar a busca
  paginada no banco
- usar codigo IBGE como identidade; nao usar cidade em texto livre como chave

## Contratos de API a evoluir

### Perfil

- leitura e atualizacao opcional da localizacao aproximada
- validacao server-side da combinacao estado/municipio
- nenhuma localizacao individual deve aparecer em listas publicas de usuarios

### Criacao e edicao de Mesa

- aceitar abrangencia e identificadores regionais opcionais
- aplicar `NATIONAL` quando os campos forem omitidos
- validar que cliente usa a propria regiao no MVP
- preservar a liberdade administrativa para escolher qualquer regiao

### Descoberta

Evoluir `GET /api/mesas/discover` com filtro regional server-side, sem carregar
todas as Mesas no navegador. Parametros candidatos:

- `region=ALL|NEARBY|STATE|CITY|NATIONAL`
- `stateCode`
- `cityCode`

Resposta candidata:

- `regionScope`
- `regionLabel`
- `regionMatch`: `CITY`, `STATE`, `NATIONAL`, `OTHER` ou `UNKNOWN`
- contagens regionais para os filtros

O backend permanece como fonte da ordenacao e da elegibilidade.

## Privacidade e seguranca

- coletar somente pais, estado e municipio; nao coletar endereco completo
- nao inferir localizacao silenciosamente por IP ou GPS
- explicar que a localizacao serve para personalizar descoberta de Mesas
- permitir remover ou alterar a localizacao sem perder acesso geral ao produto
- nao expor a localizacao do usuario nos cards, rankings ou participantes
- expor somente a abrangencia escolhida para a Mesa
- atualizar a matriz LGPD antes do deploy
- auditar mudancas administrativas de abrangencia

## Regras que nao mudam

### Mesa com Tampinhas

- nao exibe nem exige data final de inscricao
- fecha inscricoes quando atinge a capacidade maxima
- termina depois da quantidade configurada de rodadas
- cliente criador entra e paga ao publicar
- admin criador nao entra automaticamente

### Mesa Free

- preserva quantidade de rodadas e data limite
- termina no primeiro limite oficial atingido

### Mesa Patrocinada

- continua exclusiva para criacao pelo admin
- preserva as modalidades de encerramento e entrada existentes

## Fora do MVP

- Mesa exclusiva para moradores de uma regiao
- verificacao de residencia ou entrega por CEP
- geolocalizacao por GPS, raio ou distancia em quilometros
- multiplas cidades ou estados na mesma Mesa
- hierarquias por bairro
- mapas
- notificacoes push por proximidade
- ranking regional separado do ranking da Mesa
- precificacao, taxa ou recompensa diferente por regiao

## Sequencia recomendada de implementacao

1. Fechar contrato de localizacao e fonte oficial de municipios do IBGE.
2. Adicionar migration, baseline, constraints, indices e backfill nacional.
3. Evoluir perfil e contratos compartilhados.
4. Evoluir criacao e edicao de Mesa, mantendo nacional como padrao.
5. Adicionar filtro e afinidade regional na descoberta server-side.
6. Implementar chips, bottom sheet e identificacao regional no mobile.
7. Atualizar admin, matriz LGPD e auditoria.
8. Cobrir migracao, consultas PostgreSQL, regras de criacao e Playwright mobile.
9. Implantar primeiro sem exclusividade regional e medir o uso.

## Criterios de aceite do MVP

- criador conclui o fluxo sem interagir com regionalizacao
- Mesa sem escolha regional e salva como nacional
- Mesas existentes continuam funcionando e aparecem como nacionais
- cliente pode regionalizar voluntariamente para seu estado ou municipio
- admin pode selecionar qualquer estado ou municipio valido
- usuario sem localizacao continua usando toda a descoberta atual
- card regional mostra municipio/estado sem aumentar excessivamente sua altura
- `Para voce` usa afinidade regional sem esconder oportunidades nacionais
- `Todas` continua permitindo acesso a Mesas de qualquer regiao
- filtro e paginacao regional acontecem no servidor
- filtros permanecem ao navegar para o detalhe e voltar
- nenhuma regra de categoria, entrada, saldo, lotacao ou duracao muda
- localizacao individual nao aparece em rankings ou listas de participantes
- migration possui backfill seguro, baseline alinhada e indice de descoberta
- testes de banco e E2E mobile cobrem perfis com e sem localizacao

## Metricas de validacao

- percentual de clientes que informam localizacao voluntariamente
- percentual de novas Mesas regionalizadas
- conversao de lista para detalhe por afinidade regional
- conversao de detalhe para entrada em Mesas da cidade, estado e nacionais
- percentual de filtros regionais sem resultado
- tempo mediano para encontrar uma Mesa aberta
- taxa de fallback de cidade para estado e nacional
- distribuicao de Mesas por regiao, evitando concentracao invisivel

## Evolucao futura — Mesa regional exclusiva

Uma futura opcao `Somente pessoas desta regiao` deve ser tratada como outra
capacidade, nao como consequencia automatica da regionalizacao. Antes de
implementar, decidir:

- qual evidencia de residencia e suficiente
- se localizacao autodeclarada pode bloquear recompensa ou participacao
- como tratar mudanca de cidade depois da entrada
- como auditar tentativas de contorno
- como funcionam convite, patrocinio, retirada e entrega de recompensa
- quais textos legais e de privacidade sao necessarios

