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
const {
  UpdateMesaService,
} = require('../dist/services/bolao/update-mesa.service')
const { CreateMesaSchema } = require('../dist/validators/bolao.validator')

test('Mesa por lugares usa rodadas e Mesa por data usa datas explícitas', () => {
  const base = {
    name: 'Mesa Free da Freguesia',
    description: 'Mesa gratuita com prazo de proteção.',
    startDate: '2099-08-01T03:00:00.000Z',
    category: 'FREE',
    eligibility: 'ALL',
    registrationCloseMode: 'CAPACITY',
    maxParticipants: 50,
    durationMode: 'ROUNDS',
    durationRounds: 5,
    accessCost: 0,
    sponsorPrizePool: 0,
    prizeDistribution: [],
  }

  assert.equal(CreateMesaSchema.safeParse(base).success, true)
  assert.equal(CreateMesaSchema.safeParse({
    ...base,
    endDate: '2099-09-01T02:59:59.000Z',
  }).success, false)
  assert.equal(CreateMesaSchema.safeParse({
    ...base,
    registrationCloseMode: 'DATE',
    maxParticipants: null,
    entryEndDate: '2099-08-15T02:59:59.000Z',
    durationMode: 'DATE',
    durationRounds: null,
    endDate: '2099-09-01T02:59:59.000Z',
  }).success, true)
})

test('usuário Na Calçada cria Mesa Free sem assinatura PRO', async t => {
  const originalAssertPro = AssertActiveProUserService.execute
  const originalFindUnique = prisma.user.findUnique
  const originalTransaction = prisma.$transaction
  t.after(() => {
    AssertActiveProUserService.execute = originalAssertPro
    prisma.user.findUnique = originalFindUnique
    prisma.$transaction = originalTransaction
  })

  AssertActiveProUserService.execute = async () => {
    throw new Error('assinatura não deveria ser consultada para Mesa Free')
  }
  prisma.user.findUnique = async () => ({ id: 'free-user', role: 'NORMAL' })
  prisma.$transaction = async callback => callback({
    ranking: { create: async ({ data }) => data },
    auditLog: { create: async () => ({}) },
  })

  const result = await CreateBolaoService.execute({
    name: 'Mesa Free da Calçada',
    description: 'Mesa aberta e gratuita para a freguesia.',
    startDate: new Date('2099-08-01T03:00:00.000Z'),
    endDate: null,
    category: 'FREE',
    accessCost: 0,
    sponsorPrizePool: 0,
    maxParticipants: 50,
    registrationCloseMode: 'CAPACITY',
    durationMode: 'ROUNDS',
    durationRounds: 5,
    prizeDistribution: [],
    createdByUserId: 'free-user',
  })

  assert.equal(result.category, 'FREE')
  assert.equal(result.endDate, null)
})

test('endpoint comum não cria Mesa Patrocinada nem com User.role legado de admin', async t => {
  const originalFindUnique = prisma.user.findUnique
  t.after(() => { prisma.user.findUnique = originalFindUnique })
  prisma.user.findUnique = async () => ({ id: 'legacy-admin', role: 'ADMIN' })

  await assert.rejects(CreateBolaoService.execute({
    name: 'Mesa Patrocinada Indevida',
    description: 'Premiação patrocinada distribuída ao encerramento.',
    startDate: new Date('2099-08-01T03:00:00.000Z'),
    endDate: null,
    category: 'SPONSORED_FREE',
    accessCost: 0,
    sponsorPrizePool: 100,
    maxParticipants: 50,
    registrationCloseMode: 'CAPACITY',
    durationMode: 'ROUNDS',
    durationRounds: 5,
    prizeDistribution: [{ position: 1, percentage: 100 }],
    createdByUserId: 'legacy-admin',
  }), { code: 'sponsored_mesa_admin_only' })
})

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
  assert.equal(rankingData.publishedAt, null)
  assert.equal(result.status, 'DRAFT')
})

