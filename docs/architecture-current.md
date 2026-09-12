# Arquitetura Atual

_Revisado em 12 de setembro de 2026._

## Repositórios

- `boteco12-api`: API Node.js/Express, regras de negócio e persistência
- `boteco12-frontend`: aplicação web React/Vite
- `boteco12-infra`: infraestrutura e configuração de implantação

## Backend

A API usa TypeScript, Express, Prisma, PostgreSQL e `express-session`. O ponto de
entrada é `src/index.ts`; rotas, controllers, services, repositories e
middlewares separam a camada HTTP, regras de negócio, persistência e controle de
acesso.

O schema cobre usuários, rodadas, escolhas, pontuação, rankings, Mesas e
convites, assinaturas, carteira e razão financeira, benefícios, pagamentos,
papéis, permissões, auditoria, jobs, locks e feature flags. As migrations e seeds
ficam versionadas em `prisma/`.

Principais contratos ativos:

- sessão: `/api/auth/login`, `/api/auth/logout` e `/api/me`
- rodada aberta e partidas: `/api/rounds/open` e `/api/rounds/:roundId/matches`
- escolhas: `/api/tickets` e `/api/tickets/current`
- rankings: `/api/rankings/*`
- Mesas: `/api/mesas/*`
- administração de rodadas: `/api/admin/rounds/*`
- jobs operacionais: rotas internas autenticadas

As rotas privadas usam os middlewares de autenticação e, quando aplicável,
autorização administrativa. A proteção também abrange o envio e a consulta de
escolhas.

## Frontend

O frontend usa React 19, Vite, TypeScript, React Router 7, Tailwind CSS 4 e Axios.
Os pontos centrais são:

- `src/main.tsx`: bootstrap da aplicação
- `src/app/router.tsx`: árvore de rotas e guards
- `src/app/http.ts`: cliente HTTP, cookies de sessão e normalização de erros
- `src/app/AuthProvider.tsx`: estado e operações de autenticação
- `src/app/auth.tsx`: contrato do contexto e hook `useAuth`

`AuthProvider.tsx` e `auth.tsx` são partes complementares da mesma
implementação, não providers concorrentes. O frontend usa cookies com
`withCredentials`, inicia a sessão por `/api/me` e encerra o estado local quando
o interceptor recebe 401. Falhas transitórias ao atualizar o perfil não removem
uma sessão válida.

Os serviços em `src/modules/` concentram os contratos HTTP por domínio. As telas
ativas de dashboard, ranking, escolhas e administração consomem a instância
canônica de Axios, sem token manual nem URLs de API hardcoded.

## Integração e operação

Os contratos ativos de autenticação, rodadas, partidas, escolhas, rankings e
administração estão alinhados entre frontend e backend. Em particular:

- a rodada atual vem de `/api/rounds/open`
- `/api/tickets/current` existe e carrega as escolhas da rodada aberta
- `POST /api/tickets` é autenticado
- `GET /api/admin/rounds` existe e abastece a tela administrativa
- o dashboard usa exclusivamente a sessão por cookie

O tratamento de erros diferencia ausência legítima de dados de indisponibilidade
da API nos fluxos principais. A matriz detalhada e os pontos de manutenção ficam
em `docs/integration-matrix.md`.

## Direção arquitetural

A arquitetura atual está consolidada em três repositórios, sessão por cookie,
contratos HTTP canônicos e migrations versionadas. As prioridades contínuas são
manter documentação e testes sincronizados com os contratos, revisar migrations
antes de cada release e preservar observabilidade, autorização e idempotência
nos fluxos operacionais.
