import { ASSETS, AppError, normalizeSignal, encodeCursor } from "./domain.mjs";
const run=(db,sql,args=[])=>db.prepare(sql).bind(...args);
export function filterSql(f,{includeDemo=false,ignoreResult=false,cursor=false}={}){
 const parts=[includeDemo?"1=1":"demo=0"],values=[];
 for(const [key,column] of [["asset","asset"],["direction","direction"],["version","strategy_version"]])if(f[key]){parts.push(column+"=?");values.push(f[key]);}
 if(f.result&&!ignoreResult){parts.push("result=?");values.push(f.result);}
 if(f.from){parts.push("entry_at>=?");values.push(Date.parse(f.from+"T00:00:00-04:00"));}
 if(f.to){parts.push("entry_at<?");values.push(Date.parse(f.to+"T00:00:00-04:00")+86400000);}
 if(cursor&&f.cursor){parts.push("created_at<=? AND (entry_at<? OR (entry_at=? AND id<?))");values.push(f.cursor.snapshot,f.cursor.entry,f.cursor.entry,f.cursor.id);}
 return {sql:parts.join(" AND "),values};
}
export function publicSignal(row,config={}){
 const s=JSON.parse(row.data);
 return {...s,syncedAt:new Date(row.synced_at).toISOString(),telegramUrl:config.telegram && s.telegramUrl===config.telegram+"/"+s.telegramMessageId?s.telegramUrl:null};
}
export async function listSignals(db,f,config,now=Date.now()){
 const q=filterSql(f,{includeDemo:config.testData,cursor:true}),snapshot=f.cursor?.snapshot??now;
 const c=filterSql(f,{includeDemo:config.testData});
 const [rows,total]=await Promise.all([
  run(db,"SELECT * FROM signals WHERE "+q.sql+" AND created_at<=? ORDER BY entry_at DESC,id DESC LIMIT ?",[...q.values,snapshot,f.limit+1]).all(),
  run(db,"SELECT COUNT(*) AS n FROM signals WHERE "+c.sql+" AND created_at<=?",[...c.values,snapshot]).first()
 ]);
 const more=rows.results.length>f.limit,items=rows.results.slice(0,f.limit),last=items.at(-1);
 return {items:items.map(r=>publicSignal(r,config)),total:total.n,nextCursor:more&&last?encodeCursor({entry:last.entry_at,id:last.id,snapshot,created:last.created_at}):null,snapshot:new Date(snapshot).toISOString()};
}
export async function getSignal(db,id,config){
 const row=await run(db,"SELECT * FROM signals WHERE id=?"+(config.testData?"":" AND demo=0"),[id]).first();
 if(!row)throw new AppError(404,"SIGNAL_NOT_FOUND","Sinal não encontrado.");
 return publicSignal(row,config);
}
export async function statistics(db,f,config){
 const q=filterSql(f,{includeDemo:config.testData,ignoreResult:true});
 const rows=(await run(db,"SELECT result,publication,valid_result,demo,state,COUNT(*) AS n FROM signals WHERE "+q.sql+" GROUP BY result,publication,valid_result,demo,state",q.values).all()).results;
 const counts={WIN:0,LOSS:0,EMPATE:0,INCONCLUSIVO:0,PENDENTE:0};
 let wins=0,losses=0,total=0,excluded=0,cancelled=0,uncertain=0,demo=0;
 for(const r of rows){
  total+=r.n;counts[r.result]=(counts[r.result]||0)+r.n;
  const cancelledRow=r.state==="CANCELADO_ANTES_ENVIO";
  if(cancelledRow)cancelled+=r.n;
  if(r.publication==="UNCERTAIN"||r.publication==="NOT_CONFIRMED")uncertain+=r.n;
  if(r.demo)demo+=r.n;
  const eligible=!r.demo&&!cancelledRow&&r.publication==="CONFIRMED"&&r.valid_result===1;
  if(eligible&&r.result==="WIN")wins+=r.n;
  else if(eligible&&r.result==="LOSS")losses+=r.n;
  else excluded+=r.n;
 }
 const versions=(await run(db,"SELECT DISTINCT strategy_version FROM signals WHERE "+q.sql+" ORDER BY strategy_version",q.values).all()).results.map(r=>r.strategy_version);
 return {counts,total,wins,losses,sample:wins+losses,rate:wins+losses?wins/(wins+losses)*100:null,excluded,cancelled,uncertain,demo,versions};
}
export async function statuses(db){
 const rows=(await run(db,"SELECT * FROM public_status ORDER BY asset").all()).results;
 return ASSETS.map(a=>{const r=rows.find(x=>x.asset===a.code);return {asset:a.code,record:r?{...JSON.parse(r.data),syncedAt:new Date(r.synced_at).toISOString()}:null};});
}
function signalInsert(db,s,now){
 const entry=Date.parse(s.entryAt),valid=["WIN","LOSS","EMPATE"].includes(s.result)&&!!s.candle&&s.publication==="CONFIRMED"&&Date.parse(s.publishedAt)<entry;
 const values=[s.id,s.asset,s.revision,s.recordVersion,s.strategyVersion,s.direction,s.source,s.symbol,entry,Date.parse(s.endAt),now,now,s.analyzedAt?Date.parse(s.analyzedAt):null,s.publishedAt?Date.parse(s.publishedAt):null,s.assessedAt?Date.parse(s.assessedAt):null,s.result,s.state,s.publication,valid?1:0,s.demo?1:0,s.score,JSON.stringify(s)];
 return run(db,`INSERT INTO signals (id,asset,revision,record_version,strategy_version,direction,source,symbol,entry_at,end_at,created_at,synced_at,analyzed_at,published_at,assessed_at,result,state,publication,valid_result,demo,score,data) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
 ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,synced_at=excluded.synced_at,assessed_at=excluded.assessed_at,result=excluded.result,state=excluded.state,publication=excluded.publication,published_at=excluded.published_at,valid_result=excluded.valid_result,data=excluded.data
 WHERE excluded.revision>signals.revision AND excluded.asset=signals.asset AND excluded.direction=signals.direction AND excluded.source=signals.source AND excluded.symbol=signals.symbol AND excluded.strategy_version=signals.strategy_version AND excluded.entry_at=signals.entry_at AND excluded.demo=signals.demo`,values);
}
export async function ingest(db,envelope,digest,config,now=Date.now()){
 const prior=await run(db,"SELECT digest FROM event_receipts WHERE id=?",[envelope.eventId]).first();
 if(prior){if(prior.digest!==digest)throw new AppError(409,"EVENT_CONFLICT","Evento reutilizado com conteúdo diferente.");return {duplicate:true};}
 const signals=envelope.signals.map(s=>normalizeSignal(s,now)),ignored=[];
 if(signals.some(s=>s.telegramUrl && (!config.telegram || s.telegramUrl!==config.telegram+"/"+s.telegramMessageId)))throw new AppError(422,"UNAPPROVED_TELEGRAM_URL","Link público não autorizado.");
 if(signals.some(s=>s.demo&&!config.testData))throw new AppError(422,"DEMO_REJECTED","Dados de teste não são aceitos no histórico real.");
 const ids=new Set();for(const s of signals){if(ids.has(s.id))throw new AppError(422,"DUPLICATE_ID","ID repetido no lote.");ids.add(s.id);}
 for(const s of signals){
  const current=await run(db,"SELECT data,revision FROM signals WHERE id=?",[s.id]).first();
  if(current){
   const old=JSON.parse(current.data);
   if(s.revision<current.revision){ignored.push(s.id);continue;}
   if(s.imported){for(const k of ["analyzedAt","telegramUrl"])if(s[k]===null)s[k]=old[k];}
   s.imported=old.imported;
   for(const key of ["asset","pair","entryAt","endAt","direction","source","symbol","strategyVersion","recordVersion","score","analyzedAt","referencePrice","demo"]){
    if(old[key]!==s[key] && !(key==="analyzedAt"&&old[key]===null))throw new AppError(409,"IMMUTABLE_SIGNAL","Dados originais do sinal não podem mudar.");
   }
   if(s.revision===current.revision && JSON.stringify({...s,analyzedAt:old.analyzedAt,imported:old.imported})!==JSON.stringify(old))throw new AppError(409,"REVISION_CONFLICT","Revisão reutilizada com dados diferentes.");
  }
 }
 for(const s of envelope.statuses)if((s.lastCycleAt&&Date.parse(s.lastCycleAt)>now+5000)||(s.analyzedAt&&Date.parse(s.analyzedAt)>now+5000)||s.revision>now+5000)throw new AppError(422,"FUTURE_STATUS","Horário de status inválido.");
 const statements=[run(db,"INSERT INTO event_receipts (id,digest,received_at) VALUES (?,?,?)",[envelope.eventId,digest,now])];
 for(const a of ASSETS)statements.push(run(db,"INSERT INTO assets (code,pair,coinbase,kraken) VALUES (?,?,?,?) ON CONFLICT(code) DO NOTHING",[a.code,a.pair,a.coinbase,a.kraken]));
 for(const s of signals)if(!ignored.includes(s.id))statements.push(signalInsert(db,s,now));
 for(const s of envelope.statuses)statements.push(run(db,"INSERT INTO public_status (asset,revision,synced_at,data) VALUES (?,?,?,?) ON CONFLICT(asset) DO UPDATE SET revision=excluded.revision,synced_at=excluded.synced_at,data=excluded.data WHERE excluded.revision>public_status.revision",[s.asset,s.revision,now,JSON.stringify(s)]));
 for(const a of envelope.acks)statements.push(run(db,"UPDATE commands SET status=?,acknowledged_at=?,reason=? WHERE id=? AND status IN ('REQUESTED','UNCERTAIN')",[a.status,now,a.reason,a.id]));
 try{await db.batch(statements);}catch(error){
  const receipt=await run(db,"SELECT digest FROM event_receipts WHERE id=?",[envelope.eventId]).first();
  if(receipt?.digest===digest)return {duplicate:true};
  if(receipt)throw new AppError(409,"EVENT_CONFLICT","Evento reutilizado.");
  throw error;
 }
 return {duplicate:false,accepted:signals.length-ignored.length,ignoredStaleIds:ignored};
}
export async function takeRateLimit(db,now){
 const bucket=Math.floor(now/60000);
 const r=await run(db,"INSERT INTO rate_limits (bucket,count) VALUES (?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1 WHERE count<90 RETURNING count",[bucket]).first();
 if(!r)throw new AppError(429,"RATE_LIMIT","Limite temporário de sincronização atingido.");
 await run(db,"DELETE FROM rate_limits WHERE bucket<?",[bucket-2]).run();
}
export async function pendingCommands(db,now=Date.now()){
 await run(db,"UPDATE commands SET status='UNCERTAIN',reason='EXPIRED',acknowledged_at=? WHERE status='REQUESTED' AND requested_at<?",[now,now-600000]).run();
 return (await run(db,"SELECT id,kind,requested_at AS requestedAt FROM commands WHERE status IN ('REQUESTED','UNCERTAIN') ORDER BY requested_at LIMIT 10").all()).results;
}
export async function adminState(db){return (await run(db,"SELECT id,kind,status,requested_at AS requestedAt,acknowledged_at AS acknowledgedAt,reason FROM commands ORDER BY requested_at DESC LIMIT 30").all()).results;}
export async function requestCommand(db,kind,key,user,now=Date.now()){
 const prior=await run(db,"SELECT id,kind,status FROM commands WHERE requester=? AND idempotency_key=?",[user,key]).first();
 if(prior){if(prior.kind!==kind)throw new AppError(409,"KEY_REUSED","Pedido já usado para outra ação.");return prior;}
 await pendingCommands(db,now);
 const pending=await run(db,"SELECT id FROM commands WHERE status IN ('REQUESTED','UNCERTAIN') LIMIT 1").first();
 if(pending)throw new AppError(409,"COMMAND_PENDING","Existe um pedido pendente de confirmação ou reconciliação.");
 const id=crypto.randomUUID();
 try{await run(db,"INSERT INTO commands (id,kind,status,requested_at,requester,idempotency_key) VALUES (?,?,'REQUESTED',?,?,?)",[id,kind,now,user,key]).run();}catch(error){
  const existing=await run(db,"SELECT id,kind,status FROM commands WHERE requester=? AND idempotency_key=?",[user,key]).first();
  if(existing&&existing.kind===kind)return existing;
  throw new AppError(409,"COMMAND_PENDING","Já existe um pedido pendente.");
 }
 return {id,kind,status:"REQUESTED"};
}
