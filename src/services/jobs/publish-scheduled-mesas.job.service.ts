import { prisma } from '../../lib/prisma'
import { InternalJobRunnerService } from '../internal/internal-job-runner.service'

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
        const published = await prisma.ranking.updateMany({
          where: {
            type: 'BOLAO',
            status: 'DRAFT',
            publishedAt: { not: null, lte: now },
          },
          data: { status: 'ACTIVE' },
        })
        return { publishedMesas: published.count }
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
