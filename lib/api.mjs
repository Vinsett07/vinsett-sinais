import { z } from "zod";
import { AppError, ASSETS, envelopeSchema, parseFilters, safeOrigin, safeTelegram, safeSupport } from "./domain.mjs";
import { listSignals,getSignal,statistics,statuses,ingest,takeRateLimit,pendingCommands,adminState,requestCommand } from "./data.mjs";
const encoder=new TextEncoder();
export function publicConfig(config){return {assets:ASSETS,canonicalOrigin:safeOrigin(config.origin),telegram:safeTelegram(config.telegram),support:safeSupport(config.support),authEnabled:config.authMode==="sites",windowEnabled:config.windowEnabled===true,pwaEnabled:config.pwaEnabled===true,testData:config.testData===true,commandsEnabled:config.commandsEnabled===true,timezone:"America/Manaus"};}
export async function hash(value){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(value)))).map(x=>x.toString(16).padStart(2,"0")).join("");}
export async function sign(secret,timestamp,body){const key=await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC",key,encoder.encode(timestamp+"."+body)))).map(x=>x.toString(16).padStart(2,"0")).join("");}
export function constantEqual(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
export async function verifyRequest(request,config,now){
 if(!config.secret||config.secret.length<32)throw new AppError(503,"CONNECTOR_NOT_CONFIGURED","Conector não configurado.");
 const stamp=request.headers.get("x-vinsett-timestamp")||"",signature=request.headers.get("x-vinsett-signature")||"";
 if(!/^\d{13}$/.test(stamp)||Math.abs(now-Number(stamp))>300000||!/^[a-f0-9]{64}$/.test(signature))throw new AppError(401,"INVALID_SIGNATURE","Sincronização não autorizada.");
 if(Number(request.headers.get("content-length")||0)>98304)throw new AppError(413,"BODY_TOO_LARGE","Lote muito grande.");
 const reader=request.body?.getReader();if(!reader)throw new AppError(400,"MISSING_BODY","Evento ausente.");
 let count=0;const chunks=[];for(;;){const {done,value}=await reader.read();if(done)break;count+=value.length;if(count>98304){await reader.cancel();throw new AppError(413,"BODY_TOO_LARGE","Lote muito grande.");}chunks.push(value);}
 const bytes=new Uint8Array(count);let position=0;for(const c of chunks){bytes.set(c,position);position+=c.length;}
 const body=new TextDecoder().decode(bytes);
 if(!constantEqual(await sign(config.secret,stamp,body),signature))throw new AppError(401,"INVALID_SIGNATURE","Sincronização não autorizada.");
 return {body,digest:await hash(body)};
}
const json=(data,status=200,privateData=false)=>Response.json(data,{status,headers:{"Cache-Control":privateData?"private, no-store":"public, max-age=3, must-revalidate","X-Content-Type-Options":"nosniff","Referrer-Policy":"strict-origin-when-cross-origin"}});
function requireDb(db){if(!db)throw new AppError(503,"DATABASE_NOT_CONNECTED","Banco de dados não conectado.");}
function parseJson(text){try{return JSON.parse(text)}catch{throw new AppError(400,"INVALID_JSON","JSON inválido.");}}
/** @param {Request} request @param {{db:any,config:any,getAdmin?:()=>Promise<any>,getIdentity?:()=>Promise<any>,now?:number}} options */
export async function handleRequest(request,{db,config,getAdmin=async()=>null,getIdentity=async()=>null,now=Date.now()}){
 const url=new URL(request.url),path=url.pathname.replace(/\/$/,""),p=publicConfig(config),meta={serverNow:new Date(now).toISOString(),mode:p.testData?"test":"real"};
 try{
  if(request.method==="GET"){
   if(path==="/api/public/config")return json({...meta,...p});
   if(path==="/api/auth/me"){const identity=await getIdentity();if(!identity)throw new AppError(401,"SIGN_IN_REQUIRED","Autenticação necessária.");return json({...meta,user:identity},200,true);}
   if(path.startsWith("/api/admin/")){
    if(!await getAdmin())throw new AppError(403,"ADMIN_REQUIRED","Acesso administrativo negado.");
    requireDb(db);
    if(path==="/api/admin/state")return json({...meta,commands:await adminState(db),commandsEnabled:p.commandsEnabled},200,true);
    throw new AppError(404,"NOT_FOUND","Recurso não encontrado.");
   }
   requireDb(db);
   if(path==="/api/public/signals")return json({...meta,...await listSignals(db,parseFilters(url.searchParams),p,now)});
   if(/^\/api\/public\/signals\/[^/]+$/.test(path)){
    const signalId=decodeURIComponent(path.split("/").at(-1));
    if(!/^(BTC|ETH|SOL)_\d{13}$/.test(signalId))throw new AppError(404,"SIGNAL_NOT_FOUND","Sinal não encontrado.");
    return json({...meta,signal:await getSignal(db,signalId,p)});
   }
   if(path==="/api/public/stats"){const filters=parseFilters(url.searchParams,{ignoreResult:true});return json({...meta,...await statistics(db,filters,p),filters});}
   if(path==="/api/public/status")return json({...meta,assets:await statuses(db)});
   throw new AppError(404,"NOT_FOUND","Recurso não encontrado.");
  }
  if(request.method!=="POST")throw new AppError(405,"METHOD_NOT_ALLOWED","Método não permitido.");
  if(path==="/api/connector/sync"){
   if(url.protocol!=="https:"&&!config.localTesting)throw new AppError(400,"HTTPS_REQUIRED","HTTPS obrigatório.");
   const {body,digest}=await verifyRequest(request,config,now);
   requireDb(db);await takeRateLimit(db,now);
   const envelope=envelopeSchema.parse(parseJson(body));
   const result=await ingest(db,envelope,digest,p,now);
   return json({...meta,eventId:envelope.eventId,...result,commands:p.commandsEnabled?await pendingCommands(db,now):[]},200,true);
  }
  if(path==="/api/admin/commands"){
   const admin=await getAdmin();if(!admin)throw new AppError(403,"ADMIN_REQUIRED","Acesso administrativo negado.");
   if(!p.commandsEnabled)throw new AppError(503,"COMMANDS_NOT_CONNECTED","Controle do motor não conectado.");
   const expected=safeOrigin(config.origin);if(!expected||request.headers.get("origin")!==expected)throw new AppError(403,"ORIGIN_REJECTED","Origem não autorizada.");
   requireDb(db);
   const text=await request.text();if(text.length>512)throw new AppError(413,"BODY_TOO_LARGE","Pedido inválido.");
   const input=z.object({kind:z.enum(["PAUSE","RESUME"]),idempotencyKey:z.string().uuid()}).strict().parse(parseJson(text));
   return json({...meta,command:await requestCommand(db,input.kind,input.idempotencyKey,admin.id,now)},202,true);
  }
  throw new AppError(405,"METHOD_NOT_ALLOWED","A API pública é somente leitura.");
 }catch(error){
  if(error instanceof z.ZodError)return json({...meta,error:{code:"INVALID_DATA",message:"Dados inválidos; confira o contrato de integração."}},422,true);
  if(error instanceof AppError)return json({...meta,error:{code:error.code,message:error.message}},error.status,true);
  return json({...meta,error:{code:"SERVICE_UNAVAILABLE",message:"Não foi possível consultar ou gravar os dados. Tente novamente."}},503,true);
 }
}
