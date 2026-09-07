/**
 * VINSETT Trader V1.0 Alpha — Core 0.5.2 Continuity Fix
 * Sidecar hotfix for sparse Mercado Bitcoin candle series.
 * Missing no-trade intervals are normalized with previous close and zero volume.
 */

const VINSETT_CONTINUITY_FIX = Object.freeze({
  VERSION: '0.5.2-CONTINUITY-FIX',
  M1_REAL_TARGET_BARS: 900,
  M1_CONTINUOUS_BARS: 900,
  M1_WATCH_CONTINUOUS_BARS: 120,
  M15_REAL_TARGET_BARS: 120,
  M15_CONTINUOUS_BARS: 120,
  PAGE_SIZE: 200,
  MAX_PAGES: 8,
  MIN_M1: 80,
  MIN_M5: 60,
  MIN_M15: 60,
  MIN_REAL_M1_PCT_LAST_60: 20,
  MAX_LAST_REAL_AGE_MIN: 5,
  SCAN_HANDLER: 'runMarketScanContinuityVinsettV1',
  WATCH_HANDLER: 'runEntryWatcherContinuityVinsettV1'
});

function diagnoseContinuityFixVinsettV1() {
  ensureSetup_();
  const assets = [];

  VINSETT.SYMBOLS.forEach(function(symbol) {
    try {
      assets.push(diagnoseSymbolContinuityFix_(symbol));
    } catch (error) {
      const failure = {
        symbol: symbol,
        historySufficient: false,
        dataQualityReady: false,
        error: safeError_(error)
      };
      logDiagnostic_('CONTINUITY_DIAGNOSTIC_ERROR', symbol, JSON.stringify(failure));
      assets.push(failure);
    }
  });

  const output = {
    version: VINSETT_CONTINUITY_FIX.VERSION,
    allHistoryReady: assets.every(function(item) { return item.historySufficient === true; }),
    allDataQualityReady: assets.every(function(item) { return item.dataQualityReady === true; }),
    assets: assets
  };

  console.log(JSON.stringify(output, null, 2));
  return output;
}

function diagnoseSymbolContinuityFix_(symbol) {
  validateSymbol_(symbol);

  const m1Data = buildContinuousM1Data_(symbol, VINSETT_CONTINUITY_FIX.M1_CONTINUOUS_BARS);
  const m5 = aggregateCandles_(m1Data.normalized, 300);
  const m15Data = buildContinuousM15Data_(symbol);

  const result = {
    symbol: symbol,
    rawM1: m1Data.raw.length,
    normalizedM1: m1Data.normalized.length,
    syntheticM1: m1Data.stats.syntheticBars,
    syntheticM1Pct: m1Data.stats.syntheticPct,
    realM1Last60: m1Data.stats.realLast60,
    realM1Last60Pct: m1Data.stats.realLast60Pct,
    lastRealM1AgeMin: m1Data.stats.lastRealAgeMin,
    m5: m5.length,
    rawM15: m15Data.raw.length,
    normalizedM15: m15Data.normalized.length,
    m15Synthetic: m15Data.stats.syntheticBars,
    m1Ready: m1Data.normalized.length >= VINSETT_CONTINUITY_FIX.MIN_M1,
    m5Ready: m5.length >= VINSETT_CONTINUITY_FIX.MIN_M5,
    m15Ready: m15Data.normalized.length >= VINSETT_CONTINUITY_FIX.MIN_M15,
    dataQualityReady: m1Data.stats.dataQualityReady,
    lastRealM1UTC: m1Data.stats.lastRealUTC,
    lastNormalizedM1UTC: m1Data.normalized.length
      ? new Date(m1Data.normalized[m1Data.normalized.length - 1].t * 1000).toISOString()
      : null
  };

  result.historySufficient = result.m1Ready && result.m5Ready && result.m15Ready;

  logDiagnostic_('CONTINUITY_DIAGNOSTIC', symbol, JSON.stringify(result));
  return result;
}

