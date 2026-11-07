const test = require('node:test')
const assert = require('node:assert/strict')
const axios = require('axios')
const { LocationService } = require('../dist/services/location/location.service')
test('catálogo canônico, CEP e fallback não guardam endereço', async t => {
  const original = axios.get
  t.after(() => { axios.get = original })
  const calls = []
  axios.get = async url => {
    calls.push(url)
    if (url.includes('ibge.gov.br')) return { data: [{ id: 4209003, nome: 'Joaçaba' }] }
    if (url.includes('/89600000/')) return { data: { ibge: '4209003', localidade: 'Nome não canônico', uf: 'SC', logradouro: 'Endereço que não deve sair', bairro: 'Bairro', cep: '89600-000' } }
    if (url.includes('/00000000/')) return { data: { erro: true } }
    throw new Error('outage')
  }
  assert.deepEqual(await LocationService.postalCode('89600-000'), { cityCode: '4209003', cityName: 'Joaçaba', stateCode: 'SC' })
  assert.equal((await LocationService.canonical({ stateCode:'SC', cityCode:'4209003',cityName:'errado' })).cityName,'Joaçaba')
  await assert.rejects(LocationService.canonical({stateCode:'SC',cityCode:'9999999'}),/não pertence/)
  await assert.rejects(LocationService.cities('ZZ'),/estado válido/)
  await assert.rejects(LocationService.postalCode('123'),/8 dígitos/)
  await assert.rejects(LocationService.postalCode('00000000'),/não encontrado/)
  await assert.rejects(LocationService.postalCode('99999999'),/indisponível/)
  assert.equal(calls.filter(url=>url.includes('ibge.gov.br')).length,1)
})
