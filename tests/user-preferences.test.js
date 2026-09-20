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

test('perfil aceita CPF válido e rejeita verificadores inválidos', () => {
  assert.equal(
    UpdateProfileSchema.parse({ cpf: '529.982.247-25' }).cpf,
    '52998224725'
  )
  assert.throws(
    () => UpdateProfileSchema.parse({ cpf: '123.456.789-01' }),
    /CPF inválido/
  )
})

test('confirma CPF e nascimento legados uma única vez', async t => {
  const originalUpdate = prisma.user.update
  const originalFindUnique = prisma.user.findUnique
  const originalTransaction = prisma.$transaction
  t.after(() => {
    prisma.user.update = originalUpdate
    prisma.user.findUnique = originalFindUnique
    prisma.$transaction = originalTransaction
  })

  let update
  prisma.user.findUnique = async () => ({ cpf: null, birthDate: null })
  prisma.user.update = async input => {
    update = input
    return { id: input.where.id, ...input.data }
  }
  prisma.$transaction = async callback => callback({ user: prisma.user })

  const data = UpdateProfileSchema.parse({
    cpf: '529.982.247-25',
    birthDate: '1990-01-15',
  })
  await UpdateProfileService.execute({ userId: 'legacy-user', data })

  assert.deepEqual(update.where, {
    id: 'legacy-user',
    AND: [{ cpf: null }, { birthDate: null }],
  })
  assert.equal(update.data.cpf, '52998224725')
  assert.equal(update.data.birthDate.toISOString().slice(0, 10), '1990-01-15')
})

test('CPF confirmado não pode ser alterado pelo perfil', async t => {
  const originalFindUnique = prisma.user.findUnique
  const originalTransaction = prisma.$transaction
  t.after(() => {
    prisma.user.findUnique = originalFindUnique
    prisma.$transaction = originalTransaction
  })

  prisma.user.findUnique = async () => ({
    cpf: '52998224725',
    birthDate: new Date('1990-01-15T00:00:00Z'),
  })
  prisma.$transaction = async callback => callback({ user: prisma.user })

  await assert.rejects(
    UpdateProfileService.execute({
      userId: 'user-authenticated',
      data: { cpf: '16899535009' },
    }),
    error => error.code === 'cpf_already_confirmed' && error.statusCode === 409
  )
})

test('salva a data de nascimento validada no perfil autenticado', async t => {
  const originalUpdate = prisma.user.update
  const originalFindUnique = prisma.user.findUnique
  const originalTransaction = prisma.$transaction
  t.after(() => {
    prisma.user.update = originalUpdate
    prisma.user.findUnique = originalFindUnique
    prisma.$transaction = originalTransaction
  })

  let update
  prisma.user.findUnique = async () => ({ birthDate: null })
  prisma.user.update = async input => {
    update = input
    return { id: input.where.id, birthDate }
  }
  prisma.$transaction = async callback => callback({ user: prisma.user })

  const birthDate = UpdateProfileSchema.parse({ birthDate: '1990-01-15' }).birthDate
  await UpdateProfileService.execute({
    userId: 'user-authenticated',
    data: { birthDate },
  })

  assert.equal(update.where.id, 'user-authenticated')
  assert.deepEqual(update.where.AND, [{ birthDate: null }])
  assert.equal(update.data.birthDate.toISOString().slice(0, 10), '1990-01-15')
})

test('data de nascimento confirmada não pode ser alterada pelo perfil', async t => {
  const originalFindUnique = prisma.user.findUnique
  const originalUpdate = prisma.user.update
  const originalTransaction = prisma.$transaction
  t.after(() => {
    prisma.user.findUnique = originalFindUnique
    prisma.user.update = originalUpdate
    prisma.$transaction = originalTransaction
  })

  prisma.user.findUnique = async () => ({
    birthDate: new Date('1990-01-15T00:00:00Z'),
  })
  prisma.user.update = async () => {
    throw new Error('update não deveria ser chamado')
  }
  prisma.$transaction = async callback => callback({ user: prisma.user })

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
