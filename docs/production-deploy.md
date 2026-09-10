# Deploy de Produção

## Objetivo

Padronizar o deploy da API no EasyPanel sem depender de migrations automáticas no boot do container.

## Situação atual

A trilha histórica foi consolidada na baseline
`20260730000000_fantasy12_baseline_v2`. O banco existente mantém sua
estrutura e seus dados; somente o histórico técnico de
`_prisma_migrations` foi substituído de forma controlada.

## Decisão operacional

O container da API nao deve mais depender obrigatoriamente de `migrate deploy` no startup.

Em vez disso:

- o boot da API sobe normalmente
- migrations ficam controladas por `RUN_DB_MIGRATIONS=true` ou por execução manual no console

## Estratégia oficial de banco

Todos os ambientes usam a cadeia normal do Prisma.

### 1. Ambiente novo, banco vazio

Fluxo oficial:

```sh
npm run prisma:bootstrap:fresh
```

Esse comando valida que o banco está vazio, aplica `prisma migrate deploy`
e executa os seeds administrativos e da aplicação.

### 2. Ambiente existente

Fluxo oficial:

- subir a API com `RUN_DB_MIGRATIONS=false`;
- executar o preflight;
- aplicar `prisma migrate deploy`;
- confirmar `prisma migrate status`;
- publicar a nova imagem.

Em resumo, banco novo e banco existente evoluem por `migrate deploy`.

## Variáveis recomendadas no EasyPanel

### API

```env
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB?schema=public
SESSION_SECRET=change-me
COOKIE_SECURE=true
COOKIE_SAME_SITE=none
SESSION_IDLE_TTL_MIN=30
SESSION_ABSOLUTE_TTL_HOURS=24
REDIS_URL=redis://:PASSWORD@HOST:6379/0
FRONTEND_ORIGIN=https://boteco12.com
CORS_ALLOWED_ORIGINS=https://boteco12.com
INTERNAL_JOB_SECRET=change-me-too
RUN_DB_MIGRATIONS=false
MP_ACCESS_TOKEN=APP_USR-...
MP_WEBHOOK_SECRET=change-me-too
API_PUBLIC_URL=https://api.boteco12.com
```

## Primeiro deploy

1. subir o Postgres
2. subir a API com `RUN_DB_MIGRATIONS=false`
3. se for banco novo, rodar `npm run prisma:bootstrap:fresh`
4. se for banco existente, abrir o console da API no EasyPanel
5. diagnosticar o estado das migrations

## Observação importante sobre autenticação

A API exige `SESSION_SECRET` e `REDIS_URL`. As sessões são armazenadas no Redis,
possuem timeout ocioso renovável e expiração absoluta. O login não emite JWT.

## Comandos úteis no console da API

### Ver status das migrations

```sh
npm run prisma:migrate:status
```

### Aplicar migrations

```sh
npm run prisma:migrate:deploy
```

O diagnóstico específico da antiga migration `20260120_bolao_invites` foi
removido depois da consolidação da baseline.

## Fluxo recomendado

### Banco novo

1. API sobe com `RUN_DB_MIGRATIONS=false`
2. você roda `npm run prisma:bootstrap:fresh`
3. se houve mudança recente de schema, valide antes com `npm run prisma:schema:release:check`
3. valida `/health`
4. valida login e seeds iniciais

### Banco existente

1. API sobe com `RUN_DB_MIGRATIONS=false`
2. se houve mudança recente de schema, valide antes com `npm run prisma:schema:release:check`
3. confirme `npm run prisma:migrate:status`
4. rode `npm run prisma:migrate:deploy`
5. valide novamente o status e `/health`

## Checklist curto para release de schema

Sempre que mexer em `schema.prisma` ou baseline:

```sh
npm run prisma:schema:release:check
```

Se a baseline ficar defasada:

```sh
npm run prisma:baseline:fresh:generate
npm run prisma:baseline:fresh:verify
```

## Observação importante

Mesmo com o mecanismo de boot controlado, o ideal é tratar migrations em produção como etapa explícita de release, e nao como efeito colateral do startup da aplicação.
## Deploy funcional via Easypanel RPC

Registro do fluxo validado em 2026-06-21 para publicar API e frontend em producao.

## CI/CD automatizado da API e do frontend

Status:

- automatizado em .github/workflows/deploy.yml
- frontend automatizado em boteco12-frontend/.github/workflows/deploy.yml

O workflow CI/CD API é a trilha oficial para a API:

- em pull_request para main:
  - instala dependências com npm ci
  - gera Prisma Client
  - roda npm run ci:check
  - valida build da imagem Docker com npm run docker:build
