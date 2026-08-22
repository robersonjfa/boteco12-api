import { prisma } from '../../lib/prisma'
import { RankingType } from '@prisma/client'
import { withMesaFinancialNames } from './mesa-financial-names'

/**
 * Lista todas as Mesas em que o usuário participa, junto com sua posição
 * atual e o total de participantes.
 *
 * Mesas só são consideradas aquelas com `type === BOLAO`.
 */
export class ListUserBoloesService {
  static async execute({ userId }: { userId: string }) {
    const [participations, ownedMesas] = await Promise.all([
      prisma.rankingParticipant.findMany({
      where: {
        userId,
        status: 'APPROVED',
        ranking: { type: RankingType.BOLAO },
      },
      include: {
        ranking: {
          select: {
            id: true,
            name: true,
            description: true,
            status: true,
            entryFee: true,
            accessCost: true,
            category: true,
            eligibility: true,
            registrationCloseMode: true,
            durationMode: true,
            durationRounds: true,
            sponsorPrizePool: true,
            prizeDistribution: true,
            grossCollected: true,
            platformFee: true,
            prizePool: true,
            rewardPool: true,
            settledAt: true,
            startDate: true,
            entryEndDate: true,
            endDate: true,
            currentParticipants: true,
            maxParticipants: true,
            createdByUserId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      }),
      prisma.ranking.findMany({
        where: { type: RankingType.BOLAO, createdByUserId: userId },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    const participating = participations.map(p => withMesaFinancialNames({
      id: p.ranking.id,
      name: p.ranking.name,
      description: p.ranking.description,
      status: p.ranking.status,
      entryFee: p.ranking.entryFee,
      accessCost: p.ranking.accessCost,
      category: p.ranking.category,
      eligibility: p.ranking.eligibility,
      registrationCloseMode: p.ranking.registrationCloseMode,
      durationMode: p.ranking.durationMode,
      durationRounds: p.ranking.durationRounds,
      sponsorPrizePool: p.ranking.sponsorPrizePool,
      prizeDistribution: p.ranking.prizeDistribution,
      grossCollected: p.ranking.grossCollected,
      platformFee: p.ranking.platformFee,
      prizePool: p.ranking.prizePool,
      rewardPool: p.ranking.rewardPool,
      settledAt: p.ranking.settledAt,
      startDate: p.ranking.startDate,
      entryEndDate: p.ranking.entryEndDate,
      endDate: p.ranking.endDate,
      participants: p.ranking.currentParticipants,
      maxParticipants: p.ranking.maxParticipants,
      isOwner: p.ranking.createdByUserId === userId,
      myPosition: p.position,
      myScore: p.score,
    }))

    const participatingIds = new Set(participating.map(item => item.id))
    const owned = ownedMesas
      .filter(mesa => !participatingIds.has(mesa.id))
      .map(mesa => withMesaFinancialNames({
        id: mesa.id,
        name: mesa.name,
        description: mesa.description,
        status: mesa.status,
        entryFee: mesa.entryFee,
        accessCost: mesa.accessCost,
        category: mesa.category,
        eligibility: mesa.eligibility,
        registrationCloseMode: mesa.registrationCloseMode,
        durationMode: mesa.durationMode,
        durationRounds: mesa.durationRounds,
        sponsorPrizePool: mesa.sponsorPrizePool,
        prizeDistribution: mesa.prizeDistribution,
        grossCollected: mesa.grossCollected,
        platformFee: mesa.platformFee,
        prizePool: mesa.prizePool,
        rewardPool: mesa.rewardPool,
        settledAt: mesa.settledAt,
        startDate: mesa.startDate,
        entryEndDate: mesa.entryEndDate,
        endDate: mesa.endDate,
        participants: mesa.currentParticipants,
        maxParticipants: mesa.maxParticipants,
        isOwner: true,
        myPosition: null,
        myScore: 0,
      }))

    return [...owned, ...participating]
  }
}
