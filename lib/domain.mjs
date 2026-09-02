import { z } from "zod";
export const ASSETS = [
 {code:"BTC",name:"Bitcoin",pair:"BTC/USD",coinbase:"BTC-USD",kraken:"XBTUSD"},
 {code:"ETH",name:"Ethereum",pair:"ETH/USD",coinbase:"ETH-USD",kraken:"ETHUSD"},
 {code:"SOL",name:"Solana",pair:"SOL/USD",coinbase:"SOL-USD",kraken:"SOLUSD"}
];
export const RESULTS = ["WIN","LOSS","EMPATE","INCONCLUSIVO","PENDENTE"];
export const STATES = ["ENVIANDO_SINAL","AGUARDANDO_VELA","ENVIANDO_RESULTADO","ENTREGA_INCERTA_SINAL","ENTREGA_INCERTA_RESULTADO","CONCLUIDO","CANCELADO_ANTES_ENVIO"];
export const REASONS = ["NONE","WAITING_CANDLE","LATE_PUBLICATION","INSUFFICIENT_LEAD","INVALID_DATA","DELIVERY_UNCERTAIN","MAINTENANCE","PAUSED","NO_SIGNAL","COOLDOWN","QUEUE_FULL","CYCLE_LIMIT","SOURCE_FAILURE","NOT_READY","DUPLICATE","ENGINE_FAILURE","UNKNOWN"];
export const reasonLabel = {
 NONE:"Sem ocorrência",WAITING_CANDLE:"Aguardando a vela exata",LATE_PUBLICATION:"Publicação após a entrada",
 INSUFFICIENT_LEAD:"Antecedência insuficiente",INVALID_DATA:"Dados indisponíveis ou inválidos",DELIVERY_UNCERTAIN:"Entrega incerta: reconciliação necessária",
 MAINTENANCE:"Motor em manutenção",PAUSED:"Novos sinais pausados",NO_SIGNAL:"Condições de sinal não atendidas",
 COOLDOWN:"Intervalo entre sinais",QUEUE_FULL:"Fila operacional cheia",CYCLE_LIMIT:"Limite do ciclo",SOURCE_FAILURE:"Falha na fonte de dados",
 ENGINE_FAILURE:"Falha operacional do motor",NOT_READY:"Motor ainda não preparado",DUPLICATE:"Sinal já registrado",UNKNOWN:"Diagnóstico indisponível"
};
const nullableNumber = z.number().finite().nullable();
const positive = z.number().finite().positive();
const utc = z.string().datetime();
const id = z.string().regex(/^(BTC|ETH|SOL)_[0-9]{13}$/);
const indicator = z.object({close:nullableNumber,volume:nullableNumber,emaFast:nullableNumber,emaSlow:nullableNumber,rsi:z.number().min(0).max(100).nullable(),atrPct:z.number().nonnegative().nullable(),volumeMean:z.number().nonnegative().nullable()}).strict();
const candle = z.object({openTime:utc,endTime:utc,open:positive,high:positive,low:positive,close:positive,volume:z.number().finite().nonnegative()}).strict();
export const signalSchema = z.object({
 id,revision:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),recordVersion:z.number().int().min(1).max(2),
 strategyVersion:z.string().min(1).max(40).regex(/^[A-Za-z0-9 .+_-]+$/),
 asset:z.enum(["BTC","ETH","SOL"]),pair:z.enum(["BTC/USD","ETH/USD","SOL/USD"]),
 direction:z.enum(["BUY","SELL"]),source:z.enum(["COINBASE","KRAKEN"]),symbol:z.string().max(12),
 score:z.number().min(0).max(100).nullable(),buyScore:z.number().min(0).max(100).nullable(),sellScore:z.number().min(0).max(100).nullable(),
 analyzedAt:utc.nullable(),createdAt:utc.nullable(),publishedAt:utc.nullable(),entryAt:utc,endAt:utc,
 assessedAt:utc.nullable(),resultPublishedAt:utc.nullable(),referencePrice:positive.nullable(),
 state:z.enum(STATES),result:z.enum(RESULTS),publication:z.enum(["CONFIRMED","UNCERTAIN","CANCELLED","NOT_CONFIRMED"]),
 resultDelivery:z.enum(["CONFIRMED","UNCERTAIN","PENDING"]),reason:z.enum(REASONS),
 candle:candle.nullable(),indicators:z.object({m1:indicator.nullable(),m5:indicator.nullable(),m15:indicator.nullable()}).strict(),
 volumeFactor:z.number().finite().nonnegative().nullable(),
 telegramMessageId:z.number().int().positive().nullable(),telegramUrl:z.string().url().nullable(),demo:z.boolean(),imported:z.boolean()
}).strict().superRefine((s,ctx)=>{
 const fail=(message)=>ctx.addIssue({code:z.ZodIssueCode.custom,message});
 const a=ASSETS.find(x=>x.code===s.asset),entry=Date.parse(s.entryAt),end=Date.parse(s.endAt);
 if(s.id!==s.asset+"_"+entry || entry%60000!==0 || end!==entry+60000)fail("Identidade ou intervalo M1 inválido.");
 if(s.pair!==a.pair || s.symbol!==(s.source==="COINBASE"?a.coinbase:a.kraken))fail("Fonte e símbolo inconsistentes.");
 if(s.analyzedAt && Date.parse(s.analyzedAt)>entry)fail("Análise posterior à entrada.");
 if(s.publication==="CONFIRMED" && (!s.publishedAt || !s.telegramMessageId))fail("Publicação sem confirmação.");
 if(s.state==="CANCELADO_ANTES_ENVIO" && s.publication!=="CANCELLED")fail("Cancelamento inconsistente.");
 if(["WIN","LOSS","EMPATE"].includes(s.result)){
  if(!s.candle || !s.assessedAt || s.publication!=="CONFIRMED")fail("Apuração não confirmada.");
  if(s.assessedAt && Date.parse(s.assessedAt)<end+5000)fail("Apuração antes do encerramento seguro.");
 }
 if(s.candle){
  const c=s.candle;
  if(Date.parse(c.openTime)!==entry || Date.parse(c.endTime)!==end || c.low>Math.min(c.open,c.close) || c.high<Math.max(c.open,c.close) || c.low>c.high)fail("OHLC inválido.");
  const expected=c.open===c.close?"EMPATE":((s.direction==="BUY"?c.close>c.open:c.close<c.open)?"WIN":"LOSS");
  if(["WIN","LOSS","EMPATE"].includes(s.result) && s.result!==expected)fail("Resultado diverge da vela.");
 }
});
export const statusSchema=z.object({
 asset:z.enum(["BTC","ETH","SOL"]),revision:z.number().int().positive(),lastCycleAt:utc.nullable(),analyzedAt:utc.nullable(),
 source:z.enum(["COINBASE","KRAKEN"]).nullable(),healthy:z.boolean(),lastFinishAt:utc.nullable(),paused:z.boolean(),maintenance:z.boolean(),ready:z.boolean(),
 reason:z.enum(REASONS),price:positive.nullable(),ages:z.object({m1:nullableNumber,m5:nullableNumber,m15:nullableNumber}).strict()
}).strict();
export const ackSchema=z.object({id:z.string().uuid(),status:z.enum(["CONFIRMED","REJECTED","UNCERTAIN"]),reason:z.enum(["APPLIED","MAINTENANCE","NOT_READY","EXPIRED","EXECUTION_UNCERTAIN","ENGINE_FAILURE"])}).strict();
export const envelopeSchema=z.object({eventId:z.string().uuid(),signals:z.array(signalSchema).max(20),statuses:z.array(statusSchema).max(3),acks:z.array(ackSchema).max(20)}).strict().refine(e=>e.signals.length+e.statuses.length+e.acks.length>0,"Evento vazio.");
export class AppError extends Error {constructor(status,code,message){super(message);this.status=status;this.code=code;}}
export function normalizeSignal(input,now=Date.now()){
 const s=signalSchema.parse(input);
 for(const value of [s.analyzedAt,s.createdAt,s.publishedAt,s.assessedAt,s.resultPublishedAt])if(value && Date.parse(value)>now+5000)throw new AppError(422,"FUTURE_TIMESTAMP","Horário futuro rejeitado.");
 if(Date.parse(s.entryAt)>now+120000)throw new AppError(422,"FUTURE_ENTRY","Entrada fora do intervalo permitido.");
 if(s.publishedAt && Date.parse(s.publishedAt)>=Date.parse(s.entryAt) && s.publication==="CONFIRMED"){
  return {...s,result:"INCONCLUSIVO",reason:"LATE_PUBLICATION"};
 }
 return s;
}
export function parseFilters(params,{ignoreResult=false}={}){
 const allowed=["asset","direction","result","from","to","version","limit","cursor"];
 for(const key of params.keys())if(!allowed.includes(key))throw new AppError(400,"INVALID_FILTER","Filtro não reconhecido.");
 for(const key of allowed)if(params.getAll(key).length>1)throw new AppError(400,"DUPLICATE_FILTER","Filtro repetido.");
 const result={};
 for(const [key,values] of Object.entries({asset:ASSETS.map(x=>x.code),direction:["BUY","SELL"],result:RESULTS})){
  const v=params.get(key); if(v && !values.includes(v))throw new AppError(400,"INVALID_FILTER","Filtro inválido.");
  if(v && !(ignoreResult&&key==="result"))result[key]=v;
 }
 const day=(v)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&new Date(v+"T12:00:00Z").toISOString().slice(0,10)===v;
 for(const k of ["from","to"]){const v=params.get(k);if(v){let valid=false;try{valid=day(v)}catch{}if(!valid)throw new AppError(400,"INVALID_DATE","Informe uma data válida.");result[k]=v;}}
 if(result.from&&result.to&&result.from>result.to)throw new AppError(400,"INVALID_PERIOD","A data inicial deve ser anterior à final.");
 if(params.get("version")){if(!/^[A-Za-z0-9 .+_-]{1,40}$/.test(params.get("version")))throw new AppError(400,"INVALID_VERSION","Versão inválida.");result.version=params.get("version");}
 const raw=params.get("limit")||"12";if(!/^[1-9]\d?$/.test(raw)||Number(raw)>50)throw new AppError(400,"INVALID_LIMIT","Limite inválido.");result.limit=Number(raw);
 if(params.get("cursor"))result.cursor=decodeCursor(params.get("cursor"));
 return result;
}
export function encodeCursor(cursor){return btoa(JSON.stringify(cursor)).replaceAll("+","-").replaceAll("/","_").replace(/=+$/,"");}
export function decodeCursor(v){
 try{if(v.length>400||!/^[A-Za-z0-9_-]+$/.test(v))throw 0;const c=JSON.parse(atob(v.replaceAll("-","+").replaceAll("_","/")));
 if(!Number.isSafeInteger(c.entry)||!Number.isSafeInteger(c.snapshot)||!Number.isSafeInteger(c.created)||!id.safeParse(c.id).success)throw 0;
 return c;}catch{throw new AppError(400,"INVALID_CURSOR","Paginação inválida.");}
}
export function safeOrigin(value){try{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password&&u.pathname==="/"&&!u.search&&!u.hash?u.origin:null}catch{return null;}}
export function safeTelegram(value){try{const u=new URL(value);return u.protocol==="https:"&&u.hostname==="t.me"&&/^\/[A-Za-z][A-Za-z0-9_]{4,31}$/.test(u.pathname)&&!u.search&&!u.hash&&!u.username&&!u.password?u.href:null}catch{return null;}}
export function safeSupport(value){try{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password?u.href:null}catch{return null;}}
export function safeReturn(value,fallback="/historico"){try{
 if(typeof value!=="string"||value.length>1800||!value.startsWith("/")||value.startsWith("//")||/[\\\x00-\x1f]/.test(value))return fallback;
 const u=new URL(value,"https://vinsett.internal");
 if(u.origin!=="https://vinsett.internal"||!/^\/(?:historico|estatisticas|status)?$/.test(u.pathname))return fallback;
 return u.pathname+u.search;
 }catch{return fallback;}
}
export function signalWindow(s,{now,uncertainty=Infinity,enabled=false}){
 if(!s)return {label:"Indisponível",kind:"muted"};
 if(s.state==="CANCELADO_ANTES_ENVIO")return {label:"Cancelado antes do envio",kind:"muted"};
 if(s.publication!=="CONFIRMED")return {label:"Publicação não confirmada",kind:"warning"};
 const entry=Date.parse(s.entryAt);
 if(now>=entry)return {label:"Janela encerrada",kind:"muted"};
 if(!Number.isFinite(now)||!Number.isFinite(uncertainty)||uncertainty>2000)return {label:"Horário incerto",kind:"warning"};
 if(entry-now-uncertainty<8000)return {label:"Antecedência insuficiente",kind:"warning"};
 if(!enabled)return {label:"Em acompanhamento",kind:"muted"};
 return {label:"Janela disponível",kind:"positive"};
}
export function statusView(s,now=Date.now()){
 if(!s)return {label:"Não conectado",kind:"warning",code:"DISCONNECTED"};
 if(s.maintenance)return {label:"Em manutenção",kind:"warning",code:"MAINTENANCE"};
 if(!s.ready)return {label:"Não preparado",kind:"warning",code:"NOT_READY"};
 if(s.paused)return {label:"Novos sinais pausados",kind:"warning",code:"PAUSED"};
 if(!s.healthy)return {label:"Falha operacional",kind:"warning",code:"DEGRADED"};
 const cycle=Date.parse(s.lastCycleAt||""),analysis=Date.parse(s.analyzedAt||"");
 if(!Number.isFinite(cycle)||now-cycle>180000||!Number.isFinite(analysis)||now-analysis>180000)return {label:"Dados atrasados",kind:"warning",code:"STALE"};
 if(["SOURCE_FAILURE","INVALID_DATA","QUEUE_FULL","DELIVERY_UNCERTAIN"].includes(s.reason))return {label:"Atenção necessária",kind:"warning",code:"DEGRADED"};
 return {label:"Em acompanhamento",kind:"positive",code:"MONITORING"};
}
