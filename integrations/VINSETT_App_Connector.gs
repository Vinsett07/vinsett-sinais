/**
 * VINSETT Sinais — conector aditivo para o motor V5.0.0.
 * Adicione como um NOVO arquivo .gs. Não substitui Codigo.gs.
 * Não calcula sinais, não consulta exchanges e não envia mensagens ao Telegram.
 * Configuração somente em Propriedades do script: VSA_APP_URL, VSA_APP_SECRET,
 * VSA_APP_ENABLED, VSA_APP_ALLOW_CONTROL, VSA_APP_IMPORT_HISTORY.
 * Todos os valores de ativação começam desativados. Leia docs/CONEXAO.md.
 */
function vsaProps_(){return PropertiesService.getScriptProperties();}
function vsaJson_(s,fallback){try{return JSON.parse(s||'');}catch(e){return fallback;}}
function vsaNumber_(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;}
function vsaIso_(v){const n=v instanceof Date?v.getTime():vsaNumber_(v);return n&&Number.isFinite(n)?new Date(n).toISOString():null;}
function vsaIndicator_(v){
 if(!v||typeof v!=='object')return null;
 const r={};['close','volume','emaFast','emaSlow','rsi','atrPct','volumeMean'].forEach(function(k){r[k]=vsaNumber_(v[k]);});return r;
}
function vsaReason_(r){
 if(r.late)return 'LATE_PUBLICATION';
 if(r.state==='CANCELADO_ANTES_ENVIO')return 'INSUFFICIENT_LEAD';
 if(r.state==='ENTREGA_INCERTA_SINAL'||r.state==='ENTREGA_INCERTA_RESULTADO'||r.state==='ENVIANDO_SINAL'||r.state==='ENVIANDO_RESULTADO')return 'DELIVERY_UNCERTAIN';
 if(r.result&&r.result.outcome==='INCONCLUSIVO')return 'INVALID_DATA';
 if(!r.result)return 'WAITING_CANDLE';
 return 'NONE';
}
function vsaProjectRecord_(r,imported){
 const props=vsaProps_(),publicBase=props.getProperty('VSA_APP_PUBLIC_TELEGRAM')||'',publicChat=props.getProperty('VSA_APP_PUBLIC_CHAT_ID')||'';
 const asset=r.v===1?'BTC':r.asset,analysis=r.analysis||{},ind=analysis.indicators||{},result=r.result||{};
 const confirmed=Number.isSafeInteger(r.signalMessageId)&&r.signalMessageId>0&&!!vsaIso_(r.sentAt);
 let candle=null;
 if(['open','high','low','close','volume'].every(function(k){return vsaNumber_(result[k])!==null;})){
  candle={openTime:vsaIso_(r.start),endTime:vsaIso_(r.end),open:Number(result.open),high:Number(result.high),low:Number(result.low),close:Number(result.close),volume:Number(result.volume)};
 }
 return {
  id:asset+'_'+r.start,revision:r.revision||1,recordVersion:r.v,strategyVersion:r.version||'4.0.1 + WL1',
  asset:asset,pair:r.pair,direction:r.direction,source:r.source,symbol:r.symbol,
  score:vsaNumber_(r.score),buyScore:vsaNumber_(analysis.buyScore),sellScore:vsaNumber_(analysis.sellScore),
  analyzedAt:vsaIso_(analysis.at),createdAt:vsaIso_(r.createdAt),publishedAt:vsaIso_(r.sentAt),entryAt:vsaIso_(r.start),endAt:vsaIso_(r.end),
  assessedAt:vsaIso_(result.assessedAt),resultPublishedAt:vsaIso_(r.finishedAt),referencePrice:vsaNumber_(analysis.price),
  state:r.state,result:result.outcome||'PENDENTE',
  publication:confirmed?'CONFIRMED':r.state==='CANCELADO_ANTES_ENVIO'?'CANCELLED':r.state==='ENTREGA_INCERTA_SINAL'?'UNCERTAIN':'NOT_CONFIRMED',
  resultDelivery:r.resultMessageId?'CONFIRMED':r.state==='ENTREGA_INCERTA_RESULTADO'?'UNCERTAIN':'PENDING',
  reason:vsaReason_(r),candle:candle,indicators:{m1:vsaIndicator_(ind.m1),m5:vsaIndicator_(ind.m5),m15:vsaIndicator_(ind.m15)},
  volumeFactor:vsaNumber_(analysis.volumeFactor),telegramMessageId:confirmed?r.signalMessageId:null,telegramUrl:confirmed&&publicChat&&String(r.chatId)===publicChat&&/^https:\/\/t\.me\/[A-Za-z][A-Za-z0-9_]{4,31}$/.test(publicBase)?publicBase+'/'+r.signalMessageId:null,demo:false,imported:!!imported
 };
}
function vsaSettings_(){
 const p=vsaProps_(),url=p.getProperty('VSA_APP_URL')||'',secret=p.getProperty('VSA_APP_SECRET')||'';
 if(typeof VINSETT_CONFIG==='undefined'||VINSETT_CONFIG.VERSION!=='5.0.0')throw new Error('O conector exige o arquivo original VINSETT V5.0.0.');
 if(!/^https:\/\/[a-z0-9.-]+(?::443)?\/api\/connector\/sync$/i.test(url)||secret.length<32)throw new Error('Configure o endereço HTTPS e uma chave própria de pelo menos 32 caracteres nas Propriedades do script.');
 return {url:url,secret:secret,enabled:p.getProperty('VSA_APP_ENABLED')==='true',control:p.getProperty('VSA_APP_ALLOW_CONTROL')==='true',history:p.getProperty('VSA_APP_IMPORT_HISTORY')==='true'};
}
function vsaQueueRecords_(all){
 const rows=[],seen={};
 Object.keys(all).forEach(function(key){
  if(!/^VINSETT_WL[12]_/.test(key))return;
  if(/^VINSETT_WL1_/.test(key)&&!/^VINSETT_WL1_\d+$/.test(key))return;
  const r=vsaJson_(all[key],null);if(!r)throw new Error('Fila original ilegível; nenhum registro foi alterado.');
  validarRegistro_(r);
  const record=vsaProjectRecord_(r,false);
  if(seen[record.id])throw new Error('ID duplicado na fila original; revisão necessária.');
  seen[record.id]=true;rows.push(record);
 });
 return rows.sort(function(a,b){return Date.parse(b.entryAt)-Date.parse(a.entryAt)||a.id.localeCompare(b.id);});
}
function vsaStatuses_(all,now){
 const reasons={SEM_SINAL:'NO_SIGNAL',SINAL_ENVIADO:'NONE',COOLDOWN:'COOLDOWN',SEM_ANTECEDENCIA:'INSUFFICIENT_LEAD',FILA_CHEIA:'QUEUE_FULL',JA_REGISTRADO:'DUPLICATE',LIMITE_DO_CICLO:'CYCLE_LIMIT',ENTREGA_INCERTA:'DELIVERY_UNCERTAIN',ENTREGA_INCERTA_PENDENTE:'DELIVERY_UNCERTAIN'};
 return VINSETT_ATIVOS.map(function(a){
  const d=vsaJson_(all['VINSETT_V5_DIAG_'+a.code],{}),ages=d.ages||{};
  let reason=d.error?'SOURCE_FAILURE':(reasons[d.decision]||'UNKNOWN');
  if(all.VINSETT_V5_LAST_HEALTH==='COM_ERROS')reason='ENGINE_FAILURE';
  if(all.VINSETT_V5_MAINTENANCE!=='false')reason='MAINTENANCE';
  else if(all.VINSETT_PAUSED!=='false')reason='PAUSED';
  return {asset:a.code,revision:now,healthy:all.VINSETT_V5_LAST_HEALTH==='OK',lastFinishAt:vsaIso_(all.VINSETT_V5_LAST_FINISH),lastCycleAt:vsaIso_(all.VINSETT_LAST_CYCLE),analyzedAt:d.price&&d.source?vsaIso_(d.at):null,source:['COINBASE','KRAKEN'].indexOf(d.source)>=0?d.source:null,
   paused:all.VINSETT_PAUSED!=='false',maintenance:all.VINSETT_V5_MAINTENANCE!=='false',ready:all.VINSETT_V5_READY===VINSETT_CONFIG.VERSION,
   reason:reason,price:vsaNumber_(d.price),ages:{m1:vsaNumber_(ages.m1),m5:vsaNumber_(ages.m5),m15:vsaNumber_(ages.m15)}};
 });
}
function vsaRowRecord_(row,headers){
 const cell=function(key){const i=headers.indexOf(key);if(i<0)throw new Error('Cabeçalho histórico incompatível.');return row[i];};
 const start=vsaNumber_(cell('Inicio_UNIX_ms')),version=String(cell('Versao')||'4.0.1 + WL1');
 const ind=vsaJson_(cell('Indicadores_JSON'),{});
 const r={v:version==='5.0.0'?2:1,asset:String(cell('Ativo')),start:start,end:start+60000,version:version,
 pair:String(cell('Par')),source:String(cell('Fonte')),symbol:String(cell('Simbolo')),direction:String(cell('Direcao')),score:vsaNumber_(cell('Score_100')),
 createdAt:cell('Criado_Manaus'),sentAt:cell('Publicado_Manaus'),finishedAt:cell('Resultado_enviado_Manaus'),state:String(cell('Estado_entrega')),
 chatId:String(cell('Chat_destino')||''),signalMessageId:vsaNumber_(cell('ID_mensagem_sinal')),resultMessageId:vsaNumber_(cell('ID_mensagem_resultado')),revision:vsaNumber_(cell('Revisao'))||1,
 analysis:{at:null,buyScore:vsaNumber_(cell('Score_BUY')),sellScore:vsaNumber_(cell('Score_SELL')),price:vsaNumber_(cell('Preco_analise')),volumeFactor:vsaNumber_(cell('Fator_volume_M1')),indicators:ind}};
 const outcome=String(cell('Resultado_referencia')||'');if(outcome)r.result={outcome:outcome,open:vsaNumber_(cell('Abertura')),high:vsaNumber_(cell('Maxima')),low:vsaNumber_(cell('Minima')),close:vsaNumber_(cell('Fechamento')),volume:vsaNumber_(cell('Volume_vela')),assessedAt:cell('Apurado_Manaus')};
 r.late=!!vsaIso_(r.sentAt)&&Date.parse(vsaIso_(r.sentAt))>=start;
 const projected=vsaProjectRecord_(r,true);
 if(String(cell('ID'))!==projected.id)throw new Error('Identidade do histórico divergente; importação interrompida.');
 return projected;
}
function vsaHistoryChunk_(all,cursor){
 const keys=Object.keys(all).filter(function(k){return /^VINSETT_V5_HISTORY_\d{6}$/.test(k);}).sort();
 if(!keys.length)return {records:[],next:{key:'',row:2}};
 let key=cursor.key&&keys.indexOf(cursor.key)>=0?cursor.key:keys[0],row=Math.max(2,Number(cursor.row)||2);
 const entry=vsaJson_(all[key],{});
 if(entry.status!=='PRONTO'||!entry.id)throw new Error('Histórico ainda não está pronto; referência original preservada.');
 const book=SpreadsheetApp.openById(entry.id),sheet=book.getSheetByName('Sinais'),info=book.getSheetByName('LeiaMe');
 if(!sheet||!info||info.getRange(1,1).getValue()!=='VINSETT_V5_HISTORY')throw new Error('Histórico não identificado.');
 const headers=sheet.getRange(1,1,1,40).getValues()[0];if(JSON.stringify(headers)!==JSON.stringify(cabecalhoSinais_()))throw new Error('Cabeçalhos originais divergentes.');
 const last=sheet.getLastRow();
 if(row>last){const nextKey=keys[(keys.indexOf(key)+1)%keys.length];return {records:[],next:{key:nextKey,row:2}};}
 const count=Math.min(2,last-row+1),rows=sheet.getRange(row,1,count,40).getValues();
 return {records:rows.map(function(r){return vsaRowRecord_(r,headers);}),next:{key:key,row:row+count}};
}
function vsaBuildOutbox_(all,settings,includeStatus){
 const now=Date.now(),records=vsaQueueRecords_(all),sent=vsaJson_(all.VSA_APP_SENT,{}),acks=vsaJson_(all.VSA_APP_ACKS,[]);
 let candidates=records.filter(function(r){return Number(sent[r.id]||0)<r.revision;}).slice(0,3),historyNext=null;
 if(!candidates.length&&settings.history){
  const history=vsaHistoryChunk_(all,vsaJson_(all.VSA_APP_HISTORY_CURSOR,{}));candidates=history.records;historyNext=history.next;
 }
 const base={eventId:Utilities.getUuid(),signals:candidates,statuses:includeStatus?vsaStatuses_(all,now):[],acks:acks.slice(0,10)};
 while(Utilities.newBlob(JSON.stringify(base)).getBytes().length>6800&&base.signals.length>1){base.signals.pop();if(historyNext)historyNext.row--;}
 if(!base.signals.length&&!base.statuses.length&&!base.acks.length){if(historyNext)vsaProps_().setProperty('VSA_APP_HISTORY_CURSOR',JSON.stringify(historyNext));return null;}
 const box={body:JSON.stringify(base),sent:base.signals.filter(function(s){return !s.imported;}).map(function(s){return {id:s.id,revision:s.revision};}),historyNext:historyNext,ackIds:base.acks.map(function(a){return a.id;})};
 if(Utilities.newBlob(JSON.stringify(box)).getBytes().length>8000)throw new Error('Evento excede o limite seguro; dados originais preservados.');
 return box;
}
function vsaSend_(box,settings){
 const timestamp=String(Date.now());
 const bytes=Utilities.computeHmacSha256Signature(timestamp+'.'+box.body,settings.secret,Utilities.Charset.UTF_8);
 const signature=bytes.map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');
 let response;
 try{response=UrlFetchApp.fetch(settings.url,{method:'post',contentType:'application/json',payload:box.body,muteHttpExceptions:true,followRedirects:false,headers:{'X-Vinsett-Timestamp':timestamp,'X-Vinsett-Signature':signature}});}
 catch(e){throw new Error('Sincronização sem confirmação. O evento permanece salvo para nova tentativa.');}
 if(response.getResponseCode()!==200)throw new Error('Sincronização pendente: HTTP '+response.getResponseCode()+'. O evento e a fila original foram preservados.');
 const result=vsaJson_(response.getContentText(),null),event=vsaJson_(box.body,{});
 if(!result||result.eventId!==event.eventId||typeof result.duplicate!=='boolean'||!Array.isArray(result.commands))throw new Error('Resposta não confirmou a identidade do evento. Sem descarte ou repetição de comandos.');
 return result;
}
function vsaAcknowledge_(box){
 const p=vsaProps_(),all=p.getProperties(),sent=vsaJson_(all.VSA_APP_SENT,{}),current=vsaQueueRecords_(all),kept={};
 box.sent.forEach(function(s){sent[s.id]=Math.max(Number(sent[s.id]||0),s.revision);});
 current.forEach(function(s){if(sent[s.id])kept[s.id]=sent[s.id];});
 p.setProperty('VSA_APP_SENT',JSON.stringify(kept));
 if(box.historyNext)p.setProperty('VSA_APP_HISTORY_CURSOR',JSON.stringify(box.historyNext));
 p.setProperty('VSA_APP_ACKS',JSON.stringify(vsaJson_(all.VSA_APP_ACKS,[]).filter(function(a){return box.ackIds.indexOf(a.id)<0;})));
 p.deleteProperty('VSA_APP_OUTBOX');
}
function vsaStoreAck_(ack){
 const p=vsaProps_(),list=vsaJson_(p.getProperty('VSA_APP_ACKS'),[]).filter(function(a){return a.id!==ack.id;});
 list.push(ack);if(list.length>20)throw new Error('Confirmações aguardando sincronização; novos comandos interrompidos.');
 p.setProperty('VSA_APP_ACKS',JSON.stringify(list));
}
function vsaResumeSafely_(){
 // A prontidao e revalidada sob o MESMO lock usado pelo motor.
 return comLock_(function(){
  const p=propriedades_();
  if(p.getProperty(VINSETT_KEYS.MAINTENANCE)!=='false')return {status:'REJECTED',reason:'MAINTENANCE'};
  if(p.getProperty(VINSETT_KEYS.READY)!==VINSETT_CONFIG.VERSION || p.getProperty('VINSETT_V5_LAST_HEALTH')!=='OK' || Date.now()-Number(p.getProperty('VINSETT_V5_LAST_FINISH')||0)>180000)return {status:'REJECTED',reason:'NOT_READY'};
  verificarPronto_();
  obterHistorico_(Date.now(),novoContexto_(),false);
  const own=ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()==='cicloVinsett';});
  if(own.length!==1)return {status:'REJECTED',reason:'NOT_READY'};
  // Nao remove manutencao, cria planilhas ou modifica acionadores.
  p.setProperty(VINSETT_KEYS.PAUSED,'false');
  return {status:'CONFIRMED',reason:'APPLIED'};
 });
}
function vsaCommand_(command,settings){
 if(!settings.control)return;
 if(!command||!/^[0-9a-f-]{36}$/i.test(command.id)||['PAUSE','RESUME'].indexOf(command.kind)<0||!Number.isSafeInteger(command.requestedAt))return;
 const p=vsaProps_(),key='VSA_APP_CMD_'+command.id,previous=vsaJson_(p.getProperty(key),null);
 if(previous){vsaStoreAck_(previous.ack||{id:command.id,status:'UNCERTAIN',reason:'EXECUTION_UNCERTAIN'});return;}
 let rejected=null;
 if(Date.now()-command.requestedAt>600000||command.requestedAt>Date.now()+5000)rejected='EXPIRED';
 const all=p.getProperties();
 if(command.kind==='RESUME'){
  if(all.VINSETT_V5_MAINTENANCE!=='false')rejected='MAINTENANCE';
  else if(all.VINSETT_V5_READY!=='5.0.0'||all.VINSETT_V5_TEST_OK!=='5.0.0|BTC,ETH,SOL'||all.VINSETT_V5_LAST_HEALTH!=='OK'||Date.now()-Number(all.VINSETT_V5_LAST_FINISH||0)>180000)rejected='NOT_READY';
 }
 let ack;
 if(rejected)ack={id:command.id,status:'REJECTED',reason:rejected};
 else{
  p.setProperty(key,JSON.stringify({startedAt:Date.now(),kind:command.kind}));
  try{
   if(command.kind==='RESUME'){
    const resumed=vsaResumeSafely_();ack={id:command.id,status:resumed.status,reason:resumed.reason};
   }else{
    pausarSistema();
    ack=p.getProperty('VINSETT_PAUSED')==='true'?{id:command.id,status:'CONFIRMED',reason:'APPLIED'}:{id:command.id,status:'UNCERTAIN',reason:'EXECUTION_UNCERTAIN'};
   }
  }catch(e){ack={id:command.id,status:'UNCERTAIN',reason:'EXECUTION_UNCERTAIN'};}
 }
 p.setProperty(key,JSON.stringify({startedAt:Date.now(),kind:command.kind,ack:ack}));vsaStoreAck_(ack);
}
function vinsettAppSincronizar(){
 const settings=vsaSettings_();if(!settings.enabled){console.log('Conector desativado.');return;}
 const lock=LockService.getUserLock();if(!lock.tryLock(1000))return;
 const started=Date.now();let delivered=0;
 try{
  for(let attempt=0;attempt<4&&Date.now()-started<20000;attempt++){
   const p=vsaProps_(),all=p.getProperties();let box=vsaJson_(all.VSA_APP_OUTBOX,null);
   if(!box){box=vsaBuildOutbox_(all,settings,attempt===0);if(!box)break;p.setProperty('VSA_APP_OUTBOX',JSON.stringify(box));}
   const result=vsaSend_(box,settings);vsaAcknowledge_(box);delivered++;
   result.commands.forEach(function(c){vsaCommand_(c,settings);});
  }
  vsaProps_().setProperty('VSA_APP_LAST_SYNC',String(Date.now()));
  console.log('Eventos confirmados pelo app: '+delivered+'. Nenhuma mensagem emitida pelo conector.');
 }finally{lock.releaseLock();}
}
function vinsettAppInstalar(){
 const settings=vsaSettings_();if(!settings.enabled)throw new Error('Ative VSA_APP_ENABLED somente após autorizar e configurar a conexão.');
 const own=ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()==='vinsettAppSincronizar';});
 if(own.length>1)throw new Error('Há acionadores repetidos do conector. Revise-os antes de continuar.');
 if(!own.length)ScriptApp.newTrigger('vinsettAppSincronizar').timeBased().everyMinutes(1).create();
 console.log('Acionador do conector configurado. Motor V5, filas e acionadores existentes preservados.');
}
function vinsettAppDesativar(){
 const p=vsaProps_();p.setProperty('VSA_APP_ENABLED','false');
 ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()==='vinsettAppSincronizar';}).forEach(function(t){ScriptApp.deleteTrigger(t);});
 console.log('Somente o conector foi desativado. Eventos pendentes, motor e histórico preservados.');
}
function vinsettAppReconciliarComando(id){
 if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('ID de comando inválido.');
 const p=vsaProps_(),key='VSA_APP_CMD_'+id,entry=vsaJson_(p.getProperty(key),null);
 if(!entry)throw new Error('Comando não localizado.');
 const expected=entry.kind==='PAUSE'?'true':'false';
 if(p.getProperty('VINSETT_PAUSED')!==expected)throw new Error('Estado atual não confirma o pedido. Não há reexecução automática.');
 if(entry.kind==='RESUME'&&p.getProperty('VINSETT_V5_MAINTENANCE')!=='false')throw new Error('Motor em manutenção.');
 entry.ack={id:id,status:'CONFIRMED',reason:'APPLIED'};p.setProperty(key,JSON.stringify(entry));vsaStoreAck_(entry.ack);
 console.log('Estado observado e confirmação enfileirada. Nenhuma ação de pausa ou retomada foi executada.');
}