test('criação permite publicar agora ou agendar para o início das inscrições', async t => {
  const originalFindUnique = prisma.user.findUnique
  const originalTransaction = prisma.$transaction
  t.after(() => {
    prisma.user.findUnique = originalFindUnique
    prisma.$transaction = originalTransaction
  })

  prisma.user.findUnique = async () => ({ id: 'admin-1' })
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

  const base = {
    description: 'Recompensa integral para o primeiro colocado.',
    startDate: new Date('2099-08-01T03:00:00.000Z'),
    entryEndDate: null,
    endDate: null,
    category: 'PAID',
    accessCost: 10,
    sponsorPrizePool: 0,
    maxParticipants: 2,
    registrationCloseMode: 'CAPACITY',
    durationMode: 'ROUNDS',
    durationRounds: 5,
    prizeDistribution: [{ position: 1, percentage: 100 }],
    createdByUserId: 'admin-1',
    administrative: true,
  }

  const published = await CreateBolaoService.execute({
    ...base,
    name: 'Mesa publicada agora',
    publicationMode: 'NOW',
  })
  assert.equal(published.status, 'ACTIVE')
  assert.ok(rankingData.publishedAt instanceof Date)

  const scheduled = await CreateBolaoService.execute({
    ...base,
    name: 'Mesa agendada',
    publicationMode: 'AT_START',
  })
  assert.equal(scheduled.status, 'DRAFT')
  assert.equal(
    rankingData.publishedAt.toISOString(),
    base.startDate.toISOString()
  )
})

test('recompensas não podem superar os lugares disponíveis', () => {
  const result = CreateMesaSchema.safeParse({
    name: 'Mesa pequena',
    description: 'Premiação configurada para os participantes.',
    startDate: '2099-08-01T03:00:00.000Z',
    category: 'PAID',
    accessCost: 10,
    sponsorPrizePool: 0,
    registrationCloseMode: 'CAPACITY',
    maxParticipants: 2,
    durationMode: 'ROUNDS',
    durationRounds: 5,
    prizeDistribution: [
      { position: 1, percentage: 60 },
      { position: 2, percentage: 30 },
      { position: 3, percentage: 10 },
    ],
  })

  assert.equal(result.success, false)
  assert.match(JSON.stringify(result.error?.issues), /lugares disponíveis/)
})

test('dono edita recompensa, quantidade de prêmios e percentuais do rascunho', async t => {
  const originalAssertPro = AssertActiveProUserService.execute
  const originalRankingFindUnique = prisma.ranking.findUnique
  const originalUserFindUnique = prisma.user.findUnique
  const originalTransaction = prisma.$transaction
  t.after(() => {
    AssertActiveProUserService.execute = originalAssertPro
    prisma.ranking.findUnique = originalRankingFindUnique
    prisma.user.findUnique = originalUserFindUnique
    prisma.$transaction = originalTransaction
  })

  AssertActiveProUserService.execute = async userId => ({ id: userId })
  prisma.ranking.findUnique = async () => ({
    id: 'draft-editable',
    type: 'BOLAO',
    status: 'DRAFT',
    createdByUserId: 'owner-1',
  })
  prisma.user.findUnique = async () => ({ id: 'owner-1', role: 'NORMAL' })

  let updateData
  let updateWhere
  let auditData
  prisma.$transaction = async callback => callback({
    ranking: {
      updateMany: async ({ data, where }) => {
        updateData = data
        updateWhere = where
        return { count: 1 }
      },
      findUniqueOrThrow: async () => ({
          id: 'draft-editable',
          status: 'DRAFT',
          currentParticipants: 0,
          grossCollected: 0,
          platformFee: 0,
          settledAt: null,
          ...updateData,
      }),
    },
    auditLog: { create: async ({ data }) => { auditData = data; return data } },
  })

  const updateInput = {
    rankingId: 'draft-editable',
    requestedByUserId: 'owner-1',
    name: 'Mesa com nova recompensa',
    description: 'Dois produtos serão entregues aos primeiros colocados.',
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
    prizeDistribution: [
      { position: 1, percentage: 70 },
      { position: 2, percentage: 30 },
    ],
  }
  const result = await UpdateMesaService.execute(updateInput)

  assert.deepEqual(updateData.prizeDistribution, [
    { position: 1, percentage: 70 },
    { position: 2, percentage: 30 },
  ])
  assert.equal(updateData.description, 'Dois produtos serão entregues aos primeiros colocados.')
  assert.equal(auditData.action, 'BOLAO_UPDATED')
  assert.equal(
    auditData.metadata.description,
    'Dois produtos serão entregues aos primeiros colocados.'
  )
  assert.equal(result.status, 'DRAFT')

  const adminResult = await UpdateMesaService.execute({
    ...updateInput,
    requestedByUserId: 'operator-1',
    administrative: true,
  })
  assert.equal(adminResult.status, 'DRAFT')
  assert.equal(updateWhere.createdByUserId, undefined)
})

