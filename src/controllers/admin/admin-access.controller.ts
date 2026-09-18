import { NextFunction, Response } from 'express'
import { AuthRequest } from '../../middleware/auth.middleware'
import { AdminAccessService } from '../../services/admin/admin-access.service'

export class AdminAccessController {
  static async context(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      return res.json(await AdminAccessService.context(req.user!.id))
    } catch (error) {
      return next(error)
    }
  }

  static async matrix(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      return res.json(await AdminAccessService.matrix())
    } catch (error) {
      return next(error)
    }
  }

  static async updateRole(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      return res.json(await AdminAccessService.updateRolePermissions({
        adminUserId: req.user!.id,
        roleName: req.params.roleName,
        permissions: req.body.permissions,
        reason: req.body.reason,
      }))
    } catch (error) {
      return next(error)
    }
  }
}
