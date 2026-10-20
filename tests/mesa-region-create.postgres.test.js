const assert = require('node:assert/strict')
const test = require('node:test')

if (process.env.B12_POSTGRES_INTEGRATION !== 'true') {
  throw new Error('B12_POSTGRES_INTEGRATION=true is required')
}

const { prisma } = require('../dist/lib/prisma')
const { CreateBolaoService } = require('../dist/services/bolao/create-bolao.service')

const PREFIX = 'mesa-region-create-integration'
const ADMIN = `${PREFIX}-admin`
const DAY = 86_400_000

function payload(extra = {}) {
  return {
    name: `${PREFIX} ${Math.random().toString(36).slice(2, 8)}`,
    description: 'Mesa sintetica de regionalizacao.',
    startDate: new Date(Date.now() + 7 * DAY),
    endDate: null,
    entryEndDate: null,
    category: 'PAID',
    eligibility: 'ALL',
    accessCost: 20,
    maxParticipants: 2,
    durationRounds: 2,
    prizeDistribution: [{ position: 1, percentage: 100 }],
    publicationMode: 'DRAFT',
    createdByUserId: ADMIN,
    administrative: true,
    ...extra,
  }
}

async function cleanup() {
  await prisma.ranking.deleteMany({ where: { createdByUserId: ADMIN } })
  await prisma.user.deleteMany({ where: { id: ADMIN } })
}

test('criação persiste a região escolhida e nasce nacional por padrão', async () => {
  await cleanup()
  await prisma.user.create({
    data: { id: ADMIN, name: 'Admin', email: `${ADMIN}@example.test`, password: 'hash' },
  })

  const national = await CreateBolaoService.execute(payload())
  assert.equal(national.regionScope, 'NATIONAL')
  assert.equal(national.stateCode, null)
  assert.equal(national.cityCode, null)

  const city = await CreateBolaoService.execute(payload({
    regionScope: 'CITY',
    countryCode: 'BR',
    stateCode: 'SC',
    cityCode: '4209003',
    cityName: 'Joaçaba',
  }))
  assert.equal(city.regionScope, 'CITY')
  assert.equal(city.stateCode, 'SC')
  assert.equal(city.cityCode, '4209003')
  assert.equal(city.cityName, 'Joaçaba')

  const persisted = await prisma.ranking.findUnique({ where: { id: city.id } })
  assert.equal(persisted.regionScope, 'CITY')
  assert.equal(persisted.stateCode, 'SC')
  assert.equal(persisted.cityCode, '4209003')
  assert.equal(persisted.cityName, 'Joaçaba')

  const state = await CreateBolaoService.execute(payload({
    regionScope: 'STATE',
    stateCode: 'sc',
  }))
  assert.equal(state.regionScope, 'STATE')
  assert.equal(state.stateCode, 'SC')
  assert.equal(state.cityCode, null)

  await cleanup()
})
