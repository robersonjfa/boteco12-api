const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const workflow = fs.readFileSync(
  path.resolve(__dirname, '../.github/workflows/production-preflight.yml'),
  'utf8'
)

test('preflight de producao e manual, protegido e somente leitura', () => {
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /environment: production/)
  assert.match(workflow, /permissions:\s*\n\s*contents: read/)
  assert.match(workflow, /Missing production SSH secrets/)
  assert.match(workflow, /appleboy\/ssh-action@029f5b4aeeeb58fdfe1410a5d17f967dacf36262/)
  assert.match(workflow, /name=f12-prd_api/)
  assert.match(workflow, /name=f12-prd_worker-managed/)
  assert.match(workflow, /release_consistency=ok/)
  assert.match(workflow, /body\.redis !== 'ok'/)
  assert.match(workflow, /prisma migrate status/)
  assert.match(workflow, /pg_dump --version/)
  assert.match(workflow, /pg_restore --version/)
  assert.match(workflow, /WORKER_HEALTH_PORT/)
  assert.match(workflow, /accessTokenConfigured: Boolean/)
  assert.match(workflow, /webhookSecretConfigured: Boolean/)
  assert.match(workflow, /userDomain: emailDomain/)
  assert.match(workflow, /passwordConfigured: Boolean/)

  assert.doesNotMatch(workflow, /prisma migrate deploy/)
  assert.doesNotMatch(workflow, /docker (restart|rm|stop|kill)/)
  assert.doesNotMatch(workflow, /docker inspect[^\n]+Config\.Env/)
  assert.doesNotMatch(workflow, /docker logs/)
  assert.doesNotMatch(workflow, /\b(printenv|set -x)\b/)
})
