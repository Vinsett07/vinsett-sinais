/**
 * VINSETT Trader V1.0 Alpha — Core 0.5
 *
 * Analysis/simulation only. No automatic orders.
 * Source: Mercado Bitcoin API v4 public market data.
 * Assets: BTC-BRL, ETH-BRL, SOL-BRL.
 * Strategy: native M15 context -> M5 confirmation -> M1 trigger.
 * Indicators: EMA 9/21/50, ADX/DMI 14, rolling VWAP 50.
 *
 * Core 0.5 adds:
 * - 5-minute market scan.
 * - 1-minute entry watcher only for ARMED assets.
 * - One-candle M1 simulated settlement (WIN/LOSS/DRAW).
 * - Persistent trade database in Google Sheets.
 * - Weekly and monthly performance reports.
 * - Notification outbox ready for Telegram integration.
 */

const VINSETT = Object.freeze({
  APP: 'VINSETT Trader',
  VERSION: '1.0-ALPHA',
  CORE: '0.5',
  MODE: 'SIMULATION_NO_ORDERS',
  TIME_ZONE: 'America/Manaus',
  API_BASE: 'https://api.mercadobitcoin.net/api/v4',
  SYMBOLS: Object.freeze(['BTC-BRL', 'ETH-BRL', 'SOL-BRL']),
  M1_SCAN_BARS: 320,
  M1_WATCH_BARS: 80,
  M15_SCAN_BARS: 80,
  PAGE_SIZE: 200,
  MAX_PAGES: 4,
  REQUEST_GAP_MS: 1150,
  MAX_HTTP_RETRIES: 2,
  HTTP_RETRY_BASE_MS: 1500,
  MAX_M1_STALENESS_SEC: 300,
  MAX_CONTEXT_AGE_MS: 8 * 60 * 1000,
  EMA_FAST: 9,
  EMA_MID: 21,
  EMA_SLOW: 50,
  DMI_PERIOD: 14,
  VWAP_PERIOD: 50,
  ADX_M15_MIN: 23,
  ADX_M5_MIN: 20,
  ADX_M1_MIN: 18,
  PULLBACK_TOLERANCE_PCT: 0.25,
  MIN_SIGNAL_SCORE: 80,
  PROP_PREFIX: 'VINSETT_V1_',
  SHEET_PROP: 'VINSETT_V1_SHEET_ID',
  HANDLERS: Object.freeze([
    'runMarketScanVinsettV1',
    'runEntryWatcherVinsettV1',
    'generatePreviousWeekReportVinsettV1',
    'generatePreviousMonthReportVinsettV1'
  ])
});

let vinsettLastRequestAt_ = 0;

function setupVinsettTraderV1() {
  const props = PropertiesService.getScriptProperties();
  let spreadsheetId = props.getProperty(VINSETT.SHEET_PROP);
  let spreadsheet = null;
  if (spreadsheetId) {
    try { spreadsheet = SpreadsheetApp.openById(spreadsheetId); }
    catch (error) { spreadsheetId = null; }
  }
  if (!spreadsheetId) {
    spreadsheet = SpreadsheetApp.create('VINSETT Trader V1.0 Alpha');
    spreadsheetId = spreadsheet.getId();
    props.setProperty(VINSETT.SHEET_PROP, spreadsheetId);
  }

  ensureSheet_(spreadsheet, 'Analyses', [
    'Timestamp_Manaus','Symbol','State','Direction','Technical_Score','Price',
    'M15_Direction','M15_ADX','M15_+DI','M15_-DI','M15_EMA9','M15_EMA21','M15_EMA50','M15_VWAP',
    'M5_Direction','M5_ADX','M5_+DI','M5_-DI','M5_EMA9','M5_EMA21','M5_EMA50','M5_VWAP',
    'M1_Direction','M1_ADX','M1_+DI','M1_-DI','M1_EMA9','M1_EMA21','M1_EMA50','M1_VWAP',
    'M1_Candle_Start_UTC','Reason'
  ]);
  ensureSheet_(spreadsheet, 'SignalEvents', [
    'Timestamp_Manaus','Trade_ID','Symbol','Direction','Technical_Score','Signal_Price',
    'Entry_Candle_UTC','M15_ADX','M5_ADX','M1_ADX','Reason'
  ]);
  ensureSheet_(spreadsheet, 'Trades', [
    'Trade_ID','Created_At_Manaus','Symbol','Direction','Technical_Score',
    'Signal_Candle_UTC','Entry_Candle_UTC','Signal_Price','Entry_Price','Exit_Price',
    'Outcome','Settled_At_Manaus','M15_ADX','M5_ADX','M1_ADX',
    'M15_Direction','M5_Direction','Reason'
  ]);
  ensureSheet_(spreadsheet, 'Notifications', [
    'Timestamp_Manaus','Type','Symbol','Trade_ID','Message'
  ]);
  ensureSheet_(spreadsheet, 'Reports', [
    'Generated_At_Manaus','Period_Type','Period_Start','Period_End',
    'Total_Settled','Wins','Losses','Draws','Win_Rate_Pct','Loss_Rate_Pct','Breakdown_JSON'
  ]);
  ensureSheet_(spreadsheet, 'Diagnostics', ['Timestamp_Manaus','Type','Symbol','Detail']);

  const readme = ensureSheet_(spreadsheet, 'README', ['Field','Value']);
  readme.clearContents();
  readme.getRange(1,1,19,2).setValues([
    ['Field','Value'],['Aplicativo',VINSETT.APP],['Versão',VINSETT.VERSION],['Core',VINSETT.CORE],
    ['Modo','SIMULAÇÃO — nenhuma ordem é enviada'],['Fonte','Mercado Bitcoin API v4'],
    ['Ativos',VINSETT.SYMBOLS.join(', ')],['Timeframes','M15 nativo -> M5 construído do M1 -> gatilho M1'],
    ['Indicadores','EMA 9/21/50 + ADX/DMI 14 + VWAP rolling 50'],
    ['Market Scan','A cada 5 minutos: atualiza M15/M5 e estado do ativo'],
    ['Entry Watcher','A cada 1 minuto: observa somente ativos ARMED e operações PENDING'],
    ['Entrada simulada','Próxima vela M1 após o gatilho'],
    ['Apuração','BUY: close > open = WIN; SELL: close < open = WIN'],
    ['Empate','Open == close = DRAW e fica fora do denominador WIN/LOSS'],
    ['Banco de dados','Aba Trades'],['Relatório semanal','WIN%, LOSS%, DRAW e divisão por ativo'],
    ['Relatório mensal','WIN%, LOSS%, DRAW e divisão por ativo'],
    ['Notificações','Aba Notifications + console; preparada para Telegram'],
    ['Aviso','Technical Score não é probabilidade de lucro nem garantia de acerto']
  ]);
  readme.setFrozenRows(1);

  const result = {ok:true,app:VINSETT.APP,version:VINSETT.VERSION,core:VINSETT.CORE,spreadsheetId:spreadsheetId,spreadsheetUrl:spreadsheet.getUrl()};
  console.log(JSON.stringify(result,null,2));
  return result;
}

