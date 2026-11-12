import { prisma } from '../../lib/prisma'
import { isDuelGamificationEnabled, levelForXp } from './duel-gamification.rules'

const DEFAULT_TITLE = 'title:chegando'
const DEFAULT_FRAME = 'frame:padrao'

export type DuelGameSummary = {
  level: { id: string; name: string; minXp: number }
  titleId: string
  frameId: string
}

export async function gameSummariesForUsers(
  userIds: Array<string | null | undefined>
): Promise<Map<string, DuelGameSummary>> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))]
  if (!isDuelGamificationEnabled() || ids.length === 0) {
    return new Map()
  }

  const profiles = await prisma.duelGameProfile.findMany({
    where: { userId: { in: ids } },
    select: { userId: true, xp: true, titleId: true, frameId: true },
  })
  const byUser = new Map(profiles.map(profile => [profile.userId, profile]))
  const summaries = new Map<string, DuelGameSummary>()
  for (const id of ids) {
    const profile = byUser.get(id)
    const level = levelForXp(profile?.xp ?? 0)
    summaries.set(id, {
      level: { id: level.id, name: level.name, minXp: level.minXp },
      titleId: profile?.titleId ?? DEFAULT_TITLE,
      frameId: profile?.frameId ?? DEFAULT_FRAME,
    })
  }
  return summaries
}
