const assert = require('node:assert/strict')
const test = require('node:test')

if (process.env.B12_POSTGRES_INTEGRATION !== 'true') {
  throw new Error('B12_POSTGRES_INTEGRATION=true is required')
}

const { prisma } = require('../dist/lib/prisma')
const { DiscoverMesasService } = require('../dist/services/bolao/discover-mesas.service')

const PREFIX = 'mesa-region-integration'
const OWNER = `${PREFIX}-owner`
const VIEWER = `${PREFIX}-viewer`
const IDS = {
  national: `${PREFIX}-national`,
  stateSc: `${PREFIX}-state-sc`,
  cityJoa: `${PREFIX}-city-joa`,
  cityOther: `${PREFIX}-city-other`,
  stateRs: `${PREFIX}-state-rs`,
}

async function cleanup() {
  await prisma.ranking.deleteMany({ where: { id: { in: Object.values(IDS) } } })
  await prisma.user.deleteMany({ where: { id: { in: [OWNER, VIEWER] } } })
}

async function seed() {
  await cleanup()
  await prisma.user.createMany({
    data: [
      { id: OWNER, name: 'Dono', email: `${OWNER}@example.test`, password: 'hash' },
      {
        id: VIEWER,
        name: 'Viewer',
        email: `${VIEWER}@example.test`,
        password: 'hash',
        countryCode: 'BR',
        stateCode: 'SC',
        cityCode: '4209003',
        cityName: 'Joaçaba',
      },
    ],
  })

  const start = new Date(Date.now() - 86_400_000)
  const rows = [
    { id: IDS.national, name: `${PREFIX} nacional`, regionScope: 'NATIONAL' },
    { id: IDS.stateSc, name: `${PREFIX} estadual SC`, regionScope: 'STATE', stateCode: 'SC' },
    {
      id: IDS.cityJoa,
      name: `${PREFIX} municipal Joacaba`,
      regionScope: 'CITY',
      stateCode: 'SC',
      cityCode: '4209003',
      cityName: 'Joaçaba',
    },
    {
      id: IDS.cityOther,
      name: `${PREFIX} municipal Chapeco`,
      regionScope: 'CITY',
      stateCode: 'SC',
      cityCode: '4204202',
      cityName: 'Chapecó',
    },
    { id: IDS.stateRs, name: `${PREFIX} estadual RS`, regionScope: 'STATE', stateCode: 'RS' },
  ]

  for (const row of rows) {
    await prisma.ranking.create({
      data: {
        id: row.id,
        name: row.name,
        type: 'BOLAO',
        status: 'ACTIVE',
        category: 'FREE',
        eligibility: 'ALL',
        startDate: start,
        durationMode: 'ROUNDS',
        durationRounds: 2,
        registrationCloseMode: 'CAPACITY',
        entryEndDate: null,
        endDate: null,
        maxParticipants: 10,
        currentParticipants: 0,
        accessCost: 0,
        entryFee: 0,
        sponsorPrizePool: 0,
        prizeDistribution: [],
        publishedAt: new Date(),
        createdByUserId: OWNER,
        regionScope: row.regionScope,
        countryCode: 'BR',
        stateCode: row.stateCode ?? null,
        cityCode: row.cityCode ?? null,
        cityName: row.cityName ?? null,
      },
    })
  }
}

// O banco de teste pode conter Mesas de outras execuções; comparamos só o prefixo.
const ours = result => result.mesas.filter(mesa => mesa.id.startsWith(PREFIX))
const ids = result => ours(result).map(mesa => mesa.id).sort()

test('descoberta regional filtra no servidor e classifica afinidade', async () => {
  await seed()

  const run = region => DiscoverMesasService.execute({
    userId: VIEWER,
    region,
    page: 1,
    limit: 50,
  })

  const all = await run('ALL')
  assert.equal(ours(all).length, 5)
  const national = ours(all).find(mesa => mesa.id === IDS.national)
  assert.equal(national.regionLabel, 'Todo o Brasil')
  assert.equal(national.regionMatch, 'NATIONAL')

  assert.deepEqual(ids(await run('NATIONAL')), [IDS.national])
  assert.deepEqual(ids(await run('STATE')), [IDS.stateSc])
  assert.deepEqual(ids(await run('CITY')), [IDS.cityJoa])
  assert.deepEqual(
    ids(await run('NEARBY')),
    [IDS.national, IDS.stateSc, IDS.cityJoa].sort(),
  )

  const nearby = await run('NEARBY')
  assert.deepEqual(
    ours(nearby).map(mesa => mesa.id),
    [IDS.cityJoa, IDS.stateSc, IDS.national],
  )
  const joacaba = ours(nearby).find(mesa => mesa.id === IDS.cityJoa)
  assert.equal(joacaba.regionMatch, 'CITY')
  assert.equal(joacaba.regionLabel, 'Joaçaba · SC')

  const otherCity = ours(all).find(mesa => mesa.id === IDS.cityOther)
  assert.equal(otherCity.regionMatch, 'STATE')

  assert.ok(nearby.meta.regionCounts.national >= 1)
  assert.ok(nearby.meta.regionCounts.state >= 1)
  assert.ok(nearby.meta.regionCounts.city >= 1)
  assert.ok(nearby.meta.regionCounts.nearby >= 3)

  await cleanup()
})
