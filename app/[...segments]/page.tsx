import {notFound,redirect} from "next/navigation";
import {VinsettApp} from "@/components/vinsett/app";
import {runtime,admin,identity} from "@/lib/runtime";
import {chatGPTSignInPath,chatGPTSignOutPath} from "@/app/chatgpt-auth";
export const dynamic="force-dynamic";
const routes:Record<string,string>={historico:"history",estatisticas:"stats",status:"status",preferencias:"preferences",ajuda:"help",sobre:"about",privacidade:"privacy",termos:"terms","admin/login":"login","admin/recuperar":"recover","admin/redefinir":"reset","acesso-negado":"denied"};
export default async function Page({params}:{params:Promise<{segments:string[]}>}){
 const {segments}=await params,key=segments.join("/");
 if(segments[0]==="sinal"&&segments.length===2)return <VinsettApp route="detail" id={segments[1]}/>;
 if(key==="admin"){
  if(runtime().config.authMode!=="sites")redirect("/admin/login");
  const user=await identity();if(!user)redirect("/admin/login");
  const allowed=await admin();if(!allowed)redirect("/acesso-negado");
  return <VinsettApp route="admin" auth={{...allowed,signOut:chatGPTSignOutPath("/")}}/>;
 }
 const route=routes[key];if(!route)notFound();
 const auth=key.startsWith("admin/")?{enabled:runtime().config.authMode==="sites",signIn:chatGPTSignInPath("/admin"),identity:await identity()}:undefined;
 return <VinsettApp route={route} auth={auth}/>;
}
