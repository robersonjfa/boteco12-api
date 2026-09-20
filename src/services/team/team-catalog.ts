import { TeamAgeCategory, TeamGender } from '@prisma/client'

export type TeamVariantInput = {
  gender: TeamGender
  ageCategory: TeamAgeCategory
  active?: boolean
}

export const DEFAULT_TEAM_VARIANT: TeamVariantInput = {
  gender: TeamGender.MEN,
  ageCategory: TeamAgeCategory.SENIOR,
  active: true,
}

export function normalizeTeamSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function normalizeAliases(values: string[] | null | undefined) {
  if (!values) return []
  const aliases = values
    .map(value => value.trim())
    .filter(Boolean)
  return [...new Map(aliases.map(alias => [normalizeTeamSearch(alias), alias])).values()]
}

export function buildTeamSearchText(input: {
  name: string
  officialName?: string | null
  shortName?: string | null
  country?: string | null
  aliases?: string[] | null
}) {
  return normalizeTeamSearch([
    input.name,
    input.officialName,
    input.shortName,
    input.country,
    ...(input.aliases ?? []),
  ].filter(Boolean).join(' '))
}

export function teamVariantTags(input: {
  gender: TeamGender
  ageCategory: TeamAgeCategory
}) {
  const tags: string[] = []
  if (input.gender === TeamGender.WOMEN) tags.push('Feminino')
  if (input.gender === TeamGender.MIXED) tags.push('Misto')
  if (input.ageCategory !== TeamAgeCategory.SENIOR) {
    tags.push(input.ageCategory === TeamAgeCategory.OTHER
      ? 'Outra categoria'
      : `Sub-${input.ageCategory.slice(1)}`)
  }
  return tags
}

export function teamVariantDisplayName(
  teamName: string,
  input: { gender: TeamGender; ageCategory: TeamAgeCategory }
) {
  const tags = teamVariantTags(input)
  return tags.length > 0 ? `${teamName} · ${tags.join(' · ')}` : teamName
}
