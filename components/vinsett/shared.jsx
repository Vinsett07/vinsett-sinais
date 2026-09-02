"use client";
import {createContext,useContext,useEffect,useState,useCallback,useRef} from "react";
import Link from "next/link";
import {useSearchParams,usePathname,useRouter} from "next/navigation";
import {Activity,BarChart3,History,Radio,Settings,HelpCircle,Info,ShieldCheck,RefreshCw,ArrowUpRight,ArrowDownRight,Clock3,Unplug,AlertTriangle,ChevronRight,ExternalLink} from "lucide-react";
import {SidebarProvider,Sidebar,SidebarHeader,SidebarContent,SidebarFooter,SidebarMenu,SidebarMenuItem,SidebarMenuButton,SidebarInset,SidebarTrigger,useSidebar} from "@/components/ui/sidebar";
import {Button} from "@/components/ui/button";
import {Skeleton} from "@/components/ui/skeleton";
import {Empty,EmptyHeader,EmptyTitle,EmptyDescription,EmptyMedia,EmptyContent} from "@/components/ui/empty";
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from "@/components/ui/select";
import {Toaster} from "@/components/ui/sonner";
import {ASSETS,statusView,signalWindow} from "@/lib/domain.mjs";
export const Context=createContext(null);
export const useApp=()=>useContext(Context);
export const PREF_KEY="vinsett.preferences.v1";
export const DEFAULT_PREFS={theme:"dark",asset:"ALL",autoRefresh:true};
export function useRemote(path,auto=false){
 const [data,setData]=useState(null),[error,setError]=useState(null),[loading,setLoading]=useState(true),[clock,setClock]=useState({offset:0,uncertainty:Infinity}),sequence=useRef(0),active=useRef(null);
 const reload=useCallback(async()=>{
  const seq=++sequence.current;active.current?.abort();const controller=new AbortController();active.current=controller;
  setLoading(true);setError(null);const start=Date.now();
  try{const response=await fetch(path,{cache:"no-store",signal:controller.signal});const payload=await response.json();const finish=Date.now();
   if(!response.ok)throw new Error(payload.error?.message||"Não foi possível carregar os dados.");
   if(sequence.current!==seq)return;
   const age=Math.max(0,Number(response.headers.get("Age")||0))*1000;setData(payload);setClock({offset:Date.parse(payload.serverNow)+age-(start+finish)/2,uncertainty:(finish-start)/2+(age?1000:0)});
  }catch(e){if(e.name!=="AbortError"&&sequence.current===seq){setError(e.message);setData(null);}}
  finally{if(sequence.current===seq)setLoading(false);}
 },[path]);
 useEffect(()=>{setData(null);reload();return()=>{sequence.current++;active.current?.abort();};},[reload]);
 useEffect(()=>{if(!auto)return;const id=setInterval(()=>{if(document.visibilityState==="visible")reload()},15000);return()=>clearInterval(id)},[auto,reload]);
 return {data,error,loading,reload,clock};
}
export function AppProvider({children}){
 const [prefs,setPrefsState]=useState(DEFAULT_PREFS),[prefsReady,setPrefsReady]=useState(false),[online,setOnline]=useState(true);
 const config=useRemote("/api/public/config",false),health=useRemote("/api/public/status",prefs.autoRefresh);
 const [tick,setTick]=useState(Date.now());
 useEffect(()=>{try{const p=JSON.parse(localStorage.getItem(PREF_KEY)||"{}");setPrefsState({theme:["light","dark"].includes(p.theme)?p.theme:"dark",asset:["ALL","BTC","ETH","SOL"].includes(p.asset)?p.asset:"ALL",autoRefresh:typeof p.autoRefresh==="boolean"?p.autoRefresh:true})}catch{}setPrefsReady(true);
 const on=()=>setOnline(navigator.onLine);on();window.addEventListener("online",on);window.addEventListener("offline",on);
 const interval=setInterval(()=>setTick(Date.now()),1000);return()=>{clearInterval(interval);window.removeEventListener("online",on);window.removeEventListener("offline",on);};},[]);
 useEffect(()=>{document.documentElement.dataset.theme=prefs.theme},[prefs.theme]);
 const setPrefs=(p)=>{setPrefsState(p);try{localStorage.setItem(PREF_KEY,JSON.stringify(p))}catch{}};
 const restore=()=>{try{localStorage.removeItem(PREF_KEY)}catch{}setPrefsState(DEFAULT_PREFS)};
 const clock=health.data?health.clock:config.clock;
 return <Context.Provider value={{prefs,setPrefs,restore,prefsReady,config:config.data,configError:config.error,health,online,now:tick+clock.offset,uncertainty:clock.uncertainty}}>{children}</Context.Provider>
}
const mainNav=[["/","Sinais",Activity],["/historico","Histórico",History],["/estatisticas","Estatísticas",BarChart3],["/status","Status do motor",Radio]];
const lowerNav=[["/preferencias","Preferências",Settings],["/ajuda","Ajuda",HelpCircle],["/sobre","Sobre o VINSETT",Info]];
function SideNav(){
 const path=usePathname(),{setOpenMobile}=useSidebar();
 const menu=(links)=><SidebarMenu>{links.map(([href,label,Icon])=><SidebarMenuItem key={href}><SidebarMenuButton asChild isActive={path===href} className="nav-item"><Link href={href} onClick={()=>setOpenMobile(false)}><Icon size={19}/><span>{label}</span></Link></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu>;
 return <Sidebar className="vinsett-sidebar"><SidebarHeader><Link href="/" className="brand" onClick={()=>setOpenMobile(false)}><span className="brand-mark">V</span><span><strong>VINSETT</strong><small>SINAIS</small></span></Link></SidebarHeader><SidebarContent><div className="nav-label">ACOMPANHAMENTO</div>{menu(mainNav)}<div className="sidebar-method"><div className="small-label">LEITURA MULTITEMPORAL</div><strong>M15 <span>→</span> M5 <span>→</span> M1</strong><p>Três perspectivas.<br/>Uma análise de referência.</p></div></SidebarContent><SidebarFooter>{menu(lowerNav)}<Link href="/admin/login" className="admin-nav"><ShieldCheck size={15}/>Acesso administrativo</Link><div className="sidebar-foot">VINSETT TRADER PRO · V5</div></SidebarFooter></Sidebar>
}
export function Shell({children,title}){
 const app=useApp();const records=app.health.data?.assets||[];
 const connected=records.some(r=>r.record),allOk=records.length===3&&records.every(r=>statusView(r.record,app.now).code==="MONITORING");
 return <SidebarProvider style={{"--sidebar-width":"240px"}}><SideNav/><SidebarInset className="app-inset"><header className="topbar"><div className="topbar-title"><SidebarTrigger aria-label="Abrir ou fechar menu"/><span>{title}</span></div><div className="topbar-right"><span className={"status-dot "+(allOk?"positive":"warning")}/><span>{allOk?"Em acompanhamento":connected?"Verificar status":"Não conectado"}</span><span className="timezone">MANAUS · UTC−4</span></div></header><main id="conteudo" className="workspace">{app.config?.testData&&<div className="notice warning"><AlertTriangle size={18}/><span><strong>Ambiente de teste.</strong> Dados fictícios, isolados do histórico real.</span></div>}{!app.online&&<div role="alert" className="notice warning"><AlertTriangle size={18}/>Sem conexão. Os dados e horários não podem ser confirmados.</div>}{children}</main><footer className="main-footer"><span><ShieldCheck size={15}/>Resultados de referência. Sem execução de ordens.</span><div><Link href="/privacidade">Privacidade</Link><Link href="/termos">Termos</Link></div></footer></SidebarInset><Toaster position="bottom-right"/></SidebarProvider>
}
export function Title({eyebrow,title,description,action}){return <div className="page-heading"><div>{eyebrow&&<p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description&&<p className="description">{description}</p>}</div>{action}</div>}
export function UpdateButton({remote,onExtra}){return <Button variant="outline" className="update-button" disabled={remote.loading} onClick={()=>{remote.reload();onExtra?.()}}><RefreshCw className={remote.loading?"spin":""} size={16}/>{remote.loading?"Atualizando…":"Atualizar"}</Button>}
export function Notice({children,tone="warning"}){return <div className={"notice "+tone}><AlertTriangle size={18}/><div>{children}</div></div>}
export function StateBox({remote,title="Nenhum sinal neste filtro",empty=false}){
 if(remote?.loading&&!remote.data)return <div className="loading-grid" aria-label="Carregando"><Skeleton className="h-32 w-full"/><Skeleton className="h-32 w-full"/></div>;
 if(remote?.error)return <Empty className="state-box"><EmptyHeader><EmptyMedia variant="icon"><Unplug/></EmptyMedia><EmptyTitle>Não foi possível carregar</EmptyTitle><EmptyDescription>{remote.error}</EmptyDescription></EmptyHeader><EmptyContent><Button variant="outline" onClick={remote.reload}>Tentar novamente</Button></EmptyContent></Empty>;
 if(empty)return <Empty className="state-box"><EmptyHeader><EmptyMedia variant="icon"><Radio/></EmptyMedia><EmptyTitle>{title}</EmptyTitle><EmptyDescription>O painel exibirá os registros confirmados quando estiverem disponíveis.</EmptyDescription></EmptyHeader><EmptyContent><Button variant="outline" asChild><Link href="/status">Ver status do motor<ChevronRight size={16}/></Link></Button></EmptyContent></Empty>;
 return null;
}
export function Choice({label,value,onChange,options,id}){return <div className="choice"><label id={id+"-label"}>{label}</label><Select value={value||"ALL"} onValueChange={onChange}><SelectTrigger id={id} aria-labelledby={id+"-label"}><SelectValue/></SelectTrigger><SelectContent>{options.map(([v,l])=><SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>}
export const assetOptions=[["ALL","Todos os ativos"],...ASSETS.map(a=>[a.code,a.name+" ("+a.code+")"])];
export const directionOptions=[["ALL","Todas as direções"],["BUY","Compra / BUY"],["SELL","Venda / SELL"]];
export const resultOptions=[["ALL","Todos os resultados"],...["WIN","LOSS","EMPATE","INCONCLUSIVO","PENDENTE"].map(r=>[r,r])];
export function dateTime(value,withDate=true){if(!value||!Number.isFinite(Date.parse(value)))return "Indisponível";return new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Manaus",...(withDate?{day:"2-digit",month:"2-digit",year:"numeric"}:{}),hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(new Date(value));}
export function number(value,digits=2){return typeof value==="number"&&Number.isFinite(value)?new Intl.NumberFormat("pt-BR",{maximumFractionDigits:digits}).format(value):"Indisponível";}
export function money(value){return typeof value==="number"&&Number.isFinite(value)?new Intl.NumberFormat("pt-BR",{style:"currency",currency:"USD",maximumFractionDigits:value<1?6:2}).format(value):"Indisponível";}
export function ResultPill({value}){return <span className={"pill "+(value==="WIN"?"positive":value==="LOSS"?"negative":"warning")}>{value||"PENDENTE"}</span>}
export function Direction({value}){const buy=value==="BUY";return <span className={"direction "+(buy?"positive":"negative")}>{buy?<ArrowUpRight size={17}/>:<ArrowDownRight size={17}/>} {buy?"COMPRA / BUY":"VENDA / SELL"}</span>}
export function Coin({asset}){return <span aria-hidden="true" className={"coin coin-"+asset}>{asset==="BTC"?"₿":asset==="ETH"?"Ξ":"S"}</span>}
export function AgeLine({serverNow}){return <p className="data-foot"><Clock3 size={14}/>Consulta: {dateTime(serverNow)} · Horário de Manaus</p>}
export function useFilters(){
 const search=useSearchParams(),router=useRouter(),path=usePathname(),query=search.toString();
 const params=new URLSearchParams(query);
 const apiParams=new URLSearchParams();for(const key of ["asset","direction","result","from","to","version","cursor"])if(params.get(key))apiParams.set(key,params.get(key));
 const build=(updates={},destination=path,{dropResult=false}={})=>{const p=new URLSearchParams(apiParams);for(const [key,value] of Object.entries(updates)){if(value&&value!=="ALL")p.set(key,value);else p.delete(key);}if(dropResult)p.delete("result");return destination+(p.size?"?"+p:"")};
 const change=(updates,destination=path)=>router.push(build({...updates,cursor:null},destination));
 return {params,query:apiParams.toString(),build,change,router,path,origin:path+(query?"?"+query:"")};
}
export function SignalCard({signal,origin}){
 const app=useApp(),windowState=signalWindow(signal,{now:app.now,uncertainty:app.online?app.uncertainty:Infinity,enabled:app.config?.windowEnabled===true});
 const href="/sinal/"+encodeURIComponent(signal.id)+"?returnTo="+encodeURIComponent(origin);
 return <article className="signal-card"><Link href={href} className="signal-card-link"><div className="signal-card-top"><div className="coin-name"><Coin asset={signal.asset}/><div><strong>{signal.pair}</strong><span>{ASSETS.find(a=>a.code===signal.asset)?.name}</span></div></div><ResultPill value={signal.result}/></div><div className="signal-card-direction"><Direction value={signal.direction}/><span className="source">{signal.source}</span></div><div className="score-line"><span>Score técnico</span><strong>{number(signal.score,0)}<small>/100</small></strong></div><div className="score-track"><span style={{width:typeof signal.score==="number"?signal.score+"%":"0%"}}/></div><div className="signal-times"><div><span>Análise</span><strong>{dateTime(signal.analyzedAt,false)}</strong></div><div><span>Entrada</span><strong>{dateTime(signal.entryAt,false)}</strong></div><div><span>Fim M1</span><strong>{dateTime(signal.endAt,false)}</strong></div></div><div className={"window-state "+windowState.kind}><Clock3 size={14}/>{windowState.label}{signal.demo&&<span> · TESTE</span>}</div><span className="details-link">Ver detalhes<ArrowUpRight size={17}/></span></Link></article>
}
export function External({href,children}){return href?<a href={href} target="_blank" rel="noopener noreferrer" className="text-link">{children}<ExternalLink size={14}/></a>:null;}
