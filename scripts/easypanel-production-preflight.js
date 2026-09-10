#!/usr/bin/env node

const REQUIRED = ['EASYPANEL_URL', 'EASYPANEL_EMAIL', 'EASYPANEL_PASSWORD']

const baseUrl = (process.env.EASYPANEL_URL || '').replace(/\/$/, '')
const projectName = process.env.EASYPANEL_PROJECT || 'f12-prd'
const apiServiceName = process.env.EASYPANEL_API_SERVICE || 'api'
const workerServiceName =
  process.env.EASYPANEL_WORKER_SERVICE || 'worker-managed'

async function rpc(path, json, token) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ json }),
  })

  let body = {}
  try {
    body = await response.json()
  } catch {
    // Responses may contain configuration, so error bodies are never echoed.
  }

  if (!response.ok || body?.error) {
    throw new Error(`EasyPanel RPC ${path} failed with status ${response.status}`)
  }

  return body?.json
}

function websocketUrl(path, params) {
  const url = new URL(path, `${baseUrl}/`)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value)
  }
  return url
}

function parsePreflightOutput(output) {
  const startMarker = 'B12_PREFLIGHT_BEGIN'
  const endMarker = 'B12_PREFLIGHT_END'
  const start = output.indexOf(startMarker)
  const end = output.indexOf(endMarker, start + startMarker.length)
  if (start < 0 || end < 0) {
    throw new Error('Container preflight did not return the expected markers')
  }

  return JSON.parse(output.slice(start + startMarker.length, end).trim())
}

async function runInContainer({ token, containerId, source }) {
  const encodedSource = Buffer.from(source).toString('base64')
  const command = `printf '%s' '${encodedSource}' | base64 -d | node`
  const url = websocketUrl('/ws/containerShell', {
    token,
    container: containerId,
    command: Buffer.from(command).toString('base64'),
  })

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    let output = ''
    let settled = false
    const timeout = setTimeout(
      () => finish(new Error('Container preflight timed out')),
      240_000
    )

    function finish(error, result) {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      socket.close()
      if (error) reject(error)
      else resolve(result)
    }

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ resize: [120, 40] }))
    })
    socket.addEventListener('message', event => {
      try {
        const message = JSON.parse(event.data)
        output += String(message.output || '')
        if (output.includes('B12_PREFLIGHT_END')) {
          finish(null, parsePreflightOutput(output))
        }
      } catch (error) {
        finish(error)
      }
    })
    socket.addEventListener('error', () => {
      finish(new Error('EasyPanel container console connection failed'))
    })
  })
}

function apiPreflightSource() {
  return `
const fs = require('node:fs')
const { execFileSync } = require('node:child_process')

function commandResult(command, args) {
  try {
    return {
      ok: true,
      output: execFileSync(command, args, {
        encoding: 'utf8',
        timeout: 60_000,
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    }
  } catch (error) {
    return { ok: false, exitCode: error?.status ?? null, output: '' }
  }
}

function safeUrl(value) {
  if (!value) return { configured: false, valid: false, protocol: null, host: null }
  try {
    const parsed = new URL(value)
    return {
      configured: true,
      valid: true,
      protocol: parsed.protocol,
      host: parsed.hostname,
    }
  } catch {
    return { configured: true, valid: false, protocol: null, host: null }
  }
}

function emailDomain(value) {
  const match = String(value || '').match(/@([^>\\s]+)>?$/)
  return match?.[1]?.toLowerCase() ?? null
}

;(async () => {
  const port = process.env.PORT || '3001'
  let health = { httpStatus: null, api: 'unreachable', db: null, redis: null, version: null }
  try {
    const response = await fetch(\`http://127.0.0.1:\${port}/health\`)
    const body = await response.json()
    health = {
      httpStatus: response.status,
      api: body.api ?? null,
      db: body.db ?? null,
      redis: body.redis ?? null,
      version: body.version ?? null,
    }
  } catch {}

  const migration = commandResult('./node_modules/.bin/prisma', ['migrate', 'status'])
  const pgDump = commandResult('pg_dump', ['--version'])
  const pgRestore = commandResult('pg_restore', ['--version'])
  const apiPublicUrl = safeUrl(process.env.API_PUBLIC_URL)
  const explicitNotificationUrl = safeUrl(process.env.MP_NOTIFICATION_URL)
  const effectiveNotificationHost = explicitNotificationUrl.configured
    ? explicitNotificationUrl.host
    : apiPublicUrl.host
  const smtpProvider = (process.env.EMAIL_PROVIDER || '').toLowerCase()
  const smtp = {
    provider: smtpProvider || null,
    hostConfigured: Boolean(process.env.SMTP_HOST),
    portConfigured: Boolean(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    userConfigured: Boolean(process.env.SMTP_USER),
    userDomain: emailDomain(process.env.SMTP_USER),
    passwordConfigured: Boolean(process.env.SMTP_PASS),
    fromDomain: emailDomain(process.env.EMAIL_FROM),
  }
  const config = {
    apiPublicUrl,
    explicitNotificationUrl,
    effectiveNotificationHost,
    accessTokenConfigured: Boolean(process.env.MP_ACCESS_TOKEN),
    webhookSecretConfigured: Boolean(process.env.MP_WEBHOOK_SECRET),
    smtp,
    operationsAlertWebhookConfigured: Boolean(process.env.OPERATIONS_ALERT_WEBHOOK_URL),
    runDbMigrations: {
      configured: Boolean(process.env.RUN_DB_MIGRATIONS),
      enabled: process.env.RUN_DB_MIGRATIONS === 'true',
    },
  }

  const checks = {
    health: health.httpStatus === 200 && health.api === 'ok' && health.db === 'ok' && health.redis === 'ok',
    migrations: migration.ok && migration.output.includes('Database schema is up to date'),
    pgDump16: pgDump.ok && / 16\\./.test(pgDump.output),
    pgRestore16: pgRestore.ok && / 16\\./.test(pgRestore.output),
    payment:
      apiPublicUrl.valid &&
      apiPublicUrl.protocol === 'https:' &&
      apiPublicUrl.host === 'api.boteco12.com' &&
      effectiveNotificationHost === 'api.boteco12.com' &&
      config.accessTokenConfigured &&
      config.webhookSecretConfigured,
    email:
      smtpProvider === 'smtp' &&
      smtp.hostConfigured &&
      smtp.userConfigured &&
      smtp.userDomain === 'boteco12.com' &&
      smtp.passwordConfigured &&
      smtp.fromDomain === 'boteco12.com',
    migrationsBlockedOnBoot: !config.runDbMigrations.enabled,
  }

  console.log('B12_PREFLIGHT_BEGIN' + JSON.stringify({
    service: 'api',
    fingerprint: fs.readFileSync('.release-version', 'utf8').trim(),
    health,
    config,
    checks,
  }) + 'B12_PREFLIGHT_END')
})().catch(error => {
  console.log('B12_PREFLIGHT_BEGIN' + JSON.stringify({
    service: 'api',
    ok: false,
    errorCode: error?.code || error?.name || 'unknown',
  }) + 'B12_PREFLIGHT_END')
})
`
}

