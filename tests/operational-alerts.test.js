const assert = require('node:assert/strict')
const test = require('node:test')

const { prisma } = require('../dist/lib/prisma')
const {
  approvedWalletCreditNotCreditedWhere,
} = require('../dist/services/alerts/payment-anomaly-rules')
const {
  DetectPaymentAlertsService,
} = require('../dist/services/alerts/detect-payment-anomalies.service')
const {
  DetectSubscriptionAlertsService,
} = require('../dist/services/alerts/detect-subscription-anomalies.service')
const {
  RevalidateActiveSubscriptionsService,
} = require('../dist/services/subscription/revalidate-active-subscriptions.service')

test('alerta de crédito considera somente pagamentos de wallet', async t => {
  const originalFindMany = prisma.payment.findMany
  t.after(() => {
    prisma.payment.findMany = originalFindMany
  })

  let receivedWhere
  prisma.payment.findMany = async input => {
    receivedWhere = input.where
    return []
  }

  await DetectPaymentAlertsService.execute()

  assert.deepEqual(receivedWhere, approvedWalletCreditNotCreditedWhere)
  assert.equal(receivedWhere.purpose, 'WALLET_CREDIT')
  assert.equal(receivedWhere.status, 'APPROVED')
  assert.equal(receivedWhere.isCredited, false)
})

test('alerta de assinatura procura somente ACTIVE com vigência encerrada', async t => {
  const originalFindMany = prisma.subscription.findMany
  t.after(() => {
    prisma.subscription.findMany = originalFindMany
  })

  let receivedWhere
  prisma.subscription.findMany = async input => {
    receivedWhere = input.where
    return []
  }

  await DetectSubscriptionAlertsService.execute()

  assert.equal(receivedWhere.status, 'ACTIVE')
  assert.ok(receivedWhere.endAt.lte instanceof Date)
})

test('revalidação expira assinatura fixa vencida mesmo sem token do MP', async t => {
  const originalUpdateMany = prisma.subscription.updateMany
  const originalFindMany = prisma.subscription.findMany
  const originalToken = process.env.MP_ACCESS_TOKEN

  t.after(() => {
    prisma.subscription.updateMany = originalUpdateMany
    prisma.subscription.findMany = originalFindMany
    if (originalToken == null) delete process.env.MP_ACCESS_TOKEN
    else process.env.MP_ACCESS_TOKEN = originalToken
  })

  delete process.env.MP_ACCESS_TOKEN
  const now = new Date('2026-08-30T12:00:00.000Z')
  let update
  prisma.subscription.updateMany = async input => {
    update = input
    return { count: 1 }
  }
  prisma.subscription.findMany = async () => {
    throw new Error('não deve consultar MP sem token')
  }

  const result = await RevalidateActiveSubscriptionsService.execute(now)

  assert.deepEqual(update.where, {
    status: 'ACTIVE',
    endAt: { lte: now },
    externalSubscriptionId: null,
  })
  assert.deepEqual(update.data, { status: 'EXPIRED' })
  assert.deepEqual(result, {
    expiredFixedTerm: 1,
    revalidatedExternal: 0,
    updatedExternal: 0,
    failedExternal: 0,
  })
})
