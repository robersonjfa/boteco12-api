import { prisma } from '../../lib/prisma'
import { InternalJobRunnerService } from '../internal/internal-job-runner.service'
import { PublishMesaService } from '../bolao/publish-mesa.service'
import { AppError } from '../../errors/AppError'

export type PublishScheduledMesasJobResult = {
  publishedMesas: number
  execution: {
    id: string
    status: string
  }
}

/**
 * Publica Mesas agendadas cujo início das inscrições já chegou.
 * O update condicional torna a varredura idempotente entre workers concorrentes.
 */
export class PublishScheduledMesasJobService {
  static async execute(now = new Date()): Promise<PublishScheduledMesasJobResult> {
    const result = await InternalJobRunnerService.execute({
      jobName: 'PUBLISH_SCHEDULED_MESAS',
      referenceId: 'publish-scheduled-mesas-sweep',
      allowRepeat: true,
      run: async () => {
        const scheduled = await prisma.ranking.findMany({
          where: {
            type: 'BOLAO',
            status: 'DRAFT',
            publishedAt: { not: null, lte: now },
          },
          select: { id: true, createdByUserId: true },
        })
        let publishedMesas = 0
        const failures: Array<{ mesaId: string; reason: string }> = []
        for (const mesa of scheduled) {
          if (!mesa.createdByUserId) continue
          try {
            await PublishMesaService.execute({
              rankingId: mesa.id,
              requestedByUserId: mesa.createdByUserId,
            })
            publishedMesas += 1
          } catch (error) {
            const reason = error instanceof AppError ? error.code : 'scheduled_publication_failed'
            failures.push({ mesaId: mesa.id, reason })
            await prisma.auditLog.create({
              data: {
                userId: mesa.createdByUserId,
                action: 'BOLAO_SCHEDULED_PUBLICATION_FAILED',
                entity: 'RANKING',
                entityId: mesa.id,
                metadata: { reason },
              },
            }).catch(() => undefined)
          }
        }
        if (failures.length > 0) {
          const summary = failures.map(failure => `${failure.mesaId}:${failure.reason}`).join(',')
          throw new Error(`Falha ao publicar ${failures.length} Mesa(s) agendada(s): ${summary}`)
        }
        return { publishedMesas }
      },
    })

    return {
      publishedMesas: result.result?.publishedMesas ?? 0,
      execution: {
        id: result.executionId,
        status: result.status,
      },
    }
  }
}
