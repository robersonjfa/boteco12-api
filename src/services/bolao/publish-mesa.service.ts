import { prisma } from '../../lib/prisma'
import { AppError } from '../../errors/AppError'
import { AssertActiveProUserService } from '../subscription/assert-active-pro-user.service'

type PublishMesaInput = {
  rankingId: string
  requestedByUserId: string
}

export class PublishMesaService {
  static async execute({ rankingId, requestedByUserId }: PublishMesaInput) {
    const mesa = await prisma.ranking.findUnique({
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
    if (mesa.category === 'PAID') {
      await AssertActiveProUserService.execute(requestedByUserId)
    }

    const publishedAt = new Date()
    return prisma.ranking.update({
      where: { id: rankingId },
      data: {
        status: 'ACTIVE',
        publishedAt,
      },
    })
  }
}
