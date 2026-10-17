const assert = require('node:assert/strict')
const test = require('node:test')

if (process.env.B12_POSTGRES_INTEGRATION !== 'true') {
  throw new Error('B12_POSTGRES_INTEGRATION=true is required')
}

const { prisma } = require('../dist/lib/prisma')
const { WalletService } = require('../dist/services/wallet/wallet.service')
const { JoinBolaoService } = require('../dist/services/bolao/join-bolao.service')

const PREFIX = 'mesa-reference-round-integration'
const MESA_ID = `${PREFIX}-mesa`
const USER_ONE_ID = `${PREFIX}-user-1`
const USER_TWO_ID = `${PREFIX}-user-2`
const USER_THREE_ID = `${PREFIX}-user-3`
const ROUND_IDS = [30, 31, 32, 33].map(number => `${PREFIX}-round-${number}`)

async function cleanup() {
  await prisma.ranking.deleteMany({ where: { id: MESA_ID } })
  await prisma.round.deleteMany({ where: { id: { in: ROUND_IDS } } })
  await prisma.user.deleteMany({ where: { id: { in: [USER_ONE_ID, USER_TWO_ID, USER_THREE_ID] } } })
}

async function seed() {
  await cleanup()

  await prisma.user.createMany({
    data: [
      {
        id: USER_ONE_ID,
        name: 'Participante 1',
        email: `${USER_ONE_ID}@example.test`,
        password: 'hash',
        scoreTotal: 153,
      },
      {
        id: USER_TWO_ID,
        name: 'Participante 2',
        email: `${USER_TWO_ID}@example.test`,
        password: 'hash',
        scoreTotal: 153,
      },
    ],
  })
  await WalletService.credit(USER_ONE_ID, 80, PREFIX)
  await WalletService.credit(USER_TWO_ID, 100, PREFIX)

  await prisma.round.createMany({
    data: [
      {
        id: ROUND_IDS[0],
        number: 30,
        status: 'SCORED',
        openAt: new Date('2026-10-10T10:00:00.000Z'),
        closeAt: new Date('2026-10-10T12:00:00.000Z'),
      },
      {
        id: ROUND_IDS[1],
        number: 31,
        status: 'SCORED',
        openAt: new Date('2026-10-11T10:00:00.000Z'),
        closeAt: new Date('2026-10-11T12:00:00.000Z'),
      },
      {
        id: ROUND_IDS[2],
        number: 32,
        status: 'OPEN',
        openAt: new Date('2026-10-12T10:00:00.000Z'),
      },
      {
        id: ROUND_IDS[3],
        number: 33,
        status: 'DRAFT',
      },
    ],
  })

  await prisma.userScoreHistory.createMany({
    data: [USER_ONE_ID, USER_TWO_ID].flatMap(userId => [
      {
        userId,
        roundId: ROUND_IDS[0],
        scoreRound: 143,
        scoreTotal: 143,
      },
      {
        userId,
        roundId: ROUND_IDS[1],
        scoreRound: 10,
        scoreTotal: 153,
      },
    ]),
  })

  await prisma.ranking.create({
    data: {
      id: MESA_ID,
      name: `Mesa ${PREFIX}`,
      description: 'Fixture PostgreSQL das rodadas 30 a 33.',
      type: 'BOLAO',
      status: 'ACTIVE',
      category: 'PAID',
      eligibility: 'ALL',
      registrationCloseMode: 'CAPACITY',
      durationMode: 'ROUNDS',
      durationRounds: 2,
      startDate: new Date('2026-10-12T09:00:00.000Z'),
      accessCost: 20,
      entryFee: 20,
      maxParticipants: 2,
      currentParticipants: 1,
      grossCollected: 20,
      platformFee: 2,
      prizePool: 18,
      rewardPool: 18,
      prizeDistribution: [{ position: 1, percentage: 100 }],
      createdByUserId: USER_ONE_ID,
      participants: {
        create: {
          userId: USER_ONE_ID,
          score: 0,
          scoreInitial: 153,
          status: 'APPROVED',
          approvedAt: new Date('2026-10-12T09:30:00.000Z'),
          entryFeePaid: 20,
          entryPaidAt: new Date('2026-10-12T09:30:00.000Z'),
        },
      },
    },
  })

}

test.after(async () => { await cleanup(); await prisma.$disconnect() })
test.beforeEach(seed)
test.afterEach(cleanup)

