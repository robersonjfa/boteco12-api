import {
  MesaCategory,
  MesaDurationMode,
  MesaEligibility,
  MesaRegistrationCloseMode,
} from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { AppError } from '../../errors/AppError'
import { AssertActiveProUserService } from '../subscription/assert-active-pro-user.service'
import { BolaoPrizeService, PrizeDistributionItem } from './bolao-prize.service'
import { BolaoRegistrationWindowService } from './bolao-registration-window.service'
import { MesaCategoryRules } from './mesa-category-rules'
import { withMesaFinancialNames } from './mesa-financial-names'
import { normalizeMesaPrizeRules } from './mesa-prize-rules'

type UpdateMesaInput = {
  rankingId: string
  requestedByUserId: string
  name: string
  description: string
  startDate: Date
  entryEndDate?: Date | null
  endDate: Date | null
  category?: MesaCategory
  accessCost?: number
  entryFee?: number
  sponsorPrizePool?: number
  maxParticipants?: number | null
  eligibility?: MesaEligibility
  registrationCloseMode?: MesaRegistrationCloseMode
  durationMode?: MesaDurationMode
  durationRounds?: number | null
  prizeDistribution: PrizeDistributionItem[]
  administrative?: boolean
}

export class UpdateMesaService {
  static async execute(input: UpdateMesaInput) {
    const mesa = await prisma.ranking.findUnique({
      where: { id: input.rankingId },
      select: { id: true, type: true, status: true, createdByUserId: true },
    })

    if (!mesa || mesa.type !== 'BOLAO') {
      throw AppError.notFound('Mesa', 'mesa_not_found')
    }
    if (!input.administrative && mesa.createdByUserId !== input.requestedByUserId) {
      throw AppError.forbidden('Somente o dono pode editar esta Mesa', 'mesa_update_forbidden')
    }
    if (mesa.status !== 'DRAFT') {
      throw AppError.conflict('Somente Mesas em rascunho podem ser editadas', 'mesa_update_draft_only')
    }

    const terms = MesaCategoryRules.validate({
      category: input.category,
      accessCost: input.accessCost,
      entryFee: input.entryFee,
      sponsorPrizePool: input.sponsorPrizePool,
      maxParticipants: input.maxParticipants,
      registrationCloseMode: input.registrationCloseMode,
    })
    const user = await prisma.user.findUnique({
      where: { id: input.requestedByUserId },
      select: { id: true },
    })
    if (!user) throw AppError.notFound('Usuário', 'user_not_found')
    if (MesaCategoryRules.isSponsored(terms) && !input.administrative) {
      throw AppError.forbidden(
        'Somente administradores podem configurar Mesas Patrocinadas',
        'sponsored_mesa_admin_only'
      )
    }
    if (MesaCategoryRules.isPaid(terms) && !input.administrative) {
      await AssertActiveProUserService.execute(input.requestedByUserId)
    }

    const name = input.name.trim()
    const description = MesaCategoryRules.isFree(terms)
      ? input.description.trim()
      : normalizeMesaPrizeRules(input.description)
    if (name.length < 3) throw AppError.badRequest('O nome da Mesa deve ter pelo menos 3 caracteres')
    if (input.entryEndDate && input.entryEndDate <= input.startDate) {
      throw AppError.badRequest('O fechamento das inscrições deve ser posterior ao início')
    }
    if (input.endDate && input.endDate <= (input.entryEndDate ?? input.startDate)) {
      throw AppError.badRequest('A data de fim deve ser posterior às inscrições')
    }

    try {
      BolaoRegistrationWindowService.assertNotClosed({
        startDate: input.startDate,
        endDate: input.endDate,
      })
    } catch (error) {
      throw AppError.badRequest(
        error instanceof Error ? error.message : 'As inscrições para esta competição foram encerradas.',
        'mesa_registration_closed'
      )
    }

    const prizeDistribution = MesaCategoryRules.isFree(terms)
      ? []
      : BolaoPrizeService.validateDistribution(input.prizeDistribution)
    const durationDays = input.endDate
      ? Math.ceil((input.endDate.getTime() - input.startDate.getTime()) / (1000 * 60 * 60 * 24))
      : null
    const emptyPool = BolaoPrizeService.calculatePool(0)

    const result = await prisma.$transaction(async tx => {
      const mutation = await tx.ranking.updateMany({
        where: {
          id: input.rankingId,
          type: 'BOLAO',
          status: 'DRAFT',
          ...(input.administrative ? {} : { createdByUserId: input.requestedByUserId }),
        },
        data: {
          name,
          description,
          category: terms.category,
          entryFee: terms.accessCost,
          accessCost: terms.accessCost,
          sponsorPrizePool: terms.sponsorPrizePool,
          maxParticipants: terms.maxParticipants,
          eligibility: input.eligibility ?? MesaEligibility.SUBSCRIBERS_ONLY,
          registrationCloseMode: input.registrationCloseMode ?? MesaRegistrationCloseMode.CAPACITY,
          durationMode: input.durationMode ?? MesaDurationMode.DATE,
          durationRounds: input.durationRounds ?? null,
          durationDays,
          prizeDistribution,
          ...emptyPool,
          prizePool: MesaCategoryRules.isSponsored(terms) ? terms.sponsorPrizePool : emptyPool.prizePool,
          rewardPool: MesaCategoryRules.isSponsored(terms) ? terms.sponsorPrizePool : emptyPool.prizePool,
          startDate: input.startDate,
          entryEndDate: input.entryEndDate ?? null,
          endDate: input.endDate,
        },
      })
      if (mutation.count !== 1) {
        throw AppError.conflict(
          'A Mesa deixou de ser um rascunho antes das alterações serem salvas',
          'mesa_update_draft_only'
        )
      }

      await tx.auditLog.create({
        data: {
          userId: input.requestedByUserId,
          action: 'BOLAO_UPDATED',
          entity: 'RANKING',
          entityId: input.rankingId,
          metadata: {
            name,
            description,
            category: terms.category,
            accessCost: terms.accessCost,
            sponsorPrizePool: terms.sponsorPrizePool,
            maxParticipants: terms.maxParticipants,
            eligibility: input.eligibility ?? MesaEligibility.SUBSCRIBERS_ONLY,
            registrationCloseMode: input.registrationCloseMode ?? MesaRegistrationCloseMode.CAPACITY,
            durationMode: input.durationMode ?? MesaDurationMode.DATE,
            durationRounds: input.durationRounds ?? null,
            prizeDistribution,
            startDate: input.startDate.toISOString(),
            entryEndDate: input.entryEndDate?.toISOString() ?? null,
            endDate: input.endDate?.toISOString() ?? null,
          },
        },
      })
      return tx.ranking.findUniqueOrThrow({ where: { id: input.rankingId } })
    })

    return withMesaFinancialNames({
      id: result.id,
      name: result.name,
      status: result.status,
      category: result.category,
      entryFee: result.entryFee,
      accessCost: result.accessCost,
      sponsorPrizePool: result.sponsorPrizePool,
      maxParticipants: result.maxParticipants,
      currentParticipants: result.currentParticipants,
      startDate: result.startDate,
      entryEndDate: result.entryEndDate,
      endDate: result.endDate,
      prizeDistribution: result.prizeDistribution,
      grossCollected: result.grossCollected,
      platformFee: result.platformFee,
      prizePool: result.prizePool,
      rewardPool: result.rewardPool,
      settledAt: result.settledAt,
    })
  }
}
