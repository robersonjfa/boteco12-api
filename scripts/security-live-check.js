/* Checagens de segurança read-only contra produção.
 * Não autentica, não escreve e não faz brute force.
 */
const API = process.env.SECURITY_LIVE_API_URL ?? 'https://api.boteco12.com'
const FRONTEND = process.env.SECURITY_LIVE_FRONTEND_URL ?? 'https://boteco12.com'
const ALLOWED_ORIGIN = process.env.SECURITY_LIVE_ALLOWED_ORIGIN ?? 'https://boteco12.com'
const TIMEOUT_MS = Number(process.env.SECURITY_LIVE_TIMEOUT_MS ?? 10000)

const results = []
function record(id, title, status, observed) {
  results.push({ id, title, status, observed })
  console.log(`${status.padEnd(6)} ${id} ${title}${observed ? ` — ${observed}` : ''}`)
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    ...options,
  })
  return response
}

async function check(id, title, fn) {
  try {
    const observed = await fn()
    record(id, title, 'PASSOU', observed)
  } catch (error) {
    record(id, title, 'FALHOU', error.message)
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function main() {
  // 1. Saúde
  await check('SL-01', 'API health responde ok', async () => {
    const response = await request(`${API}/health`)
    assert(response.status === 200, `status=${response.status}`)
    const body = await response.json()
    assert(body.api === 'ok' && body.db === 'ok' && body.redis === 'ok', JSON.stringify(body))
    return `status=200 version=${String(body.version).slice(0, 8)}`
  })

  // 2. Headers da API
  await check('SL-02', 'API envia headers de segurança', async () => {
    const response = await request(`${API}/health`)
    const required = [
      'strict-transport-security',
      'content-security-policy',
      'x-content-type-options',
      'x-frame-options',
      'referrer-policy',
    ]
    const missing = required.filter(name => !response.headers.get(name))
    assert(missing.length === 0, `faltando: ${missing.join(', ')}`)
    return required.join(', ')
  })

  // 3. CORS bloqueia origem desconhecida
  await check('SL-03', 'CORS não libera origem desconhecida', async () => {
    const response = await request(`${API}/api/me`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil.example',
        'Access-Control-Request-Method': 'GET',
      },
    })
    const allowOrigin = response.headers.get('access-control-allow-origin')
    assert(!allowOrigin || allowOrigin !== 'https://evil.example', `allow-origin=${allowOrigin}`)
    return `status=${response.status} allow-origin=${allowOrigin ?? 'ausente'}`
  })

  // 4. CORS libera a origem oficial
  await check('SL-04', 'CORS libera a origem oficial', async () => {
    const response = await request(`${API}/api/me`, {
      method: 'OPTIONS',
      headers: {
        Origin: ALLOWED_ORIGIN,
        'Access-Control-Request-Method': 'GET',
      },
    })
    const allowOrigin = response.headers.get('access-control-allow-origin')
    assert(allowOrigin === ALLOWED_ORIGIN, `allow-origin=${allowOrigin}`)
    return allowOrigin
  })

  // 5. Rotas autenticadas sem sessão
  await check('SL-05', 'Rotas autenticadas exigem sessão', async () => {
    const me = await request(`${API}/api/me`)
    const admin = await request(`${API}/api/admin/mesas`)
    assert([401, 403].includes(me.status), `/api/me status=${me.status}`)
    assert([401, 403].includes(admin.status), `/api/admin/mesas status=${admin.status}`)
    return `/api/me=${me.status} /api/admin/mesas=${admin.status}`
  })

  // 6. Arquivos sensíveis não expostos
  await check('SL-06', 'Arquivos sensíveis não são servidos', async () => {
    const paths = ['/.env', '/.git/config', '/prisma/schema.prisma']
    const exposed = []
    for (const path of paths) {
      const response = await request(`${API}${path}`)
      if (response.status !== 404) exposed.push(`${path}=${response.status}`)
    }
    assert(exposed.length === 0, exposed.join(', '))
    return '404 em todos'
  })

  // 7. Frontend: headers e release
  await check('SL-07', 'Frontend envia headers de segurança', async () => {
    const response = await request(FRONTEND)
    const required = ['strict-transport-security', 'content-security-policy', 'x-content-type-options', 'x-frame-options']
    const missing = required.filter(name => !response.headers.get(name))
    assert(missing.length === 0, `faltando: ${missing.join(', ')}`)
    return `status=${response.status}`
  })

  await check('SL-08', 'Frontend serve o release atual', async () => {
    const response = await request(`${FRONTEND}/release.txt`)
    assert(response.status === 200, `status=${response.status}`)
    const release = (await response.text()).trim()
    assert(/^[a-f0-9]{8,64}$/i.test(release), `release inválido: ${release.slice(0, 20)}`)
    return release.slice(0, 12)
  })

  const failed = results.filter(item => item.status === 'FALHOU')
  console.log(`\nRESUMO ${results.length - failed.length}/${results.length} PASSOU`)
  if (failed.length > 0) {
    for (const item of failed) {
      console.error(`FALHOU ${item.id}: ${item.observed}`)
    }
    process.exitCode = 1
  }
}

main().catch(error => {
  console.error('ERRO FATAL', error.message)
  process.exitCode = 1
})
