import { prisma } from '../../lib/prisma'
import { TeamType } from '@prisma/client'
import { AppError } from '../../errors/AppError'
import {
  buildTeamSearchText,
  normalizeAliases,
  TeamVariantInput,
} from './team-catalog'
import { syncTeamVariants } from './sync-team-variants'

interface UpdateTeamInput {
  id: string
  name?: string
  officialName?: string | null
  shortName?: string | null
  aliases?: string[]
  country?: string | null
  type?: TeamType
  logoUrl?: string | null
  active?: boolean
  variants?: TeamVariantInput[]
}

function normalizeOptionalText(value: string | null | undefined) {
  if (value === undefined) return undefined
  if (value === null) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export class UpdateTeamService {
  static async execute(input: UpdateTeamInput) {
    const exists = await prisma.team.findUnique({ where: { id: input.id } })
    if (!exists) throw AppError.notFound('Time', 'team_not_found')

    const name = input.name?.trim() ?? exists.name
    const officialName = input.officialName === undefined
      ? exists.officialName
      : normalizeOptionalText(input.officialName)
    const shortName = input.shortName === undefined
      ? exists.shortName
      : normalizeOptionalText(input.shortName)
    const aliases = input.aliases === undefined ? exists.aliases : normalizeAliases(input.aliases)
    const country = input.country === undefined
      ? exists.country
      : normalizeOptionalText(input.country)

    return prisma.$transaction(async tx => {
      await tx.team.update({
        where: { id: input.id },
        data: {
          name,
          officialName,
          shortName,
          aliases,
          searchText: buildTeamSearchText({ name, officialName, shortName, aliases, country }),
          country,
          ...(input.type !== undefined && { type: input.type }),
          ...(input.logoUrl !== undefined && {
            logoUrl: normalizeOptionalText(input.logoUrl),
          }),
          ...(input.active !== undefined && { active: input.active }),
        },
      })
      await syncTeamVariants(tx, input.id, input.variants)
      return tx.team.findUniqueOrThrow({
        where: { id: input.id },
        include: { variants: { orderBy: [{ ageCategory: 'asc' }, { gender: 'asc' }] } },
      })
    })
  }
}
