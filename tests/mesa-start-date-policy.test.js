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
const { CreateBolaoService } = require('../dist/services/bolao/create-bolao.service')
const { UpdateMesaService } = require('../dist/services/bolao/update-mesa.service')
const { PublishMesaService } = require('../dist/services/bolao/publish-mesa.service')

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
const errors = []
app.use((err, _req, _res, next) => { errors.push(err); next(err) })
app.use(errorHandler)
let transactionCalls = 0
let storedStart = new Date('2026-10-10T12:34:56.000Z')
let written
let updateWhere
const NOW = new Date('2026-10-16T02:30:00.000Z') // still Oct 15 in São Paulo
let server
let origin
const originals = {
  user: prisma.user.findUnique, ranking: prisma.ranking.findUnique,
  transaction: prisma.$transaction, assertPro: AssertActiveProUserService.execute, publish: PublishMesaService.execute,
}
test.before(async () => {
  test.mock.timers.enable({ apis: ['Date'], now: NOW })
  prisma.user.findUnique = async () => ({ id: OWNER })
  prisma.ranking.findUnique = async () => ({
    id: 'mesa-id', type: 'BOLAO', status: 'DRAFT', createdByUserId: OWNER,
    category: 'PAID', accessCost: 20, sponsorPrizePool: 0, currentParticipants: 0,
    grossCollected: 0, settledAt: null, publishedAt: null, startDate: storedStart,
    prizeDistribution: [{ position: 1, percentage: 100 }],
  })
  prisma.$transaction = async callback => {
    transactionCalls++
    return callback({
      ranking: {
        create: async ({ data }) => { written = data; return data },
        updateMany: async ({ data, where }) => { written = data; updateWhere = where; return { count: 1 } },
        findUniqueOrThrow: async () => ({ id: 'mesa-id', ...written }),
      },
      auditLog: { create: async () => ({}) },
    })
  }
  PublishMesaService.execute = async () => ({ id: 'mesa-id', ...written, status: 'ACTIVE' })
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
  PublishMesaService.execute = originals.publish
  test.mock.timers.reset()
  await new Promise(resolve => server.close(resolve))
})
function payload(prizeDistribution) {
  return {
    name: 'Mesa de validação de recompensa', description: 'Recompensa conforme regras publicadas.',
    startDate: '2099-08-01T03:00:00.000Z', category: 'PAID', eligibility: 'ALL',
    accessCost: 20, maxParticipants: 2, durationRounds: 2,
    prizeDistribution: prizeDistribution ?? [{ position: 1, percentage: 100 }], publicationMode: 'DRAFT',
  }
}
async function send(method, path, body) {
  const response = await fetch(origin + path, { method,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.json() }
}

for (const [method, path] of endpoints) {
  for (const publicationMode of ['DRAFT', 'NOW']) {
    test(`${method} ${path} ${publicationMode}: ontem em São Paulo retorna 400 sem transação`, async () => {
      const before = transactionCalls
      // UTC Oct 15, but São Paulo Oct 14: comparing UTC days would allow it.
      const response = await send(method, path, { ...payload(), publicationMode, startDate: '2026-10-15T02:59:59.999Z' })
      assert.equal(response.status, 400)
      assert.equal(response.body.error, 'mesa_start_date_in_past')
      assert.equal(transactionCalls, before)
    })
  }
  test(`${method} ${path}: hoje em São Paulo é aceito mesmo antes de agora`, async () => {
    const response = await send(method, path, { ...payload(), startDate: '2026-10-15T03:00:00.000Z' })
    assert.equal(response.status, method === 'POST' ? 201 : 200)
    assert.equal(written.startDate.toISOString(), '2026-10-15T03:00:00.000Z')
  })
}
for (const [method, path] of endpoints.filter(([method]) => method !== 'POST')) {
  test(`${method}: edição preserva instante histórico inalterado`, async () => {
    const response = await send(method, path, { ...payload(), startDate: storedStart.toISOString() })
    assert.equal(response.status, 200)
    assert.equal(written.startDate.getTime(), storedStart.getTime())
    assert.equal(updateWhere.startDate.getTime(), storedStart.getTime())
  })
  test(`${method}: mudar horário no mesmo dia histórico também é alteração proibida`, async () => {
    const before = transactionCalls
    const response = await send(method, path, { ...payload(), startDate: '2026-10-10T03:00:00.000Z' })
    assert.equal(response.status, 400)
    assert.equal(response.body.error, 'mesa_start_date_in_past')
    assert.equal(transactionCalls, before)
  })
}
test('criação direta no serviço também rejeita ontem sem persistência', async () => {
  const before = transactionCalls
  const body = payload()
  await assert.rejects(CreateBolaoService.execute({ ...body,
    startDate: new Date('2026-10-15T02:59:59.999Z'), endDate: null,
    createdByUserId: OWNER, administrative: true,
  }), { code: 'mesa_start_date_in_past', statusCode: 400 })
  assert.equal(transactionCalls, before)
})
test('edição direta no serviço também rejeita nova data histórica', async () => {
  const before = transactionCalls
  await assert.rejects(UpdateMesaService.execute({ ...payload(),
    rankingId: 'mesa-id', requestedByUserId: OWNER, administrative: true,
    startDate: new Date('2026-10-15T02:59:59.999Z'), endDate: null,
  }), { code: 'mesa_start_date_in_past', statusCode: 400 })
  assert.equal(transactionCalls, before)
})
test('AT_START ainda exige instante futuro, mesmo para data histórica preservada', async () => {
  for (const [method, path] of endpoints) {
    const before = transactionCalls
    const response = await send(method, path, { ...payload(), publicationMode: 'AT_START', startDate: storedStart.toISOString() })
    assert.equal(response.status, 400)
    assert.equal(transactionCalls, before)
  }
})
test('virada do dia em São Paulo passa a rejeitar o dia anterior', async () => {
  test.mock.timers.setTime(Date.parse('2026-10-16T03:00:00.000Z'))
  try {
    const before = transactionCalls
    const response = await send('POST', '/api/mesas', { ...payload(), startDate: '2026-10-16T02:59:59.999Z' })
    assert.equal(response.status, 400)
    assert.equal(response.body.error, 'mesa_start_date_in_past')
    assert.equal(transactionCalls, before)
  } finally { test.mock.timers.setTime(NOW.getTime()) }
})

test('data futura continua aceita em DRAFT, NOW e AT_START', async () => {
  for (const publicationMode of ['DRAFT', 'NOW', 'AT_START']) {
    const response = await send('POST', '/api/admin/mesas', {
      ...payload(), publicationMode, startDate: '2026-10-17T03:00:00.000Z',
    })
    assert.equal(response.status, 201)
  }
})

test('hoje aceita publicação imediata sem exigir instante futuro', async () => {
  const response = await send('POST', '/api/admin/mesas', {
    ...payload(), publicationMode: 'NOW', startDate: '2026-10-15T03:00:00.000Z',
  })
  assert.equal(response.status, 201)
})

test('edição rejeita snapshot obsoleto sem auditar ou publicar a alteração', async () => {
  const transaction = prisma.$transaction
  let sideEffects = 0
  prisma.$transaction = async callback => callback({
    ranking: { updateMany: async () => ({ count: 0 }) },
    auditLog: { create: async () => { sideEffects++ } },
  })
  try {
    const response = await send('PUT', '/api/mesas/mesa-id', { ...payload(), startDate: storedStart.toISOString() })
    assert.equal(response.status, 409)
    assert.equal(sideEffects, 0)
  } finally { prisma.$transaction = transaction }
})
