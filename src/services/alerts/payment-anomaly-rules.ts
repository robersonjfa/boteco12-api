import { PaymentPurpose, PaymentStatus, Prisma } from '@prisma/client'

export const approvedWalletCreditNotCreditedWhere = {
  status: PaymentStatus.APPROVED,
  purpose: PaymentPurpose.WALLET_CREDIT,
  isCredited: false,
} satisfies Prisma.PaymentWhereInput
