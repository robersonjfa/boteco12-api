const assert = require('node:assert/strict')
const test = require('node:test')

if (process.env.B12_POSTGRES_INTEGRATION !== 'true') {
  throw new Error('B12_POSTGRES_INTEGRATION=true is required')
}

const { prisma } = require('../dist/lib/prisma')
const { WalletService } = require('../dist/services/wallet/wallet.service')
const { JoinBolaoService } = require('../dist/services/bolao/join-bolao.service')
const { ScoreRoundService } = require('../dist/services/score/score-round.service')
const { RecalculateRankingService } = require('../dist/services/ranking/recalculate-ranking.service')
const { GetBolaoRankingService } = require('../dist/services/bolao/get-bolao-ranking.service')
const { CloseRankingService } = require('../dist/services/ranking/close-ranking.service')
const { CloseExpiredRankingsService } = require('../dist/services/ranking/close-expired-rankings.service')
const { MesaLifecycleService } = require('../dist/services/bolao/mesa-lifecycle.service')
const { CreateBolaoService } = require('../dist/services/bolao/create-bolao.service')
const { spawnSync } = require('node:child_process')

const PREFIX = 'mesa-baseline-integration'
const MESA_ID = `${PREFIX}-mesa`
const USER_ONE_ID = `${PREFIX}-user-1`
const USER_TWO_ID = `${PREFIX}-user-2`
const USER_THREE_ID = `${PREFIX}-user-3`
const ROUND_IDS = [30, 31, 32, 33, 34].map(number => `${PREFIX}-round-${number}`)

