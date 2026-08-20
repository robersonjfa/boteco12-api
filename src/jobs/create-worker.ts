import { Worker, WorkerOptions } from 'bullmq'
import { BullmqConfig } from './config'
import { BOTECO12_QUEUE_NAME } from './constants'
import { getBullmqConnectionOptions } from './redis-connection'
import { processBoteco12Job } from './processors/process-boteco12-job'
import { logger } from '../lib/logger'

export function createBoteco12Worker(config: BullmqConfig): Worker {
  const options: WorkerOptions = {
    connection: getBullmqConnectionOptions(config.REDIS_URL),
    prefix: config.BULLMQ_PREFIX,
    concurrency: config.BULLMQ_WORKER_CONCURRENCY,
  }

  const worker = new Worker(BOTECO12_QUEUE_NAME, processBoteco12Job, options)

  worker.on('completed', job => {
    logger.info(
      { jobId: job.id, jobName: job.name },
      'BullMQ job completed'
    )
  })

  worker.on('failed', (job, err) => {
    logger.error(
      {
        jobId: job?.id,
        jobName: job?.name,
        attemptsMade: job?.attemptsMade,
        err,
      },
      'BullMQ job failed'
    )
  })

  worker.on('error', err => {
    logger.error({ err }, 'BullMQ worker error')
  })

  return worker
}
