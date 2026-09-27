import { Request, Response } from 'express'
import { PublishScheduledMesasJobService } from '../../services/jobs/publish-scheduled-mesas.job.service'

export class PublishScheduledMesasController {
  async execute(_req: Request, res: Response) {
    try {
      const result = await PublishScheduledMesasJobService.execute()
      return res.status(200).json({ status: 'ok', ...result })
    } catch (error: any) {
      return res.status(500).json({
        error: error?.message ?? 'Internal job error',
      })
    }
  }
}
