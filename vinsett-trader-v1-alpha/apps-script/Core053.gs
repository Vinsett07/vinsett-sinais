/**
 * VINSETT Trader V1.0 Alpha — Core 0.5.3 Robust ADX
 *
 * Requires:
 * - Code.gs (Core 0.5 base)
 * - ContinuityFix.gs (Core 0.5.2 continuity layer)
 *
 * Purpose:
 * - Keep the existing strategy thresholds unchanged.
 * - Make DMI/ADX robust when M1 contains many flat/synthetic candles.
 * - Keep VWAP finite when a rolling window has zero traded volume.
 * - Provide isolated 0.5.3 scan/watcher/automation handlers.
 */

const VINSETT_CORE_053 = Object.freeze({
  VERSION: '0.5.3-ROBUST-ADX',
  SCAN_HANDLER: 'runMarketScanCore053VinsettV1',
  WATCH_HANDLER: 'runEntryWatcherCore053VinsettV1',
  MIN_M1: 80,
  MIN_M5: 60,
  MIN_M15: 60
});

function testCore053IndicatorsVinsettV1() {
  const flat = buildTestBars053_('FLAT', 160);
  const trend = buildTestBars053_('TREND', 160);
  const sparse = buildTestBars053_('SPARSE', 160);

  const flatMetrics = calculateMetrics053_(flat);
  const trendMetrics = calculateMetrics053_(trend);
  const sparseMetrics = calculateMetrics053_(sparse);

  assertFiniteMetrics053_('FLAT', flatMetrics);
  assertFiniteMetrics053_('TREND', trendMetrics);
  assertFiniteMetrics053_('SPARSE', sparseMetrics);

  if (flatMetrics.adx !== 0 || flatMetrics.plusDI !== 0 || flatMetrics.minusDI !== 0) {
    throw new Error('Core 0.5.3 self-test failed: flat series must produce ADX/+DI/-DI = 0.');
  }

  const result = {
    ok: true,
    version: VINSETT_CORE_053.VERSION,
    tests: {
      flat: metricsSnapshot053_(flatMetrics),
      trend: metricsSnapshot053_(trendMetrics),
      sparse: metricsSnapshot053_(sparseMetrics)
    }
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}

function diagnoseCore053VinsettV1() {
  ensureSetup_();

  const assets = [];

  VINSETT.SYMBOLS.forEach(function(symbol) {
    try {
      assets.push(diagnoseSymbol053_(symbol));
    } catch (error) {
      assets.push({
        symbol: symbol,
        historyReady: false,
        indicatorsReady: false,
        dataQualityReady: false,
        error: safeError_(error)
      });
    }
  });

  const output = {
    version: VINSETT_CORE_053.VERSION,
    allHistoryReady: assets.every(function(item) { return item.historyReady === true; }),
    allIndicatorsReady: assets.every(function(item) { return item.indicatorsReady === true; }),
    allDataQualityReady: assets.every(function(item) { return item.dataQualityReady === true; }),
    readyForAutomation: assets.every(function(item) {
      return item.historyReady === true && item.indicatorsReady === true;
    }),
    assets: assets
  };

  console.log(JSON.stringify(output, null, 2));
  return output;
}

function diagnoseSymbol053_(symbol) {
  validateSymbol_(symbol);

  const m1Data = buildContinuousM1Data_(symbol, VINSETT_CONTINUITY_FIX.M1_CONTINUOUS_BARS);
  const m1 = m1Data.normalized;
  const m5 = aggregateCandles_(m1, 300);
  const m15Data = buildContinuousM15Data_(symbol);
  const m15 = m15Data.normalized;

  const historyReady =
    m1.length >= VINSETT_CORE_053.MIN_M1 &&
    m5.length >= VINSETT_CORE_053.MIN_M5 &&
    m15.length >= VINSETT_CORE_053.MIN_M15;

  if (!historyReady) {
    return {
      symbol: symbol,
      historyReady: false,
      indicatorsReady: false,
      dataQualityReady: m1Data.stats.dataQualityReady,
      m1: m1.length,
      m5: m5.length,
      m15: m15.length
    };
  }

  const m1Metrics = calculateMetrics053_(m1);
  const m5Metrics = calculateMetrics053_(m5);
  const m15Metrics = calculateMetrics053_(m15);

  const result = {
    symbol: symbol,
    historyReady: true,
    indicatorsReady: true,
    dataQualityReady: m1Data.stats.dataQualityReady,
    realM1Last60Pct: m1Data.stats.realLast60Pct,
    lastRealM1AgeMin: m1Data.stats.lastRealAgeMin,
    m1: {
      adx: roundNumber_(m1Metrics.adx, 2),
      plusDI: roundNumber_(m1Metrics.plusDI, 2),
      minusDI: roundNumber_(m1Metrics.minusDI, 2),
      vwap: roundNumber_(m1Metrics.vwap, 8)
    },
    m5: {
      adx: roundNumber_(m5Metrics.adx, 2),
      plusDI: roundNumber_(m5Metrics.plusDI, 2),
      minusDI: roundNumber_(m5Metrics.minusDI, 2),
      vwap: roundNumber_(m5Metrics.vwap, 8)
    },
    m15: {
      adx: roundNumber_(m15Metrics.adx, 2),
      plusDI: roundNumber_(m15Metrics.plusDI, 2),
      minusDI: roundNumber_(m15Metrics.minusDI, 2),
      vwap: roundNumber_(m15Metrics.vwap, 8)
    }
  };

  logDiagnostic_('CORE_053_DIAGNOSTIC', symbol, JSON.stringify(result));
  return result;
}

function runMarketScanCore053VinsettV1() {
  ensureSetup_();
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(1500)) {
    return { ok: false, skipped: 'LOCKED' };
  }

  try {
    const output = [];

    VINSETT.SYMBOLS.forEach(function(symbol) {
      try {
        output.push(scanSymbolContext053_(symbol));
      } catch (error) {
        const failure = {
          symbol: symbol,
          state: 'ERROR',
          direction: 'NO_TRADE',
          reason: safeError_(error),
          core: VINSETT_CORE_053.VERSION
        };

        output.push(failure);
        logDiagnostic_('CORE_053_SCAN_ERROR', symbol, failure.reason);
      }
    });

    console.log(JSON.stringify(output, null, 2));
    return output;
  } finally {
    lock.releaseLock();
  }
}