function statusVinsettTraderV1() {
  const props = PropertiesService.getScriptProperties();
  const states = {}, pending = {}, locks = {};
  VINSETT.SYMBOLS.forEach(function(symbol){
    states[symbol] = readJsonProperty_(stateKey_(symbol));
    pending[symbol] = readJsonProperty_(pendingKey_(symbol));
    locks[symbol] = readJsonProperty_(lockKey_(symbol));
  });
  const triggers = ScriptApp.getProjectTriggers().map(function(trigger){return trigger.getHandlerFunction();})
    .filter(function(handler){return VINSETT.HANDLERS.indexOf(handler)!==-1;});
  const result = {app:VINSETT.APP,version:VINSETT.VERSION,core:VINSETT.CORE,mode:VINSETT.MODE,
    symbols:VINSETT.SYMBOLS,spreadsheetId:props.getProperty(VINSETT.SHEET_PROP)||null,
    states:states,pendingTrades:pending,locks:locks,installedTriggers:triggers,
    automaticOrders:false,geminiConnected:false,telegramConnected:false};
  console.log(JSON.stringify(result,null,2));
  return result;
}

function installAutomationVinsettV1() {
  ensureSetup_();
  removeAutomationVinsettV1();
  ScriptApp.newTrigger('runEntryWatcherVinsettV1').timeBased().everyMinutes(1).create();
  ScriptApp.newTrigger('runMarketScanVinsettV1').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('generatePreviousWeekReportVinsettV1').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).create();
  ScriptApp.newTrigger('generatePreviousMonthReportVinsettV1').timeBased().onMonthDay(1).atHour(8).create();
  const result = {ok:true,handlers:VINSETT.HANDLERS,note:'Os gatilhos do Apps Script são aproximados e podem não executar no segundo exato.'};
  console.log(JSON.stringify(result,null,2));
  return result;
}

function removeAutomationVinsettV1() {
  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;
  triggers.forEach(function(trigger){
    if (VINSETT.HANDLERS.indexOf(trigger.getHandlerFunction())!==-1){ScriptApp.deleteTrigger(trigger);removed++;}
  });
  return {ok:true,removed:removed};
}

function testMercadoBitcoinVinsettV1() {
  ensureSetup_();
  const url = VINSETT.API_BASE + '/symbols?symbols=' + encodeURIComponent(VINSETT.SYMBOLS.join(','));
  const data = fetchJson_(url);
  const result = {ok:true,source:'Mercado Bitcoin API v4',requestedSymbols:VINSETT.SYMBOLS,responseReceived:!!data};
  logDiagnostic_('API_TEST','',JSON.stringify(result));
  console.log(JSON.stringify(result,null,2));
  return result;
}

function diagnoseBitcoinDataVinsettV1(){return diagnoseSymbolData_('BTC-BRL');}
function diagnoseEthereumDataVinsettV1(){return diagnoseSymbolData_('ETH-BRL');}
function diagnoseSolanaDataVinsettV1(){return diagnoseSymbolData_('SOL-BRL');}
function diagnoseAllDataVinsettV1(){return VINSETT.SYMBOLS.map(function(symbol){return diagnoseSymbolData_(symbol);});}

function diagnoseSymbolData_(symbol) {
  ensureSetup_();validateSymbol_(symbol);
  try {
    const m1=fetchPagedCandles_(symbol,'1m',VINSETT.M1_SCAN_BARS,60);
    const m5=aggregateCandles_(m1,300);
    const m15=fetchPagedCandles_(symbol,'15m',VINSETT.M15_SCAN_BARS,900);
    const result={symbol:symbol,m1:m1.length,m5:m5.length,m15:m15.length,m1Gaps:countGaps_(m1,60),
      lastM1UTC:m1.length?new Date(m1[m1.length-1].t*1000).toISOString():null,
      lastM15UTC:m15.length?new Date(m15[m15.length-1].t*1000).toISOString():null,
      historySufficient:m1.length>=80&&m5.length>=60&&m15.length>=60};
    logDiagnostic_('DATA_DIAGNOSTIC',symbol,JSON.stringify(result));console.log(JSON.stringify(result,null,2));return result;
  } catch(error) {
    const failure={symbol:symbol,error:safeError_(error),historySufficient:false};
    logDiagnostic_('DATA_DIAGNOSTIC_ERROR',symbol,failure.error);console.log(JSON.stringify(failure,null,2));return failure;
  }
}

function runMarketScanVinsettV1() {
  ensureSetup_();
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(1500)){logDiagnostic_('SCAN_SKIPPED_LOCK','','Market scan skipped because another VINSETT cycle is running.');return {ok:false,skipped:'LOCKED'};}
  try {
    const output=[];
    VINSETT.SYMBOLS.forEach(function(symbol){
      try{output.push(scanSymbolContext_(symbol));}
      catch(error){const failure={symbol:symbol,state:'ERROR',direction:'NO_TRADE',reason:safeError_(error)};output.push(failure);logDiagnostic_('SCAN_ERROR',symbol,failure.reason);}
    });
    console.log(JSON.stringify(output,null,2));return output;
  } finally {lock.releaseLock();}
}

