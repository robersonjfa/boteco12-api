const assert = require('node:assert/strict')
const test = require('node:test')
const express = require('express')
const { CreateMesaSchema, UpdateMesaSchema } = require('../dist/validators/bolao.validator')
const { validateRequest } = require('../dist/middleware/validate-request.middleware')

// Exercises the shared production schema/middleware over HTTP, independently
// of authentication, controller persistence, and database fixtures.
const app = express()
app.use(express.json())
let accepted = []
const endpoints = [
  ['POST', '/api/mesas', CreateMesaSchema],
  ['POST', '/api/admin/mesas', CreateMesaSchema],
  ['POST', '/api/admin/boloes', CreateMesaSchema],
  ['PUT', '/api/mesas/mesa-id', UpdateMesaSchema],
  ['PATCH', '/api/admin/mesas/mesa-id', CreateMesaSchema],
]
for (const [method, path, schema] of endpoints) {
  app[method.toLowerCase()](path, validateRequest(schema), (req, res) => {
    accepted.push(req.body)
    res.status(201).json(req.body)
  })
}
let server
let origin
test.before(async () => {
  server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  origin = `http://127.0.0.1:${server.address().port}`
})
test.after(async () => { await new Promise(resolve => server.close(resolve)) })

function payload(category = 'PAID', eligibility = 'ALL') {
  return {
    name: 'Mesa com campos explícitos', description: 'Regras da Mesa.',
    startDate: '2099-08-01T03:00:00.000Z', category, eligibility,
    accessCost: category === 'PAID' ? 20 : 0,
    sponsorPrizePool: category === 'SPONSORED_FREE' ? 100 : 0,
    maxParticipants: 2, durationRounds: 2,
    prizeDistribution: category === 'FREE' ? [] : [{ position: 1, percentage: 100 }],
  }
}
async function send(method, path, body) {
  const response = await fetch(origin + path, {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.json() }
}

for (const [method, path] of endpoints) {
  for (const field of ['category', 'eligibility']) {
    test(`${method} ${path}: ${field} ausente retorna 400 sem alcançar o handler`, async () => {
      const body = payload()
      delete body[field]
      const before = accepted.length
      const response = await send(method, path, body)
      assert.equal(response.status, 400)
      assert.equal(response.body.error, 'validation_error')
      assert.ok(response.body.issues.some(issue => issue.path === field))
      assert.equal(accepted.length, before)
    })
  }
}

test('ambos ausentes apontam os dois campos obrigatórios', async () => {
  const body = payload()
  delete body.category
  delete body.eligibility
  const response = await send('POST', '/api/mesas', body)
  assert.equal(response.status, 400)
  assert.deepEqual(response.body.issues.map(issue => issue.path).sort(), ['category', 'eligibility'])
})

for (const field of ['category', 'eligibility']) {
  test(`${field}: null, vazio, tipo errado e enum desconhecido continuam rejeitados`, async () => {
    for (const value of [null, '', false, [], 'UNKNOWN']) {
      const before = accepted.length
      const response = await send('POST', '/api/mesas', { ...payload(), [field]: value })
      assert.equal(response.status, 400)
      assert.ok(response.body.issues.some(issue => issue.path === field))
      assert.equal(accepted.length, before)
    }
  })
}

for (const category of ['PAID', 'FREE', 'SPONSORED_FREE']) {
  for (const eligibility of ['ALL', 'SUBSCRIBERS_ONLY', 'FREE_ONLY']) {
    test(`campos explícitos ${category}/${eligibility} preservam a escolha enviada`, async () => {
      const response = await send('POST', '/api/admin/mesas', payload(category, eligibility))
      assert.equal(response.status, 201)
      assert.equal(response.body.category, category)
      assert.equal(response.body.eligibility, eligibility)
      assert.equal(response.body.registrationCloseMode, 'CAPACITY')
      assert.equal(response.body.durationMode, 'ROUNDS')
    })
  }
}

test('entryFee legado continua aceito com tipo e público explícitos', async () => {
  const body = { ...payload(), entryFee: 20 }
  delete body.accessCost
  const response = await send('POST', '/api/mesas', body)
  assert.equal(response.status, 201)
  assert.equal(response.body.entryFee, 20)
})
