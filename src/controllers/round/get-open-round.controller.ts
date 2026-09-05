import { Request, Response } from 'express'
import { GetOpenRoundService } from '../../services/round/get-open-round.service'

export class GetOpenRoundController {
  static async handle(req: Request, res: Response): Promise<Response> {
    try {

      const round = await GetOpenRoundService.execute()

      if (!round) {
        return res.json(null)
      }

      return res.json(round)

    } catch (error: any) {
      return res.status(500).json({
        error: error.message ?? 'Error fetching open round'
      })
    }
  }
}
