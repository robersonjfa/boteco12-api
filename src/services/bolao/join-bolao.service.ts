import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { RankingWindowScoreService } from '../ranking/ranking-window-score.service';
import { BolaoRegistrationWindowService } from './bolao-registration-window.service';
import { BolaoEntryPaymentService } from './bolao-entry-payment.service';
import { BolaoPrizeService } from './bolao-prize.service';
import { AssertActiveProUserService } from '../subscription/assert-active-pro-user.service';
import { MesaCategoryRules } from './mesa-category-rules';

type JoinBolaoInput = {
  rankingId: string;
  userId: string;
  creatorPublication?: boolean;
};

export class JoinBolaoService {
  static async execute(
    input: JoinBolaoInput,
    transaction?: Prisma.TransactionClient
  ) {
    if (transaction) {
      return this.executeInTransaction(transaction, input);
    }

    return prisma.$transaction(tx => this.executeInTransaction(tx, input));
  }

  private static async executeInTransaction(
    tx: Prisma.TransactionClient,
    { rankingId, userId, creatorPublication = false }: JoinBolaoInput
  ) {
      const bolao = await tx.ranking.findUnique({
        where: { id: rankingId },
        select: {
          id: true,
          type: true,
          status: true,
          entryFee: true,
          accessCost: true,
          category: true,
          eligibility: true,
          registrationCloseMode: true,
          sponsorPrizePool: true,
          maxParticipants: true,
          currentParticipants: true,
          createdByUserId: true,
          startDate: true,
          entryEndDate: true,
          endDate: true,
        },
      });

      if (!bolao) {
        throw new Error('Mesa não encontrada');
      }

      if (bolao.type !== 'BOLAO') {
        throw new Error('Ranking não é uma Mesa');
      }

      if (bolao.status !== 'ACTIVE') {
        throw new Error('Esta Mesa não está aberta para novos participantes');
      }

      const accessCost = bolao.accessCost ?? bolao.entryFee;
      const hasPaidEntry = MesaCategoryRules.hasPaidEntry(bolao);

      if (!creatorPublication) {
        await this.assertEligibility(bolao.eligibility, userId);
      }

      if (!creatorPublication) {
        BolaoRegistrationWindowService.assertOpen(bolao);
      }
      if ((bolao.registrationCloseMode ?? 'CAPACITY') === 'CAPACITY') {
        MesaCategoryRules.assertCapacity(bolao);
      }

      const existingParticipant = await tx.rankingParticipant.findUnique({
        where: {
          rankingId_userId: {
            rankingId,
            userId,
          },
        },
      });

      if (existingParticipant?.status === 'APPROVED') {
        throw new Error('Você já participa desta Mesa');
      }

      if (existingParticipant?.entryPaidAt) {
        throw new Error('O acesso desta participação já foi debitado');
      }

      const baselineAt = BolaoRegistrationWindowService.baselineAt(bolao);
      const scoreInitial = await RankingWindowScoreService.getScoreTotalBefore(
        tx,
        userId,
        baselineAt
      );

      if (hasPaidEntry) {
        await BolaoEntryPaymentService.debit(tx, {
          rankingId,
          userId,
          amount: accessCost,
        });
      }

      const approvedAt = new Date();
      const seatReservedByCapacity =
        (bolao.registrationCloseMode ?? 'CAPACITY') === 'CAPACITY';
      if (seatReservedByCapacity) {
        const reservation = await tx.ranking.updateMany({
          where: {
            id: rankingId,
            currentParticipants: { lt: bolao.maxParticipants! },
          },
          data: {
            currentParticipants: { increment: 1 },
            ...(bolao.currentParticipants + 1 === bolao.maxParticipants
              ? { registrationClosedAt: approvedAt }
              : {}),
            ...(hasPaidEntry ? { grossCollected: { increment: accessCost } } : {}),
          },
        });
        if (reservation.count !== 1) {
          throw new Error('Esta Mesa atingiu o limite de participantes');
        }
      }

      const participant = existingParticipant
        ? await tx.rankingParticipant.update({
            where: { id: existingParticipant.id },
            data: {
              status: 'APPROVED',
              scoreInitial,
              rejectedAt: null,
              approvedAt,
              approvedByUserId: userId,
              entryFeePaid: hasPaidEntry ? accessCost : 0,
              entryPaidAt: hasPaidEntry ? approvedAt : null,
            },
          })
        : await tx.rankingParticipant.create({
            data: {
              rankingId,
              userId,
              score: 0,
              scoreInitial,
              status: 'APPROVED',
              approvedAt,
              approvedByUserId: userId,
              entryFeePaid: hasPaidEntry ? accessCost : 0,
              entryPaidAt: hasPaidEntry ? approvedAt : null,
            },
          });

      if (!seatReservedByCapacity || hasPaidEntry) {
        const financialRanking = seatReservedByCapacity
          ? await tx.ranking.findUniqueOrThrow({
              where: { id: rankingId },
              select: { grossCollected: true },
            })
          : await tx.ranking.update({
              where: { id: rankingId },
              data: {
                currentParticipants: { increment: 1 },
                ...(hasPaidEntry ? { grossCollected: { increment: accessCost } } : {}),
              },
              select: { grossCollected: true },
            });

        if (hasPaidEntry) {
          const financialTotals = BolaoPrizeService.calculatePool(
            financialRanking.grossCollected
          );
          const rewardPool = financialTotals.prizePool +
            (MesaCategoryRules.isSponsored(bolao) ? bolao.sponsorPrizePool : 0);
          await tx.ranking.update({
            where: { id: rankingId },
            data: {
              platformFee: financialTotals.platformFee,
              prizePool: rewardPool,
              rewardPool,
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          userId,
          action: 'BOLAO_JOIN_APPROVED',
          entity: 'RANKING_PARTICIPANT',
          entityId: participant.id,
          metadata: {
            rankingId,
            participantUserId: userId,
            approvedAt: approvedAt.toISOString(),
            scoreInitial,
            currentParticipants: bolao.currentParticipants + 1,
            accessCost,
            entryFee: accessCost,
            category: MesaCategoryRules.category(bolao),
            approvalRequired: false,
          },
        },
      });

      return {
        status: 'APPROVED',
        rankingId,
        participantId: participant.id,
      };
  }

  private static async assertEligibility(
    eligibility: 'ALL' | 'SUBSCRIBERS_ONLY' | 'FREE_ONLY' | null | undefined,
    userId: string
  ) {
    const rule = eligibility ?? 'SUBSCRIBERS_ONLY';
    if (rule === 'ALL') return;

    if (rule === 'SUBSCRIBERS_ONLY') {
      await AssertActiveProUserService.execute(userId);
      return;
    }

    try {
      await AssertActiveProUserService.execute(userId);
    } catch (error) {
      if ((error as { code?: string })?.code === 'pro_subscription_required') return;
      throw error;
    }

    throw new Error('Esta Mesa é exclusiva para quem está Na Calçada');
  }
}
