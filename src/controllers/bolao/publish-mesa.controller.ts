import { NextFunction, Request, Response } from 'express'
import { AppError } from '../../errors/AppError'
import { PublishMesaService } from '../../services/bolao/publish-mesa.service'

export class PublishMesaController {
  static async handle(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id
      if (!userId) throw AppError.unauthorized()

      const result = await PublishMesaService.execute({
        rankingId: req.params.rankingId,
        requestedByUserId: userId,
      })
      return res.status(200).json(result)
    } catch (error) {
      return next(error)
    }
  }
}
