const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const {
  PublishScheduledMesasJobService,
} = require('../dist/services/jobs/publish-scheduled-mesas.job.service')
const {
  PublishScheduledMesasController,
} = require('../dist/controllers/internal/publish-scheduled-mesas.controller')

const root = path.resolve(__dirname, '..')

test('recuperação manual publica Mesas agendadas pelo mesmo job idempotente', async t => {
  const originalExecute = PublishScheduledMesasJobService.execute
  t.after(() => {
    PublishScheduledMesasJobService.execute = originalExecute
  })

  PublishScheduledMesasJobService.execute = async () => ({
    publishedMesas: 2,
    failedMesas: 1,
    execution: { id: 'execution-1', status: 'SUCCESS' },
  })

  let response
  const res = {
    status(code) {
      assert.equal(code, 200)
      return this
    },
    json(payload) {
      response = payload
      return this
    },
  }

  await new PublishScheduledMesasController().execute({}, res)
  assert.deepEqual(response, {
    status: 'ok',
    publishedMesas: 2,
    failedMesas: 1,
    execution: { id: 'execution-1', status: 'SUCCESS' },
  })
})

test('rota interna e runbook documentam a recuperação da publicação agendada', () => {
  const routes = fs.readFileSync(
    path.join(root, 'src/routes/internal/jobs.routes.ts'),
    'utf8'
  )
  const internalIndex = fs.readFileSync(
    path.join(root, 'src/routes/internal/index.ts'),
    'utf8'
  )
  const runbook = fs.readFileSync(
    path.join(root, 'docs/production-deploy.md'),
    'utf8'
  )

  assert.match(routes, /'\/publish-scheduled-mesas'/)
  assert.match(routes, /internalJobRateLimiter[\s\S]*internalJobAuth/)
  assert.match(internalIndex, /router\.use\('\/jobs', jobsRoutes\)/)
  assert.doesNotMatch(internalIndex, /router\.use\(jobsRoutes\)/)
  assert.match(runbook, /\/internal\/jobs\/publish-scheduled-mesas/)
})
