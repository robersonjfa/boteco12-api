const assert = require('node:assert/strict')
const test = require('node:test')
const express = require('express')
const { prisma } = require('../dist/lib/prisma')
const { CreateMesaSchema } = require('../dist/validators/bolao.validator')
const { validateRequest } = require('../dist/middleware/validate-request.middleware')
const { errorHandler } = require('../dist/middleware/error-handler')
const { CreateBolaoController } = require('../dist/controllers/bolao/create-bolao.controller')
const { UpdateMesaController } = require('../dist/controllers/bolao/update-mesa.controller')
const { AdminBolaoController } = require('../dist/controllers/bolao/admin-bolao.controller')
const { AssertActiveProUserService } = require('../dist/services/subscription/assert-active-pro-user.service')
const { BolaoPrizeService } = require('../dist/services/bolao/bolao-prize.service')

// Real controllers/services/schema/error handler. Only identity/database reads
// are fixtures; actual authenticated persistence is verified separately.
const OWNER = 'test-owner'
const app = express()
app.use(express.json())
app.use((req, _res, next) => { req.user = { id: OWNER }; next() })
const endpoints = [
  ['POST', '/api/mesas', CreateBolaoController.handle],
  ['POST', '/api/admin/mesas', AdminBolaoController.create],
  ['POST', '/api/admin/boloes', AdminBolaoController.create],
  ['PUT', '/api/mesas/mesa-id', UpdateMesaController.handle],
  ['PATCH', '/api/admin/mesas/mesa-id', AdminBolaoController.update],
]
for (const [method, path, controller] of endpoints) {
  app[method.toLowerCase()](path, (req, _res, next) => {
    req.params.rankingId = 'mesa-id'; next()
  }, validateRequest(CreateMesaSchema), controller)
}
app.post('/persisted-prizes', (req, res, next) => {
  try { res.json(BolaoPrizeService.fromJson(req.body)) } catch (error) { next(error) }
})
const errors = []
app.use((err, _req, _res, next) => { errors.push(err); next(err) })
app.use(errorHandler)
let transactionCalls = 0
let server
let origin
const originals = {
  user: prisma.user.findUnique, ranking: prisma.ranking.findUnique,
  transaction: prisma.$transaction, assertPro: AssertActiveProUserService.execute,
}
test.before(async () => {
  prisma.user.findUnique = async () => ({ id: OWNER })
  prisma.ranking.findUnique = async () => ({
    id: 'mesa-id', type: 'BOLAO', status: 'DRAFT', createdByUserId: OWNER,
    category: 'PAID', accessCost: 20, sponsorPrizePool: 0, currentParticipants: 0,
    grossCollected: 0, settledAt: null, publishedAt: null,
    prizeDistribution: [{ position: 1, percentage: 100 }],
  })
  prisma.$transaction = async () => { transactionCalls++; throw new Error('Unexpected persistence in rejected request') }
  AssertActiveProUserService.execute = async () => {}
  server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  origin = `http://127.0.0.1:${server.address().port}`
})
test.after(async () => {
  prisma.user.findUnique = originals.user
  prisma.ranking.findUnique = originals.ranking
  prisma.$transaction = originals.transaction
  AssertActiveProUserService.execute = originals.assertPro
  await new Promise(resolve => server.close(resolve))
})
function payload(prizeDistribution) {
  return {
    name: 'Mesa de validação de recompensa', description: 'Recompensa conforme regras publicadas.',
    startDate: '2099-08-01T03:00:00.000Z', category: 'PAID', eligibility: 'ALL',
    accessCost: 20, maxParticipants: 2, durationRounds: 2,
    prizeDistribution, publicationMode: 'DRAFT',
  }
}
async function send(method, path, body) {
  const response = await fetch(origin + path, { method,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.json() }
}
const invalid = [
  { label: 'soma 90%', value: [{ position: 1, percentage: 90 }], message: /somar 100%/ },
  { label: 'soma 110%', value: [{ position: 1, percentage: 60 }, { position: 2, percentage: 50 }], message: /somar 100%/ },
  { label: 'posição duplicada', value: [{ position: 1, percentage: 50 }, { position: 1, percentage: 50 }], message: /sequenciais/ },
  { label: 'posição pulada', value: [{ position: 1, percentage: 50 }, { position: 3, percentage: 50 }], message: /sequenciais/ },
  { label: 'primeira posição 2', value: [{ position: 2, percentage: 100 }], message: /sequenciais/ },
  { label: 'percentuais fracionários', value: [{ position: 1, percentage: 50.5 }, { position: 2, percentage: 49.5 }], message: /inteiro positivo/ },
]
for (const [method, path] of endpoints) {
  for (const scenario of invalid) {
    test(`${method} ${path}: ${scenario.label} retorna erro 400 de premiação`, async () => {
      const before = transactionCalls
      const response = await send(method, path, payload(scenario.value))
      assert.equal(transactionCalls, before)
      assert.match(errors.at(-1).message, scenario.message)
      assert.equal(response.status, 400)
      assert.equal(response.body.error, 'mesa_prize_distribution_invalid')
      assert.match(response.body.message, scenario.message)
    })
  }
}

test('falha inesperada de persistência continua 500 sem detalhes internos', async () => {
  const original = prisma.user.findUnique
  prisma.user.findUnique = async () => { throw new Error('synthetic database unavailable') }
  try {
    const response = await send('POST', '/api/mesas', payload([{ position: 1, percentage: 100 }]))
    assert.equal(response.status, 500)
    assert.equal(response.body.error, 'internal_error')
    assert.equal(response.body.message, 'Erro interno do servidor')
  } finally { prisma.user.findUnique = original }
})

test('falha inesperada dentro do validador de prêmio não é convertida em 400', async () => {
  const original = BolaoPrizeService.validateDistribution
  BolaoPrizeService.validateDistribution = () => { throw new Error('synthetic unexpected validation failure') }
  try {
    const response = await send('POST', '/api/admin/mesas', payload([{ position: 1, percentage: 100 }]))
    assert.equal(response.status, 500)
    assert.equal(response.body.error, 'internal_error')
  } finally { BolaoPrizeService.validateDistribution = original }
})

test('configuração persistida inválida não é classificada como erro do payload', async () => {
  const response = await send('POST', '/persisted-prizes', [{ position: 1, percentage: 90 }])
  assert.equal(response.status, 500)
  assert.equal(response.body.error, 'internal_error')
})

test('distribuição válida preserva a regra de premiação existente', () => {
  const distribution = [{ position: 1, percentage: 70 }, { position: 2, percentage: 30 }]
  assert.deepEqual(BolaoPrizeService.validateDistribution(distribution), distribution)
})

test('ausência, zero e valores não numéricos continuam rejeitados pelo schema com 400', async () => {
  for (const value of [[], null, [{ position: 1, percentage: 0 }], [{ position: 1, percentage: '100' }]]) {
    const before = transactionCalls
    const response = await send('POST', '/api/mesas', payload(value))
    assert.equal(response.status, 400)
    assert.equal(response.body.error, 'validation_error')
    assert.equal(transactionCalls, before)
  }
})
