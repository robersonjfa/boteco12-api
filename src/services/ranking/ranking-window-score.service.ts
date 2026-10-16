import { MesaInitializationStatus, Prisma } from '@prisma/client'
import { RankingTiebreakService } from './ranking-tiebreak.service'

type RankingScoreClient = Pick<
  Prisma.TransactionClient,
  'rankingParticipant' | 'userScoreHistory'
>

type RankingWindow = {
  id: string
  startDate: Date | null
  endDate: Date | null
  referenceRoundId?: string | null
  referenceRound?: { number: number } | null
  initializationStatus?: MesaInitializationStatus | null
  scoreInitialCapturedAt?: Date | null
}

export type RankingWindowRow = {
  participantId: string
  userId: string
  score: number
  scoreRound: number
  position: number
  scoreInitial: number
  scoreTotalCurrent: number
  superDoubleHits: number
  doubleHits: number
  userCreatedAt: Date
  previousScore: number
  previousPosition: number | null
}

export class RankingWindowScoreService {
  static calculateScoreFromBaseline(
    scoreTotalCurrent: number,
    scoreInitial: number
  ) {
    return scoreTotalCurrent - scoreInitial
  }

  static async getScoreTotalBefore(
    tx: RankingScoreClient,
    userId: string,
    date: Date
  ) {
    const history = await tx.userScoreHistory.findFirst({
      where: { userId, round: { closeAt: { lt: date } } },
      orderBy: [{ round: { closeAt: 'desc' } }, { createdAt: 'desc' }],
      select: { scoreTotal: true },
    })
    if (history) return history.scoreTotal

    // Sem rodada anterior, o acumulado inicial oficial é zero.
    // Usar o scoreTotal vivo aqui faria uma rodada posterior ao início
    // contaminar o baseline da Mesa.
    return 0
  }

  static async buildRows(
    tx: RankingScoreClient,
    ranking: RankingWindow,
    now = new Date()
  ): Promise<RankingWindowRow[]> {
    const participants = await tx.rankingParticipant.findMany({
      where: { rankingId: ranking.id, status: 'APPROVED' },
      select: {
        id: true,
        userId: true,
        score: true,
        scoreInitial: true,
        scoreInitialCapturedAt: true,
        position: true,
        approvedAt: true,
        createdAt: true,
        user: {
          select: {
            scoreTotal: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    })

    if (participants.length === 0) {
      return []
    }

    const referenceLifecycle = Boolean(ranking.referenceRoundId || ranking.initializationStatus)
    if (referenceLifecycle && (
      ranking.initializationStatus !== 'READY' || !ranking.scoreInitialCapturedAt ||
      !ranking.referenceRound || participants.some(p => !p.scoreInitialCapturedAt)
    )) {
      // Não ordenar nem expor pontuação parcial antes da barreira global.
      return participants.map(p => ({
        participantId: p.id, userId: p.userId, score: 0, scoreRound: 0, position: 0,
        scoreInitial: p.scoreInitial, scoreTotalCurrent: p.scoreInitial,
        superDoubleHits: 0, doubleHits: 0, userCreatedAt: p.user.createdAt,
        previousScore: p.score, previousPosition: p.position,
      }))
    }

    const participantIds = participants.map(participant => participant.userId)
    const endDate = ranking.endDate ?? new Date()

    const historyRows = await tx.userScoreHistory.findMany({
      where: {
        userId: { in: participantIds },
        round: {
          ...(referenceLifecycle ? { status: 'SCORED' as const } : {}),
          closeAt: {
            lte: endDate,
          },
        },
      },
      select: {
        userId: true,
        scoreTotal: true,
        scoreRound: true,
        totalDoubles: true,
        totalSuperDoubles: true,
        createdAt: true,
        round: {
          select: { closeAt: true, number: true },
        },
      },
      orderBy: referenceLifecycle ? [{ round: { number: 'desc' } }] : [
        { round: { closeAt: 'desc' } },
        { createdAt: 'desc' },
      ],
    })

    const rows = participants.map(participant => {
      const latestHistory = historyRows.find(row =>
        row.userId === participant.userId &&
        (!referenceLifecycle || row.round.number > ranking.referenceRound!.number)
      )
      const baselineHistory = referenceLifecycle
        ? historyRows.find(row => row.userId === participant.userId &&
            row.round.number <= ranking.referenceRound!.number)
        : ranking.startDate
        ? historyRows.find(row =>
            row.userId === participant.userId &&
            row.round.closeAt != null &&
            row.round.closeAt < ranking.startDate!
          )
        : null
      const joinedBeforeStart = Boolean(
        ranking.startDate &&
        participant.approvedAt &&
        participant.approvedAt < ranking.startDate
      )
      const scoreInitial = !referenceLifecycle && joinedBeforeStart && baselineHistory
        ? baselineHistory.scoreTotal
        : participant.scoreInitial
      const rankingNotStarted = Boolean(ranking.startDate && now < ranking.startDate)
      const rankingEnded = ranking.endDate != null && now > ranking.endDate
      // Após o fim da janela, usar somente o acumulado histórico até endDate.
      // Se não há histórico algum, não houve pontuação a incorporar à Mesa:
      // o total no fechamento permanece igual ao baseline.
      const liveTotal = participant.user?.scoreTotal ?? 0
      const scoreTotalCurrent = referenceLifecycle
        ? latestHistory?.scoreTotal ?? scoreInitial
        : rankingNotStarted
        ? scoreInitial
        : rankingEnded
        ? latestHistory?.scoreTotal ?? scoreInitial
        : liveTotal
      const score = this.calculateScoreFromBaseline(
        scoreTotalCurrent,
        scoreInitial
      )
      const scoreRound =
        latestHistory?.round.closeAt != null &&
        (!ranking.startDate || latestHistory.round.closeAt >= ranking.startDate)
          ? latestHistory.scoreRound
          : 0
      const hits = RankingTiebreakService.calculateWindowHits(
        referenceLifecycle ? latestHistory ?? baselineHistory : latestHistory,
        baselineHistory
      )

      return {
        participantId: participant.id,
        userId: participant.userId,
        score,
        scoreRound,
        position: 0,
        scoreInitial,
        scoreTotalCurrent,
        ...hits,
        userCreatedAt: participant.user.createdAt,
        previousScore: participant.score,
        previousPosition: participant.position,
      }
    })

    return RankingTiebreakService.rank(rows, row => ({
      userId: row.userId,
      scoreRanking: row.score,
      superDoubleHits: row.superDoubleHits,
      doubleHits: row.doubleHits,
      userCreatedAt: row.userCreatedAt,
    }))
  }
}