test('última vaga persiste a rodada 32 aberta como referência sem declarar baseline capturado', async () => {
  await JoinBolaoService.execute({ rankingId: MESA_ID, userId: USER_TWO_ID })

  // JSON projection also runs against the pre-expansion schema, so RED proves
  // missing persisted lifecycle state after a successful real join.
  const [row] = await prisma.$queryRaw`
    SELECT to_jsonb(r) AS mesa FROM rankings r WHERE id = ${MESA_ID}
  `
  const mesa = row.mesa
  mesa.participants = await prisma.rankingParticipant.findMany({
    where: { rankingId: MESA_ID },
    orderBy: { userId: 'asc' },
  })

  assert.equal(mesa.currentParticipants, 2)
  assert.ok(Number.isFinite(Date.parse(mesa.registrationClosedAt)))
  assert.equal(mesa.referenceRoundId, ROUND_IDS[2])
  assert.equal(mesa.initializationStatus, 'WAITING_FOR_REFERENCE_ROUND')
  assert.equal(mesa.scoreInitialCapturedAt, null)
  assert.ok(mesa.participants.every(participant => participant.status === 'APPROVED'))
  assert.deepEqual(
    mesa.participants.map(participant => ({
      userId: participant.userId,
      scoreInitial: participant.scoreInitial,
      captured: participant.scoreInitialCapturedAt,
    })),
    [
      { userId: USER_ONE_ID, scoreInitial: 153, captured: null },
      { userId: USER_TWO_ID, scoreInitial: 153, captured: null },
    ]
  )

  const wallet = await prisma.wallet.findUniqueOrThrow({
    where: { userId: USER_TWO_ID },
    select: { balance: true },
  })
  const debitCount = await prisma.walletLedger.count({
    where: { idempotencyKey: `bolao:entry:${MESA_ID}:${USER_TWO_ID}` },
  })
  assert.equal(wallet.balance, 80)
  assert.equal(debitCount, 1)
})


test('requisições concorrentes pela última vaga aprovam e debitam uma única vez', async () => {
  const results = await Promise.allSettled([1, 2].map(() =>
    JoinBolaoService.execute({ rankingId: MESA_ID, userId: USER_TWO_ID })
  ))
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  const mesa = await prisma.ranking.findUniqueOrThrow({ where: { id: MESA_ID } })
  assert.equal(mesa.currentParticipants, 2)
  assert.equal(mesa.referenceRoundId, ROUND_IDS[2])
  assert.equal(await prisma.walletLedger.count({ where: {
    idempotencyKey: `bolao:entry:${MESA_ID}:${USER_TWO_ID}`,
  } }), 1)
  assert.equal((await prisma.wallet.findUniqueOrThrow({ where: { userId: USER_TWO_ID } })).balance, 80)
})

test('duas entradas com contador inicial desatualizado ainda fecham na última vaga', async t => {
  await prisma.rankingParticipant.deleteMany({ where: { rankingId: MESA_ID } })
  await prisma.ranking.update({ where: { id: MESA_ID }, data: {
    currentParticipants: 0, grossCollected: 0, platformFee: 0, prizePool: 0, rewardPool: 0,
  } })
  const { RankingWindowScoreService } = require('../dist/services/ranking/ranking-window-score.service')
  const original = RankingWindowScoreService.getScoreTotalBefore
  t.after(() => { RankingWindowScoreService.getScoreTotalBefore = original })
  let arrived = 0
  let release
  const barrier = new Promise(resolve => { release = resolve })
  RankingWindowScoreService.getScoreTotalBefore = async (...args) => {
    if (++arrived === 2) release()
    await barrier
    return original.apply(RankingWindowScoreService, args)
  }
  await Promise.all([USER_ONE_ID, USER_TWO_ID].map(userId =>
    JoinBolaoService.execute({ rankingId: MESA_ID, userId })
  ))
  const mesa = await prisma.ranking.findUniqueOrThrow({ where: { id: MESA_ID } })
  assert.equal(mesa.currentParticipants, 2)
  assert.ok(mesa.registrationClosedAt)
  assert.equal(mesa.referenceRoundId, ROUND_IDS[2])
  assert.equal(mesa.initializationStatus, 'WAITING_FOR_REFERENCE_ROUND')
  assert.equal(await prisma.rankingParticipant.count({ where: { rankingId: MESA_ID, status: 'APPROVED' } }), 2)
  assert.equal(await prisma.walletLedger.count({ where: { type: 'DEBIT' } }), 2)
})