function runMarketScanContinuityVinsettV1() {
  ensureSetup_();
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(1500)) {
    return { ok: false, skipped: 'LOCKED' };
  }

  try {
    const output = [];

    VINSETT.SYMBOLS.forEach(function(symbol) {
      try {
        output.push(scanSymbolContextContinuity_(symbol));
      } catch (error) {
        const failure = {
          symbol: symbol,
          state: 'ERROR',
          direction: 'NO_TRADE',
          reason: safeError_(error)
        };
        output.push(failure);
        logDiagnostic_('CONTINUITY_SCAN_ERROR', symbol, failure.reason);
      }
    });

    console.log(JSON.stringify(output, null, 2));
    return output;
  } finally {
    lock.releaseLock();
  }
}

function scanSymbolContextContinuity_(symbol) {
  const previousState = readJsonProperty_(stateKey_(symbol));
  const m1Data = buildContinuousM1Data_(symbol, VINSETT_CONTINUITY_FIX.M1_CONTINUOUS_BARS);
  const m1 = m1Data.normalized;
  const m5 = aggregateCandles_(m1, 300);
  const m15Data = buildContinuousM15Data_(symbol);
  const m15 = m15Data.normalized;

  validateQuantity_(symbol, 'M1', m1, VINSETT_CONTINUITY_FIX.MIN_M1);
  validateQuantity_(symbol, 'M5', m5, VINSETT_CONTINUITY_FIX.MIN_M5);
  validateQuantity_(symbol, 'M15', m15, VINSETT_CONTINUITY_FIX.MIN_M15);

  const m1Metrics = calculateMetrics_(m1);
  const m5Metrics = calculateMetrics_(m5);
  const m15Metrics = calculateMetrics_(m15);
  const m15Direction = classifyTrend_(m15Metrics, VINSETT.ADX_M15_MIN);
  const m5Direction = classifyTrend_(m5Metrics, VINSETT.ADX_M5_MIN);

  updateStructuralReset_(symbol, m5Direction, m5Metrics);

  let state = 'NEUTRAL';
  let direction = 'NO_TRADE';
  let reason = 'M15 sem tendência qualificada.';

  if (!m1Data.stats.dataQualityReady) {
    state = 'DATA_QUALITY_BLOCKED';
    direction = 'NO_TRADE';
    reason = 'Histórico contínuo disponível, mas a atividade M1 recente está abaixo do filtro mínimo de qualidade.';
  } else if (m15Direction !== 'NEUTRAL') {
    direction = m15Direction;
    state = 'WATCHING';
    reason = 'M15 qualificado; aguardando confirmação M5.';

    if (m5Direction === m15Direction) {
      state = 'ARMED';
      reason = 'M15 e M5 alinhados; aguardando gatilho M1.';
    }
  }

  if (readJsonProperty_(pendingKey_(symbol))) {
    state = 'PENDING_RESULT';
    reason = 'Existe uma entrada simulada aguardando apuração.';
  } else if (direction !== 'NO_TRADE' && isLocked_(symbol, direction)) {
    state = 'LOCKED';
    reason = 'Estrutura já gerou sinal e permanece bloqueada.';
  }

  const context = {
    symbol: symbol,
    state: state,
    direction: direction,
    updatedAt: Date.now(),
    timestampManaus: nowManaus_(),
    price: roundNumber_(m1Metrics.bar.c, 8),
    candleM1StartUTC: new Date(m1Metrics.bar.t * 1000).toISOString(),
    m15: metricsSummary_(m15Metrics, m15Direction),
    m5: metricsSummary_(m5Metrics, m5Direction),
    m1: metricsSummary_(m1Metrics, 'WAITING'),
    dataQuality: m1Data.stats,
    continuityFix: VINSETT_CONTINUITY_FIX.VERSION,
    reason: reason
  };

  writeJsonProperty_(stateKey_(symbol), context);
  logAnalysis_(context);

  if ((!previousState || previousState.state !== 'ARMED') && state === 'ARMED') {
    emitNotification_('TREND_READY', symbol, '', buildTrendReadyMessage_(context));
  }

  return context;
}

