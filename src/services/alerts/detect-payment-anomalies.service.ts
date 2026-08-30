import { prisma } from '../../lib/prisma';
import { AlertDispatcherService } from './alert-dispatcher.service';
import { approvedWalletCreditNotCreditedWhere } from './payment-anomaly-rules';

export class DetectPaymentAlertsService {
  static async execute(): Promise<void> {
    const timestamp = new Date().toISOString();

    const anomalousPayments = await prisma.payment.findMany({
      where: approvedWalletCreditNotCreditedWhere,
    });

    for (const payment of anomalousPayments) {
      await AlertDispatcherService.dispatch({
        level: 'CRITICAL',
        service: 'DetectPaymentAlertsService',
        action: 'payment.approved_not_credited',
        message: 'Pagamento aprovado sem crédito na wallet',
        timestamp,
        data: {
          paymentId: payment.id,
          userId: payment.userId,
        },
      });
    }
  }
}
