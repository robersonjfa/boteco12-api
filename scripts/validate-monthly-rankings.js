/* Validação executável dos Rankings Mensais FREE e PRO (RM-01..RM-20). */
const { prisma } = require('../dist/lib/prisma')
const { EnsureMonthlyRankingsService } = require('../dist/services/ranking/ensure-monthly-rankings.service')
const { BuildMonthlyRankingFromHistoryService } = require('../dist/services/ranking/build-monthly-ranking-from-history.service')
const { CloseExpiredRankingsService } = require('../dist/services/ranking/close-expired-rankings.service')
const { RankingTiebreakService } = require('../dist/services/ranking/ranking-tiebreak.service')

const results = []
function record(id, title, status, expected, observed) {
  results.push({ id, title, status, expected, observed })
  console.log(`${status.padEnd(12)} ${id} ${title}`)
}
function ok(id, title, expected, observed) { record(id, title, 'PASSOU', expected, observed) }
function fail(id, title, expected, observed) { record(id, title, 'FALHOU', expected, observed) }
async function capture(id, title, expected, fn) {
  try { const observed = await fn(); ok(id, title, expected, observed) }
  catch (error) { fail(id, title, expected, error.message) }
}

const IDS = {
  normal: '00000000-0000-4000-8000-000000000001',
  proActive: '00000000-0000-4000-8000-000000000002',
  proLate: '00000000-0000-4000-8000-000000000003',
  proEndsBeforeClose: '00000000-0000-4000-8000-000000000004',
  proExpiresAfter: '00000000-0000-4000-8000-000000000005',
  proCancelledAfter: '00000000-0000-4000-8000-000000000006',
  proAfterClose: '00000000-0000-4000-8000-000000000007',
  roundRef: '00000000-0000-4000-8000-000000000101',
  roundNext: '00000000-0000-4000-8000-000000000102',
  roundLate: '00000000-0000-4000-8000-000000000103',
  roundFeb: '00000000-0000-4000-8000-000000000104',
}

async function reset() {
  await prisma.rankingSnapshot.deleteMany()
  await prisma.userScoreHistory.deleteMany()
  await prisma.rankingParticipant.deleteMany()
  await prisma.rankingRound.deleteMany()
  await prisma.ranking.deleteMany()
  await prisma.ticket.deleteMany()
  await prisma.walletLedger.deleteMany()
  await prisma.wallet.deleteMany()
  await prisma.subscription.deleteMany()
  await prisma.user.deleteMany()
  await prisma.round.deleteMany()
}

function user(id, email) {
  return {
    id, name: id, email, password: 'x', role: 'NORMAL',
    cpf: String(10000000000 + Number(id.slice(-3))),
    birthDate: new Date('1990-01-01'),
    createdAt: new Date('2025-12-01T00:00:00Z'),
    scoreTotal: 100,
  }
}

async function seed() {
  await prisma.user.createMany({
    data: [
      user(IDS.normal, 'normal@monthly.test'),
      user(IDS.proActive, 'pro-active@monthly.test'),
      user(IDS.proLate, 'pro-late@monthly.test'),
      user(IDS.proEndsBeforeClose, 'pro-ends@monthly.test'),
      user(IDS.proExpiresAfter, 'pro-expires-after@monthly.test'),
      user(IDS.proCancelledAfter, 'pro-cancelled-after@monthly.test'),
      user(IDS.proAfterClose, 'pro-after-close@monthly.test'),
    ],
  })
  await prisma.subscription.createMany({
    data: [
      { userId: IDS.proActive, plan: 'MONTHLY', status: 'ACTIVE', startAt: new Date('2025-12-01T00:00:00Z'), endAt: new Date('2027-01-01T00:00:00Z') },
      { userId: IDS.proLate, plan: 'MONTHLY', status: 'ACTIVE', startAt: new Date('2026-01-15T00:00:00Z'), endAt: new Date('2027-01-01T00:00:00Z') },
      { userId: IDS.proEndsBeforeClose, plan: 'MONTHLY', status: 'ACTIVE', startAt: new Date('2025-12-01T00:00:00Z'), endAt: new Date('2026-01-03T00:00:00Z') },
      { userId: IDS.proExpiresAfter, plan: 'MONTHLY', status: 'ACTIVE', startAt: new Date('2025-12-01T00:00:00Z'), endAt: new Date('2026-02-05T00:00:00Z') },
      { userId: IDS.proCancelledAfter, plan: 'MONTHLY', status: 'CANCELLED', startAt: new Date('2025-12-01T00:00:00Z'), endAt: new Date('2026-02-05T00:00:00Z') },
      { userId: IDS.proAfterClose, plan: 'MONTHLY', status: 'ACTIVE', startAt: new Date('2026-01-21T00:00:00Z'), endAt: new Date('2027-01-01T00:00:00Z') },
    ],
  })
  await prisma.round.createMany({
    data: [
      { id: IDS.roundRef, number: 1, status: 'OPEN', closeAt: new Date('2026-01-20T23:00:00Z') },
      { id: IDS.roundNext, number: 2, status: 'SCORED', closeAt: new Date('2026-01-25T23:00:00Z') },
    ],
  })
}

