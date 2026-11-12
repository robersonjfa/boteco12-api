export const DUEL_GAME_RULE_VERSION = 'duel-game-v1'
export const XP_PER_MINI = 20
export const DAILY_XP_CAP = 60
export const DUEL_GAME_TIME_ZONE = 'America/Sao_Paulo'
export const DEFAULT_PRODUCTION_ACTIVATION = '2026-11-12T00:00:00Z'

export function isDuelGamificationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.DUEL_GAMIFICATION_ENABLED === 'false') return false
  if (env.DUEL_GAMIFICATION_ENABLED === 'true') return true
  return env.NODE_ENV === 'production'
}

export const DUEL_LEVELS = [
  { id: 'chegando', name: 'Chegando no Boteco', minXp: 0 },
  { id: 'da-casa', name: 'Da Casa', minXp: 100 },
  { id: 'respeitado', name: 'Respeitado', minXp: 300 },
  { id: 'casca-grossa', name: 'Casca-grossa', minXp: 700 },
  { id: 'lenda', name: 'Lenda do Balcão', minXp: 1500 },
] as const

export type DuelLevel = (typeof DUEL_LEVELS)[number]

export const DUEL_TITLES = [
  { id: 'title:chegando', name: 'Chegando no Boteco', minXp: 0 },
  { id: 'title:da-casa', name: 'Da Casa', minXp: 100 },
  { id: 'title:respeitado', name: 'Respeitado', minXp: 300 },
  { id: 'title:casca-grossa', name: 'Casca-grossa', minXp: 700 },
  { id: 'title:lenda', name: 'Lenda do Balcão', minXp: 1500 },
] as const

export const DUEL_FRAMES = [
  { id: 'frame:padrao', name: 'Padrão', minXp: 0 },
  { id: 'frame:respeitado', name: 'Respeitado', minXp: 300 },
] as const

export function levelForXp(xp: number): DuelLevel {
  let current: DuelLevel = DUEL_LEVELS[0]
  for (const level of DUEL_LEVELS) {
    if (xp >= level.minXp) current = level
  }
  return current
}

export function nextLevelForXp(xp: number): DuelLevel | null {
  return DUEL_LEVELS.find(level => level.minXp > xp) ?? null
}

export function localDayFor(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DUEL_GAME_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function xpDeltaForDay(dayXp: number): number {
  return Math.max(0, Math.min(XP_PER_MINI, DAILY_XP_CAP - dayXp))
}

export function unlockedCosmeticsForXp(xp: number): string[] {
  const owned = new Set<string>()
  for (const title of DUEL_TITLES) if (xp >= title.minXp) owned.add(title.id)
  for (const frame of DUEL_FRAMES) if (xp >= frame.minXp) owned.add(frame.id)
  return [...owned]
}

export function isValidMatchResult(result: string | null | undefined): boolean {
  return result === '1' || result === 'X' || result === '2'
}
