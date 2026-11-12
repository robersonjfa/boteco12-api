import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { logger } from '../../lib/logger'
import {
  DAILY_XP_CAP,
  DEFAULT_PRODUCTION_ACTIVATION,
  DUEL_GAME_RULE_VERSION,
  isDuelGamificationEnabled,
  isValidMatchResult,
  localDayFor,
  unlockedCosmeticsForXp,
  xpDeltaForDay,
} from './duel-gamification.rules'

const BATCH_SIZE = 50
const MAX_ATTEMPTS = 3

type ParticipantResult = {
  userId: string
  delta: number
  reason: string
  localDay: string
}

export class ProcessDuelGamificationService {
  static enabled(): boolean {
    return isDuelGamificationEnabled()
  }

  static paused(): boolean {
    return process.env.DUEL_GAMIFICATION_PAUSED === 'true'
  }

  static activationCut(): Date | null {
    const raw = process.env.DUEL_GAMIFICATION_ACTIVATED_AT
      ?? (process.env.NODE_ENV === 'production' ? DEFAULT_PRODUCTION_ACTIVATION : null)
    if (!raw) return null
    const parsed = new Date(raw)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  static async execute(): Promise<{ enabled: boolean; paused: boolean; processed: number; failed: number }> {
    if (!this.enabled()) return { enabled: false, paused: false, processed: 0, failed: 0 }
    if (this.paused()) return { enabled: true, paused: true, processed: 0, failed: 0 }

    const pending = await prisma.miniDuel.findMany({
      where: { status: 'SETTLED', settledAt: { not: null }, gameReceipt: null },
      orderBy: [{ settledAt: 'asc' }, { id: 'asc' }],
      take: BATCH_SIZE,
      select: { id: true },
    })

    let processed = 0
    let failed = 0
    for (const duel of pending) {
      try {
        await this.processDuel(duel.id)
        processed += 1
      } catch (error) {
        failed += 1
        logger.error(
          { err: error, duelId: duel.id },
          'Duel gamification processing failed; receipt not written'
        )
      }
    }
    return { enabled: true, paused: false, processed, failed }
  }

  private static async processDuel(duelId: string): Promise<void> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        await prisma.$transaction(
          async tx => this.applyInTransaction(tx, duelId),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        )
        return
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < MAX_ATTEMPTS) {
          continue
        }
        throw error
      }
    }
  }

  private static async applyInTransaction(
    tx: Prisma.TransactionClient,
    duelId: string
  ): Promise<void> {
    const existingReceipt = await tx.duelGameReceipt.findUnique({ where: { duelId } })
    if (existingReceipt) return

    const duel = await tx.miniDuel.findUnique({
      where: { id: duelId },
      include: { mini: { include: { matches: { orderBy: { position: 'asc' } } } } },
    })
    if (!duel || duel.status !== 'SETTLED' || !duel.settledAt) return

    const hasValidResult = duel.mini.matches.some(match => isValidMatchResult(match.result))
    const localDay = localDayFor(duel.mini.closeAt)
    const participants = [duel.creatorId, duel.opponentId].filter(
      (userId): userId is string => Boolean(userId)
    )

    const cut = this.activationCut()
    if (cut && duel.mini.closeAt.getTime() < cut.getTime()) {
      const results: ParticipantResult[] = []
      for (const userId of participants) {
        const granted = await tx.duelXpGrant.findUnique({
          where: { userId_miniId: { userId, miniId: duel.miniId } },
        })
        if (!granted) {
          await tx.duelXpGrant.create({
            data: {
              userId,
              miniId: duel.miniId,
              duelId: duel.id,
              delta: 0,
              reason: 'BEFORE_ENROLLMENT',
              localDay,
            },
          })
        }
        results.push({ userId, delta: 0, reason: 'BEFORE_ENROLLMENT', localDay })
      }
      await tx.duelGameReceipt.create({
        data: {
          duelId: duel.id,
          ruleVersion: DUEL_GAME_RULE_VERSION,
          outcome: { participants: results, reason: 'BEFORE_ENROLLMENT' },
        },
      })
      return
    }

    const enrollments = await tx.duelGameEnrollment.findMany({
      where: { userId: { in: participants } },
    })
    const enrollmentByUser = new Map(enrollments.map(item => [item.userId, item]))

    const results: ParticipantResult[] = []
    for (const userId of participants) {
      const granted = await tx.duelXpGrant.findUnique({
        where: { userId_miniId: { userId, miniId: duel.miniId } },
      })
      if (granted) {
        results.push({ userId, delta: granted.delta, reason: 'ALREADY_REWARDED', localDay })
        continue
      }
      const enrollment = enrollmentByUser.get(userId)
      const outsideEnrollment = enrollment && (
        enrollment.startedAt.getTime() > duel.mini.closeAt.getTime() ||
        (enrollment.endedAt != null && enrollment.endedAt.getTime() <= duel.mini.closeAt.getTime())
      )
      if (outsideEnrollment) {
        await tx.duelXpGrant.create({
          data: {
            userId,
            miniId: duel.miniId,
            duelId: duel.id,
            delta: 0,
            reason: 'BEFORE_ENROLLMENT',
            localDay,
          },
        })
        results.push({ userId, delta: 0, reason: 'BEFORE_ENROLLMENT', localDay })
        continue
      }
      if (!hasValidResult) {
        await tx.duelXpGrant.create({
          data: {
            userId,
            miniId: duel.miniId,
            duelId: duel.id,
            delta: 0,
            reason: 'ALL_MATCHES_VOID',
            localDay,
          },
        })
        results.push({ userId, delta: 0, reason: 'ALL_MATCHES_VOID', localDay })
        continue
      }

      const day = await tx.duelXpDay.upsert({
        where: { userId_localDay: { userId, localDay } },
        create: { userId, localDay, xp: 0 },
        update: {},
      })
      const delta = xpDeltaForDay(day.xp)
      const reason = delta > 0 ? 'GRANTED' : 'DAILY_CAP'

      await tx.duelXpGrant.create({
        data: {
          userId,
          miniId: duel.miniId,
          duelId: duel.id,
          delta,
          reason,
          localDay,
        },
      })

      if (delta > 0) {
        await tx.duelXpDay.update({
          where: { userId_localDay: { userId, localDay } },
          data: { xp: { increment: delta } },
        })
        await tx.duelGameProfile.upsert({
          where: { userId },
          create: { userId, xp: delta, titleId: 'title:chegando', frameId: 'frame:padrao' },
          update: { xp: { increment: delta } },
        })
      } else {
        await tx.duelGameProfile.upsert({
          where: { userId },
          create: { userId, xp: 0, titleId: 'title:chegando', frameId: 'frame:padrao' },
          update: {},
        })
      }

      await tx.duelAchievement.upsert({
        where: { userId_code: { userId, code: 'FIRST_DUEL' } },
        create: { userId, code: 'FIRST_DUEL', sourceDuelId: duel.id },
        update: {},
      })
      if (duel.winnerId === userId) {
        await tx.duelAchievement.upsert({
          where: { userId_code: { userId, code: 'FIRST_WIN' } },
          create: { userId, code: 'FIRST_WIN', sourceDuelId: duel.id },
          update: {},
        })
      }

      const prediction = await tx.miniPrediction.findUnique({
        where: { miniId_userId: { miniId: duel.miniId, userId } },
        select: { prediction: true },
      })
      if (prediction) {
        const picks = prediction.prediction.split(',')
        const validMatches = duel.mini.matches.filter(match => isValidMatchResult(match.result))
        const perfect =
          validMatches.length >= 2 &&
          validMatches.every(match => picks[match.position - 1] === match.result)
        if (perfect) {
          await tx.duelAchievement.upsert({
            where: { userId_code: { userId, code: 'NA_MOSCA' } },
            create: { userId, code: 'NA_MOSCA', sourceDuelId: duel.id },
            update: {},
          })
        }
      }

      const settled = await tx.miniDuel.findMany({
        where: { status: 'SETTLED', OR: [{ creatorId: userId }, { opponentId: userId }] },
        select: { creatorId: true, opponentId: true },
      })
      const opponents = new Set(
        settled
          .flatMap(item => [item.creatorId, item.opponentId])
          .filter((id): id is string => Boolean(id) && id !== userId)
      )
      if (opponents.size >= 3) {
        await tx.duelAchievement.upsert({
          where: { userId_code: { userId, code: 'RODOU_O_BOTECO' } },
          create: { userId, code: 'RODOU_O_BOTECO', sourceDuelId: duel.id },
          update: {},
        })
      }

      const profile = await tx.duelGameProfile.findUnique({ where: { userId } })
      for (const itemId of unlockedCosmeticsForXp(profile?.xp ?? 0)) {
        await tx.duelCosmeticUnlock.upsert({
          where: { userId_itemId: { userId, itemId } },
          create: { userId, itemId, source: 'LEVEL' },
          update: {},
        })
      }

      results.push({ userId, delta, reason, localDay })
    }

    await tx.duelGameReceipt.create({
      data: {
        duelId: duel.id,
        ruleVersion: DUEL_GAME_RULE_VERSION,
        outcome: { participants: results, hasValidResult, dailyCap: DAILY_XP_CAP },
      },
    })
  }
}