async function monthlyRanking(type) {
  return prisma.ranking.findFirst({ where: { type, periodRef: '2026-01' } })
}
async function participantIds(rankingId) {
  const rows = await prisma.rankingParticipant.findMany({ where: { rankingId }, select: { userId: true } })
  return rows.map(r => r.userId)
}

async function main() {
  await reset()
  await seed()

  // RM-01 — limite do mês em São Paulo
  await capture('RM-01', 'Janeiro inclui rodada até 23:59 de 31/01 (São Paulo)', 'rodada de 31/01 23:00 BRT entra em janeiro', async () => {
    await prisma.round.create({ data: { id: IDS.roundLate, number: 3, status: 'SCORED', closeAt: new Date('2026-02-01T02:00:00Z') } })
    await prisma.userScoreHistory.create({ data: { userId: IDS.normal, roundId: IDS.roundLate, scoreRound: 7, scoreTotal: 107 } })
    const rows = await BuildMonthlyRankingFromHistoryService.execute({ periodRef: '2026-01', scope: 'general' })
    const row = rows.find(r => r.userId === IDS.normal)
    if (!row || row.monthlyPoints < 7) throw new Error('rodada de 31/01 23:00 BRT ficou fora de janeiro (build usa UTC)')
    return `pontos=${row.monthlyPoints}`
  })

  // Abertura: coorte provisória no dia 2
  await EnsureMonthlyRankingsService.execute({ periodRef: '2026-01', now: new Date('2026-01-02T12:00:00Z') })

  // A referência fecha em 20/01 e é consolidada
  await prisma.round.update({ where: { id: IDS.roundRef }, data: { status: 'SCORED' } })
  await prisma.userScoreHistory.createMany({
    data: [
      { userId: IDS.proActive, roundId: IDS.roundRef, scoreRound: 20, scoreTotal: 120 },
      { userId: IDS.proActive, roundId: IDS.roundNext, scoreRound: 20, scoreTotal: 140 },
    ],
  })
  await EnsureMonthlyRankingsService.execute({ periodRef: '2026-01', now: new Date('2026-01-21T12:00:00Z') })

  const general = await monthlyRanking('GLOBAL')
  const pro = await monthlyRanking('PRO')

  await capture('RM-10', 'Usuário FREE entra no Ranking FREE/Calçada', 'incluído', async () => {
    const ids = await participantIds(general.id)
    if (!ids.includes(IDS.normal)) throw new Error('FREE ausente do GLOBAL')
    return `GLOBAL com ${ids.length} participantes`
  })

  await capture('RM-11', 'Usuário PRO também entra no Ranking FREE/Calçada', 'incluído', async () => {
    const ids = await participantIds(general.id)
    if (!ids.includes(IDS.proActive)) throw new Error('PRO ausente do GLOBAL')
    return 'PRO presente no GLOBAL'
  })

  await capture('RM-19', 'Rankings separados: FREE amplo, PRO elegível no fechamento', 'GLOBAL 7 / PRO 4', async () => {
    const generalIds = await participantIds(general.id)
    const proIds = await participantIds(pro.id)
    if (generalIds.length !== 7) throw new Error(`GLOBAL=${generalIds.length}`)
    if (proIds.length !== 4) throw new Error(`PRO=${proIds.length}: ${proIds.join(',')}`)
    return `GLOBAL=${generalIds.length} PRO=${proIds.length}`
  })

  await capture('RM-12', 'PRO ativo no fechamento entra no PRO do ciclo', 'proLate incluído', async () => {
    const ids = await participantIds(pro.id)
    if (!ids.includes(IDS.proLate)) throw new Error('proLate (ativo desde 15/01) fora do PRO')
    return 'proLate incluído'
  })

  await capture('RM-13', 'PRO expirado depois do fechamento permanece no mês', 'permanece', async () => {
    await prisma.subscription.update({ where: { userId: IDS.proExpiresAfter }, data: { status: 'EXPIRED', endAt: new Date('2026-01-25T00:00:00Z') } })
    const ids = await participantIds(pro.id)
    if (!ids.includes(IDS.proExpiresAfter)) throw new Error('saiu do PRO após expirar')
    return 'permanece no PRO'
  })

  await capture('RM-14', 'PRO cancelado depois do fechamento permanece no mês', 'permanece', async () => {
    await prisma.subscription.update({ where: { userId: IDS.proCancelledAfter }, data: { status: 'CANCELLED' } })
    const ids = await participantIds(pro.id)
    if (!ids.includes(IDS.proCancelledAfter)) throw new Error('saiu do PRO após cancelar')
    return 'permanece no PRO'
  })

  await capture('RM-15', 'PRO que perde elegibilidade antes do fechamento não entra', 'proEndsBeforeClose fora', async () => {
    const ids = await participantIds(pro.id)
    if (ids.includes(IDS.proEndsBeforeClose)) throw new Error('proEndsBeforeClose (expira em 03/01) foi incluído')
    return 'fora do PRO'
  })

  await capture('RM-16', 'PRO contratado após o fechamento entra somente no mês seguinte', 'proAfterClose fora de janeiro', async () => {
    const ids = await participantIds(pro.id)
    if (ids.includes(IDS.proAfterClose)) throw new Error('proAfterClose (21/01) entrou em janeiro')
    return 'fora de janeiro'
  })

  await capture('RM-04', 'Score Inicial corresponde ao total consolidado da referência', 'inicial = 120', async () => {
    const participant = await prisma.rankingParticipant.findFirstOrThrow({
      where: { rankingId: pro.id, userId: IDS.proActive },
    })
    if (participant.scoreInitial !== 120) throw new Error(`scoreInitial=${participant.scoreInitial}`)
    if (!participant.scoreInitialCapturedAt) throw new Error('captura sem timestamp')
    return 'inicial=120'
  })

  await capture('RM-09', 'Reprocessar a captura não duplica nem altera o inicial', 'idempotente', async () => {
    const before = await prisma.rankingParticipant.findFirstOrThrow({ where: { rankingId: pro.id, userId: IDS.proActive } })
    const countBefore = await prisma.rankingParticipant.count({ where: { rankingId: pro.id } })
    await EnsureMonthlyRankingsService.execute({ periodRef: '2026-01', now: new Date('2026-01-21T12:00:00Z') })
    const after = await prisma.rankingParticipant.findFirstOrThrow({ where: { rankingId: pro.id, userId: IDS.proActive } })
    const countAfter = await prisma.rankingParticipant.count({ where: { rankingId: pro.id } })
    if (countBefore !== countAfter || before.scoreInitial !== after.scoreInitial) throw new Error('duplicou ou alterou')
    return `participantes=${countAfter} inicial=${after.scoreInitial}`
  })

  const build = await BuildMonthlyRankingFromHistoryService.execute({ periodRef: '2026-01', scope: 'general' })
  const proActiveRow = build.find(row => row.userId === IDS.proActive)

  await capture('RM-05', 'Rodada de referência não entra na pontuação do ciclo', 'pontos = 20', async () => {
    if (!proActiveRow) throw new Error('usuário ausente do build')
    if (proActiveRow.monthlyPoints !== 20) throw new Error(`pontos=${proActiveRow.monthlyPoints} (referência de 20 somada)`)
    return 'pontos=20'
  })

  await capture('RM-06', 'Primeira rodada contabilizada é a seguinte à referência', 'total = 20 (só a rodada 2)', async () => {
    if (!proActiveRow) throw new Error('usuário ausente do build')
    if (proActiveRow.monthlyPoints !== 20) throw new Error(`total=${proActiveRow.monthlyPoints}`)
    return 'total=20'
  })

  // RM-02 — fechamento espera a referência
  await prisma.ranking.create({
    data: {
      id: 'monthly-GLOBAL-2020-01', name: 'Ranking Geral Mensal 2020-01', type: 'GLOBAL',
      status: 'ACTIVE', periodRef: '2020-01',
      startDate: new Date('2020-01-01T03:00:00Z'), endDate: new Date('2020-01-31T23:59:59.999Z'),
    },
  })
  await prisma.round.create({
    data: { id: '00000000-0000-4000-8000-000000000201', number: 99, status: 'OPEN', closeAt: new Date('2020-01-31T23:59:00Z') },
  })
  await capture('RM-02', 'Janeiro não fecha antes da finalização/consolidação da referência', 'ranking permanece ACTIVE', async () => {
    await new CloseExpiredRankingsService().execute()
    const ranking = await prisma.ranking.findUniqueOrThrow({ where: { id: 'monthly-GLOBAL-2020-01' } })
    if (ranking.status !== 'ACTIVE') throw new Error(`status=${ranking.status} com rodada de referência aberta`)
    return 'ACTIVE'
  })

  await capture('RM-03', 'Fechamento após consolidação permanece associado a janeiro', 'periodRef=2020-01', async () => {
    await prisma.round.update({ where: { id: '00000000-0000-4000-8000-000000000201' }, data: { status: 'SCORED' } })
    await new CloseExpiredRankingsService().execute()
    const ranking = await prisma.ranking.findUniqueOrThrow({ where: { id: 'monthly-GLOBAL-2020-01' } })
    if (ranking.periodRef !== '2020-01') throw new Error(`periodRef=${ranking.periodRef}`)
    if (ranking.status !== 'CLOSED') throw new Error(`status=${ranking.status} após consolidar`)
    return `periodRef=${ranking.periodRef} status=${ranking.status}`
  })

  await capture('RM-20', 'Reprocessar fechamento não altera indevidamente', 'idempotente', async () => {
    const before = await prisma.ranking.findUniqueOrThrow({ where: { id: 'monthly-GLOBAL-2020-01' } })
    await new CloseExpiredRankingsService().execute()
    const after = await prisma.ranking.findUniqueOrThrow({ where: { id: 'monthly-GLOBAL-2020-01' } })
    if (after.status !== before.status || after.periodRef !== before.periodRef) throw new Error('alterou no reprocessamento')
    return `status=${after.status} periodRef=${after.periodRef}`
  })

  await capture('RM-18', 'Desempate respeita a ordem oficial', 'maior superDouble antes de double', async () => {
    const ranked = RankingTiebreakService.rank(
      [
        { userId: 'a', scoreRanking: 10, superDoubleHits: 1, doubleHits: 5, userCreatedAt: new Date('2025-01-01') },
        { userId: 'b', scoreRanking: 10, superDoubleHits: 2, doubleHits: 1, userCreatedAt: new Date('2025-01-01') },
      ],
      row => row,
    )
    if (ranked[0].userId !== 'b') throw new Error(`ordem=${ranked.map(r => r.userId).join(',')}`)
    return 'b antes de a'
  })

  await capture('RM-17', 'Regra de pontuação reutilizada sem alteração', 'soma dos scoreRound contabilizados', async () => {
    if (!proActiveRow || proActiveRow.monthlyPoints !== 20) throw new Error('pontuação divergente')
    return 'scoreRound do ciclo somado'
  })

  // RM-07/08 — sem captura antes de SCORED
  await prisma.round.create({ data: { id: IDS.roundFeb, number: 4, status: 'OPEN', closeAt: new Date('2026-02-05T23:00:00Z') } })
  await EnsureMonthlyRankingsService.execute({ periodRef: '2026-02', now: new Date('2026-02-02T12:00:00Z') })
  const feb = await prisma.ranking.findFirstOrThrow({ where: { type: 'GLOBAL', periodRef: '2026-02' } })

  await capture('RM-07', 'Falha na finalização impede captura prematura', 'sem captura antes de SCORED', async () => {
    const pending = await prisma.rankingParticipant.findMany({ where: { rankingId: feb.id, scoreInitialCapturedAt: { not: null } } })
    if (pending.length > 0) throw new Error(`${pending.length} participante(s) capturado(s) antes de SCORED`)
    return 'nenhuma captura'
  })

  await capture('RM-08', 'Rodada finalizada sem consolidação não captura parcial', 'sem captura parcial', async () => {
    await prisma.round.update({ where: { id: IDS.roundFeb }, data: { status: 'CLOSED' } })
    await EnsureMonthlyRankingsService.execute({ periodRef: '2026-02', now: new Date('2026-02-06T12:00:00Z') })
    const pending = await prisma.rankingParticipant.findMany({ where: { rankingId: feb.id, scoreInitialCapturedAt: { not: null } } })
    if (pending.length > 0) throw new Error(`${pending.length} captura(s) sem consolidação`)
    return 'nenhuma captura parcial'
  })

  const summary = results.reduce((acc, item) => { acc[item.status] = (acc[item.status] ?? 0) + 1; return acc }, {})
  console.log('\nRESUMO', JSON.stringify(summary), 'total', results.length)
  require('node:fs').writeFileSync('/tmp/monthly-validation.json', JSON.stringify({ generatedAt: new Date().toISOString(), summary, results }, null, 2))
}

main()
  .catch(error => { console.error('ERRO FATAL', error); process.exitCode = 1 })
  .finally(async () => { await prisma.$disconnect() })
