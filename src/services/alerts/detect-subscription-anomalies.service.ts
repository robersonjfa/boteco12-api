import { prisma } from '../../lib/prisma';
import { AlertDispatcherService } from './alert-dispatcher.service';

export class DetectSubscriptionAlertsService {
  static async execute(): Promise<void> {
    const timestamp = new Date().toISOString();

    const subscriptions = await prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        endAt: { lte: new Date() },
      },
    });

    for (const sub of subscriptions) {
      await AlertDispatcherService.dispatch({
        level: 'CRITICAL',
        service: 'DetectSubscriptionAlertsService',
        action: 'subscription.state_mismatch',
        message: `Assinatura ACTIVE com vigência encerrada (${sub.endAt?.toISOString() ?? 'sem fim'})`,
        timestamp,
        data: {
          subscriptionId: sub.id,
          userId: sub.userId,
          status: sub.status,
          endAt: sub.endAt?.toISOString() ?? null,
        },
      });
    }
  }
}
