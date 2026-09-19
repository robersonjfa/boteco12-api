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
    cpf?: string
    birthDate?: Date
    bio?: string
    profileImage?: string | null
    addressPreference?: UserAddressPreference
  }
}

/**
 * Atualiza dados de perfil do usuário autenticado.
 * E-mail, papel e senha não são editáveis aqui. CPF e nascimento só podem ser
 * confirmados uma vez por contas legadas.
 */
export class UpdateProfileService {
  static async execute({ userId, data }: Input) {
    try {
      if (data.cpf !== undefined || data.birthDate !== undefined) {
        const current = await prisma.user.findUnique({
          where: { id: userId },
          select: { cpf: true, birthDate: true },
        })

        if (!current) {
          throw AppError.notFound('Usuário', 'user_not_found')
        }

        if (
          data.cpf !== undefined &&
          current.cpf &&
          current.cpf !== data.cpf
        ) {
          throw AppError.conflict(
            'O CPF já foi confirmado. Procure o suporte para corrigir esse dado.',
            'cpf_already_confirmed'
          )
        }

        if (
          data.birthDate !== undefined &&
          current.birthDate &&
          current.birthDate.getTime() !== data.birthDate.getTime()
        ) {
          throw AppError.conflict(
            'A data de nascimento já foi confirmada. Procure o suporte para corrigir esse dado.',
            'birth_date_already_confirmed'
          )
        }

        const cpfToConfirm = data.cpf !== undefined && !current.cpf
        const birthDateToConfirm =
          data.birthDate !== undefined && !current.birthDate

        if (cpfToConfirm || birthDateToConfirm) {
          const confirmed = await prisma.user.updateMany({
            where: {
              id: userId,
              ...(cpfToConfirm && { cpf: null }),
              ...(birthDateToConfirm && { birthDate: null }),
            },
            data: {
              ...(cpfToConfirm && { cpf: data.cpf }),
              ...(birthDateToConfirm && { birthDate: data.birthDate }),
            },
          })
          if (confirmed.count !== 1) {
            throw AppError.conflict(
              'CPF ou data de nascimento já foram confirmados. Atualize a página e tente novamente.',
              'identity_already_confirmed'
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
          cpf: true,
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
        const target = String(err.meta?.target ?? '')
        if (target.toLowerCase().includes('cpf')) {
          throw AppError.conflict('CPF já cadastrado', 'cpf_already_taken')
        }
        throw AppError.conflict(
          'Apelido já está em uso',
          'nickname_already_taken'
        )
      }
      throw err
    }
  }
}