async function cleanup() {
  await prisma.auditLog.deleteMany({ where: { entityId: MESA_ID } })
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
      totalDoubles: 3,
      totalSuperDoubles: 2,
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

const USERS = [USER_ONE_ID, USER_TWO_ID]
const RESULT = Array(12).fill('1').join(',')
const PREDICTION = [...Array(10).fill('1'), '2', '2'].join(',')
const CLOSED_AT = new Date('2026-10-12T10:30:00Z')

async function closeRegistration() {
  await JoinBolaoService.execute({ rankingId: MESA_ID, userId: USER_TWO_ID })
  // Fixed synthetic timeline, independent of the machine's clock.
  await prisma.ranking.update({ where: { id: MESA_ID }, data: { registrationClosedAt: CLOSED_AT } })
}

async function addTickets(roundId = ROUND_IDS[2], users = USERS) {
  await prisma.ticket.createMany({ data: users.map(userId => ({
    userId, roundId, prediction: PREDICTION, multipliers: Array(12).fill(1),
  })) })
}

async function scoreRound(index = 2) {
  await addTickets(ROUND_IDS[index])
  await prisma.round.update({ where: { id: ROUND_IDS[index] }, data: {
    status: 'CLOSED', result: RESULT,
    closeAt: new Date(`2026-10-${12 + index - 2}T12:00:00Z`),
  } })
  await new ScoreRoundService().execute(ROUND_IDS[index])
}

async function state() {
  return prisma.ranking.findUniqueOrThrow({ where: { id: MESA_ID }, include: {
    participants: { orderBy: { userId: 'asc' } },
  } })
}

function assertPending(mesa) {
  assert.equal(mesa.scoreInitialCapturedAt, null)
  assert.ok(mesa.participants.every(p => p.scoreInitialCapturedAt === null))
  assert.ok(mesa.participants.every(p => p.score === 0))
  assert.equal(mesa.endDate, null)
}

test.after(async () => { await cleanup(); await prisma.$disconnect() })
test.beforeEach(seed)
test.afterEach(cleanup)

test('rodada OPEN ou CLOSED mantém captura e competição pendentes, inclusive na leitura da API', async () => {
  await closeRegistration()
  await prisma.user.updateMany({ where: { id: { in: USERS } }, data: { scoreTotal: 163 } })
  for (const status of ['OPEN', 'CLOSED']) {
    await prisma.round.update({ where: { id: ROUND_IDS[2] }, data: { status } })
    await RecalculateRankingService.execute()
    assertPending(await state())
    const detail = await GetBolaoRankingService.execute({ rankingId: MESA_ID })
    assert.ok(detail.entries.every(p => p.score === 0 && p.scoreRound === 0 && p.position === 0))
  }
})

test('apuração real captura 163 e o total individual; rodada 32 não pontua nem entra no desempate', async () => {
  await closeRegistration()
  await prisma.rankingParticipant.updateMany({ where: { rankingId: MESA_ID }, data: {
    approvedAt: new Date('2026-10-12T08:00:00Z'),
  } })
  await prisma.user.update({ where: { id: USER_TWO_ID }, data: { scoreTotal: 200 } })
  await prisma.userScoreHistory.update({ where: { userId_roundId: {
    userId: USER_TWO_ID, roundId: ROUND_IDS[1],
  } }, data: { scoreTotal: 200 } })
  await scoreRound()
  const mesa = await state()
  assert.equal(mesa.initializationStatus, 'READY')
  assert.ok(mesa.scoreInitialCapturedAt instanceof Date)
  assert.deepEqual(mesa.participants.map(p => p.scoreInitial), [163, 210])
  assert.ok(mesa.participants.every(p => p.scoreInitialCapturedAt instanceof Date && p.score === 0))
  assert.ok(mesa.participants.every(p => p.tiebreakDoubleHits === 0 && p.tiebreakSuperDoubleHits === 0))
  const detail = await GetBolaoRankingService.execute({ rankingId: MESA_ID })
  assert.ok(detail.entries.every(p => p.score === 0 && p.scoreRound === 0))
})

test('histórico incompleto não captura parcialmente e pode ser recuperado pelo job periódico', async () => {
  await closeRegistration()
  await addTickets()
  await prisma.round.update({ where: { id: ROUND_IDS[2] }, data: { status: 'SCORED', closeAt: new Date('2026-10-12T12:00:00Z') } })
  await prisma.userScoreHistory.create({ data: { userId: USER_ONE_ID, roundId: ROUND_IDS[2], scoreRound: 10, scoreTotal: 163 } })
  await RecalculateRankingService.execute()
  const incomplete = await state()
  assertPending(incomplete)
  assert.equal(incomplete.initializationStatus, 'WAITING_FOR_BASELINE_CAPTURE')
  await prisma.userScoreHistory.create({ data: { userId: USER_TWO_ID, roundId: ROUND_IDS[2], scoreRound: 10, scoreTotal: 163 } })
  await new CloseExpiredRankingsService().execute()
  const recovered = await state()
  assert.equal(recovered.initializationStatus, 'READY')
  assert.deepEqual(recovered.participants.map(p => p.scoreInitial), [163, 163])
})

test('captura atrasada usa histórico da referência, nunca o total vivo 173 da rodada 33', async () => {
  await closeRegistration()
  await prisma.round.update({ where: { id: ROUND_IDS[2] }, data: { status: 'SCORED', closeAt: new Date('2026-10-12T12:00:00Z') } })
  await prisma.round.update({ where: { id: ROUND_IDS[3] }, data: { status: 'SCORED', closeAt: new Date('2026-10-13T12:00:00Z') } })
  await prisma.userScoreHistory.createMany({ data: USERS.flatMap(userId => [
    { userId, roundId: ROUND_IDS[2], scoreRound: 10, scoreTotal: 163 },
    { userId, roundId: ROUND_IDS[3], scoreRound: 10, scoreTotal: 173 },
  ]) })
  await prisma.user.updateMany({ where: { id: { in: USERS } }, data: { scoreTotal: 173 } })
  await RecalculateRankingService.execute()
  assert.deepEqual((await state()).participants.map(p => p.scoreInitial), [163, 163])
  assert.deepEqual((await state()).participants.map(p => p.score), [10, 10])
})

test('sem escolha na referência carrega histórico anterior; zero legítimo recebe timestamp', async () => {
  await closeRegistration()
  await prisma.userScoreHistory.deleteMany({ where: { userId: USER_TWO_ID } })
  await prisma.user.update({ where: { id: USER_TWO_ID }, data: { scoreTotal: 0 } })
  await prisma.round.update({ where: { id: ROUND_IDS[2] }, data: { status: 'SCORED', closeAt: new Date('2026-10-12T12:00:00Z') } })
  await RecalculateRankingService.execute()
  const mesa = await state()
  assert.equal(mesa.initializationStatus, 'READY')
  assert.deepEqual(mesa.participants.map(p => p.scoreInitial), [153, 0])
  assert.ok(mesa.participants.every(p => p.scoreInitialCapturedAt instanceof Date))
})

test('duas rodadas de duração contam 33 e 34, excluindo a referência 32', async () => {
  await closeRegistration()
  await scoreRound()
  await scoreRound(3)
  assert.deepEqual(await MesaLifecycleService.finishDueRoundMesas(prisma), [])
  assert.equal((await state()).endDate, null)
  await prisma.round.create({ data: { id: ROUND_IDS[4], number: 34, status: 'DRAFT' } })
  await scoreRound(4)
  assert.deepEqual(await MesaLifecycleService.finishDueRoundMesas(prisma), [MESA_ID])
  const mesa = await state()
  assert.deepEqual(mesa.endDate, new Date('2026-10-14T12:00:00Z'))
  const detail = await GetBolaoRankingService.execute({ rankingId: MESA_ID })
  assert.deepEqual(detail.entries.map(p => p.score), [20, 20])
})

test('encerramento forçado não liquida Mesa com captura pendente', async () => {
  await closeRegistration()
  await assert.rejects(new CloseRankingService().execute(MESA_ID, { force: true }), /inicial|captur/i)
  const mesa = await state()
  assert.equal(mesa.status, 'ACTIVE')
  assert.equal(mesa.settledAt, null)
})

test('evento duplicado, concorrência e processo novo preservam baseline e timestamps capturados', async () => {
  await closeRegistration()
  await scoreRound()
  const before = await state()
  await prisma.userScoreHistory.updateMany({ where: { roundId: ROUND_IDS[2] }, data: { scoreTotal: 999 } })
  await Promise.all([RecalculateRankingService.execute(), RecalculateRankingService.execute()])
  await new ScoreRoundService().execute(ROUND_IDS[2])
  const process = spawnSync(global.process.execPath, ['-e',
    "const {prisma}=require('./dist/lib/prisma'); require('./dist/services/ranking/recalculate-ranking.service').RecalculateRankingService.execute().then(()=>prisma.$disconnect()).catch(e=>{console.error(e);process.exit(1)})",
  ], { cwd: require('node:path').join(__dirname, '..'), env: global.process.env, encoding: 'utf8' })
  assert.equal(process.status, 0, process.stderr)
  const after = await state()
  assert.deepEqual(after.participants.map(p => [p.scoreInitial, p.scoreInitialCapturedAt]), before.participants.map(p => [p.scoreInitial, p.scoreInitialCapturedAt]))
  assert.deepEqual(after.scoreInitialCapturedAt, before.scoreInitialCapturedAt)
  assert.ok(after.scoreInitialCapturedAt instanceof Date)
})

test('falha durante captura reverte todos os baselines e a recuperação concorrente captura uma única vez', async t => {
  await closeRegistration()
  await prisma.round.update({ where: { id: ROUND_IDS[2] }, data: { status: 'SCORED', closeAt: new Date('2026-10-12T12:00:00Z') } })
  await prisma.userScoreHistory.createMany({ data: USERS.map(userId => ({
    userId, roundId: ROUND_IDS[2], scoreRound: 10, scoreTotal: 163,
  })) })
  const original = prisma.$transaction
  t.after(() => { prisma.$transaction = original })
  prisma.$transaction = function(callback, ...args) {
    return original.call(this, async tx => callback(new Proxy(tx, {
      get(target, key) {
        if (key !== 'rankingParticipant') return target[key]
        return new Proxy(target.rankingParticipant, {
          get(model, method) {
            if (method !== 'updateMany') return model[method]
            return async input => {
              const result = await model.updateMany(input)
              if (input.data.scoreInitialCapturedAt) throw new Error('forced baseline write failure')
              return result
            }
          },
        })
      },
    })), ...args)
  }
  await assert.rejects(RecalculateRankingService.execute(), /forced baseline write failure/)
  prisma.$transaction = original
  assertPending(await state())
  await Promise.all([RecalculateRankingService.execute(), RecalculateRankingService.execute()])
  const recovered = await state()
  assert.equal(recovered.initializationStatus, 'READY')
  assert.deepEqual(recovered.participants.map(p => p.scoreInitial), [163, 163])
  assert.equal(await prisma.auditLog.count({ where: { entityId: MESA_ID, action: 'MESA_INITIAL_SCORE_CAPTURED' } }), 1)
})

test('Mesa nova fica aguardando lotação e não compete enquanto incompleta', async t => {
  const created = await CreateBolaoService.execute({
    name: 'Mesa baseline incompleta', description: 'Fixture de inicialização',
    startDate: new Date('2026-10-12T09:00:00Z'), endDate: null,
    category: 'PAID', accessCost: 20, eligibility: 'ALL', maxParticipants: 2,
    registrationCloseMode: 'CAPACITY', durationMode: 'ROUNDS', durationRounds: 2,
    prizeDistribution: [{ position: 1, percentage: 100 }],
    createdByUserId: USER_ONE_ID, administrative: true, publicationMode: 'NOW',
  })
  t.after(async () => {
    await prisma.ranking.deleteMany({ where: { id: created.id } })
    await prisma.auditLog.deleteMany({ where: { entityId: created.id } })
  })
  await JoinBolaoService.execute({ rankingId: created.id, userId: USER_ONE_ID })
  await prisma.user.update({ where: { id: USER_ONE_ID }, data: { scoreTotal: 163 } })
  await RecalculateRankingService.execute()
  const mesa = await prisma.ranking.findUniqueOrThrow({ where: { id: created.id } })
  assert.equal(mesa.initializationStatus, 'WAITING_FOR_REGISTRATION_CLOSE')
  assert.equal(mesa.referenceRoundId, null)
  assert.equal(mesa.scoreInitialCapturedAt, null)
  const detail = await GetBolaoRankingService.execute({ rankingId: created.id })
  assert.deepEqual(detail.entries.map(p => [p.score, p.scoreRound, p.position, p.scoreInitialCapturedAt]), [[0, 0, 0, null]])
})

test('READY isolado não libera competição, duração ou liquidação se faltar timestamp individual', async () => {
  await closeRegistration()
  await scoreRound()
  await prisma.rankingParticipant.updateMany({ where: { rankingId: MESA_ID, userId: USER_TWO_ID }, data: { scoreInitialCapturedAt: null } })
  await scoreRound(3)
  const detail = await GetBolaoRankingService.execute({ rankingId: MESA_ID })
  assert.ok(detail.entries.every(p => p.score === 0 && p.position === 0))
  assert.deepEqual(await MesaLifecycleService.finishDueRoundMesas(prisma), [])
  await assert.rejects(new CloseRankingService().execute(MESA_ID, { force: true }), /captur/i)
})