function scanSymbolContext_(symbol) {
  const previousState=readJsonProperty_(stateKey_(symbol));
  const m1=fetchPagedCandles_(symbol,'1m',VINSETT.M1_SCAN_BARS,60);
  const m5=aggregateCandles_(m1,300);
  const m15=fetchPagedCandles_(symbol,'15m',VINSETT.M15_SCAN_BARS,900);
  validateQuantity_(symbol,'M1',m1,80);validateQuantity_(symbol,'M5',m5,60);validateQuantity_(symbol,'M15',m15,60);validateM1Freshness_(symbol,m1);
  const m1Metrics=calculateMetrics_(m1),m5Metrics=calculateMetrics_(m5),m15Metrics=calculateMetrics_(m15);
  const m15Direction=classifyTrend_(m15Metrics,VINSETT.ADX_M15_MIN);
  const m5Direction=classifyTrend_(m5Metrics,VINSETT.ADX_M5_MIN);
  updateStructuralReset_(symbol,m5Direction,m5Metrics);
  let state='NEUTRAL',direction='NO_TRADE',reason='M15 sem tendência qualificada.';
  if(m15Direction!=='NEUTRAL'){
    direction=m15Direction;state='WATCHING';reason='M15 qualificado; aguardando confirmação M5.';
    if(m5Direction===m15Direction){state='ARMED';reason='M15 e M5 alinhados; aguardando gatilho M1.';}
  }
  if(readJsonProperty_(pendingKey_(symbol))){state='PENDING_RESULT';reason='Existe uma entrada simulada aguardando apuração.';}
  else if(isLocked_(symbol,direction)&&direction!=='NO_TRADE'){state='LOCKED';reason='Estrutura já gerou sinal e permanece bloqueada contra repetição.';}
  const context={symbol:symbol,state:state,direction:direction,updatedAt:Date.now(),timestampManaus:nowManaus_(),
    price:roundNumber_(m1Metrics.bar.c,8),candleM1StartUTC:new Date(m1Metrics.bar.t*1000).toISOString(),
    m15:metricsSummary_(m15Metrics,m15Direction),m5:metricsSummary_(m5Metrics,m5Direction),m1:metricsSummary_(m1Metrics,'WAITING'),reason:reason};
  writeJsonProperty_(stateKey_(symbol),context);logAnalysis_(context);
  if((!previousState||previousState.state!=='ARMED')&&state==='ARMED'){
    emitNotification_('TREND_READY',symbol,'',buildTrendReadyMessage_(context));
  }
  return context;
}

function runEntryWatcherVinsettV1() {
  ensureSetup_();
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(1500)){logDiagnostic_('WATCHER_SKIPPED_LOCK','','Entry watcher skipped because another VINSETT cycle is running.');return {ok:false,skipped:'LOCKED'};}
  try {
    const settlements=settlePendingTrades_();
    const entries=[];
    VINSETT.SYMBOLS.forEach(function(symbol){
      if(readJsonProperty_(pendingKey_(symbol)))return;
      const context=readJsonProperty_(stateKey_(symbol));
      if(!context||context.state!=='ARMED')return;
      if(Date.now()-Number(context.updatedAt||0)>VINSETT.MAX_CONTEXT_AGE_MS){logDiagnostic_('STALE_CONTEXT',symbol,'ARMED context expired; waiting for next market scan.');return;}
      try{const entry=watchSymbolForEntry_(symbol,context);if(entry)entries.push(entry);}
      catch(error){logDiagnostic_('ENTRY_WATCH_ERROR',symbol,safeError_(error));}
    });
    const result={settlements:settlements,newEntries:entries};console.log(JSON.stringify(result,null,2));return result;
  } finally {lock.releaseLock();}
}

function watchSymbolForEntry_(symbol,context) {
  if(context.direction!=='BUY'&&context.direction!=='SELL')return null;
  if(isLocked_(symbol,context.direction))return null;
  const m1=fetchPagedCandles_(symbol,'1m',VINSETT.M1_WATCH_BARS,60);
  validateQuantity_(symbol,'M1',m1,60);validateM1Freshness_(symbol,m1);
  const m1Metrics=calculateMetrics_(m1);
  const trigger=m1Trigger_(m1Metrics,context.direction);
  if(!trigger)return null;
  const score=technicalScore_(context.direction,context.m5.direction,m1Metrics,context.m5,context.m15,true);
  if(score<VINSETT.MIN_SIGNAL_SCORE){logDiagnostic_('LOW_SCORE_TRIGGER',symbol,'M1 trigger rejected with score '+score+'.');return null;}
  const signalCandleT=m1Metrics.bar.t,entryCandleT=signalCandleT+60;
  const tradeId=buildTradeId_(symbol,context.direction,entryCandleT);
  const trade={tradeId:tradeId,createdAtManaus:nowManaus_(),createdAtMs:Date.now(),symbol:symbol,direction:context.direction,
    technicalScore:score,signalCandleT:signalCandleT,entryCandleT:entryCandleT,signalPrice:roundNumber_(m1Metrics.bar.c,8),outcome:'PENDING',
    m15Adx:context.m15.adx,m5Adx:context.m5.adx,m1Adx:roundNumber_(m1Metrics.adx,2),m15Direction:context.m15.direction,m5Direction:context.m5.direction,
    reason:'M15 + M5 alinhados; M1 confirmou pullback e retomada com score suficiente.'};
  appendPendingTrade_(trade);writeJsonProperty_(pendingKey_(symbol),trade);lockStructure_(symbol,context.direction,signalCandleT);
  context.state='SIGNAL_SENT';context.updatedAt=Date.now();context.technicalScore=score;writeJsonProperty_(stateKey_(symbol),context);
  logSignal_(trade);emitNotification_('ENTRY_SIGNAL',symbol,tradeId,buildEntryMessage_(trade));return trade;
}

function settlePendingTradesVinsettV1() {
  ensureSetup_();const lock=LockService.getScriptLock();if(!lock.tryLock(1500))return {ok:false,skipped:'LOCKED'};
  try{const result=settlePendingTrades_();console.log(JSON.stringify(result,null,2));return result;}finally{lock.releaseLock();}
}

function settlePendingTrades_() {
  const settled=[];
  VINSETT.SYMBOLS.forEach(function(symbol){
    const pending=readJsonProperty_(pendingKey_(symbol));if(!pending)return;
    try{const result=settleOneTrade_(pending);if(result)settled.push(result);}
    catch(error){logDiagnostic_('SETTLEMENT_ERROR',symbol,safeError_(error));}
  });
  return settled;
}

