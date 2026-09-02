import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
type Vars=Record<string,unknown>;
export function runtime(){const e=env as unknown as Vars;return {db:e.DB,config:{secret:String(e.VINSETT_INGEST_SECRET||""),origin:String(e.VINSETT_CANONICAL_ORIGIN||""),telegram:String(e.VINSETT_PUBLIC_TELEGRAM||""),support:String(e.VINSETT_SUPPORT_URL||""),authMode:e.VINSETT_AUTH_MODE==="sites"?"sites":"off",windowEnabled:e.VINSETT_WINDOW_ENABLED==="true",pwaEnabled:e.VINSETT_PWA_ENABLED==="true",commandsEnabled:e.VINSETT_COMMANDS_ENABLED==="true",testData:e.VINSETT_TEST_DATA==="true",localTesting:e.VINSETT_LOCAL_TESTING==="true"},adminIds:String(e.VINSETT_ADMIN_IDS||"").split(",").map(s=>s.trim()).filter(Boolean)};}
export async function identity(){if(runtime().config.authMode!=="sites")return null;const user=await getChatGPTUser(),h=await headers(),id=h.get("oai-authenticated-user-id");if(!user||!id)return null;return {id,displayName:user.displayName,email:user.email};}
export async function admin(){const user=await identity();return user&&runtime().adminIds.includes(user.id)?user:null;}
