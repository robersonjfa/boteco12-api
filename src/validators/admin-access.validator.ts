import { z } from 'zod'
import { ADMIN_PERMISSION_CODES } from '../domain/permissions'

export const AdminRoleNameParamsSchema = z.object({
  roleName: z.enum(['ADMIN', 'SUPERADMIN']),
}).strict()

export const AdminRolePermissionsSchema = z.object({
  permissions: z.array(z.enum(ADMIN_PERMISSION_CODES)).max(ADMIN_PERMISSION_CODES.length),
  reason: z.string().trim().min(3).max(500),
}).strict()