test('Mesa publicada não pode mais ser editada', async t => {
  const originalRankingFindUnique = prisma.ranking.findUnique
  t.after(() => { prisma.ranking.findUnique = originalRankingFindUnique })
  prisma.ranking.findUnique = async () => ({
    id: 'active-1', type: 'BOLAO', status: 'ACTIVE', createdByUserId: 'owner-1',
  })

  await assert.rejects(UpdateMesaService.execute({
    rankingId: 'active-1',
    requestedByUserId: 'owner-1',
    name: 'Mesa publicada',
    description: 'Esta alteração não deve ser aceita pela aplicação.',
    startDate: new Date('2099-08-01T03:00:00.000Z'),
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
  }), { code: 'mesa_update_draft_only' })
})

test('admin edita Mesa ativa de qualquer dono sem zerar arrecadação', async t => {
  const originalRankingFindUnique = prisma.ranking.findUnique
  const originalUserFindUnique = prisma.user.findUnique
  const originalTransaction = prisma.$transaction
  t.after(() => {
    prisma.ranking.findUnique = originalRankingFindUnique
    prisma.user.findUnique = originalUserFindUnique
    prisma.$transaction = originalTransaction
  })

  const activeMesa = {
    id: 'active-admin-edit', type: 'BOLAO', status: 'ACTIVE',
    createdByUserId: 'owner-1', category: 'PAID', accessCost: 10,
    sponsorPrizePool: 0, prizeDistribution: [{ position: 1, percentage: 100 }],
    currentParticipants: 3, grossCollected: 30, platformFee: 3,
    prizePool: 27, rewardPool: 27, settledAt: null,
  }
  prisma.ranking.findUnique = async () => activeMesa
  prisma.user.findUnique = async () => ({ id: 'admin-1' })

  let updateData
  let updateWhere
  prisma.$transaction = async callback => callback({
    ranking: {
      updateMany: async ({ data, where }) => {
        updateData = data
        updateWhere = where
        return { count: 1 }
      },
      findUniqueOrThrow: async () => ({
        ...activeMesa,
        ...updateData,
        name: updateData.name,
        startDate: updateData.startDate,
        entryEndDate: updateData.entryEndDate,
        endDate: updateData.endDate,
      }),
    },
    auditLog: { create: async () => ({}) },
  })

  const result = await UpdateMesaService.execute({
    rankingId: activeMesa.id,
    requestedByUserId: 'admin-1',
    administrative: true,
    name: 'Mesa ativa revisada',
    description: 'Recompensa integral para o primeiro colocado.',
    startDate: new Date('2026-01-01T03:00:00.000Z'),
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
  })

  assert.equal(updateWhere.status, 'ACTIVE')
  assert.equal(updateWhere.createdByUserId, undefined)
  assert.equal('grossCollected' in updateData, false)
  assert.equal('platformFee' in updateData, false)
  assert.equal('prizePool' in updateData, false)
  assert.equal('rewardPool' in updateData, false)
  assert.equal(result.status, 'ACTIVE')
})