function settleOneTrade_(trade) {
  const nowSec=Math.floor(Date.now()/1000);if(nowSec<Number(trade.entryCandleT)+60)return null;
  const bars=fetchCandlesEndingAt_(trade.symbol,'1m',Number(trade.entryCandleT)+180,12,60);
  const entryBar=bars.find(function(bar){return bar.t===Number(trade.entryCandleT);});
  if(!entryBar||entryBar.t+60>nowSec)return null;
  const outcome=evaluateOutcome_(trade.direction,entryBar.o,entryBar.c),settledAt=nowManaus_();
  updateTradeSettlement_(trade.tradeId,roundNumber_(entryBar.o,8),roundNumber_(entryBar.c,8),outcome,settledAt);
  trade.entryPrice=roundNumber_(entryBar.o,8);trade.exitPrice=roundNumber_(entryBar.c,8);trade.outcome=outcome;trade.settledAtManaus=settledAt;
  deleteProperty_(pendingKey_(trade.symbol));
  const context=readJsonProperty_(stateKey_(trade.symbol));if(context){context.state='LOCKED';context.updatedAt=Date.now();context.reason='Entrada simulada apurada; aguardando reset estrutural M5.';writeJsonProperty_(stateKey_(trade.symbol),context);}
  emitNotification_('TRADE_RESULT',trade.symbol,trade.tradeId,buildOutcomeMessage_(trade));return trade;
}

function evaluateOutcome_(direction,entryPrice,exitPrice) {
  if(exitPrice===entryPrice)return 'DRAW';
  if(direction==='BUY')return exitPrice>entryPrice?'WIN':'LOSS';
  if(direction==='SELL')return exitPrice<entryPrice?'WIN':'LOSS';
  throw new Error('Invalid direction for settlement: '+direction);
}

function generateWeeklyReportVinsettV1(){const range=currentWeekRange_();return generatePerformanceReport_('WEEKLY_CURRENT',range.start,range.end);}
function generatePreviousWeekReportVinsettV1(){const range=previousWeekRange_();return generatePerformanceReport_('WEEKLY',range.start,range.end);}
function generateMonthlyReportVinsettV1(){const range=currentMonthRange_();return generatePerformanceReport_('MONTHLY_CURRENT',range.start,range.end);}
function generatePreviousMonthReportVinsettV1(){const range=previousMonthRange_();return generatePerformanceReport_('MONTHLY',range.start,range.end);}

function generatePerformanceReport_(periodType,startDate,endDate) {
  ensureSetup_();
  const sheet=getSpreadsheet_().getSheetByName('Trades');
  const rows=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,sheet.getLastColumn()).getValues():[];
  const startStamp=startDate+' 00:00:00',endStamp=endDate+' 23:59:59';
  const counts={totalSettled:0,wins:0,losses:0,draws:0},breakdown={};
  VINSETT.SYMBOLS.forEach(function(symbol){breakdown[symbol]={totalSettled:0,wins:0,losses:0,draws:0,winRatePct:0,lossRatePct:0};});
  rows.forEach(function(row){
    const created=String(row[1]||''),symbol=String(row[2]||''),outcome=String(row[10]||'');
    if(created<startStamp||created>endStamp)return;
    if(outcome!=='WIN'&&outcome!=='LOSS'&&outcome!=='DRAW')return;
    counts.totalSettled++;if(outcome==='WIN')counts.wins++;if(outcome==='LOSS')counts.losses++;if(outcome==='DRAW')counts.draws++;
    if(!breakdown[symbol])breakdown[symbol]={totalSettled:0,wins:0,losses:0,draws:0,winRatePct:0,lossRatePct:0};
    breakdown[symbol].totalSettled++;if(outcome==='WIN')breakdown[symbol].wins++;if(outcome==='LOSS')breakdown[symbol].losses++;if(outcome==='DRAW')breakdown[symbol].draws++;
  });
  const decided=counts.wins+counts.losses;
  const winRatePct=decided?roundNumber_(counts.wins*100/decided,2):0;
  const lossRatePct=decided?roundNumber_(counts.losses*100/decided,2):0;
  Object.keys(breakdown).forEach(function(symbol){const item=breakdown[symbol],den=item.wins+item.losses;item.winRatePct=den?roundNumber_(item.wins*100/den,2):0;item.lossRatePct=den?roundNumber_(item.losses*100/den,2):0;});
  const report={periodType:periodType,periodStart:startDate,periodEnd:endDate,totalSettled:counts.totalSettled,wins:counts.wins,losses:counts.losses,draws:counts.draws,winRatePct:winRatePct,lossRatePct:lossRatePct,breakdown:breakdown};
  getSpreadsheet_().getSheetByName('Reports').appendRow([nowManaus_(),periodType,startDate,endDate,counts.totalSettled,counts.wins,counts.losses,counts.draws,winRatePct,lossRatePct,JSON.stringify(breakdown)]);
  emitNotification_('PERFORMANCE_REPORT','','',buildReportMessage_(report));console.log(JSON.stringify(report,null,2));return report;
}

function buildTrendReadyMessage_(context) {
  return ['👁 VINSETT TRADER — TENDÊNCIA EM FORMAÇÃO','','Ativo: '+context.symbol,'Direção: '+context.direction,
    'M15: '+context.m15.direction+' | ADX '+context.m15.adx,'M5: '+context.m5.direction+' | ADX '+context.m5.adx,'',
    'Status: ARMED','Aguardando confirmação do gatilho M1.','Nenhuma entrada foi confirmada ainda.'].join('\n');
}

function buildEntryMessage_(trade) {
  return ['🚨 VINSETT TRADER — ENTRADA CONFIRMADA','','Ativo: '+trade.symbol,'Direção: '+trade.direction,
    'Score técnico: '+trade.technicalScore+'/100','Preço no sinal: '+trade.signalPrice,
    'Entrada simulada: abertura da próxima vela M1','Horário da vela: '+formatUnixManaus_(trade.entryCandleT),'',
    'Resultado será apurado após o fechamento desta vela M1.'].join('\n');
}

function buildOutcomeMessage_(trade) {
  const icon=trade.outcome==='WIN'?'✅':trade.outcome==='LOSS'?'❌':'➖';
  return [icon+' VINSETT TRADER — RESULTADO '+trade.outcome,'','Ativo: '+trade.symbol,'Direção: '+trade.direction,
    'Entrada: '+trade.entryPrice,'Fechamento: '+trade.exitPrice,'Score técnico: '+trade.technicalScore+'/100','Expiração: M1','Trade ID: '+trade.tradeId].join('\n');
}

