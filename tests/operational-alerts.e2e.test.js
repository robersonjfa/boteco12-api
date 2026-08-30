const assert = require('node:assert/strict')
const test = require('node:test')

const databaseUrl = new URL(process.env.DATABASE_URL || '')
const databaseName = databaseUrl.pathname.replace(/^\//, '')

if (
  !['127.0.0.1', 'localhost', 'host.docker.internal'].includes(
    databaseUrl.hostname
  ) ||
  !databaseName.startsWith('boteco12_e2e_')
) {
  throw new Error(
    'E2E operacional exige PostgreSQL local e banco descartável boteco12_e2e_*'
  )
}

const { prisma } = require('../dist/lib/prisma')
const {
  AlertDispatcherService,
} = require('../dist/services/alerts/alert-dispatcher.service')
const {
  DetectPaymentAlertsService,
} = require('../dist/services/alerts/detect-payment-anomalies.service')
const {
  GetOperationalStatusService,
} = require('../dist/services/admin/get-operational-status.service')
const {
  RevalidateActiveSubscriptionsService,
} = require('../dist/services/subscription/revalidate-active-subscriptions.service')

test('fluxo operacional ignora assinatura em crédito e expira vigência encerrada', async t => {
  const suffix = `${Date.now()}-${process.pid}`
  const userId = `e2e-user-${suffix}`
  const subscriptionPaymentId = `e2e-subscription-payment-${suffix}`
  const walletPaymentId = `e2e-wallet-payment-${suffix}`
  const originalDispatch = AlertDispatcherService.dispatch
  const originalToken = process.env.MP_ACCESS_TOKEN
  const alerts = []

  t.after(async () => {
    AlertDispatcherService.dispatch = originalDispatch
    if (originalToken == null) delete process.env.MP_ACCESS_TOKEN
    else process.env.MP_ACCESS_TOKEN = originalToken
    await prisma.payment.deleteMany({ where: { userId } })
    await prisma.subscription.deleteMany({ where: { userId } })
    await prisma.user.deleteMany({ where: { id: userId } })
    await prisma.$disconnect()
  })

  AlertDispatcherService.dispatch = async alert => {
    alerts.push(alert)
    return { delivered: true, status: 200 }
  }
  delete process.env.MP_ACCESS_TOKEN

  await prisma.user.create({
    data: {
      id: userId,
      name: 'Operational E2E',
      email: `operational-e2e-${suffix}@example.invalid`,
      password: 'not-used-by-e2e',
    },
  })

  await prisma.payment.createMany({
    data: [
      {
        id: subscriptionPaymentId,
        userId,
        provider: 'MERCADO_PAGO',
        method: 'PIX',
        purpose: 'SUBSCRIPTION',
        status: 'APPROVED',
        amountCents: 1000,
        coinsAmount: 0,
        isCredited: false,
      },
      {
        id: walletPaymentId,
        userId,
        provider: 'MERCADO_PAGO',
        method: 'PIX',
        purpose: 'WALLET_CREDIT',
        status: 'APPROVED',
        amountCents: 1000,
        coinsAmount: 1000,
        isCredited: false,
      },
    ],
  })

  await prisma.subscription.create({
    data: {
      userId,
      plan: 'MONTHLY',
      status: 'ACTIVE',
      startAt: new Date('2026-01-01T00:00:00.000Z'),
      endAt: new Date('2026-02-01T00:00:00.000Z'),
    },
  })

  await DetectPaymentAlertsService.execute()

  assert.deepEqual(
    alerts.map(alert => alert.data.paymentId),
    [walletPaymentId]
  )

  const before = await GetOperationalStatusService.execute()
  assert.equal(before.payments.approvedNotCredited, 1)
  assert.equal(before.subscriptions.active, 0)
  assert.equal(before.subscriptions.activePastEnd, 1)

  const result = await RevalidateActiveSubscriptionsService.execute(
    new Date('2026-08-30T12:00:00.000Z')
  )
  assert.equal(result.expiredFixedTerm, 1)

  const subscription = await prisma.subscription.findUniqueOrThrow({
    where: { userId },
  })
  assert.equal(subscription.status, 'EXPIRED')

  const after = await GetOperationalStatusService.execute()
  assert.equal(after.subscriptions.activePastEnd, 0)
})
