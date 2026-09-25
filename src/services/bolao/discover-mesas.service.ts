import { MesaCategory, Prisma } from '@prisma/client'
import { hasActiveProSubscriptionAt } from '../../domain/subscription'
import { prisma } from '../../lib/prisma'
import { withMesaFinancialNames } from './mesa-financial-names'

export type MesaRegistrationFilter = 'ALL' | 'OPEN' | 'CLOSING_SOON' | 'UPCOMING'
export type MesaAccessFilter = 'ALL' | 'CAN_JOIN'
export type MesaDiscoverySort =
  | 'RECOMMENDED'
  | 'CLOSING_SOON'
  | 'NEWEST'
  | 'LOWEST_COST'
  | 'HIGHEST_REWARD'

type DiscoverMesasInput = {
  userId: string
  query?: string
  category?: MesaCategory
  registration?: MesaRegistrationFilter
  access?: MesaAccessFilter
  sort?: MesaDiscoverySort
  minCost?: number
  maxCost?: number
  page?: number
  limit?: number
  now?: Date
}

type RegistrationState = 'OPEN' | 'CLOSING_SOON' | 'UPCOMING' | 'FULL' | 'CLOSED'
type AccessState =
  | 'CAN_JOIN'
  | 'ALREADY_JOINED'
  | 'OWNER'
  | 'PLAN_REQUIRED'
  | 'SIDEWALK_REQUIRED'
  | 'INSUFFICIENT_BALANCE'
  | 'NOT_OPEN'

const CLOSING_SOON_MS = 72 * 60 * 60 * 1000

function registrationState(mesa: {
  startDate: Date | null
  entryEndDate: Date | null
  registrationClosedAt: Date | null
  maxParticipants: number | null
  currentParticipants: number
}, now: Date): { state: RegistrationState; spotsRemaining: number | null } {
  const spotsRemaining = mesa.maxParticipants == null
    ? null
    : Math.max(mesa.maxParticipants - mesa.currentParticipants, 0)
  if (spotsRemaining === 0) return { state: 'FULL', spotsRemaining }
  if (
    (mesa.registrationClosedAt && mesa.registrationClosedAt <= now) ||
    (mesa.entryEndDate && mesa.entryEndDate <= now)
  ) return { state: 'CLOSED', spotsRemaining }
  if (mesa.startDate && mesa.startDate > now) return { state: 'UPCOMING', spotsRemaining }
  if (
    (mesa.entryEndDate && mesa.entryEndDate.getTime() - now.getTime() <= CLOSING_SOON_MS) ||
    (spotsRemaining != null && spotsRemaining <= 2)
  ) return { state: 'CLOSING_SOON', spotsRemaining }
  return { state: 'OPEN', spotsRemaining }
}

function accessState(input: {
  isOwner: boolean
  joined: boolean
  eligibility: 'ALL' | 'SUBSCRIBERS_ONLY' | 'FREE_ONLY' | null
  isPro: boolean
  registrationState: RegistrationState
  category: MesaCategory
  accessCost: number
  balance: number
}): AccessState {
  if (input.isOwner) return 'OWNER'
  if (input.joined) return 'ALREADY_JOINED'
  if (input.eligibility === 'SUBSCRIBERS_ONLY' && !input.isPro) return 'PLAN_REQUIRED'
  if (input.eligibility === 'FREE_ONLY' && input.isPro) return 'SIDEWALK_REQUIRED'
  if (!['OPEN', 'CLOSING_SOON'].includes(input.registrationState)) return 'NOT_OPEN'
  if (input.category === 'PAID' && input.balance < input.accessCost) return 'INSUFFICIENT_BALANCE'
  return 'CAN_JOIN'
}

function recommendationReason(input: {
  accessState: AccessState
  registrationState: RegistrationState
  category: MesaCategory
}) {
  if (input.accessState !== 'CAN_JOIN') {
    const labels: Record<Exclude<AccessState, 'CAN_JOIN'>, string> = {
      ALREADY_JOINED: 'Você já participa',
      OWNER: 'Criada por você',
      PLAN_REQUIRED: 'Requer assinatura ativa',
      SIDEWALK_REQUIRED: 'Exclusiva para quem está Na Calçada',
      INSUFFICIENT_BALANCE: 'Saldo de Tampinhas insuficiente',
      NOT_OPEN: 'Inscrição indisponível agora',
    }
    return labels[input.accessState]
  }
  if (input.registrationState === 'CLOSING_SOON') return 'Inscrição terminando'
  if (input.category !== 'PAID') return 'Sem custo de entrada'
  return 'Você pode entrar agora'
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
  prizeDistribution: true,
  grossCollected: true,
  platformFee: true,
  prizePool: true,
  rewardPool: true,
  settledAt: true,
  startDate: true,
  entryEndDate: true,
  endDate: true,
  maxParticipants: true,
  currentParticipants: true,
  createdAt: true,
  createdByUserId: true,
  createdBy: { select: { name: true, nickname: true } },
} satisfies Prisma.RankingSelect

