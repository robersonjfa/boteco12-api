const assert = require('node:assert/strict')
const test = require('node:test')

const { prisma } = require('../dist/lib/prisma')
const { AdminAccessService } = require('../dist/services/admin/admin-access.service')

test('contexto administrativo usa somente papéis RBAC e consolida permissões', async t => {
  const originalFindMany = prisma.userAdminRole.findMany
  t.after(() => { prisma.userAdminRole.findMany = originalFindMany })

  prisma.userAdminRole.findMany = async ({ where }) => {
    if (where.userId === 'normal-user') return []
    return [{
      role: {
        name: 'ADMIN',
        permissions: [
          { permission: { code: 'USER_READ' } },
          { permission: { code: 'COMPETITION_READ' } },
        ],
      },
    }]
  }

  await assert.rejects(
    AdminAccessService.context('normal-user'),
    { code: 'admin_access_required' }
  )

  assert.deepEqual(await AdminAccessService.context('admin-user'), {
    roles: ['ADMIN'],
    permissions: ['COMPETITION_READ', 'USER_READ'],
    isSuperAdmin: false,
  })
})

test('SUPERADMIN recebe todas as permissões efetivas', async t => {
  const originalFindMany = prisma.userAdminRole.findMany
  t.after(() => { prisma.userAdminRole.findMany = originalFindMany })

  prisma.userAdminRole.findMany = async () => [{
    role: { name: 'SUPERADMIN', permissions: [] },
  }]

  const context = await AdminAccessService.context('superadmin')
  assert.equal(context.isSuperAdmin, true)
  assert.ok(context.permissions.includes('SYSTEM_FORCE'))
  assert.ok(context.permissions.includes('USER_WRITE'))
})
