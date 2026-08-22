type MesaLifecycleClient = {
  ranking: {
    findMany(args: unknown): Promise<Array<{
      id: string
      entryEndDate?: Date | null
      registrationClosedAt?: Date | null
      durationRounds?: number | null
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
        endDate: null,
      },
      select: { id: true, registrationClosedAt: true, durationRounds: true },
    })
    const finished: string[] = []

    for (const mesa of mesas) {
      if (!mesa.registrationClosedAt || !mesa.durationRounds) continue
      const rounds = await tx.round.findMany({
        where: {
          status: 'SCORED',
          closeAt: { not: null, gt: mesa.registrationClosedAt },
        },
        orderBy: { closeAt: 'asc' },
        take: mesa.durationRounds,
        select: { closeAt: true },
      })
      const lastRound = rounds[mesa.durationRounds - 1]
      if (!lastRound?.closeAt) continue

      const update = await tx.ranking.updateMany({
        where: { id: mesa.id, status: 'ACTIVE', endDate: null },
        data: { endDate: lastRound.closeAt },
      })
      if (update.count === 1) finished.push(mesa.id)
    }

    return finished
  }
}