function buildReportMessage_(report) {
  const lines=['📊 VINSETT TRADER — RELATÓRIO '+report.periodType,'','Período: '+report.periodStart+' até '+report.periodEnd,
    'Operações apuradas: '+report.totalSettled,'WIN: '+report.wins+' ('+report.winRatePct+'%)','LOSS: '+report.losses+' ('+report.lossRatePct+'%)','DRAW: '+report.draws,'','Por ativo:'];
  VINSETT.SYMBOLS.forEach(function(symbol){const item=report.breakdown[symbol];lines.push(symbol+': '+item.wins+'W / '+item.losses+'L / '+item.draws+'D | WIN '+item.winRatePct+'%');});
  return lines.join('\n');
}

function emitNotification_(type,symbol,tradeId,message) {
  getSpreadsheet_().getSheetByName('Notifications').appendRow([nowManaus_(),type,symbol||'',tradeId||'',message]);
  console.log(message);
}

function appendPendingTrade_(trade) {
  getSpreadsheet_().getSheetByName('Trades').appendRow([
    trade.tradeId,trade.createdAtManaus,trade.symbol,trade.direction,trade.technicalScore,
    new Date(trade.signalCandleT*1000).toISOString(),new Date(trade.entryCandleT*1000).toISOString(),trade.signalPrice,'','',
    'PENDING','',trade.m15Adx,trade.m5Adx,trade.m1Adx,trade.m15Direction,trade.m5Direction,trade.reason
  ]);
}

function updateTradeSettlement_(tradeId,entryPrice,exitPrice,outcome,settledAt) {
  const sheet=getSpreadsheet_().getSheetByName('Trades');const row=findTradeRow_(sheet,tradeId);
  if(!row)throw new Error('Trade not found for settlement: '+tradeId);
  sheet.getRange(row,9,1,4).setValues([[entryPrice,exitPrice,outcome,settledAt]]);
}

function findTradeRow_(sheet,tradeId) {
  if(sheet.getLastRow()<2)return null;
  const match=sheet.getRange(2,1,sheet.getLastRow()-1,1).createTextFinder(tradeId).matchEntireCell(true).findNext();
  return match?match.getRow():null;
}

function logSignal_(trade) {
  getSpreadsheet_().getSheetByName('SignalEvents').appendRow([
    trade.createdAtManaus,trade.tradeId,trade.symbol,trade.direction,trade.technicalScore,trade.signalPrice,
    new Date(trade.entryCandleT*1000).toISOString(),trade.m15Adx,trade.m5Adx,trade.m1Adx,trade.reason
  ]);
}

function logAnalysis_(analysis) {
  getSpreadsheet_().getSheetByName('Analyses').appendRow([
    analysis.timestampManaus,analysis.symbol,analysis.state,analysis.direction,analysis.technicalScore||0,analysis.price,
    analysis.m15.direction,analysis.m15.adx,analysis.m15.plusDI,analysis.m15.minusDI,analysis.m15.ema9,analysis.m15.ema21,analysis.m15.ema50,analysis.m15.vwap,
    analysis.m5.direction,analysis.m5.adx,analysis.m5.plusDI,analysis.m5.minusDI,analysis.m5.ema9,analysis.m5.ema21,analysis.m5.ema50,analysis.m5.vwap,
    analysis.m1.direction,analysis.m1.adx,analysis.m1.plusDI,analysis.m1.minusDI,analysis.m1.ema9,analysis.m1.ema21,analysis.m1.ema50,analysis.m1.vwap,
    analysis.candleM1StartUTC,analysis.reason
  ]);
}

function logDiagnostic_(type,symbol,detail) {
  try{getSpreadsheet_().getSheetByName('Diagnostics').appendRow([nowManaus_(),type,symbol||'',detail||'']);}catch(ignored){}
}

function fetchPagedCandles_(symbol,resolution,targetBars,intervalSec) {
  validateSymbol_(symbol);let cursorTo=Math.floor(Date.now()/1000),collected=[],previousEarliest=null,page=0;
  while(collected.length<targetBars&&page<VINSETT.MAX_PAGES){
    const remaining=targetBars-collected.length;
    const countback=Math.min(VINSETT.PAGE_SIZE,Math.max(remaining+2,60));
    const url=VINSETT.API_BASE+'/candles?symbol='+encodeURIComponent(symbol)+'&resolution='+encodeURIComponent(resolution)+'&to='+cursorTo+'&countback='+countback;
    let batch=normalizeCandlesResponse_(fetchJson_(url),symbol);batch=closedCandlesOnly_(batch,intervalSec);if(!batch.length)break;
    const earliest=batch[0].t;if(previousEarliest!==null&&earliest>=previousEarliest)throw new Error(symbol+' '+resolution+': pagination did not advance.');
    collected=deduplicateByTimestamp_(collected.concat(batch));previousEarliest=earliest;cursorTo=earliest-intervalSec;page++;
  }
  collected=deduplicateByTimestamp_(collected);if(collected.length>targetBars)collected=collected.slice(collected.length-targetBars);return collected;
}

function fetchCandlesEndingAt_(symbol,resolution,toSec,countback,intervalSec) {
  const url=VINSETT.API_BASE+'/candles?symbol='+encodeURIComponent(symbol)+'&resolution='+encodeURIComponent(resolution)+'&to='+Number(toSec)+'&countback='+Number(countback);
  return closedCandlesOnly_(normalizeCandlesResponse_(fetchJson_(url),symbol),intervalSec);
}

function normalizeCandlesResponse_(raw,symbol) {
  if(!raw||!Array.isArray(raw.t)||!Array.isArray(raw.o)||!Array.isArray(raw.h)||!Array.isArray(raw.l)||!Array.isArray(raw.c)||!Array.isArray(raw.v))throw new Error('Invalid OHLCV response for '+symbol+'.');
  const size=raw.t.length;if(raw.o.length!==size||raw.h.length!==size||raw.l.length!==size||raw.c.length!==size||raw.v.length!==size)throw new Error('Inconsistent OHLCV arrays for '+symbol+'.');
  const bars=[];
  for(let i=0;i<size;i++){
    const bar={t:Number(raw.t[i]),o:Number(raw.o[i]),h:Number(raw.h[i]),l:Number(raw.l[i]),c:Number(raw.c[i]),v:Number(raw.v[i])};
    const validNumbers=[bar.t,bar.o,bar.h,bar.l,bar.c,bar.v].every(Number.isFinite);
    const validOhlc=bar.o>0&&bar.c>0&&bar.h>=bar.l&&bar.h>=bar.o&&bar.h>=bar.c&&bar.l<=bar.o&&bar.l<=bar.c&&bar.v>=0;
    if(validNumbers&&validOhlc)bars.push(bar);
  }
  bars.sort(function(a,b){return a.t-b.t;});return deduplicateByTimestamp_(bars);
}

