import crypto from 'crypto'

const TOKEN_BYTES = 32

export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000
export const PASSWORD_RESET_TTL_MIN = PASSWORD_RESET_TTL_MS / 60000

export function createPasswordResetTokenMaterial(): {
  rawToken: string
  tokenHash: string
  expiresAt: Date
} {
  const rawToken = crypto.randomBytes(TOKEN_BYTES).toString('hex')
  return {
    rawToken,
    tokenHash: crypto.createHash('sha256').update(rawToken).digest('hex'),
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
  }
}

export function buildPasswordResetUrl(rawToken: string): string {
  const baseUrl = (
    process.env.FRONTEND_ORIGIN?.split(',')[0]?.trim() ||
    process.env.FRONTEND_URL?.trim() ||
    'https://boteco12.com'
  ).replace(/\/$/, '')
  return `${baseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`
}
