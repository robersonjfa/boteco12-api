# Matriz de Integração API x Frontend

_Revisada em 12 de setembro de 2026._

## Legenda

- `OK`: contrato ativo e alinhado
- `INTERNO`: endpoint restrito à operação da plataforma

## Fluxos principais

| Domínio | Frontend | Backend | Status | Observação |
| --- | --- | --- | --- | --- |
| Login | `POST /api/auth/login` | `POST /api/auth/login` | OK | Sessão baseada em cookie |
| Logout | `POST /api/auth/logout` | `POST /api/auth/logout` | OK | Limpa sessão no servidor e no provider |
| Usuário autenticado | `GET /api/me` | `GET /api/me` | OK | Bootstrap e atualização do perfil |
| Rodada aberta | `GET /api/rounds/open` | `GET /api/rounds/open` | OK | Retorna a rodada ativa e seus jogos |
| Partidas da rodada | Não consumido diretamente | `GET /api/rounds/:roundId/matches` | OK | Contrato auxiliar; a tela recebe os jogos pela rodada aberta |
| Escolhas atuais | `GET /api/tickets/current` | `GET /api/tickets/current` | OK | Protegido por autenticação |
| Enviar escolhas | `POST /api/tickets` | `POST /api/tickets` | OK | Serviço canônico `TicketService.submit` |
| Histórico de escolhas | `GET /api/tickets` | `GET /api/tickets` | OK | Paginação por cursor |
| Ranking mensal | `GET /api/rankings/monthly` | `GET /api/rankings/monthly` | OK | Suporta os escopos ativos da interface |
| Perfil e preferências | `/api/me` e rotas de preferências | Mesmos contratos | OK | Sessão por cookie, sem token manual |
| Mesas do usuário | `/api/mesas/*` | `/api/mesas/*` | OK | Lista, convite, entrada, publicação e detalhes |
| Listar rodadas admin | `GET /api/admin/rounds` | `GET /api/admin/rounds` | OK | Protegido por autenticação e autorização |
| Criar rodada admin | `POST /api/admin/rounds` | `POST /api/admin/rounds` | OK | Contrato canônico da tela administrativa |
| Abrir rodada admin | `POST /api/admin/rounds/:roundId/open` | Mesmo endpoint | OK | Operação autorizada |
| Definir resultado admin | `POST /api/admin/rounds/:roundId/result` | Mesmo endpoint | OK | Operação autorizada |
| Fechar rodada admin | `POST /api/admin/rounds/:roundId/close` | Mesmo endpoint | OK | Operação autorizada |
| Jobs de rodada e ranking | Não consumidos pela UI | Rotas internas | INTERNO | Exigem credencial operacional |

## Decisões vigentes

### Autenticação

`AuthProvider.tsx` mantém o estado; `auth.tsx` declara o contexto e expõe
`useAuth`. O interceptor HTTP emite `f12:unauthorized` somente em 401, que é o
sinal canônico para limpar a sessão. Timeout, erro de rede e 5xx durante uma
atualização de `/api/me` preservam o usuário atual.

### Rodadas e escolhas

A tela de escolhas usa `/api/rounds/open`, `/api/tickets/current` e
`POST /api/tickets`. O método público de envio é `TicketService.submit`; não há
alias de compatibilidade. Os contratos de autenticação e payload estão
protegidos e alinhados.

### Dashboard, ranking e administração

As telas ativas usam o cliente `http` central e sessão por cookie. A listagem e
as mutações administrativas de rodadas existem sob `/api/admin/rounds`; não há
dependência ativa das antigas URLs absolutas ou de um token no contexto.

## Regra de manutenção

Esta matriz deve ser revisada junto com qualquer alteração de rota, middleware
de autenticação ou método público dos services do frontend. Uma linha só pode
ser marcada como `OK` quando rota, proteção, payload e consumidor ativo forem
verificados nos dois repositórios.
