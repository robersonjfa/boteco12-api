import { prisma } from '../../lib/prisma'
import { ADMIN_PERMISSION_CODES, type AdminPermissionCode } from '../../domain/permissions'
import { AppError } from '../../errors/AppError'

export class AdminAccessService {
  static async context(userId: string) {
    const assignments = await prisma.userAdminRole.findMany({
      where: { userId },
      select: {
        role: {
          select: {
            name: true,
            permissions: {
              select: { permission: { select: { code: true } } },
            },
          },
        },
      },
    })

    if (assignments.length === 0) {
      throw AppError.forbidden('Acesso administrativo não concedido', 'admin_access_required')
    }

    const roles = assignments.map(item => item.role.name)
    const isSuperAdmin = roles.includes('SUPERADMIN')
    const permissions = isSuperAdmin
      ? [...ADMIN_PERMISSION_CODES]
      : [...new Set(assignments.flatMap(item =>
          item.role.permissions.map(entry => entry.permission.code as AdminPermissionCode)
        ))].sort()

    return { roles, permissions, isSuperAdmin }
  }

  static async matrix() {
    const [roles, permissions] = await Promise.all([
      prisma.adminRole.findMany({
        orderBy: { name: 'asc' },
        select: {
          name: true,
          description: true,
          permissions: {
            select: { permission: { select: { code: true } } },
          },
          _count: { select: { users: true } },
        },
      }),
      prisma.adminPermission.findMany({
        orderBy: { code: 'asc' },
        select: { code: true },
      }),
    ])

    return {
      permissions: permissions.map(item => item.code),
      roles: roles.map(role => ({
        name: role.name,
        description: role.description,
        permissions: role.name === 'SUPERADMIN'
          ? [...ADMIN_PERMISSION_CODES]
          : role.permissions.map(item => item.permission.code).sort(),
        usersCount: role._count.users,
        editable: role.name === 'ADMIN',
      })),
    }
  }

  static async updateRolePermissions(input: {
    adminUserId: string
    roleName: string
    permissions: AdminPermissionCode[]
    reason: string
  }) {
    if (input.roleName !== 'ADMIN') {
      throw AppError.badRequest(
        'Somente o papel ADMIN pode ter sua matriz alterada',
        'admin_role_not_editable'
      )
    }

    const uniquePermissions = [...new Set(input.permissions)]

    await prisma.$transaction(async tx => {
      const role = await tx.adminRole.findUnique({
        where: { name: input.roleName },
        select: {
          id: true,
          permissions: { select: { permission: { select: { code: true } } } },
        },
      })
      if (!role) throw AppError.notFound('Papel administrativo', 'admin_role_not_found')

      const permissionRows = await tx.adminPermission.findMany({
        where: { code: { in: uniquePermissions } },
        select: { id: true, code: true },
      })
      if (permissionRows.length !== uniquePermissions.length) {
        throw AppError.badRequest('A lista contém permissões desconhecidas', 'invalid_admin_permissions')
      }

      const previousPermissions = role.permissions.map(item => item.permission.code).sort()
      await tx.adminRolePermission.deleteMany({ where: { roleId: role.id } })
      if (permissionRows.length > 0) {
        await tx.adminRolePermission.createMany({
          data: permissionRows.map(permission => ({
            roleId: role.id,
            permissionId: permission.id,
          })),
        })
      }

      await tx.adminAuditLog.create({
        data: {
          adminId: input.adminUserId,
          action: 'ADMIN_ROLE_PERMISSIONS_SET',
          entity: 'ADMIN_ROLE',
          entityId: role.id,
          payload: {
            roleName: input.roleName,
            previousPermissions,
            nextPermissions: uniquePermissions.sort(),
            reason: input.reason,
          },
        },
      })
    })

    return this.matrix()
  }
}
