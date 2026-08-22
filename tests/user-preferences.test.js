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
})
