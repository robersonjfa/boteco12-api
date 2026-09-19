import { Router } from 'express'
import { AdminAccessController } from '../controllers/admin/admin-access.controller'
import { authMiddleware } from '../middleware/auth.middleware'
import { requireAdminAccess } from '../middleware/require-admin-access.middleware'

const router = Router()

router.get(
  '/admin/context',
  authMiddleware,
  requireAdminAccess,
  AdminAccessController.context
)

export default router