function aggregateCandles_(m1Bars,bucketSec) {
  const expectedBars=bucketSec/60,buckets={};
  m1Bars.forEach(function(bar){const bucketStart=Math.floor(bar.t/bucketSec)*bucketSec;if(!buckets[bucketStart])buckets[bucketStart]=[];buckets[bucketStart].push(bar);});
  const output=[];
  Object.keys(buckets).map(Number).sort(function(a,b){return a-b;}).forEach(function(bucketStart){
    const bars=buckets[bucketStart].sort(function(a,b){return a.t-b.t;});if(bars.length!==expectedBars)return;
    for(let i=1;i<bars.length;i++){if(bars[i].t-bars[i-1].t!==60)return;}
    let high=-Infinity,low=Infinity,volume=0;bars.forEach(function(bar){high=Math.max(high,bar.h);low=Math.min(low,bar.l);volume+=bar.v;});
    output.push({t:bucketStart,o:bars[0].o,h:high,l:low,c:bars[bars.length-1].c,v:volume});
  });
  return closedCandlesOnly_(output,bucketSec);
}

function closedCandlesOnly_(bars,intervalSec) {const nowSec=Math.floor(Date.now()/1000);return bars.filter(function(bar){return bar.t+intervalSec<=nowSec;});}
function validateM1Freshness_(symbol,bars) {const lastBar=bars[bars.length-1],nowSec=Math.floor(Date.now()/1000),staleness=nowSec-(lastBar.t+60);if(staleness>VINSETT.MAX_M1_STALENESS_SEC)throw new Error(symbol+': last M1 candle is stale by '+staleness+' seconds.');}
function countGaps_(bars,intervalSec) {let gaps=0;for(let i=1;i<bars.length;i++){const delta=bars[i].t-bars[i-1].t;if(delta>intervalSec)gaps+=Math.floor(delta/intervalSec)-1;}return gaps;}

function calculateMetrics_(bars) {
  const closes=bars.map(function(bar){return bar.c;});const ema9=emaSeries_(closes,VINSETT.EMA_FAST),ema21=emaSeries_(closes,VINSETT.EMA_MID),ema50=emaSeries_(closes,VINSETT.EMA_SLOW),vwap=rollingVwapSeries_(bars,VINSETT.VWAP_PERIOD),dmi=dmiAdxSeries_(bars,VINSETT.DMI_PERIOD);
  const index=bars.length-1,previousIndex=index-1,slopeIndex=Math.max(0,index-3);
  const required=[ema9[index],ema21[index],ema50[index],vwap[index],dmi.adx[index],dmi.plusDI[index],dmi.minusDI[index]];
  if(!required.every(Number.isFinite))throw new Error('Insufficient indicator history on latest candle.');
  return {bar:bars[index],prevBar:bars[previousIndex],ema9:ema9[index],ema21:ema21[index],ema50:ema50[index],ema9Prev:ema9[previousIndex],ema21Prev:ema21[previousIndex],ema50Prev:ema50[previousIndex],ema9SlopeRef:ema9[slopeIndex],ema21SlopeRef:ema21[slopeIndex],vwap:vwap[index],vwapPrev:vwap[previousIndex],adx:dmi.adx[index],plusDI:dmi.plusDI[index],minusDI:dmi.minusDI[index]};
}

function emaSeries_(values,period) {const output=new Array(values.length).fill(null);if(values.length<period)return output;let sum=0;for(let i=0;i<period;i++)sum+=values[i];let ema=sum/period;output[period-1]=ema;const multiplier=2/(period+1);for(let i=period;i<values.length;i++){ema=values[i]*multiplier+ema*(1-multiplier);output[i]=ema;}return output;}
function rollingVwapSeries_(bars,period) {const output=new Array(bars.length).fill(null),pv=[];let sumPV=0,sumV=0;for(let i=0;i<bars.length;i++){const typical=(bars[i].h+bars[i].l+bars[i].c)/3,currentPV=typical*bars[i].v;pv.push(currentPV);sumPV+=currentPV;sumV+=bars[i].v;if(i>=period){sumPV-=pv[i-period];sumV-=bars[i-period].v;}if(i>=period-1&&sumV>0)output[i]=sumPV/sumV;}return output;}

function dmiAdxSeries_(bars,period) {
  const size=bars.length,plusDI=new Array(size).fill(null),minusDI=new Array(size).fill(null),adx=new Array(size).fill(null),tr=new Array(size).fill(0),plusDM=new Array(size).fill(0),minusDM=new Array(size).fill(0),dx=new Array(size).fill(null);
  if(size<period*2+2)return {plusDI:plusDI,minusDI:minusDI,adx:adx};
  for(let i=1;i<size;i++){const upMove=bars[i].h-bars[i-1].h,downMove=bars[i-1].l-bars[i].l;plusDM[i]=upMove>downMove&&upMove>0?upMove:0;minusDM[i]=downMove>upMove&&downMove>0?downMove:0;tr[i]=Math.max(bars[i].h-bars[i].l,Math.abs(bars[i].h-bars[i-1].c),Math.abs(bars[i].l-bars[i-1].c));}
  let smoothTR=0,smoothPlus=0,smoothMinus=0;for(let i=1;i<=period;i++){smoothTR+=tr[i];smoothPlus+=plusDM[i];smoothMinus+=minusDM[i];}
  for(let i=period;i<size;i++){if(i>period){smoothTR=smoothTR-smoothTR/period+tr[i];smoothPlus=smoothPlus-smoothPlus/period+plusDM[i];smoothMinus=smoothMinus-smoothMinus/period+minusDM[i];}if(smoothTR>0){plusDI[i]=100*smoothPlus/smoothTR;minusDI[i]=100*smoothMinus/smoothTR;const denominator=plusDI[i]+minusDI[i];dx[i]=denominator>0?100*Math.abs(plusDI[i]-minusDI[i])/denominator:0;}}
  const firstAdxIndex=period*2-1;let dxSum=0,dxCount=0;for(let i=period;i<=firstAdxIndex;i++){if(Number.isFinite(dx[i])){dxSum+=dx[i];dxCount++;}}
  if(dxCount===period){adx[firstAdxIndex]=dxSum/period;for(let i=firstAdxIndex+1;i<size;i++){if(Number.isFinite(dx[i]))adx[i]=(adx[i-1]*(period-1)+dx[i])/period;}}
  return {plusDI:plusDI,minusDI:minusDI,adx:adx};
}

