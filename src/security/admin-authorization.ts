import { prisma } from '../lib/prisma'
import type { AdminPermissionCode } from '../domain/permissions'
import { LEGACY_ADMIN_ROLE_NAMES } from '../domain/admin-roles'

export async function hasAdminPermission(
  userId: string,
  permissionCode: AdminPermissionCode
): Promise<boolean> {
  // Há um único nível administrativo. Os códigos de permissão continuam
  // identificando e auditando cada ação, mas não criam castas de admin.
  const assignment = await prisma.userAdminRole.findFirst({
    where: {
      userId,
      role: {
        name: { in: [...LEGACY_ADMIN_ROLE_NAMES] },
      },
    },
    select: { id: true },
  })

  return Boolean(assignment)
}
