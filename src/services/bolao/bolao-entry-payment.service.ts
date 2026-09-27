import { Prisma } from '@prisma/client'
import { AppError } from '../../errors/AppError'

export class BolaoEntryPaymentService {
  static async debit(
    tx: Prisma.TransactionClient,
    input: { rankingId: string; userId: string; amount: number }
  ) {
    const wallet = await tx.wallet.findUnique({
      where: { userId: input.userId },
      select: { id: true, balance: true },
    })

    if (!wallet || wallet.balance < input.amount) {
      throw AppError.badRequest(
        'Participante não possui tampinhas suficientes para acessar esta Mesa',
        'insufficient_balance'
      )
    }

    const debit = await tx.wallet.updateMany({
      where: { id: wallet.id, balance: { gte: input.amount } },
      data: { balance: { decrement: input.amount } },
    })
    if (debit.count !== 1) {
      throw AppError.badRequest(
        'Participante não possui tampinhas suficientes para acessar esta Mesa',
        'insufficient_balance'
      )
    }

    await tx.walletLedger.create({
      data: {
        walletId: wallet.id,
        type: 'DEBIT',
        amount: input.amount,
        description: `Acesso à Mesa ${input.rankingId}`,
        idempotencyKey: `bolao:entry:${input.rankingId}:${input.userId}`,
      },
    })
  }
}
