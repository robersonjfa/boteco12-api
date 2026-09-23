const { createPrismaClient } = require('../scripts/lib/prisma-client')
const { hashPassword } = require('../dist/security/password')
const { seedTeams } = require('./seed-teams')

const prisma = createPrismaClient()

async function main() {
  console.log('🔹 Seeding Admin User')

  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@boteco12.com'
  let user = await prisma.user.findUnique({ where: { email: adminEmail } })

  if (!user) {
    const initialPassword = process.env.SEED_ADMIN_PASSWORD
    if (!initialPassword) {
      throw new Error(
        'SEED_ADMIN_PASSWORD é obrigatória para criar o primeiro administrador'
      )
    }

    user = await prisma.user.create({
      data: {
        name: 'Admin',
        email: adminEmail,
        password: await hashPassword(initialPassword),
        role: 'ADMIN',
      },
    })
  }

  const adminRole = await prisma.adminRole.findUnique({
    where: { name: 'ADMIN' }
  })

  if (!adminRole) {
    throw new Error('AdminRole ADMIN não encontrada. Rode seed-admin-permissions primeiro.')
  }

  const existingUserAdminRole = await prisma.userAdminRole.findFirst({
    where: {
      userId: user.id,
      roleId: adminRole.id,
    },
    select: {
      id: true,
    },
  })

  if (!existingUserAdminRole) {
    await prisma.userAdminRole.create({
      data: {
        userId: user.id,
        roleId: adminRole.id,
      },
    })
  }

  console.log('✅ Admin user seed concluído')

  console.log('🔹 Seeding Payment Packages')

  const packages = [
    {
      id: 'coins_100',
      label: '100 Tampinhas',
      coinsAmount: 100,
      bonusCoins: 0,
      amountCents: 5000,
    },
    {
      id: 'coins_250_bonus_25',
      label: '250 Tampinhas',
      coinsAmount: 250,
      bonusCoins: 0,
      amountCents: 12500,
    },
    {
      id: 'coins_500_bonus_75',
      label: '500 Tampinhas',
      coinsAmount: 500,
      bonusCoins: 0,
      amountCents: 25000,
    },
  ]

  for (const pkg of packages) {
    await prisma.paymentPackage.upsert({
      where: { id: pkg.id },
      update: {
        label: pkg.label,
        coinsAmount: pkg.coinsAmount,
        bonusCoins: pkg.bonusCoins,
        amountCents: pkg.amountCents,
        isActive: true,
      },
      create: {
        ...pkg,
        isActive: true,
      },
    })
  }

  console.log('✅ Payment packages seed concluído')

  console.log('🔹 Seeding Teams')
  const teamSummary = await seedTeams(prisma)
  console.log(
    `✅ Teams seed concluído: ${teamSummary.total} processados, ` +
    `${teamSummary.created} criados, ${teamSummary.updated} atualizados; ` +
    `${teamSummary.clubVariants.created} novas categorias de clubes`
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
