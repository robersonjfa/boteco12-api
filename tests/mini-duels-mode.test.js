const assert = require('node:assert/strict')
const test = require('node:test')
const express = require('express')

process.env.DATABASE_URL ||= 'postgresql://boteco12:boteco12@127.0.0.1:5432/boteco12_test'

const { prisma } = require('../dist/lib/prisma')
const routes = require('../dist/routes/mini.routes').default
const { errorHandler } = require('../dist/middleware/error-handler')

// Router real, middlewares reais e Prisma apenas com leituras fixas: o objetivo
// é validar o contrato HTTP de GET /api/duels?mode=finished sem depender de banco.
const USER_ID = 'user-duels-mode'

test('HTTP: GET /api/duels aceita mode=finished e rejeita modo desconhecido', async () => {
  const originals = {
    userFindUnique: prisma.user.findUnique,
    findMany: prisma.miniDuel.findMany,
    count: prisma.miniDuel.count,
  }
  const calls = []
  prisma.user.findUnique = async () => ({ id: USER_ID, role: 'NORMAL', email: 'mode@example.test', cpf: '52998224725', birthDate: new Date('1990-01-01'), adminBlockedAt: null, sessionVersion: 0 })
  prisma.miniDuel.findMany = async args => { calls.push(args); return [] }
  prisma.miniDuel.count = async () => 0

  const app = express()
  app.use(express.json())
  // Sessão fornecida pelo harness do teste; produção usa cookie/Redis.
  app.use((req, _res, next) => { req.session = { user: { id: USER_ID, sessionVersion: 0 } }; next() })
  app.use('/api', routes)
  app.use(errorHandler)
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  const base = `http://127.0.0.1:${server.address().port}/api`
  try {
    const finished = await fetch(`${base}/duels?mode=finished`)
    assert.equal(finished.status, 200)
    assert.deepEqual(await finished.json(), { duels: [], total: 0, page: 1, limit: 20 })
    assert.deepEqual(calls.at(-1).where, { status: { in: ['SETTLED', 'CANCELLED', 'EXPIRED'] }, recipientId: null })
    assert.deepEqual(calls.at(-1).orderBy, { settledAt: 'desc' })

    const mine = await fetch(`${base}/duels`)
    assert.equal(mine.status, 200)
    assert.deepEqual(calls.at(-1).where, { OR: [{ creatorId: USER_ID }, { opponentId: USER_ID }, { recipientId: USER_ID }] })

    const invalid = await fetch(`${base}/duels?mode=invalido`)
    assert.equal(invalid.status, 400)
    assert.equal((await invalid.json()).error, 'validation_error')
  } finally {
    prisma.user.findUnique = originals.userFindUnique
    prisma.miniDuel.findMany = originals.findMany
    prisma.miniDuel.count = originals.count
    await new Promise(resolve => server.close(resolve))
  }
})
