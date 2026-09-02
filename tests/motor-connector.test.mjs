import test from "node:test";import assert from "node:assert/strict";import vm from "node:vm";import {readFileSync} from "node:fs";import {createHash,createHmac,randomUUID} from "node:crypto";
import {envelopeSchema} from "../lib/domain.mjs";
import {signal,NOW} from "./helpers.mjs";
const original=readFileSync(new URL("../integrations/reference/VINSETT_V5.original.gs",import.meta.url),"utf8");
const connector=readFileSync(new URL("../integrations/VINSETT_App_Connector.gs",import.meta.url),"utf8");
function rawRecord(){
 const s=signal();return {v:2,asset:s.asset,start:Date.parse(s.entryAt),end:Date.parse(s.endAt),pair:s.pair,source:s.source,symbol:s.symbol,direction:s.direction,score:s.score,version:s.strategyVersion,chatId:"PRIVATE_DESTINATION_TEST_ONLY",createdAt:Date.parse(s.createdAt),sentAt:Date.parse(s.publishedAt),signalMessageId:s.telegramMessageId,resultMessageId:900,finishedAt:Date.parse(s.resultPublishedAt),state:s.state,revision:s.revision,result:{outcome:s.result,...s.candle,assessedAt:Date.parse(s.assessedAt)},analysis:{at:Date.parse(s.analyzedAt),price:s.referencePrice,buyScore:s.buyScore,sellScore:s.sellScore,volumeFactor:s.volumeFactor,indicators:s.indicators}};
}
function harness(initial={}){
 const values={...initial},writes=[],requests=[],triggers=[];const property={getProperty:k=>values[k]??null,getProperties:()=>({...values}),setProperty(k,v){writes.push(k);values[k]=String(v);return property},setProperties(v){Object.keys(v).forEach(k=>property.setProperty(k,v[k]));return property},deleteProperty(k){writes.push(k);delete values[k];return property}};
 const lock={tryLock:()=>true,releaseLock:()=>{}};
 class Clock extends Date{static now(){return NOW;}}
 const context=vm.createContext({console:{log(){},warn(){},error(){}},Date:Clock,PropertiesService:{getScriptProperties:()=>property},LockService:{getUserLock:()=>lock,getScriptLock:()=>lock},Utilities:{getUuid:()=>randomUUID(),newBlob:s=>({getBytes:()=>Array.from(Buffer.from(s))}),Charset:{UTF_8:"UTF-8"},computeHmacSha256Signature:(s,key)=>Array.from(createHmac("sha256",key).update(s).digest())},UrlFetchApp:{fetch(url,options){requests.push({url,options});const e=JSON.parse(options.payload);return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({eventId:e.eventId,duplicate:false,commands:[]})};}},ScriptApp:{getProjectTriggers:()=>triggers,newTrigger:name=>({timeBased(){return this},everyMinutes(){return this},create(){triggers.push({getHandlerFunction:()=>name});return this}}),deleteTrigger:trigger=>{triggers.splice(triggers.indexOf(trigger),1)}}});
 vm.runInContext(original,context,{timeout:5000});vm.runInContext(connector,context,{timeout:5000});
 return {context,values,writes,requests,triggers,run:code=>vm.runInContext(code,context,{timeout:5000})};
}
function candles(minutes=1,count=60,now=NOW){
 const ms=minutes*60000,last=Math.floor(now/ms)*ms-ms;
 return Array.from({length:count},(_,i)=>({openTime:last-(count-i-1)*ms,closeTime:last-(count-i-1)*ms+ms-1,open:100,high:102,low:98,close:101,volume:25}));
}
test("backup do código V5 preserva SHA-256 e compila sem execução externa",()=>{
 const expected=readFileSync(new URL("../integrations/reference/SHA256.txt",import.meta.url),"utf8").split(" ")[0];
 assert.equal(createHash("sha256").update(original).digest("hex"),expected);new vm.Script(original);new vm.Script(connector);
});
test("funções originais mantêm SMA inicial da EMA, médias simples e score limite",()=>{
 const h=harness();
 assert.deepEqual(Array.from(h.context.emaSerie_([1,2,3,4],3)),[null,null,2,3]);
 assert.equal(h.context.rsiUltimo_(Array.from({length:20},(_,i)=>i+1),14),100);
 assert.equal(h.context.rsiUltimo_(Array.from({length:20},(_,i)=>30-i),14),0);
 const c=candles();assert.ok(Math.abs(h.context.atrPctUltimo_(c,14)-(4/101*100))<1e-10);
 c.at(-1).volume=45;assert.equal(h.context.mediaVolumeUltimo_(c,20),26);
 const ind={close:100,emaFast:101,emaSlow:99,rsi:70,atrPct:.2};assert.equal(h.context.calcularScoreTecnico_("BUY",ind,ind,ind,2),100);
});
test("séries originais rejeitam lacunas, duplicatas, volume inválido, vela futura e menos de 60 velas",()=>{
 const h=harness(),good=candles();
 assert.doesNotThrow(()=>h.context.validarSerie_(good,1,NOW));
 assert.throws(()=>h.context.validarSerie_(good.slice(1),1,NOW));
 for(const variant of ["duplicate","gap","future","volume"]){
  const c=structuredClone(good);
  if(variant==="duplicate")c[20]=structuredClone(c[19]);
  if(variant==="gap")c.splice(20,1);
  if(variant==="future"){c.at(-1).openTime+=60000;c.at(-1).closeTime+=60000;}
  if(variant==="volume")c.at(-1).volume=-1;
  assert.throws(()=>h.context.validarSerie_(c,1,NOW),variant);
 }
 for(const [minutes,limit] of [[1,120],[5,420],[15,1020]]){const c=candles(minutes);assert.throws(()=>h.context.validarSerie_(c,minutes,c.at(-1).closeTime+(limit+1)*1000));}
});
test("apuração original usa vela exata, respeita BUY/SELL/EMPATE e fim+5s",()=>{
 const h=harness(),r=rawRecord(),c={openTime:r.start,closeTime:r.end-1,open:100,close:101,high:102,low:98,volume:20};
 assert.equal(h.context.avaliarVela_(r,[c],r.end+5000).outcome,"WIN");
 assert.equal(h.context.avaliarVela_({...r,direction:"SELL"},[c],r.end+5000).outcome,"LOSS");
 assert.equal(h.context.avaliarVela_(r,[{...c,close:100}],r.end+5000).outcome,"EMPATE");
 assert.throws(()=>h.context.avaliarVela_(r,[c],r.end+4999));assert.throws(()=>h.context.avaliarVela_(r,[c,c],NOW));
});
test("pausa original mantém apuração e não inicia novas análises",()=>{
 const h=harness({VINSETT_V5_READY:"5.0.0",VINSETT_V5_MAINTENANCE:"false",VINSETT_PAUSED:"true"});let assessed=0,analyses=0;
 for(const name of ["validarTelegram_","processarComandosSeNecessario_","normalizarEnviosInterrompidos_","sincronizarHistorico_","gravarDiagnosticos_","limparArquivados_"])h.context[name]=()=>{};
 h.context.obterHistorico_=()=>({});h.context.processarResultados_=()=>{assessed++};h.context.carregarLoteMercado_=()=>{analyses++};
 h.context.cicloVinsett();assert.equal(assessed,1);assert.equal(analyses,0);
});
test("projeção é aceita pelo contrato, preserva o sinal e exclui chat privado e token",()=>{
 const r=rawRecord(),h=harness({TELEGRAM_BOT_TOKEN:"FAKE_PRIVATE_TOKEN_MUST_NOT_LEAK"});const before=JSON.stringify(r),s=h.context.vsaProjectRecord_(r,false);
 assert.doesNotThrow(()=>envelopeSchema.parse({eventId:randomUUID(),signals:[s],statuses:[],acks:[]}));
 assert.equal(JSON.stringify(r),before);assert.doesNotMatch(JSON.stringify(s),/PRIVATE_DESTINATION|TOKEN_MUST_NOT_LEAK|chatId/);assert.equal(s.telegramUrl,null);
 assert.equal(s.id,"BTC_"+r.start);assert.equal(s.score,r.score);assert.equal(s.result,r.result.outcome);assert.equal(s.source,r.source);
});
test("conector persiste evento em falha, retoma o mesmo corpo após reinício e não modifica filas",()=>{
 const r=rawRecord(),key="VINSETT_WL2_BTC_"+r.start,initial={VSA_APP_URL:"https://vinsett.example.test/api/connector/sync",VSA_APP_SECRET:"test-only-never-deploy-this-secret-key",VSA_APP_ENABLED:"true",[key]:JSON.stringify(r),VINSETT_PAUSED:"true",VINSETT_V5_MAINTENANCE:"false",VINSETT_V5_READY:"5.0.0"},h=harness(initial);
 h.context.UrlFetchApp.fetch=(url,options)=>{h.requests.push({url,options});throw new Error("network unavailable")};
 assert.throws(()=>h.context.vinsettAppSincronizar());assert.ok(h.values.VSA_APP_OUTBOX);assert.equal(h.values[key],initial[key]);assert.ok(h.writes.every(k=>k.startsWith("VSA_APP_")));
 const payload=h.requests[0].options.payload,again=harness(h.values);again.context.vinsettAppSincronizar();
 assert.equal(again.requests[0].options.payload,payload);assert.equal(again.values[key],initial[key]);assert.equal(again.values.VSA_APP_OUTBOX,undefined);
 const request=again.requests[0];assert.equal(request.options.headers["X-Vinsett-Signature"],createHmac("sha256",initial.VSA_APP_SECRET).update(request.options.headers["X-Vinsett-Timestamp"]+"."+payload).digest("hex"));
});
test("instalação do conector é idempotente e não remove outros acionadores",()=>{
 const h=harness({VSA_APP_URL:"https://vinsett.example.test/api/connector/sync",VSA_APP_SECRET:"test-only-never-deploy-this-secret-key",VSA_APP_ENABLED:"true"});
 h.triggers.push({getHandlerFunction:()=>"cicloVinsett"});
 h.context.vinsettAppInstalar();h.context.vinsettAppInstalar();assert.equal(h.triggers.length,2);
 h.context.vinsettAppDesativar();assert.equal(h.triggers.length,1);assert.equal(h.triggers[0].getHandlerFunction(),"cicloVinsett");
});
test("comandos não executam duas vezes e retomada em manutenção é rejeitada",()=>{
 const h=harness({VINSETT_V5_MAINTENANCE:"true"});let pauses=0,resumes=0;
 h.context.pausarSistema=()=>{pauses++;h.values.VINSETT_PAUSED="true"};h.context.retomarSistema=()=>{resumes++};
 const c={id:randomUUID(),kind:"PAUSE",requestedAt:NOW};h.context.vsaCommand_(c,{control:true});h.context.vsaCommand_(c,{control:true});assert.equal(pauses,1);
 const resume={id:randomUUID(),kind:"RESUME",requestedAt:NOW};h.context.vsaCommand_(resume,{control:true});assert.equal(resumes,0);assert.equal(JSON.parse(h.values["VSA_APP_CMD_"+resume.id]).ack.reason,"MAINTENANCE");
 const started={id:randomUUID(),kind:"PAUSE",requestedAt:NOW};h.values["VSA_APP_CMD_"+started.id]=JSON.stringify({startedAt:NOW,kind:"PAUSE"});h.context.vsaCommand_(started,{control:true});assert.equal(pauses,1);assert.ok(JSON.parse(h.values.VSA_APP_ACKS).some(a=>a.id===started.id&&a.status==="UNCERTAIN"));
});

