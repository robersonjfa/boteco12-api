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

Não são coletados: endereço completo, CEP, coordenadas, GPS, localização por IP
ou qualquer inferência silenciosa.

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
- Verificação de residência, CEP ou entrega por região.
- Geolocalização por GPS, raio ou distância em quilômetros.
- Múltiplas cidades/estados na mesma Mesa, bairros e mapas.
- Notificações por proximidade e ranking regional separado.
