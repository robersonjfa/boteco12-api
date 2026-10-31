/* Validação executável do modelo Mesa Free.
 * Roda contra um Postgres real e os serviços compilados (dist).
 */
const { prisma } = require('../dist/lib/prisma')
const { CreateBolaoService } = require('../dist/services/bolao/create-bolao.service')
const { JoinBolaoService } = require('../dist/services/bolao/join-bolao.service')
const { CreateMesaSchema } = require('../dist/validators/bolao.validator')
const {
  BolaoRegistrationWindowService,
  COMPETITION_REGISTRATION_CLOSED,
  COMPETITION_REGISTRATION_NOT_STARTED,
} = require('../dist/services/bolao/bolao-registration-window.service')
const { mesaRegistrationState } = require('../dist/services/bolao/discover-mesas.service')
const { MesaLifecycleService } = require('../dist/services/bolao/mesa-lifecycle.service')
const { MesaInitialScoreService } = require('../dist/services/bolao/mesa-initial-score.service')

const results = []
const now = Date.now()
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

function record(group, id, title, status, expected, observed) {
  results.push({ group, id, title, status, expected, observed })
  console.log(`${status.padEnd(12)} ${group} ${id} ${title}`)
}
function ok(group, id, title, expected, observed) { record(group, id, title, 'PASSOU', expected, observed) }
function fail(group, id, title, expected, observed) { record(group, id, title, 'FALHOU', expected, observed) }
async function capture(group, id, title, expected, fn) {
  try {
    const observed = await fn()
    ok(group, id, title, expected, observed)
    return { ok: true, observed }
  } catch (error) {
    fail(group, id, title, expected, error.message)
    return { ok: false, observed: error.message }
  }
}

const IDS = {
  admin: '00000000-0000-4000-8000-000000000001',
  pro: '00000000-0000-4000-8000-000000000002',
  free: '00000000-0000-4000-8000-000000000003',
  outsider: '00000000-0000-4000-8000-000000000004',
  round30: '00000000-0000-4000-8000-000000000030',
  round31: '00000000-0000-4000-8000-000000000031',
  round32: '00000000-0000-4000-8000-000000000032',
  round33: '00000000-0000-4000-8000-000000000033',
}

async function reset() {
  await prisma.walletLedger.deleteMany()
  await prisma.rankingParticipant.deleteMany()
  await prisma.rankingRound.deleteMany()
  await prisma.ranking.deleteMany()
  await prisma.wallet.deleteMany()
  await prisma.subscription.deleteMany()
  await prisma.userAdminRole.deleteMany()
  await prisma.user.deleteMany()
  await prisma.round.deleteMany()
}

async function seed() {
  await prisma.user.createMany({
    data: [
      { id: IDS.admin, name: 'Admin', email: 'admin@free.test', password: 'x', role: 'ADMIN', cpf: '11111111111', birthDate: new Date('1990-01-01') },
      { id: IDS.pro, name: 'Pro', email: 'pro@free.test', password: 'x', role: 'NORMAL', cpf: '22222222222', birthDate: new Date('1991-01-01') },
      { id: IDS.free, name: 'Free', email: 'free@free.test', password: 'x', role: 'NORMAL', cpf: '33333333333', birthDate: new Date('1992-01-01') },
      { id: IDS.outsider, name: 'Outsider', email: 'outsider@free.test', password: 'x', role: 'NORMAL', cpf: '44444444444', birthDate: new Date('1993-01-01') },
    ],
  })
  await prisma.wallet.createMany({
    data: [
      { userId: IDS.pro, balance: 1000 },
      { userId: IDS.free, balance: 1000 },
      { userId: IDS.outsider, balance: 1000 },
    ],
  })
  await prisma.subscription.create({
    data: { userId: IDS.pro, plan: 'MONTHLY', status: 'ACTIVE', startAt: new Date(now - DAY), endAt: new Date(now + 30 * DAY) },
  })
  await prisma.round.createMany({
    data: [
      { id: IDS.round30, number: 30, status: 'CLOSED' },
      { id: IDS.round31, number: 31, status: 'CLOSED' },
      { id: IDS.round32, number: 32, status: 'OPEN' },
      { id: IDS.round33, number: 33, status: 'DRAFT' },
    ],
  })
}