function scanSymbolContext053_(symbol) {
  const previousState = readJsonProperty_(stateKey_(symbol));

  const m1Data = buildContinuousM1Data_(symbol, VINSETT_CONTINUITY_FIX.M1_CONTINUOUS_BARS);
  const m1 = m1Data.normalized;
  const m5 = aggregateCandles_(m1, 300);
  const m15Data = buildContinuousM15Data_(symbol);
  const m15 = m15Data.normalized;

  validateQuantity_(symbol, 'M1', m1, VINSETT_CORE_053.MIN_M1);
  validateQuantity_(symbol, 'M5', m5, VINSETT_CORE_053.MIN_M5);
  validateQuantity_(symbol, 'M15', m15, VINSETT_CORE_053.MIN_M15);

  const m1Metrics = calculateMetrics053_(m1);
  const m5Metrics = calculateMetrics053_(m5);
  const m15Metrics = calculateMetrics053_(m15);

  const m15Direction = classifyTrend_(m15Metrics, VINSETT.ADX_M15_MIN);
  const m5Direction = classifyTrend_(m5Metrics, VINSETT.ADX_M5_MIN);

  updateStructuralReset_(symbol, m5Direction, m5Metrics);

  let state = 'NEUTRAL';
  let direction = 'NO_TRADE';
  let reason = 'M15 sem tendência qualificada.';

  if (!m1Data.stats.dataQualityReady) {
    state = 'DATA_QUALITY_BLOCKED';
    direction = 'NO_TRADE';
    reason = 'Histórico disponível, mas a atividade M1 recente está abaixo do filtro mínimo de qualidade.';
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
    core: VINSETT_CORE_053.VERSION,
    reason: reason
  };

  writeJsonProperty_(stateKey_(symbol), context);
  logAnalysis_(context);

  if ((!previousState || previousState.state !== 'ARMED') && state === 'ARMED') {
    emitNotification_('TREND_READY', symbol, '', buildTrendReadyMessage_(context));
  }

  return context;
}

