import { Request, Response, NextFunction } from 'express'
import { DiscoverMesasService } from '../../services/bolao/discover-mesas.service'

export class DiscoverMesasController {
  static async handle(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
      const { q, category, registration, access, sort, minCost, maxCost, page, limit } = req.query as any
      const result = await DiscoverMesasService.execute({
        userId: req.user.id,
        query: q,
        category,
        registration,
        access,
        sort,
        minCost,
        maxCost,
        page,
        limit,
      })
      return res.json(result)
    } catch (error) {
      return next(error)
    }
  }
}
