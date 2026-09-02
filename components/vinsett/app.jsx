"use client";
import {Suspense} from "react";
import {AppProvider,Shell} from "./shared";
import {Signals,HistoryView,StatsView,DetailView} from "./market";
import {StatusView,Preferences,HelpView,About,Legal,AdminView,LoginView,NotFoundView} from "./settings";
const labels={signals:"Visão do mercado",history:"Histórico",stats:"Estatísticas",detail:"Detalhes do sinal",status:"Saúde do motor",preferences:"Preferências",help:"Ajuda",about:"Sobre",privacy:"Privacidade",terms:"Termos",admin:"Administração",login:"Acesso administrativo",recover:"Recuperar acesso",reset:"Redefinir acesso",denied:"Acesso negado",notfound:"Página não encontrada"};
function Content({route,id,auth}){
 const views={signals:<Signals/>,history:<HistoryView/>,stats:<StatsView/>,detail:<DetailView id={id}/>,status:<StatusView/>,preferences:<Preferences/>,help:<HelpView/>,about:<About/>,privacy:<Legal kind="privacy"/>,terms:<Legal kind="terms"/>,admin:<AdminView auth={auth}/>,login:<LoginView auth={auth}/>,recover:<LoginView auth={auth} mode="recover"/>,reset:<LoginView auth={auth} mode="reset"/>,denied:<NotFoundView denied/>,notfound:<NotFoundView/>};
 return <Shell title={labels[route]||labels.notfound}>{views[route]||views.notfound}</Shell>
}
export function VinsettApp(props){return <Suspense fallback={<main className="page-fallback">Carregando VINSETT Sinais…</main>}><AppProvider><Content {...props}/></AppProvider></Suspense>}
