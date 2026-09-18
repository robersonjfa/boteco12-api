import { Router } from 'express'
import { AdminAccessController } from '../controllers/admin/admin-access.controller'
import { authMiddleware } from '../middleware/auth.middleware'
import { authorize } from '../middleware/authorize.middleware'
import { requireAdminAccess } from '../middleware/require-admin-access.middleware'
import { validateRequest } from '../middleware/validate-request.middleware'
import {
  AdminRoleNameParamsSchema,
  AdminRolePermissionsSchema,
} from '../validators/admin-access.validator'

const router = Router()

router.get(
  '/admin/context',
  authMiddleware,
  requireAdminAccess,
  AdminAccessController.context
)

router.get(
  '/admin/permissions',
  authMiddleware,
  authorize('USER_READ'),
  AdminAccessController.matrix
)

router.put(
  '/admin/permissions/roles/:roleName',
  authMiddleware,
  authorize('SYSTEM_FORCE', { audit: true, entity: 'ADMIN_ROLE' }),
  validateRequest(AdminRoleNameParamsSchema, 'params'),
  validateRequest(AdminRolePermissionsSchema),
  AdminAccessController.updateRole
)

export default router
