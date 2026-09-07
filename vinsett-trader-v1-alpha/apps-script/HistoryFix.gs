/**
 * VINSETT Trader V1.0 Alpha — Core 0.5.1 History Fix
 * Sidecar hotfix for Core 0.5.
 * Keeps technical minimums unchanged and increases historical safety margin.
 */

const VINSETT_HISTORY_FIX = Object.freeze({
  VERSION: '0.5.1-HISTORY-FIX',
  M1_TARGET_BARS: 900,
  M15_TARGET_BARS: 120,
  PAGE_SIZE: 200,
  MAX_PAGES: 8,
  MIN_M1: 80,
  MIN_M5: 60,
  MIN_M15: 60,
  SAFE_SCAN_HANDLER: 'runMarketScanSafeVinsettV1'
});

function diagnoseHistoryFixVinsettV1() {
  ensureSetup_();

  const results = [];

  VINSETT.SYMBOLS.forEach(function(symbol) {
    try {
      results.push(diagnoseSymbolHistoryFix_(symbol));
    } catch (error) {
      const failure = {
        symbol: symbol,
        historySufficient: false,
        error: safeError_(error)
      };

      logDiagnostic_(
        'HISTORY_FIX_DIAGNOSTIC_ERROR',
        symbol,
        JSON.stringify(failure)
      );

      results.push(failure);
    }
  });

  const allReady = results.every(function(item) {
    return item.historySufficient === true;
  });

  const output = {
    version: VINSETT_HISTORY_FIX.VERSION,
    allReady: allReady,
    assets: results
  };

  console.log(JSON.stringify(output, null, 2));
  return output;
}

function diagnoseSymbolHistoryFix_(symbol) {
  validateSymbol_(symbol);

  const m1 = fetchHistoryCandlesFix_(
    symbol,
    '1m',
    VINSETT_HISTORY_FIX.M1_TARGET_BARS,
    60
  );

  const m5 = aggregateCandles_(m1, 300);

  const m15 = fetchHistoryCandlesFix_(
    symbol,
    '15m',
    VINSETT_HISTORY_FIX.M15_TARGET_BARS,
    900
  );

  const result = {
    symbol: symbol,
    m1: m1.length,
    m5: m5.length,
    m15: m15.length,
    m1Gaps: countGaps_(m1, 60),
    m1Ready: m1.length >= VINSETT_HISTORY_FIX.MIN_M1,
    m5Ready: m5.length >= VINSETT_HISTORY_FIX.MIN_M5,
    m15Ready: m15.length >= VINSETT_HISTORY_FIX.MIN_M15,
    lastM1UTC: m1.length
      ? new Date(m1[m1.length - 1].t * 1000).toISOString()
      : null,
    lastM15UTC: m15.length
      ? new Date(m15[m15.length - 1].t * 1000).toISOString()
      : null
  };

  result.historySufficient =
    result.m1Ready &&
    result.m5Ready &&
    result.m15Ready;

  logDiagnostic_(
    'HISTORY_FIX_DIAGNOSTIC',
    symbol,
    JSON.stringify(result)
  );

  return result;
}

function runMarketScanSafeVinsettV1() {
  ensureSetup_();

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(1500)) {
    return {
      ok: false,
      skipped: 'LOCKED'
    };
  }

  try {
    const output = [];

    VINSETT.SYMBOLS.forEach(function(symbol) {
      try {
        output.push(scanSymbolContextSafe_(symbol));
      } catch (error) {
        const failure = {
          symbol: symbol,
          state: 'ERROR',
          direction: 'NO_TRADE',
          reason: safeError_(error)
        };

        output.push(failure);

        logDiagnostic_(
          'SAFE_SCAN_ERROR',
          symbol,
          failure.reason
        );
      }
    });

    console.log(JSON.stringify(output, null, 2));
    return output;

  } finally {
    lock.releaseLock();
  }
}

