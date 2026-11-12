import { ProcessDuelGamificationService } from '../duel-gamification/process-duel-gamification.service'

export class ProcessDuelGamificationJobService {
  static execute() {
    return ProcessDuelGamificationService.execute()
  }
}
