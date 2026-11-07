import { Router } from 'express'
import { z } from 'zod'
import { authMiddleware } from '../middleware/auth.middleware'
import { LocationService } from '../services/location/location.service'

const router = Router()
router.get('/locations/cities', authMiddleware, async (req, res, next) => {
  try {
    const state = z.string().length(2).parse(req.query.state)
    res.json(await LocationService.cities(state))
  } catch (error) { next(error) }
})
// CEP stays in the body, not in URLs/request logs; only municipality is returned.
router.post('/locations/postal-code', authMiddleware, async (req, res, next) => {
  try { res.json(await LocationService.postalCode(z.object({ cep: z.string().max(9) }).strict().parse(req.body).cep)) }
  catch (error) { next(error) }
})
export default router
