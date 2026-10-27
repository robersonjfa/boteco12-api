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
  const free = category === 'FREE'
  return {
    name: 'Mesa com campos explícitos', description: 'Regras da Mesa.',
    startDate: '2099-08-01T03:00:00.000Z', category, eligibility,
    registrationCloseMode: free ? 'DATE' : 'CAPACITY',
    entryEndDate: free ? '2099-08-02T03:00:00.000Z' : undefined,
    durationMode: 'ROUNDS',
    accessCost: category === 'PAID' ? 20 : 0,
    sponsorPrizePool: category === 'SPONSORED_FREE' ? 100 : 0,
    sponsorName: category === 'SPONSORED_FREE' ? 'Patrocinador Teste' : undefined,
    maxParticipants: free ? undefined : 2,
    durationRounds: 2,
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
      assert.equal(response.status, 201, JSON.stringify(response.body))
      assert.equal(response.body.category, category)
      assert.equal(response.body.eligibility, eligibility)
      assert.equal(response.body.registrationCloseMode, category === 'FREE' ? 'DATE' : 'CAPACITY')
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

for (const [method, path] of endpoints) {
  test(`${method} ${path}: capacidade de um lugar retorna 400 antes do handler`, async () => {
    for (const category of ['PAID', 'FREE', 'SPONSORED_FREE']) {
      const before = accepted.length
      const response = await send(method, path, { ...payload(category), maxParticipants: 1 })
      assert.equal(response.status, 400)
      assert.equal(response.body.error, 'validation_error')
      assert.ok(response.body.issues.some(issue => issue.path === 'maxParticipants'))
      assert.equal(accepted.length, before)
    }
  })
}

test('capacidade rejeita ausente, null, zero, negativo, fracionário, string e acima do limite', async () => {
  for (const value of [undefined, null, 0, -1, 1.5, '2', 1_000_001]) {
    const before = accepted.length
    const response = await send('POST', '/api/mesas', { ...payload(), maxParticipants: value })
    assert.equal(response.status, 400)
    assert.ok(response.body.issues.some(issue => issue.path === 'maxParticipants'))
    assert.equal(accepted.length, before)
  }
})

test('capacidade aceita os limites dois e um milhão', async () => {
  for (const maxParticipants of [2, 1_000_000]) {
    const response = await send('POST', '/api/mesas', { ...payload(), maxParticipants })
    assert.equal(response.status, 201)
    assert.equal(response.body.maxParticipants, maxParticipants)
  }
})

test('inscrições por data preservam capacidade ausente ou null e rejeitam limite numérico', async () => {
  for (const maxParticipants of [undefined, null, 2]) {
    const body = {
      ...payload('FREE'),
      maxParticipants,
      durationRounds: 2,
    }
    const response = await send('POST', '/api/mesas', body)
    assert.equal(response.status, maxParticipants == null ? 201 : 400)
  }
})

test('Mesa Free encerra somente por data e tem duração por rodadas', async () => {
  const capacity = await send('POST', '/api/mesas', {
    ...payload('FREE'),
    registrationCloseMode: 'CAPACITY',
    maxParticipants: 5,
    entryEndDate: undefined,
  })
  assert.equal(capacity.status, 400)
  assert.ok(capacity.body.issues.some(issue => issue.path === 'registrationCloseMode'))

  const dateDuration = await send('POST', '/api/mesas', {
    ...payload('FREE'),
    durationMode: 'DATE',
    endDate: '2099-08-20T03:00:00.000Z',
    durationRounds: null,
  })
  assert.equal(dateDuration.status, 400)
  assert.ok(dateDuration.body.issues.some(issue => issue.path === 'durationMode'))
})

test('Mesa Patrocinada exige nome do patrocinador e aceita logo opcional', async () => {
  const withoutName = await send('POST', '/api/admin/mesas', {
    ...payload('SPONSORED_FREE'),
    sponsorName: undefined,
  })
  assert.equal(withoutName.status, 400)
  assert.ok(withoutName.body.issues.some(issue => issue.path === 'sponsorName'))

  const withName = await send('POST', '/api/admin/mesas', payload('SPONSORED_FREE'))
  assert.equal(withName.status, 201)
  assert.equal(withName.body.sponsorName, 'Patrocinador Teste')
  assert.equal(withName.body.sponsorLogoUrl ?? null, null)

  const withLogo = await send('POST', '/api/admin/mesas', {
    ...payload('SPONSORED_FREE'),
    sponsorLogoUrl: 'https://cdn.example.com/logo.png',
  })
  assert.equal(withLogo.status, 201)
  assert.equal(withLogo.body.sponsorLogoUrl, 'https://cdn.example.com/logo.png')

  const freeWithSponsor = await send('POST', '/api/mesas', {
    ...payload('FREE'),
    sponsorName: 'Patrocinador Indevido',
  })
  assert.equal(freeWithSponsor.status, 400)
  assert.ok(freeWithSponsor.body.issues.some(issue => issue.path === 'sponsorName'))
})
