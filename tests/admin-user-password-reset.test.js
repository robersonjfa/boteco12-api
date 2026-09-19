const assert = require('node:assert/strict')
const test = require('node:test')

const { prisma } = require('../dist/lib/prisma')
const email = require('../dist/lib/email')
const sessions = require('../dist/lib/redis-session-store')
const { verifyPassword } = require('../dist/security/password')
const {
  AdminUserManagementService,
} = require('../dist/services/admin/admin-user-management.service')

test('admin gera senha aleatória, envia somente por email e revoga sessões', async t => {
  const originalFindUnique = prisma.user.findUnique
  const originalTransaction = prisma.$transaction
  const originalSend = email.sendTemporaryPasswordEmail
  const originalRevoke = sessions.revokeUserSessions
  t.after(() => {
    prisma.user.findUnique = originalFindUnique
    prisma.$transaction = originalTransaction
    email.sendTemporaryPasswordEmail = originalSend
    sessions.revokeUserSessions = originalRevoke
  })

  prisma.user.findUnique = async () => ({
    id: 'target-user',
    email: 'usuario@example.com',
  })

  let passwordUpdate
  let audit
  let invalidatedTokens = false
  prisma.$transaction = async callback => callback({
    user: {
      update: async ({ data }) => {
        passwordUpdate = data
        return { id: 'target-user' }
      },
    },
    passwordResetToken: {
      updateMany: async () => {
        invalidatedTokens = true
        return { count: 1 }
      },
    },
    adminAuditLog: {
      create: async ({ data }) => {
        audit = data
        return data
      },
    },
  })

  let delivery
  email.sendTemporaryPasswordEmail = async input => {
    delivery = input
  }
  let revokedUserId
  sessions.revokeUserSessions = async userId => {
    revokedUserId = userId
  }

  const result = await AdminUserManagementService.resetPassword(
    { adminUserId: 'admin-user', ipAddress: '127.0.0.1' },
    'target-user',
    'Solicitação confirmada pelo suporte'
  )

  assert.deepEqual(result, { ok: true, deliveredBy: 'email' })
  assert.equal(delivery.to, 'usuario@example.com')
  assert.match(delivery.temporaryPassword, /^B12a-[A-Za-z0-9_-]{24}$/)
  assert.equal(await verifyPassword(delivery.temporaryPassword, passwordUpdate.password), true)
  assert.deepEqual(passwordUpdate.sessionVersion, { increment: 1 })
  assert.equal(invalidatedTokens, true)
  assert.equal(revokedUserId, 'target-user')
  assert.equal(audit.action, 'USER_PASSWORD_RESET')
  assert.deepEqual(audit.payload, {
    reason: 'Solicitação confirmada pelo suporte',
    delivery: 'email',
  })
  assert.equal(JSON.stringify(audit).includes(delivery.temporaryPassword), false)
  assert.equal('temporaryPassword' in result, false)
})

test('falha de entrega não revoga sessões nem expõe a senha', async t => {
  const originalFindUnique = prisma.user.findUnique
  const originalTransaction = prisma.$transaction
  const originalRevoke = sessions.revokeUserSessions
  t.after(() => {
    prisma.user.findUnique = originalFindUnique
    prisma.$transaction = originalTransaction
    sessions.revokeUserSessions = originalRevoke
  })

  prisma.user.findUnique = async () => ({
    id: 'target-user',
    email: 'usuario@example.com',
  })
  prisma.$transaction = async () => {
    throw new Error('smtp unavailable')
  }
  let revoked = false
  sessions.revokeUserSessions = async () => {
    revoked = true
  }

  await assert.rejects(
    AdminUserManagementService.resetPassword(
      { adminUserId: 'admin-user' },
      'target-user',
      'Solicitação do suporte'
    ),
    { code: 'temporary_password_delivery_failed', statusCode: 503 }
  )
  assert.equal(revoked, false)
})
