const assert = require('node:assert/strict')
const test = require('node:test')

const { prisma } = require('../dist/lib/prisma')
const { ListAdminMesasService } = require('../dist/services/bolao/list-admin-mesas.service')
const { AdminMesasQuerySchema } = require('../dist/validators/admin-query.validator')

test('consulta administrativa de Mesas valida filtros e aplica defaults seguros', () => {
  assert.deepEqual(AdminMesasQuerySchema.parse({}), {
    bucket: 'OPEN',
    page: 1,
    limit: 12,
  })
  assert.equal(AdminMesasQuerySchema.safeParse({ bucket: 'ALL' }).success, false)
  assert.equal(AdminMesasQuerySchema.safeParse({ category: 'INVALID' }).success, false)
  assert.equal(AdminMesasQuerySchema.safeParse({ limit: '51' }).success, false)
})

test('lista Mesas abertas com busca, categoria, paginação e contadores por situação', async t => {
  const originals = {
    count: prisma.ranking.count,
    findMany: prisma.ranking.findMany,
    groupBy: prisma.ranking.groupBy,
  }
  t.after(() => Object.assign(prisma.ranking, originals))

  let countArgs
  let findArgs
  let groupArgs
  prisma.ranking.count = async args => {
    countArgs = args
    return 13
  }
  prisma.ranking.findMany = async args => {
    findArgs = args
    return []
  }
  prisma.ranking.groupBy = async args => {
    groupArgs = args
    return [
      { status: 'DRAFT', _count: { _all: 2 } },
      { status: 'ACTIVE', _count: { _all: 11 } },
      { status: 'CLOSED', _count: { _all: 27 } },
    ]
  }

  const result = await ListAdminMesasService.execute({
    bucket: 'OPEN',
    category: 'PAID',
    query: 'Roberson',
    page: 2,
    limit: 12,
  })

  assert.deepEqual(countArgs.where.status, { in: ['DRAFT', 'ACTIVE'] })
  assert.equal(countArgs.where.type, 'BOLAO')
  assert.equal(countArgs.where.category, 'PAID')
  assert.ok(countArgs.where.OR.some(filter => filter.createdBy))
  assert.equal(findArgs.skip, 12)
  assert.equal(findArgs.take, 12)
  assert.equal(groupArgs.where.status, undefined)
  assert.deepEqual(result.meta, { page: 2, limit: 12, total: 13, totalPages: 2 })
  assert.deepEqual(result.counts, { open: 13, closed: 27 })
  assert.deepEqual(result.mesas, [])
})

test('lista fechadas sem misturar rascunhos ou Mesas ativas', async t => {
  const originals = {
    count: prisma.ranking.count,
    findMany: prisma.ranking.findMany,
    groupBy: prisma.ranking.groupBy,
  }
  t.after(() => Object.assign(prisma.ranking, originals))

  let where
  prisma.ranking.count = async args => {
    where = args.where
    return 1
  }
  prisma.ranking.findMany = async () => []
  prisma.ranking.groupBy = async () => [{ status: 'CLOSED', _count: { _all: 1 } }]

  await ListAdminMesasService.execute({ bucket: 'CLOSED' })
  assert.deepEqual(where.status, { in: ['CLOSED'] })
})
