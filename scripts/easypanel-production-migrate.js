#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')

const REQUIRED = ['EASYPANEL_URL', 'EASYPANEL_EMAIL', 'EASYPANEL_PASSWORD']
const CONFIRMATION = 'APPLY_B12_PRODUCTION_MIGRATIONS'
const baseUrl = (process.env.EASYPANEL_URL || '').replace(/\/$/, '')
const projectName = process.env.EASYPANEL_PROJECT || 'f12-prd'
const apiServiceName = process.env.EASYPANEL_API_SERVICE || 'api'
const databaseServiceName = process.env.EASYPANEL_DATABASE_SERVICE || 'postgres'
const migrationsRoot = path.resolve(__dirname, '..', 'prisma', 'migrations')

async function rpc(endpoint, json, token) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ json }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body?.error) {
    throw new Error(`EasyPanel RPC ${endpoint} failed with status ${response.status}`)
  }
  return body?.json
}

function websocketUrl(containerId, command, token) {
  const url = new URL('/ws/containerShell', `${baseUrl}/`)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('token', token)
  url.searchParams.set('container', containerId)
  url.searchParams.set('command', Buffer.from(command).toString('base64'))
  return url
}

async function runInContainer({ containerId, command, token, startMarker, endMarker }) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(websocketUrl(containerId, command, token))
    let output = ''
    let settled = false
    const timeout = setTimeout(() => finish(new Error('Container command timed out')), 600_000)

    function finish(error, result) {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      socket.close()
      if (error) reject(error)
      else resolve(result)
    }

    socket.addEventListener('open', () => socket.send(JSON.stringify({ resize: [120, 40] })))
    socket.addEventListener('message', event => {
      try {
        const message = JSON.parse(event.data)
        output += String(message.output || '')
        const start = output.indexOf(startMarker)
        const end = output.indexOf(endMarker, start + startMarker.length)
        if (start >= 0 && end >= 0) {
          finish(null, JSON.parse(output.slice(start + startMarker.length, end).trim()))
        }
      } catch (error) {
        finish(error)
      }
    })
    socket.addEventListener('error', () => finish(new Error('EasyPanel container console failed')))
    socket.addEventListener('close', () => {
      if (!settled) finish(new Error('Container command ended without confirmation markers'))
    })
  })
}

async function getContainerId(token, serviceName) {
  const containers = await rpc(
    '/api/rpc/projects/getDockerContainers',
    { service: `${projectName}_${serviceName}` },
    token
  )
  if (!Array.isArray(containers) || containers.length === 0) {
    throw new Error(`No running container found for ${serviceName}`)
  }
  return containers[0].Id
}

function localMigrations() {
  return fs.readdirSync(migrationsRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^\d+_[a-z0-9_]+$/.test(entry.name))
    .map(entry => entry.name)
    .sort()
}

function nodeCommand(source) {
  return `printf '%s' '${Buffer.from(source).toString('base64')}' | base64 -d | node`
}

function listMigrationsSource() {
  return `
const fs = require('node:fs')
const { prisma } = require('/app/dist/lib/prisma')
;(async () => {
  const rows = await prisma.$queryRawUnsafe(
    'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL'
  )
  const files = fs.readdirSync('/app/prisma/migrations', { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
  await prisma.$disconnect()
  console.log('B12_LIST_BEGIN' + JSON.stringify({
    names: rows.map(row => row.migration_name),
    files,
  }) + 'B12_LIST_END')
})().catch(error => {
  console.log('B12_LIST_BEGIN' + JSON.stringify({ error: error?.name || 'Error' }) + 'B12_LIST_END')
  process.exitCode = 1
})
`
}