function runEntryWatcherCore053VinsettV1() {
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
        logDiagnostic_('CORE_053_STALE_CONTEXT', symbol, 'ARMED context expired; waiting for next scan.');
        return;
      }

      try {
        const entry = watchSymbolForEntry053_(symbol, context);
        if (entry) entries.push(entry);
      } catch (error) {
        logDiagnostic_('CORE_053_ENTRY_ERROR', symbol, safeError_(error));
      }
    });

    const result = {
      core: VINSETT_CORE_053.VERSION,
      settlements: settlements,
      newEntries: entries
    };

    console.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    lock.releaseLock();
  }
}

function watchSymbolForEntry053_(symbol, context) {
  if (context.direction !== 'BUY' && context.direction !== 'SELL') return null;
  if (isLocked_(symbol, context.direction)) return null;

  const m1Data = buildContinuousM1Data_(symbol, VINSETT_CONTINUITY_FIX.M1_WATCH_CONTINUOUS_BARS);

  if (!m1Data.stats.dataQualityReady) {
    logDiagnostic_('CORE_053_ENTRY_BLOCKED_DATA_QUALITY', symbol, JSON.stringify(m1Data.stats));
    return null;
  }

  const m1 = m1Data.normalized;
  validateQuantity_(symbol, 'M1', m1, 60);

  const m1Metrics = calculateMetrics053_(m1);

  if (!Number.isFinite(m1Metrics.adx)) {
    logDiagnostic_('CORE_053_ENTRY_BLOCKED_ADX', symbol, 'M1 ADX is not finite.');
    return null;
  }

  const trigger = m1Trigger_(m1Metrics, context.direction);
  if (!trigger) return null;

  const score = technicalScore_(context.direction, context.m5.direction, m1Metrics, context.m5, context.m15, true);

  if (score < VINSETT.MIN_SIGNAL_SCORE) {
    logDiagnostic_('CORE_053_LOW_SCORE', symbol, 'M1 trigger rejected with score ' + score + '.');
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
    reason: 'Core 0.5.3: M15 + M5 alinhados; M1 confirmou pullback e retomada com ADX robusto.'
  };

  appendPendingTrade_(trade);
  writeJsonProperty_(pendingKey_(symbol), trade);
  lockStructure_(symbol, context.direction, signalCandleT);

  context.state = 'SIGNAL_SENT';
  context.updatedAt = Date.now();
  context.technicalScore = score;
  context.core = VINSETT_CORE_053.VERSION;
  writeJsonProperty_(stateKey_(symbol), context);

  logSignal_(trade);
  emitNotification_('ENTRY_SIGNAL', symbol, tradeId, buildEntryMessage_(trade));

  return trade;
}

