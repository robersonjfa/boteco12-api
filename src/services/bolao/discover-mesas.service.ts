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

export type RegistrationState = 'OPEN' | 'CLOSING_SOON' | 'UPCOMING' | 'FULL' | 'CLOSED'
type AccessState =
  | 'CAN_JOIN'
  | 'ALREADY_JOINED'
  | 'OWNER'
  | 'PLAN_REQUIRED'
  | 'SIDEWALK_REQUIRED'
  | 'INSUFFICIENT_BALANCE'
  | 'NOT_OPEN'

const CLOSING_SOON_MS = 72 * 60 * 60 * 1000

type MesaDiscoveryIndexRow = {
  id: string | null
  registrationState: RegistrationState | null
  accessState: AccessState | null
  spotsRemaining: number | null
  ordinal: number | null
  total: number
  canJoin: number
  closingSoon: number
  upcoming: number
}

export function mesaRegistrationState(mesa: {
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

function discoveryOrder(sort: MesaDiscoverySort) {
  if (sort === 'NEWEST') {
    return Prisma.sql`"createdAt" DESC, id ASC`
  }
  if (sort === 'LOWEST_COST') {
    return Prisma.sql`access_cost ASC, state_rank ASC, "createdAt" DESC, id ASC`
  }
  if (sort === 'HIGHEST_REWARD') {
    return Prisma.sql`reward_pool DESC, state_rank ASC, "createdAt" DESC, id ASC`
  }
  if (sort === 'CLOSING_SOON') {
    return Prisma.sql`state_rank ASC, "entryEndDate" ASC NULLS LAST, "createdAt" DESC, id ASC`
  }
  return Prisma.sql`state_rank ASC, "entryEndDate" ASC NULLS LAST, "createdAt" DESC, id ASC`
}

function buildDiscoveryIndexQuery(input: {
  userId: string
  query?: string
  category?: MesaCategory
  registration: MesaRegistrationFilter
  access: MesaAccessFilter
  sort: MesaDiscoverySort
  minCost?: number
  maxCost?: number
  now: Date
  isPro: boolean
  balance: number
  offset: number
  limit: number
}) {
  const closingSoonAt = new Date(input.now.getTime() + CLOSING_SOON_MS)
  const baseFilters: Prisma.Sql[] = [
    Prisma.sql`r."type"::text = 'BOLAO'`,
    Prisma.sql`r."status"::text = 'ACTIVE'`,
    Prisma.sql`r."createdByUserId" IS DISTINCT FROM ${input.userId}`,
    Prisma.sql`NOT EXISTS (
      SELECT 1
      FROM "ranking_participants" participant
      WHERE participant."rankingId" = r.id
        AND participant."userId" = ${input.userId}
        AND participant."status"::text = 'APPROVED'
    )`,
    Prisma.sql`r."registrationClosedAt" IS NULL`,
    Prisma.sql`(r."entryEndDate" IS NULL OR r."entryEndDate" > ${input.now})`,
    Prisma.sql`(r."maxParticipants" IS NULL OR r."currentParticipants" < r."maxParticipants")`,
  ]

  if (input.category) {
    baseFilters.push(Prisma.sql`r."category"::text = ${input.category}`)
  }
  if (input.minCost != null) {
    baseFilters.push(Prisma.sql`r."accessCost" >= ${input.minCost}`)
  }
  if (input.maxCost != null) {
    baseFilters.push(Prisma.sql`r."accessCost" <= ${input.maxCost}`)
  }
  if (input.query) {
    baseFilters.push(Prisma.sql`(
      r."name" ILIKE '%' || ${input.query} || '%'
      OR EXISTS (
        SELECT 1
        FROM "users" owner
        WHERE owner.id = r."createdByUserId"
          AND (
            owner."name" ILIKE '%' || ${input.query} || '%'
            OR owner."nickname" ILIKE '%' || ${input.query} || '%'
          )
      )
    )`)
  }

  const registrationFilter = input.registration === 'ALL'
    ? Prisma.sql`TRUE`
    : input.registration === 'OPEN'
      ? Prisma.sql`registration_state IN ('OPEN', 'CLOSING_SOON')`
      : Prisma.sql`registration_state = ${input.registration}`
  const accessFilter = input.access === 'CAN_JOIN'
    ? Prisma.sql`access_state = 'CAN_JOIN'`
    : Prisma.sql`TRUE`
  const upperOrdinal = input.offset + input.limit

  return Prisma.sql`
    WITH base AS (
      SELECT
        r.id,
        r."startDate",
        r."entryEndDate",
        r."createdAt",
        r."category"::text AS category,
        r."eligibility"::text AS eligibility,
        COALESCE(r."accessCost", r."entryFee") AS access_cost,
        COALESCE(r."rewardPool", r."prizePool") AS reward_pool,
        CASE
          WHEN r."maxParticipants" IS NULL THEN NULL
          ELSE GREATEST(r."maxParticipants" - r."currentParticipants", 0)
        END::int AS spots_remaining
      FROM "rankings" r
      WHERE ${Prisma.join(baseFilters, ' AND ')}
    ), registration AS (
      SELECT
        base.*,
        CASE
          WHEN "startDate" IS NOT NULL AND "startDate" > ${input.now} THEN 'UPCOMING'
          WHEN ("entryEndDate" IS NOT NULL AND "entryEndDate" <= ${closingSoonAt})
            OR (spots_remaining IS NOT NULL AND spots_remaining <= 2) THEN 'CLOSING_SOON'
          ELSE 'OPEN'
        END AS registration_state
      FROM base
    ), classified AS (
      SELECT
        registration.*,
        CASE
          WHEN eligibility = 'SUBSCRIBERS_ONLY' AND NOT ${input.isPro} THEN 'PLAN_REQUIRED'
          WHEN eligibility = 'FREE_ONLY' AND ${input.isPro} THEN 'SIDEWALK_REQUIRED'
          WHEN registration_state NOT IN ('OPEN', 'CLOSING_SOON') THEN 'NOT_OPEN'
          WHEN category = 'PAID' AND ${input.balance} < access_cost THEN 'INSUFFICIENT_BALANCE'
          ELSE 'CAN_JOIN'
        END AS access_state
      FROM registration
    ), scored AS (
      SELECT
        classified.*,
        CASE
          WHEN access_state = 'CAN_JOIN' AND registration_state = 'CLOSING_SOON' THEN 0
          WHEN access_state = 'CAN_JOIN' THEN 1
          WHEN registration_state <> 'UPCOMING' THEN 2
          ELSE 3
        END AS state_rank
      FROM classified
    ), filtered AS (
      SELECT *
      FROM scored
      WHERE ${registrationFilter} AND ${accessFilter}
    ), ordered AS (
      SELECT
        filtered.*,
        (ROW_NUMBER() OVER (ORDER BY ${discoveryOrder(input.sort)}))::int AS ordinal
      FROM filtered
    ), stats AS (
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE access_state = 'CAN_JOIN')::int AS can_join,
        COUNT(*) FILTER (WHERE registration_state = 'CLOSING_SOON')::int AS closing_soon,
        COUNT(*) FILTER (WHERE registration_state = 'UPCOMING')::int AS upcoming
      FROM filtered
    )
    SELECT
      page.id,
      page.registration_state AS "registrationState",
      page.access_state AS "accessState",
      page.spots_remaining AS "spotsRemaining",
      page.ordinal,
      stats.total,
      stats.can_join AS "canJoin",
      stats.closing_soon AS "closingSoon",
      stats.upcoming
    FROM stats
    LEFT JOIN ordered page
      ON page.ordinal > ${input.offset}
      AND page.ordinal <= ${upperOrdinal}
    ORDER BY page.ordinal NULLS LAST
  `
}

export class DiscoverMesasService {
  static async execute(input: DiscoverMesasInput) {
    const now = input.now ?? new Date()
    const page = input.page ?? 1
    const limit = input.limit ?? 12
    const sort = input.sort ?? 'RECOMMENDED'
    const query = input.query?.trim()

    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: {
        subscription: {
          select: { status: true, plan: true, startAt: true, endAt: true },
        },
        wallet: { select: { balance: true } },
      },
    })

    const isPro = hasActiveProSubscriptionAt(user?.subscription, now)
    const balance = user?.wallet?.balance ?? 0
    const offset = (page - 1) * limit
    const indexedRows = await prisma.$queryRaw<MesaDiscoveryIndexRow[]>(
      buildDiscoveryIndexQuery({
        userId: input.userId,
        query,
        category: input.category,
        registration: input.registration ?? 'ALL',
        access: input.access ?? 'ALL',
        sort,
        minCost: input.minCost,
        maxCost: input.maxCost,
        now,
        isPro,
        balance,
        offset,
        limit,
      })
    )
    const summary = indexedRows[0] ?? {
      total: 0,
      canJoin: 0,
      closingSoon: 0,
      upcoming: 0,
    }
    const pageIndex = indexedRows.filter((row): row is MesaDiscoveryIndexRow & {
      id: string
      registrationState: RegistrationState
      accessState: AccessState
      ordinal: number
    } => Boolean(row.id && row.registrationState && row.accessState && row.ordinal != null))
    const ids = pageIndex.map(row => row.id)
    const mesas = ids.length === 0
      ? []
      : await prisma.ranking.findMany({
        where: { id: { in: ids } },
        select: mesaSelect,
      })
    const mesasById = new Map(mesas.map(mesa => [mesa.id, mesa]))
    const rows = pageIndex.flatMap(indexed => {
      const mesa = mesasById.get(indexed.id)
      if (!mesa) return []
      const financial = withMesaFinancialNames(mesa)
      return [{
        ...financial,
        participants: mesa.currentParticipants,
        ownerName: mesa.createdBy?.nickname?.trim() || mesa.createdBy?.name?.trim() || 'Boteco12',
        isOwner: false,
        joined: false,
        participantId: null,
        participantStatus: null,
        registrationState: indexed.registrationState,
        accessState: indexed.accessState,
        closesAt: mesa.entryEndDate,
        spotsRemaining: indexed.spotsRemaining,
        recommendationReason: recommendationReason({
          accessState: indexed.accessState,
          registrationState: indexed.registrationState,
          category: mesa.category,
        }),
      }]
    })

    return {
      mesas: rows,
      meta: {
        page,
        limit,
        total: summary.total,
        totalPages: Math.ceil(summary.total / limit),
        counts: {
          canJoin: summary.canJoin,
          closingSoon: summary.closingSoon,
          upcoming: summary.upcoming,
        },
        truncated: false,
      },
      viewer: { isPro, balance },
    }
  }
}
