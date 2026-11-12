import { prisma } from '../../lib/prisma'
import { AppError } from '../../errors/AppError'
import {
  DUEL_FRAMES,
  DUEL_GAME_RULE_VERSION,
  DUEL_LEVELS,
  DUEL_TITLES,
  levelForXp,
  nextLevelForXp,
  isDuelGamificationEnabled,
} from './duel-gamification.rules'

const DEFAULT_TITLE = 'title:chegando'
const DEFAULT_FRAME = 'frame:padrao'
const KNOWN_ITEMS = new Set<string>([
  ...DUEL_TITLES.map(item => item.id),
  ...DUEL_FRAMES.map(item => item.id),
])

function enabled(): boolean {
  return isDuelGamificationEnabled()
}

function publicLevel(xp: number) {
  const level = levelForXp(xp)
  const next = nextLevelForXp(xp)
  return {
    level: { id: level.id, name: level.name, minXp: level.minXp },
    nextLevel: next ? { id: next.id, name: next.name, minXp: next.minXp } : null,
  }
}

async function statsFor(userId: string) {
  const duels = await prisma.miniDuel.findMany({
    where: { status: 'SETTLED', OR: [{ creatorId: userId }, { opponentId: userId }] },
    select: { creatorId: true, opponentId: true, winnerId: true },
  })
  let wins = 0
  let losses = 0
  let draws = 0
  const opponents = new Set<string>()
  for (const duel of duels) {
    const opponent = duel.creatorId === userId ? duel.opponentId : duel.creatorId
    if (opponent) opponents.add(opponent)
    if (!duel.winnerId) draws += 1
    else if (duel.winnerId === userId) wins += 1
    else losses += 1
  }
  return { wins, losses, draws, opponents: opponents.size }
}

export class DuelGamificationProfileService {
  static enabled(): boolean {
    return enabled()
  }

  static async me(userId: string) {
    if (!enabled()) return { enabled: false }

    const [profile, achievements, unlocks, enrollment] = await Promise.all([
      prisma.duelGameProfile.findUnique({ where: { userId } }),
      prisma.duelAchievement.findMany({ where: { userId }, orderBy: { earnedAt: 'asc' } }),
      prisma.duelCosmeticUnlock.findMany({ where: { userId } }),
      prisma.duelGameEnrollment.findUnique({ where: { userId } }),
    ])
    const xp = profile?.xp ?? 0
    const owned = new Set(unlocks.map(item => item.itemId))
    return {
      enabled: true,
      ruleVersion: DUEL_GAME_RULE_VERSION,
      xp,
      ...publicLevel(xp),
      titles: DUEL_TITLES.map(item => ({ ...item, owned: owned.has(item.id) })),
      frames: DUEL_FRAMES.map(item => ({ ...item, owned: owned.has(item.id) })),
      achievements: achievements.map(item => ({ code: item.code, earnedAt: item.earnedAt })),
      enrollment: enrollment ? { startedAt: enrollment.startedAt, endedAt: enrollment.endedAt } : null,
      stats: await statsFor(userId),
      equipment: {
        titleId: profile?.titleId ?? DEFAULT_TITLE,
        frameId: profile?.frameId ?? DEFAULT_FRAME,
      },
      privacy: { visibility: profile?.visibility ?? 'PUBLIC' },
      levels: DUEL_LEVELS,
    }
  }

  static async player(viewerId: string, userId: string) {
    if (!enabled()) return { enabled: false }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, nickname: true, profileImage: true, bio: true },
    })
    if (!user) throw AppError.notFound('Usuário')

    const profile = await prisma.duelGameProfile.findUnique({ where: { userId } })
    const isOwner = viewerId === userId
    const hidden = !isOwner && profile?.visibility === 'HIDDEN'
    const xp = profile?.xp ?? 0
    const achievements = hidden
      ? []
      : await prisma.duelAchievement.findMany({
          where: { userId },
          orderBy: { earnedAt: 'asc' },
          select: { code: true, earnedAt: true },
        })
    return {
      enabled: true,
      user,
      owner: isOwner,
      hidden,
      stats: hidden ? null : await statsFor(userId),
      achievements,
      ...publicLevel(xp),
      equipment: hidden
        ? null
        : {
            titleId: profile?.titleId ?? DEFAULT_TITLE,
            frameId: profile?.frameId ?? DEFAULT_FRAME,
          },
    }
  }

  static async updateEquipment(
    userId: string,
    input: { titleId?: string; frameId?: string }
  ) {
    if (!enabled()) return { enabled: false }
    if (!input.titleId && !input.frameId) {
      throw AppError.badRequest('Informe titleId ou frameId', 'empty_equipment')
    }
    const unlocks = await prisma.duelCosmeticUnlock.findMany({ where: { userId } })
    const owned = new Set(unlocks.map(item => item.itemId))

    for (const value of [input.titleId, input.frameId]) {
      if (!value) continue
      if (!KNOWN_ITEMS.has(value)) {
        throw AppError.badRequest('Item desconhecido', 'unknown_cosmetic')
      }
      if (!owned.has(value)) {
        throw AppError.badRequest('Item ainda não obtido', 'cosmetic_not_owned')
      }
    }

    await prisma.duelGameProfile.upsert({
      where: { userId },
      create: {
        userId,
        titleId: input.titleId ?? DEFAULT_TITLE,
        frameId: input.frameId ?? DEFAULT_FRAME,
      },
      update: {
        ...(input.titleId ? { titleId: input.titleId } : {}),
        ...(input.frameId ? { frameId: input.frameId } : {}),
      },
    })
    return this.me(userId)
  }

  static async setEnrollment(userId: string, enrolled: boolean) {
    if (!enabled()) return { enabled: false }
    if (enrolled) {
      await prisma.duelGameEnrollment.upsert({
        where: { userId },
        create: { userId, startedAt: new Date(), endedAt: null },
        update: { startedAt: new Date(), endedAt: null },
      })
    } else {
      const now = new Date()
      await prisma.duelGameEnrollment.upsert({
        where: { userId },
        create: { userId, startedAt: now, endedAt: now },
        update: { endedAt: now },
      })
    }
    return this.me(userId)
  }

  static async diagnostics() {
    const [pending, oldest, grants] = await Promise.all([
      prisma.miniDuel.count({ where: { status: 'SETTLED', gameReceipt: null } }),
      prisma.miniDuel.findFirst({
        where: { status: 'SETTLED', gameReceipt: null },
        orderBy: { settledAt: 'asc' },
        select: { settledAt: true },
      }),
      prisma.duelXpGrant.groupBy({ by: ['reason'], _count: { _all: true } }),
    ])
    return {
      pending,
      oldestSettledAt: oldest?.settledAt ?? null,
      grants: grants.map(item => ({ reason: item.reason, count: item._count._all })),
    }
  }

  static async updatePrivacy(userId: string, visibility: 'PUBLIC' | 'HIDDEN') {
    if (!enabled()) return { enabled: false }
    await prisma.duelGameProfile.upsert({
      where: { userId },
      create: { userId, visibility },
      update: { visibility },
    })
    return this.me(userId)
  }
}
