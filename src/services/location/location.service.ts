import axios from 'axios'
import { AppError } from '../../errors/AppError'

export const STATES = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')
export type City = { cityCode: string; cityName: string; stateCode: string }
const cache = new Map<string, { expires: number; cities: City[] }>()
const requests = new Map<string, Promise<City[]>>()

export class LocationService {
  static async cities(state: string): Promise<City[]> {
    const uf = state.toUpperCase()
    if (!STATES.includes(uf)) throw AppError.badRequest('Selecione um estado válido')
    const saved = cache.get(uf)
    if (saved && saved.expires > Date.now()) return saved.cities
    const pending = requests.get(uf)
    if (pending) return pending
    const request = (async () => {
      try {
        const { data } = await axios.get(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`, { timeout: 8000, maxContentLength: 2_000_000 })
        if (!Array.isArray(data) || !data.length) throw new Error('Invalid city catalog')
        const cities = data.map((c: { id: number; nome: string }) => ({ cityCode: String(c.id), cityName: c.nome, stateCode: uf }))
        if (cities.some(c => !/^\d{7}$/.test(c.cityCode) || typeof c.cityName !== 'string')) throw new Error('Invalid city')
        cache.set(uf, { expires: Date.now() + 86_400_000, cities })
        return cities
      } catch {
        if (saved) return saved.cities
        throw new AppError('Consulta de cidades indisponível. Tente novamente.', 'location_unavailable', 503)
      } finally { requests.delete(uf) }
    })()
    requests.set(uf, request)
    return request
  }

  static async canonical(input: { stateCode?: string | null; cityCode?: string | null; cityName?: string | null }) {
    if (!input.stateCode) return input
    if (!STATES.includes(input.stateCode)) throw AppError.badRequest('Selecione um estado válido')
    if (!input.cityCode) return input
    const city = (await this.cities(input.stateCode)).find(c => c.cityCode === input.cityCode)
    if (!city) throw AppError.badRequest('Município não pertence ao estado selecionado', 'location_invalid')
    return { ...input, ...city }
  }

  static async postalCode(value: string): Promise<City> {
    if (!/^\d{5}-?\d{3}$/.test(value)) throw AppError.badRequest('Informe um CEP válido com 8 dígitos')
    let data: { erro?: boolean; uf?: string; ibge?: string }
    try {
      const response = await axios.get(`https://viacep.com.br/ws/${value.replace('-', '')}/json/`, { timeout: 6000, maxContentLength: 16000 })
      data = response.data
    } catch { throw new AppError('Consulta de CEP indisponível. Busque pelo nome da cidade.', 'postal_code_unavailable', 503) }
    if (!data || data.erro || !data.uf || !data.ibge) throw AppError.badRequest('CEP não encontrado. Busque pelo nome da cidade.', 'postal_code_not_found')
    const city = (await this.cities(data.uf)).find(c => c.cityCode === data.ibge)
    if (!city) throw AppError.badRequest('Município do CEP não encontrado. Busque pelo nome da cidade.')
    return city
  }
}
