import { z } from 'zod'
import { ProfileImageSchema } from './profile-image.validator'
import { normalizeDigits } from '../security/identity'
import { NewPasswordSchema } from './password.schema'
import { BirthDateSchema } from './createUser.validator'
import { CpfSchema } from './cpf.validator'

export const UpdateProfileSchema = z
  .object({
    name: z.string().min(3).max(80).optional(),
    nickname: z.string().min(2).max(40).optional(),
    phone: z.string().transform(normalizeDigits).pipe(z.string().min(10).max(15)).optional(),
    bio: z.string().max(280).optional(),
    profileImage: ProfileImageSchema.nullable().optional(),
    birthDate: BirthDateSchema.optional(),
    cpf: CpfSchema.optional(),
    addressPreference: z.enum([
      'UNSPECIFIED',
      'CUSTOMER_MASCULINE',
      'CUSTOMER_FEMININE',
    ]).optional(),
    countryCode: z.string().trim().length(2).optional(),
    stateCode: z.string().trim().length(2).nullable().optional(),
    cityCode: z.string().trim().regex(/^\d{7}$/, 'Informe o código IBGE do município').nullable().optional(),
    cityName: z.string().trim().min(1).max(120).nullable().optional(),
  }).strict()
  .refine(obj => Object.keys(obj).length > 0, {
    message: 'Nenhum campo para atualizar',
  })

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'currentPassword é obrigatório'),
    newPassword: NewPasswordSchema,
  }).strict()

export const UpdateUserPreferencesSchema = z
  .object({
    proUpsellDisabled: z.boolean(),
  })
  .strict()

export type UpdateProfileDTO = z.infer<typeof UpdateProfileSchema>
export type ChangePasswordDTO = z.infer<typeof ChangePasswordSchema>
export type UpdateUserPreferencesDTO = z.infer<typeof UpdateUserPreferencesSchema>
