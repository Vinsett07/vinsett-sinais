import test from "node:test";import assert from "node:assert/strict";
import {safeReturn,signalWindow,statusView,safeOrigin,safeTelegram} from "../lib/domain.mjs";
import {signal,NOW} from "./helpers.mjs";
test("voltar aceita somente origens internas de acompanhamento",()=>{
 assert.equal(safeReturn("/historico?asset=SOL&direction=SELL"),"/historico?asset=SOL&direction=SELL");
 for(const path of ["https://evil.test","//evil.test","/\\evil.test","/admin","/signin-with-chatgpt","javascript:alert(1)"])assert.equal(safeReturn(path),"/historico");
 assert.equal(safeOrigin("https://example.test/"),"https://example.test");assert.equal(safeOrigin("http://example.test"),null);assert.equal(safeOrigin("https://user:pass@example.test"),null);
 assert.equal(safeTelegram("https://t.me/example_public"),"https://t.me/example_public");assert.equal(safeTelegram("https://t.me/c/123/456"),null);
});
test("janela usa horário fixo, respeita 8 segundos e começa em acompanhamento",()=>{
 const s=signal(),entry=Date.parse(s.entryAt);
 assert.equal(signalWindow(s,{now:entry-9000,uncertainty:100,enabled:false}).label,"Em acompanhamento");
 assert.equal(signalWindow(s,{now:entry-9000,uncertainty:100,enabled:true}).label,"Janela disponível");
 assert.equal(signalWindow(s,{now:entry-8000,uncertainty:100,enabled:true}).label,"Antecedência insuficiente");
 assert.equal(signalWindow(s,{now:entry,uncertainty:0,enabled:true}).label,"Janela encerrada");
 assert.equal(signalWindow(s,{now:entry+3600000,uncertainty:0,enabled:true}).label,"Janela encerrada");
 assert.equal(signalWindow(s,{now:entry-9000,uncertainty:Infinity,enabled:true}).label,"Horário incerto");
});
test("status considera motor, manutenção, pausa, falha e atraso; página acessível não basta",()=>{
 assert.equal(statusView(null,NOW).code,"DISCONNECTED");
 const healthy={ready:true,healthy:true,maintenance:false,paused:false,lastCycleAt:new Date(NOW).toISOString(),analyzedAt:new Date(NOW).toISOString(),reason:"NO_SIGNAL"};
 assert.equal(statusView(healthy,NOW).code,"MONITORING");
 assert.equal(statusView({...healthy,healthy:false},NOW).code,"DEGRADED");
 assert.equal(statusView({...healthy,maintenance:true},NOW).code,"MAINTENANCE");
 assert.equal(statusView({...healthy,paused:true},NOW).code,"PAUSED");
 assert.equal(statusView({...healthy,lastCycleAt:new Date(NOW-181000).toISOString()},NOW).code,"STALE");
});
