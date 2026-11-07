const test = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
if (process.env.B12_POSTGRES_INTEGRATION !== 'true') throw new Error('Isolated PostgreSQL required')
const { prisma } = require('../dist/lib/prisma')
const { MiniService } = require('../dist/services/mini/mini.service')
const prefix = `mini-test-${randomUUID()}`
const sameDate = new Date('2020-01-01T00:00:00Z')
const users = []
const minis = []
let admin
async function user(balance = 100, createdAt = sameDate) {
  const u = await prisma.user.create({ data: { name: prefix, email: `${randomUUID()}@example.test`, password: 'unused-test-hash', cpf: randomUUID(), birthDate: new Date('1990-01-01'), createdAt, wallet: { create: { balance } } } })
  users.push(u.id); return u
}
async function mini(picks = ['1', 'X']) {
  const m = await MiniService.create(prefix, [0, 1].map(i => ({ homeTeam: `Casa ${i}`, awayTeam: `Fora ${i}`, matchTime: new Date(Date.now() + (i + 4) * 3600000) })), admin.id)
  minis.push(m.id)
  await MiniService.publish(m.id, admin.id)
  return m
}
async function saved(m, u, picks = ['1', 'X']) { await MiniService.savePrediction(m.id, u.id, picks) }
async function close(m) {
  await prisma.miniRound.update({ where: { id: m.id }, data: { closeAt: new Date(Date.now() - 1000) } })
  await prisma.miniMatch.updateMany({ where: { miniId: m.id }, data: { matchTime: new Date(Date.now() - 1000) } })
}
async function balance(u) { return (await prisma.wallet.findUnique({ where: { userId: u.id } })).balance }
test('duelos: jornada, saldo, privacidade, concorrência, apuração e isolamento de rankings', async t => {
  admin = await user()
  const rankingCount = await prisma.ranking.count()
  const scores = new Map()
  try {
    await t.test('salvar é definitivo e exige todos os jogos; prazo é 1 hora antes', async () => {
      const m = await mini(); const a = await user()
      assert.equal(m.closeAt.getTime(), m.matches[0].matchTime.getTime() - 3600000)
      await assert.rejects(saved(m, a, ['1']))
      await saved(m, a)
      await assert.rejects(saved(m, a, ['2', '2']), /Não é permitido alterar/)
      await close(m)
      await assert.rejects(MiniService.createDuel(m.id, a.id, 10), /encerradas/)
      await assert.rejects(saved(m, await user()), /encerradas/)
    })
    await t.test('saldo positivo, reserva por duelo e repetição da criação não duplica débito', async () => {
      const m = await mini(); const a = await user(100); await saved(m, a)
      for (const amount of [0, -1, 0.5, 101]) await assert.rejects(MiniService.createDuel(m.id, a.id, amount))
      const key = randomUUID()
      const duel = await MiniService.createDuel(m.id, a.id, 50, undefined, key)
      assert.equal((await MiniService.createDuel(m.id, a.id, 50, undefined, key)).id, duel.id)
      assert.equal(await balance(a), 50)
      await MiniService.createDuel(m.id, a.id, 50)
      await assert.rejects(MiniService.createDuel(m.id, a.id, 1))
      assert.deepEqual(await MiniService.balance(a.id), { available: 0, reserved: 100 })
      await MiniService.cancel(duel.id, a.id); await MiniService.cancel(duel.id, a.id)
      assert.equal(await balance(a), 50)
    })
    await t.test('aceite público simultâneo confirma apenas um e não cobra o outro', async () => {
      const m = await mini(); const a = await user(); const b = await user(); const c = await user()
      for (const u of [a,b,c]) await saved(m,u)
      const d = await MiniService.createDuel(m.id,a.id,30)
      const outcomes = await Promise.allSettled([MiniService.accept(d.id,b.id),MiniService.accept(d.id,c.id)])
      assert.equal(outcomes.filter(r => r.status === 'fulfilled').length,1)
      assert.deepEqual([await balance(b),await balance(c)].sort((a,b)=>a-b),[70,100])
      const accepted = await prisma.miniDuel.findUnique({ where: { id:d.id } })
      await MiniService.accept(d.id,accepted.opponentId)
      await assert.rejects(MiniService.cancel(d.id,a.id))
      assert.equal((await MiniService.detail(d.id,a.id)).predictions.length,0)
      await close(m)
      assert.equal((await MiniService.detail(d.id,a.id)).predictions.length,2)
    })
    await t.test('reservas de minis diferentes não gastam as mesmas tampinhas', async () => {
      const a = await user(50); const m1 = await mini();const m2 = await mini()
      await saved(m1,a);await saved(m2,a)
      const r=await Promise.allSettled([MiniService.createDuel(m1.id,a.id,40),MiniService.createDuel(m2.id,a.id,40)])
      assert.equal(r.filter(x=>x.status==='fulfilled').length,1)
      assert.equal(await balance(a),10)
    })
    await t.test('convite só pode ser aceito pelo destinatário e não aparece no público', async () => {
      const m=await mini();const a=await user();const b=await user();const c=await user()
      for(const u of [a,b,c])await saved(m,u)
      const d=await MiniService.createDuel(m.id,a.id,10,b.id)
      await assert.rejects(MiniService.accept(d.id,c.id))
      await assert.rejects(MiniService.detail(d.id,c.id))
      await assert.rejects(MiniService.accept(d.id,a.id))
      assert.equal((await MiniService.duels(c.id,'public',1)).duels.some(x=>x.id===d.id),false)
      await MiniService.accept(d.id,b.id)
    })
    await t.test('expiração sem aceite devolve uma única vez', async () => {
      const m=await mini();const a=await user();await saved(m,a)
      const d=await MiniService.createDuel(m.id,a.id,40)
      await close(m);await Promise.all([MiniService.reconcile(m.id),MiniService.reconcile(m.id)])
      assert.equal(await balance(a),100)
      assert.equal((await prisma.miniDuel.findUnique({where:{id:d.id}})).status,'EXPIRED')
    })
    await t.test('vitória paga prêmio integral e reprocessamento não paga novamente', async () => {
      const m=await mini();const a=await user();const b=await user()
      await saved(m,a,['1','X']);await saved(m,b,['2','2'])
      const d=await MiniService.createDuel(m.id,a.id,50);await MiniService.accept(d.id,b.id)
      await assert.rejects(MiniService.confirm(m.id,['1','X'],admin.id))
      await close(m);await MiniService.confirm(m.id,['1','X'],admin.id)
      await Promise.all([MiniService.reconcile(m.id),MiniService.confirm(m.id,['2','2'],admin.id)])
      assert.equal(await balance(a),150);assert.equal(await balance(b),50)
      const result=await MiniService.detail(d.id,a.id)
      assert.equal(result.winnerId,a.id);assert.equal(result.settlement.reason,'Maior pontuação')
      assert.equal((await prisma.miniMatch.findMany({where:{miniId:m.id},orderBy:{position:'asc'}}))[0].result,'1')
    })
    await t.test('empate absoluto e jogos anulados devolvem ambos os aportes', async () => {
      const m=await mini();const a=await user();const b=await user()
      await saved(m,a,['1','1']);await saved(m,b,['2','2'])
      const d=await MiniService.createDuel(m.id,a.id,25);await MiniService.accept(d.id,b.id)
      await close(m);await MiniService.confirm(m.id,['C','C'],admin.id)
      assert.equal(await balance(a),100);assert.equal(await balance(b),100)
      assert.equal((await MiniService.detail(d.id,a.id)).winnerId,null)
    })
    await t.test('cadastro mais antigo desempata sem depender de ranking', async () => {
      const m=await mini();const a=await user(100,new Date('2010-01-01'));const b=await user()
      await saved(m,a);await saved(m,b)
      const d=await MiniService.createDuel(m.id,a.id,10);await MiniService.accept(d.id,b.id)
      await close(m);await MiniService.confirm(m.id,['1','C'],admin.id)
      assert.equal((await MiniService.detail(d.id,a.id)).winnerId,a.id)
    })
    assert.equal(await prisma.ranking.count(),rankingCount)
    assert.equal(await prisma.userScoreHistory.count({where:{userId:{in:users}}}),0)
    assert.ok((await prisma.user.findMany({where:{id:{in:users}}})).every(u=>u.scoreTotal===0))
    // Includes unfinished duels: balances plus active reservations conserve total supply.
    const wallets=await prisma.wallet.findMany({where:{userId:{in:users}}})
    const ledger=await prisma.walletLedger.findMany({where:{wallet:{userId:{in:users}}}})
    assert.ok(wallets.every(w=>w.balance>=0))
    assert.equal(new Set(ledger.filter(l=>l.idempotencyKey).map(l=>l.idempotencyKey)).size,ledger.filter(l=>l.idempotencyKey).length)
  } finally {
    await prisma.miniDuel.deleteMany({where:{miniId:{in:minis}}})
    await prisma.miniPrediction.deleteMany({where:{miniId:{in:minis}}})
    await prisma.miniMatch.deleteMany({where:{miniId:{in:minis}}})
    await prisma.miniRound.deleteMany({where:{id:{in:minis}}})
    await prisma.auditLog.deleteMany({where:{userId:{in:users}}})
    await prisma.walletLedger.deleteMany({where:{wallet:{userId:{in:users}}}})
    await prisma.wallet.deleteMany({where:{userId:{in:users}}})
    await prisma.user.deleteMany({where:{id:{in:users}}})
    await prisma.$disconnect()
  }
})
