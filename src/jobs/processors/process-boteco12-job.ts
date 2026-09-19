import { Job } from 'bullmq'
import { JOB_NAMES, Boteco12JobName } from '../constants'
import { OpenScheduledRoundsJobService } from '../../services/jobs/open-scheduled-rounds.job.service'
import { CloseScheduledRoundsJobService } from '../../services/jobs/close-scheduled-rounds.job.service'
import { CloseExpiredRankingsJobService } from '../../services/jobs/close-expired-rankings.job.service'
import { EnsureMonthlyRankingsJobService } from '../../services/jobs/ensure-monthly-rankings.job.service'
import { RevalidateSubscriptionsJobService } from '../../services/jobs/revalidate-subscriptions.job.service'
import { logger } from '../../lib/logger'
import { PublishScheduledMesasJobService } from '../../services/jobs/publish-scheduled-mesas.job.service'

export async function processBoteco12Job(job: Job) {
  const name = job.name as Boteco12JobName

  logger.info(
    { jobId: job.id, jobName: name, attemptsMade: job.attemptsMade },
    'BullMQ job started'
  )

  switch (name) {
    case JOB_NAMES.OPEN_SCHEDULED_ROUNDS:
      return OpenScheduledRoundsJobService.execute()
    case JOB_NAMES.CLOSE_SCHEDULED_ROUNDS:
      return CloseScheduledRoundsJobService.execute()
    case JOB_NAMES.CLOSE_EXPIRED_RANKINGS:
      return CloseExpiredRankingsJobService.execute()
    case JOB_NAMES.PUBLISH_SCHEDULED_MESAS:
      return PublishScheduledMesasJobService.execute()
    case JOB_NAMES.ENSURE_MONTHLY_RANKINGS:
      return EnsureMonthlyRankingsJobService.execute({ source: 'schedule' })
    case JOB_NAMES.RECONCILE_MONTHLY_RANKINGS:
      return EnsureMonthlyRankingsJobService.execute({ source: 'reconcile' })
    case JOB_NAMES.REVALIDATE_SUBSCRIPTIONS:
      return RevalidateSubscriptionsJobService.execute()
    default:
      throw new Error(`Unknown Boteco12 job name: ${String(name)}`)
  }
}

export function listRoutableJobNames(): Boteco12JobName[] {
  return Object.values(JOB_NAMES)
}
