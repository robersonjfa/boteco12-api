const assert = require('node:assert/strict')
const test = require('node:test')

const { prisma } = require('../dist/lib/prisma')
const {
  CreateBolaoService,
} = require('../dist/services/bolao/create-bolao.service')
const {
  JoinBolaoService,
} = require('../dist/services/bolao/join-bolao.service')
const {
  AssertActiveProUserService,
} = require('../dist/services/subscription/assert-active-pro-user.service')
const {
  ListUserBoloesService,
} = require('../dist/services/bolao/list-user-boloes.service')

test('assinante cria Mesa com Tampinhas como rascunho por capacidade e rodadas', async t => {
  const originalAssertPro = AssertActiveProUserService.execute
  const originalFindUnique = prisma.user.findUnique
  const originalTransaction = prisma.$transaction
  t.after(() => {
    AssertActiveProUserService.execute = originalAssertPro
    prisma.user.findUnique = originalFindUnique
    prisma.$transaction = originalTransaction
  })

  let subscriptionChecked = false
  AssertActiveProUserService.execute = async userId => {
    subscriptionChecked = true
    return { id: userId }
  }
  prisma.user.findUnique = async () => ({ id: 'subscriber-1' })

  let rankingData
  prisma.$transaction = async callback => callback({
    ranking: {
      create: async ({ data }) => {
        rankingData = data
        return data
      },
    },
    auditLog: { create: async () => ({}) },
  })

  const result = await CreateBolaoService.execute({
    name: 'Mesa da Freguesia',
    description: 'Primeiro lugar recebe toda a recompensa líquida.',
    startDate: new Date('2099-08-01T03:00:00.000Z'),
    entryEndDate: null,
    endDate: null,
    category: 'PAID',
    accessCost: 10,
    sponsorPrizePool: 0,
    maxParticipants: 50,
    eligibility: 'ALL',
    registrationCloseMode: 'CAPACITY',
    durationMode: 'ROUNDS',
    durationRounds: 5,
    prizeDistribution: [{ position: 1, percentage: 100 }],
    createdByUserId: 'subscriber-1',
  })

  assert.equal(subscriptionChecked, true)
  assert.equal(rankingData.status, 'DRAFT')
  assert.equal(rankingData.eligibility, 'ALL')
  assert.equal(rankingData.registrationCloseMode, 'CAPACITY')
  assert.equal(rankingData.durationMode, 'ROUNDS')
  assert.equal(rankingData.durationRounds, 5)
  assert.equal(rankingData.entryEndDate, null)
  assert.equal(rankingData.endDate, null)
  assert.equal(result.status, 'DRAFT')
})

test('freguês Na Calçada entra em Mesa aberta para toda a freguesia quando possui tampinhas', async t => {
  const originalAssertPro = AssertActiveProUserService.execute
  const originalTransaction = prisma.$transaction
  t.after(() => {
    AssertActiveProUserService.execute = originalAssertPro
    prisma.$transaction = originalTransaction
  })

  AssertActiveProUserService.execute = async () => {
    const error = new Error('assinatura não deveria ser exigida nesta Mesa')
    error.code = 'pro_subscription_required'
    throw error
  }

  let participantCreated = false
  prisma.$transaction = async callback => callback({
    ranking: {
      findUnique: async () => ({
        id: 'mesa-all',
        type: 'BOLAO',
        status: 'ACTIVE',
        category: 'PAID',
        eligibility: 'ALL',
        entryFee: 10,
        accessCost: 10,
        sponsorPrizePool: 0,
        maxParticipants: 20,
        currentParticipants: 1,
        createdByUserId: 'subscriber-owner',
        startDate: new Date('2020-01-01T00:00:00.000Z'),
        entryEndDate: null,
        endDate: null,
      }),
      findUniqueOrThrow: async () => ({ grossCollected: 10 }),
      updateMany: async () => ({ count: 1 }),
      update: async ({ data }) => data,
    },
    rankingParticipant: {
      findUnique: async () => null,
      create: async ({ data }) => {
        participantCreated = true
        return { id: 'participant-sidewalk', ...data }
      },
    },
    user: {
      findUnique: async () => ({
        scoreTotal: 0,
        subscription: null,
      }),
    },
    wallet: {
      findUnique: async () => ({ id: 'wallet-sidewalk', balance: 20 }),
      updateMany: async () => ({ count: 1 }),
    },
    walletLedger: { create: async () => ({}) },
    userScoreHistory: { findFirst: async () => null },
    auditLog: { create: async () => ({}) },
  })

  const result = await JoinBolaoService.execute({
    rankingId: 'mesa-all',
    userId: 'sidewalk-user',
  })

  assert.equal(participantCreated, true)
  assert.equal(result.status, 'APPROVED')
})

test('somente o dono publica o rascunho e abre a Mesa para a freguesia', async t => {
  const { PublishMesaService } = require('../dist/services/bolao/publish-mesa.service')
  const originalAssertPro = AssertActiveProUserService.execute
  const originalFindUnique = prisma.ranking.findUnique
  const originalUpdate = prisma.ranking.update
  t.after(() => {
    prisma.ranking.findUnique = originalFindUnique
    prisma.ranking.update = originalUpdate
    AssertActiveProUserService.execute = originalAssertPro
  })

  AssertActiveProUserService.execute = async userId => ({ id: userId })

  prisma.ranking.findUnique = async () => ({
    id: 'draft-1',
    type: 'BOLAO',
    status: 'DRAFT',
    createdByUserId: 'subscriber-1',
  })

  let update
  prisma.ranking.update = async input => {
    update = input
    return { ...input.data, id: input.where.id }
  }

  const result = await PublishMesaService.execute({
    rankingId: 'draft-1',
    requestedByUserId: 'subscriber-1',
  })

  assert.equal(update.where.id, 'draft-1')
  assert.equal(update.data.status, 'ACTIVE')
  assert.ok(update.data.publishedAt instanceof Date)
  assert.equal(result.status, 'ACTIVE')
})

test('dono encontra seus rascunhos mesmo sem participar da Mesa', async t => {
  const originalParticipantFindMany = prisma.rankingParticipant.findMany
  const originalRankingFindMany = prisma.ranking.findMany
  t.after(() => {
    prisma.rankingParticipant.findMany = originalParticipantFindMany
    prisma.ranking.findMany = originalRankingFindMany
  })

  prisma.rankingParticipant.findMany = async () => []
  prisma.ranking.findMany = async () => [{
    id: 'draft-owned',
    name: 'Rascunho do Balcão',
    description: 'Configuração ainda não publicada.',
    status: 'DRAFT',
    entryFee: 10,
    accessCost: 10,
    category: 'PAID',
    eligibility: 'ALL',
    registrationCloseMode: 'CAPACITY',
    durationMode: 'ROUNDS',
    durationRounds: 5,
    sponsorPrizePool: 0,
    prizeDistribution: [{ position: 1, percentage: 100 }],
    grossCollected: 0,
    platformFee: 0,
    prizePool: 0,
    rewardPool: 0,
    settledAt: null,
    startDate: new Date('2099-08-01T03:00:00.000Z'),
    entryEndDate: null,
    endDate: null,
    currentParticipants: 0,
    maxParticipants: 50,
    createdByUserId: 'subscriber-1',
  }]

  const mesas = await ListUserBoloesService.execute({ userId: 'subscriber-1' })

  assert.equal(mesas.length, 1)
  assert.equal(mesas[0].id, 'draft-owned')
  assert.equal(mesas[0].isOwner, true)
  assert.equal(mesas[0].status, 'DRAFT')
})