export class DiscoverMesasService {
  static async execute(input: DiscoverMesasInput) {
    const now = input.now ?? new Date()
    const page = input.page ?? 1
    const limit = input.limit ?? 12
    const sort = input.sort ?? 'RECOMMENDED'
    const query = input.query?.trim()

    const [user, mesas] = await Promise.all([
      prisma.user.findUnique({
        where: { id: input.userId },
        select: {
          subscription: {
            select: { status: true, plan: true, startAt: true, endAt: true },
          },
          wallet: { select: { balance: true } },
        },
      }),
      prisma.ranking.findMany({
        where: {
          type: 'BOLAO',
          status: 'ACTIVE',
          ...(input.category ? { category: input.category } : {}),
          ...(input.minCost != null || input.maxCost != null ? {
            accessCost: {
              ...(input.minCost != null ? { gte: input.minCost } : {}),
              ...(input.maxCost != null ? { lte: input.maxCost } : {}),
            },
          } : {}),
          ...(query ? {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              {
                createdBy: {
                  is: {
                    OR: [
                      { name: { contains: query, mode: 'insensitive' } },
                      { nickname: { contains: query, mode: 'insensitive' } },
                    ],
                  },
                },
              },
            ],
          } : {}),
        },
        select: {
          ...mesaSelect,
          participants: {
            where: { userId: input.userId, status: 'APPROVED' },
            select: { id: true, status: true },
          },
        },
      }),
    ])

    const isPro = hasActiveProSubscriptionAt(user?.subscription, now)
    const balance = user?.wallet?.balance ?? 0
    let rows = mesas.map(mesa => {
      const registration = registrationState(mesa, now)
      const joined = mesa.participants.length > 0
      const isOwner = mesa.createdByUserId === input.userId
      const access = accessState({
        isOwner,
        joined,
        eligibility: mesa.eligibility,
        isPro,
        registrationState: registration.state,
        category: mesa.category,
        accessCost: mesa.accessCost ?? mesa.entryFee,
        balance,
      })
      const financial = withMesaFinancialNames(mesa)
      return {
        ...financial,
        participants: mesa.currentParticipants,
        ownerName: mesa.createdBy?.nickname?.trim() || mesa.createdBy?.name?.trim() || 'Boteco12',
        isOwner,
        joined,
        participantId: mesa.participants[0]?.id ?? null,
        participantStatus: mesa.participants[0]?.status ?? null,
        registrationState: registration.state,
        accessState: access,
        closesAt: mesa.entryEndDate,
        spotsRemaining: registration.spotsRemaining,
        recommendationReason: recommendationReason({
          accessState: access,
          registrationState: registration.state,
          category: mesa.category,
        }),
      }
    })

    const registrationFilter = input.registration ?? 'ALL'
    if (registrationFilter === 'OPEN') {
      rows = rows.filter(item => ['OPEN', 'CLOSING_SOON'].includes(item.registrationState))
    } else if (registrationFilter !== 'ALL') {
      rows = rows.filter(item => item.registrationState === registrationFilter)
    }
    if ((input.access ?? 'ALL') === 'CAN_JOIN') {
      rows = rows.filter(item => item.accessState === 'CAN_JOIN')
    }

    rows = rows.filter(item =>
      !item.isOwner && !item.joined && !['FULL', 'CLOSED'].includes(item.registrationState)
    )

    const stateRank = (item: typeof rows[number]) => {
      if (item.accessState === 'CAN_JOIN' && item.registrationState === 'CLOSING_SOON') return 0
      if (item.accessState === 'CAN_JOIN') return 1
      if (item.registrationState !== 'UPCOMING') return 2
      return 3
    }
    rows.sort((a, b) => {
      if (sort === 'NEWEST') return b.createdAt.getTime() - a.createdAt.getTime()
      if (sort === 'LOWEST_COST') return a.accessCost - b.accessCost || stateRank(a) - stateRank(b)
      if (sort === 'HIGHEST_REWARD') return b.rewardPool - a.rewardPool || stateRank(a) - stateRank(b)
      if (sort === 'CLOSING_SOON') {
        return stateRank(a) - stateRank(b) ||
          (a.closesAt?.getTime() ?? Number.MAX_SAFE_INTEGER) -
          (b.closesAt?.getTime() ?? Number.MAX_SAFE_INTEGER)
      }
      return stateRank(a) - stateRank(b) ||
        (a.closesAt?.getTime() ?? Number.MAX_SAFE_INTEGER) -
        (b.closesAt?.getTime() ?? Number.MAX_SAFE_INTEGER) ||
        b.createdAt.getTime() - a.createdAt.getTime()
    })

    const counts = rows.reduce((result, item) => {
      if (item.accessState === 'CAN_JOIN') result.canJoin += 1
      if (item.registrationState === 'CLOSING_SOON') result.closingSoon += 1
      if (item.registrationState === 'UPCOMING') result.upcoming += 1
      return result
    }, { canJoin: 0, closingSoon: 0, upcoming: 0 })
    const total = rows.length
    const paged = rows.slice((page - 1) * limit, page * limit)

    return {
      mesas: paged,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        counts,
      },
      viewer: { isPro, balance },
    }
  }
}
