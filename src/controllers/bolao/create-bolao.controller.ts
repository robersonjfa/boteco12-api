import { Request, Response, NextFunction } from 'express'
import { CreateBolaoService } from '../../services/bolao/create-bolao.service'
import { AppError } from '../../errors/AppError'

export class CreateBolaoController {
  static async handle(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id

      if (!userId) {
        throw AppError.unauthorized()
      }

      const result = await CreateBolaoService.execute({
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
        createdByUserId: userId,
      })

      return res.status(201).json(result)
    } catch (error) {
      return next(error)
    }
  }
}
