import { handleRequest } from "@/lib/api.mjs";
import { runtime,admin,identity } from "@/lib/runtime";
export const dynamic="force-dynamic";
async function handle(request:Request){return handleRequest(request,{...runtime(),getAdmin:admin,getIdentity:identity});}
export const GET=handle;export const POST=handle;export const PUT=handle;export const DELETE=handle;export const PATCH=handle;export const OPTIONS=handle;