function scanSymbolContextSafe_(symbol) {
  const previousState = readJsonProperty_(stateKey_(symbol));

  const m1 = fetchHistoryCandlesFix_(
    symbol,
    '1m',
    VINSETT_HISTORY_FIX.M1_TARGET_BARS,
    60
  );

  const m5 = aggregateCandles_(m1, 300);

  const m15 = fetchHistoryCandlesFix_(
    symbol,
    '15m',
    VINSETT_HISTORY_FIX.M15_TARGET_BARS,
    900
  );

  validateQuantity_(symbol, 'M1', m1, VINSETT_HISTORY_FIX.MIN_M1);
  validateQuantity_(symbol, 'M5', m5, VINSETT_HISTORY_FIX.MIN_M5);
  validateQuantity_(symbol, 'M15', m15, VINSETT_HISTORY_FIX.MIN_M15);
  validateM1Freshness_(symbol, m1);

  const m1Metrics = calculateMetrics_(m1);
  const m5Metrics = calculateMetrics_(m5);
  const m15Metrics = calculateMetrics_(m15);

  const m15Direction = classifyTrend_(
    m15Metrics,
    VINSETT.ADX_M15_MIN
  );

  const m5Direction = classifyTrend_(
    m5Metrics,
    VINSETT.ADX_M5_MIN
  );

  updateStructuralReset_(symbol, m5Direction, m5Metrics);

  let state = 'NEUTRAL';
  let direction = 'NO_TRADE';
  let reason = 'M15 sem tendência qualificada.';

  if (m15Direction !== 'NEUTRAL') {
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
  } else if (
    direction !== 'NO_TRADE' &&
    isLocked_(symbol, direction)
  ) {
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
    reason: reason,
    historyFix: VINSETT_HISTORY_FIX.VERSION
  };

  writeJsonProperty_(stateKey_(symbol), context);
  logAnalysis_(context);

  if (
    (!previousState || previousState.state !== 'ARMED') &&
    state === 'ARMED'
  ) {
    emitNotification_(
      'TREND_READY',
      symbol,
      '',
      buildTrendReadyMessage_(context)
    );
  }

  return context;
}

function installAutomationSafeVinsettV1() {
  ensureSetup_();
  removeAutomationSafeVinsettV1();

  ScriptApp
    .newTrigger('runEntryWatcherVinsettV1')
    .timeBased()
    .everyMinutes(1)
    .create();

  ScriptApp
    .newTrigger(VINSETT_HISTORY_FIX.SAFE_SCAN_HANDLER)
    .timeBased()
    .everyMinutes(5)
    .create();

  ScriptApp
    .newTrigger('generatePreviousWeekReportVinsettV1')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(8)
    .create();

  ScriptApp
    .newTrigger('generatePreviousMonthReportVinsettV1')
    .timeBased()
    .onMonthDay(1)
    .atHour(8)
    .create();

  const result = {
    ok: true,
    version: VINSETT_HISTORY_FIX.VERSION,
    handlers: [
      'runEntryWatcherVinsettV1',
      VINSETT_HISTORY_FIX.SAFE_SCAN_HANDLER,
      'generatePreviousWeekReportVinsettV1',
      'generatePreviousMonthReportVinsettV1'
    ]
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}

function removeAutomationSafeVinsettV1() {
  const removableHandlers = [
    'runMarketScanVinsettV1',
    'runMarketScanSafeVinsettV1',
    'runEntryWatcherVinsettV1',
    'generatePreviousWeekReportVinsettV1',
    'generatePreviousMonthReportVinsettV1'
  ];

  let removed = 0;

  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (
      removableHandlers.indexOf(
        trigger.getHandlerFunction()
      ) !== -1
    ) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });

  return {
    ok: true,
    removed: removed
  };
}

function fetchHistoryCandlesFix_(
  symbol,
  resolution,
  targetBars,
  intervalSec
) {
  validateSymbol_(symbol);

  let cursorTo = Math.floor(Date.now() / 1000);
  let collected = [];
  let previousEarliest = null;
  let page = 0;

  while (
    collected.length < targetBars &&
    page < VINSETT_HISTORY_FIX.MAX_PAGES
  ) {
    const remaining = targetBars - collected.length;

    const countback = Math.min(
      VINSETT_HISTORY_FIX.PAGE_SIZE,
      Math.max(remaining + 2, 60)
    );

    const url =
      VINSETT.API_BASE +
      '/candles?symbol=' +
      encodeURIComponent(symbol) +
      '&resolution=' +
      encodeURIComponent(resolution) +
      '&to=' +
      cursorTo +
      '&countback=' +
      countback;

    let batch = normalizeCandlesResponse_(
      fetchJson_(url),
      symbol
    );

    batch = closedCandlesOnly_(
      batch,
      intervalSec
    );

    if (!batch.length) {
      break;
    }

    const earliest = batch[0].t;

    if (
      previousEarliest !== null &&
      earliest >= previousEarliest
    ) {
      throw new Error(
        symbol +
        ' ' +
        resolution +
        ': history pagination did not advance.'
      );
    }

    collected = deduplicateByTimestamp_(
      collected.concat(batch)
    );

    previousEarliest = earliest;
    cursorTo = earliest - intervalSec;
    page++;
  }

  if (collected.length > targetBars) {
    collected = collected.slice(
      collected.length - targetBars
    );
  }

  logDiagnostic_(
    'HISTORY_FIX_COLLECTION',
    symbol,
    JSON.stringify({
      resolution: resolution,
      requestedBars: targetBars,
      receivedBars: collected.length,
      pages: page
    })
  );

  return collected;
}