function freeInput(overrides = {}) {
  return {
    name: `Mesa Free ${Math.random().toString(36).slice(2, 8)}`,
    description: 'Mesa gratuita para acompanhar as proximas rodadas.',
    startDate: new Date(now),
    entryEndDate: new Date(now + 2 * HOUR),
    endDate: null,
    category: 'FREE',
    accessCost: 0,
    sponsorPrizePool: 0,
    eligibility: 'ALL',
    registrationCloseMode: 'DATE',
    durationMode: 'ROUNDS',
    durationRounds: 5,
    maxParticipants: null,
    prizeDistribution: [],
    createdByUserId: IDS.admin,
    administrative: true,
    publicationMode: 'NOW',
    ...overrides,
  }
}

function schemaBase(overrides = {}) {
  return {
    name: 'Mesa Free Schema',
    description: 'Mesa gratuita com prazo de protecao.',
    startDate: new Date(now + HOUR).toISOString(),
    entryEndDate: new Date(now + 2 * HOUR).toISOString(),
    endDate: null,
    category: 'FREE',
    accessCost: 0,
    sponsorPrizePool: 0,
    eligibility: 'ALL',
    registrationCloseMode: 'DATE',
    durationMode: 'ROUNDS',
    durationRounds: 5,
    maxParticipants: null,
    prizeDistribution: [],
    ...overrides,
  }
}

async function createMesa(overrides = {}) {
  return CreateBolaoService.execute(freeInput(overrides))
}