- em push para main ou execução manual:
  - repete os checks, constrói e escaneia a imagem de produção
  - bloqueia o release quando houver mudança de schema ou migration pendente de runbook
  - chama `deployService` via RPC do EasyPanel para API e worker
  - aguarda https://api.boteco12.com/health retornar api/db: ok e o fingerprint exato dos insumos de produção

Segredos/variáveis necessários no GitHub:

~~~text
EASYPANEL_URL
EASYPANEL_EMAIL
EASYPANEL_PASSWORD
~~~

Variável opcional:

~~~text
API_HEALTH_URL
~~~

Se API_HEALTH_URL não for definida, o workflow usa:

~~~text
https://api.boteco12.com/health
~~~

Observações:

- o startup continua com RUN_DB_MIGRATIONS=false; migrations são aplicadas manualmente pelo runbook antes do release
- mudanças de schema devem passar por npm run prisma:schema:release:check; migrations incompatíveis exigem uma estratégia expand/contract
- o workflow substitui o antigo deploy parcial que copiava apenas dist/ para dentro do container

O workflow CI/CD frontend segue o mesmo padrão operacional:

- em push para master:
  - instala dependências com npm ci
  - roda testes unitários, typecheck, E2E, build e validação SEO
- em execução manual aprovada, depois dos mesmos checks:
  - chama deployService via RPC do EasyPanel
  - valida que a URL pública está servindo o fingerprint determinístico da revisão e o SEO esperado

O frontend não deve mais publicar copiando dist/ diretamente para um container Nginx via
NGINX_CONTAINER_ID. A fonte de verdade em produção é o serviço frontend do EasyPanel.

### Premissas

- Backend remoto: `boteco12-api` branch `main`.
- Frontend remoto: `boteco12-frontend` branch `master`.
- Projeto no Easypanel: `f12-prd`.
- Servicos no Easypanel: `api` e `frontend`.
- Credenciais do painel ficam em `.env.local`:
  - `EASYPANEL_URL`
  - `EASYPANEL_EMAIL`
  - `EASYPANEL_PASSWORD`

Nao registrar token, senha, `SESSION_SECRET`, `DATABASE_URL`, chaves Mercado Pago ou SMTP na documentacao.

### 1. Build/check local antes do push

```bash
cd /Users/roberson/dev/personal/boteco12-api
npm run build
DATABASE_URL=postgresql://boteco12:boteco12@localhost:5432/boteco12?schema=public npx prisma validate

cd /Users/roberson/dev/personal/boteco12-frontend
npx tsc --noEmit
npm run build
```

### 2. Commit e push

```bash
cd /Users/roberson/dev/personal/boteco12-api
git status --short
git add <arquivos>
git commit -m "feat: ..."
git push origin main

cd /Users/roberson/dev/personal/boteco12-frontend
git status --short
git add <arquivos>
git commit -m "feat: ..."
git push origin master
```

### 3. Login no Easypanel RPC

O painel usa RPC em `/api/rpc/*`. O login funcional usa envelope `{ "json": ... }`.

```bash
cd /Users/roberson/dev/personal/boteco12-api

node - <<'NODE'
const fs = require('fs')
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const index = line.indexOf('=')
      return [line.slice(0, index), line.slice(index + 1)]
    })
)

fs.writeFileSync(
  '/tmp/easypanel-login.json',
  JSON.stringify({
    json: {
      email: env.EASYPANEL_EMAIL,
      password: env.EASYPANEL_PASSWORD,
      rememberMe: true
    }
  })
)
NODE

source .env.local
BASE=${EASYPANEL_URL%/}

curl -sS \
  -X POST "$BASE/api/rpc/auth/login" \
  -H "content-type: application/json" \
  --data @/tmp/easypanel-login.json \
  > /tmp/easypanel-login-response.json

node - <<'NODE'
const fs = require('fs')
const response = JSON.parse(fs.readFileSync('/tmp/easypanel-login-response.json', 'utf8'))
fs.writeFileSync('/tmp/easypanel-token.txt', response.json.token)
NODE
```

### 4. Conferir projeto e servicos

```bash
TOKEN=$(cat /tmp/easypanel-token.txt)

curl -sS \
  -X POST "$BASE/api/rpc/projects/listProjectsAndServices" \
  -H "content-type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  --data '{"json":{}}' \
  > /tmp/easypanel-projects.json
```

Resumo esperado:

```text
project: f12-prd
service: api       type: app
service: frontend  type: app
service: postgres  type: postgres
```

### 5. Acionar o release oficial

Os serviços `api`, `worker` e `frontend` usam os repositórios Boteco12 no GitHub como
fonte. Não copie arquivos diretamente para o VPS. `autoDeploy=false` impede releases
acidentais; os workflows autenticam no EasyPanel e chamam `deployService` depois dos gates.

- API e worker: push autorizado em `boteco12-api/main`.
- Frontend: push em `boteco12-frontend/master` executa CI; o deploy exige
  `workflow_dispatch` aprovado.