function classifyTrend_(metrics,minimumAdx) {
  const bullishEmas=metrics.ema9>metrics.ema21&&metrics.ema21>metrics.ema50,bearishEmas=metrics.ema9<metrics.ema21&&metrics.ema21<metrics.ema50,
    bullishSlope=metrics.ema9>metrics.ema9SlopeRef&&metrics.ema21>metrics.ema21SlopeRef,bearishSlope=metrics.ema9<metrics.ema9SlopeRef&&metrics.ema21<metrics.ema21SlopeRef,strongEnough=metrics.adx>=minimumAdx;
  if(bullishEmas&&bullishSlope&&strongEnough&&metrics.plusDI>metrics.minusDI&&metrics.bar.c>metrics.vwap)return 'BUY';
  if(bearishEmas&&bearishSlope&&strongEnough&&metrics.minusDI>metrics.plusDI&&metrics.bar.c<metrics.vwap)return 'SELL';
  return 'NEUTRAL';
}

function m1Trigger_(metrics,direction) {
  const tolerance=VINSETT.PULLBACK_TOLERANCE_PCT;if(metrics.adx<VINSETT.ADX_M1_MIN)return false;
  if(direction==='BUY'){
    const pullback=withinPct_(metrics.prevBar.l,metrics.ema21Prev,tolerance)||withinPct_(metrics.prevBar.l,metrics.vwapPrev,tolerance)||metrics.prevBar.c<=metrics.ema9Prev;
    const resumption=metrics.bar.c>metrics.bar.o&&metrics.bar.c>metrics.ema9&&metrics.bar.c>metrics.vwap&&metrics.plusDI>metrics.minusDI&&metrics.bar.c>metrics.prevBar.h;return pullback&&resumption;
  }
  if(direction==='SELL'){
    const pullback=withinPct_(metrics.prevBar.h,metrics.ema21Prev,tolerance)||withinPct_(metrics.prevBar.h,metrics.vwapPrev,tolerance)||metrics.prevBar.c>=metrics.ema9Prev;
    const resumption=metrics.bar.c<metrics.bar.o&&metrics.bar.c<metrics.ema9&&metrics.bar.c<metrics.vwap&&metrics.minusDI>metrics.plusDI&&metrics.bar.c<metrics.prevBar.l;return pullback&&resumption;
  }
  return false;
}

function technicalScore_(m15Direction,m5Direction,m1,m5,m15,trigger) {
  if(m15Direction==='NEUTRAL')return 0;let score=35;if(Number(m15.adx)>=30)score+=5;if(m5Direction===m15Direction)score+=30;if(m5Direction===m15Direction&&Number(m5.adx)>=28)score+=5;
  if(m15Direction==='BUY'){if(m1.plusDI>m1.minusDI)score+=10;if(m1.bar.c>m1.vwap)score+=5;}else{if(m1.minusDI>m1.plusDI)score+=10;if(m1.bar.c<m1.vwap)score+=5;}
  if(trigger)score+=10;return Math.max(0,Math.min(100,Math.round(score)));
}

function updateStructuralReset_(symbol,currentM5Direction,m5Metrics) {
  const key=lockKey_(symbol),lock=readJsonProperty_(key);if(!lock)return;let reset=false;
  if(lock.direction==='BUY')reset=currentM5Direction==='SELL'||m5Metrics.bar.c<m5Metrics.ema21||m5Metrics.plusDI<=m5Metrics.minusDI;
  else if(lock.direction==='SELL')reset=currentM5Direction==='BUY'||m5Metrics.bar.c>m5Metrics.ema21||m5Metrics.minusDI<=m5Metrics.plusDI;
  if(reset){deleteProperty_(key);logDiagnostic_('STRUCTURAL_RESET',symbol,'Lock '+lock.direction+' removed because M5 structure was invalidated.');}
}

function lockStructure_(symbol,direction,candleTimestamp){writeJsonProperty_(lockKey_(symbol),{direction:direction,candleTimestamp:candleTimestamp,createdAt:Date.now()});}
function isLocked_(symbol,direction){const lock=readJsonProperty_(lockKey_(symbol));return !!(lock&&lock.direction===direction);}
function resetVinsettLocksV1(){VINSETT.SYMBOLS.forEach(function(symbol){deleteProperty_(lockKey_(symbol));const state=readJsonProperty_(stateKey_(symbol));if(state&&state.state!=='PENDING_RESULT'&&state.state!=='SIGNAL_SENT'){state.state='NEUTRAL';state.direction='NO_TRADE';state.updatedAt=Date.now();state.reason='Bloqueio removido manualmente; aguardando novo market scan.';writeJsonProperty_(stateKey_(symbol),state);}});logDiagnostic_('MANUAL_LOCK_RESET','','Structural locks were cleared. Pending trades were preserved for settlement.');return {ok:true,pendingTradesPreserved:true};}
function stateKey_(symbol){return VINSETT.PROP_PREFIX+'STATE_'+sanitizeSymbol_(symbol);}
function pendingKey_(symbol){return VINSETT.PROP_PREFIX+'PENDING_'+sanitizeSymbol_(symbol);}
function lockKey_(symbol){return VINSETT.PROP_PREFIX+'LOCK_'+sanitizeSymbol_(symbol);}
function sanitizeSymbol_(symbol){return symbol.replace(/[^A-Z0-9]/g,'_');}

