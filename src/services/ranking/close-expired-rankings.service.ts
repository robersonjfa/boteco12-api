import { prisma } from '../../lib/prisma';
import { CloseRankingService } from './close-ranking.service';
import { MesaLifecycleService } from '../bolao/mesa-lifecycle.service';

export class CloseExpiredRankingsService {
  async execute(): Promise<{ closed: number }> {
    const now = new Date();

    await MesaLifecycleService.closeDueRegistrations(prisma, now);
    await MesaLifecycleService.finishDueRoundMesas(prisma);

    /**
     * 1️⃣ Buscar rankings expirados
     */
    const expiredRankings = await prisma.ranking.findMany({
      where: {
        OR: [
          {
            status: 'ACTIVE',
            endDate: { not: null, lt: now },
          },
          {
            status: 'DRAFT',
            type: 'BOLAO',
            endDate: { not: null, lt: now },
          },
        ],
      },
      select: {
        id: true,
      },
    });

    if (expiredRankings.length === 0) {
      return { closed: 0 };
    }

    const closeService = new CloseRankingService();

    let closedCount = 0;
    const failures: Array<{ rankingId: string; reason: string }> = [];

    /**
     * 2️⃣ Fechar um por um usando serviço oficial
     */
    for (const ranking of expiredRankings) {
      try {
        await closeService.execute(ranking.id);
        closedCount++;
      } catch (error) {
        const reason = typeof error === 'object' && error !== null &&
          'code' in error && typeof error.code === 'string'
          ? error.code
          : 'ranking_close_failed';
        failures.push({ rankingId: ranking.id, reason });
        await prisma.auditLog.create({
          data: {
            action: 'RANKING_CLOSE_FAILED',
            entity: 'RANKING',
            entityId: ranking.id,
            metadata: { reason },
          },
        }).catch(() => undefined);
      }
    }

    if (failures.length > 0) {
      throw new Error(
        `Falha ao encerrar ${failures.length} ranking(s): ${failures
          .map(failure => failure.rankingId)
          .join(',')}`
      );
    }

    return { closed: closedCount };
  }
}
