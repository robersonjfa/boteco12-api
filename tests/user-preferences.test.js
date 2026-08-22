const assert = require('node:assert/strict')
const test = require('node:test')

const { prisma } = require('../dist/lib/prisma')
const {
  UpdateUserPreferencesSchema,
} = require('../dist/validators/me.validator')
const {
  UpdateUserPreferencesService,
} = require('../dist/services/user/update-user-preferences.service')
const { UserRepository } = require('../dist/repositories/user.repository')
const { UserProfileService } = require('../dist/services/user-profile.service')
const { UpdateProfileSchema } = require('../dist/validators/me.validator')
const { UpdateProfileService } = require('../dist/services/user/update-profile.service')

test('valida a preferência opcional de tratamento da freguesia', () => {
  assert.equal(
    UpdateProfileSchema.parse({ addressPreference: 'CUSTOMER_MASCULINE' }).addressPreference,
    'CUSTOMER_MASCULINE'
  )
  assert.equal(
    UpdateProfileSchema.parse({ addressPreference: 'CUSTOMER_FEMININE' }).addressPreference,
    'CUSTOMER_FEMININE'
  )
  assert.equal(
    UpdateProfileSchema.parse({ addressPreference: 'UNSPECIFIED' }).addressPreference,
    'UNSPECIFIED'
  )
  assert.throws(
    () => UpdateProfileSchema.parse({ addressPreference: 'INFER_FROM_NAME' }),
    /Invalid option/
  )
})

test('perfil aceita data de nascimento adulta e rejeita menor de 18 anos', () => {
  const adult = UpdateProfileSchema.parse({ birthDate: '1990-01-15' })
  assert.ok(adult.birthDate instanceof Date)
  assert.equal(adult.birthDate.toISOString().slice(0, 10), '1990-01-15')

  assert.throws(
    () => UpdateProfileSchema.parse({ birthDate: '2010-01-01' }),
    /18 anos/i
  )
})

test('salva a data de nascimento validada no perfil autenticado', async t => {
  const originalUpdate = prisma.user.update
  const originalUpdateMany = prisma.user.updateMany
  const originalFindUnique = prisma.user.findUnique
  t.after(() => {
    prisma.user.update = originalUpdate
    prisma.user.updateMany = originalUpdateMany
    prisma.user.findUnique = originalFindUnique
  })

  let confirmation
  prisma.user.findUnique = async () => ({ birthDate: null })
  prisma.user.updateMany = async input => {
    confirmation = input
    return { count: 1 }
  }
  prisma.user.update = async input => {
    return { id: input.where.id, birthDate }
  }

  const birthDate = UpdateProfileSchema.parse({ birthDate: '1990-01-15' }).birthDate
  await UpdateProfileService.execute({
    userId: 'user-authenticated',
    data: { birthDate },
  })

  assert.equal(confirmation.where.id, 'user-authenticated')
  assert.equal(confirmation.where.birthDate, null)
  assert.equal(confirmation.data.birthDate.toISOString().slice(0, 10), '1990-01-15')
})

test('data de nascimento confirmada não pode ser alterada pelo perfil', async t => {
  const originalFindUnique = prisma.user.findUnique
  const originalUpdate = prisma.user.update
  t.after(() => {
    prisma.user.findUnique = originalFindUnique
    prisma.user.update = originalUpdate
  })

  prisma.user.findUnique = async () => ({
    birthDate: new Date('1990-01-15T00:00:00Z'),
  })
  prisma.user.update = async () => {
    throw new Error('update não deveria ser chamado')
  }

  await assert.rejects(
    UpdateProfileService.execute({
      userId: 'user-authenticated',
      data: { birthDate: new Date('1989-05-20T00:00:00Z') },
    }),
    error => error.code === 'birth_date_already_confirmed' && error.statusCode === 409
  )
})

test('valida somente a preferência booleana do modal PRO', () => {
  assert.deepEqual(
    UpdateUserPreferencesSchema.parse({ proUpsellDisabled: true }),
    { proUpsellDisabled: true }
  )
  assert.throws(() => UpdateUserPreferencesSchema.parse({}), /proUpsellDisabled/)
  assert.throws(
    () => UpdateUserPreferencesSchema.parse({ proUpsellDisabled: 'true' }),
    /boolean/
  )
})

test('salva a preferência apenas no usuário autenticado informado', async t => {
  const originalUpdate = prisma.user.update
  t.after(() => {
    prisma.user.update = originalUpdate
  })

  let received
  prisma.user.update = async input => {
    received = input
    return { proUpsellDisabled: true }
  }

  const result = await UpdateUserPreferencesService.execute({
    userId: 'user-authenticated',
    proUpsellDisabled: true,
  })

  assert.deepEqual(received, {
    where: { id: 'user-authenticated' },
    data: { proUpsellDisabled: true },
    select: { proUpsellDisabled: true },
  })
  assert.deepEqual(result, { proUpsellDisabled: true })
})

test('expõe a preferência persistida no contrato de /api/me', async t => {
  const originalFindById = UserRepository.prototype.findById
  t.after(() => {
    UserRepository.prototype.findById = originalFindById
  })
  UserRepository.prototype.findById = async () => ({
    id: 'user-1',
    name: 'Usuário',
    nickname: null,
    email: 'user@example.com',
    cpf: null,
    phone: null,
    birthDate: new Date('1990-01-15T00:00:00Z'),
    bio: null,
    profileImage: null,
    addressPreference: 'CUSTOMER_FEMININE',
    proUpsellDisabled: true,
    role: 'NORMAL',
    subscription: null,
    UserAdminRole: [],
    createdAt: new Date('2026-08-01T00:00:00Z'),
  })

  const profile = await new UserProfileService().execute('user-1')
  assert.equal(profile.proUpsellDisabled, true)
  assert.equal(profile.addressPreference, 'CUSTOMER_FEMININE')
  assert.equal(profile.birthDate, '1990-01-15')
})
