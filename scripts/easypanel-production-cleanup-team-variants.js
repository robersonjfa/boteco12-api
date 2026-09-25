#!/usr/bin/env node

const {
  getContainerId,
  nodeCommand,
  rpc,
  runInContainer,
} = require('./easypanel-production-migrate')

const REQUIRED = ['EASYPANEL_URL', 'EASYPANEL_EMAIL', 'EASYPANEL_PASSWORD']
const APPLY_CONFIRMATION = 'DEACTIVATE_GENERATED_TEAM_VARIANTS'
const projectName = process.env.EASYPANEL_PROJECT || 'f12-prd'
const apiServiceName = process.env.EASYPANEL_API_SERVICE || 'api'

function cleanupSource(mode) {
  const apply = mode === 'APPLY'
  return `
const { createPrismaClient } = require('/app/scripts/lib/prisma-client')
const { cleanupGeneratedTeamVariants } = require('/app/prisma/cleanup-team-variants')
const prisma = createPrismaClient()

;(async () => {
  const result = await cleanupGeneratedTeamVariants(prisma, { apply: ${apply} })
  const verification = ${apply}
    ? await cleanupGeneratedTeamVariants(prisma, { apply: false })
    : null
  const verified = !${apply} || verification.activeVariantsToDeactivate === 0
  await prisma.$disconnect()
  console.log('B12_TEAM_CLEANUP_BEGIN' + JSON.stringify({ result, verification, verified }) + 'B12_TEAM_CLEANUP_END')
})().catch(async error => {
  await prisma.$disconnect().catch(() => {})
  console.log('B12_TEAM_CLEANUP_BEGIN' + JSON.stringify({ verified: false, error: error?.name || 'Error' }) + 'B12_TEAM_CLEANUP_END')
  process.exitCode = 1
})
`
}

async function main() {
  for (const name of REQUIRED) {
    if (!process.env[name]) throw new Error(`${name} is required`)
  }
  const mode = process.env.B12_TEAM_VARIANT_CLEANUP_MODE || 'DRY_RUN'
  if (!['DRY_RUN', 'APPLY'].includes(mode)) throw new Error('Cleanup mode is invalid')
  if (mode === 'APPLY' && process.env.B12_TEAM_VARIANT_CLEANUP_CONFIRMATION !== APPLY_CONFIRMATION) {
    throw new Error('Production team variant cleanup confirmation is invalid')
  }

  const login = await rpc('/api/rpc/auth/login', {
    email: process.env.EASYPANEL_EMAIL,
    password: process.env.EASYPANEL_PASSWORD,
    rememberMe: false,
  })
  const token = login?.token
  if (!token) throw new Error('EasyPanel login did not return a token')

  const containerId = await getContainerId(token, apiServiceName, projectName)
  const result = await runInContainer({
    containerId,
    command: nodeCommand(cleanupSource(mode)),
    token,
    startMarker: 'B12_TEAM_CLEANUP_BEGIN',
    endMarker: 'B12_TEAM_CLEANUP_END',
  })
  console.log(JSON.stringify(result, null, 2))
  if (!result.verified) throw new Error('Production team variant cleanup verification failed')
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Production team variant cleanup failed: ${error.message}`)
    process.exitCode = 1
  })
}

module.exports = { cleanupSource }
