#!/usr/bin/env node

const { createPrismaClient } = require('../scripts/lib/prisma-client')

const TEAM_GENDERS = ['MEN', 'WOMEN', 'MIXED']
const TEAM_AGE_CATEGORIES = ['SENIOR', 'U23', 'U20', 'U17', 'U15', 'OTHER']
const EXPECTED_KEYS = new Set(
  TEAM_GENDERS.flatMap(gender =>
    TEAM_AGE_CATEGORIES.map(ageCategory => `${gender}:${ageCategory}`)
  )
)

function isGeneratedMatrix(variants) {
  const keys = new Set(variants.map(item => `${item.gender}:${item.ageCategory}`))
  return keys.size === EXPECTED_KEYS.size && [...EXPECTED_KEYS].every(key => keys.has(key))
}

async function cleanupGeneratedTeamVariants(prisma, { apply = false } = {}) {
  const clubs = await prisma.team.findMany({
    where: {
      type: 'CLUB',
      externalId: { startsWith: 'seed:club:' },
    },
    select: {
      id: true,
      name: true,
      externalId: true,
      variants: {
        select: {
          id: true,
          gender: true,
          ageCategory: true,
          active: true,
          _count: { select: { homeMatches: true, awayMatches: true } },
        },
      },
    },
    orderBy: { name: 'asc' },
  })

  const candidates = clubs.filter(club => isGeneratedMatrix(club.variants))
  const targets = candidates.flatMap(club => club.variants
    .filter(variant =>
      variant.active && !(variant.gender === 'MEN' && variant.ageCategory === 'SENIOR')
    )
    .map(variant => ({ ...variant, teamId: club.id, teamName: club.name })))

  let deactivated = 0
  if (apply && targets.length > 0) {
    const result = await prisma.teamVariant.updateMany({
      where: { id: { in: targets.map(item => item.id) }, active: true },
      data: { active: false },
    })
    deactivated = result.count
  }

  return {
    mode: apply ? 'APPLY' : 'DRY_RUN',
    inspectedCatalogClubs: clubs.length,
    completeMatrixClubs: candidates.length,
    activeVariantsToDeactivate: targets.length,
    referencedVariants: targets.filter(item =>
      item._count.homeMatches > 0 || item._count.awayMatches > 0
    ).length,
    deactivated,
    sample: targets.slice(0, 20).map(item => ({
      teamId: item.teamId,
      teamName: item.teamName,
      gender: item.gender,
      ageCategory: item.ageCategory,
      matchReferences: item._count.homeMatches + item._count.awayMatches,
    })),
  }
}

async function main() {
  const apply = process.argv.includes('--apply')
  if (apply && process.env.B12_TEAM_VARIANT_CLEANUP_CONFIRMATION !== 'DEACTIVATE_GENERATED_TEAM_VARIANTS') {
    throw new Error('Production team variant cleanup confirmation is invalid')
  }

  const prisma = createPrismaClient()
  try {
    console.log(JSON.stringify(await cleanupGeneratedTeamVariants(prisma, { apply }), null, 2))
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Falha ao sanear categorias artificiais: ${error.message}`)
    process.exitCode = 1
  })
}

module.exports = {
  EXPECTED_KEYS,
  cleanupGeneratedTeamVariants,
  isGeneratedMatrix,
}