test('falha após reservar a última vaga reverte todos os efeitos e permite recuperação', async () => {
  await assert.rejects(prisma.$transaction(async tx => {
    await JoinBolaoService.execute({ rankingId: MESA_ID, userId: USER_TWO_ID }, tx)
    throw new Error('forced final-seat rollback')
  }), /forced final-seat rollback/)
  const mesa = await prisma.ranking.findUniqueOrThrow({ where: { id: MESA_ID } })
  assert.equal(mesa.currentParticipants, 1)
  assert.equal(mesa.grossCollected, 20)
  assert.equal(mesa.registrationClosedAt, null)
  assert.equal(mesa.referenceRoundId, null)
  assert.equal(mesa.initializationStatus, null)
  assert.equal(await prisma.rankingParticipant.count({ where: { rankingId: MESA_ID } }), 1)
  assert.equal(await prisma.walletLedger.count({ where: { type: 'DEBIT' } }), 0)
  assert.equal((await prisma.wallet.findUniqueOrThrow({ where: { userId: USER_TWO_ID } })).balance, 100)
  await JoinBolaoService.execute({ rankingId: MESA_ID, userId: USER_TWO_ID })
  assert.equal((await prisma.ranking.findUniqueOrThrow({ where: { id: MESA_ID } })).referenceRoundId, ROUND_IDS[2])
})

test('sem rodada aberta a última vaga falha atomicamente sem inventar referência', async () => {
  await prisma.round.update({ where: { id: ROUND_IDS[2] }, data: { status: 'CLOSED' } })
  await assert.rejects(JoinBolaoService.execute({ rankingId: MESA_ID, userId: USER_TWO_ID }), /rodada aberta/i)
  const mesa = await prisma.ranking.findUniqueOrThrow({ where: { id: MESA_ID } })
  assert.equal(mesa.currentParticipants, 1)
  assert.equal(mesa.registrationClosedAt, null)
  assert.equal(mesa.referenceRoundId, null)
  assert.equal(await prisma.walletLedger.count({ where: { type: 'DEBIT' } }), 0)
  assert.equal(await prisma.rankingParticipant.count({ where: { rankingId: MESA_ID } }), 1)
  assert.equal((await prisma.wallet.findUniqueOrThrow({ where: { userId: USER_TWO_ID } })).balance, 100)
})

test('nova rodada e repetição não substituem referência nem timestamp de fechamento', async () => {
  await JoinBolaoService.execute({ rankingId: MESA_ID, userId: USER_TWO_ID })
  const before = await prisma.ranking.findUniqueOrThrow({ where: { id: MESA_ID } })
  await prisma.round.update({ where: { id: ROUND_IDS[2] }, data: { status: 'SCORED' } })
  await prisma.round.update({ where: { id: ROUND_IDS[3] }, data: { status: 'OPEN' } })
  await assert.rejects(JoinBolaoService.execute({ rankingId: MESA_ID, userId: USER_TWO_ID }))
  const after = await prisma.ranking.findUniqueOrThrow({ where: { id: MESA_ID } })
  assert.equal(after.referenceRoundId, ROUND_IDS[2])
  assert.deepEqual(after.registrationClosedAt, before.registrationClosedAt)
  await assert.rejects(prisma.round.delete({ where: { id: ROUND_IDS[2] } }), { code: 'P2003' })
})


test('usuários distintos disputam a última vaga sem cobrar o perdedor', async () => {
  await prisma.user.create({ data: {
    id: USER_THREE_ID, name: 'Participante 3',
    email: `${USER_THREE_ID}@example.test`, password: 'hash',
  } })
  await WalletService.credit(USER_THREE_ID, 100, PREFIX)
  const users = [USER_TWO_ID, USER_THREE_ID]
  const results = await Promise.allSettled(users.map(userId =>
    JoinBolaoService.execute({ rankingId: MESA_ID, userId })
  ))
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  const mesa = await prisma.ranking.findUniqueOrThrow({ where: { id: MESA_ID } })
  assert.equal(mesa.currentParticipants, 2)
  assert.equal(mesa.grossCollected, 40)
  assert.equal(mesa.referenceRoundId, ROUND_IDS[2])
  assert.equal(mesa.initializationStatus, 'WAITING_FOR_REFERENCE_ROUND')
  for (let i = 0; i < users.length; i++) {
    const won = results[i].status === 'fulfilled'
    assert.equal((await prisma.wallet.findUniqueOrThrow({ where: { userId: users[i] } })).balance, won ? 80 : 100)
    assert.equal(await prisma.walletLedger.count({ where: {
      idempotencyKey: `bolao:entry:${MESA_ID}:${users[i]}`,
    } }), won ? 1 : 0)
  }
  assert.equal(await prisma.rankingParticipant.count({ where: { rankingId: MESA_ID, status: 'APPROVED' } }), 2)
})
