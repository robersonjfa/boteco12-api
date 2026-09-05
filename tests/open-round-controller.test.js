const assert = require('node:assert/strict')
const test = require('node:test')

const {
  GetOpenRoundService,
} = require('../dist/services/round/get-open-round.service')
const {
  GetOpenRoundController,
} = require('../dist/controllers/round/get-open-round.controller')

function responseRecorder() {
  return {
    statusCode: 200,
    payload: undefined,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.payload = payload
      return this
    },
  }
}

test('ausência de rodada aberta é um estado válido com HTTP 200 e corpo nulo', async t => {
  const originalExecute = GetOpenRoundService.execute
  t.after(() => {
    GetOpenRoundService.execute = originalExecute
  })
  GetOpenRoundService.execute = async () => null

  const res = responseRecorder()
  await GetOpenRoundController.handle({}, res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.payload, null)
})

test('rodada aberta continua sendo retornada normalmente', async t => {
  const originalExecute = GetOpenRoundService.execute
  t.after(() => {
    GetOpenRoundService.execute = originalExecute
  })
  const round = { id: 'round-1', number: 12, status: 'OPEN', matches: [] }
  GetOpenRoundService.execute = async () => round

  const res = responseRecorder()
  await GetOpenRoundController.handle({}, res)

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.payload, round)
})
