import test from "node:test";
import assert from "node:assert/strict";
import {handleRequest,sign} from "../lib/api.mjs";
import {makeDb,signal,envelope,NOW,CONFIG} from "./helpers.mjs";
import {ingest,requestCommand,adminState} from "../lib/data.mjs";
const opts=(db,extra={})=>({db,config:CONFIG,now:NOW,...extra});
async function post(db,event,extra={}){
 const body=JSON.stringify(event),timestamp=String(NOW),signature=await sign(CONFIG.secret,timestamp,body);
 return handleRequest(new Request(CONFIG.origin+"/api/connector/sync",{method:"POST",headers:{"x-vinsett-timestamp":timestamp,"x-vinsett-signature":signature,"Content-Type":"application/json"},body}),opts(db,extra));
}
async function get(db,path,extra={}){const r=await handleRequest(new Request(CONFIG.origin+path),opts(db,extra));return {status:r.status,headers:r.headers,body:await r.json()};}
test("ingestão autenticada, idempotência, identidade e ausência de segredos públicos",async t=>{
 const db=makeDb();t.after(()=>db.close());const event=envelope([signal()]);
 const r=await post(db,event);assert.equal(r.status,200);assert.equal((await r.json()).eventId,event.eventId);
 const replay=await post(db,event);assert.equal((await replay.json()).duplicate,true);
 const sameIdDifferentBody=structuredClone(event);sameIdDifferentBody.signals[0].revision=2;assert.equal((await post(db,sameIdDifferentBody)).status,409);
 const result=await get(db,"/api/public/signals");assert.equal(result.body.items.length,1);assert.equal(result.body.items[0].id,event.signals[0].id);
 assert.doesNotMatch(JSON.stringify(result.body),/chatId|TELEGRAM_BOT_TOKEN|test-only-never-deploy/);
 assert.match(result.headers.get("cache-control"),/max-age=3/);
});
test("assinatura inválida, conteúdo adulterado, janela expirada e excesso de tamanho são rejeitados",async t=>{
 const db=makeDb();t.after(()=>db.close());const body=JSON.stringify(envelope([signal()]));
 const request=(timestamp,signature,value=body)=>new Request(CONFIG.origin+"/api/connector/sync",{method:"POST",headers:{"x-vinsett-timestamp":timestamp,"x-vinsett-signature":signature},body:value});
 assert.equal((await handleRequest(request(String(NOW),"0".repeat(64)),opts(db))).status,401);
 assert.equal((await handleRequest(request(String(NOW-300001),await sign(CONFIG.secret,String(NOW-300001),body)),opts(db))).status,401);
 assert.equal((await handleRequest(request(String(NOW),await sign(CONFIG.secret,String(NOW),body),body+" "),opts(db))).status,401);
 assert.equal((await handleRequest(request(String(NOW),"0".repeat(64),"x".repeat(98305)),opts(db))).status,413);
 assert.equal((await get(db,"/api/public/signals")).body.total,0);
});
test("API pública não grava e cabeçalhos forjados não autorizam administração",async()=>{
 const request=new Request(CONFIG.origin+"/api/admin/commands",{method:"POST",headers:{"oai-authenticated-user-id":"forged","oai-authenticated-user-email":"fake@example.test"},body:"{}"});
 assert.equal((await handleRequest(request,opts(null))).status,403);
 assert.equal((await handleRequest(new Request(CONFIG.origin+"/api/public/signals",{method:"POST",body:"{}"}),opts(null))).status,405);
 assert.equal((await get(null,"/api/admin/state")).status,403);
 assert.equal((await get(null,"/api/public/signals")).status,503);
});
test("3 ativos, 2 direções e todos os resultados; filtros combinados e amostra completa",async t=>{
 const db=makeDb();t.after(()=>db.close());const all=[];
 let index=0;
 for(const asset of ["BTC","ETH","SOL"])for(const direction of ["BUY","SELL"])for(const result of ["WIN","LOSS","EMPATE","INCONCLUSIVO","PENDENTE"])all.push(signal({asset,direction,result,index:index++}));
 for(let i=0;i<all.length;i+=20)assert.equal((await post(db,envelope(all.slice(i,i+20)))).status,200);
 const first=await get(db,"/api/public/signals?limit=5");assert.equal(first.body.items.length,5);assert.equal(first.body.total,30);
 const second=await get(db,"/api/public/signals?limit=5&cursor="+first.body.nextCursor);assert.equal(second.body.items.length,5);assert.equal(new Set([...first.body.items,...second.body.items].map(x=>x.id)).size,10);
 const filter=await get(db,"/api/public/signals?asset=ETH&direction=SELL&result=WIN");assert.equal(filter.body.total,1);assert.equal(filter.body.items[0].asset,"ETH");assert.equal(filter.body.items[0].direction,"SELL");
 const stats=(await get(db,"/api/public/stats?result=WIN&limit=1")).body;assert.equal(stats.total,30);assert.equal(stats.sample,12);assert.equal(stats.wins,6);assert.equal(stats.losses,6);assert.equal(stats.rate,50);
 assert.equal((await get(db,"/api/public/signals?asset=XRP")).status,400);
 assert.equal((await get(db,"/api/public/signals?asset=BTC&asset=SOL")).status,400);
 assert.equal((await get(db,"/api/public/signals?from=2026-02-31")).status,400);
 assert.equal((await get(db,"/api/public/signals?from=2026-09-03&to=2026-09-02")).status,400);
 assert.equal((await get(db,"/api/public/signals?cursor=garbage")).status,400);
 assert.equal((await get(db,"/api/public/signals/invalid")).status,404);
 assert.equal((await get(db,"/api/public/signals/BTC_1900000000000")).status,404);
});
test("versões antigas não revertem resultado; dado imutável e revisão conflitante não são aceitos",async t=>{
 const db=makeDb();t.after(()=>db.close());const final=signal({revision:3});
 await post(db,envelope([final]));
 const old=signal({revision:2,result:"PENDENTE"}),response=await post(db,envelope([old]));
 assert.deepEqual((await response.json()).ignoredStaleIds,[final.id]);
 assert.equal((await get(db,"/api/public/signals/"+final.id)).body.signal.result,"WIN");
 const altered=signal({revision:4,source:"KRAKEN"});assert.equal((await post(db,envelope([altered]))).status,409);
 const same=signal({revision:3});same.resultDelivery="UNCERTAIN";assert.equal((await post(db,envelope([same]))).status,409);
});
test("estatísticas excluem teste, cancelamento, publicação incerta e apuração inconclusiva",async t=>{
 const db=makeDb();t.after(()=>db.close());
 const good=signal(),loss=signal({result:"LOSS",index:1});good.resultDelivery="UNCERTAIN";good.state="ENTREGA_INCERTA_RESULTADO";
 const cancelled=signal({result:"PENDENTE",index:2});Object.assign(cancelled,{state:"CANCELADO_ANTES_ENVIO",publication:"CANCELLED",publishedAt:null,telegramMessageId:null});
 const uncertain=signal({result:"PENDENTE",index:3});Object.assign(uncertain,{state:"ENTREGA_INCERTA_SINAL",publication:"UNCERTAIN",publishedAt:null,telegramMessageId:null});
 const demo=signal({demo:true,index:4}),tie=signal({result:"EMPATE",index:5}),inconclusive=signal({result:"INCONCLUSIVO",index:6});
 assert.equal((await post(db,envelope([good,loss,cancelled,uncertain,demo,tie,inconclusive]),{config:{...CONFIG,testData:true}})).status,200);
 const stats=(await get(db,"/api/public/stats", {config:{...CONFIG,testData:true}})).body;
 assert.equal(stats.sample,2);assert.equal(stats.rate,50);assert.equal(stats.excluded,5);assert.equal(stats.demo,1);
 assert.equal((await get(db,"/api/public/signals")).body.total,6);
 assert.equal((await post(db,envelope([signal({demo:true,index:8})]))).status,422);
});
test("publicação após entrada vira inconclusiva; vela e fonte inválidas são rejeitadas",async t=>{
 const db=makeDb();t.after(()=>db.close());const late=signal();late.publishedAt=late.entryAt;
 assert.equal((await post(db,envelope([late]))).status,200);assert.equal((await get(db,"/api/public/signals/"+late.id)).body.signal.result,"INCONCLUSIVO");assert.equal((await get(db,"/api/public/stats")).body.sample,0);
 const bad=signal({index:2});bad.candle.high=50;assert.equal((await post(db,envelope([bad]))).status,422);
 const symbol=signal({index:3});symbol.symbol="ETH-USD";assert.equal((await post(db,envelope([symbol]))).status,422);
 const future=signal({index:4});future.assessedAt=new Date(NOW+60000).toISOString();assert.equal((await post(db,envelope([future]))).status,422);
});
test("sem amostra e fuso Manaus não produzem taxa nem datas inventadas",async t=>{
 const db=makeDb();t.after(()=>db.close());const empty=(await get(db,"/api/public/stats")).body;assert.equal(empty.rate,null);assert.equal(empty.sample,0);
 const s=signal();const entry=Date.parse("2026-09-02T03:00:00Z"),shift=entry-Date.parse(s.entryAt);
 for(const k of ["analyzedAt","createdAt","publishedAt","entryAt","endAt","assessedAt","resultPublishedAt"])s[k]=new Date(Date.parse(s[k])+shift).toISOString();
 s.id="BTC_"+entry;s.candle.openTime=s.entryAt;s.candle.endTime=s.endAt;
 await post(db,envelope([s]));
 assert.equal((await get(db,"/api/public/signals?from=2026-09-01&to=2026-09-01")).body.total,1);
 assert.equal((await get(db,"/api/public/signals?from=2026-09-02&to=2026-09-02")).body.total,0);
});
test("comando começa solicitado, exige admin/origem, é idempotente e só muda com confirmação autenticada",async t=>{
 const db=makeDb();t.after(()=>db.close());const config={...CONFIG,commandsEnabled:true},user=async()=>({id:"test-admin"}),key=crypto.randomUUID();
 const req=(origin=CONFIG.origin)=>new Request(CONFIG.origin+"/api/admin/commands",{method:"POST",headers:{"Content-Type":"application/json",origin},body:JSON.stringify({kind:"PAUSE",idempotencyKey:key})});
 assert.equal((await handleRequest(req("https://attacker.example.test"),opts(db,{config,getAdmin:user}))).status,403);
 const first=await handleRequest(req(),opts(db,{config,getAdmin:user}));assert.equal(first.status,202);const c=(await first.json()).command;assert.equal(c.status,"REQUESTED");
 const second=await handleRequest(req(),opts(db,{config,getAdmin:user}));assert.equal((await second.json()).command.id,c.id);
 await assert.rejects(()=>requestCommand(db,"RESUME",crypto.randomUUID(),"test-admin",NOW),e=>e.code==="COMMAND_PENDING");
 assert.equal((await adminState(db))[0].status,"REQUESTED");
 await post(db,envelope([],[],[{id:c.id,status:"CONFIRMED",reason:"APPLIED"}]),{config});
 assert.equal((await adminState(db))[0].status,"CONFIRMED");
});
test("transação falha sem gravar recibo ou parte do evento",async t=>{
 const db=makeDb();t.after(()=>db.close());const event=envelope([signal()]);
 const raw=db.batch;db.batch=async statements=>raw([...statements,db.prepare("INSERT INTO assets(code,pair,coinbase,kraken) VALUES ('BTC','x','x','x')")]);
 const r=await post(db,event);assert.equal(r.status,503);assert.equal((await get(db,"/api/public/signals")).body.total,0);
 assert.equal(await db.prepare("SELECT id FROM event_receipts WHERE id=?").bind(event.eventId).first(),null);
});
test("limite de ingestão e links Telegram não autorizados",async t=>{
 const db=makeDb();t.after(()=>db.close());
 await db.prepare("INSERT INTO rate_limits(bucket,count) VALUES (?,90)").bind(Math.floor(NOW/60000)).run();
 assert.equal((await post(db,envelope([signal()]))).status,429);
 await db.prepare("DELETE FROM rate_limits").run();
 const s=signal();s.telegramUrl="https://t.me/unapproved/100";assert.equal((await post(db,envelope([s]))).status,422);
});
