import { AppError } from '../../errors/AppError'
import { MesaDurationMode, MesaRegistrationCloseMode } from '@prisma/client'

export function assertMesaScheduleRules(input: {
  registrationCloseMode?: MesaRegistrationCloseMode
  durationMode?: MesaDurationMode
  entryEndDate?: Date | null
  endDate?: Date | null
  maxParticipants?: number | null
  durationRounds?: number | null
}) {
  const registration = input.registrationCloseMode ?? MesaRegistrationCloseMode.CAPACITY
  const duration = input.durationMode ?? MesaDurationMode.ROUNDS

  if (registration === MesaRegistrationCloseMode.CAPACITY) {
    if (!input.maxParticipants || input.maxParticipants < 2) {
      throw AppError.badRequest('Informe pelo menos dois lugares disponíveis', 'mesa_capacity_required')
    }
    if (input.entryEndDate) {
      throw AppError.badRequest('Mesa por lugares não utiliza data final das inscrições', 'mesa_entry_end_not_allowed')
    }
    if (duration !== MesaDurationMode.ROUNDS || !input.durationRounds) {
      throw AppError.badRequest('Mesa por lugares deve encerrar por quantidade de rodadas', 'mesa_round_duration_required')
    }
    if (input.endDate) {
      throw AppError.badRequest('Mesa por rodadas não utiliza data de fechamento', 'mesa_end_date_not_allowed')
    }
    return
  }

  if (input.maxParticipants != null) {
    throw AppError.badRequest('Mesa com inscrições por data não utiliza limite de lugares', 'mesa_capacity_not_allowed')
  }
  if (!input.entryEndDate) {
    throw AppError.badRequest('Informe a data final das inscrições', 'mesa_entry_end_required')
  }
  if (duration !== MesaDurationMode.DATE || !input.endDate) {
    throw AppError.badRequest('Informe a data de fechamento da Mesa', 'mesa_end_date_required')
  }
  if (input.durationRounds != null) {
    throw AppError.badRequest('Mesa com fechamento por data não utiliza quantidade de rodadas', 'mesa_round_duration_not_allowed')
  }
}
