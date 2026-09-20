import { Prisma } from '@prisma/client'
import { DEFAULT_TEAM_VARIANT, TeamVariantInput } from './team-catalog'

export async function syncTeamVariants(
  tx: Prisma.TransactionClient,
  teamId: string,
  variants: TeamVariantInput[] | undefined,
  createDefault = false
) {
  const desired = variants ?? (createDefault ? [DEFAULT_TEAM_VARIANT] : null)
  if (!desired) return

  const ids: string[] = []
  for (const variant of desired) {
    const saved = await tx.teamVariant.upsert({
      where: {
        teamId_gender_ageCategory: {
          teamId,
          gender: variant.gender,
          ageCategory: variant.ageCategory,
        },
      },
      create: {
        teamId,
        gender: variant.gender,
        ageCategory: variant.ageCategory,
        active: variant.active ?? true,
      },
      update: { active: variant.active ?? true },
      select: { id: true },
    })
    ids.push(saved.id)
  }

  await tx.teamVariant.updateMany({
    where: {
      teamId,
      ...(ids.length > 0 && { id: { notIn: ids } }),
    },
    data: { active: false },
  })
}
