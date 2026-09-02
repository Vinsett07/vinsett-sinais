import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {title:"VINSETT Sinais",description:"Sinais de referência de Bitcoin, Ethereum e Solana, com histórico e apuração transparente.",icons:{icon:"/favicon.svg"},manifest:"/manifest.webmanifest"};
export const viewport: Viewport = {width:"device-width",initialScale:1,themeColor:"#080e1a"};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="pt-BR" suppressHydrationWarning><body>{children}</body></html>}