type MesaLifecycleClient = {
  ranking: {
    findMany(args: unknown): Promise<Array<{
      id: string
      entryEndDate?: Date | null
      registrationClosedAt?: Date | null
      durationRounds?: number | null
      category?: 'PAID' | 'FREE' | 'SPONSORED_FREE'
      endDate?: Date | null
      referenceRoundId?: string | null
      referenceRound?: { number: number } | null
      initializationStatus?: string | null
      scoreInitialCapturedAt?: Date | null
      participants?: Array<{ scoreInitialCapturedAt: Date | null }>
    }>>
    updateMany(args: unknown): Promise<{ count: number }>
  }
  round?: {
    findMany(args: unknown): Promise<Array<{ closeAt: Date | null }>>
  }
}

/** Mantém os marcos temporais das Mesas sem depender do atraso do job. */
export class MesaLifecycleService {
  static async closeDueRegistrations(tx: MesaLifecycleClient, now = new Date()) {
    const due = await tx.ranking.findMany({
      where: {
        type: 'BOLAO',
        status: 'ACTIVE',
        registrationCloseMode: 'DATE',
        registrationClosedAt: null,
        entryEndDate: { not: null, lte: now },
      },
      select: { id: true, entryEndDate: true },
    })

    for (const mesa of due) {
      if (!mesa.entryEndDate) continue
      await tx.ranking.updateMany({
        where: { id: mesa.id, status: 'ACTIVE', registrationClosedAt: null },
        data: { registrationClosedAt: mesa.entryEndDate },
      })
    }
  }

  static async finishDueRoundMesas(tx: MesaLifecycleClient) {
    if (!tx.round) return []
    const mesas = await tx.ranking.findMany({
      where: {
        type: 'BOLAO',
        status: 'ACTIVE',
        durationMode: 'ROUNDS',
        durationRounds: { not: null },
        registrationClosedAt: { not: null },
        OR: [
          { endDate: null },
          { category: 'FREE', endDate: { not: null } },
        ],
      },
      select: {
        id: true,
        category: true,
        endDate: true,
        registrationClosedAt: true,
        durationRounds: true,
        referenceRoundId: true,
        referenceRound: { select: { number: true } },
        initializationStatus: true,
        scoreInitialCapturedAt: true,
        participants: { where: { status: 'APPROVED' }, select: { scoreInitialCapturedAt: true } },
      },
    })
    const finished: string[] = []

    for (const mesa of mesas) {
      if (!mesa.registrationClosedAt || !mesa.durationRounds) continue
      const referenceLifecycle = Boolean(mesa.referenceRoundId || mesa.initializationStatus)
      if (referenceLifecycle && (mesa.initializationStatus !== 'READY' ||
          !mesa.scoreInitialCapturedAt || !mesa.referenceRound ||
          !mesa.participants?.length || mesa.participants.some(p => !p.scoreInitialCapturedAt))) continue
      const rounds = await tx.round.findMany({
        where: {
          status: 'SCORED',
          ...(referenceLifecycle
            ? { number: { gt: mesa.referenceRound!.number }, closeAt: { not: null } }
            : { closeAt: { not: null, gt: mesa.registrationClosedAt } }),
        },
        orderBy: referenceLifecycle ? { number: 'asc' } : { closeAt: 'asc' },
        take: mesa.durationRounds,
        select: { closeAt: true },
      })
      const lastRound = rounds[mesa.durationRounds - 1]
      if (!lastRound?.closeAt) continue

      const update = await tx.ranking.updateMany({
        where: {
          id: mesa.id,
          status: 'ACTIVE',
          OR: [{ endDate: null }, { endDate: { gt: lastRound.closeAt } }],
        },
        data: { endDate: lastRound.closeAt },
      })
      if (update.count === 1) finished.push(mesa.id)
    }

    return finished
  }
}
