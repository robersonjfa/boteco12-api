import { z } from 'zod'

const PrizeDistributionItemSchema = z.object({
  position: z.number().int().positive().max(1000),
  percentage: z.number().positive().max(100),
}).strict()

const CreateMesaBaseSchema = z.object({
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().min(1).max(500),
  startDate: z.iso.datetime(),
  entryEndDate: z.iso.datetime().nullable().optional(),
  endDate: z.iso.datetime().nullable().optional(),
  category: z.enum(['PAID', 'FREE', 'SPONSORED_FREE']).default('PAID'),
  eligibility: z.enum(['ALL', 'SUBSCRIBERS_ONLY', 'FREE_ONLY']).default('SUBSCRIBERS_ONLY'),
  registrationCloseMode: z.enum(['CAPACITY', 'DATE']).default('CAPACITY'),
  durationMode: z.enum(['ROUNDS', 'DATE']).default('ROUNDS'),
  durationRounds: z.number().int().positive().max(1000).nullable().optional(),
  accessCost: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  entryFee: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  sponsorPrizePool: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  maxParticipants: z.number().int().positive().max(1_000_000).nullable().optional(),
  prizeDistribution: z.array(PrizeDistributionItemSchema).max(10).default([]),
  publicationMode: z.enum(['DRAFT', 'NOW', 'AT_START']).optional(),
}).strict()

export const CreateMesaSchema = CreateMesaBaseSchema.superRefine((input, ctx) => {
  if (input.category === 'PAID' && input.accessCost == null && input.entryFee == null) {
    ctx.addIssue({
      code: 'custom',
      path: ['accessCost'],
      message: 'Informe o custo de acesso da Mesa',
    })
  }

  const accessCost = input.accessCost ?? input.entryFee ?? 0
  if (input.category === 'PAID' && accessCost <= 0) {
    ctx.addIssue({ code: 'custom', path: ['accessCost'], message: 'Informe o custo de acesso da Mesa' })
  }
  if (input.category === 'FREE' && accessCost !== 0) {
    ctx.addIssue({ code: 'custom', path: ['accessCost'], message: 'Esta categoria não pode cobrar Tampinhas' })
  }
  if (input.category === 'SPONSORED_FREE' && (input.sponsorPrizePool ?? 0) <= 0) {
    ctx.addIssue({ code: 'custom', path: ['sponsorPrizePool'], message: 'Informe a premiação patrocinada' })
  }
  if (input.category !== 'SPONSORED_FREE' && (input.sponsorPrizePool ?? 0) !== 0) {
    ctx.addIssue({ code: 'custom', path: ['sponsorPrizePool'], message: 'Esta categoria não utiliza premiação patrocinada' })
  }

  if (input.registrationCloseMode === 'CAPACITY' && input.durationMode !== 'ROUNDS') {
    ctx.addIssue({ code: 'custom', path: ['durationMode'], message: 'Mesa por lugares deve encerrar por quantidade de rodadas' })
  }
  if (input.registrationCloseMode === 'DATE' && input.durationMode !== 'DATE') {
    ctx.addIssue({ code: 'custom', path: ['durationMode'], message: 'Mesa com inscrições por data deve possuir data de fechamento' })
  }

  if (input.registrationCloseMode === 'CAPACITY' && !input.maxParticipants) {
    ctx.addIssue({ code: 'custom', path: ['maxParticipants'], message: 'Informe os lugares disponíveis' })
  }
  if (input.registrationCloseMode === 'DATE' && !input.entryEndDate) {
    ctx.addIssue({ code: 'custom', path: ['entryEndDate'], message: 'Informe a data final das inscrições' })
  }
  if (input.registrationCloseMode === 'CAPACITY' && input.entryEndDate) {
    ctx.addIssue({ code: 'custom', path: ['entryEndDate'], message: 'Mesa por lugares não utiliza data final das inscrições' })
  }
  if (input.registrationCloseMode === 'DATE' && input.maxParticipants != null) {
    ctx.addIssue({ code: 'custom', path: ['maxParticipants'], message: 'Mesa com inscrições por data não utiliza limite de lugares' })
  }
  if (input.durationMode === 'ROUNDS' && !input.durationRounds) {
    ctx.addIssue({ code: 'custom', path: ['durationRounds'], message: 'Informe a quantidade de rodadas' })
  }
  if (input.durationMode === 'DATE' && !input.endDate) {
    ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'Informe a data de fechamento da Mesa' })
  }
  if (input.durationMode === 'ROUNDS' && input.endDate) {
    ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'Mesa por rodadas não utiliza data de fechamento' })
  }
  if (input.durationMode === 'DATE' && input.durationRounds != null) {
    ctx.addIssue({ code: 'custom', path: ['durationRounds'], message: 'Mesa com fechamento por data não utiliza quantidade de rodadas' })
  }

  const startDate = new Date(input.startDate)
  if (input.entryEndDate && new Date(input.entryEndDate) <= startDate) {
    ctx.addIssue({ code: 'custom', path: ['entryEndDate'], message: 'O fechamento deve ser posterior ao início das inscrições' })
  }
  const competitionStartsAfter = input.entryEndDate ? new Date(input.entryEndDate) : startDate
  if (input.endDate && new Date(input.endDate) <= competitionStartsAfter) {
    ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'O encerramento deve ser posterior às inscrições' })
  }

  if (input.category === 'FREE' && input.prizeDistribution.length > 0) {
    ctx.addIssue({ code: 'custom', path: ['prizeDistribution'], message: 'Mesa Free não possui recompensa em Tampinhas' })
  }
  if (input.category !== 'FREE' && input.prizeDistribution.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['prizeDistribution'], message: 'Informe a distribuição da recompensa' })
  }
  if (
    input.maxParticipants != null &&
    input.prizeDistribution.length > input.maxParticipants
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['prizeDistribution'],
      message: 'A quantidade de posições premiadas não pode superar os lugares disponíveis',
    })
  }
  if (
    input.publicationMode === 'AT_START' &&
    startDate.getTime() <= Date.now()
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['publicationMode'],
      message: 'Para publicar na abertura, informe uma data futura para o início das inscrições',
    })
  }
  if (
    input.accessCost != null &&
    input.entryFee != null &&
    input.accessCost !== input.entryFee
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['accessCost'],
      message: 'accessCost e entryFee devem possuir o mesmo valor durante a compatibilidade',
    })
  }
})

