const assert = require('node:assert/strict')
const test = require('node:test')

const {
  levelForXp,
  localDayFor,
  xpDeltaForDay,
  unlockedCosmeticsForXp,
} = require('../dist/services/duel-gamification/duel-gamification.rules')

test('níveis seguem os limiares congelados', () => {
  assert.equal(levelForXp(0).id, 'chegando')
  assert.equal(levelForXp(99).id, 'chegando')
  assert.equal(levelForXp(100).id, 'da-casa')
  assert.equal(levelForXp(299).id, 'da-casa')
  assert.equal(levelForXp(300).id, 'respeitado')
  assert.equal(levelForXp(700).id, 'casca-grossa')
  assert.equal(levelForXp(1500).id, 'lenda')
  assert.equal(levelForXp(99999).id, 'lenda')
})

test('dia local usa America/Sao_Paulo', () => {
  assert.equal(localDayFor(new Date('2026-03-10T02:00:00Z')), '2026-03-09')
  assert.equal(localDayFor(new Date('2026-03-10T03:00:00Z')), '2026-03-10')
})

test('teto diário limita a 20 por mini e 60 por dia', () => {
  assert.equal(xpDeltaForDay(0), 20)
  assert.equal(xpDeltaForDay(40), 20)
  assert.equal(xpDeltaForDay(50), 10)
  assert.equal(xpDeltaForDay(60), 0)
  assert.deepEqual(unlockedCosmeticsForXp(0), ['title:chegando', 'frame:padrao'])
  assert.ok(unlockedCosmeticsForXp(300).includes('title:respeitado'))
  assert.ok(unlockedCosmeticsForXp(300).includes('frame:respeitado'))
})
