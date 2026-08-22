const assert = require('node:assert/strict')
const test = require('node:test')

const { MesaLifecycleService } = require('../dist/services/bolao/mesa-lifecycle.service')

test('fechamento por data persiste o horário configurado, não o atraso do job', async () => {
  const configuredClose = new Date('2026-08-21T02:59:59.000Z')
  const updates = []
  const tx = {
    ranking: {
      findMany: async () => [{ id: 'mesa-date', entryEndDate: configuredClose }],
      updateMany: async input => { updates.push(input); return { count: 1 } },
    },
  }

  await MesaLifecycleService.closeDueRegistrations(tx, new Date('2026-08-21T03:05:00.000Z'))

  assert.equal(updates[0].data.registrationClosedAt, configuredClose)
})

test('duração por rodadas só termina após a quantidade definida estar apurada', async () => {
  const registrationClosedAt = new Date('2026-08-01T02:59:59.000Z')
  const fifthRoundClose = new Date('2026-08-20T23:00:00.000Z')
  const rankingUpdates = []
  let scoredRounds = 4
  const tx = {
    ranking: {
      findMany: async () => [{
        id: 'mesa-rounds', registrationClosedAt, durationRounds: 5,
      }],
      updateMany: async input => { rankingUpdates.push(input); return { count: 1 } },
    },
    round: {
      findMany: async () => Array.from({ length: scoredRounds }, (_, index) => ({
        closeAt: index === 4 ? fifthRoundClose : new Date(2026, 7, 2 + index),
      })),
    },
  }

  assert.deepEqual(await MesaLifecycleService.finishDueRoundMesas(tx), [])
  assert.equal(rankingUpdates.length, 0)

  scoredRounds = 5
  assert.deepEqual(await MesaLifecycleService.finishDueRoundMesas(tx), ['mesa-rounds'])
  assert.equal(rankingUpdates[0].data.endDate, fifthRoundClose)
})
