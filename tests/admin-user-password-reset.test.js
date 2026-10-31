const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const test = require('node:test')

const { prisma } = require('../dist/lib/prisma')
const email = require('../dist/lib/email')
const sessions = require('../dist/lib/redis-session-store')
const {
  AdminUserManagementService,
} = require('../dist/services/admin/admin-user-management.service')

test('admin invalida a senha, envia link de reset e revoga sessões', async t => {
  const originalFindUnique = prisma.user.findUnique
  const originalTransaction = prisma.$transaction
  const originalSend = email.sendPasswordResetEmail
  const originalRevoke = sessions.revokeUserSessions
  t.after(() => {
    prisma.user.findUnique = originalFindUnique
    prisma.$transaction = originalTransaction
    email.sendPasswordResetEmail = originalSend
    sessions.revokeUserSessions = originalRevoke
  })

  prisma.user.findUnique = async () => ({
    id: 'target-user',
    email: 'usuario@example.com',
  })

  let passwordUpdate
  let audit
  let createdToken
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
      create: async ({ data }) => {
        createdToken = data
        return data
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
  email.sendPasswordResetEmail = async input => {
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
  assert.equal(delivery.expiresInMinutes, 30)
  assert.match(delivery.resetUrl, /\/reset-password\?token=[a-f0-9]{64}$/)
  const rawToken = new URL(delivery.resetUrl).searchParams.get('token')
  assert.equal(createdToken.userId, 'target-user')
  assert.equal(
    createdToken.tokenHash,
    crypto.createHash('sha256').update(rawToken).digest('hex')
  )
  assert.ok(createdToken.expiresAt > new Date())
  assert.equal(passwordUpdate.password.startsWith('$f12-sha256$'), true)
  assert.deepEqual(passwordUpdate.sessionVersion, { increment: 1 })
  assert.equal(invalidatedTokens, true)
  assert.equal(revokedUserId, 'target-user')
  assert.equal(audit.action, 'USER_PASSWORD_RESET')
  assert.deepEqual(audit.payload, {
    reason: 'Solicitação confirmada pelo suporte',
    delivery: 'email_reset_link',
  })
  assert.equal(JSON.stringify(audit).includes(rawToken), false)
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
    { code: 'password_reset_delivery_failed', statusCode: 503 }
  )
  assert.equal(revoked, false)
})
