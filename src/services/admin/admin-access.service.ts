import { prisma } from '../../lib/prisma'
import { ADMIN_PERMISSION_CODES } from '../../domain/permissions'
import { AppError } from '../../errors/AppError'
import { isAdministrativeRole } from '../../domain/admin-roles'

export class AdminAccessService {
  static async context(userId: string) {
    const assignments = await prisma.userAdminRole.findMany({
      where: { userId },
      select: {
        role: {
          select: {
            name: true,
          },
        },
      },
    })

    if (!assignments.some(item => isAdministrativeRole(item.role.name))) {
      throw AppError.forbidden('Acesso administrativo não concedido', 'admin_access_required')
    }

    return {
      roles: ['ADMIN'],
      permissions: [...ADMIN_PERMISSION_CODES],
    }
  }
}
