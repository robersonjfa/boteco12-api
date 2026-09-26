import { prisma } from '../../lib/prisma'
import { InternalJobRunnerService } from '../internal/internal-job-runner.service'
import { PublishMesaService } from '../bolao/publish-mesa.service'

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
        const failures: string[] = []
        for (const mesa of scheduled) {
          if (!mesa.createdByUserId) continue
          try {
            await PublishMesaService.execute({
              rankingId: mesa.id,
              requestedByUserId: mesa.createdByUserId,
            })
            publishedMesas += 1
          } catch {
            failures.push(mesa.id)
          }
        }
        if (failures.length > 0) {
          throw new Error(`Falha ao publicar ${failures.length} Mesa(s) agendada(s)`)
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
