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
import { assertMesaScheduleRules } from './mesa-schedule-rules'

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
  publicationMode?: 'DRAFT' | 'NOW' | 'AT_START'
}

export class UpdateMesaService {
  static async execute(input: UpdateMesaInput) {
    const mesa = await prisma.ranking.findUnique({
      where: { id: input.rankingId },
      select: {
        id: true,
        type: true,
        status: true,
        createdByUserId: true,
        category: true,
        accessCost: true,
        sponsorPrizePool: true,
        prizeDistribution: true,
        currentParticipants: true,
        grossCollected: true,
        settledAt: true,
        publishedAt: true,
      },
    })

    if (!mesa || mesa.type !== 'BOLAO') {
      throw AppError.notFound('Mesa', 'mesa_not_found')
    }
    if (!input.administrative && mesa.createdByUserId !== input.requestedByUserId) {
      throw AppError.forbidden('Somente o dono pode editar esta Mesa', 'mesa_update_forbidden')
    }
    if (!input.administrative && mesa.status !== 'DRAFT') {
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
    assertMesaScheduleRules({
      registrationCloseMode: input.registrationCloseMode,
      durationMode: input.durationMode,
      entryEndDate: input.entryEndDate,
      endDate: input.endDate,
      maxParticipants: terms.maxParticipants,
      durationRounds: input.durationRounds,
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

    if (!input.administrative || mesa.status === 'DRAFT') {
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
    }

    const prizeDistribution = MesaCategoryRules.isFree(terms)
      ? []
      : BolaoPrizeService.validateDistribution(input.prizeDistribution)
    if (
      terms.maxParticipants != null &&
      prizeDistribution.length > terms.maxParticipants
    ) {
      throw AppError.badRequest(
        'A quantidade de posições premiadas não pode superar os lugares disponíveis',
        'mesa_prizes_exceed_capacity'
      )
    }
    if (mesa.status !== 'DRAFT' && input.publicationMode) {
      throw AppError.conflict(
        'A publicação só pode ser alterada enquanto a Mesa está em rascunho',
        'mesa_publication_locked'
      )
    }
    if (
      input.publicationMode === 'AT_START' &&
      input.startDate.getTime() <= Date.now()
    ) {
      throw AppError.badRequest(
        'Para publicar na abertura, informe uma data futura para o início das inscrições',
        'mesa_publication_date_invalid'
      )
    }
    const publication = input.publicationMode === 'NOW'
      ? { status: 'ACTIVE' as const, publishedAt: new Date() }
      : input.publicationMode === 'AT_START'
        ? { status: 'DRAFT' as const, publishedAt: input.startDate }
        : input.publicationMode === 'DRAFT'
          ? { status: 'DRAFT' as const, publishedAt: null }
          : null
    const financialTermsChanged =
      mesa.category !== terms.category ||
      mesa.accessCost !== terms.accessCost ||
      mesa.sponsorPrizePool !== terms.sponsorPrizePool ||
      JSON.stringify(mesa.prizeDistribution) !== JSON.stringify(prizeDistribution)
    const financialTermsLocked =
      mesa.currentParticipants > 0 || mesa.grossCollected > 0 || Boolean(mesa.settledAt)

    if (
      input.administrative &&
      mesa.status !== 'DRAFT' &&
      financialTermsLocked &&
      financialTermsChanged
    ) {
      throw AppError.conflict(
        'Os termos financeiros não podem ser alterados depois que a Mesa recebeu participantes ou foi liquidada.',
        'mesa_financial_terms_locked'
      )
    }
    const durationDays = input.endDate
      ? Math.ceil((input.endDate.getTime() - input.startDate.getTime()) / (1000 * 60 * 60 * 24))
      : null
    const emptyPool = BolaoPrizeService.calculatePool(0)
    const shouldRecalculateFinancials = mesa.status === 'DRAFT' || !financialTermsLocked

    const result = await prisma.$transaction(async tx => {
      const mutation = await tx.ranking.updateMany({
        where: {
          id: input.rankingId,
          type: 'BOLAO',
          status: input.administrative ? mesa.status : 'DRAFT',
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
          durationMode: input.durationMode ?? MesaDurationMode.ROUNDS,
          durationRounds: input.durationRounds ?? null,
          durationDays,
          prizeDistribution,
          ...(shouldRecalculateFinancials
            ? {
                ...emptyPool,
                prizePool: MesaCategoryRules.isSponsored(terms)
                  ? terms.sponsorPrizePool
                  : emptyPool.prizePool,
                rewardPool: MesaCategoryRules.isSponsored(terms)
                  ? terms.sponsorPrizePool
                  : emptyPool.prizePool,
              }
            : {}),
          startDate: input.startDate,
          entryEndDate: input.entryEndDate ?? null,
          endDate: input.endDate,
          ...(publication ?? {}),
        },
      })
      if (mutation.count !== 1) {
        throw AppError.conflict(
          input.administrative
            ? 'A Mesa mudou de status antes das alterações serem salvas'
            : 'A Mesa deixou de ser um rascunho antes das alterações serem salvas',
          input.administrative ? 'mesa_status_changed' : 'mesa_update_draft_only'
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
            administrative: input.administrative === true,
            previousStatus: mesa.status,
            description,
            category: terms.category,
            accessCost: terms.accessCost,
            sponsorPrizePool: terms.sponsorPrizePool,
            maxParticipants: terms.maxParticipants,
            eligibility: input.eligibility ?? MesaEligibility.SUBSCRIBERS_ONLY,
            registrationCloseMode: input.registrationCloseMode ?? MesaRegistrationCloseMode.CAPACITY,
            durationMode: input.durationMode ?? MesaDurationMode.ROUNDS,
            durationRounds: input.durationRounds ?? null,
            prizeDistribution,
            startDate: input.startDate.toISOString(),
            entryEndDate: input.entryEndDate?.toISOString() ?? null,
            endDate: input.endDate?.toISOString() ?? null,
            publicationMode: input.publicationMode ?? null,
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
