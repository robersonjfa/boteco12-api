const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { prisma } = require('../dist/lib/prisma')
const { SearchTeamsService } = require('../dist/services/team/search-teams.service')
const { resolveRoundMatchTeams } = require('../dist/services/round/round-match.types')

test('busca normalizada encontra apelido sem depender de acento e prioriza nome popular', async t => {
  const originalFindMany = prisma.team.findMany
  t.after(() => { prisma.team.findMany = originalFindMany })

  let receivedWhere
  prisma.team.findMany = async input => {
    receivedWhere = input.where
    return [
      {
        id: 'palmeiras', name: 'Palmeiras', officialName: 'Sociedade Esportiva Palmeiras',
        shortName: 'PAL', aliases: ['Verdão', 'Palestra'], country: 'Brasil', type: 'CLUB', logoUrl: null,
        variants: [
          { id: 'pal-main', gender: 'MEN', ageCategory: 'SENIOR' },
          { id: 'pal-women', gender: 'WOMEN', ageCategory: 'SENIOR' },
          { id: 'pal-u17', gender: 'MEN', ageCategory: 'U17' },
        ],
      },
    ]
  }

  const result = await SearchTeamsService.execute('verdao')

  assert.equal(receivedWhere.searchText.contains, 'verdao')
  assert.deepEqual(result.map(item => item.name), [
    'Palmeiras',
    'Palmeiras · Feminino',
    'Palmeiras · Sub-17',
  ])
  assert.deepEqual(result[1].tags, ['Feminino'])
})

test('rodada resolve IDs das variantes e persiste o nome com categoria', async t => {
  const originalFindMany = prisma.teamVariant.findMany
  t.after(() => { prisma.teamVariant.findMany = originalFindMany })

  prisma.teamVariant.findMany = async () => [
    { id: 'home', gender: 'WOMEN', ageCategory: 'SENIOR', team: { name: 'Palmeiras' } },
    { id: 'away', gender: 'MEN', ageCategory: 'U17', team: { name: 'Santos' } },
  ]

  const matches = Array.from({ length: 12 }, (_, index) => ({
    position: index + 1,
    homeTeamId: index % 2 === 0 ? 'home' : 'away',
    awayTeamId: index % 2 === 0 ? 'away' : 'home',
    homeTeam: '',
    awayTeam: '',
  }))
  const result = await resolveRoundMatchTeams(matches)

  assert.equal(result[0].homeTeam, 'Palmeiras · Feminino')
  assert.equal(result[0].awayTeam, 'Santos · Sub-17')
})

test('migration normaliza nomes e apelidos do catálogo legado de produção', () => {
  const sql = fs.readFileSync(path.join(
    __dirname,
    '../prisma/migrations/20260920030000_normalize_legacy_team_names/migration.sql'
  ), 'utf8')

  assert.match(sql, /'SE Palmeiras', 'Palmeiras'/)
  assert.match(sql, /'CR Flamengo', 'Flamengo'/)
  assert.match(sql, /'Botafogo-RJ', 'Botafogo'/)
  assert.match(sql, /'Verdão'/)
  assert.match(sql, /"searchText"/)
})
