import { MesaRegionScope } from '@prisma/client'
import { AppError } from '../../errors/AppError'

/**
 * Regionalizacao opcional de Mesas.
 *
 * Mesa nasce nacional. Estado/municipio so existem quando a abrangencia exige,
 * e o codigo IBGE do municipio e a identidade — nunca o nome em texto livre.
 */
export type MesaRegionInput = {
  regionScope?: MesaRegionScope | null
  countryCode?: string | null
  stateCode?: string | null
  cityCode?: string | null
  cityName?: string | null
}

export type NormalizedMesaRegion = {
  regionScope: MesaRegionScope
  countryCode: string
  stateCode: string | null
  cityCode: string | null
  cityName: string | null
}

export type MesaRegionMatch = 'CITY' | 'STATE' | 'NATIONAL' | 'OTHER' | 'UNKNOWN'

const DEFAULT_COUNTRY = 'BR'
const UF_PATTERN = /^[A-Z]{2}$/
const IBGE_CITY_PATTERN = /^\d{7}$/

function invalid(message: string): never {
  throw AppError.badRequest(message, 'mesa_region_invalid')
}

function normalizeStateCode(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim().toUpperCase()
  return trimmed.length === 0 ? null : trimmed
}

/**
 * Valida e normaliza a abrangencia. `NATIONAL` ignora estado/municipio;
 * `STATE` exige UF e nao aceita municipio; `CITY` exige UF, codigo IBGE e nome.
 */
export function normalizeMesaRegion(input: MesaRegionInput): NormalizedMesaRegion {
  const regionScope = input.regionScope ?? MesaRegionScope.NATIONAL
  const countryCode = (input.countryCode?.trim().toUpperCase() || DEFAULT_COUNTRY)

  if (!Object.values(MesaRegionScope).includes(regionScope)) {
    invalid('Abrangência de Mesa inválida')
  }

  if (regionScope === MesaRegionScope.NATIONAL) {
    return { regionScope, countryCode, stateCode: null, cityCode: null, cityName: null }
  }

  const stateCode = normalizeStateCode(input.stateCode)
  if (!stateCode || !UF_PATTERN.test(stateCode)) {
    invalid('Informe a sigla do estado para esta abrangência')
  }

  if (regionScope === MesaRegionScope.STATE) {
    return { regionScope, countryCode, stateCode, cityCode: null, cityName: null }
  }

  const cityCode = input.cityCode?.trim() || null
  const cityName = input.cityName?.trim() || null
  if (!cityCode || !IBGE_CITY_PATTERN.test(cityCode)) {
    invalid('Informe o código IBGE do município')
  }
  if (!cityName) {
    invalid('Informe o nome do município')
  }

  return { regionScope, countryCode, stateCode, cityCode, cityName }
}

export function mesaRegionLabel(region: {
  regionScope: MesaRegionScope
  stateCode?: string | null
  cityName?: string | null
}): string {
  if (region.regionScope === MesaRegionScope.NATIONAL) return 'Todo o Brasil'
  if (region.regionScope === MesaRegionScope.STATE) return region.stateCode ?? 'Brasil'
  return region.cityName
    ? `${region.cityName} · ${region.stateCode ?? ''}`.trim()
    : region.stateCode ?? 'Brasil'
}

/**
 * Afinidade regional entre o perfil do cliente e a Mesa. Nunca restringe
 * entrada: serve apenas para ordenar/filtrar descoberta.
 */
export function mesaRegionMatch(
  profile: { stateCode?: string | null; cityCode?: string | null } | null | undefined,
  mesa: { regionScope?: MesaRegionScope | null; stateCode?: string | null; cityCode?: string | null },
): MesaRegionMatch {
  if (!mesa.regionScope || mesa.regionScope === MesaRegionScope.NATIONAL) return 'NATIONAL'
  if (!profile?.stateCode) return 'UNKNOWN'
  if (profile.stateCode !== mesa.stateCode) return 'OTHER'
  if (mesa.regionScope === MesaRegionScope.STATE) return 'STATE'
  if (!profile.cityCode || !mesa.cityCode) return 'STATE'
  return profile.cityCode === mesa.cityCode ? 'CITY' : 'STATE'
}

export type ProfileLocationInput = {
  countryCode?: string | null
  stateCode?: string | null
  cityCode?: string | null
  cityName?: string | null
}

/**
 * Localizacao aproximada do perfil. Todos os campos sao opcionais: o cliente
 * pode limpar a localizacao sem perder acesso ao produto.
 */
export function normalizeProfileLocation(input: ProfileLocationInput) {
  const countryCode = input.countryCode?.trim().toUpperCase() || DEFAULT_COUNTRY
  const stateCode = normalizeStateCode(input.stateCode)
  if (stateCode && !UF_PATTERN.test(stateCode)) {
    invalid('Sigla do estado inválida')
  }
  const cityCode = input.cityCode?.trim() || null
  const cityName = input.cityName?.trim() || null
  if (cityCode && !IBGE_CITY_PATTERN.test(cityCode)) {
    invalid('Código IBGE do município inválido')
  }
  if (cityCode && !stateCode) {
    invalid('Informe o estado junto com o município')
  }
  if (!cityCode) {
    return { countryCode, stateCode, cityCode: null, cityName: null }
  }
  if (!cityName) {
    invalid('Informe o nome do município')
  }
  return { countryCode, stateCode, cityCode, cityName }
}
