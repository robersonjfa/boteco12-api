const assert = require('node:assert/strict')
const test = require('node:test')

const {
  EXPECTED_KEYS,
  cleanupGeneratedTeamVariants,
  isGeneratedMatrix,
} = require('../prisma/cleanup-team-variants')
const { cleanupSource } = require('../scripts/easypanel-production-cleanup-team-variants')

function fullMatrix() {
  return [...EXPECTED_KEYS].map((key, index) => {
    const [gender, ageCategory] = key.split(':')
    return {
      id: `variant-${index}`,
      gender,
      ageCategory,
      active: true,
      _count: { homeMatches: index === 1 ? 2 : 0, awayMatches: 0 },
    }
  })
}

test('identifica apenas a matriz completa de 18 variantes', () => {
  const variants = fullMatrix()
  assert.equal(isGeneratedMatrix(variants), true)
  assert.equal(isGeneratedMatrix(variants.slice(0, 17)), false)
})

test('dry-run relata variantes artificiais sem alterar dados', async () => {
  let updates = 0
  const prisma = {
    team: { findMany: async () => [{
      id: 'club-1', name: 'Academia Rey', externalId: 'seed:club:ve:academia-rey', variants: fullMatrix(),
    }] },
    teamVariant: { updateMany: async () => { updates += 1; return { count: 17 } } },
  }

  const result = await cleanupGeneratedTeamVariants(prisma)
  assert.equal(result.completeMatrixClubs, 1)
  assert.equal(result.activeVariantsToDeactivate, 17)
  assert.equal(result.referencedVariants, 1)
  assert.equal(result.deactivated, 0)
  assert.equal(updates, 0)
})

test('apply desativa somente variantes não padrão e mantém referências históricas', async () => {
  let received
  const prisma = {
    team: { findMany: async () => [{
      id: 'club-1', name: 'Academia Rey', externalId: 'seed:club:ve:academia-rey', variants: fullMatrix(),
    }] },
    teamVariant: {
      updateMany: async input => {
        received = input
        return { count: input.where.id.in.length }
      },
    },
  }

  const result = await cleanupGeneratedTeamVariants(prisma, { apply: true })
  assert.equal(result.deactivated, 17)
  assert.equal(received.where.id.in.includes('variant-0'), false)
  assert.deepEqual(received.data, { active: false })
})

test('workflow remoto diferencia dry-run de aplicação verificada', () => {
  assert.match(cleanupSource('DRY_RUN'), /apply: false/)
  assert.match(cleanupSource('APPLY'), /apply: true/)
  assert.match(cleanupSource('APPLY'), /activeVariantsToDeactivate === 0/)
})
