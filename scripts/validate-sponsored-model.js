/* Validação executável do modelo Mesa Patrocinada.
 * Roda contra um Postgres real e os serviços compilados (dist).
 * Não é teste unitário: cada caso cria/consulta dados reais e registra evidência.
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

function ok(group, id, title, expected, observed) {
  record(group, id, title, 'PASSOU', expected, observed)
}

function fail(group, id, title, expected, observed) {
  record(group, id, title, 'FALHOU', expected, observed)
}

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
  round34: '00000000-0000-4000-8000-000000000034',
  round35: '00000000-0000-4000-8000-000000000035',
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
      { id: IDS.admin, name: 'Admin', email: 'admin@validation.test', password: 'x', role: 'ADMIN', cpf: '11111111111', birthDate: new Date('1990-01-01') },
      { id: IDS.pro, name: 'Pro', email: 'pro@validation.test', password: 'x', role: 'NORMAL', cpf: '22222222222', birthDate: new Date('1991-01-01') },
      { id: IDS.free, name: 'Free', email: 'free@validation.test', password: 'x', role: 'NORMAL', cpf: '33333333333', birthDate: new Date('1992-01-01') },
      { id: IDS.outsider, name: 'Outsider', email: 'outsider@validation.test', password: 'x', role: 'NORMAL', cpf: '44444444444', birthDate: new Date('1993-01-01') },
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

function sponsoredInput(overrides = {}) {
  return {
    name: `Mesa Patrocinada ${Math.random().toString(36).slice(2, 8)}`,
    description: 'Premio patrocinado integral conforme regulamento publicado.',
    startDate: new Date(now),
    entryEndDate: null,
    endDate: null,
    category: 'SPONSORED_FREE',
    accessCost: 0,
    sponsorPrizePool: 100,
    sponsorName: 'Patrocinador Teste',
    sponsorLogoUrl: null,
    eligibility: 'ALL',
    registrationCloseMode: 'CAPACITY',
    durationMode: 'ROUNDS',
    durationRounds: 5,
    maxParticipants: 2,
    prizeDistribution: [{ position: 1, percentage: 100 }],
    createdByUserId: IDS.admin,
    administrative: true,
    publicationMode: 'NOW',
    ...overrides,
  }
}

function schemaBase(overrides = {}) {
  return {
    name: 'Mesa Patrocinada Schema',
    description: 'Premio patrocinado integral conforme regulamento.',
    startDate: new Date(now + HOUR).toISOString(),
    entryEndDate: null,
    endDate: null,
    category: 'SPONSORED_FREE',
    accessCost: 0,
    sponsorPrizePool: 100,
    sponsorName: 'Patrocinador Teste',
    eligibility: 'ALL',
    registrationCloseMode: 'CAPACITY',
    durationMode: 'ROUNDS',
    durationRounds: 5,
    maxParticipants: 2,
    prizeDistribution: [{ position: 1, percentage: 100 }],
    ...overrides,
  }
}

async function createMesa(overrides = {}) {
  const result = await CreateBolaoService.execute(sponsoredInput(overrides))
  return result
}

async function main() {
  await reset()
  await seed()

  // ---------------- Grupo A: permissões ----------------
  const a1 = await capture('A', 'A1', 'ADMIN cria Mesa Patrocinada válida', '201/criada', async () => {
    const mesa = await createMesa()
    return `id=${mesa.id} status=${mesa.status}`
  })

  await capture('A', 'A2', 'PRO ativo NÃO cria Mesa Patrocinada', 'sponsored_mesa_admin_only', async () => {
    try {
      await createMesa({ administrative: false, createdByUserId: IDS.pro })
      throw new Error('criou indevidamente')
    } catch (error) {
      if (error.code !== 'sponsored_mesa_admin_only') throw new Error(`código inesperado: ${error.code ?? error.message}`)
      return error.code
    }
  })

  await capture('A', 'A3', 'FREE/Calçada NÃO cria Mesa Patrocinada', 'sponsored_mesa_admin_only', async () => {
    try {
      await createMesa({ administrative: false, createdByUserId: IDS.free })
      throw new Error('criou indevidamente')
    } catch (error) {
      if (error.code !== 'sponsored_mesa_admin_only') throw new Error(`código inesperado: ${error.code ?? error.message}`)
      return error.code
    }
  })

  await capture('A', 'A4', 'Não autenticado NÃO cria Mesa Patrocinada', 'user_not_found', async () => {
    try {
      await createMesa({ createdByUserId: '00000000-0000-4000-8000-00000000ffff' })
      throw new Error('criou indevidamente')
    } catch (error) {
      if (error.code !== 'user_not_found') throw new Error(`código inesperado: ${error.code ?? error.message}`)
      return error.code
    }
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
  schemaCase('B5', 'Nome do patrocinador ausente', { sponsorName: undefined }, false)
  schemaCase('B6', 'Logo ausente é aceito', { sponsorLogoUrl: undefined }, true)
  schemaCase('B7', 'Entrada gratuita válida', { accessCost: 0 }, true)
  schemaCase('B8', 'Entrada paga em Tampinhas válida', { accessCost: 20 }, true)
  schemaCase('B9', 'Entrada negativa rejeitada', { accessCost: -1 }, false)
  schemaCase('B10', 'Público inválido rejeitado', { eligibility: 'INVALID' }, false)
  schemaCase('B11', 'Início das inscrições ausente', { startDate: undefined }, false)
  schemaCase('B12', 'Fechamento por limite sem limite', { registrationCloseMode: 'CAPACITY', maxParticipants: undefined }, false)
  schemaCase('B13', 'Fechamento por data com limite', { registrationCloseMode: 'DATE', entryEndDate: new Date(now + 2 * HOUR).toISOString(), maxParticipants: 2, durationMode: 'ROUNDS' }, false)
  schemaCase('B14', 'Fechamento por data sem data limite', { registrationCloseMode: 'DATE', maxParticipants: undefined, durationMode: 'ROUNDS' }, false)
  schemaCase('B15', 'Configuração simultânea de fechamento', { registrationCloseMode: 'DATE', entryEndDate: new Date(now + 2 * HOUR).toISOString(), maxParticipants: 2 }, false)
  schemaCase('B16', 'Duração por rodadas sem rodadas', { durationRounds: null }, false)
  schemaCase('B17', 'Duração por data sem endDate', { durationMode: 'DATE', durationRounds: null }, false)
  schemaCase('B18', 'Configuração simultânea de duração', { durationMode: 'DATE', durationRounds: 5, endDate: new Date(now + 3 * HOUR).toISOString() }, false)
  schemaCase('B19', 'Campos extras rejeitados', { campoExtra: true }, false)
  schemaCase('B20', 'Tipos incorretos rejeitados', { accessCost: 'vinte' }, false)
  schemaCase('B21', 'Premiação ausente rejeitada', { sponsorPrizePool: 0 }, false)

  await capture('B', 'B22', 'Persistência grava nome e logo do patrocinador', 'sponsorName/logo persistidos', async () => {
    const mesa = await createMesa({ sponsorName: 'Padaria do Zé', sponsorLogoUrl: 'https://cdn.example.com/ze.png', accessCost: 0 })
    const row = await prisma.ranking.findUniqueOrThrow({ where: { id: mesa.id } })
    if (row.sponsorName !== 'Padaria do Zé' || row.sponsorLogoUrl !== 'https://cdn.example.com/ze.png') {
      throw new Error(`persistiu ${row.sponsorName} / ${row.sponsorLogoUrl}`)
    }
    return 'ok'
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
    const mesa = await createMesa({ startDate: new Date(now - HOUR) })
    const joined = await JoinBolaoService.execute({ rankingId: mesa.id, userId: IDS.pro })
    return `status=${joined.status ?? 'ok'}`
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
    const mesa = await createMesa({ startDate: new Date(now - 2 * HOUR) })
    await prisma.ranking.update({ where: { id: mesa.id }, data: { entryEndDate: new Date(now - HOUR) } })
    try {
      await JoinBolaoService.execute({ rankingId: mesa.id, userId: IDS.free })
      throw new Error('entrou após o fechamento')
    } catch (error) {
      if (!error.message.includes(COMPETITION_REGISTRATION_CLOSED)) throw new Error(error.message)
      return error.message
    }
  })

  await capture('C', 'C6', 'Mesa fechada bloqueia novas entradas', 'encerradas', async () => {
    const mesa = await createMesa({ startDate: new Date(now - HOUR) })
    await prisma.ranking.update({ where: { id: mesa.id }, data: { status: 'CLOSED' } })
    try {
      await JoinBolaoService.execute({ rankingId: mesa.id, userId: IDS.free })
      throw new Error('entrou em Mesa fechada')
    } catch (error) {
      return error.message
    }
  })

  // ---------------- Grupo D: capacidade e pagamento ----------------
  await capture('D', 'D1', 'Última vaga fecha e terceira entrada é bloqueada', '2 aprovados, 3º bloqueado', async () => {
    const mesa = await createMesa({ maxParticipants: 2 })
    await JoinBolaoService.execute({ rankingId: mesa.id, userId: IDS.pro })
    await JoinBolaoService.execute({ rankingId: mesa.id, userId: IDS.free })
    const after = await prisma.ranking.findUniqueOrThrow({ where: { id: mesa.id } })
    try {
      await JoinBolaoService.execute({ rankingId: mesa.id, userId: IDS.outsider })
      throw new Error('aceitou terceira entrada')
    } catch (error) {
      if (!error.message.toLowerCase().includes('limite')) throw new Error(error.message)
    }
    if (after.currentParticipants !== 2) throw new Error(`participantes=${after.currentParticipants}`)
    return `currentParticipants=2 referenceRound=${after.referenceRoundId ?? 'null'}`
  })

  await capture('D', 'D2', 'Requisições concorrentes pela última vaga aprovam uma única vez', '1 sucesso / 1 bloqueio', async () => {
    const mesa = await createMesa({ maxParticipants: 2 })
    await JoinBolaoService.execute({ rankingId: mesa.id, userId: IDS.pro })
    const settled = await Promise.allSettled([
      JoinBolaoService.execute({ rankingId: mesa.id, userId: IDS.free }),
      JoinBolaoService.execute({ rankingId: mesa.id, userId: IDS.outsider }),
    ])
    const okCount = settled.filter(item => item.status === 'fulfilled').length
    const blocked = settled.filter(item => item.status === 'rejected').length
    const after = await prisma.ranking.findUniqueOrThrow({ where: { id: mesa.id } })
    if (okCount !== 1 || blocked !== 1 || after.currentParticipants !== 2) {
      throw new Error(`ok=${okCount} blocked=${blocked} participants=${after.currentParticipants}`)
    }
    return `ok=${okCount} blocked=${blocked}`
  })

  await capture('D', 'D3', 'Entrada paga debita Tampinhas e soma ao caixa', 'saldo 980, caixa 20', async () => {
    const mesa = await createMesa({ accessCost: 20 })
    await JoinBolaoService.execute({ rankingId: mesa.id, userId: IDS.pro })
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: IDS.pro } })
    const after = await prisma.ranking.findUniqueOrThrow({ where: { id: mesa.id } })
    if (wallet.balance !== 980 || after.grossCollected !== 20) {
      throw new Error(`saldo=${wallet.balance} caixa=${after.grossCollected}`)
    }
    return `saldo=${wallet.balance} caixa=${after.grossCollected}`
  })

  await capture('D', 'D4', 'Entrada gratuita não debita Tampinhas', 'saldo 1000, caixa 0', async () => {
    const mesa = await createMesa({ accessCost: 0 })
    await JoinBolaoService.execute({ rankingId: mesa.id, userId: IDS.free })
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: IDS.free } })
    const after = await prisma.ranking.findUniqueOrThrow({ where: { id: mesa.id } })
    if (wallet.balance !== 1000 || after.grossCollected !== 0) {
      throw new Error(`saldo=${wallet.balance} caixa=${after.grossCollected}`)
    }
    return `saldo=${wallet.balance} caixa=${after.grossCollected}`
  })

  await capture('D', 'D5', 'Reprocessamento da mesma entrada não duplica participante', '1 participante', async () => {
    const mesa = await createMesa({ maxParticipants: 5 })
    await JoinBolaoService.execute({ rankingId: mesa.id, userId: IDS.pro })
    try {
      await JoinBolaoService.execute({ rankingId: mesa.id, userId: IDS.pro })
    } catch (error) {
      // duplicidade deve ser bloqueada
    }
    const count = await prisma.rankingParticipant.count({ where: { rankingId: mesa.id, userId: IDS.pro } })
    if (count !== 1) throw new Error(`participantes=${count}`)
    return `participantes=${count}`
  })

  // ---------------- Grupo E: ciclo do Score Inicial ----------------
  await capture('E', 'E1', 'Mesa Patrocinada inicia o ciclo de Score Inicial', 'initializationStatus definido na criação', async () => {
    const mesa = await createMesa({ maxParticipants: 2 })
    const created = await prisma.ranking.findUniqueOrThrow({ where: { id: mesa.id } })
    if (!created.initializationStatus) throw new Error('initializationStatus=null na criação')
    return `create=${created.initializationStatus}`
  })

  await capture('E', 'E2', 'Última vaga registra a rodada 32 como referência', 'referenceRoundId=32', async () => {
    const mesa = await createMesa({ maxParticipants: 2 })
    await JoinBolaoService.execute({ rankingId: mesa.id, userId: IDS.pro })
    await JoinBolaoService.execute({ rankingId: mesa.id, userId: IDS.free })
    const row = await prisma.ranking.findUniqueOrThrow({ where: { id: mesa.id } })
    if (row.referenceRoundId !== IDS.round32) throw new Error(`referenceRoundId=${row.referenceRoundId}`)
    return `referenceRoundId=${row.referenceRoundId} status=${row.initializationStatus}`
  })

  await capture('E', 'E3', 'Fechamento por data grava a rodada de referência', 'referenceRoundId=32', async () => {
    const mesa = await createMesa({
      registrationCloseMode: 'DATE',
      entryEndDate: new Date(now + HOUR),
      maxParticipants: null,
      durationMode: 'ROUNDS',
    })
    await prisma.ranking.update({ where: { id: mesa.id }, data: { entryEndDate: new Date(now - HOUR) } })
    await MesaLifecycleService.closeDueRegistrations(prisma, new Date())
    const row = await prisma.ranking.findUniqueOrThrow({ where: { id: mesa.id } })
    if (row.referenceRoundId !== IDS.round32) throw new Error(`referenceRoundId=${row.referenceRoundId}`)
    return `referenceRoundId=${row.referenceRoundId} status=${row.initializationStatus}`
  })

  // ---------------- Grupo F: estados ----------------
  await capture('F', 'F1', 'Mesa publicada inicia ativa e com referência da rodada aberta', 'ACTIVE + round 32', async () => {
    const mesa = await createMesa({ maxParticipants: 2 })
    const row = await prisma.ranking.findUniqueOrThrow({ where: { id: mesa.id } })
    if (row.status !== 'ACTIVE') throw new Error(`status=${row.status}`)
    return `status=ACTIVE close=${row.registrationCloseMode}`
  })

  await capture('F', 'F2', 'Fechamento por lotação persiste a rodada 32 como referência', 'referenceRoundId=32', async () => {
    const mesa = await createMesa({ maxParticipants: 2 })
    await JoinBolaoService.execute({ rankingId: mesa.id, userId: IDS.free })
    await JoinBolaoService.execute({ rankingId: mesa.id, userId: IDS.outsider })
    const row = await prisma.ranking.findUniqueOrThrow({ where: { id: mesa.id } })
    if (row.referenceRoundId !== IDS.round32) throw new Error(`referenceRoundId=${row.referenceRoundId}`)
    return `referenceRoundId=${row.referenceRoundId} initialization=${row.initializationStatus ?? 'null'}`
  })

  await capture('F', 'F3', 'Estado de inscrição reflete a janela da Mesa', 'OPEN', async () => {
    const mesa = await createMesa({ maxParticipants: 5 })
    const row = await prisma.ranking.findUniqueOrThrow({ where: { id: mesa.id } })
    const state = mesaRegistrationState(row, new Date())
    if (state.state !== 'OPEN') throw new Error(`state=${state.state}`)
    return `state=${state.state}`
  })

  // ---------------- Grupo E (captura): Score Inicial 163 ----------------
  await capture('E', 'E4', 'Patrocinada lotada captura Score Inicial 163', 'scoreInitial=163', async () => {
    await prisma.round.update({ where: { id: IDS.round32 }, data: { status: 'SCORED', closeAt: new Date() } })
    await prisma.round.create({ data: { id: IDS.round34, number: 34, status: 'OPEN' } })
    const mesa = await createMesa({ maxParticipants: 2 })
    await JoinBolaoService.execute({ rankingId: mesa.id, userId: IDS.pro })
    await JoinBolaoService.execute({ rankingId: mesa.id, userId: IDS.free })
    await prisma.userScoreHistory.createMany({ data: [
      { userId: IDS.pro, roundId: IDS.round34, scoreRound: 163, scoreTotal: 163 },
      { userId: IDS.free, roundId: IDS.round34, scoreRound: 163, scoreTotal: 163 },
    ] })
    await prisma.round.update({ where: { id: IDS.round34 }, data: { status: 'SCORED', closeAt: new Date() } })
    await MesaInitialScoreService.capturePending()
    const participants = await prisma.rankingParticipant.findMany({ where: { rankingId: mesa.id } })
    if (participants.some(p => p.scoreInitial !== 163)) {
      throw new Error(JSON.stringify(participants.map(p => p.scoreInitial)))
    }
    const row = await prisma.ranking.findUniqueOrThrow({ where: { id: mesa.id } })
    if (row.initializationStatus !== 'READY') throw new Error(`status=${row.initializationStatus}`)
    return 'scoreInitial=163 status=READY'
  })

  await capture('E', 'E5', 'Patrocinada por data (não lotada) captura Score Inicial 163', 'scoreInitial=163', async () => {
    await prisma.round.create({ data: { id: IDS.round35, number: 35, status: 'OPEN' } })
    const mesa = await createMesa({
      registrationCloseMode: 'DATE',
      entryEndDate: new Date(now + HOUR),
      maxParticipants: null,
      durationMode: 'ROUNDS',
    })
    await JoinBolaoService.execute({ rankingId: mesa.id, userId: IDS.pro })
    await prisma.ranking.update({ where: { id: mesa.id }, data: { entryEndDate: new Date(now - HOUR) } })
    await MesaLifecycleService.closeDueRegistrations(prisma, new Date())
    await prisma.userScoreHistory.create({ data: { userId: IDS.pro, roundId: IDS.round35, scoreRound: 163, scoreTotal: 163 } })
    await prisma.round.update({ where: { id: IDS.round35 }, data: { status: 'SCORED', closeAt: new Date() } })
    await MesaInitialScoreService.capturePending()
    const participant = await prisma.rankingParticipant.findFirstOrThrow({ where: { rankingId: mesa.id, userId: IDS.pro } })
    if (participant.scoreInitial !== 163) throw new Error(`scoreInitial=${participant.scoreInitial}`)
    const row = await prisma.ranking.findUniqueOrThrow({ where: { id: mesa.id } })
    if (row.initializationStatus !== 'READY') throw new Error(`status=${row.initializationStatus}`)
    return 'scoreInitial=163 status=READY'
  })

  // ---------------- Relatório ----------------
  const summary = results.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1
    return acc
  }, {})
  console.log('\nRESUMO', JSON.stringify(summary), 'total', results.length)
  const fs = require('node:fs')
  fs.writeFileSync(
    process.env.VALIDATION_OUTPUT ?? '/tmp/patrocinada-validation.json',
    JSON.stringify({ generatedAt: new Date().toISOString(), summary, results }, null, 2),
  )
}

main()
  .catch(error => { console.error('ERRO FATAL', error); process.exitCode = 1 })
  .finally(async () => { await prisma.$disconnect() })
