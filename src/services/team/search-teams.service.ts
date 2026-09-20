import { prisma } from '../../lib/prisma'
import {
  normalizeTeamSearch,
  teamVariantDisplayName,
  teamVariantTags,
} from './team-catalog'

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

export class SearchTeamsService {
  static async execute(query: string, limit = 20) {
    const q = normalizeTeamSearch(String(query ?? ''))
    const teams = await prisma.team.findMany({
      where: {
        active: true,
        ...(q ? { searchText: { contains: q } } : {}),
        variants: { some: { active: true } },
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
          where: { active: true },
          select: { id: true, gender: true, ageCategory: true },
        },
      },
      orderBy: { name: 'asc' },
      take: Math.max(limit * 3, 60),
    })

    return teams
      .flatMap(team => team.variants.map(variant => ({
        id: variant.id,
        teamId: team.id,
        name: teamVariantDisplayName(team.name, variant),
        popularName: team.name,
        officialName: team.officialName,
        shortName: team.shortName,
        country: team.country,
        type: team.type,
        logoUrl: team.logoUrl,
        gender: variant.gender,
        ageCategory: variant.ageCategory,
        tags: teamVariantTags(variant),
        relevance: relevance(team, q),
      })))
      .sort((a, b) =>
        a.relevance - b.relevance ||
        a.popularName.localeCompare(b.popularName, 'pt-BR') ||
        a.tags.join(' ').localeCompare(b.tags.join(' '), 'pt-BR')
      )
      .slice(0, limit)
      .map(({ relevance: _relevance, ...team }) => team)
  }
}
