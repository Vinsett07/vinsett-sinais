import {NextResponse} from "next/server";
export function proxy(){const response=NextResponse.next();response.headers.set("Cache-Control","private, no-store");response.headers.set("X-Content-Type-Options","nosniff");return response;}
export const config={matcher:["/admin/:path*","/api/admin/:path*","/api/auth/:path*"]};
