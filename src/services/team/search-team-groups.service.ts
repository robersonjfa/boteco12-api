import { TeamAgeCategory, TeamGender } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import {
  normalizeTeamSearch,
  teamVariantDisplayName,
  teamVariantTags,
} from './team-catalog'

type VariantFilter = {
  gender?: TeamGender
  ageCategory?: TeamAgeCategory
}

const AGE_ORDER: Record<TeamAgeCategory, number> = {
  SENIOR: 0,
  U23: 1,
  U20: 2,
  U17: 3,
  U15: 4,
  OTHER: 5,
}

export function parseGroupedTeamQuery(value: string): {
  teamQuery: string
  variant: VariantFilter
} {
  let query = normalizeTeamSearch(value)
  const variant: VariantFilter = {}

  const genderTerms: Array<[RegExp, TeamGender]> = [
    [/\b(feminino|feminina|fem)\b/g, TeamGender.WOMEN],
    [/\b(misto|mista)\b/g, TeamGender.MIXED],
    [/\b(masculino|masculina|masc)\b/g, TeamGender.MEN],
  ]
  for (const [pattern, gender] of genderTerms) {
    if (pattern.test(query)) {
      variant.gender = gender
      query = query.replace(pattern, ' ')
      break
    }
  }

  const ageTerms: Array<[RegExp, TeamAgeCategory]> = [
    [/\b(sub\s*23|u23)\b/g, TeamAgeCategory.U23],
    [/\b(sub\s*20|u20)\b/g, TeamAgeCategory.U20],
    [/\b(sub\s*17|u17)\b/g, TeamAgeCategory.U17],
    [/\b(sub\s*15|u15)\b/g, TeamAgeCategory.U15],
    [/\b(principal|senior)\b/g, TeamAgeCategory.SENIOR],
    [/\b(outra|outro)\b/g, TeamAgeCategory.OTHER],
  ]
  for (const [pattern, ageCategory] of ageTerms) {
    if (pattern.test(query)) {
      variant.ageCategory = ageCategory
      query = query.replace(pattern, ' ')
      break
    }
  }

  return {
    teamQuery: query.replace(/\s+/g, ' ').trim(),
    variant,
  }
}

function relevance(team: {
  name: string
  officialName: string | null
  shortName: string | null
  aliases: string[]
}, query: string) {
  if (!query) return 0
  const name = normalizeTeamSearch(team.name)
  const shortName = normalizeTeamSearch(team.shortName ?? '')
  const officialName = normalizeTeamSearch(team.officialName ?? '')
  const aliases = team.aliases.map(normalizeTeamSearch)

  if (name === query || shortName === query) return 0
  if (aliases.includes(query)) return 1
  if (name.startsWith(query) || shortName.startsWith(query)) return 2
  if (aliases.some(alias => alias.startsWith(query))) return 3
  if (officialName.startsWith(query)) return 4
  return 5
}

export class SearchTeamGroupsService {
  static async execute(query: string, limit = 20) {
    const parsed = parseGroupedTeamQuery(query)
    const variantWhere = {
      active: true,
      ...(parsed.variant.gender ? { gender: parsed.variant.gender } : {}),
      ...(parsed.variant.ageCategory ? { ageCategory: parsed.variant.ageCategory } : {}),
    }
    const teams = await prisma.team.findMany({
      where: {
        active: true,
        ...(parsed.teamQuery ? { searchText: { contains: parsed.teamQuery } } : {}),
        variants: { some: variantWhere },
      },
      select: {
        id: true,
        name: true,
        officialName: true,
        shortName: true,
        aliases: true,
        country: true,
        type: true,
        logoUrl: true,
        variants: {
          where: variantWhere,
          select: { id: true, gender: true, ageCategory: true },
        },
      },
      orderBy: { name: 'asc' },
      take: Math.min(Math.max(limit, 1), 50),
    })

    return teams
      .map(team => ({
        id: team.id,
        name: team.name,
        officialName: team.officialName,
        shortName: team.shortName,
        country: team.country,
        type: team.type,
        logoUrl: team.logoUrl,
        variants: team.variants
          .sort((a, b) =>
            AGE_ORDER[a.ageCategory] - AGE_ORDER[b.ageCategory] ||
            a.gender.localeCompare(b.gender)
          )
          .map(variant => ({
            id: variant.id,
            name: teamVariantDisplayName(team.name, variant),
            gender: variant.gender,
            ageCategory: variant.ageCategory,
            tags: teamVariantTags(variant),
          })),
        relevance: relevance(team, parsed.teamQuery),
      }))
      .sort((a, b) =>
        a.relevance - b.relevance || a.name.localeCompare(b.name, 'pt-BR')
      )
      .map(({ relevance: _relevance, ...team }) => team)
  }
}
