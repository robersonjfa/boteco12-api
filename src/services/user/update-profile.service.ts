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
      return await prisma.$transaction(async tx => {
        const current = await tx.user.findUnique({
          where: { id: userId },
          select: { cpf: true, birthDate: true },
        })

        if (!current) throw AppError.notFound('Usuário', 'user_not_found')

        if (data.cpf !== undefined) {
          if (
            current.cpf &&
            current.cpf !== data.cpf
          ) {
            throw AppError.conflict(
              'O CPF já foi confirmado. Procure o suporte para corrigir esse dado.',
              'cpf_already_confirmed'
            )
          }
        }

        if (data.birthDate !== undefined) {
          if (
            current.birthDate &&
            current.birthDate.getTime() !== data.birthDate.getTime()
          ) {
            throw AppError.conflict(
              'A data de nascimento já foi confirmada. Procure o suporte para corrigir esse dado.',
              'birth_date_already_confirmed'
            )
          }
        }

        const cpfToConfirm = data.cpf !== undefined && !current.cpf
        const birthDateToConfirm =
          data.birthDate !== undefined && !current.birthDate

        return tx.user.update({
          where: {
            id: userId,
            ...((cpfToConfirm || birthDateToConfirm) && {
              AND: [
                ...(cpfToConfirm ? [{ cpf: null }] : []),
                ...(birthDateToConfirm ? [{ birthDate: null }] : []),
              ],
            }),
          },
          data: {
            ...(data.name !== undefined && { name: data.name }),
            ...(data.nickname !== undefined && { nickname: data.nickname }),
            ...(data.phone !== undefined && { phone: data.phone }),
            ...(cpfToConfirm && { cpf: data.cpf }),
            ...(birthDateToConfirm && { birthDate: data.birthDate }),
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
      })
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const target = String(err.meta?.target ?? '')
        if (target.toLowerCase().includes('cpf')) {
          throw AppError.conflict('CPF já cadastrado', 'cpf_already_taken')
        }
      }
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025' &&
        (data.cpf !== undefined || data.birthDate !== undefined)
      ) {
        throw AppError.conflict(
          'CPF ou data de nascimento já foram confirmados. Atualize a página e tente novamente.',
          'identity_already_confirmed'
        )
      }
      throw err
    }
  }
}
