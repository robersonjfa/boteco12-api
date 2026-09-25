const test = require('node:test')
const assert = require('node:assert/strict')

const {
  CLUBS,
  NATIONALS,
  TEAM_CATALOG,
  seedTeams,
  validateTeamCatalog,
} = require('../prisma/seed-teams')

const SERIE_A_2026 = [
  'Palmeiras',
  'Flamengo',
  'Fluminense',
  'Bragantino',
  'Athletico-PR',
  'Bahia',
  'Coritiba',
  'São Paulo',
  'Botafogo',
  'Vitória',
  'Atlético-MG',
  'Corinthians',
  'Cruzeiro',
  'Internacional',
  'Santos',
  'Grêmio',
  'Vasco',
  'Mirassol',
  'Remo',
  'Chapecoense',
]

test('catálogo de times possui chaves canônicas únicas', () => {
  const summary = validateTeamCatalog()

  assert.equal(summary.total, TEAM_CATALOG.length)
  assert.equal(summary.clubs, CLUBS.length)
  assert.equal(summary.nationals, NATIONALS.length)
  assert.ok(summary.clubs >= 100)
  assert.ok(summary.nationals >= 32)
  assert.equal(new Set(TEAM_CATALOG.map((team) => team.externalId)).size, TEAM_CATALOG.length)
})

test('catálogo contém todos os participantes da Série A 2026', () => {
  const brazilianClubs = new Set(
    CLUBS.filter((team) => team.country === 'Brasil').map((team) => team.name)
  )

  for (const teamName of SERIE_A_2026) {
    assert.ok(brazilianClubs.has(teamName), `${teamName} não foi encontrado no catálogo`)
  }
})

test('catálogo inclui nomes oficiais e apelidos pesquisáveis dos principais clubes', () => {
  const palmeiras = CLUBS.find(team => team.externalId === 'seed:club:br:palmeiras')
  const botafogo = CLUBS.find(team => team.externalId === 'seed:club:br:botafogo')

  assert.equal(palmeiras.officialName, 'Sociedade Esportiva Palmeiras')
  assert.deepEqual(palmeiras.aliases, ['Verdão', 'Palestra'])
  assert.deepEqual(botafogo.aliases, ['Fogão', 'Glorioso'])
})

test('Brasil e Espanha possuem identificadores de seleção distintos', () => {
  const brazil = NATIONALS.find((team) => team.name === 'Brasil')
  const spain = NATIONALS.find((team) => team.name === 'Espanha')

  assert.ok(brazil)
  assert.ok(spain)
  assert.notEqual(brazil.externalId, spain.externalId)
})

test('logoUrl é opcional no catálogo', () => {
  assert.ok(TEAM_CATALOG.some((team) => team.logoUrl === undefined))
  assert.doesNotThrow(() => validateTeamCatalog())
})

test('seed reconcilia dados legados, preserva logo e é idempotente', async () => {
  const records = [
    {
      id: 'legacy-spain',
      externalId: 'sel-9',
      name: 'Espanha',
      shortName: 'ESP',
      country: 'Espanha',
      type: 'NATIONAL',
      logoUrl: null,
      active: true,
      createdAt: new Date('2026-06-01T00:00:00Z'),
    },
    {
      id: 'legacy-usa',
      externalId: 'sel-5629',
      name: 'Estados Unidos',
      shortName: 'USA',
      country: 'EUA',
      type: 'NATIONAL',
      logoUrl: 'https://images.example.test/usa.svg',
      active: true,
      createdAt: new Date('2026-06-02T00:00:00Z'),
    },
  ]
  let nextId = 1
  const variants = []
  const prisma = {
    team: {
      async findUnique({ where }) {
        return records.find((record) => record.externalId === where.externalId) ?? null
      },
      async findMany({ where, take }) {
        if (!where.name) {
          return records.filter(record => record.type === where.type).map(record => ({ id: record.id }))
        }
        const names = new Set(where.name.in.map((name) => name.toLocaleLowerCase('pt-BR')))
        return records
          .filter((record) =>
            record.type === where.type && names.has(record.name.toLocaleLowerCase('pt-BR'))
          )
          .slice(0, take)
      },
      async update({ where, data }) {
        const record = records.find((item) => item.id === where.id)
        assert.ok(record)
        Object.assign(record, data)
        return record
      },
      async create({ data }) {
        const record = {
          ...data,
          variants: undefined,
          id: `created-${nextId++}`,
          createdAt: new Date(),
        }
        records.push(record)
        return record
      },
    },
    teamVariant: {
      async upsert({ where, create, update }) {
        const key = where.teamId_gender_ageCategory
        let variant = variants.find(item =>
          item.teamId === key.teamId &&
          item.gender === key.gender &&
          item.ageCategory === key.ageCategory
        )
        if (variant) Object.assign(variant, update)
        else {
          variant = { id: `variant-${variants.length + 1}`, ...create }
          variants.push(variant)
        }
        return variant
      },
    },
  }

  const firstRun = await seedTeams(prisma)
  const secondRun = await seedTeams(prisma)

  assert.equal(firstRun.created, TEAM_CATALOG.length - 2)
  assert.equal(firstRun.updated, 2)
  assert.equal(secondRun.created, 0)
  assert.equal(secondRun.updated, TEAM_CATALOG.length)
  assert.equal(records.length, TEAM_CATALOG.length)
  assert.equal(new Set(records.map((record) => record.externalId)).size, records.length)

  const usa = records.find((record) => record.externalId === 'seed:national:usa')
  assert.equal(usa.country, 'Estados Unidos')
  assert.equal(usa.name, 'EUA')
  assert.ok(usa.aliases.includes('Estados Unidos'))
  assert.match(usa.searchText, /estados unidos/)
  assert.equal(usa.logoUrl, 'https://images.example.test/usa.svg')
  assert.ok(records.some((record) => record.externalId === 'seed:national:bra'))
  assert.ok(records.some((record) => record.externalId === 'seed:national:esp'))
  assert.equal(variants.length, TEAM_CATALOG.length)
})
