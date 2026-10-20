const assert = require('node:assert/strict')
const test = require('node:test')

const {
  normalizeMesaRegion,
  mesaRegionLabel,
  mesaRegionMatch,
  normalizeProfileLocation,
} = require('../dist/services/bolao/mesa-region-rules')
const { CreateMesaSchema } = require('../dist/validators/bolao.validator')

test('Mesa sem região nasce nacional e limpa estado/município', () => {
  const region = normalizeMesaRegion({})
  assert.equal(region.regionScope, 'NATIONAL')
  assert.equal(region.countryCode, 'BR')
  assert.equal(region.stateCode, null)
  assert.equal(region.cityCode, null)
  assert.equal(region.cityName, null)
})

test('abrangência estadual exige UF e não aceita município', () => {
  const region = normalizeMesaRegion({ regionScope: 'STATE', stateCode: 'sc' })
  assert.equal(region.stateCode, 'SC')
  assert.equal(region.cityCode, null)
  assert.equal(region.cityName, null)
  assert.throws(
    () => normalizeMesaRegion({ regionScope: 'STATE' }),
    { code: 'mesa_region_invalid' },
  )
})

test('abrangência municipal exige UF, código IBGE e nome', () => {
  const region = normalizeMesaRegion({
    regionScope: 'CITY',
    stateCode: 'SC',
    cityCode: '4209003',
    cityName: 'Joaçaba',
  })
  assert.equal(region.stateCode, 'SC')
  assert.equal(region.cityCode, '4209003')
  assert.equal(region.cityName, 'Joaçaba')
  assert.throws(
    () => normalizeMesaRegion({ regionScope: 'CITY', stateCode: 'SC' }),
    { code: 'mesa_region_invalid' },
  )
  assert.throws(
    () => normalizeMesaRegion({ regionScope: 'CITY', stateCode: 'SC', cityCode: 'abc', cityName: 'X' }),
    { code: 'mesa_region_invalid' },
  )
  assert.throws(
    () => normalizeMesaRegion({ regionScope: 'CITY', stateCode: 'SC', cityCode: '4209003' }),
    { code: 'mesa_region_invalid' },
  )
})

test('rótulo regional distingue nacional, estadual e municipal', () => {
  assert.equal(mesaRegionLabel({ regionScope: 'NATIONAL' }), 'Todo o Brasil')
  assert.equal(mesaRegionLabel({ regionScope: 'STATE', stateCode: 'SC' }), 'SC')
  assert.equal(mesaRegionLabel({ regionScope: 'CITY', stateCode: 'SC', cityName: 'Joaçaba' }), 'Joaçaba · SC')
})

test('afinidade regional classifica sem bloquear entrada', () => {
  assert.equal(mesaRegionMatch(null, { regionScope: 'NATIONAL' }), 'NATIONAL')
  assert.equal(mesaRegionMatch({ stateCode: 'SC' }, { regionScope: 'NATIONAL' }), 'NATIONAL')
  assert.equal(mesaRegionMatch({}, { regionScope: 'STATE', stateCode: 'SC' }), 'UNKNOWN')
  assert.equal(mesaRegionMatch({ stateCode: 'SC' }, { regionScope: 'STATE', stateCode: 'SC' }), 'STATE')
  assert.equal(mesaRegionMatch({ stateCode: 'SC' }, { regionScope: 'STATE', stateCode: 'RS' }), 'OTHER')
  assert.equal(
    mesaRegionMatch(
      { stateCode: 'SC', cityCode: '4209003' },
      { regionScope: 'CITY', stateCode: 'SC', cityCode: '4209003' },
    ),
    'CITY',
  )
  assert.equal(
    mesaRegionMatch(
      { stateCode: 'SC', cityCode: '4209003' },
      { regionScope: 'CITY', stateCode: 'SC', cityCode: '4204202' },
    ),
    'STATE',
  )
})

test('localização do perfil é opcional e exige estado junto do município', () => {
  const location = normalizeProfileLocation({
    stateCode: 'sc',
    cityCode: '4209003',
    cityName: 'Joaçaba',
  })
  assert.equal(location.countryCode, 'BR')
  assert.equal(location.stateCode, 'SC')
  assert.throws(
    () => normalizeProfileLocation({ cityCode: '4209003', cityName: 'Joaçaba' }),
    { code: 'mesa_region_invalid' },
  )
  assert.deepEqual(
    normalizeProfileLocation({ countryCode: 'BR', stateCode: null }),
    { countryCode: 'BR', stateCode: null, cityCode: null, cityName: null },
  )
})

test('schema de criação rejeita abrangência incompleta', () => {
  const base = {
    name: 'Mesa regional válida',
    description: 'Regras da Mesa.',
    startDate: '2099-08-01T03:00:00.000Z',
    category: 'PAID',
    eligibility: 'ALL',
    accessCost: 20,
    maxParticipants: 2,
    durationRounds: 2,
    prizeDistribution: [{ position: 1, percentage: 100 }],
  }
  assert.equal(CreateMesaSchema.safeParse({ ...base, regionScope: 'STATE' }).success, false)
  assert.equal(CreateMesaSchema.safeParse({ ...base, regionScope: 'STATE', stateCode: 'SC' }).success, true)
  assert.equal(CreateMesaSchema.safeParse({ ...base, regionScope: 'CITY', stateCode: 'SC' }).success, false)
  assert.equal(
    CreateMesaSchema.safeParse({
      ...base,
      regionScope: 'CITY',
      stateCode: 'SC',
      cityCode: '4209003',
      cityName: 'Joaçaba',
    }).success,
    true,
  )
})
