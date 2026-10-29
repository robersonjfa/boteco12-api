import { RankingType, RoundStatus } from '@prisma/client'
import { hasActiveProSubscriptionAt } from '../../domain/subscription'
import { prisma } from '../../lib/prisma'
import { SaoPauloPeriodService } from '../time/sao-paulo-period.service'

type EnsureMonthlyRankingsInput = {
  periodRef: string
  now?: Date
}

export class EnsureMonthlyRankingsService {
  static async execute({
    periodRef,
    now = new Date(),
  }: EnsureMonthlyRankingsInput) {
    const { start, end } = SaoPauloPeriodService.parse(periodRef)
    const endDate = new Date(end.getTime() - 1)

    return prisma.$transaction(async tx => {
      const firstRound = await tx.round.findFirst({
        where: {
          closeAt: { gte: start, lt: end },
        },
        orderBy: [{ closeAt: 'asc' }, { number: 'asc' }],
        select: {
          id: true,
          number: true,
          status: true,
          closeAt: true,
        },
      })

      const definitions = [
        {
          id: `monthly-GLOBAL-${periodRef}`,
          name: `Ranking Geral Mensal ${periodRef}`,
          type: RankingType.GLOBAL,
        },
        {
          id: `monthly-PRO-${periodRef}`,
          name: `Ranking PRO Mensal ${periodRef}`,
          type: RankingType.PRO,
        },
      ] as const

      const rankings: Array<{ id: string; type: RankingType }> = []
      for (const definition of definitions) {
        const ranking = await tx.ranking.upsert({
          where: {
            type_periodRef: {
              type: definition.type,
              periodRef,
            },
          },
          update: {
            startDate: start,
            endDate,
          },
          create: {
            id: definition.id,
            name: definition.name,
            type: definition.type,
            status: 'ACTIVE',
            periodRef,
            startDate: start,
            endDate,
          },
        })
        rankings.push(ranking)
      }

      if (!firstRound?.closeAt) {
        return {
          periodRef,
          registrationOpen: false,
          firstRoundId: null,
          generalAdded: 0,
          proAdded: 0,
        }
      }

      for (const ranking of rankings) {
        await tx.rankingRound.upsert({
          where: {
            rankingId_roundId: {
              rankingId: ranking.id,
              roundId: firstRound.id,
            },
          },
          update: {},
          create: {
            rankingId: ranking.id,
            roundId: firstRound.id,
          },
        })
      }

      const closedStatuses: RoundStatus[] = [
        RoundStatus.CLOSED,
        RoundStatus.SCORED,
        RoundStatus.CANCELLED,
      ]
      const registrationOpen =
        !closedStatuses.includes(firstRound.status) && firstRound.closeAt > now
      // O ciclo comeca quando a rodada de referencia fecha. A elegibilidade PRO
      // e o Score Inicial sao definidos nesse instante, nao no dia 1.
      const proEligibilityDate = firstRound.closeAt
      const referenceScored = firstRound.status === RoundStatus.SCORED
      const cutoff = registrationOpen ? now : proEligibilityDate

      const users = await tx.user.findMany({
        where: {
          createdAt: { lt: cutoff },
        },
        select: {
          id: true,
          scoreTotal: true,
          createdAt: true,
          subscription: {
            select: {
              status: true,
              startAt: true,
              endAt: true,
            },
          },
        },
      })

      const generalUsers = users
      const proUsers = users.filter(user =>
        user.createdAt <= proEligibilityDate
        && hasActiveProSubscriptionAt(user.subscription, registrationOpen ? now : proEligibilityDate)
      )

      const generalResult = await tx.rankingParticipant.createMany({
        data: generalUsers.map(user => ({
          rankingId: rankings[0].id,
          userId: user.id,
          scoreInitial: 0,
          score: 0,
          status: 'APPROVED' as const,
          approvedAt: now,
        })),
        skipDuplicates: true,
      })
      const proResult = await tx.rankingParticipant.createMany({
        data: proUsers.map(user => ({
          rankingId: rankings[1].id,
          userId: user.id,
          scoreInitial: 0,
          score: 0,
          status: 'APPROVED' as const,
          approvedAt: now,
        })),
        skipDuplicates: true,
      })

      let proRemoved = 0
      let initialCaptured = 0

      if (referenceScored) {
        // Reconcile da coorte PRO no fechamento da referencia: quem perdeu a
        // elegibilidade antes sai; quem assinou antes do fechamento entra.
        const eligiblePro = users.filter(user =>
          user.createdAt <= proEligibilityDate
          && hasActiveProSubscriptionAt(user.subscription, proEligibilityDate)
        )
        const eligibleIds = eligiblePro.map(user => user.id)
        const removed = await tx.rankingParticipant.deleteMany({
          where: {
            rankingId: rankings[1].id,
            userId: { notIn: eligibleIds },
            score: 0,
            scoreInitialCapturedAt: null,
          },
        })
        proRemoved = removed.count
        await tx.rankingParticipant.createMany({
          data: eligiblePro.map(user => ({
            rankingId: rankings[1].id,
            userId: user.id,
            scoreInitial: 0,
            score: 0,
            status: 'APPROVED' as const,
            approvedAt: now,
          })),
          skipDuplicates: true,
        })

        // Captura do Score Inicial somente depois da consolidacao oficial da
        // rodada de referencia. Idempotente por scoreInitialCapturedAt.
        const pending = await tx.rankingParticipant.findMany({
          where: {
            rankingId: { in: rankings.map(ranking => ranking.id) },
            scoreInitialCapturedAt: null,
          },
          select: { id: true, userId: true },
        })
        if (pending.length > 0) {
          const histories = await tx.userScoreHistory.findMany({
            where: {
              userId: { in: [...new Set(pending.map(item => item.userId))] },
              round: {
                number: { lte: firstRound.number },
                status: 'SCORED',
              },
            },
            orderBy: [
              { round: { number: 'desc' } },
              { createdAt: 'desc' },
            ],
            select: { userId: true, scoreTotal: true },
          })
          const baseline = new Map<string, number>()
          for (const history of histories) {
            if (!baseline.has(history.userId)) {
              baseline.set(history.userId, history.scoreTotal)
            }
          }
          for (const participant of pending) {
            const captured = await tx.rankingParticipant.updateMany({
              where: { id: participant.id, scoreInitialCapturedAt: null },
              data: {
                scoreInitial: baseline.get(participant.userId) ?? 0,
                scoreInitialCapturedAt: now,
              },
            })
            initialCaptured += captured.count
          }
        }
      }

      if (generalResult.count > 0 || proResult.count > 0 || proRemoved > 0 || initialCaptured > 0) {
        await tx.auditLog.create({
          data: {
            action: 'MONTHLY_RANKINGS_SYNCHRONIZED',
            entity: 'RANKING',
            entityId: rankings[0].id,
            metadata: {
              periodRef,
              firstRoundId: firstRound.id,
              registrationOpen,
              referenceScored,
              proEligibilityDate: proEligibilityDate.toISOString(),
              generalAdded: generalResult.count,
              proAdded: proResult.count,
              proRemoved,
              initialCaptured,
            },
          },
        })
      }

      return {
        periodRef,
        registrationOpen,
        firstRoundId: firstRound.id,
        generalAdded: generalResult.count,
        proAdded: proResult.count,
      }
    })
  }
}
