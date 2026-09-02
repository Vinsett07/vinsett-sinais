import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";
import {ASSETS} from "../lib/domain.mjs";
export const NOW=Date.parse("2026-09-02T20:00:30Z");
export const CONFIG={secret:"test-only-never-deploy-this-key-".repeat(2),origin:"https://vinsett.example.test",authMode:"off",telegram:null,support:null,commandsEnabled:false,testData:false};
export function makeDb(){
 const connection=new DatabaseSync(":memory:");connection.exec("PRAGMA foreign_keys=ON");
 for(const file of readdirSync(new URL("../drizzle/",import.meta.url)).filter(n=>n.endsWith(".sql")).sort())connection.exec(readFileSync(new URL("../drizzle/"+file,import.meta.url),"utf8"));
 const prepare=(sql)=>{
  let params=[];const statement=connection.prepare(sql);
  const api={bind(...p){params=p;return api},async first(column){const r=statement.get(...params)||null;return column&&r?r[column]:r;},async all(){return {results:statement.all(...params),success:true}},async run(){const r=statement.run(...params);return {success:true,meta:{changes:r.changes,last_row_id:r.lastInsertRowid},results:[]}}};
  return api;
 };
 const db={prepare,async batch(statements){connection.exec("BEGIN");try{const r=[];for(const s of statements)r.push(await s.run());connection.exec("COMMIT");return r}catch(e){connection.exec("ROLLBACK");throw e;}},connection,close(){connection.close();}};
 return db;
}
export function signal({asset="BTC",direction="BUY",result="WIN",source="COINBASE",index=0,demo=false,revision=1}={}){
 const a=ASSETS.find(x=>x.code===asset),entry=NOW-3030000-index*60000;
 const open=100,close=result==="EMPATE"?100:result==="LOSS"?(direction==="BUY"?99:101):(direction==="BUY"?101:99);
 const valid=["WIN","LOSS","EMPATE"].includes(result),resolved=result!=="PENDENTE";
 const iso=n=>new Date(n).toISOString(),ind={close:100,volume:80,emaFast:100,emaSlow:99,rsi:60,atrPct:.04,volumeMean:100};
 return {id:asset+"_"+entry,revision,recordVersion:2,strategyVersion:"5.0.0",asset,pair:a.pair,direction,source,symbol:source==="COINBASE"?a.coinbase:a.kraken,score:88,buyScore:direction==="BUY"?88:0,sellScore:direction==="SELL"?88:0,analyzedAt:iso(entry-22000),createdAt:iso(entry-22000),publishedAt:iso(entry-18000),entryAt:iso(entry),endAt:iso(entry+60000),assessedAt:valid?iso(entry+66000):null,resultPublishedAt:resolved?iso(entry+68000):null,referencePrice:100,state:resolved?"CONCLUIDO":"AGUARDANDO_VELA",result,publication:"CONFIRMED",resultDelivery:resolved?"CONFIRMED":"PENDING",reason:result==="INCONCLUSIVO"?"INVALID_DATA":resolved?"NONE":"WAITING_CANDLE",candle:valid?{openTime:iso(entry),endTime:iso(entry+60000),open,close,high:102,low:98,volume:25}:null,indicators:{m1:ind,m5:ind,m15:ind},volumeFactor:.8,telegramMessageId:index+100,telegramUrl:null,demo,imported:false};
}
export const envelope=(signals=[],statuses=[],acks=[])=>({eventId:crypto.randomUUID(),signals,statuses,acks});
