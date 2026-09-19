# Matriz de autorização — MVP V1

Esta é a matriz canônica do SEC-007. As operações administrativas usam
`authorize`, que consulta exclusivamente o vínculo em `UserAdminRole`. Existe
um único nível administrativo, `ADMIN`, com todas as capacidades. Os códigos de
permissão permanecem como identificadores das ações e da auditoria, não como
castas diferentes de administrador. A rota `/api/admin/context` informa essas
capacidades para orientar a navegação administrativa.
`User.role = ADMIN` não concede acesso administrativo.

| Operação | Permissão |
| --- | --- |
| Consultar usuários | `USER_READ` |
| Consultar e-mail, CPF e telefone sem máscara | `USER_PII_READ` |
| Alterar papéis administrativos | `USER_WRITE` |
| Bloquear usuário | `USER_BLOCK` |
| Desbloquear usuário | `USER_UNBLOCK` |
| Alterar assinatura de usuário | `USER_PLAN_WRITE` |
| Consultar auditoria e histórico | `AUDIT_READ` |
| Consultar carteira, ledger, benefícios e assinaturas | `FINANCE_READ` |
| Creditar ou debitar carteira e benefícios | `FINANCE_EXECUTE` |
| Consultar rodadas e times | `COMPETITION_READ` |
| Criar ou editar rodadas e times | `COMPETITION_WRITE` |
| Abrir, cancelar, fechar ou lançar resultado de rodada | `COMPETITION_EXECUTE` |
| Fechar/liquidar Mesa de outro proprietário | `COMPETITION_EXECUTE` |
| Executar job interno autorizado | `JOB_EXECUTE` |

O proprietário pode fechar a própria Mesa por autorização de domínio. Um
operador que não seja proprietário precisa entrar pela área administrativa; as
concessões e negações sensíveis continuam auditadas.

`USER_READ` retorna e-mail, CPF e telefone completos somente dentro da área
administrativa. A consulta individual por `USER_PII_READ` também permanece
auditada. Vínculos legados chamados `SUPERADMIN` são aceitos temporariamente,
mas normalizados como `ADMIN` e não podem ser atribuídos novamente.