- Recuperação direta pelo RPC do EasyPanel só é aceita quando o workflow normal estiver
  indisponível e deve ser seguida pelos mesmos health checks e fingerprints.

### 6. Validacao pos-deploy

```bash
curl -sS https://api.boteco12.com/health
curl -sS -I https://boteco12.com | head -40
curl -sS https://boteco12.com/release.txt
```

Esperado:

- API retorna `{"api":"ok","db":"ok",...}`.
- Frontend retorna `HTTP/2 200`.
- Header `last-modified` do frontend muda para o horario do deploy.
- HTML aponta para novo asset `/assets/index-*.js`.

### 7. Acesso SSH ao VPS

Use SSH quando precisar validar container, crontab, logs ou arquivos operacionais no VPS Hostinger.

Dados confirmados:

```text
host: 72.60.51.161
user: root
hostname remoto: srv969089
autenticacao local: chave carregada no SSH agent
```

Comando padrao:

```bash
ssh root@72.60.51.161
```

Se o `~/.ssh/config` local estiver apontando para outro agent SSH, force o agent
correto. Este é o caminho operacional confirmado em 30 de agosto de 2026:

```bash
ssh \
  -o IdentityAgent="$SSH_AUTH_SOCK" \
  root@72.60.51.161
```

Para comandos nao interativos:

```bash
ssh \
  -o BatchMode=yes \
  -o ConnectTimeout=20 \
  -o StrictHostKeyChecking=yes \
  -o IdentityAgent="$SSH_AUTH_SOCK" \
  root@72.60.51.161 \
  'hostname && whoami'
```

Observacoes:

- Confirme a chave disponível no agent com `ssh-add -l`; não presuma que o
  arquivo privado existe em um caminho fixo no disco.
- Em 30 de agosto de 2026, o acesso pelo agent retornou `srv969089` / `root`.
- Nao registrar passphrase, `INTERNAL_JOB_SECRET`, tokens Easypanel ou senhas neste documento.
- O comentário da chave no agent ou no painel pode manter o nome legado sem
  afetar o acesso; não renomear ou substituir a chave durante o cutover.

Comandos uteis no VPS:

```bash
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
crontab -l
tail -40 /var/log/boteco12-scheduler.log
curl -sS https://api.boteco12.com/health
```

Scheduler de aplicacao (BullMQ worker; cron HTTP legado desativado apos migracao):

```text
worker: mesma revisao da API (`scripts/start-worker.sh`)
redis:  persistente + noeviction
log API jobs: InternalJobExecution / auditLog
recuperacao: /opt/boteco12-infra/scripts/run-internal-job.sh
```

Validacao manual dos jobs (recovery):

```bash
/opt/boteco12-infra/scripts/run-internal-job.sh /internal/open-scheduled-rounds
/opt/boteco12-infra/scripts/run-internal-job.sh /internal/close-scheduled-rounds
/opt/boteco12-infra/scripts/run-internal-job.sh /internal/close-expired-rankings
/opt/boteco12-infra/scripts/run-internal-job.sh /internal/ensure-monthly-rankings
```

### 8. Migrations Prisma

Producao esta configurada com `RUN_DB_MIGRATIONS=false`, então o startup da aplicação não altera o banco. O workflow oficial bloqueia releases com alteração de schema; `prisma migrate deploy` é executado manualmente pelo runbook antes de publicar o código dependente.

Antes de aplicar migration em producao:

1. Confirmar backup recente do banco.
2. Confirmar que o preflight de configuração e invariantes não encontrou dados inválidos.
3. Rodar `npx prisma migrate status` contra o banco de producao.
4. Aplicar migration manualmente em janela controlada e confirmar o status antes do release.
5. Validar que `/health` mostra `api: ok`, `db: ok` e o fingerprint esperado, além dos fluxos afetados.

Para mudancas que apenas deixam de usar um valor antigo no codigo, como a remocao logica de `UserRole.PRO`, o deploy de codigo pode ficar saudavel mesmo antes de remover fisicamente o valor antigo do enum no banco.

### 8.1 Rollback de release

O rollback da API e do worker deve manter os dois serviços na mesma revisão.

1. Registrar o fingerprint com falha retornado por `/health` e o último commit saudável.
2. Confirmar se a release aplicou migration. Se não houve mudança de schema, criar um
   `git revert` dos commits da release com falha e enviar o revert para `main`; o workflow
   normal valida e publica a revisão revertida nos dois serviços.
3. Acompanhar o deploy até `/health` da API e `/ready` do worker responderem com o mesmo
   fingerprint saudável.
4. Executar novamente o workflow `Production migration preflight` e validar os fluxos
   afetados.

