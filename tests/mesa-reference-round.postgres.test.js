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
const ROUND_IDS = [30, 31, 32, 33].map(number => `${PREFIX}-round-${number}`)

async function cleanup() {
  await prisma.ranking.deleteMany({ where: { id: MESA_ID } })
  await prisma.round.deleteMany({ where: { id: { in: ROUND_IDS } } })
  await prisma.user.deleteMany({ where: { id: { in: [USER_ONE_ID, USER_TWO_ID] } } })
}

test('última vaga persiste a rodada 32 aberta como referência sem declarar baseline capturado', async t => {
  t.after(async () => {
    await cleanup()
    await prisma.$disconnect()
  })

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
