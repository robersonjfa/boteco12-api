# Regionalização de Mesas — privacidade e LGPD

Documento de apoio ao item 41 do backlog (`backlog-mesas-regionalizacao.md`).
Vale para o MVP de abrangência nacional, estadual e municipal.

## Dados coletados

| Dado | Obrigatório | Finalidade | Observação |
|---|---|---|---|
| `countryCode` | não | contexto regional | inicia em `BR` |
| `stateCode` (UF) | não | afinidade estadual | sigla de 2 letras |
| `cityCode` (IBGE) | não | afinidade municipal | identidade do município |
| `cityName` | não | exibição | snapshot, não é chave |
| `locationUpdatedAt` | não | auditoria básica | atualizado a cada alteração |

Não são persistidos: endereço completo, CEP, coordenadas, GPS, localização por IP
ou qualquer inferência silenciosa.

Desde a evolução de 06/11/2026, o usuário pode consultar voluntariamente um CEP
para identificar município e UF. A API envia o CEP ao ViaCEP por HTTPS e valida
o município no catálogo oficial do IBGE. O CEP é usado apenas durante a consulta:
não fica no perfil, na Mesa, em cache de consultas de CEP ou em URLs dos nossos
endpoints. O logger não registra o corpo da requisição. Rua, bairro e demais
campos devolvidos pelo ViaCEP são descartados e não retornam ao navegador.

O catálogo municipal público do IBGE pode ser mantido em memória por 24 horas.
Esse cache contém apenas municípios, sem CEP nem associação com usuários.
Falha de consulta permite continuar por nome/UF. A consulta não comprova residência.

## Base e finalidade

- A localização é **opcional** e serve apenas para personalizar a descoberta de
  Mesas (filtros, ordenação e contexto visual).
- Informar localização nunca é condição para cadastro, criação ou participação.
- O cliente pode limpar ou alterar a localização a qualquer momento, sem perder
  acesso ao produto.

## Exposição

- A localização **individual** não aparece em cards, rankings, listas de
  participantes ou endpoints públicos.
- De uma Mesa, expõe-se apenas a abrangência escolhida (`regionLabel`), nunca a
  localização de quem participa.
- A API de administração pode ver a abrangência da Mesa para operação e
  auditoria; a localização do cliente não é exposta em listagens.

## Retenção e direitos

- A localização permanece enquanto o cliente mantiver o dado; limpar o campo
  remove estado, município e nome do município.
- O cliente acessa e edita o dado em `GET /api/me` e `PATCH /api/me`.
- Alterações administrativas de abrangência de Mesa são auditadas
  (`BOLAO_CREATED` / `BOLAO_UPDATED` com `regionScope`, `stateCode`, `cityCode`,
  `cityName`).

## Fora do MVP

- Mesa exclusiva para moradores de uma região.
- Verificação de residência ou entrega por região usando CEP.
- Geolocalização por GPS, raio ou distância em quilômetros.
- Múltiplas cidades/estados na mesma Mesa, bairros e mapas.
- Notificações por proximidade e ranking regional separado.
