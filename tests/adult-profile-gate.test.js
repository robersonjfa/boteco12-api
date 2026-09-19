const assert = require('node:assert/strict')
const test = require('node:test')

const { prisma } = require('../dist/lib/prisma')
const { authMiddleware } = require('../dist/middleware/auth.middleware')

function request(originalUrl) {
  return {
    originalUrl,
    session: {
      user: {
        id: 'legacy-user',
        role: 'NORMAL',
        email: 'legacy@example.com',
        sessionVersion: 1,
      },
    },
  }
}

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}

test('conta legada sem CPF e nascimento acessa o perfil, mas não outras áreas autenticadas', async t => {
  const originalFindUnique = prisma.user.findUnique
  t.after(() => {
    prisma.user.findUnique = originalFindUnique
  })
  prisma.user.findUnique = async () => ({
    id: 'legacy-user',
    role: 'NORMAL',
    email: 'legacy@example.com',
    cpf: null,
    birthDate: null,
    adminBlockedAt: null,
    sessionVersion: 1,
  })

  const profileReq = request('/api/me')
  const profileRes = response()
  let profileNext = false
  await authMiddleware(profileReq, profileRes, () => {
    profileNext = true
  })
  assert.equal(profileNext, true)

  const walletReq = request('/api/wallet')
  const walletRes = response()
  let walletNext = false
  await authMiddleware(walletReq, walletRes, () => {
    walletNext = true
  })
  assert.equal(walletNext, false)
  assert.equal(walletRes.statusCode, 403)
  assert.equal(walletRes.body.error, 'identity_profile_required')
  assert.deepEqual(walletRes.body.missingFields, ['cpf', 'birthDate'])
})

test('conta adulta confirmada segue para áreas autenticadas', async t => {
  const originalFindUnique = prisma.user.findUnique
  t.after(() => {
    prisma.user.findUnique = originalFindUnique
  })
  prisma.user.findUnique = async () => ({
    id: 'adult-user',
    role: 'NORMAL',
    email: 'adult@example.com',
    cpf: '52998224725',
    birthDate: new Date('1990-01-15T00:00:00Z'),
    adminBlockedAt: null,
    sessionVersion: 1,
  })

  const req = request('/api/wallet')
  req.session.user.id = 'adult-user'
  const res = response()
  let nextCalled = false
  await authMiddleware(req, res, () => {
    nextCalled = true
  })

  assert.equal(nextCalled, true)
  assert.equal(req.user.cpf, '52998224725')
  assert.equal(req.user.birthDate.toISOString().slice(0, 10), '1990-01-15')
})
