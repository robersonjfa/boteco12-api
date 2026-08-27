# Decisoes da Regra Oficial de Mesas v2

Fonte analisada: `Regra_Oficial_Criacao_e_Funcionamento_das_Mesas_v2.pdf`.

Este documento registra as decisoes de produto que esclarecem ou substituem
trechos ambiguos do PDF. Ele deve ser atualizado antes da implementacao das
novas regras.

## Mesa Tampinhas

- A duracao deve ser definida obrigatoriamente por quantidade de rodadas.
- Nao e exigida uma data limite informada pelo criador.
- A data final e calculada automaticamente pelo sistema quando a ultima rodada
  prevista para a Mesa for apurada.

## Mesa Free

- A quantidade de rodadas e obrigatoria.
- A data limite tambem e obrigatoria e funciona como protecao temporal.
- A Mesa termina quando ocorrer primeiro:
  - a apuracao da ultima rodada prevista; ou
  - o alcance da data limite.

## Mesa Patrocinada

- Somente um administrador pode criar uma Mesa Patrocinada.
- O administrador escolhe como a Mesa termina:
  - por quantidade de rodadas; ou
  - por data.
- Quando a duracao for por rodadas, a data de finalizacao nao e obrigatoria.
- Quando a duracao for por data, a data de finalizacao e obrigatoria.
- A entrada e uma configuracao independente do patrocinio:
  - entrada gratuita; ou
  - entrada paga em Tampinhas, com valor definido pelo administrador.
- A taxa da plataforma de 10% incide somente sobre as Tampinhas cobradas nas
  entradas dos participantes.
- Mesa Patrocinada com entrada gratuita nao gera taxa de plataforma sobre o
  valor patrocinado.
- O valor aportado pelo patrocinador nao sofre a taxa de entrada de 10%.

### Formula financeira

Para Mesa Patrocinada com entrada em Tampinhas:

```text
arrecadacao_das_entradas = participantes_pagos * custo_de_entrada
taxa_da_plataforma = floor(arrecadacao_das_entradas * 10%)
entradas_liquidas = arrecadacao_das_entradas - taxa_da_plataforma
```

O aporte do patrocinador deve permanecer contabilmente separado das entradas.
Na formacao da recompensa, o aporte patrocinado e somado as entradas liquidas:

```text
recompensa_total = aporte_do_patrocinador + entradas_liquidas
```

## Pendencias de decisao

- Definir a politica de cancelamento e reembolso para Mesas Patrocinadas com
  entrada em Tampinhas.
