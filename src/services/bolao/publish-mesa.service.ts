import { prisma } from '../../lib/prisma'
import { AppError } from '../../errors/AppError'
import { AssertActiveProUserService } from '../subscription/assert-active-pro-user.service'
import { Prisma } from '@prisma/client'
import { JoinBolaoService } from './join-bolao.service'
import { LEGACY_ADMIN_ROLE_NAMES } from '../../domain/admin-roles'

type PublishMesaInput = {
  rankingId: string
  requestedByUserId: string
}

export class PublishMesaService {
  static async execute(
    input: PublishMesaInput,
    transaction?: Prisma.TransactionClient
  ) {
    if (transaction) return this.executeInTransaction(transaction, input)
    return prisma.$transaction(tx => this.executeInTransaction(tx, input))
  }

  private static async executeInTransaction(
    tx: Prisma.TransactionClient,
    { rankingId, requestedByUserId }: PublishMesaInput
  ) {
    const mesa = await tx.ranking.findUnique({
      where: { id: rankingId },
      select: {
        id: true,
        type: true,
        status: true,
        category: true,
        createdByUserId: true,
      },
    })

    if (!mesa || mesa.type !== 'BOLAO') {
      throw AppError.notFound('Mesa', 'mesa_not_found')
    }
    if (mesa.createdByUserId !== requestedByUserId) {
      throw AppError.forbidden('Somente o dono pode publicar esta Mesa', 'mesa_publish_forbidden')
    }
    if (mesa.status !== 'DRAFT') {
      throw AppError.conflict('A Mesa já foi publicada', 'mesa_already_published')
    }
    const creationAudit = await tx.auditLog.findFirst({
      where: {
        action: 'BOLAO_CREATED',
        entity: 'RANKING',
        entityId: rankingId,
      },
      orderBy: { createdAt: 'asc' },
      select: { metadata: true },
    })
    const metadata = creationAudit?.metadata
    const explicitlyAdministrative = Boolean(
      metadata && typeof metadata === 'object' && !Array.isArray(metadata) &&
      (metadata as Prisma.JsonObject).createdByAdmin === true
    )
    const legacyAdminCreation = !creationAudit && Boolean(await tx.userAdminRole.findFirst({
      where: {
        userId: requestedByUserId,
        role: { name: { in: [...LEGACY_ADMIN_ROLE_NAMES] } },
      },
      select: { id: true },
    }))
    const administrativeCreation = explicitlyAdministrative || legacyAdminCreation
    if (mesa.category === 'PAID' && !administrativeCreation) {
      await AssertActiveProUserService.execute(requestedByUserId)
    }
    const publishedAt = new Date()
    const mutation = await tx.ranking.updateMany({
      where: { id: rankingId, status: 'DRAFT' },
      data: {
        status: 'ACTIVE',
        publishedAt,
      },
    })
    if (mutation.count !== 1) {
      throw AppError.conflict('A Mesa já foi publicada', 'mesa_already_published')
    }

    if (!administrativeCreation) {
      await JoinBolaoService.execute({
        rankingId,
        userId: requestedByUserId,
        creatorPublication: true,
      }, tx)
    }

    await tx.auditLog.create({
      data: {
        userId: requestedByUserId,
        action: 'BOLAO_PUBLISHED',
        entity: 'RANKING',
        entityId: rankingId,
        metadata: {
          administrativeCreation,
          autoJoinedCreator: !administrativeCreation,
          publishedAt: publishedAt.toISOString(),
        },
      },
    })

    return tx.ranking.findUniqueOrThrow({ where: { id: rankingId } })
  }
}