function runEntryWatcherContinuityVinsettV1() {
  ensureSetup_();
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(1500)) {
    return { ok: false, skipped: 'LOCKED' };
  }

  try {
    const settlements = settlePendingTradesContinuity_();
    const entries = [];

    VINSETT.SYMBOLS.forEach(function(symbol) {
      if (readJsonProperty_(pendingKey_(symbol))) return;

      const context = readJsonProperty_(stateKey_(symbol));
      if (!context || context.state !== 'ARMED') return;

      if (Date.now() - Number(context.updatedAt || 0) > VINSETT.MAX_CONTEXT_AGE_MS) {
        logDiagnostic_('STALE_CONTEXT', symbol, 'ARMED context expired; waiting for next continuity scan.');
        return;
      }

      try {
        const entry = watchSymbolForEntryContinuity_(symbol, context);
        if (entry) entries.push(entry);
      } catch (error) {
        logDiagnostic_('CONTINUITY_ENTRY_ERROR', symbol, safeError_(error));
      }
    });

    const result = { settlements: settlements, newEntries: entries };
    console.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    lock.releaseLock();
  }
}

function watchSymbolForEntryContinuity_(symbol, context) {
  if (context.direction !== 'BUY' && context.direction !== 'SELL') return null;
  if (isLocked_(symbol, context.direction)) return null;

  const m1Data = buildContinuousM1Data_(symbol, VINSETT_CONTINUITY_FIX.M1_WATCH_CONTINUOUS_BARS);

  if (!m1Data.stats.dataQualityReady) {
    logDiagnostic_('ENTRY_BLOCKED_DATA_QUALITY', symbol, JSON.stringify(m1Data.stats));
    return null;
  }

  const m1 = m1Data.normalized;
  validateQuantity_(symbol, 'M1', m1, 60);

  const m1Metrics = calculateMetrics_(m1);
  const trigger = m1Trigger_(m1Metrics, context.direction);
  if (!trigger) return null;

  const score = technicalScore_(
    context.direction,
    context.m5.direction,
    m1Metrics,
    context.m5,
    context.m15,
    true
  );

  if (score < VINSETT.MIN_SIGNAL_SCORE) {
    logDiagnostic_('LOW_SCORE_TRIGGER', symbol, 'M1 trigger rejected with score ' + score + '.');
    return null;
  }

  const signalCandleT = m1Metrics.bar.t;
  const entryCandleT = signalCandleT + 60;
  const tradeId = buildTradeId_(symbol, context.direction, entryCandleT);

  const trade = {
    tradeId: tradeId,
    createdAtManaus: nowManaus_(),
    createdAtMs: Date.now(),
    symbol: symbol,
    direction: context.direction,
    technicalScore: score,
    signalCandleT: signalCandleT,
    entryCandleT: entryCandleT,
    signalPrice: roundNumber_(m1Metrics.bar.c, 8),
    outcome: 'PENDING',
    m15Adx: context.m15.adx,
    m5Adx: context.m5.adx,
    m1Adx: roundNumber_(m1Metrics.adx, 2),
    m15Direction: context.m15.direction,
    m5Direction: context.m5.direction,
    reason: 'M15 + M5 alinhados; M1 contínuo confirmou pullback e retomada.'
  };

  appendPendingTrade_(trade);
  writeJsonProperty_(pendingKey_(symbol), trade);
  lockStructure_(symbol, context.direction, signalCandleT);

  context.state = 'SIGNAL_SENT';
  context.updatedAt = Date.now();
  context.technicalScore = score;
  writeJsonProperty_(stateKey_(symbol), context);

  logSignal_(trade);
  emitNotification_('ENTRY_SIGNAL', symbol, tradeId, buildEntryMessage_(trade));
  return trade;
}

function settlePendingTradesContinuity_() {
  const settled = [];

  VINSETT.SYMBOLS.forEach(function(symbol) {
    const pending = readJsonProperty_(pendingKey_(symbol));
    if (!pending) return;

    try {
      const result = settleOneTradeContinuity_(pending);
      if (result) settled.push(result);
    } catch (error) {
      logDiagnostic_('CONTINUITY_SETTLEMENT_ERROR', symbol, safeError_(error));
    }
  });

  return settled;
}

