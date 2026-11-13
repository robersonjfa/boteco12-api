const test = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')

if (process.env.B12_POSTGRES_INTEGRATION !== 'true') {
  throw new Error('Isolated PostgreSQL required')
}

const { prisma } = require('../dist/lib/prisma')
const { MiniService } = require('../dist/services/mini/mini.service')

const prefix = `duel-decline-${randomUUID()}`
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

test('recusa some da lista pública e finalizados lista só públicos', async t => {
  t.after(async () => {
    await prisma.duelDecline.deleteMany({ where: { duelId: { in: duels } } })
    await prisma.miniDuel.deleteMany({ where: { id: { in: duels } } })
    await prisma.miniMatch.deleteMany({ where: { miniId: { in: minis } } })
    await prisma.miniRound.deleteMany({ where: { id: { in: minis } } })
    await prisma.user.deleteMany({ where: { id: { in: users } } })
  })

  const creator = await user('creator')
  const viewer = await user('viewer')
  const mini = await prisma.miniRound.create({
    data: {
      name: prefix,
      status: 'OPEN',
      closeAt: new Date(Date.now() + 86_400_000),
      matches: {
        create: [{ position: 1, homeTeam: 'A', awayTeam: 'B', matchTime: new Date(Date.now() + 90_000_000) }],
      },
    },
  })
  minis.push(mini.id)
  const duel = await prisma.miniDuel.create({
    data: {
      miniId: mini.id,
      creatorId: creator.id,
      amount: 10,
      status: 'WAITING',
      title: 'Duelo dos Brabo',
    },
  })
  duels.push(duel.id)

  const publicBefore = await MiniService.duels(viewer.id, 'public', 1)
  assert.ok(publicBefore.duels.some(item => item.id === duel.id))
  assert.equal(publicBefore.duels.find(item => item.id === duel.id).title, 'Duelo dos Brabo')

  await MiniService.decline(duel.id, viewer.id)
  const publicAfter = await MiniService.duels(viewer.id, 'public', 1)
  assert.equal(publicAfter.duels.some(item => item.id === duel.id), false)

  await prisma.miniDuel.update({
    where: { id: duel.id },
    data: { status: 'SETTLED', settledAt: new Date(), winnerId: creator.id },
  })
  const finished = await MiniService.duels(viewer.id, 'finished', 1)
  const finishedDuel = finished.duels.find(item => item.id === duel.id)
  assert.ok(finishedDuel)
  assert.equal(finishedDuel.title, 'Duelo dos Brabo')
})
