import { InternalJobRunnerService } from '../internal/internal-job-runner.service'
import { RevalidateActiveSubscriptionsService } from '../subscription/revalidate-active-subscriptions.service'

export class RevalidateSubscriptionsJobService {
  static async execute(now = new Date()) {
    const referenceId = now.toISOString().slice(0, 13)

    return InternalJobRunnerService.execute({
      jobName: 'REVALIDATE_SUBSCRIPTIONS',
      referenceId,
      run: () => RevalidateActiveSubscriptionsService.execute(now),
    })
  }
}