function workerPreflightSource() {
  return `
const fs = require('node:fs')

;(async () => {
  const port = process.env.WORKER_HEALTH_PORT || process.env.PORT || '3002'
  let health = { httpStatus: null, worker: 'unreachable', redis: null, ready: false, schedulesRegistered: false, version: null }
  try {
    const response = await fetch(\`http://127.0.0.1:\${port}/ready\`)
    const body = await response.json()
    health = {
      httpStatus: response.status,
      worker: body.worker ?? null,
      redis: body.redis ?? null,
      ready: body.ready ?? false,
      schedulesRegistered: body.schedulesRegistered ?? false,
      version: body.version ?? null,
    }
  } catch {}

  const checks = {
    health:
      health.httpStatus === 200 &&
      health.worker === 'ok' &&
      health.redis === 'ok' &&
      health.ready === true,
    schedulesRegistered: health.schedulesRegistered === true,
  }

  console.log('B12_PREFLIGHT_BEGIN' + JSON.stringify({
    service: 'worker-managed',
    fingerprint: fs.readFileSync('.release-version', 'utf8').trim(),
    health,
    operationsAlertWebhookConfigured: Boolean(process.env.OPERATIONS_ALERT_WEBHOOK_URL),
    checks,
  }) + 'B12_PREFLIGHT_END')
})().catch(error => {
  console.log('B12_PREFLIGHT_BEGIN' + JSON.stringify({
    service: 'worker-managed',
    ok: false,
    errorCode: error?.code || error?.name || 'unknown',
  }) + 'B12_PREFLIGHT_END')
})
`
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

function allChecksPass(checks) {
  return checks && Object.values(checks).every(Boolean)
}

async function main() {
  for (const name of REQUIRED) {
    if (!process.env[name]) throw new Error(`${name} is required`)
  }

  const login = await rpc('/api/rpc/auth/login', {
    email: process.env.EASYPANEL_EMAIL,
    password: process.env.EASYPANEL_PASSWORD,
    rememberMe: false,
  })
  const token = login?.token
  if (!token) throw new Error('EasyPanel login did not return a token')
  console.log('EasyPanel authentication: ok')

  const inventory = await rpc('/api/rpc/projects/listProjectsAndServices', {}, token)
  const services = Array.isArray(inventory?.services) ? inventory.services : []
  for (const serviceName of [apiServiceName, workerServiceName]) {
    const service = services.find(
      item => item.projectName === projectName && item.name === serviceName
    )
    if (!service) throw new Error(`EasyPanel service ${serviceName} was not found`)
  }
  console.log('EasyPanel target services: found')

  const [apiContainerId, workerContainerId] = await Promise.all([
    getContainerId(token, apiServiceName),
    getContainerId(token, workerServiceName),
  ])
  console.log('EasyPanel running containers: found')

  const [api, worker] = await Promise.all([
    runInContainer({ token, containerId: apiContainerId, source: apiPreflightSource() }),
    runInContainer({ token, containerId: workerContainerId, source: workerPreflightSource() }),
  ])
  const releaseConsistency =
    /^[a-f0-9]{64}$/.test(api.fingerprint || '') &&
    api.fingerprint === worker.fingerprint
  const ready =
    api.ok !== false &&
    worker.ok !== false &&
    releaseConsistency &&
    allChecksPass(api.checks) &&
    allChecksPass(worker.checks)

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    releaseConsistency,
    api,
    worker,
    preflight: ready ? 'ready' : 'attention_required',
  }, null, 2))

  if (!ready) process.exitCode = 1
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Production preflight failed: ${error.message}`)
    process.exitCode = 1
  })
}

module.exports = { apiPreflightSource, workerPreflightSource }
