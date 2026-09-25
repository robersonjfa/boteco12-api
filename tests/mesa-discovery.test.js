const assert = require('node:assert/strict')
const test = require('node:test')

const { prisma } = require('../dist/lib/prisma')
const { DiscoverMesasService } = require('../dist/services/bolao/discover-mesas.service')
const { DiscoverMesasQuerySchema } = require('../dist/validators/bolao.validator')

const NOW = new Date('2026-09-24T12:00:00.000Z')

function mesa(overrides = {}) {
  return {
    id: 'mesa-1', name: 'Mesa da Rodada', description: null, status: 'ACTIVE',
    entryFee: 10, accessCost: 10, category: 'PAID', eligibility: 'SUBSCRIBERS_ONLY',
    registrationCloseMode: 'DATE', durationMode: 'DATE', durationRounds: null,
    registrationClosedAt: null, publishedAt: new Date('2026-09-20T00:00:00Z'),
    sponsorPrizePool: 0, prizeDistribution: [], grossCollected: 0, platformFee: 0,
    prizePool: 0, rewardPool: 50, settledAt: null,
    startDate: new Date('2026-09-20T00:00:00Z'),
    entryEndDate: new Date('2026-09-25T12:00:00Z'),
    endDate: new Date('2026-10-01T00:00:00Z'), maxParticipants: 10,
    currentParticipants: 8, createdAt: new Date('2026-09-20T00:00:00Z'),
    createdByUserId: 'owner-1', createdBy: { name: 'Organizador', nickname: 'Chefão' },
    participants: [],
    ...overrides,
  }
}

test('consulta de descoberta valida filtros e paginação', () => {
  assert.deepEqual(DiscoverMesasQuerySchema.parse({}), {
    registration: 'ALL', access: 'ALL', sort: 'RECOMMENDED', page: 1, limit: 12,
  })
  assert.equal(DiscoverMesasQuerySchema.safeParse({ registration: 'INVALID' }).success, false)
  assert.equal(DiscoverMesasQuerySchema.safeParse({ minCost: '20', maxCost: '10' }).success, false)
})

test('prioriza Mesa elegível terminando e explica bloqueios sem ocultar abertas', async t => {
  const originals = { user: prisma.user.findUnique, mesas: prisma.ranking.findMany }
  t.after(() => {
    prisma.user.findUnique = originals.user
    prisma.ranking.findMany = originals.mesas
  })
  prisma.user.findUnique = async () => ({
    subscription: { status: 'ACTIVE', plan: 'MONTHLY', startAt: new Date('2026-01-01'), endAt: null },
    wallet: { balance: 20 },
  })
  prisma.ranking.findMany = async () => [
    mesa(),
    mesa({ id: 'mesa-cara', name: 'Mesa cara', accessCost: 100, entryFee: 100, currentParticipants: 1 }),
    mesa({ id: 'mesa-futura', name: 'Mesa futura', startDate: new Date('2026-09-28'), entryEndDate: new Date('2026-09-30'), currentParticipants: 1 }),
  ]

  const result = await DiscoverMesasService.execute({ userId: 'user-1', now: NOW })
  assert.deepEqual(result.mesas.map(item => item.id), ['mesa-1', 'mesa-cara', 'mesa-futura'])
  assert.equal(result.mesas[0].registrationState, 'CLOSING_SOON')
  assert.equal(result.mesas[0].accessState, 'CAN_JOIN')
  assert.equal(result.mesas[0].recommendationReason, 'Inscrição terminando')
  assert.equal(result.mesas[1].accessState, 'INSUFFICIENT_BALANCE')
  assert.deepEqual(result.meta.counts, { canJoin: 1, closingSoon: 2, upcoming: 1 })
})

test('filtra no servidor por pesquisa, categoria e capacidade de entrada', async t => {
  const originals = { user: prisma.user.findUnique, mesas: prisma.ranking.findMany }
  t.after(() => {
    prisma.user.findUnique = originals.user
    prisma.ranking.findMany = originals.mesas
  })
  let receivedWhere
  prisma.user.findUnique = async () => ({ subscription: null, wallet: { balance: 0 } })
  prisma.ranking.findMany = async input => {
    receivedWhere = input.where
    return [mesa({ category: 'FREE', accessCost: 0, entryFee: 0, eligibility: 'ALL' })]
  }

  const result = await DiscoverMesasService.execute({
    userId: 'user-1', query: 'chefao', category: 'FREE', access: 'CAN_JOIN', now: NOW,
  })
  assert.equal(receivedWhere.category, 'FREE')
  assert.ok(receivedWhere.OR.some(item => item.createdBy))
  assert.equal(result.mesas.length, 1)
  assert.equal(result.mesas[0].accessState, 'CAN_JOIN')
})
