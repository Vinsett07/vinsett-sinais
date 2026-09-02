import {sql} from "drizzle-orm";
import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
export const assets=sqliteTable("assets",{code:text("code").primaryKey(),pair:text("pair").notNull(),coinbase:text("coinbase").notNull(),kraken:text("kraken").notNull()});
export const signals=sqliteTable("signals",{
 id:text("id").primaryKey(),asset:text("asset").notNull().references(()=>assets.code),revision:integer("revision").notNull(),recordVersion:integer("record_version").notNull(),
 strategyVersion:text("strategy_version").notNull(),direction:text("direction").notNull(),source:text("source").notNull(),symbol:text("symbol").notNull(),
 entryAt:integer("entry_at").notNull(),endAt:integer("end_at").notNull(),createdAt:integer("created_at").notNull(),syncedAt:integer("synced_at").notNull(),
 analyzedAt:integer("analyzed_at"),publishedAt:integer("published_at"),assessedAt:integer("assessed_at"),result:text("result").notNull(),
 state:text("state").notNull(),publication:text("publication").notNull(),validResult:integer("valid_result").notNull(),demo:integer("demo").notNull(),
 score:real("score"),data:text("data").notNull()
},t=>[uniqueIndex("idx_signals_asset_entry").on(t.asset,t.entryAt),index("idx_signals_entry_id").on(t.entryAt,t.id),index("idx_signals_asset_entry_id").on(t.asset,t.entryAt,t.id)]);
export const publicStatus=sqliteTable("public_status",{asset:text("asset").primaryKey().references(()=>assets.code),revision:integer("revision").notNull(),syncedAt:integer("synced_at").notNull(),data:text("data").notNull()});
export const receipts=sqliteTable("event_receipts",{id:text("id").primaryKey(),digest:text("digest").notNull(),receivedAt:integer("received_at").notNull()});
export const rateLimits=sqliteTable("rate_limits",{bucket:integer("bucket").primaryKey(),count:integer("count").notNull()});
export const commands=sqliteTable("commands",{id:text("id").primaryKey(),kind:text("kind").notNull(),status:text("status").notNull(),requestedAt:integer("requested_at").notNull(),requester:text("requester").notNull(),idempotencyKey:text("idempotency_key").notNull(),acknowledgedAt:integer("acknowledged_at"),reason:text("reason")},t=>[uniqueIndex("idx_commands_requester_key").on(t.requester,t.idempotencyKey),index("idx_commands_status_time").on(t.status,t.requestedAt),uniqueIndex("idx_commands_one_pending").on(sql`1`).where(sql`${t.status} IN ('REQUESTED','UNCERTAIN')`)]);
