import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { logger } from '../../lib/logger'

export type DuelGameEventName =
  | 'duel_created'
  | 'duel_detail_opened'
  | 'duel_accepted'
  | 'duel_settled'
  | 'duel_expired'
  | 'duel_return'

export type DuelGameEventInput = {
  name: DuelGameEventName
  dedupeKey: string
  userId?: string | null
  duelId?: string | null
  miniId?: string | null
  metadata?: Prisma.InputJsonValue
}

/** Best-effort: falha de analytics nunca derruba o fluxo de duelos. */
export async function recordDuelGameEvent(input: DuelGameEventInput): Promise<void> {
  try {
    await prisma.duelGameEvent.create({ data: input })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return
    }
    logger.warn({ err: error, event: input.name }, 'Duel game event not recorded')
  }
}
