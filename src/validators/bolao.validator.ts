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
  durationMode: z.enum(['ROUNDS', 'DATE']).default('DATE'),
  durationRounds: z.number().int().positive().max(1000).nullable().optional(),
  accessCost: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  entryFee: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  sponsorPrizePool: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  maxParticipants: z.number().int().positive().max(1_000_000).nullable().optional(),
  prizeDistribution: z.array(PrizeDistributionItemSchema).max(10).default([]),
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

  if (input.category === 'PAID' && input.registrationCloseMode !== 'CAPACITY') {
    ctx.addIssue({ code: 'custom', path: ['registrationCloseMode'], message: 'Mesa com Tampinhas fecha inscrições por capacidade' })
  }
  if (input.category === 'PAID' && input.durationMode !== 'ROUNDS') {
    ctx.addIssue({ code: 'custom', path: ['durationMode'], message: 'Mesa com Tampinhas dura por quantidade de rodadas' })
  }
  if (input.category === 'FREE' && input.durationMode !== 'ROUNDS') {
    ctx.addIssue({ code: 'custom', path: ['durationMode'], message: 'Mesa Free dura por quantidade de rodadas' })
  }
  if (input.category === 'FREE' && !input.endDate) {
    ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'Informe a data limite de proteção da Mesa Free' })
  }

  if (input.registrationCloseMode === 'CAPACITY' && !input.maxParticipants) {
    ctx.addIssue({ code: 'custom', path: ['maxParticipants'], message: 'Informe os lugares disponíveis' })
  }
  if (input.registrationCloseMode === 'DATE' && !input.entryEndDate) {
    ctx.addIssue({ code: 'custom', path: ['entryEndDate'], message: 'Informe o fechamento das inscrições' })
  }
  if (input.durationMode === 'ROUNDS' && !input.durationRounds) {
    ctx.addIssue({ code: 'custom', path: ['durationRounds'], message: 'Informe a quantidade de rodadas' })
  }
  if (input.durationMode === 'DATE' && !input.endDate) {
    ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'Informe o encerramento da Mesa' })
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
