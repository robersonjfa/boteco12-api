export const BOTECO12_QUEUE_NAME = 'boteco12-jobs' as const

export const JOB_NAMES = {
  OPEN_SCHEDULED_ROUNDS: 'open-scheduled-rounds',
  CLOSE_SCHEDULED_ROUNDS: 'close-scheduled-rounds',
  CLOSE_EXPIRED_RANKINGS: 'close-expired-rankings',
  PUBLISH_SCHEDULED_MESAS: 'publish-scheduled-mesas',
  ENSURE_MONTHLY_RANKINGS: 'ensure-monthly-rankings',
  RECONCILE_MONTHLY_RANKINGS: 'reconcile-monthly-rankings',
  REVALIDATE_SUBSCRIPTIONS: 'revalidate-subscriptions',
} as const

export type Boteco12JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES]

export const SCHEDULER_IDS = {
  OPEN_SCHEDULED_ROUNDS: 'scheduler:open-scheduled-rounds',
  CLOSE_SCHEDULED_ROUNDS: 'scheduler:close-scheduled-rounds',
  CLOSE_EXPIRED_RANKINGS: 'scheduler:close-expired-rankings',
  PUBLISH_SCHEDULED_MESAS: 'scheduler:publish-scheduled-mesas',
  ENSURE_MONTHLY_RANKINGS: 'scheduler:ensure-monthly-rankings',
  RECONCILE_MONTHLY_RANKINGS: 'scheduler:reconcile-monthly-rankings',
  REVALIDATE_SUBSCRIPTIONS: 'scheduler:revalidate-subscriptions',
} as const

export const SCHEDULE_TIMEZONE = 'America/Sao_Paulo'

/** Every minute */
export const EVERY_MINUTE_MS = 60_000

/** Hourly reconciliation cron (minute 5) in Sao Paulo */
export const RECONCILE_MONTHLY_CRON = '5 * * * *'

/** Hourly subscription reconciliation (minute 10) in Sao Paulo */
export const REVALIDATE_SUBSCRIPTIONS_CRON = '10 * * * *'

/** Day 1 at 00:00 America/Sao_Paulo */
export const ENSURE_MONTHLY_CRON = '0 0 1 * *'