function migrateSource(names) {
  return `
const { execFileSync } = require('node:child_process')
const names = ${JSON.stringify(names)}

;(async () => {
  execFileSync('./node_modules/.bin/prisma', ['migrate', 'deploy'], {
    cwd: '/app', env: process.env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000,
  })
  const status = execFileSync('./node_modules/.bin/prisma', ['migrate', 'status'], {
    cwd: '/app', env: process.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000,
  })
  const { prisma } = require('/app/dist/lib/prisma')
  const rows = await prisma.$queryRawUnsafe(
    'SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name = ANY($1::text[])',
    names
  )
  const constraints = await prisma.$queryRawUnsafe(
    \`SELECT COUNT(*)::int AS count FROM pg_constraint WHERE conname IN (
      'team_variants_teamId_fkey',
      'round_matches_homeTeamId_fkey',
      'round_matches_awayTeamId_fkey'
    )\`
  )
  const orphanMatches = await prisma.$queryRawUnsafe(
    \`SELECT COUNT(*)::int AS count FROM round_matches rm
      WHERE (rm."homeTeamId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM team_variants tv WHERE tv.id = rm."homeTeamId"))
         OR (rm."awayTeamId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM team_variants tv WHERE tv.id = rm."awayTeamId"))\`
  )
  const nicknameIndex = await prisma.$queryRawUnsafe(
    \`SELECT COUNT(*)::int AS count FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'users_nickname_key'\`
  )
  await prisma.$disconnect()

  const applied = rows.length === names.length && rows.every(row => row.finished_at && !row.rolled_back_at)
  const verified = applied && constraints[0]?.count === 3 && orphanMatches[0]?.count === 0 && nicknameIndex[0]?.count === 0
  console.log('B12_MIGRATE_BEGIN' + JSON.stringify({
    migrations: names,
    statusUpToDate: status.includes('Database schema is up to date'),
    applied,
    foreignKeys: constraints[0]?.count,
    orphanMatches: orphanMatches[0]?.count,
    nicknameUniqueIndex: nicknameIndex[0]?.count,
    verified,
  }) + 'B12_MIGRATE_END')
})().catch(error => {
  console.log('B12_MIGRATE_BEGIN' + JSON.stringify({ verified: false, error: error?.name || 'Error' }) + 'B12_MIGRATE_END')
  process.exitCode = 1
})
`
}

function backupCommand(runId) {
  const safeRunId = String(runId || Date.now()).replace(/[^0-9]/g, '')
  const directory = '/var/lib/postgresql/data/b12-backups'
  const file = `${directory}/boteco12-pre-migration-${safeRunId}.dump`
  return `set -eu
mkdir -p '${directory}'
pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f '${file}'
test -s '${file}'
pg_restore -l '${file}' >/dev/null
bytes="$(wc -c < '${file}' | tr -d ' ')"
sha="$(sha256sum '${file}' | cut -d ' ' -f 1)"
printf 'B12_BACKUP_BEGIN{"path":"${file}","sizeBytes":%s,"sha256":"%s","verified":true}B12_BACKUP_END' "$bytes" "$sha"`
}

async function main() {
  for (const name of REQUIRED) {
    if (!process.env[name]) throw new Error(`${name} is required`)
  }
  if (process.env.B12_MIGRATION_CONFIRMATION !== CONFIRMATION) {
    throw new Error('Production migration confirmation is invalid')
  }

  const login = await rpc('/api/rpc/auth/login', {
    email: process.env.EASYPANEL_EMAIL,
    password: process.env.EASYPANEL_PASSWORD,
    rememberMe: false,
  })
  const token = login?.token
  if (!token) throw new Error('EasyPanel login did not return a token')

  const [apiContainerId, databaseContainerId] = await Promise.all([
    getContainerId(token, apiServiceName),
    getContainerId(token, databaseServiceName),
  ])
  const remote = await runInContainer({
    containerId: apiContainerId,
    command: nodeCommand(listMigrationsSource()),
    token,
    startMarker: 'B12_LIST_BEGIN',
    endMarker: 'B12_LIST_END',
  })
  if (remote.error) throw new Error('Could not inspect production migration history')
  const appliedNames = new Set(remote.names || [])
  const missing = localMigrations().filter(name => !appliedNames.has(name))
  if (missing.length === 0) throw new Error('No pending migration files were found')
  const containerFiles = new Set(remote.files || [])
  if (missing.some(name => !containerFiles.has(name))) {
    throw new Error('The running API image does not contain every pending migration')
  }

  const backup = await runInContainer({
    containerId: databaseContainerId,
    command: backupCommand(process.env.GITHUB_RUN_ID),
    token,
    startMarker: 'B12_BACKUP_BEGIN',
    endMarker: 'B12_BACKUP_END',
  })
  if (!backup.verified || !backup.sizeBytes || !/^[a-f0-9]{64}$/.test(backup.sha256 || '')) {
    throw new Error('Production backup verification failed')
  }
  console.log(JSON.stringify({ backup, pendingMigrations: missing }, null, 2))

  const migration = await runInContainer({
    containerId: apiContainerId,
    command: nodeCommand(migrateSource(missing)),
    token,
    startMarker: 'B12_MIGRATE_BEGIN',
    endMarker: 'B12_MIGRATE_END',
  })
  console.log(JSON.stringify(migration, null, 2))
  if (!migration.verified || !migration.statusUpToDate) {
    throw new Error('Production migration verification failed')
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Production migration failed: ${error.message}`)
    process.exitCode = 1
  })
}

module.exports = { backupCommand, localMigrations }
