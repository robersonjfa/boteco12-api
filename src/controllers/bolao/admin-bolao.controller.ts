import { Request, Response, NextFunction } from 'express'
import { CreateBolaoService } from '../../services/bolao/create-bolao.service'
import { AppError } from '../../errors/AppError'
import { prisma } from '../../lib/prisma'
import { MesaIntegrityService } from '../../services/bolao/mesa-integrity.service'
import { UpdateMesaService } from '../../services/bolao/update-mesa.service'
import { ListAdminMesasService } from '../../services/bolao/list-admin-mesas.service'

export class AdminBolaoController {
  static async integrity(_req: Request, res: Response, next: NextFunction) {
    try {
      return res.json(await MesaIntegrityService.diagnose(prisma))
    } catch (error) {
      return next(error)
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { bucket, category, q, page, limit } = req.query as any
      return res.json(await ListAdminMesasService.execute({
        bucket,
        category,
        query: q,
        page,
        limit,
      }))
    } catch (error) {
      return next(error)
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
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
        administrative: true,
      })

      return res.status(201).json(result)
    } catch (error) {
      return next(error)
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
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
        administrative: true,
      })

      return res.json(result)
    } catch (error) {
      return next(error)
    }
  }
}