export const UpdateMesaSchema = CreateMesaSchema

/** @deprecated Use CreateMesaSchema. */
export const CreateBolaoSchema = CreateMesaSchema

export const ReviewBolaoRequestSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
}).strict()

export const CreateBolaoInviteSchema = z.object({
  maxUses: z.number().int().positive().max(10000).optional(),
  expiresAt: z.iso.datetime().optional(),
}).strict()

export const RankingParticipantParamsSchema = z.object({
  rankingId: z.uuid(),
  participantId: z.uuid(),
}).strict()

export const InviteCodeParamsSchema = z.object({
  code: z.string().trim().min(16).max(128).regex(/^[A-Za-z0-9_-]+$/),
}).strict()

export const DiscoverMesasQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  category: z.enum(['PAID', 'FREE', 'SPONSORED_FREE']).optional(),
  registration: z.enum(['ALL', 'OPEN', 'CLOSING_SOON', 'UPCOMING']).default('ALL'),
  access: z.enum(['ALL', 'CAN_JOIN']).default('ALL'),
  sort: z.enum([
    'RECOMMENDED',
    'CLOSING_SOON',
    'NEWEST',
    'LOWEST_COST',
    'HIGHEST_REWARD',
  ]).default('RECOMMENDED'),
  minCost: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  maxCost: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
}).strict().refine(value =>
  value.minCost == null || value.maxCost == null || value.minCost <= value.maxCost,
{
  path: ['maxCost'],
  message: 'o custo máximo deve ser maior ou igual ao custo mínimo',
})
