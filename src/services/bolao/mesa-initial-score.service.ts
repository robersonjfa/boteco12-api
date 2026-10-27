import { prisma } from '../../lib/prisma'

/** Captura recuperável: chamada após a apuração e pelo job periódico existente. */
export class MesaInitialScoreService {
  static async capturePending(): Promise<void> {
    const pending = await prisma.ranking.findMany({
      where: {
        type: 'BOLAO',
        status: 'ACTIVE',
        referenceRoundId: { not: null },
        scoreInitialCapturedAt: null,
        initializationStatus: { in: ['WAITING_FOR_REFERENCE_ROUND', 'WAITING_FOR_BASELINE_CAPTURE'] },
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    })

    for (const { id } of pending) {
      await prisma.$transaction(async tx => {
        // Serializa capturas concorrentes e estabiliza a lista de participantes
        // contra a reserva de vagas, que também bloqueia esta linha.
        await tx.$queryRaw`SELECT id FROM rankings WHERE id = ${id} FOR UPDATE`
        const mesa = await tx.ranking.findUniqueOrThrow({
          where: { id },
          include: { participants: { where: { status: 'APPROVED' } } },
        })
        if (mesa.status !== 'ACTIVE' || !mesa.referenceRoundId ||
            !mesa.registrationClosedAt || mesa.scoreInitialCapturedAt ||
            mesa.initializationStatus === 'READY') return

        const [reference] = await tx.$queryRaw<Array<{ number: number; status: string }>>`
          SELECT number, status FROM rounds WHERE id = ${mesa.referenceRoundId} FOR SHARE
        `
        // SCORED é gravado na mesma transação que os históricos individuais.
        if (reference?.status !== 'SCORED') return

        await tx.ranking.update({ where: { id }, data: {
          initializationStatus: 'WAITING_FOR_BASELINE_CAPTURE',
        } })
        if (mesa.participants.length === 0 ||
            mesa.participants.length !== mesa.currentParticipants) return

        const userIds = mesa.participants.map(p => p.userId)
        const histories = await tx.userScoreHistory.findMany({
          where: {
            userId: { in: userIds },
            round: { number: { lte: reference.number }, status: 'SCORED' },
          },
          orderBy: { round: { number: 'desc' } },
          select: { userId: true, roundId: true, scoreTotal: true },
        })
        const tickets = await tx.ticket.findMany({
          where: {
            userId: { in: userIds },
            round: { number: { lte: reference.number }, status: { not: 'CANCELLED' } },
          },
          select: { userId: true, roundId: true },
        })
        const historyKeys = new Set(histories.map(h => JSON.stringify([h.userId, h.roundId])))
        // Não confundir ausência de escolha com apuração/histórico incompleto.
        // Quem não jogou carrega seu último total consolidado (ou zero).
        if (tickets.some(t => !historyKeys.has(JSON.stringify([t.userId, t.roundId])))) return

        const capturedAt = new Date()
        for (const participant of mesa.participants) {
          if (participant.scoreInitialCapturedAt) continue
          const baseline = histories.find(h => h.userId === participant.userId)?.scoreTotal ?? 0
          const capture = await tx.rankingParticipant.updateMany({
            where: { id: participant.id, status: 'APPROVED', scoreInitialCapturedAt: null },
            data: { scoreInitial: baseline, scoreInitialCapturedAt: capturedAt },
          })
          if (capture.count !== 1) throw new Error('Participante mudou durante a captura do Score Inicial')
        }
        await tx.ranking.update({ where: { id }, data: {
          initializationStatus: 'READY', scoreInitialCapturedAt: capturedAt,
        } })
        await tx.auditLog.create({ data: {
          action: 'MESA_INITIAL_SCORE_CAPTURED', entity: 'RANKING', entityId: id,
          metadata: { referenceRoundId: mesa.referenceRoundId, participants: mesa.participants.length },
        } })
      })
    }
  }
}