Se houve migration, não reverter o schema automaticamente. Confirmar primeiro que a versão
anterior do código é compatível com o schema atual; quando não for, priorizar correção para
frente. Restore de banco exige decisão de incidente, backup validado e alvo explícito conforme
`docs/database-backup-restore.md`.

## 9. BullMQ worker (substitui cron de aplicacao)

### Arquitetura

- Redis persiste filas/schedules BullMQ.
- Processo **worker** separado (`node dist/worker.js` / `npm run start:worker`) consome a fila `boteco12-jobs`.
- O processo HTTP da API **nao** executa workers.
- Processors chamam os mesmos services de dominio usados pelos endpoints `/internal/...`.
- PostgreSQL continua como fonte da verdade; `InternalJobExecution` + status de dominio/`settledAt` protegem contra entrega duplicada.

Schedules:

| Scheduler id | Frequencia | Service |
|---|---|---|
| `scheduler:open-scheduled-rounds` | a cada 1 min | `OpenScheduledRoundsJobService` |
| `scheduler:close-scheduled-rounds` | a cada 1 min | `CloseScheduledRoundsJobService` |
| `scheduler:close-expired-rankings` | a cada 1 min | `CloseExpiredRankingsJobService` |
| `scheduler:ensure-monthly-rankings` | `0 0 1 * *` `America/Sao_Paulo` | `EnsureMonthlyRankingsJobService` |
| `scheduler:reconcile-monthly-rankings` | `5 * * * *` + startup | `EnsureMonthlyRankingsJobService` (source=reconcile) |

### Variaveis de ambiente (worker)

```env
REDIS_URL=redis://:PASSWORD@HOST:6379/0
BULLMQ_PREFIX=boteco12-prd
BULLMQ_WORKER_CONCURRENCY=1
BULLMQ_REGISTER_SCHEDULES=true
WORKER_HEALTH_PORT=3002
DATABASE_URL=postgresql://...
```

A API HTTP e o worker precisam de `REDIS_URL`. A API usa Redis para sessoes
compartilhadas e revogacao; o worker usa o mesmo servidor para BullMQ. Nao logar
`REDIS_URL` completo (credenciais).

### Redis em producao

- Persistencia AOF habilitada.
- `maxmemory-policy=noeviction` (obrigatorio para BullMQ).
- Autenticacao (`requirepass`) e volume persistente.
- Prefixo `BULLMQ_PREFIX` distinto por ambiente.

### Como subir o worker (EasyPanel)

1. Criar servico Redis no projeto `f12-prd`.
2. Criar servico `worker` usando a **mesma imagem/revisao** da API.
3. Command/override: `sh ./scripts/start-worker.sh` (ou `node dist/worker.js`).
4. Healthcheck: `curl -fsS http://127.0.0.1:3002/health`.
5. Wire `REDIS_URL`, `BULLMQ_*`, `DATABASE_URL` via secrets do painel (sem commit).

### Inspecionar jobs

No container do worker (ou host com `REDIS_URL`):

```bash
node -e "
const { Queue } = require('bullmq');
const q = new Queue('boteco12-jobs', {
  connection: { url: process.env.REDIS_URL },
  prefix: process.env.BULLMQ_PREFIX || 'boteco12',
});
(async () => {
  console.log(await q.getJobCounts('waiting','active','completed','failed','delayed'));
  console.log(await q.getJobSchedulers());
  await q.close();
  process.exit(0);
})();
"
```

### Retry seguro de job falho

1. Preferir o endpoint interno de recuperacao (idempotente no dominio):
   - `/internal/open-scheduled-rounds`
   - `/internal/close-scheduled-rounds`
   - `/internal/close-expired-rankings`
   - `/internal/ensure-monthly-rankings`
2. Ou reprocessar o failed job no BullMQ (`job.retry()`), confiante na idempotencia de banco.

### Validar timezone do monthly

O schedule `scheduler:ensure-monthly-rankings` usa `tz: America/Sao_Paulo` e cron `0 0 1 * *`.

```bash
node -e "console.log(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(new Date()))"
```

O reconcile horario + reconcile no startup do worker cobre falha de Redis a meia-noite.

### Migracao cron -> BullMQ

1. Deploy Redis.
2. Deploy worker com `BULLMQ_REGISTER_SCHEDULES=true`.
3. Confirmar worker `/health` e counts completed aumentando.
4. Comentar apenas as linhas de aplicacao em `boteco12-infra/scripts/cron.txt` (manter backup/retention).
5. Manter endpoints internos para recovery.
6. Rollback: reativar as duas linhas `* * * * * ... open/close-scheduled-rounds` se Redis/worker falharem.

Durante overlap cron+BullMQ, a protecao final e a idempotencia no PostgreSQL — nao apenas dedupe do BullMQ.
