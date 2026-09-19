import { NextFunction, Request, Response } from 'express'
import { AppError } from '../../errors/AppError'
import { UpdateMesaService } from '../../services/bolao/update-mesa.service'

export class UpdateMesaController {
  static async handle(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id
      if (!userId) throw AppError.unauthorized()

      const result = await UpdateMesaService.execute({
        rankingId: req.params.rankingId,
        requestedByUserId: userId,
        name: req.body.name,
        description: req.body.description,
        startDate: new Date(req.body.startDate),
        entryEndDate: req.body.entryEndDate ? new Date(req.body.entryEndDate) : null,
        endDate: req.body.endDate ? new Date(req.body.endDate) : null,
        category: req.body.category,
        accessCost: req.body.accessCost,
        entryFee: req.body.entryFee,
        sponsorPrizePool: req.body.sponsorPrizePool,
        maxParticipants: req.body.maxParticipants,
        eligibility: req.body.eligibility,
        registrationCloseMode: req.body.registrationCloseMode,
        durationMode: req.body.durationMode,
        durationRounds: req.body.durationRounds,
        prizeDistribution: req.body.prizeDistribution,
        publicationMode: req.body.publicationMode,
      })

      return res.status(200).json(result)
    } catch (error) {
      return next(error)
    }
  }
}