function settleOneTradeContinuity_(trade) {
  const nowSec = Math.floor(Date.now() / 1000);
  const entryT = Number(trade.entryCandleT);

  if (nowSec < entryT + 60) return null;

  const entryBar = resolveEntryBarContinuity_(trade.symbol, entryT);
  if (!entryBar) return null;

  const outcome = evaluateOutcome_(trade.direction, entryBar.o, entryBar.c);
  const settledAt = nowManaus_();

  updateTradeSettlement_(
    trade.tradeId,
    roundNumber_(entryBar.o, 8),
    roundNumber_(entryBar.c, 8),
    outcome,
    settledAt
  );

  trade.entryPrice = roundNumber_(entryBar.o, 8);
  trade.exitPrice = roundNumber_(entryBar.c, 8);
  trade.outcome = outcome;
  trade.settledAtManaus = settledAt;
  trade.syntheticEntryCandle = !!entryBar.synthetic;

  deleteProperty_(pendingKey_(trade.symbol));

  const context = readJsonProperty_(stateKey_(trade.symbol));
  if (context) {
    context.state = 'LOCKED';
    context.updatedAt = Date.now();
    context.reason = 'Entrada simulada apurada; aguardando reset estrutural M5.';
    writeJsonProperty_(stateKey_(trade.symbol), context);
  }

  emitNotification_('TRADE_RESULT', trade.symbol, trade.tradeId, buildOutcomeMessage_(trade));
  return trade;
}

function resolveEntryBarContinuity_(symbol, entryT) {
  const raw = collectSparseCandlesContinuity_(symbol, '1m', 40, 60, entryT + 59);

  const exact = raw.find(function(bar) { return bar.t === entryT; });
  if (exact) {
    exact.synthetic = false;
    return exact;
  }

  let previous = null;
  raw.forEach(function(bar) {
    if (bar.t < entryT && (!previous || bar.t > previous.t)) previous = bar;
  });

  if (!previous) return null;

  return {
    t: entryT,
    o: previous.c,
    h: previous.c,
    l: previous.c,
    c: previous.c,
    v: 0,
    synthetic: true
  };
}

function buildContinuousM1Data_(symbol, continuousBars) {
  const raw = collectSparseCandlesContinuity_(
    symbol,
    '1m',
    VINSETT_CONTINUITY_FIX.M1_REAL_TARGET_BARS,
    60
  );

  return normalizeTimelineContinuity_(raw, 60, continuousBars, true);
}

function buildContinuousM15Data_(symbol) {
  const raw = collectSparseCandlesContinuity_(
    symbol,
    '15m',
    VINSETT_CONTINUITY_FIX.M15_REAL_TARGET_BARS,
    900
  );

  return normalizeTimelineContinuity_(
    raw,
    900,
    VINSETT_CONTINUITY_FIX.M15_CONTINUOUS_BARS,
    false
  );
}

function normalizeTimelineContinuity_(rawBars, intervalSec, targetBars, applyQualityGate) {
  if (!rawBars || !rawBars.length) {
    throw new Error('No raw candles available for continuity normalization.');
  }

  const raw = deduplicateByTimestamp_(rawBars).sort(function(a, b) { return a.t - b.t; });
  const byTime = {};

  raw.forEach(function(bar) {
    byTime[bar.t] = {
      t: bar.t,
      o: bar.o,
      h: bar.h,
      l: bar.l,
      c: bar.c,
      v: bar.v,
      synthetic: false
    };
  });

  const lastClosedStart = Math.floor(Date.now() / 1000 / intervalSec) * intervalSec - intervalSec;
  const rawLast = raw[raw.length - 1].t;
  const end = Math.max(rawLast, lastClosedStart);
  const earliestNeeded = end - (targetBars - 1) * intervalSec;

  let seed = null;
  for (let i = raw.length - 1; i >= 0; i--) {
    if (raw[i].t <= earliestNeeded) {
      seed = raw[i];
      break;
    }
  }
  if (!seed) seed = raw[0];

  let previousClose = seed.c;
  const normalized = [];

  for (let t = earliestNeeded; t <= end; t += intervalSec) {
    const real = byTime[t];

    if (real) {
      normalized.push(real);
      previousClose = real.c;
    } else {
      normalized.push({
        t: t,
        o: previousClose,
        h: previousClose,
        l: previousClose,
        c: previousClose,
        v: 0,
        synthetic: true
      });
    }
  }

  const sliced = normalized.slice(-targetBars);
  const syntheticBars = sliced.filter(function(bar) { return bar.synthetic; }).length;
  const recent60 = sliced.slice(-Math.min(60, sliced.length));
  const realLast60 = recent60.filter(function(bar) { return !bar.synthetic; }).length;
  const lastReal = raw[raw.length - 1];
  const lastRealAgeMin = Math.max(0, Math.floor((Date.now() / 1000 - (lastReal.t + intervalSec)) / 60));
  const syntheticPct = sliced.length ? roundNumber_(syntheticBars * 100 / sliced.length, 2) : 100;
  const realLast60Pct = recent60.length ? roundNumber_(realLast60 * 100 / recent60.length, 2) : 0;

  const stats = {
    syntheticBars: syntheticBars,
    syntheticPct: syntheticPct,
    realLast60: realLast60,
    realLast60Pct: realLast60Pct,
    lastRealAgeMin: lastRealAgeMin,
    lastRealUTC: new Date(lastReal.t * 1000).toISOString(),
    dataQualityReady: true
  };

  if (applyQualityGate) {
    stats.dataQualityReady =
      realLast60Pct >= VINSETT_CONTINUITY_FIX.MIN_REAL_M1_PCT_LAST_60 &&
      lastRealAgeMin <= VINSETT_CONTINUITY_FIX.MAX_LAST_REAL_AGE_MIN;
  }

  return { raw: raw, normalized: sliced, stats: stats };
}

