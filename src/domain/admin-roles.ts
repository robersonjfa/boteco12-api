export const ADMIN_ROLE_NAME = 'ADMIN' as const

// Compatibilidade de leitura durante a transição da base existente. O papel
// legado nunca é exposto pela API nem pode ser atribuído novamente.
export const LEGACY_ADMIN_ROLE_NAMES = ['ADMIN', 'SUPERADMIN'] as const

export function isAdministrativeRole(roleName: string): boolean {
  return (LEGACY_ADMIN_ROLE_NAMES as readonly string[]).includes(roleName)
}