test('admin não altera termos financeiros de Mesa com participantes', async t => {
  const originalRankingFindUnique = prisma.ranking.findUnique
  const originalUserFindUnique = prisma.user.findUnique
  t.after(() => {
    prisma.ranking.findUnique = originalRankingFindUnique
    prisma.user.findUnique = originalUserFindUnique
  })

  prisma.ranking.findUnique = async () => ({
    id: 'active-funded', type: 'BOLAO', status: 'ACTIVE',
    createdByUserId: 'owner-1', category: 'PAID', accessCost: 10,
    sponsorPrizePool: 0, prizeDistribution: [{ position: 1, percentage: 100 }],
    currentParticipants: 2, grossCollected: 20, settledAt: null,
  })
  prisma.user.findUnique = async () => ({ id: 'admin-1' })

  await assert.rejects(UpdateMesaService.execute({
    rankingId: 'active-funded',
    requestedByUserId: 'admin-1',
    administrative: true,
    name: 'Mesa ativa',
    description: 'Recompensa integral para o primeiro colocado.',
    startDate: new Date('2026-01-01T03:00:00.000Z'),
    entryEndDate: null,
    endDate: null,
    category: 'PAID',
    accessCost: 20,
    sponsorPrizePool: 0,
    maxParticipants: 50,
    eligibility: 'ALL',
    registrationCloseMode: 'CAPACITY',
    durationMode: 'ROUNDS',
    durationRounds: 5,
    prizeDistribution: [{ position: 1, percentage: 100 }],
  }), { code: 'mesa_financial_terms_locked' })
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

test('último lugar encerra as inscrições por capacidade no instante da reserva', async t => {
  const originalTransaction = prisma.$transaction
  t.after(() => { prisma.$transaction = originalTransaction })

  let reservationData
  prisma.$transaction = async callback => callback({
    ranking: {
      findUnique: async () => ({
        id: 'mesa-last-seat', type: 'BOLAO', status: 'ACTIVE', category: 'FREE',
        eligibility: 'ALL', registrationCloseMode: 'CAPACITY', entryFee: 0,
        accessCost: 0, sponsorPrizePool: 0, maxParticipants: 2,
        currentParticipants: 1, createdByUserId: 'owner',
        startDate: new Date('2020-01-01T00:00:00.000Z'), entryEndDate: null, endDate: null,
      }),
      updateMany: async ({ data }) => { reservationData = data; return { count: 1 } },
    },
    rankingParticipant: {
      findUnique: async () => null,
      create: async ({ data }) => ({ id: 'last-seat', ...data }),
    },
    user: { findUnique: async () => ({ scoreTotal: 0, subscription: null }) },
    userScoreHistory: { findFirst: async () => null },
    auditLog: { create: async () => ({}) },
  })

  await JoinBolaoService.execute({ rankingId: 'mesa-last-seat', userId: 'customer' })

  assert.equal(reservationData.currentParticipants.increment, 1)
  assert.ok(reservationData.registrationClosedAt instanceof Date)
})

test('Mesa com inscrições por data aceita entrada sem exigir capacidade', async t => {
  const originalTransaction = prisma.$transaction
  t.after(() => { prisma.$transaction = originalTransaction })

  let directUpdateData
  prisma.$transaction = async callback => callback({
    ranking: {
      findUnique: async () => ({
        id: 'mesa-date', type: 'BOLAO', status: 'ACTIVE', category: 'FREE',
        eligibility: 'ALL', registrationCloseMode: 'DATE', entryFee: 0,
        accessCost: 0, sponsorPrizePool: 0, maxParticipants: null,
        currentParticipants: 3, createdByUserId: 'owner',
        startDate: new Date('2020-01-01T00:00:00.000Z'),
        entryEndDate: new Date('2099-12-31T02:59:59.000Z'), endDate: null,
      }),
      updateMany: async () => { throw new Error('não deve reservar por capacidade') },
      update: async ({ data }) => { directUpdateData = data; return { grossCollected: 0 } },
    },
    rankingParticipant: {
      findUnique: async () => null,
      create: async ({ data }) => ({ id: 'date-seat', ...data }),
    },
    user: { findUnique: async () => ({ scoreTotal: 0, subscription: null }) },
    userScoreHistory: { findFirst: async () => null },
    auditLog: { create: async () => ({}) },
  })

  await JoinBolaoService.execute({ rankingId: 'mesa-date', userId: 'customer' })

  assert.equal(directUpdateData.currentParticipants.increment, 1)
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

test('usuário Na Calçada publica sua Mesa Free sem assinatura PRO', async t => {
  const { PublishMesaService } = require('../dist/services/bolao/publish-mesa.service')
  const originalAssertPro = AssertActiveProUserService.execute
  const originalFindUnique = prisma.ranking.findUnique
  const originalUpdate = prisma.ranking.update
  t.after(() => {
    AssertActiveProUserService.execute = originalAssertPro
    prisma.ranking.findUnique = originalFindUnique
    prisma.ranking.update = originalUpdate
  })

  AssertActiveProUserService.execute = async () => {
    throw new Error('assinatura não deveria ser consultada para Mesa Free')
  }
  prisma.ranking.findUnique = async () => ({
    id: 'free-draft', type: 'BOLAO', status: 'DRAFT', category: 'FREE',
    createdByUserId: 'free-owner',
  })
  prisma.ranking.update = async input => ({ ...input.data, id: input.where.id })

  const result = await PublishMesaService.execute({
    rankingId: 'free-draft',
    requestedByUserId: 'free-owner',
  })

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