function collectSparseCandlesContinuity_(symbol, resolution, targetBars, intervalSec, customTo) {
  validateSymbol_(symbol);

  let cursorTo = Number(customTo || Math.floor(Date.now() / 1000));
  let collected = [];
  let previousEarliest = null;
  let page = 0;

  while (collected.length < targetBars && page < VINSETT_CONTINUITY_FIX.MAX_PAGES) {
    const remaining = targetBars - collected.length;
    const countback = Math.min(
      VINSETT_CONTINUITY_FIX.PAGE_SIZE,
      Math.max(remaining + 2, 40)
    );

    const url =
      VINSETT.API_BASE +
      '/candles?symbol=' + encodeURIComponent(symbol) +
      '&resolution=' + encodeURIComponent(resolution) +
      '&to=' + cursorTo +
      '&countback=' + countback;

    let batch = normalizeCandlesResponse_(fetchJson_(url), symbol);
    batch = closedCandlesOnly_(batch, intervalSec);

    if (!batch.length) break;

    const earliest = batch[0].t;
    if (previousEarliest !== null && earliest >= previousEarliest) {
      throw new Error(symbol + ' ' + resolution + ': continuity pagination did not advance.');
    }

    collected = deduplicateByTimestamp_(collected.concat(batch));
    previousEarliest = earliest;
    cursorTo = earliest - intervalSec;
    page++;
  }

  if (collected.length > targetBars) {
    collected = collected.slice(collected.length - targetBars);
  }

  logDiagnostic_(
    'CONTINUITY_COLLECTION',
    symbol,
    JSON.stringify({
      resolution: resolution,
      targetRealBars: targetBars,
      receivedRealBars: collected.length,
      pages: page
    })
  );

  return collected;
}

function installAutomationContinuityVinsettV1() {
  ensureSetup_();
  removeAutomationContinuityVinsettV1();

  ScriptApp.newTrigger(VINSETT_CONTINUITY_FIX.WATCH_HANDLER)
    .timeBased()
    .everyMinutes(1)
    .create();

  ScriptApp.newTrigger(VINSETT_CONTINUITY_FIX.SCAN_HANDLER)
    .timeBased()
    .everyMinutes(5)
    .create();

  ScriptApp.newTrigger('generatePreviousWeekReportVinsettV1')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(8)
    .create();

  ScriptApp.newTrigger('generatePreviousMonthReportVinsettV1')
    .timeBased()
    .onMonthDay(1)
    .atHour(8)
    .create();

  const result = {
    ok: true,
    version: VINSETT_CONTINUITY_FIX.VERSION,
    scanHandler: VINSETT_CONTINUITY_FIX.SCAN_HANDLER,
    watchHandler: VINSETT_CONTINUITY_FIX.WATCH_HANDLER
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}

function removeAutomationContinuityVinsettV1() {
  const removableHandlers = [
    'runMarketScanVinsettV1',
    'runMarketScanSafeVinsettV1',
    'runMarketScanContinuityVinsettV1',
    'runEntryWatcherVinsettV1',
    'runEntryWatcherContinuityVinsettV1',
    'generatePreviousWeekReportVinsettV1',
    'generatePreviousMonthReportVinsettV1'
  ];

  let removed = 0;

  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (removableHandlers.indexOf(trigger.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });

  return { ok: true, removed: removed };
}
