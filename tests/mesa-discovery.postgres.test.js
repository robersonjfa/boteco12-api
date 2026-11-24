const assert = require('node:assert/strict')
const test = require('node:test')
const { after } = require('node:test')

if (process.env.B12_POSTGRES_INTEGRATION !== 'true') {
  throw new Error('B12_POSTGRES_INTEGRATION=true is required')
}

const { prisma } = require('../dist/lib/prisma')
const { DiscoverMesasService } = require('../dist/services/bolao/discover-mesas.service')

const NOW = new Date('2026-09-24T12:00:00.000Z')
const VIEWER_ID = 'mesa-discovery-viewer'
const OWNER_ID = 'mesa-discovery-owner'
const MESA_PREFIX = 'mesa-discovery-integration-'
const SPONSORED_VIEWER_ID = 'mesa-sponsored-viewer'
const SPONSORED_OWNER_ID = 'mesa-sponsored-owner'
const SPONSORED_PREFIX = 'mesa-sponsored-integration-'

after(async () => {
  await prisma.$disconnect()
})

test('PostgreSQL pagina e ordena todas as Mesas sem janela artificial', async t => {
  t.after(async () => {
    await prisma.ranking.deleteMany({ where: { id: { startsWith: MESA_PREFIX } } })
    await prisma.user.deleteMany({ where: { id: { in: [VIEWER_ID, OWNER_ID] } } })
  })

  await prisma.user.createMany({
    data: [
      { id: VIEWER_ID, name: 'Viewer', email: 'mesa-viewer@example.test', password: 'hash' },
      { id: OWNER_ID, name: 'Organizador', nickname: 'Dono SQL', email: 'mesa-owner@example.test', password: 'hash' },
    ],
  })
  await prisma.wallet.create({ data: { userId: VIEWER_ID, balance: 0 } })
  await prisma.ranking.createMany({
    data: Array.from({ length: 305 }, (_, index) => ({
      id: `${MESA_PREFIX}${String(index).padStart(3, '0')}`,
      name: `Mesa SQL ${String(index).padStart(3, '0')}`,
      description: 'Integração de paginação no PostgreSQL.',
      type: 'BOLAO',
      status: 'ACTIVE',
      category: 'FREE',
      eligibility: 'ALL',
      entryFee: 0,
      accessCost: 0,
      rewardPool: index,
      prizePool: index,
      registrationCloseMode: 'CAPACITY',
      maxParticipants: 10,
      currentParticipants: 1,
      durationMode: 'DATE',
      startDate: new Date('2026-09-20T00:00:00.000Z'),
      entryEndDate: new Date('2026-10-30T00:00:00.000Z'),
      endDate: new Date('2026-11-30T00:00:00.000Z'),
      createdAt: new Date(Date.UTC(2026, 8, 1, 0, index)),
      createdByUserId: OWNER_ID,
    })),
  })

  const deepPage = await DiscoverMesasService.execute({
    userId: VIEWER_ID,
    query: 'Dono SQL',
    category: 'FREE',
    access: 'CAN_JOIN',
    page: 26,
    limit: 12,
    now: NOW,
  })

  assert.equal(deepPage.meta.total, 305)
  assert.equal(deepPage.meta.totalPages, 26)
  assert.equal(deepPage.meta.truncated, false)
  assert.deepEqual(deepPage.meta.counts, { canJoin: 305, closingSoon: 0, upcoming: 0 })
  assert.equal(deepPage.mesas.length, 5)

  const highestReward = await DiscoverMesasService.execute({
    userId: VIEWER_ID,
    category: 'FREE',
    sort: 'HIGHEST_REWARD',
    page: 1,
    limit: 12,
    now: NOW,
  })

  assert.equal(highestReward.mesas[0].id, `${MESA_PREFIX}304`)
  assert.equal(highestReward.mesas[0].rewardPool, 304)
})

