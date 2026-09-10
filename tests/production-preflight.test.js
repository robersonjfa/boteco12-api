const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const workflow = fs.readFileSync(
  path.resolve(__dirname, '../.github/workflows/production-preflight.yml'),
  'utf8'
)
const preflightSource = fs.readFileSync(
  path.resolve(__dirname, '../scripts/easypanel-production-preflight.js'),
  'utf8'
)
const {
  apiPreflightSource,
  workerPreflightSource,
} = require('../scripts/easypanel-production-preflight')

test('preflight de producao e manual, protegido e somente leitura', () => {
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /environment: production/)
  assert.match(workflow, /permissions:\s*\n\s*contents: read/)
  assert.match(workflow, /Missing EasyPanel secrets/)
  assert.match(workflow, /EASYPANEL_URL: \$\{\{ secrets\.EASYPANEL_URL \}\}/)
  assert.match(workflow, /node scripts\/easypanel-production-preflight\.js/)

  assert.match(preflightSource, /projects\/getDockerContainers/)
  assert.match(preflightSource, /B12_PREFLIGHT_BEGIN/)
  assert.match(preflightSource, /releaseConsistency/)
  assert.match(preflightSource, /health\.redis === 'ok'/)
  assert.match(preflightSource, /\['migrate', 'status'\]/)
  assert.match(preflightSource, /commandResult\('pg_dump', \['--version'\]\)/)
  assert.match(preflightSource, /commandResult\('pg_restore', \['--version'\]\)/)
  assert.match(preflightSource, /WORKER_HEALTH_PORT/)
  assert.match(preflightSource, /accessTokenConfigured: Boolean/)
  assert.match(preflightSource, /webhookSecretConfigured: Boolean/)
  assert.match(preflightSource, /userDomain: emailDomain/)
  assert.match(preflightSource, /passwordConfigured: Boolean/)
  assert.match(preflightSource, /operationsAlertWebhookConfigured: Boolean/)

  assert.doesNotMatch(preflightSource, /prisma migrate deploy/)
  assert.doesNotMatch(preflightSource, /docker (restart|rm|stop|kill)/)
  assert.doesNotMatch(preflightSource, /docker inspect[^\n]+Config\.Env/)
  assert.doesNotMatch(preflightSource, /docker logs/)
  assert.doesNotMatch(`${workflow}\n${preflightSource}`, /\b(printenv|set -x)\b/)
})

test('fontes executadas nos containers possuem sintaxe valida', () => {
  assert.doesNotThrow(() => new Function(apiPreflightSource()))
  assert.doesNotThrow(() => new Function(workerPreflightSource()))
})
