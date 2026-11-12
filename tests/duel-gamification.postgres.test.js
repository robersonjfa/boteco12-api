const test = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')

if (process.env.B12_POSTGRES_INTEGRATION !== 'true') {
  throw new Error('Isolated PostgreSQL required')
}

const { prisma } = require('../dist/lib/prisma')
const {
  ProcessDuelGamificationService,
} = require('../dist/services/duel-gamification/process-duel-gamification.service')

const prefix = `duel-game-${randomUUID()}`
const DAY = new Date('2026-03-10T15:00:00Z')
const users = []
const minis = []
const duels = []

async function user(name) {
  const created = await prisma.user.create({
    data: {
      name: `${prefix}-${name}`,
      email: `${randomUUID()}@example.test`,
      password: 'unused-test-hash',
      cpf: randomUUID(),
      birthDate: new Date('1990-01-01'),
    },
  })
  users.push(created.id)
  return created
}

async function mini(results = ['1', 'X']) {
  const created = await prisma.miniRound.create({
    data: {
      name: prefix,
      status: 'CONFIRMED',
      closeAt: DAY,
      matches: {
        create: results.map((result, index) => ({
          position: index + 1,
          homeTeam: `Casa ${index}`,
          awayTeam: `Fora ${index}`,
          matchTime: new Date(DAY.getTime() - 3_600_000),
          result,
        })),
      },
    },
  })
  minis.push(created.id)
  return created
}

async function duel(miniId, creatorId, opponentId, winnerId = null) {
  const created = await prisma.miniDuel.create({
    data: {
      miniId,
      creatorId,
      opponentId,
      amount: 10,
      status: 'SETTLED',
      winnerId,
      settledAt: new Date(DAY.getTime() + 3_600_000),
    },
  })
  duels.push(created.id)
  return created
}

async function xpOf(userId) {
  return (await prisma.duelGameProfile.findUnique({ where: { userId } }))?.xp ?? 0
}

test('gamificação: XP único, teto diário, void e replay', async t => {
  const previous = process.env.DUEL_GAMIFICATION_ENABLED
  const previousCut = process.env.DUEL_GAMIFICATION_ACTIVATED_AT
  const previousPaused = process.env.DUEL_GAMIFICATION_PAUSED
  process.env.DUEL_GAMIFICATION_ENABLED = 'true'
  t.after(async () => {
    process.env.DUEL_GAMIFICATION_ENABLED = previous
    if (previousCut === undefined) delete process.env.DUEL_GAMIFICATION_ACTIVATED_AT
    else process.env.DUEL_GAMIFICATION_ACTIVATED_AT = previousCut
    if (previousPaused === undefined) delete process.env.DUEL_GAMIFICATION_PAUSED
    else process.env.DUEL_GAMIFICATION_PAUSED = previousPaused
    await prisma.duelGameReceipt.deleteMany({ where: { duelId: { in: duels } } })
    await prisma.duelXpGrant.deleteMany({ where: { userId: { in: users } } })
    await prisma.duelXpDay.deleteMany({ where: { userId: { in: users } } })
    await prisma.duelAchievement.deleteMany({ where: { userId: { in: users } } })
    await prisma.duelCosmeticUnlock.deleteMany({ where: { userId: { in: users } } })
    await prisma.duelGameProfile.deleteMany({ where: { userId: { in: users } } })
    await prisma.miniDuel.deleteMany({ where: { id: { in: duels } } })
    await prisma.miniPrediction.deleteMany({ where: { miniId: { in: minis } } })
    await prisma.miniMatch.deleteMany({ where: { miniId: { in: minis } } })
    await prisma.miniRound.deleteMany({ where: { id: { in: minis } } })
    await prisma.user.deleteMany({ where: { id: { in: users } } })
  })

  const a = await user('a')
  const b = await user('b')
  const first = await mini()
  await prisma.miniPrediction.create({
    data: { miniId: first.id, userId: a.id, prediction: '1,X' },
  })
  await duel(first.id, a.id, b.id, a.id)

  await ProcessDuelGamificationService.execute()
  assert.equal(await xpOf(a.id), 20)
  assert.equal(await xpOf(b.id), 20)
  assert.equal(await prisma.duelAchievement.count({ where: { userId: a.id, code: 'FIRST_DUEL' } }), 1)
  assert.equal(await prisma.duelAchievement.count({ where: { userId: a.id, code: 'FIRST_WIN' } }), 1)
  assert.equal(await prisma.duelAchievement.count({ where: { userId: b.id, code: 'FIRST_WIN' } }), 0)
  assert.equal(await prisma.duelAchievement.count({ where: { userId: a.id, code: 'NA_MOSCA' } }), 1)

  const second = await mini()
  const third = await mini()
  const fourth = await mini()
  await duel(second.id, a.id, b.id, b.id)
  await duel(third.id, a.id, b.id, a.id)
  await duel(fourth.id, a.id, b.id, a.id)
  await ProcessDuelGamificationService.execute()

  assert.equal(await xpOf(a.id), 60)
  assert.equal(await xpOf(b.id), 60)
  const capped = await prisma.duelXpGrant.findFirst({
    where: { userId: a.id, miniId: { in: [second.id, third.id, fourth.id] }, reason: 'DAILY_CAP' },
  })
  assert.ok(capped)

  const voidMini = await mini(['C', 'C'])
  await duel(voidMini.id, a.id, b.id, null)
  await ProcessDuelGamificationService.execute()
  assert.equal(await xpOf(a.id), 60)
  const voidGrant = await prisma.duelXpGrant.findFirst({
    where: { userId: a.id, miniId: voidMini.id },
  })
  assert.equal(voidGrant.reason, 'ALL_MATCHES_VOID')
  assert.equal(voidGrant.delta, 0)

  const c = await user('c')
  const d = await user('d')
  const fifth = await mini()
  const sixth = await mini()
  await duel(fifth.id, a.id, c.id, a.id)
  await duel(sixth.id, a.id, d.id, null)
  await ProcessDuelGamificationService.execute()
  assert.equal(await prisma.duelAchievement.count({ where: { userId: a.id, code: 'RODOU_O_BOTECO' } }), 1)

  const grantCount = await prisma.duelXpGrant.count({ where: { userId: a.id } })
  await ProcessDuelGamificationService.execute()
  assert.equal(await xpOf(a.id), 60)
  assert.equal(await prisma.duelXpGrant.count({ where: { userId: a.id } }), grantCount)

  process.env.DUEL_GAMIFICATION_ACTIVATED_AT = '2026-04-01T00:00:00Z'
  const lateMini = await mini()
  await duel(lateMini.id, a.id, b.id, a.id)
  await ProcessDuelGamificationService.execute()
  const cutGrant = await prisma.duelXpGrant.findFirst({
    where: { userId: a.id, miniId: lateMini.id },
  })
  assert.equal(cutGrant.reason, 'BEFORE_ENROLLMENT')
  assert.equal(cutGrant.delta, 0)
  assert.equal(await xpOf(a.id), 60)
  delete process.env.DUEL_GAMIFICATION_ACTIVATED_AT

  process.env.DUEL_GAMIFICATION_PAUSED = 'true'
  const pausedMini = await mini()
  const pausedDuel = await duel(pausedMini.id, a.id, b.id, a.id)
  const pausedResult = await ProcessDuelGamificationService.execute()
  assert.equal(pausedResult.paused, true)
  assert.equal(await prisma.duelGameReceipt.count({ where: { duelId: pausedDuel.id } }), 0)
  delete process.env.DUEL_GAMIFICATION_PAUSED
})
