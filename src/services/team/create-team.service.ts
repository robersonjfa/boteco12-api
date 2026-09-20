import { prisma } from '../../lib/prisma'
import { TeamType } from '@prisma/client'
import {
  buildTeamSearchText,
  normalizeAliases,
  TeamVariantInput,
} from './team-catalog'
import { syncTeamVariants } from './sync-team-variants'

interface CreateTeamInput {
  name: string
  officialName?: string | null
  shortName?: string | null
  aliases?: string[]
  country?: string | null
  type?: TeamType
  logoUrl?: string | null
  externalId?: string | null
  variants?: TeamVariantInput[]
}

export class CreateTeamService {
  static async execute(input: CreateTeamInput) {
    const name = input.name.trim()
    const officialName = input.officialName?.trim() || null
    const shortName = input.shortName?.trim() || null
    const aliases = normalizeAliases(input.aliases)
    const country = input.country?.trim() || null

    return prisma.$transaction(async tx => {
      const team = await tx.team.create({
        data: {
          name,
          officialName,
          shortName,
          aliases,
          searchText: buildTeamSearchText({ name, officialName, shortName, aliases, country }),
          country,
          type: input.type ?? 'CLUB',
          logoUrl: input.logoUrl?.trim() || null,
          externalId: input.externalId,
        },
      })
      await syncTeamVariants(tx, team.id, input.variants, true)
      return tx.team.findUniqueOrThrow({
        where: { id: team.id },
        include: { variants: { orderBy: [{ ageCategory: 'asc' }, { gender: 'asc' }] } },
      })
    })
  }
}