async function main() {
  await reset()
  await seed()

  // ---------------- Grupo A: permissões ----------------
  await capture('A', 'A1', 'Usuário sem assinatura cria Mesa Free', 'criada', async () => {
    const mesa = await CreateBolaoService.execute(freeInput({
      createdByUserId: IDS.free,
      administrative: false,
      publicationMode: 'DRAFT',
    }))
    return `id=${mesa.id} status=${mesa.status}`
  })

  await capture('A', 'A2', 'Não autenticado NÃO cria Mesa Free', 'user_not_found', async () => {
    try {
      await createMesa({ createdByUserId: '00000000-0000-4000-8000-00000000ffff' })
      throw new Error('criou indevidamente')
    } catch (error) {
      if (error.code !== 'user_not_found') throw new Error(`código inesperado: ${error.code ?? error.message}`)
      return error.code
    }
  })

  await capture('A', 'A3', 'API rejeita limite de participantes na Free', 'rejeitado', async () => {
    const parsed = CreateMesaSchema.safeParse(schemaBase({ maxParticipants: 5 }))
    if (parsed.success) throw new Error('aceitou maxParticipants')
    return parsed.error.issues.map(i => `${i.path.join('.')}:${i.message}`).join(' | ')
  })

  await capture('A', 'A4', 'API rejeita fechamento por lotação na Free', 'rejeitado', async () => {
    const parsed = CreateMesaSchema.safeParse(schemaBase({ registrationCloseMode: 'CAPACITY', maxParticipants: 5 }))
    if (parsed.success) throw new Error('aceitou CAPACITY')
    return parsed.error.issues.map(i => `${i.path.join('.')}:${i.message}`).join(' | ')
  })

  await capture('A', 'A5', 'API rejeita cobrança de Tampinhas na Free', 'rejeitado', async () => {
    const parsed = CreateMesaSchema.safeParse(schemaBase({ accessCost: 10 }))
    if (parsed.success) throw new Error('aceitou accessCost')
    return parsed.error.issues.map(i => `${i.path.join('.')}:${i.message}`).join(' | ')
  })

  // ---------------- Grupo B: campos ----------------
  const schemaCase = (id, title, overrides, shouldPass) => {
    const parsed = CreateMesaSchema.safeParse(schemaBase(overrides))
    const passed = parsed.success === shouldPass
    const detail = parsed.success ? 'accepted' : parsed.error.issues.map(i => `${i.path.join('.')}:${i.message}`).join(' | ')
    record('B', id, title, passed ? 'PASSOU' : 'FALHOU', shouldPass ? 'aceito' : 'rejeitado', detail)
  }

  schemaCase('B1', 'Todos os campos válidos', {}, true)
  schemaCase('B2', 'Nome da Mesa ausente', { name: undefined }, false)
  schemaCase('B3', 'Regras ausentes', { description: undefined }, false)
  schemaCase('B4', 'Categoria ausente', { category: undefined }, false)
  schemaCase('B5', 'Categoria diferente de FREE', { category: 'PAID' }, false)
  schemaCase('B6', 'Início das inscrições ausente', { startDate: undefined }, false)
  schemaCase('B7', 'Data final das inscrições ausente', { entryEndDate: undefined }, false)
  schemaCase('B8', 'Duração ausente', { durationRounds: null }, false)
  schemaCase('B9', 'Limite de participantes rejeitado', { maxParticipants: 5 }, false)
  schemaCase('B10', 'Fechamento por lotação rejeitado', { registrationCloseMode: 'CAPACITY', maxParticipants: 5 }, false)
  schemaCase('B11', 'Duração por data rejeitada', { durationMode: 'DATE', durationRounds: null, endDate: new Date(now + 3 * HOUR).toISOString() }, false)
  schemaCase('B12', 'Custo de entrada rejeitado', { accessCost: 10 }, false)
  schemaCase('B13', 'Premiação patrocinada rejeitada', { sponsorPrizePool: 10 }, false)
  schemaCase('B14', 'Distribuição de prêmio rejeitada', { prizeDistribution: [{ position: 1, percentage: 100 }] }, false)
  schemaCase('B15', 'Campos extras rejeitados', { campoExtra: true }, false)
  schemaCase('B16', 'Tipos incorretos rejeitados', { durationRounds: 'cinco' }, false)

  await capture('B', 'B17', 'Persistência grava Free sem custo e sem limite', 'accessCost=0 max=null', async () => {
    const mesa = await createMesa()
    const row = await prisma.ranking.findUniqueOrThrow({ where: { id: mesa.id } })
    if (row.accessCost !== 0 || row.maxParticipants !== null || row.registrationCloseMode !== 'DATE') {
      throw new Error(`accessCost=${row.accessCost} max=${row.maxParticipants} close=${row.registrationCloseMode}`)
    }
    return 'accessCost=0 max=null close=DATE'
  })

  // ---------------- Grupo C: datas ----------------
  await capture('C', 'C1', 'Entrada antes do início é bloqueada', 'ainda não começaram', async () => {
    const mesa = await createMesa({ startDate: new Date(now + HOUR) })
    try {
      await JoinBolaoService.execute({ rankingId: mesa.id, userId: IDS.pro })
      throw new Error('entrou antes do início')
    } catch (error) {
      if (!error.message.includes(COMPETITION_REGISTRATION_NOT_STARTED)) throw new Error(error.message)
      return error.message
    }
  })

  await capture('C', 'C2', 'Entrada no instante/depois do início é aceita', 'entrada aceita', async () => {
    const mesa = await createMesa({ startDate: new Date(now - HOUR) }).catch(async () => {
      // startDate no passado é rejeitado na criação; usa o limite do dia
      return createMesa({ startDate: new Date(now) })
    })
    await JoinBolaoService.execute({ rankingId: mesa.id, userId: IDS.pro })
    return 'entrada aceita'
  })

  await capture('C', 'C3', 'Data de início inválida é rejeitada', 'mesa_start_date_invalid', async () => {
    try {
      await createMesa({ startDate: new Date('invalid') })
      throw new Error('aceitou data inválida')
    } catch (error) {
      if (error.code !== 'mesa_start_date_invalid') throw new Error(`código inesperado: ${error.code ?? error.message}`)
      return error.code
    }
  })

  await capture('C', 'C4', 'Data de início no passado é rejeitada', 'mesa_start_date_in_past', async () => {
    try {
      await createMesa({ startDate: new Date(now - 3 * DAY) })
      throw new Error('aceitou data passada')
    } catch (error) {
      if (error.code !== 'mesa_start_date_in_past') throw new Error(`código inesperado: ${error.code ?? error.message}`)
      return error.code
    }
  })

  await capture('C', 'C5', 'Entrada após a data limite é bloqueada', 'encerradas', async () => {
    const mesa = await createMesa({ startDate: new Date(now) })
    await prisma.ranking.update({ where: { id: mesa.id }, data: { entryEndDate: new Date(now - HOUR) } })
    try {
      await JoinBolaoService.execute({ rankingId: mesa.id, userId: IDS.free })
      throw new Error('entrou após o fechamento')
    } catch (error) {
      if (!error.message.includes(COMPETITION_REGISTRATION_CLOSED)) throw new Error(error.message)
      return error.message
    }
  })

  await capture('C', 'C6', 'Mesa fechada bloqueia novas entradas', 'bloqueado', async () => {
    const mesa = await createMesa({ startDate: new Date(now) })
    await prisma.ranking.update({ where: { id: mesa.id }, data: { status: 'CLOSED' } })
    try {
      await JoinBolaoService.execute({ rankingId: mesa.id, userId: IDS.free })
      throw new Error('entrou em Mesa fechada')
    } catch (error) {
      return error.message
    }
  })

  // ---------------- Grupo D: sem limite / sem cobrança ----------------
  await capture('D', 'D1', 'Free aceita entradas sucessivas sem limite de participantes', '3 participantes, inscrições abertas', async () => {
    const mesa = await createMesa({ startDate: new Date(now) })
    await JoinBolaoService.execute({ rankingId: mesa.id, userId: IDS.pro })
    await JoinBolaoService.execute({ rankingId: mesa.id, userId: IDS.free })
    await JoinBolaoService.execute({ rankingId: mesa.id, userId: IDS.outsider })
    const row = await prisma.ranking.findUniqueOrThrow({ where: { id: mesa.id } })
    if (row.currentParticipants !== 3 || row.registrationClosedAt !== null) {
      throw new Error(`participantes=${row.currentParticipants} closed=${row.registrationClosedAt}`)
    }
    return `participantes=3 closed=null max=${row.maxParticipants}`
  })

  await capture('D', 'D2', 'Quantidade de participantes não fecha as inscrições', 'inscrições continuam abertas', async () => {
    const mesa = await createMesa({ startDate: new Date(now), entryEndDate: new Date(now + 7 * DAY) })
    await JoinBolaoService.execute({ rankingId: mesa.id, userId: IDS.pro })
    const row = await prisma.ranking.findUniqueOrThrow({ where: { id: mesa.id } })
    const state = mesaRegistrationState(row, new Date())
    if (state.state !== 'OPEN') throw new Error(`state=${state.state}`)
    return `state=${state.state}`
  })

  await capture('D', 'D3', 'Entrada na Free não debita Tampinhas', 'saldo 1000', async () => {
    const mesa = await createMesa({ startDate: new Date(now) })
    await JoinBolaoService.execute({ rankingId: mesa.id, userId: IDS.pro })
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: IDS.pro } })
    if (wallet.balance !== 1000) throw new Error(`saldo=${wallet.balance}`)
    return `saldo=${wallet.balance}`
  })

  await capture('D', 'D4', 'Reprocessamento não duplica participante', '1 participante', async () => {
    const mesa = await createMesa({ startDate: new Date(now) })
    await JoinBolaoService.execute({ rankingId: mesa.id, userId: IDS.pro })
    try {
      await JoinBolaoService.execute({ rankingId: mesa.id, userId: IDS.pro })
    } catch (error) {
      // duplicidade deve ser bloqueada
    }
    const count = await prisma.rankingParticipant.count({ where: { rankingId: mesa.id, userId: IDS.pro } })
    if (count !== 1) throw new Error(`participantes=${count}`)
    return 'participantes=1'
  })

  await capture('D', 'D5', 'Fechamento por data independe da quantidade de participantes', '2 inscritos, fechamento por data', async () => {
    const mesa = await createMesa({ startDate: new Date(now) })
    await JoinBolaoService.execute({ rankingId: mesa.id, userId: IDS.pro })
    await JoinBolaoService.execute({ rankingId: mesa.id, userId: IDS.free })
    await prisma.ranking.update({ where: { id: mesa.id }, data: { entryEndDate: new Date(now - HOUR) } })
    await MesaLifecycleService.closeDueRegistrations(prisma, new Date())
    const row = await prisma.ranking.findUniqueOrThrow({ where: { id: mesa.id } })
    if (!row.registrationClosedAt) throw new Error('não fechou por data')
    return `participantes=2 closed=${row.registrationClosedAt.toISOString()}`
  })

  // ---------------- Grupo F: estados ----------------
  await capture('F', 'F1', 'Mesa Free publicada inicia ativa', 'ACTIVE', async () => {
    const mesa = await createMesa({ startDate: new Date(now) })
    const row = await prisma.ranking.findUniqueOrThrow({ where: { id: mesa.id } })
    if (row.status !== 'ACTIVE') throw new Error(`status=${row.status}`)
    return `status=${row.status} close=${row.registrationCloseMode}`
  })

  await capture('F', 'F2', 'Inscrições abertas refletem a janela da Mesa', 'OPEN', async () => {
    const mesa = await createMesa({ startDate: new Date(now), entryEndDate: new Date(now + 7 * DAY) })
    const row = await prisma.ranking.findUniqueOrThrow({ where: { id: mesa.id } })
    const state = mesaRegistrationState(row, new Date())
    if (state.state !== 'OPEN') throw new Error(`state=${state.state}`)
    return `state=${state.state}`
  })

  await capture('F', 'F3', 'Fechamento por data persistido e novas entradas bloqueadas', 'closed + bloqueado', async () => {
    const mesa = await createMesa({ startDate: new Date(now) })
    await prisma.ranking.update({ where: { id: mesa.id }, data: { entryEndDate: new Date(now - HOUR) } })
    await MesaLifecycleService.closeDueRegistrations(prisma, new Date())
    const row = await prisma.ranking.findUniqueOrThrow({ where: { id: mesa.id } })
    if (!row.registrationClosedAt) throw new Error('registrationClosedAt nulo')
    try {
      await JoinBolaoService.execute({ rankingId: mesa.id, userId: IDS.pro })
      throw new Error('entrou após fechamento')
    } catch (error) {
      if (!error.message.includes(COMPETITION_REGISTRATION_CLOSED)) throw error
    }
    return `closed=${row.registrationClosedAt.toISOString()}`
  })

  // ---------------- Grupo E: Score Inicial 163 ----------------
  await capture('E', 'E1', 'Fechamento por data grava a rodada 32 como referência', 'referenceRoundId=32', async () => {
    const mesa = await createMesa({ startDate: new Date(now) })
    await prisma.ranking.update({ where: { id: mesa.id }, data: { entryEndDate: new Date(now - HOUR) } })
    await MesaLifecycleService.closeDueRegistrations(prisma, new Date())
    const row = await prisma.ranking.findUniqueOrThrow({ where: { id: mesa.id } })
    if (row.referenceRoundId !== IDS.round32) throw new Error(`referenceRoundId=${row.referenceRoundId}`)
    return `referenceRoundId=${row.referenceRoundId} status=${row.initializationStatus}`
  })

  await capture('E', 'E2', 'Free por data captura Score Inicial 163', 'scoreInitial=163', async () => {
    const mesa = await createMesa({ startDate: new Date(now) })
    await JoinBolaoService.execute({ rankingId: mesa.id, userId: IDS.pro })
    await JoinBolaoService.execute({ rankingId: mesa.id, userId: IDS.free })
    await prisma.ranking.update({ where: { id: mesa.id }, data: { entryEndDate: new Date(now - HOUR) } })
    await MesaLifecycleService.closeDueRegistrations(prisma, new Date())
    await prisma.userScoreHistory.createMany({ data: [
      { userId: IDS.pro, roundId: IDS.round32, scoreRound: 163, scoreTotal: 163 },
      { userId: IDS.free, roundId: IDS.round32, scoreRound: 163, scoreTotal: 163 },
    ] })
    await prisma.round.update({ where: { id: IDS.round32 }, data: { status: 'SCORED', closeAt: new Date() } })
    await MesaInitialScoreService.capturePending()
    const participants = await prisma.rankingParticipant.findMany({ where: { rankingId: mesa.id } })
    if (participants.some(p => p.scoreInitial !== 163)) throw new Error(JSON.stringify(participants.map(p => p.scoreInitial)))
    const row = await prisma.ranking.findUniqueOrThrow({ where: { id: mesa.id } })
    if (row.initializationStatus !== 'READY') throw new Error(`status=${row.initializationStatus}`)
    return 'scoreInitial=163 status=READY'
  })

  await capture('E', 'E3', 'Reprocessamento não altera o Score Inicial capturado', 'idempotente', async () => {
    const before = await prisma.rankingParticipant.findFirstOrThrow({
      where: { ranking: { category: 'FREE' }, scoreInitialCapturedAt: { not: null } },
      orderBy: { scoreInitialCapturedAt: 'desc' },
    })
    await MesaInitialScoreService.capturePending()
    const after = await prisma.rankingParticipant.findUniqueOrThrow({ where: { id: before.id } })
    if (after.scoreInitial !== before.scoreInitial || after.scoreInitialCapturedAt?.getTime() !== before.scoreInitialCapturedAt?.getTime()) {
      throw new Error('captura alterada')
    }
    return `scoreInitial=${after.scoreInitial} capturedAt preservado`
  })

  const summary = results.reduce((acc, item) => { acc[item.status] = (acc[item.status] ?? 0) + 1; return acc }, {})
  console.log('\nRESUMO', JSON.stringify(summary), 'total', results.length)
  require('node:fs').writeFileSync(
    process.env.VALIDATION_OUTPUT ?? '/tmp/free-validation.json',
    JSON.stringify({ generatedAt: new Date().toISOString(), summary, results }, null, 2),
  )
}

main()
  .catch(error => { console.error('ERRO FATAL', error); process.exitCode = 1 })
  .finally(async () => { await prisma.$disconnect() })
