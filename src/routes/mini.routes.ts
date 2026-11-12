import { Router, RequestHandler } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware'
import { authorize } from '../middleware/authorize.middleware'
import { MiniService } from '../services/mini/mini.service'
import { DuelGamificationProfileService } from '../services/duel-gamification/duel-gamification-profile.service'

const router = Router()
const id = z.string().uuid()
const page = (value: unknown) => z.coerce.number().int().min(1).max(100000).default(1).parse(value)
const handle = (fn: (req: AuthRequest) => Promise<unknown>, status = 200): RequestHandler => async (req, res, next) => {
  try { res.status(status).json(await fn(req as AuthRequest)) } catch (error) { next(error) }
}
router.get('/minis', authMiddleware, handle(req => MiniService.list(req.user!.id, false, page(req.query.page))))
router.get('/minis/balance', authMiddleware, handle(req => MiniService.balance(req.user!.id)))
router.get('/minis/opponents', authMiddleware, handle(async req => {
  const query = z.string().trim().min(2).max(80).parse(req.query.q)
  return prisma.user.findMany({ where: { id: { not: req.user!.id }, adminBlockedAt: null, OR: [{ name: { contains: query, mode: 'insensitive' } }, { nickname: { contains: query, mode: 'insensitive' } }] }, select: { id: true, name: true, nickname: true }, take: 20, orderBy: { name: 'asc' } })
}))
router.post('/minis/:id/predictions', authMiddleware, handle(req => MiniService.savePrediction(id.parse(req.params.id), req.user!.id, z.object({ picks: z.array(z.enum(['1', 'X', '2'])).min(2).max(3) }).strict().parse(req.body).picks), 201))
router.post('/minis/:id/duels', authMiddleware, handle(req => {
  const body = z.object({ amount: z.number().int().positive().max(1073741823), recipientId: id.optional(), requestKey: id }).strict().parse(req.body)
  return MiniService.createDuel(id.parse(req.params.id), req.user!.id, body.amount, body.recipientId, body.requestKey)
}, 201))
router.get('/duels', authMiddleware, handle(req => MiniService.duels(req.user!.id, z.enum(['mine', 'public']).default('mine').parse(req.query.mode), page(req.query.page))))
router.get('/duels/gamification/me', authMiddleware, handle(req => DuelGamificationProfileService.me(req.user!.id)))
router.get('/duels/gamification/players/:id', authMiddleware, handle(req => DuelGamificationProfileService.player(req.user!.id, id.parse(req.params.id))))
router.patch('/duels/gamification/me/equipment', authMiddleware, handle(req => {
  const body = z.object({ titleId: z.string().trim().min(1).max(64).optional(), frameId: z.string().trim().min(1).max(64).optional() }).strict().parse(req.body)
  return DuelGamificationProfileService.updateEquipment(req.user!.id, body)
}))
router.patch('/duels/gamification/me/privacy', authMiddleware, handle(req => {
  const body = z.object({ visibility: z.enum(['PUBLIC', 'HIDDEN']) }).strict().parse(req.body)
  return DuelGamificationProfileService.updatePrivacy(req.user!.id, body.visibility)
}))
router.get('/duels/:id', authMiddleware, handle(req => MiniService.detail(id.parse(req.params.id), req.user!.id)))
router.post('/duels/:id/accept', authMiddleware, handle(req => MiniService.accept(id.parse(req.params.id), req.user!.id)))
router.post('/duels/:id/cancel', authMiddleware, handle(req => MiniService.cancel(id.parse(req.params.id), req.user!.id)))
router.get('/admin/minis', authMiddleware, authorize('COMPETITION_READ'), handle(req => MiniService.list(req.user!.id, true, page(req.query.page))))
router.post('/admin/minis', authMiddleware, authorize('COMPETITION_WRITE', { audit: true, entity: 'MINI' }), handle(req => {
  const body = z.object({ name: z.string().trim().min(3).max(100), matches: z.array(z.object({ homeTeam: z.string().trim().min(1).max(100), awayTeam: z.string().trim().min(1).max(100), matchTime: z.coerce.date() }).strict()).min(2).max(3) }).strict().parse(req.body)
  return MiniService.create(body.name, body.matches, req.user!.id)
}, 201))
router.post('/admin/minis/:id/publish', authMiddleware, authorize('COMPETITION_WRITE', { audit: true, entity: 'MINI' }), handle(req => MiniService.publish(id.parse(req.params.id), req.user!.id)))
router.post('/admin/minis/:id/results', authMiddleware, authorize('COMPETITION_EXECUTE', { audit: true, entity: 'MINI' }), handle(req => MiniService.confirm(id.parse(req.params.id), z.object({ results: z.array(z.enum(['1', 'X', '2', 'C'])).min(2).max(3) }).strict().parse(req.body).results, req.user!.id)))
export default router
