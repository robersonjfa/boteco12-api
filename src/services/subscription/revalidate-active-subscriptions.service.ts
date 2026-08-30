import { prisma } from '../../lib/prisma';
import { MercadoPagoClient } from '../../lib/mercado-pago.client';

/**
 * Revalida assinaturas ativas no Mercado Pago
 *
 * EXECUÇÃO:
 * - Job interno
 * - Pode rodar 1x ao dia
 *
 * FUNÇÃO:
 * - Corrigir estados inconsistentes
 * - Garantir que a assinatura local esteja correta
 *
 * NÃO:
 * - Não cria pagamento
 * - Não credita wallet
 * - Não altera histórico
 */
export class RevalidateActiveSubscriptionsService {
  static async execute(now = new Date()) {
    const expiredFixedTerm = await prisma.subscription.updateMany({
      where: {
        status: 'ACTIVE',
        endAt: { lte: now },
        externalSubscriptionId: null,
      },
      data: { status: 'EXPIRED' },
    });

    if (!process.env.MP_ACCESS_TOKEN) {
      return {
        expiredFixedTerm: expiredFixedTerm.count,
        revalidatedExternal: 0,
        updatedExternal: 0,
        failedExternal: 0,
      };
    }

    const mpClient = new MercadoPagoClient(process.env.MP_ACCESS_TOKEN);

    /**
     * 1️⃣ Buscar assinaturas ativas locais (Mercado Pago)
     */
    const activeSubscriptions = await prisma.subscription.findMany({
      where: {
        provider: 'MERCADO_PAGO',
        status: 'ACTIVE',
        externalSubscriptionId: {
          not: null,
        },
      },
    });

    let updatedExternal = 0;
    let failedExternal = 0;

    for (const subscription of activeSubscriptions) {
      try {
        /**
         * 2️⃣ Buscar estado real no MP
         */
        const mpSubscription = await mpClient.getSubscription(
          subscription.externalSubscriptionId!
        );

        /**
         * 3️⃣ Mapear status
         */
        const statusMap: Record<string, 'ACTIVE' | 'CANCELLED' | 'EXPIRED'> = {
          authorized: 'ACTIVE',
          paused: 'ACTIVE',
          cancelled: 'CANCELLED',
          expired: 'EXPIRED',
        };

        const mappedStatus =
          statusMap[mpSubscription.status] ?? 'EXPIRED';

        /**
         * 4️⃣ Atualizar assinatura se necessário
         */
        if (mappedStatus !== subscription.status) {
          await prisma.subscription.update({
            where: {
              id: subscription.id,
            },
            data: {
              status: mappedStatus,
              endAt: mpSubscription.end_date
                ? new Date(mpSubscription.end_date)
                : subscription.endAt,
            },
          });
          updatedExternal += 1;
        }
      } catch (error) {
        /**
         * Falha pontual não interrompe o job
         */
        console.error(
          `[SUBSCRIPTION REVALIDATE ERROR]`,
          subscription.id,
          error
        );
        failedExternal += 1;
      }
    }

    return {
      expiredFixedTerm: expiredFixedTerm.count,
      revalidatedExternal: activeSubscriptions.length,
      updatedExternal,
      failedExternal,
    };
  }
}
