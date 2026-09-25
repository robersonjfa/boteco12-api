import { z } from 'zod'

const TeamFields = {
  name: z.string().trim().min(2).max(120),
  officialName: z.string().trim().min(2).max(160).nullable().optional(),
  shortName: z.string().trim().min(1).max(20).nullable().optional(),
  aliases: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  country: z.string().trim().min(2).max(80).nullable().optional(),
  type: z.enum(['CLUB', 'NATIONAL']),
  logoUrl: z.url().max(2048).nullable().optional(),
}

const TeamVariantSchema = z.object({
  gender: z.enum(['MEN', 'WOMEN', 'MIXED']),
  ageCategory: z.enum(['SENIOR', 'U23', 'U20', 'U17', 'U15', 'OTHER']),
  active: z.boolean().optional(),
}).strict()

function variantsAreUnique(variants: Array<z.infer<typeof TeamVariantSchema>>) {
  return new Set(variants.map(item => `${item.gender}:${item.ageCategory}`)).size === variants.length
}

export const CreateTeamSchema = z.object({
  ...TeamFields,
  externalId: z.string().trim().min(1).max(120).nullable().optional(),
  variants: z.array(TeamVariantSchema).min(1).max(30).optional(),
}).strict().refine(value => variantsAreUnique(value.variants ?? []), {
  path: ['variants'],
  message: 'não repita a mesma categoria de equipe',
})

export const UpdateTeamSchema = z.object({
  name: TeamFields.name.optional(),
  officialName: TeamFields.officialName,
  shortName: TeamFields.shortName,
  aliases: TeamFields.aliases,
  country: TeamFields.country,
  type: TeamFields.type.optional(),
  logoUrl: TeamFields.logoUrl,
  active: z.boolean().optional(),
  variants: z.array(TeamVariantSchema).min(1).max(30).optional(),
}).strict().refine(value => Object.keys(value).length > 0, {
  message: 'informe ao menos um campo para atualização',
}).refine(value => variantsAreUnique(value.variants ?? []), {
  path: ['variants'],
  message: 'não repita a mesma categoria de equipe',
})

export const AdminTeamListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  type: z.enum(['CLUB', 'NATIONAL']).optional(),
  country: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict()

export const TeamSearchQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict()