function currentWeekRange_(){const today=currentManausDate_(),date=parseDateOnlyUtc_(today),day=date.getUTCDay(),diffToMonday=(day+6)%7,start=addUtcDays_(date,-diffToMonday),end=addUtcDays_(start,6);return {start:formatUtcDateOnly_(start),end:formatUtcDateOnly_(end)};}
function previousWeekRange_(){const current=currentWeekRange_(),currentStart=parseDateOnlyUtc_(current.start),start=addUtcDays_(currentStart,-7),end=addUtcDays_(currentStart,-1);return {start:formatUtcDateOnly_(start),end:formatUtcDateOnly_(end)};}
function currentMonthRange_(){const today=parseDateOnlyUtc_(currentManausDate_()),start=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),1)),end=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth()+1,0));return {start:formatUtcDateOnly_(start),end:formatUtcDateOnly_(end)};}
function previousMonthRange_(){const today=parseDateOnlyUtc_(currentManausDate_()),start=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth()-1,1)),end=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),0));return {start:formatUtcDateOnly_(start),end:formatUtcDateOnly_(end)};}
function currentManausDate_(){return Utilities.formatDate(new Date(),VINSETT.TIME_ZONE,'yyyy-MM-dd');}
function parseDateOnlyUtc_(dateString){const parts=dateString.split('-').map(Number);return new Date(Date.UTC(parts[0],parts[1]-1,parts[2]));}
function addUtcDays_(date,days){return new Date(date.getTime()+days*86400000);}
function formatUtcDateOnly_(date){return Utilities.formatDate(date,'UTC','yyyy-MM-dd');}

function fetchJson_(url) {
  let lastError='';
  for(let attempt=0;attempt<=VINSETT.MAX_HTTP_RETRIES;attempt++){
    throttlePublicApi_();let response;
    try{response=UrlFetchApp.fetch(url,{method:'get',muteHttpExceptions:true,headers:{Accept:'application/json'}});}
    catch(error){lastError='Network failure: '+safeError_(error);if(attempt<VINSETT.MAX_HTTP_RETRIES){Utilities.sleep(VINSETT.HTTP_RETRY_BASE_MS*(attempt+1));continue;}throw new Error(lastError);}
    const code=response.getResponseCode(),text=response.getContentText();
    if(code>=200&&code<300){try{return JSON.parse(text);}catch(error){throw new Error('Invalid JSON received from Mercado Bitcoin API.');}}
    lastError='HTTP '+code+' at '+url.replace(/\?.*$/,'')+': '+text.slice(0,300);
    if((code===429||code>=500)&&attempt<VINSETT.MAX_HTTP_RETRIES){Utilities.sleep(VINSETT.HTTP_RETRY_BASE_MS*(attempt+1));continue;}
    throw new Error(lastError);
  }
  throw new Error(lastError||'Unknown HTTP failure.');
}

function throttlePublicApi_(){const now=Date.now(),elapsed=now-vinsettLastRequestAt_;if(vinsettLastRequestAt_>0&&elapsed<VINSETT.REQUEST_GAP_MS)Utilities.sleep(VINSETT.REQUEST_GAP_MS-elapsed);vinsettLastRequestAt_=Date.now();}
function ensureSetup_(){const id=PropertiesService.getScriptProperties().getProperty(VINSETT.SHEET_PROP);if(!id)setupVinsettTraderV1();}
function getSpreadsheet_(){const id=PropertiesService.getScriptProperties().getProperty(VINSETT.SHEET_PROP);if(!id)throw new Error('VINSETT not prepared. Run setupVinsettTraderV1 first.');return SpreadsheetApp.openById(id);}
function ensureSheet_(spreadsheet,name,headers){let sheet=spreadsheet.getSheetByName(name);if(!sheet)sheet=spreadsheet.insertSheet(name);if(sheet.getLastRow()===0){sheet.getRange(1,1,1,headers.length).setValues([headers]);sheet.setFrozenRows(1);}return sheet;}
function validateSymbol_(symbol){if(VINSETT.SYMBOLS.indexOf(symbol)===-1)throw new Error('Symbol outside VINSETT V1 scope: '+symbol);}
function validateQuantity_(symbol,timeframe,bars,minimum){if(!bars||bars.length<minimum)throw new Error(symbol+' '+timeframe+': only '+(bars?bars.length:0)+' complete candles; minimum '+minimum+'.');}
function deduplicateByTimestamp_(bars){const map={};bars.forEach(function(bar){map[bar.t]=bar;});return Object.keys(map).map(Number).sort(function(a,b){return a-b;}).map(function(timestamp){return map[timestamp];});}
function withinPct_(price,reference,tolerancePct){if(!Number.isFinite(price)||!Number.isFinite(reference)||reference===0)return false;return Math.abs(price-reference)/Math.abs(reference)*100<=tolerancePct;}
function metricsSummary_(metrics,direction){return {direction:direction,close:roundNumber_(metrics.bar.c,8),ema9:roundNumber_(metrics.ema9,8),ema21:roundNumber_(metrics.ema21,8),ema50:roundNumber_(metrics.ema50,8),adx:roundNumber_(metrics.adx,2),plusDI:roundNumber_(metrics.plusDI,2),minusDI:roundNumber_(metrics.minusDI,2),vwap:roundNumber_(metrics.vwap,8)};}
function roundNumber_(number,digits){if(!Number.isFinite(number))return null;const factor=Math.pow(10,digits||0);return Math.round(number*factor)/factor;}
function nowManaus_(){return Utilities.formatDate(new Date(),VINSETT.TIME_ZONE,'yyyy-MM-dd HH:mm:ss');}
function formatUnixManaus_(unixSec){return Utilities.formatDate(new Date(Number(unixSec)*1000),VINSETT.TIME_ZONE,'yyyy-MM-dd HH:mm');}
function buildTradeId_(symbol,direction,entryCandleT){return 'V1-'+sanitizeSymbol_(symbol)+'-'+direction+'-'+Number(entryCandleT);}
function readJsonProperty_(key){const props=PropertiesService.getScriptProperties(),raw=props.getProperty(key);if(!raw)return null;try{return JSON.parse(raw);}catch(error){props.deleteProperty(key);return null;}}
function writeJsonProperty_(key,value){PropertiesService.getScriptProperties().setProperty(key,JSON.stringify(value));}
function deleteProperty_(key){PropertiesService.getScriptProperties().deleteProperty(key);}
function safeError_(error){const message=error&&error.message?error.message:String(error);return message.slice(0,800);}
