#!/usr/bin/env node

const {
  getContainerId,
  nodeCommand,
  rpc,
  runInContainer,
} = require('./easypanel-production-migrate')

const REQUIRED = ['EASYPANEL_URL', 'EASYPANEL_EMAIL', 'EASYPANEL_PASSWORD']
const CONFIRMATION = 'SEED_B12_TEAM_CATEGORIES'
const projectName = process.env.EASYPANEL_PROJECT || 'f12-prd'
const apiServiceName = process.env.EASYPANEL_API_SERVICE || 'api'

function teamSeedSource() {
  return `
const { createPrismaClient } = require('/app/scripts/lib/prisma-client')
const { seedTeams } = require('/app/prisma/seed-teams')
const prisma = createPrismaClient()

;(async () => {
  const seeded = await seedTeams(prisma)
  const clubs = await prisma.team.count({ where: { type: 'CLUB' } })
  const clubVariants = await prisma.teamVariant.count({
    where: { team: { type: 'CLUB' } },
  })
  const expectedClubVariants = clubs * 18
  const verified = clubVariants === expectedClubVariants
  await prisma.$disconnect()
  console.log('B12_TEAM_SEED_BEGIN' + JSON.stringify({
    seeded,
    clubs,
    clubVariants,
    expectedClubVariants,
    verified,
  }) + 'B12_TEAM_SEED_END')
})().catch(async error => {
  await prisma.$disconnect().catch(() => {})
  console.log('B12_TEAM_SEED_BEGIN' + JSON.stringify({
    verified: false,
    error: error?.name || 'Error',
  }) + 'B12_TEAM_SEED_END')
  process.exitCode = 1
})
`
}

async function main() {
  for (const name of REQUIRED) {
    if (!process.env[name]) throw new Error(`${name} is required`)
  }
  if (process.env.B12_TEAM_SEED_CONFIRMATION !== CONFIRMATION) {
    throw new Error('Production team seed confirmation is invalid')
  }

  const login = await rpc('/api/rpc/auth/login', {
    email: process.env.EASYPANEL_EMAIL,
    password: process.env.EASYPANEL_PASSWORD,
    rememberMe: false,
  })
  const token = login?.token
  if (!token) throw new Error('EasyPanel login did not return a token')

  const containerId = await getContainerId(token, apiServiceName)
  const result = await runInContainer({
    containerId,
    command: nodeCommand(teamSeedSource()),
    token,
    startMarker: 'B12_TEAM_SEED_BEGIN',
    endMarker: 'B12_TEAM_SEED_END',
  })
  console.log(JSON.stringify(result, null, 2))
  if (!result.verified) throw new Error('Production team seed verification failed')
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Production team seed failed: ${error.message}`)
    process.exitCode = 1
  })
}

module.exports = { teamSeedSource }
