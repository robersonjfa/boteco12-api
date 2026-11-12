const test = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')

if (process.env.B12_POSTGRES_INTEGRATION !== 'true') {
  throw new Error('Isolated PostgreSQL required')
}

const { prisma } = require('../dist/lib/prisma')
const {
  recordDuelGameEvent,
} = require('../dist/services/duel-gamification/duel-gamification-events.service')

const prefix = `duel-event-test-${randomUUID()}`

test('evento de funil é deduplicado pela chave', async t => {
  t.after(async () => {
    await prisma.duelGameEvent.deleteMany({ where: { dedupeKey: { startsWith: prefix } } })
  })

  const dedupeKey = `${prefix}:created`
  await recordDuelGameEvent({
    name: 'duel_created',
    dedupeKey,
    metadata: { amount: 10, hasRecipient: false },
  })
  await recordDuelGameEvent({
    name: 'duel_created',
    dedupeKey,
    metadata: { amount: 10, hasRecipient: false },
  })

  assert.equal(await prisma.duelGameEvent.count({ where: { dedupeKey } }), 1)
})
