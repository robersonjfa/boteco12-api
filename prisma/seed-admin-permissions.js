const { createPrismaClient } = require('../scripts/lib/prisma-client')

const prisma = createPrismaClient()

const permissions = [
  'COMPETITION_READ',
  'COMPETITION_WRITE',
  'COMPETITION_EXECUTE',
  'COMPETITION_FORCE',
  'RANKING_READ',
  'RANKING_REBUILD',
  'RANKING_FORCE',
  'FINANCE_READ',
  'FINANCE_WRITE',
  'FINANCE_EXECUTE',
  'FINANCE_FORCE',
  'USER_READ',
  'USER_PII_READ',
  'USER_WRITE',
  'USER_FORCE',
  'USER_BLOCK',
  'USER_UNBLOCK',
  'USER_PLAN_WRITE',
  'USER_PASSWORD_RESET',
  'AUDIT_READ',
  'SYSTEM_LOCK',
  'SYSTEM_REBUILD',
  'SYSTEM_FORCE',
  'JOB_EXECUTE',
  'JOB_FORCE'
]

async function main() {
  console.log('🔹 Seeding Admin Permissions')

  for (const code of permissions) {
    await prisma.adminPermission.upsert({
      where: { code },
      update: {},
      create: { code }
    })
  }

  const adminRole = await prisma.adminRole.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: {
      name: 'ADMIN',
      description: 'Administrador Operacional'
    }
  })

  const allPermissions = await prisma.adminPermission.findMany()

  for (const perm of allPermissions) {
    await prisma.adminRolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: adminRole.id,
          permissionId: perm.id
        }
      },
      update: {},
      create: {
        roleId: adminRole.id,
        permissionId: perm.id
      }
    })
  }

  console.log('✅ Admin permissions seed concluído')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
