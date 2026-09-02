interface Fetcher {fetch(input:Request|string,init?:RequestInit):Promise<Response>}
interface D1Result<T=unknown>{results:T[];success:boolean;meta:Record<string,number|string|boolean>}
interface D1PreparedStatement {bind(...values:unknown[]):D1PreparedStatement;first<T=unknown>(columnName?:string):Promise<T|null>;all<T=unknown>():Promise<D1Result<T>>;run<T=unknown>():Promise<D1Result<T>>;raw<T=unknown>(options?:{columnNames?:boolean}):Promise<T[]>}
interface D1Database {prepare(query:string):D1PreparedStatement;batch<T=unknown>(statements:D1PreparedStatement[]):Promise<D1Result<T>[]>;exec(query:string):Promise<{count:number;duration:number}>;dump():Promise<ArrayBuffer>}
declare module "cloudflare:workers" {export const env:Record<string,unknown>&{DB:D1Database;ASSETS:Fetcher};}
