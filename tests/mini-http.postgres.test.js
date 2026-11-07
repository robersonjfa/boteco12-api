const test = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const express = require('express')
if (process.env.B12_POSTGRES_INTEGRATION !== 'true') throw new Error('Isolated PostgreSQL required')
const { prisma } = require('../dist/lib/prisma')
const routes = require('../dist/routes/mini.routes').default
const { errorHandler } = require('../dist/middleware/error-handler')

test('HTTP: autenticação, RBAC, validação, palpite imutável e débito consistente', async () => {
  const ids=[]; let miniId; let roleId;let assignment
  const app=express();app.use(express.json())
  // Only this isolated test harness supplies sessions; production uses Redis cookies.
  app.use((req,res,next)=>{if(req.headers['x-test-user'])req.session={user:{id:req.headers['x-test-user'],sessionVersion:0}};next()})
  app.use('/api',routes);app.use(errorHandler)
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))})
  const base=`http://127.0.0.1:${server.address().port}/api`
  async function call(path, method='GET', body, userId) {
    return fetch(base+path,{method,headers:{'content-type':'application/json',...(userId?{'x-test-user':userId}:{})},...(body?{body:JSON.stringify(body)}:{})})
  }
  try {
    for(let i=0;i<2;i++){const u=await prisma.user.create({data:{name:'Mini HTTP',email:`${randomUUID()}@example.test`,password:'unused',cpf:randomUUID(),birthDate:new Date('1990-01-01'),role:i===0?'ADMIN':'NORMAL',wallet:{create:{balance:100}}}});ids.push(u.id)}
    const existing=await prisma.adminRole.findFirst({where:{name:'ADMIN'}})
    const role=existing||await prisma.adminRole.create({data:{name:'ADMIN'}});if(!existing)roleId=role.id
    assignment=await prisma.userAdminRole.create({data:{userId:ids[0],roleId:role.id}})
    assert.equal((await call('/minis')).status,401)
    assert.equal((await call('/admin/minis','GET',undefined,ids[1])).status,403)
    assert.equal((await call('/admin/minis','POST',{name:'Inválida',matches:[]},ids[0])).status,400)
    const input={name:'Mini HTTP',matches:[0,1].map(i=>({homeTeam:`Casa ${i}`,awayTeam:`Fora ${i}`,matchTime:new Date(Date.now()+(i+4)*3600000).toISOString()}))}
    const create=await call('/admin/minis','POST',input,ids[0]);assert.equal(create.status,201);miniId=(await create.json()).id
    assert.equal((await call(`/admin/minis/${miniId}/publish`,'POST',{},ids[0])).status,200)
    assert.equal((await call(`/minis/${miniId}/predictions`,'POST',{picks:['1','X']},ids[1])).status,201)
    assert.equal((await call(`/minis/${miniId}/predictions`,'POST',{picks:['2','2']},ids[1])).status,409)
    const key=randomUUID()
    assert.equal((await call(`/minis/${miniId}/duels`,'POST',{amount:0,requestKey:key},ids[1])).status,400)
    const first=await call(`/minis/${miniId}/duels`,'POST',{amount:25,requestKey:key},ids[1]);assert.equal(first.status,201)
    const duel=await first.json()
    assert.equal((await call(`/minis/${miniId}/duels`,'POST',{amount:25,requestKey:key},ids[1])).status,201)
    const bal=await call('/minis/balance','GET',undefined,ids[1]);assert.deepEqual(await bal.json(),{available:75,reserved:25})
    assert.equal((await call(`/duels/${duel.id}/cancel`,'POST',{},ids[0])).status,403)
    assert.equal((await call(`/duels/${duel.id}/cancel`,'POST',{},ids[1])).status,200)
  } finally {
    if(miniId){await prisma.miniDuel.deleteMany({where:{miniId}});await prisma.miniPrediction.deleteMany({where:{miniId}});await prisma.miniMatch.deleteMany({where:{miniId}});await prisma.miniRound.delete({where:{id:miniId}})}
    await prisma.adminAuditLog.deleteMany({where:{adminId:{in:ids}}})
    await prisma.auditLog.deleteMany({where:{userId:{in:ids}}})
    if(assignment)await prisma.userAdminRole.delete({where:{id:assignment.id}})
    if(roleId)await prisma.adminRole.delete({where:{id:roleId}})
    await prisma.walletLedger.deleteMany({where:{wallet:{userId:{in:ids}}}});await prisma.wallet.deleteMany({where:{userId:{in:ids}}});await prisma.user.deleteMany({where:{id:{in:ids}}})
    await new Promise(resolve=>server.close(resolve));await prisma.$disconnect()
  }
})
