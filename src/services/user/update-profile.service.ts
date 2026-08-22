import { prisma } from '../../lib/prisma'
import { AppError } from '../../errors/AppError'
import { Prisma } from '@prisma/client'
import { UserAddressPreference } from '@prisma/client'

interface Input {
  userId: string
  data: {
    name?: string
    nickname?: string
    phone?: string
    birthDate?: Date
    bio?: string
    profileImage?: string | null
    addressPreference?: UserAddressPreference
  }
}

/**
 * Atualiza dados de perfil do usuário autenticado.
 * Campos sensíveis (email, cpf, role, password) NÃO são editáveis aqui.
 */
export class UpdateProfileService {
  static async execute({ userId, data }: Input) {
    try {
      if (data.birthDate !== undefined) {
        const current = await prisma.user.findUnique({
          where: { id: userId },
          select: { birthDate: true },
        })

        if (!current) {
          throw AppError.notFound('Usuário', 'user_not_found')
        }

        if (
          current.birthDate &&
          current.birthDate.getTime() !== data.birthDate.getTime()
        ) {
          throw AppError.conflict(
            'A data de nascimento já foi confirmada. Procure o suporte para corrigir esse dado.',
            'birth_date_already_confirmed'
          )
        }

        if (!current.birthDate) {
          const confirmed = await prisma.user.updateMany({
            where: { id: userId, birthDate: null },
            data: { birthDate: data.birthDate },
          })
          if (confirmed.count !== 1) {
            throw AppError.conflict(
              'A data de nascimento já foi confirmada. Procure o suporte para corrigir esse dado.',
              'birth_date_already_confirmed'
            )
          }
        }
      }

      const updated = await prisma.user.update({
        where: { id: userId },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.nickname !== undefined && { nickname: data.nickname }),
          ...(data.phone !== undefined && { phone: data.phone }),
          ...(data.bio !== undefined && { bio: data.bio }),
          ...(data.profileImage !== undefined && {
            profileImage: data.profileImage,
          }),
          ...(data.addressPreference !== undefined && {
            addressPreference: data.addressPreference,
          }),
        },
        select: {
          id: true,
          name: true,
          nickname: true,
          email: true,
          phone: true,
          birthDate: true,
          bio: true,
          profileImage: true,
          addressPreference: true,
          role: true,
        },
      })

      return updated
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw AppError.conflict(
          'Apelido já está em uso',
          'nickname_already_taken'
        )
      }
      throw err
    }
  }
}
