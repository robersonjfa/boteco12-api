const assert = require('node:assert/strict')
const test = require('node:test')

const { prisma } = require('../dist/lib/prisma')
const { AdminAccessService } = require('../dist/services/admin/admin-access.service')
const { AdminUserRolesSchema } = require('../dist/validators/admin-user.validator')

test('ADMIN recebe todas as capacidades pelo vínculo administrativo', async t => {
  const originalFindMany = prisma.userAdminRole.findMany
  t.after(() => { prisma.userAdminRole.findMany = originalFindMany })

  prisma.userAdminRole.findMany = async ({ where }) => {
    if (where.userId === 'normal-user') return []
    return [{
      role: {
        name: 'ADMIN',
      },
    }]
  }

  await assert.rejects(
    AdminAccessService.context('normal-user'),
    { code: 'admin_access_required' }
  )

  const context = await AdminAccessService.context('admin-user')
  assert.deepEqual(context.roles, ['ADMIN'])
  assert.ok(context.permissions.includes('SYSTEM_FORCE'))
  assert.ok(context.permissions.includes('USER_PASSWORD_RESET'))
  assert.ok(context.permissions.includes('FINANCE_FORCE'))
})

test('vínculo SUPERADMIN legado é normalizado para ADMIN durante a transição', async t => {
  const originalFindMany = prisma.userAdminRole.findMany
  t.after(() => { prisma.userAdminRole.findMany = originalFindMany })

  prisma.userAdminRole.findMany = async () => [{
    role: { name: 'SUPERADMIN' },
  }]

  const context = await AdminAccessService.context('legacy-admin')
  assert.deepEqual(context.roles, ['ADMIN'])
  assert.ok(context.permissions.includes('SYSTEM_FORCE'))
  assert.ok(context.permissions.includes('USER_WRITE'))
})

test('novas atribuições aceitam somente o papel ADMIN', () => {
  assert.equal(AdminUserRolesSchema.safeParse({
    roles: ['ADMIN'],
    reason: 'Promover operador',
  }).success, true)
  assert.equal(AdminUserRolesSchema.safeParse({
    roles: ['SUPERADMIN'],
    reason: 'Papel removido',
  }).success, false)
})
