# Capacidade mínima da Mesa — 2026-10-16

O schema HTTP agora exige pelo menos dois lugares, como já exigiam
`mesa-schedule-rules.ts` e `MesaBuilderForm.tsx`. A validação retorna 400
`validation_error` com issue em `maxParticipants` antes do controller.
O máximo existente de 1.000.000 e a capacidade ausente/null no modo DATE
permanecem compatíveis. Nenhuma migration ou mudança financeira.

## TDD

- RED `b4827e2`: build passou; 26/31 testes passaram. Os cinco caminhos
  HTTP aceitaram capacidade um no schema e alcançaram o handler de teste
  (201 em vez de 400). Esse handler é sintético; o domínio real já rejeitava um.
- GREEN `eed7e0b`: o mesmo conjunto passou 31/31 após trocar `positive()`
  por `min(2)` na capacidade. Inclui todas as categorias, limites e modo DATE.
- Regressão competition: 189/189; PostgreSQL inicialização: 18/18.
- Build TypeScript, auditoria da cadeia (20 migrations, zero erros/avisos) e
  política de migrations passaram.

## API autenticada e PostgreSQL local

Dados sintéticos em `127.0.0.1:55433/b12_mesa_e2e_20261016`, API em 3102.
Login real de administrador e usuário PRO. Sem mocks e sem mutação de carteira.

Trinta requisições inválidas cobrem capacidade um, zero, negativa, fracionária,
null e ausente nos cinco caminhos: criação PRO, criação admin, criação legada,
edição PRO e edição admin. Todas retornaram 400 com o campo correto; contagem
de Mesas e snapshots das duas Mesas de controle permaneceram iguais.
Duas criações e duas edições válidas com capacidade dois passaram.
Os 32 checks e os IDs sintéticos constam no JSON ao lado.

## Próximo incremento: datas passadas

A tela usa `min={today}` para início; o backend só exige futuro em AT_START.
Em DRAFT/NOW, o schema e serviços permitem início anterior. Não foi localizada
uma política de produto explícita nos documentos consultados. O modelo de
validação fornecido, linha 91, diz: “Não presuma a política para datas passadas
caso ela não esteja documentada.”

Proposta submetida ao usuário: impedir dias anteriores em novas Mesas,
comparando o dia em America/Sao_Paulo e permitindo hoje. Preservar a data
histórica inalterada de uma Mesa na edição; uma alteração da data deve obedecer
à regra nova. AT_START continua exigindo início futuro. Alternativa: documentar
início passado permitido em DRAFT/NOW e retirar a restrição da tela nesses modos.
Nenhuma dessas opções foi implementada neste PR; aguarda decisão de negócio.

PR empilhado sobre a correção HTTP da premiação. Sem merge ou deploy.