function statusCore053VinsettV1() {
  const states = {};
  const pending = {};
  const locks = {};

  VINSETT.SYMBOLS.forEach(function(symbol) {
    states[symbol] = readJsonProperty_(stateKey_(symbol));
    pending[symbol] = readJsonProperty_(pendingKey_(symbol));
    locks[symbol] = readJsonProperty_(lockKey_(symbol));
  });

  const handlers = ScriptApp.getProjectTriggers().map(function(trigger) {
    return trigger.getHandlerFunction();
  });

  const result = {
    app: VINSETT.APP,
    version: VINSETT.VERSION,
    effectiveCore: VINSETT_CORE_053.VERSION,
    mode: VINSETT.MODE,
    states: states,
    pendingTrades: pending,
    locks: locks,
    installedTriggers: handlers.filter(function(handler) {
      return [
        VINSETT_CORE_053.SCAN_HANDLER,
        VINSETT_CORE_053.WATCH_HANDLER,
        'generatePreviousWeekReportVinsettV1',
        'generatePreviousMonthReportVinsettV1'
      ].indexOf(handler) !== -1;
    }),
    automaticOrders: false,
    geminiConnected: false,
    telegramConnected: false
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}

function installAutomationCore053VinsettV1() {
  ensureSetup_();
  removeAutomationCore053VinsettV1();

  ScriptApp.newTrigger(VINSETT_CORE_053.WATCH_HANDLER).timeBased().everyMinutes(1).create();
  ScriptApp.newTrigger(VINSETT_CORE_053.SCAN_HANDLER).timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('generatePreviousWeekReportVinsettV1').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).create();
  ScriptApp.newTrigger('generatePreviousMonthReportVinsettV1').timeBased().onMonthDay(1).atHour(8).create();

  const result = {
    ok: true,
    core: VINSETT_CORE_053.VERSION,
    scanHandler: VINSETT_CORE_053.SCAN_HANDLER,
    watchHandler: VINSETT_CORE_053.WATCH_HANDLER,
    automaticOrders: false
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}

function removeAutomationCore053VinsettV1() {
  const removableHandlers = [
    'runMarketScanVinsettV1',
    'runMarketScanSafeVinsettV1',
    'runMarketScanContinuityVinsettV1',
    'runMarketScanCore053VinsettV1',
    'runEntryWatcherVinsettV1',
    'runEntryWatcherContinuityVinsettV1',
    'runEntryWatcherCore053VinsettV1',
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

function calculateMetrics053_(bars) {
  if (!Array.isArray(bars) || bars.length < 60) {
    throw new Error('Core 0.5.3: at least 60 candles are required for metrics.');
  }

  const closes = bars.map(function(bar) { return bar.c; });
  const ema9 = emaSeries_(closes, VINSETT.EMA_FAST);
  const ema21 = emaSeries_(closes, VINSETT.EMA_MID);
  const ema50 = emaSeries_(closes, VINSETT.EMA_SLOW);
  const vwap = rollingVwapSeries053_(bars, VINSETT.VWAP_PERIOD);
  const dmi = dmiAdxSeries053_(bars, VINSETT.DMI_PERIOD);

  const index = bars.length - 1;
  const previousIndex = index - 1;
  const slopeIndex = Math.max(0, index - 3);

  const required = [
    ema9[index], ema21[index], ema50[index], ema9[previousIndex], ema21[previousIndex],
    vwap[index], vwap[previousIndex], dmi.adx[index], dmi.plusDI[index], dmi.minusDI[index]
  ];

  if (!required.every(Number.isFinite)) {
    throw new Error('Core 0.5.3: latest indicator values are not finite.');
  }

  return {
    bar: bars[index],
    prevBar: bars[previousIndex],
    ema9: ema9[index],
    ema21: ema21[index],
    ema50: ema50[index],
    ema9Prev: ema9[previousIndex],
    ema21Prev: ema21[previousIndex],
    ema50Prev: ema50[previousIndex],
    ema9SlopeRef: ema9[slopeIndex],
    ema21SlopeRef: ema21[slopeIndex],
    vwap: vwap[index],
    vwapPrev: vwap[previousIndex],
    adx: dmi.adx[index],
    plusDI: dmi.plusDI[index],
    minusDI: dmi.minusDI[index]
  };
}

function rollingVwapSeries053_(bars, period) {
  const output = new Array(bars.length).fill(null);
  const pv = new Array(bars.length).fill(0);

  let sumPV = 0;
  let sumV = 0;

  for (let i = 0; i < bars.length; i++) {
    const typical = (bars[i].h + bars[i].l + bars[i].c) / 3;
    const currentPV = typical * bars[i].v;

    pv[i] = currentPV;
    sumPV += currentPV;
    sumV += bars[i].v;

    if (i >= period) {
      sumPV -= pv[i - period];
      sumV -= bars[i - period].v;
    }

    if (i >= period - 1) {
      output[i] = sumV > 0 ? sumPV / sumV : bars[i].c;
    }
  }

  return output;
}

function dmiAdxSeries053_(bars, period) {
  const size = bars.length;
  const plusDI = new Array(size).fill(null);
  const minusDI = new Array(size).fill(null);
  const adx = new Array(size).fill(null);
  const tr = new Array(size).fill(0);
  const plusDM = new Array(size).fill(0);
  const minusDM = new Array(size).fill(0);
  const dx = new Array(size).fill(null);

  if (size < period * 2) {
    return { plusDI: plusDI, minusDI: minusDI, adx: adx };
  }

  for (let i = 1; i < size; i++) {
    const upMove = bars[i].h - bars[i - 1].h;
    const downMove = bars[i - 1].l - bars[i].l;

    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;

    tr[i] = Math.max(
      bars[i].h - bars[i].l,
      Math.abs(bars[i].h - bars[i - 1].c),
      Math.abs(bars[i].l - bars[i - 1].c)
    );
  }

  let smoothTR = 0;
  let smoothPlus = 0;
  let smoothMinus = 0;

  for (let i = 1; i <= period; i++) {
    smoothTR += tr[i];
    smoothPlus += plusDM[i];
    smoothMinus += minusDM[i];
  }

  for (let i = period; i < size; i++) {
    if (i > period) {
      smoothTR = smoothTR - smoothTR / period + tr[i];
      smoothPlus = smoothPlus - smoothPlus / period + plusDM[i];
      smoothMinus = smoothMinus - smoothMinus / period + minusDM[i];
    }

    if (smoothTR > 0) {
      plusDI[i] = 100 * smoothPlus / smoothTR;
      minusDI[i] = 100 * smoothMinus / smoothTR;
    } else {
      plusDI[i] = 0;
      minusDI[i] = 0;
    }

    const denominator = plusDI[i] + minusDI[i];
    dx[i] = denominator > 0
      ? 100 * Math.abs(plusDI[i] - minusDI[i]) / denominator
      : 0;
  }

  const firstAdxIndex = period * 2 - 1;
  let dxSum = 0;

  for (let i = period; i <= firstAdxIndex; i++) {
    dxSum += dx[i];
  }

  adx[firstAdxIndex] = dxSum / period;

  for (let i = firstAdxIndex + 1; i < size; i++) {
    adx[i] = (adx[i - 1] * (period - 1) + dx[i]) / period;
  }

  return { plusDI: plusDI, minusDI: minusDI, adx: adx };
}

function buildTestBars053_(mode, count) {
  const bars = [];
  const startT = 1700000000;
  let close = 100;

  for (let i = 0; i < count; i++) {
    let open = close;
    let high = close;
    let low = close;
    let volume = 0;

    if (mode === 'TREND') {
      open = close;
      close = close + 0.25;
      high = close + 0.05;
      low = open - 0.05;
      volume = 10;
    } else if (mode === 'SPARSE') {
      if (i % 4 === 0) {
        open = close;
        close = close + (i % 8 === 0 ? 0.18 : -0.07);
        high = Math.max(open, close) + 0.02;
        low = Math.min(open, close) - 0.02;
        volume = 3;
      } else {
        open = close;
        high = close;
        low = close;
        volume = 0;
      }
    }

    bars.push({
      t: startT + i * 60,
      o: open,
      h: high,
      l: low,
      c: close,
      v: volume,
      synthetic: volume === 0
    });
  }

  return bars;
}

function assertFiniteMetrics053_(name, metrics) {
  const values = [metrics.ema9, metrics.ema21, metrics.ema50, metrics.vwap, metrics.adx, metrics.plusDI, metrics.minusDI];

  if (!values.every(Number.isFinite)) {
    throw new Error('Core 0.5.3 self-test failed for ' + name + ': non-finite metric detected.');
  }
}

function metricsSnapshot053_(metrics) {
  return {
    adx: Math.round(metrics.adx * 100) / 100,
    plusDI: Math.round(metrics.plusDI * 100) / 100,
    minusDI: Math.round(metrics.minusDI * 100) / 100,
    vwap: Math.round(metrics.vwap * 100000000) / 100000000
  };
}