test('PostgreSQL exige saldo para patrocinada paga e mantém a gratuita elegível', async t => {
  t.after(async () => {
    await prisma.ranking.deleteMany({ where: { id: { startsWith: SPONSORED_PREFIX } } })
    await prisma.user.deleteMany({ where: { id: { in: [SPONSORED_VIEWER_ID, SPONSORED_OWNER_ID] } } })
  })

  await prisma.user.createMany({
    data: [
      {
        id: SPONSORED_VIEWER_ID,
        name: 'Viewer patrocinada',
        email: 'mesa-sponsored-viewer@example.test',
        password: 'hash',
      },
      {
        id: SPONSORED_OWNER_ID,
        name: 'Patrocinador',
        nickname: 'Casa do Patrocínio',
        email: 'mesa-sponsored-owner@example.test',
        password: 'hash',
      },
    ],
  })
  await prisma.wallet.create({ data: { userId: SPONSORED_VIEWER_ID, balance: 0 } })
  await prisma.ranking.createMany({
    data: [
      {
        id: `${SPONSORED_PREFIX}paid`,
        name: 'Patrocinada Paga',
        description: 'Entrada paga com prêmio patrocinado.',
        type: 'BOLAO',
        status: 'ACTIVE',
        category: 'SPONSORED_FREE',
        eligibility: 'ALL',
        entryFee: 10,
        accessCost: 10,
        sponsorName: 'Casa do Patrocínio',
        sponsorPrizePool: 100,
        rewardPool: 0,
        prizePool: 0,
        registrationCloseMode: 'CAPACITY',
        maxParticipants: 10,
        currentParticipants: 1,
        durationMode: 'DATE',
        startDate: new Date('2026-09-20T00:00:00.000Z'),
        entryEndDate: new Date('2026-10-30T00:00:00.000Z'),
        endDate: new Date('2026-11-30T00:00:00.000Z'),
        createdByUserId: SPONSORED_OWNER_ID,
      },
      {
        id: `${SPONSORED_PREFIX}free`,
        name: 'Patrocinada Gratuita',
        description: 'Entrada gratuita com prêmio patrocinado.',
        type: 'BOLAO',
        status: 'ACTIVE',
        category: 'SPONSORED_FREE',
        eligibility: 'ALL',
        entryFee: 0,
        accessCost: 0,
        sponsorName: 'Casa do Patrocínio',
        sponsorPrizePool: 100,
        rewardPool: 0,
        prizePool: 0,
        registrationCloseMode: 'CAPACITY',
        maxParticipants: 10,
        currentParticipants: 1,
        durationMode: 'DATE',
        startDate: new Date('2026-09-20T00:00:00.000Z'),
        entryEndDate: new Date('2026-10-30T00:00:00.000Z'),
        endDate: new Date('2026-11-30T00:00:00.000Z'),
        createdByUserId: SPONSORED_OWNER_ID,
      },
    ],
  })

  const list = (extra = {}) => DiscoverMesasService.execute({
    userId: SPONSORED_VIEWER_ID,
    query: 'Patrocinada',
    now: NOW,
    page: 1,
    limit: 12,
    ...extra,
  })

  const withoutBalance = await list()
  const paidWithoutBalance = withoutBalance.mesas.find(item => item.id === `${SPONSORED_PREFIX}paid`)
  const free = withoutBalance.mesas.find(item => item.id === `${SPONSORED_PREFIX}free`)
  assert.equal(paidWithoutBalance.accessState, 'INSUFFICIENT_BALANCE')
  assert.equal(paidWithoutBalance.recommendationReason, 'Saldo de Tampinhas insuficiente')
  assert.equal(free.accessState, 'CAN_JOIN')
  assert.equal(free.recommendationReason, 'Sem custo de entrada')
  assert.equal(withoutBalance.meta.counts.canJoin, 1)

  const payable = await list({ access: 'CAN_JOIN' })
  assert.deepEqual(payable.mesas.map(item => item.id), [`${SPONSORED_PREFIX}free`])

  const freeOnly = await list({ maxCost: 0 })
  assert.deepEqual(freeOnly.mesas.map(item => item.id), [`${SPONSORED_PREFIX}free`])

  const costedOnly = await list({ minCost: 1 })
  assert.deepEqual(costedOnly.mesas.map(item => item.id), [`${SPONSORED_PREFIX}paid`])

  await prisma.wallet.update({ where: { userId: SPONSORED_VIEWER_ID }, data: { balance: 100 } })

  const withBalance = await list()
  const paidWithBalance = withBalance.mesas.find(item => item.id === `${SPONSORED_PREFIX}paid`)
  assert.equal(paidWithBalance.accessState, 'CAN_JOIN')
  assert.equal(paidWithBalance.recommendationReason, 'Você pode entrar agora')
  assert.equal(withBalance.meta.counts.canJoin, 2)
})