test("fallback original substitui o pacote completo e falha se as duas fontes forem inválidas",()=>{
 const h=harness(),calls=[];h.context.carregarLoteMercado_=()=>{};
 h.context.obterVelas_=(asset,source,minutes)=>{calls.push([source,minutes]);if(source==="COINBASE")throw new Error("source failure");return candles(minutes);};
 const result=h.context.buscarMultiTimeframeComFallback_(h.context.ativo_("BTC"),{dry:true});
 assert.equal(result.source,"KRAKEN");assert.equal(result.m1.length,60);assert.equal(result.m5.length,60);assert.equal(result.m15.length,60);
 assert.deepEqual(calls.filter(([source])=>source==="KRAKEN").map(([,minutes])=>minutes),[1,5,15]);
 h.context.obterVelas_=()=>{throw new Error("both sources fail")};assert.throws(()=>h.context.buscarMultiTimeframeComFallback_(h.context.ativo_("SOL"),{dry:true}));
});

test("retomada revalida manutenção dentro do lock e não muda acionadores",()=>{
 const h=harness({VINSETT_PAUSED:"true",VINSETT_V5_MAINTENANCE:"true",VINSETT_V5_READY:"5.0.0",VINSETT_V5_LAST_HEALTH:"OK",VINSETT_V5_LAST_FINISH:String(NOW)});
 assert.equal(h.context.vsaResumeSafely_().reason,"MAINTENANCE");assert.equal(h.values.VINSETT_PAUSED,"true");
 h.values.VINSETT_V5_MAINTENANCE="false";h.context.verificarPronto_=()=>{};h.context.obterHistorico_=()=>({});
 assert.equal(h.context.vsaResumeSafely_().reason,"NOT_READY");
 h.triggers.push({getHandlerFunction:()=>"cicloVinsett"});
 assert.equal(h.context.vsaResumeSafely_().status,"CONFIRMED");assert.equal(h.values.VINSETT_PAUSED,"false");assert.equal(h.triggers.length,1);
});
