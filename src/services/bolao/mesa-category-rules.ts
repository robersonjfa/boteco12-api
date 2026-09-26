import { MesaCategory, MesaRegistrationCloseMode } from '@prisma/client'

export type MesaCategoryTerms = {
  category?: MesaCategory | null
  accessCost?: number | null
  entryFee?: number | null
  sponsorPrizePool?: number | null
  maxParticipants?: number | null
  registrationCloseMode?: MesaRegistrationCloseMode | null
}

export class MesaCategoryRules {
  static category(value: MesaCategoryTerms) {
    return value.category ?? MesaCategory.PAID
  }

  static isPaid(value: MesaCategoryTerms) {
    return this.category(value) === MesaCategory.PAID
  }

  static isSponsored(value: MesaCategoryTerms) {
    return this.category(value) === MesaCategory.SPONSORED_FREE
  }

  static isFree(value: MesaCategoryTerms) {
    return this.category(value) === MesaCategory.FREE
  }

  static hasPaidEntry(value: MesaCategoryTerms) {
    return (value.accessCost ?? value.entryFee ?? 0) > 0
  }

  static hasCapacity(value: MesaCategoryTerms) {
    return value.maxParticipants != null
  }

  static validate(value: MesaCategoryTerms) {
    const category = this.category(value)
    if (!Object.values(MesaCategory).includes(category)) {
      throw new Error('Categoria de Mesa inválida')
    }
    const accessCost = value.accessCost ?? value.entryFee ?? 0
    const sponsorPrizePool = value.sponsorPrizePool ?? 0
    const maxParticipants = value.maxParticipants

    const registrationCloseMode = value.registrationCloseMode ?? MesaRegistrationCloseMode.CAPACITY
    if (
      registrationCloseMode === MesaRegistrationCloseMode.CAPACITY &&
      (!Number.isInteger(maxParticipants) || maxParticipants! <= 0)
    ) {
      throw new Error('Informe um limite de usuários maior que zero')
    }
    if (maxParticipants != null && (!Number.isInteger(maxParticipants) || maxParticipants <= 0)) {
      throw new Error('Informe um limite de usuários maior que zero')
    }

    if (category === MesaCategory.PAID) {
      if (registrationCloseMode !== MesaRegistrationCloseMode.CAPACITY) {
        throw new Error('Mesa com Tampinhas encerra inscrições somente por lotação')
      }
      if (!Number.isInteger(accessCost) || accessCost <= 0) {
        throw new Error('O acesso em tampinhas deve ser maior que zero')
      }
      if (sponsorPrizePool !== 0) {
        throw new Error('Mesa com Tampinhas não utiliza premiação patrocinada')
      }
    } else if (category === MesaCategory.SPONSORED_FREE) {
      if (!Number.isInteger(accessCost) || accessCost < 0) {
        throw new Error('O acesso em tampinhas deve ser um número inteiro não negativo')
      }
      if (!Number.isInteger(sponsorPrizePool) || sponsorPrizePool <= 0) {
        throw new Error('Informe a premiação patrocinada em Tampinhas')
      }
    } else {
      if (accessCost !== 0 || sponsorPrizePool !== 0) {
        throw new Error('Mesa Free não possui cobrança nem recompensa em Tampinhas')
      }
    }

    return { category, accessCost, sponsorPrizePool, maxParticipants, registrationCloseMode }
  }

  static assertCapacity(value: MesaCategoryTerms & { currentParticipants: number }) {
    if (!Number.isInteger(value.maxParticipants) || value.maxParticipants! <= 0) {
      throw new Error('Esta Mesa precisa de um limite de participantes válido')
    }
    if (value.currentParticipants >= value.maxParticipants!) {
      throw new Error('Esta Mesa atingiu o limite de participantes')
    }
  }
}
