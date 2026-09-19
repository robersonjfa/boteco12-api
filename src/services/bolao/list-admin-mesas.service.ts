import { MesaCategory, Prisma, RankingStatus } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { withMesaFinancialNames } from './mesa-financial-names'

type ListAdminMesasInput = {
  bucket?: 'OPEN' | 'CLOSED'
  category?: MesaCategory
  query?: string
  page?: number
  limit?: number
}

const mesaSelect = {
  id: true,
  name: true,
  description: true,
  status: true,
  entryFee: true,
  accessCost: true,
  category: true,
  eligibility: true,
  registrationCloseMode: true,
  durationMode: true,
  durationRounds: true,
  registrationClosedAt: true,
  publishedAt: true,
  sponsorPrizePool: true,
  maxParticipants: true,
  currentParticipants: true,
  startDate: true,
  entryEndDate: true,
  endDate: true,
  prizeDistribution: true,
  grossCollected: true,
  platformFee: true,
  prizePool: true,
  rewardPool: true,
  settledAt: true,
  createdAt: true,
  createdByUserId: true,
  createdBy: {
    select: { id: true, name: true, email: true },
  },
} satisfies Prisma.RankingSelect

export class ListAdminMesasService {
  static async execute(input: ListAdminMesasInput) {
    const bucket = input.bucket ?? 'OPEN'
    const page = input.page ?? 1
    const limit = input.limit ?? 12
    const query = input.query?.trim()

    const baseWhere: Prisma.RankingWhereInput = {
      type: 'BOLAO',
      ...(input.category ? { category: input.category } : {}),
      ...(query ? {
        OR: [
          { id: { equals: query } },
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          {
            createdBy: {
              is: {
                OR: [
                  { name: { contains: query, mode: 'insensitive' } },
                  { email: { contains: query, mode: 'insensitive' } },
                ],
              },
            },
          },
        ],
      } : {}),
    }
    const statuses: RankingStatus[] = bucket === 'CLOSED'
      ? ['CLOSED']
      : ['DRAFT', 'ACTIVE']
    const where: Prisma.RankingWhereInput = {
      ...baseWhere,
      status: { in: statuses },
    }

    const [total, rows, grouped] = await Promise.all([
      prisma.ranking.count({ where }),
      prisma.ranking.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: mesaSelect,
      }),
      prisma.ranking.groupBy({
        by: ['status'],
        where: baseWhere,
        _count: { _all: true },
      }),
    ])

    const counts = grouped.reduce(
      (result, item) => {
        if (item.status === 'CLOSED') result.closed += item._count._all
        else result.open += item._count._all
        return result
      },
      { open: 0, closed: 0 }
    )
    const mesas = rows.map(withMesaFinancialNames)

    return {
      mesas,
      boloes: mesas,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      counts,
    }
  }
}
