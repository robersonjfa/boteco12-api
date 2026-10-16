import { AppError } from '../../errors/AppError'
import { SaoPauloPeriodService } from '../time/sao-paulo-period.service'

/** Existing dates may be retained exactly; newly chosen dates start today or later. */
export function assertMesaStartDate(startDate: Date, previousStartDate?: Date | null) {
  if (!Number.isFinite(startDate.getTime())) {
    throw AppError.badRequest('Informe uma data de início válida', 'mesa_start_date_invalid')
  }
  if (previousStartDate?.getTime() === startDate.getTime()) return

  const { year, month, day } = SaoPauloPeriodService.parts(new Date())
  const startOfToday = SaoPauloPeriodService.fromLocal({
    year, month, day,
  })
  if (startDate < startOfToday) {
    throw AppError.badRequest(
      'O início das inscrições deve ser hoje ou depois, no horário de São Paulo',
      'mesa_start_date_in_past',
      { field: 'startDate' }
    )
  }
}
