import { z } from 'zod'
import { normalizeDigits } from '../security/identity'

export function isValidCpf(value: string): boolean {
  const cpf = normalizeDigits(value)
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false

  const digits = [...cpf].map(Number)
  for (let verifierIndex = 9; verifierIndex <= 10; verifierIndex += 1) {
    const sum = digits
      .slice(0, verifierIndex)
      .reduce(
        (total, digit, index) =>
          total + digit * (verifierIndex + 1 - index),
        0
      )
    const remainder = (sum * 10) % 11
    const expected = remainder === 10 ? 0 : remainder
    if (digits[verifierIndex] !== expected) return false
  }

  return true
}

export const CpfSchema = z
  .string()
  .transform(normalizeDigits)
  .superRefine((cpf, ctx) => {
    if (cpf.length !== 11) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'CPF deve conter 11 dígitos',
      })
      return
    }

    if (!isValidCpf(cpf)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'CPF inválido',
      })
    }
  })
