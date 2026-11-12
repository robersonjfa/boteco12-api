import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { AppError } from '../../errors/AppError'
import { gameSummariesForUsers } from '../duel-gamification/duel-gamification-summary.service'
import { recordDuelGameEvent } from '../duel-gamification/duel-gamification-events.service'
import { isDuelGamificationEnabled, levelForXp, localDayFor } from '../duel-gamification/duel-gamification.rules'
import { WalletService } from '../wallet/wallet.service'
import { CalculateTicketScoreService } from '../score/calculate-ticket-score.service'
import { RankingTiebreakService } from '../ranking/ranking-tiebreak.service'

type Tx = Prisma.TransactionClient
type MatchInput = { homeTeam: string; awayTeam: string; matchTime: Date }
const miniInclude = { matches: { orderBy: { position: 'asc' as const } } }
const people = { select: { id: true, name: true, nickname: true } }
const duelInclude = { creator: people, opponent: people, recipient: people, mini: { include: miniInclude } }
function requireOpen(mini: { status: string; closeAt: Date }) {
  if (mini.status !== 'OPEN' || mini.closeAt.getTime() <= Date.now()) throw AppError.conflict('Participações encerradas para esta mini', 'mini_closed')
}
async function lockMini(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM mini_rounds WHERE id = ${id} FOR UPDATE`
  const mini = await tx.miniRound.findUnique({ where: { id }, include: miniInclude })
  if (!mini) throw AppError.notFound('Mini rodada')
  return mini
}
async function credit(tx: Tx, duelId: string, userId: string, amount: number, reason: string) {
  // State transition and ledger entry share the same transaction/mini lock.
  const wallet = await tx.wallet.upsert({ where: { userId }, create: { userId, balance: amount }, update: { balance: { increment: amount } } })
  await tx.walletLedger.create({ data: { walletId: wallet.id, type: 'CREDIT', amount, description: `Duelo ${duelId}: ${reason}`, idempotencyKey: `mini:${duelId}:${userId}:${reason}` } })
}

export function miniScore(prediction: string, results: string[], user: { id: string; createdAt: Date }) {
  // Reuse the official simple-pick scoring without touching benefits or rankings.
  // Padding cancelled fixtures allows the existing 12-fixture scorer to be canonical.
  const picks = prediction.split(',')
  const pad = 12 - results.length
  const score = new CalculateTicketScoreService().detail([...picks, ...Array(pad).fill('1')].join(','), [...results, ...Array(pad).fill('C')].join(','), Array(12).fill(1))
  return { userId: user.id, scoreRanking: score.total, superDoubleHits: score.superDoubleHits, doubleHits: score.doubleHits, userCreatedAt: user.createdAt }
}

export class MiniService {
  static async create(name: string, matches: MatchInput[], adminId: string) {
    if (matches.length < 2 || matches.length > 3) throw AppError.badRequest('A mini precisa de 2 ou 3 jogos')
    const closeAt = new Date(Math.min(...matches.map(m => m.matchTime.getTime())) - 3_600_000)
    if (!Number.isFinite(closeAt.getTime()) || closeAt.getTime() <= Date.now()) throw AppError.badRequest('O primeiro jogo precisa começar em mais de uma hora')
    return prisma.$transaction(async tx => {
      const mini = await tx.miniRound.create({ data: { name, closeAt, matches: { create: matches.map((m, position) => ({ ...m, position })) } }, include: miniInclude })
      await tx.auditLog.create({ data: { userId: adminId, action: 'MINI_CREATED', entity: 'MINI', entityId: mini.id } })
      return mini
    })
  }

  static async publish(id: string, adminId: string) {
    return prisma.$transaction(async tx => {
      const mini = await lockMini(tx, id)
      if (mini.status !== 'DRAFT' || mini.closeAt.getTime() <= Date.now()) throw AppError.conflict('Mini indisponível para publicação')
      await tx.auditLog.create({ data: { userId: adminId, action: 'MINI_PUBLISHED', entity: 'MINI', entityId: id } })
      return tx.miniRound.update({ where: { id }, data: { status: 'OPEN' } })
    })
  }

  static async list(userId: string, admin: boolean, page: number) {
    const where = admin ? {} : { status: { not: 'DRAFT' } }
    const [minis, total] = await Promise.all([
      prisma.miniRound.findMany({ where, include: { ...miniInclude, predictions: { where: { userId }, select: { prediction: true } } }, orderBy: { createdAt: 'desc' }, take: 20, skip: (page - 1) * 20 }),
      prisma.miniRound.count({ where }),
    ])
    return { minis, total, page, limit: 20 }
  }

  static async savePrediction(id: string, userId: string, picks: string[]) {
    return prisma.$transaction(async tx => {
      const mini = await lockMini(tx, id)
      requireOpen(mini)
      if (picks.length !== mini.matches.length || picks.some(p => !['1', 'X', '2'].includes(p))) throw AppError.badRequest('Preencha todos os jogos com 1, X ou 2')
      if (await tx.miniPrediction.findUnique({ where: { miniId_userId: { miniId: id, userId } } })) throw AppError.conflict('Palpites já salvos. Não é permitido alterar.', 'mini_prediction_immutable')
      return tx.miniPrediction.create({ data: { miniId: id, userId, prediction: picks.join(',') } })
    })
  }

  static async createDuel(miniId: string, creatorId: string, amount: number, recipientId?: string, requestKey?: string) {
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1_073_741_823) throw AppError.badRequest('Informe um valor positivo de tampinhas')
    const duel = await prisma.$transaction(async tx => {
      const mini = await lockMini(tx, miniId)
      if (requestKey) {
        const existing = await tx.miniDuel.findUnique({ where: { requestKey } })
        if (existing) {
          if (existing.creatorId !== creatorId || existing.miniId !== miniId || existing.amount !== amount || existing.recipientId !== (recipientId ?? null)) throw AppError.conflict('Identificador já usado em outro desafio')
          return existing
        }
      }
      requireOpen(mini)
      if (!await tx.miniPrediction.findUnique({ where: { miniId_userId: { miniId, userId: creatorId } } })) throw AppError.badRequest('Salve seus palpites antes de criar o duelo')
      if (recipientId) {
        if (recipientId === creatorId) throw AppError.badRequest('Convide outro usuário')
        const recipient = await tx.user.findFirst({ where: { id: recipientId, adminBlockedAt: null } })
        if (!recipient) throw AppError.notFound('Adversário')
      }
      const duel = await tx.miniDuel.create({ data: { miniId, creatorId, recipientId, amount, ...(requestKey ? { requestKey } : {}) } })
      await WalletService.debit(creatorId, amount, `Duelo ${duel.id}: reserva`, tx)
      return duel
    })
    await recordDuelGameEvent({
      name: 'duel_created',
      dedupeKey: `duel:created:${duel.id}`,
      userId: creatorId,
      duelId: duel.id,
      miniId,
      metadata: { amount, hasRecipient: Boolean(recipientId) },
    })
    return duel
  }

  static async accept(id: string, userId: string) {
    const ref = await prisma.miniDuel.findUnique({ where: { id } })
    if (!ref) throw AppError.notFound('Duelo')
    const duel = await prisma.$transaction(async tx => {
      const mini = await lockMini(tx, ref.miniId)
      requireOpen(mini)
      const duel = await tx.miniDuel.findUniqueOrThrow({ where: { id } })
      if (duel.creatorId === userId || (duel.recipientId && duel.recipientId !== userId)) throw AppError.forbidden('Este desafio não está disponível para você')
      if (duel.status === 'CONFIRMED' && duel.opponentId === userId) return duel
      if (duel.status !== 'WAITING') throw AppError.conflict('Duelo já aceito ou encerrado')
      if (!await tx.miniPrediction.findUnique({ where: { miniId_userId: { miniId: mini.id, userId } } })) throw AppError.badRequest('Salve seus palpites antes de aceitar')
      await WalletService.debit(userId, duel.amount, `Duelo ${id}: reserva`, tx)
      return tx.miniDuel.update({ where: { id }, data: { opponentId: userId, status: 'CONFIRMED' } })
    })
    await recordDuelGameEvent({
      name: 'duel_accepted',
      dedupeKey: `duel:accepted:${duel.id}`,
      userId,
      duelId: duel.id,
      miniId: duel.miniId,
      metadata: { amount: duel.amount },
    })
    return duel
  }

  static async cancel(id: string, userId: string) {
    const ref = await prisma.miniDuel.findUnique({ where: { id } })
    if (!ref) throw AppError.notFound('Duelo')
    return prisma.$transaction(async tx => {
      await lockMini(tx, ref.miniId)
      const duel = await tx.miniDuel.findUniqueOrThrow({ where: { id } })
      if (duel.creatorId !== userId) throw AppError.forbidden()
      if (['CANCELLED', 'EXPIRED'].includes(duel.status)) return duel
      if (duel.status !== 'WAITING') throw AppError.conflict('Não é possível cancelar após o aceite')
      await credit(tx, id, userId, duel.amount, 'devolução')
      return tx.miniDuel.update({ where: { id }, data: { status: 'CANCELLED', settledAt: new Date() } })
    })
  }

  static async duels(userId: string, mode: 'mine' | 'public', page: number) {
    const where: Prisma.MiniDuelWhereInput = mode === 'mine'
      ? { OR: [{ creatorId: userId }, { opponentId: userId }, { recipientId: userId }] }
      : { status: 'WAITING', recipientId: null, creatorId: { not: userId }, mini: { status: 'OPEN', closeAt: { gt: new Date() } } }
    const [duels, total] = await Promise.all([
      prisma.miniDuel.findMany({ where, include: duelInclude, orderBy: { createdAt: 'desc' }, take: 20, skip: (page - 1) * 20 }),
      prisma.miniDuel.count({ where }),
    ])
    const summaries = await gameSummariesForUsers(
      duels.flatMap(duel => [duel.creatorId, duel.opponentId, duel.recipientId])
    )
    return {
      duels: duels.map(duel => ({
        ...duel,
        creatorGame: summaries.get(duel.creatorId) ?? null,
        opponentGame: duel.opponentId ? summaries.get(duel.opponentId) ?? null : null,
      })),
      total,
      page,
      limit: 20,
    }
  }

  static async detail(id: string, userId: string) {
    const duel = await prisma.miniDuel.findUnique({ where: { id }, include: {
      ...duelInclude,
      mini: { include: { ...miniInclude, predictions: { where: { userId }, select: { prediction: true } } } },
    } })
    if (!duel) throw AppError.notFound('Duelo')
    const participant = duel.creatorId === userId || duel.opponentId === userId || duel.recipientId === userId
    if (!participant && duel.recipientId) throw AppError.notFound('Duelo')
    const reveal = participant && duel.mini.closeAt.getTime() <= Date.now()
    const predictions = reveal ? await prisma.miniPrediction.findMany({ where: { miniId: duel.miniId, userId: { in: [duel.creatorId, duel.opponentId ?? ''] } }, select: { userId: true, prediction: true } }) : []
    const summaries = await gameSummariesForUsers([duel.creatorId, duel.opponentId, duel.recipientId])
    let game = null
    if (isDuelGamificationEnabled()) {
      const [grant, achievements, profile] = await Promise.all([
        prisma.duelXpGrant.findUnique({ where: { userId_miniId: { userId, miniId: duel.miniId } } }),
        prisma.duelAchievement.findMany({ where: { userId, sourceDuelId: duel.id }, select: { code: true } }),
        prisma.duelGameProfile.findUnique({ where: { userId }, select: { xp: true } }),
      ])
      const xp = profile?.xp ?? 0
      const level = levelForXp(xp)
      game = {
        xpDelta: grant?.delta ?? 0,
        reason: grant?.reason ?? 'PENDING',
        level: { id: level.id, name: level.name, minXp: level.minXp },
        achievements: achievements.map(item => item.code),
      }
    }
    void recordDuelGameEvent({
      name: 'duel_detail_opened',
      dedupeKey: `duel:detail:${duel.id}:${userId}:${localDayFor(new Date())}`,
      userId,
      duelId: duel.id,
      miniId: duel.miniId,
      metadata: { participant },
    })
    return {
      ...duel,
      predictions,
      creatorGame: summaries.get(duel.creatorId) ?? null,
      opponentGame: duel.opponentId ? summaries.get(duel.opponentId) ?? null : null,
      game,
    }
  }

  static async confirm(id: string, results: string[], adminId: string) {
    await prisma.$transaction(async tx => {
      const mini = await lockMini(tx, id)
      if (mini.confirmedAt) return // Immutable official result; settlement can be retried.
      if (mini.status !== 'OPEN' || mini.closeAt.getTime() > Date.now()) throw AppError.conflict('Aguarde o fechamento da mini')
      if (results.length !== mini.matches.length || results.some(r => !['1', 'X', '2', 'C'].includes(r))) throw AppError.badRequest('Confirme o resultado de todos os jogos')
      if (mini.matches.some((m, i) => results[i] !== 'C' && m.matchTime.getTime() > Date.now())) throw AppError.badRequest('Não é possível confirmar resultado antes do início da partida')
      for (const [i, match] of mini.matches.entries()) await tx.miniMatch.update({ where: { id: match.id }, data: { result: results[i] } })
      await tx.miniRound.update({ where: { id }, data: { confirmedAt: new Date(), confirmedBy: adminId, status: 'CONFIRMED' } })
      await tx.auditLog.create({ data: { userId: adminId, action: 'MINI_RESULTS_CONFIRMED', entity: 'MINI', entityId: id, metadata: { results } } })
    })
    await this.reconcile(id)
    return prisma.miniRound.findUnique({ where: { id }, include: miniInclude })
  }

  static async reconcile(miniId?: string) {
    const duels = await prisma.miniDuel.findMany({ where: { ...(miniId ? { miniId } : {}), OR: [{ status: 'WAITING', mini: { closeAt: { lte: new Date() } } }, { status: 'CONFIRMED', mini: { confirmedAt: { not: null } } }] }, select: { id: true, miniId: true }, take: 500, orderBy: { createdAt: 'asc' } })
    for (const ref of duels) {
      const outcomes: Array<{ kind: 'settled' | 'expired'; id: string; amount: number }> = []
      await prisma.$transaction(async tx => {
        const mini = await lockMini(tx, ref.miniId)
        const duel = await tx.miniDuel.findUniqueOrThrow({ where: { id: ref.id } })
        if (duel.status === 'WAITING' && mini.closeAt.getTime() <= Date.now()) {
          await credit(tx, duel.id, duel.creatorId, duel.amount, 'devolução')
          await tx.miniDuel.update({ where: { id: duel.id }, data: { status: 'EXPIRED', settledAt: new Date() } })
          outcomes.push({ kind: 'expired', id: duel.id, amount: duel.amount })
        } else if (duel.status === 'CONFIRMED' && mini.confirmedAt && duel.opponentId) {
          const users = await tx.user.findMany({ where: { id: { in: [duel.creatorId, duel.opponentId] } }, select: { id: true, createdAt: true } })
          const predictions = await tx.miniPrediction.findMany({ where: { miniId: mini.id, userId: { in: users.map(u => u.id) } } })
          const metrics = [duel.creatorId, duel.opponentId].map(id => miniScore(predictions.find(p => p.userId === id)!.prediction, mini.matches.map(m => m.result!), users.find(u => u.id === id)!))
          const tied = RankingTiebreakService.sameOfficialPosition(metrics[0], metrics[1])
          const winnerId = tied ? null : RankingTiebreakService.compare(metrics[0], metrics[1]) < 0 ? duel.creatorId : duel.opponentId
          if (winnerId) await credit(tx, duel.id, winnerId, duel.amount * 2, 'prêmio')
          else for (const id of [duel.creatorId, duel.opponentId].sort()) await credit(tx, duel.id, id, duel.amount, 'devolução')
          await tx.miniDuel.update({ where: { id: duel.id }, data: { status: 'SETTLED', winnerId, settledAt: new Date(), settlement: { metrics: metrics.map(m => ({ ...m, userCreatedAt: m.userCreatedAt.toISOString() })), reason: tied ? 'Empate em todos os critérios' : metrics[0].scoreRanking !== metrics[1].scoreRanking ? 'Maior pontuação' : 'Critérios oficiais: Super Duplas, Duplas e cadastro mais antigo', ruleVersion: 'simple-v1/tiebreak-v2' } } })
          outcomes.push({ kind: 'settled', id: duel.id, amount: duel.amount })
        }
      }, { timeout: 15000 })
      for (const outcome of outcomes) {
        await recordDuelGameEvent({
          name: outcome.kind === 'settled' ? 'duel_settled' : 'duel_expired',
          dedupeKey: `duel:${outcome.kind === 'settled' ? 'settled' : 'expired'}:${outcome.id}`,
          duelId: outcome.id,
          miniId: ref.miniId,
          metadata: { amount: outcome.amount },
        })
      }
    }
    return { processed: duels.length }
  }

  static async balance(userId: string) {
    const [wallet, reservations] = await Promise.all([
      prisma.wallet.findUnique({ where: { userId } }),
      prisma.miniDuel.aggregate({ where: { status: { in: ['WAITING', 'CONFIRMED'] }, OR: [{ creatorId: userId }, { opponentId: userId }] }, _sum: { amount: true } }),
    ])
    return { available: wallet?.balance ?? 0, reserved: reservations._sum.amount ?? 0 }
  }
}
