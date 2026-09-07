/**
 * VINSETT Trader V1.0 Alpha — Core 0.4
 *
 * Analysis/simulation only.
 * No automatic orders.
 *
 * Source:
 * Mercado Bitcoin API v4 public market data.
 *
 * Assets:
 * BTC-BRL
 * ETH-BRL
 * SOL-BRL
 *
 * Strategy:
 * Native M15 context
 * M5 built from M1
 * M1 entry trigger
 *
 * Indicators:
 * EMA 9 / 21 / 50
 * ADX / DMI 14
 * Rolling VWAP 50
 */

const VINSETT = Object.freeze({

  APP: 'VINSETT Trader',

  VERSION: '1.0-ALPHA',

  CORE: '0.4',

  MODE: 'ANALYSIS_NO_ORDERS',

  TIME_ZONE: 'America/Manaus',

  API_BASE:
    'https://api.mercadobitcoin.net/api/v4',

  SYMBOLS: Object.freeze([
    'BTC-BRL',
    'ETH-BRL',
    'SOL-BRL'
  ]),

  M1_TARGET_BARS: 600,

  M15_TARGET_BARS: 120,

  PAGE_SIZE: 200,

  MAX_PAGES: 8,

  REQUEST_GAP_MS: 1150,

  MAX_HTTP_RETRIES: 2,

  HTTP_RETRY_BASE_MS: 1500,

  MAX_M1_STALENESS_SEC: 300,

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

  SHEET_PROP:
    'VINSETT_V1_SHEET_ID'
});


let vinsettLastRequestAt_ = 0;


// ================================================================
// SETUP
// ================================================================

function setupVinsettTraderV1() {

  const props =
    PropertiesService
      .getScriptProperties();


  let spreadsheetId =
    props.getProperty(
      VINSETT.SHEET_PROP
    );


  let spreadsheet = null;


  if (spreadsheetId) {

    try {

      spreadsheet =
        SpreadsheetApp.openById(
          spreadsheetId
        );

    } catch (error) {

      spreadsheetId = null;
    }
  }


  if (!spreadsheetId) {

    spreadsheet =
      SpreadsheetApp.create(
        'VINSETT Trader V1.0 Alpha'
      );


    spreadsheetId =
      spreadsheet.getId();


    props.setProperty(
      VINSETT.SHEET_PROP,
      spreadsheetId
    );
  }


  ensureSheet_(
    spreadsheet,
    'Analyses',
    [

      'Timestamp_Manaus',

      'Symbol',

      'State',

      'Direction',

      'Technical_Score',

      'Price',

      'M15_Direction',

      'M15_ADX',

      'M15_+DI',

      'M15_-DI',

      'M15_EMA9',

      'M15_EMA21',

      'M15_EMA50',

      'M15_VWAP',

      'M5_Direction',

      'M5_ADX',

      'M5_+DI',

      'M5_-DI',

      'M5_EMA9',

      'M5_EMA21',

      'M5_EMA50',

      'M5_VWAP',

      'M1_Direction',

      'M1_ADX',

      'M1_+DI',

      'M1_-DI',

      'M1_EMA9',

      'M1_EMA21',

      'M1_EMA50',

      'M1_VWAP',

      'M1_Candle_Start_UTC',

      'Reason'
    ]
  );


  ensureSheet_(
    spreadsheet,
    'Signals',
    [

      'Timestamp_Manaus',

      'Symbol',

      'Direction',

      'Technical_Score',

      'Price',

      'M15_ADX',

      'M5_ADX',

      'M1_ADX',

      'M1_Candle_Start_UTC',

      'Reason'
    ]
  );


  ensureSheet_(
    spreadsheet,
    'Diagnostics',
    [

      'Timestamp_Manaus',

      'Type',

      'Symbol',

      'Detail'
    ]
  );


  const readme =
    ensureSheet_(
      spreadsheet,
      'README',
      [
        'Field',
        'Value'
      ]
    );


  readme.clearContents();


  readme
    .getRange(
      1,
      1,
      14,
      2
    )
    .setValues([

      [
        'Field',
        'Value'
      ],

      [
        'Aplicativo',
        VINSETT.APP
      ],

      [
        'Versão',
        VINSETT.VERSION
      ],

      [
        'Core',
        VINSETT.CORE
      ],

      [
        'Modo',
        'ANÁLISE / SIMULAÇÃO — nenhuma ordem é enviada'
      ],

      [
        'Fonte',
        'Mercado Bitcoin API v4'
      ],

      [
        'Ativos',
        VINSETT.SYMBOLS.join(', ')
      ],

      [
        'Timeframes',
        'M15 nativo -> M5 construído do M1 -> gatilho M1'
      ],

      [
        'Indicadores',
        'EMA 9/21/50 + ADX/DMI 14 + VWAP rolling 50'
      ],

      [
        'M15',
        'Contexto e direção principal'
      ],

      [
        'M5',
        'Confirmação da estrutura'
      ],

      [
        'M1',
        'Somente gatilho após pullback e retomada'
      ],

      [
        'Regra',
        'Qualidade > quantidade; NO_TRADE é decisão válida'
      ],

      [
        'Aviso',
        'Technical Score não representa probabilidade de lucro'
      ]
    ]);


  readme.setFrozenRows(1);


  const result = {

    ok: true,

    app:
      VINSETT.APP,

    version:
      VINSETT.VERSION,

    core:
      VINSETT.CORE,

    spreadsheetId:
      spreadsheetId,

    spreadsheetUrl:
      spreadsheet.getUrl()
  };


  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );


  return result;
}


// ================================================================
// API TEST
// ================================================================

function testMercadoBitcoinVinsettV1() {

  ensureSetup_();


  const url =
    VINSETT.API_BASE
    +
    '/symbols?symbols='
    +
    encodeURIComponent(
      VINSETT.SYMBOLS.join(',')
    );


  const data =
    fetchJson_(url);


  const result = {

    ok: true,

    source:
      'Mercado Bitcoin API v4',

    requestedSymbols:
      VINSETT.SYMBOLS,

    responseReceived:
      !!data
  };


  logDiagnostic_(

    'API_TEST',

    '',

    JSON.stringify(result)
  );


  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );


  return result;
}


// ================================================================
// DIAGNOSTIC COMMANDS
// ================================================================

function diagnoseBitcoinDataVinsettV1() {

  return diagnoseSymbolData_(
    'BTC-BRL'
  );
}


function diagnoseEthereumDataVinsettV1() {

  return diagnoseSymbolData_(
    'ETH-BRL'
  );
}


function diagnoseSolanaDataVinsettV1() {

  return diagnoseSymbolData_(
    'SOL-BRL'
  );
}


function diagnoseAllDataVinsettV1() {

  const output = [];


  for (
    let i = 0;
    i < VINSETT.SYMBOLS.length;
    i++
  ) {

    output.push(

      diagnoseSymbolData_(
        VINSETT.SYMBOLS[i]
      )

    );
  }


  console.log(
    JSON.stringify(
      output,
      null,
      2
    )
  );


  return output;
}


// ================================================================
// ANALYSIS COMMANDS
// ================================================================

function analyzeBitcoinVinsettV1() {

  return analyzePublicAsset_(
    'BTC-BRL'
  );
}


function analyzeEthereumVinsettV1() {

  return analyzePublicAsset_(
    'ETH-BRL'
  );
}


function analyzeSolanaVinsettV1() {

  return analyzePublicAsset_(
    'SOL-BRL'
  );
}


function analyzeAllVinsettV1() {

  ensureSetup_();


  const output = [];


  for (
    let i = 0;
    i < VINSETT.SYMBOLS.length;
    i++
  ) {

    const symbol =
      VINSETT.SYMBOLS[i];


    try {

      const analysis =
        analyzeAsset_(
          symbol
        );


      output.push(
        analysis
      );


      logAnalysis_(
        analysis
      );


      if (
        analysis.state ===
          'SIGNAL_BUY'
        ||
        analysis.state ===
          'SIGNAL_SELL'
      ) {

        logSignal_(
          analysis
        );
      }


    } catch (error) {

      const failure = {

        symbol:
          symbol,

        state:
          'ERROR',

        direction:
          'NO_TRADE',

        technicalScore:
          0,

        reason:
          safeError_(error)
      };


      output.push(
        failure
      );


      logDiagnostic_(

        'ANALYSIS_ERROR',

        symbol,

        failure.reason
      );
    }
  }


  console.log(
    JSON.stringify(
      output,
      null,
      2
    )
  );


  return output;
}


// ================================================================
// FULL TEST
// ================================================================

function runFullTestVinsettV1() {

  const result = {

    setup:
      setupVinsettTraderV1(),

    api:
      testMercadoBitcoinVinsettV1(),

    bitcoinData:
      diagnoseBitcoinDataVinsettV1(),

    bitcoinAnalysis:
      analyzeBitcoinVinsettV1()
  };


  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );


  return result;
}


// ================================================================
// RESET
// ================================================================

function resetVinsettLocksV1() {

  const props =
    PropertiesService
      .getScriptProperties();


  VINSETT.SYMBOLS
    .forEach(
      function(symbol) {

        props.deleteProperty(
          lockKey_(symbol)
        );
      }
    );


  logDiagnostic_(

    'MANUAL_RESET',

    '',

    'Todos os bloqueios estruturais foram removidos manualmente.'
  );


  return {

    ok: true,

    resetSymbols:
      VINSETT.SYMBOLS
  };
}


// ================================================================
// STATUS
// ================================================================

function statusVinsettTraderV1() {

  const props =
    PropertiesService
      .getScriptProperties();


  const locks = {};


  VINSETT.SYMBOLS
    .forEach(
      function(symbol) {

        const raw =
          props.getProperty(
            lockKey_(symbol)
          );


        if (!raw) {

          locks[symbol] =
            null;

          return;
        }


        try {

          locks[symbol] =
            JSON.parse(raw);

        } catch (error) {

          locks[symbol] = {

            corrupted: true
          };
        }
      }
    );


  const result = {

    app:
      VINSETT.APP,

    version:
      VINSETT.VERSION,

    core:
      VINSETT.CORE,

    mode:
      VINSETT.MODE,

    source:
      VINSETT.API_BASE,

    symbols:
      VINSETT.SYMBOLS,

    spreadsheetId:
      props.getProperty(
        VINSETT.SHEET_PROP
      )
      ||
      null,

    locks:
      locks,

    automaticOrders:
      false,

    geminiConnected:
      false,

    telegramConnected:
      false
  };


  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );


  return result;
}


// ================================================================
// DATA DIAGNOSTIC
// ================================================================

function diagnoseSymbolData_(
  symbol
) {

  ensureSetup_();


  try {

    const m1 =
      fetchPagedCandles_(

        symbol,

        '1m',

        VINSETT.M1_TARGET_BARS,

        60
      );


    const m5 =
      aggregateCandles_(
        m1,
        300
      );


    const m15 =
      fetchPagedCandles_(

        symbol,

        '15m',

        VINSETT.M15_TARGET_BARS,

        900
      );


    const result = {

      symbol:
        symbol,

      source:
        'Mercado Bitcoin',

      m1:
        m1.length,

      m5:
        m5.length,

      m15:
        m15.length,

      m1Gaps:
        countGaps_(
          m1,
          60
        ),

      lastM1UTC:

        m1.length

        ?

        new Date(
          m1[
            m1.length - 1
          ].t
          * 1000
        ).toISOString()

        :

        null,

      lastM15UTC:

        m15.length

        ?

        new Date(
          m15[
            m15.length - 1
          ].t
          * 1000
        ).toISOString()

        :

        null,

      historySufficient:

        m1.length >= 80

        &&

        m5.length >= 60

        &&

        m15.length >= 60
    };


    logDiagnostic_(

      'DATA_DIAGNOSTIC',

      symbol,

      JSON.stringify(result)
    );


    console.log(
      JSON.stringify(
        result,
        null,
        2
      )
    );


    return result;


  } catch (error) {

    const result = {

      symbol:
        symbol,

      error:
        safeError_(error),

      historySufficient:
        false
    };


    logDiagnostic_(

      'DATA_DIAGNOSTIC_ERROR',

      symbol,

      result.error
    );


    console.log(
      JSON.stringify(
        result,
        null,
        2
      )
    );


    return result;
  }
}


// ================================================================
// PUBLIC ANALYSIS
// ================================================================

function analyzePublicAsset_(
  symbol
) {

  ensureSetup_();


  const analysis =
    analyzeAsset_(
      symbol
    );


  logAnalysis_(
    analysis
  );


  if (
    analysis.state ===
      'SIGNAL_BUY'
    ||
    analysis.state ===
      'SIGNAL_SELL'
  ) {

    logSignal_(
      analysis
    );
  }


  console.log(
    JSON.stringify(
      analysis,
      null,
      2
    )
  );


  return analysis;
}


// ================================================================
// MAIN ENGINE
// ================================================================

function analyzeAsset_(
  symbol
) {

  validateSymbol_(
    symbol
  );


  /*
   * M1 is paginated.
   */

  const m1 =
    fetchPagedCandles_(

      symbol,

      '1m',

      VINSETT.M1_TARGET_BARS,

      60
    );


  /*
   * M5 is built from M1.
   */

  const m5 =
    aggregateCandles_(
      m1,
      300
    );


  /*
   * M15 comes directly from
   * Mercado Bitcoin.
   */

  const m15 =
    fetchPagedCandles_(

      symbol,

      '15m',

      VINSETT.M15_TARGET_BARS,

      900
    );


  validateQuantity_(
    symbol,
    'M1',
    m1,
    80
  );


  validateQuantity_(
    symbol,
    'M5',
    m5,
    60
  );


  validateQuantity_(
    symbol,
    'M15',
    m15,
    60
  );


  validateM1Freshness_(
    symbol,
    m1
  );


  const m1Metrics =
    calculateMetrics_(
      m1
    );


  const m5Metrics =
    calculateMetrics_(
      m5
    );


  const m15Metrics =
    calculateMetrics_(
      m15
    );


  const m15Direction =
    classifyTrend_(

      m15Metrics,

      VINSETT.ADX_M15_MIN
    );


  const m5Direction =
    classifyTrend_(

      m5Metrics,

      VINSETT.ADX_M5_MIN
    );


  updateStructuralReset_(

    symbol,

    m5Direction,

    m5Metrics
  );


  const trigger =

    m15Direction !==
      'NEUTRAL'

    &&

    m5Direction ===
      m15Direction

    &&

    m1Trigger_(

      m1Metrics,

      m15Direction
    );


  const score =
    technicalScore_(

      m15Direction,

      m5Direction,

      m1Metrics,

      m5Metrics,

      m15Metrics,

      trigger
    );


  let state =
    'NO_TRADE';


  let direction =
    'NO_TRADE';


  let reason =
    'M15 sem tendência qualificada.';


  /*
   * M15 trend detected.
   */

  if (
    m15Direction !==
      'NEUTRAL'
  ) {

    direction =
      m15Direction;


    state =
      'WATCHING';


    reason =
      'M15 qualificado; aguardando confirmação do M5.';


    /*
     * M5 confirms M15.
     */

    if (
      m5Direction ===
      m15Direction
    ) {

      state =
        'ARMED';


      reason =
        'M15 e M5 alinhados; aguardando gatilho fechado no M1.';


      /*
       * M1 trigger.
       */

      if (trigger) {

        /*
         * Score filter.
         */

        if (
          score <
          VINSETT.MIN_SIGNAL_SCORE
        ) {

          state =
            'ARMED';


          reason =
            'Gatilho M1 encontrado, mas o score técnico ficou abaixo do mínimo operacional.';


        } else if (
          isLocked_(
            symbol,
            m15Direction
          )
        ) {

          state =
            'LOCKED_REPEAT';


          reason =
            'A mesma estrutura já gerou sinal e continua bloqueada contra repetição.';


        } else {

          state =

            m15Direction ===
            'BUY'

            ?

            'SIGNAL_BUY'

            :

            'SIGNAL_SELL';


          reason =
            'M15 + M5 alinhados; M1 confirmou pullback e retomada com score suficiente.';


          lockStructure_(

            symbol,

            m15Direction,

            m1Metrics.bar.t
          );
        }
      }
    }
  }


  return {

    app:
      VINSETT.APP,

    version:
      VINSETT.VERSION,

    core:
      VINSETT.CORE,

    mode:
      VINSETT.MODE,

    symbol:
      symbol,

    state:
      state,

    direction:
      direction,

    technicalScore:
      score,

    timestampManaus:
      Utilities.formatDate(

        new Date(),

        VINSETT.TIME_ZONE,

        'yyyy-MM-dd HH:mm:ss'
      ),

    candleM1StartUTC:
      new Date(
        m1Metrics.bar.t
        * 1000
      ).toISOString(),

    price:
      roundNumber_(
        m1Metrics.bar.c,
        8
      ),

    m15:
      metricsSummary_(
        m15Metrics,
        m15Direction
      ),

    m5:
      metricsSummary_(
        m5Metrics,
        m5Direction
      ),

    m1:
      metricsSummary_(

        m1Metrics,

        trigger

        ?

        direction

        :

        'WAITING'
      ),

    reason:
      reason,

    notice:
      'Technical Score representa confluência das regras; não é probabilidade de lucro.'
  };
}


// ================================================================
// PAGINATED CANDLE COLLECTION
// ================================================================

function fetchPagedCandles_(
  symbol,
  resolution,
  targetBars,
  intervalSec
) {

  validateSymbol_(
    symbol
  );


  let cursorTo =
    Math.floor(
      Date.now()
      / 1000
    );


  let collected = [];


  let previousEarliest =
    null;


  let page = 0;


  while (

    collected.length <
    targetBars

    &&

    page <
    VINSETT.MAX_PAGES
  ) {

    const remaining =
      targetBars
      -
      collected.length;


    /*
     * Request a little extra because
     * the newest candle can still be open.
     */

    const countback =
      Math.min(

        VINSETT.PAGE_SIZE,

        Math.max(
          remaining + 2,
          60
        )
      );


    const url =

      VINSETT.API_BASE

      +

      '/candles?symbol='

      +

      encodeURIComponent(
        symbol
      )

      +

      '&resolution='

      +

      encodeURIComponent(
        resolution
      )

      +

      '&to='

      +

      cursorTo

      +

      '&countback='

      +

      countback;


    const raw =
      fetchJson_(
        url
      );


    let batch =
      normalizeCandlesResponse_(

        raw,

        symbol
      );


    batch =
      closedCandlesOnly_(

        batch,

        intervalSec
      );


    if (
      !batch.length
    ) {

      break;
    }


    const earliest =
      batch[0].t;


    /*
     * Prevent infinite pagination.
     */

    if (

      previousEarliest !==
        null

      &&

      earliest >=
        previousEarliest
    ) {

      throw new Error(

        symbol

        +

        ' '

        +

        resolution

        +

        ': a API não avançou para candles mais antigos durante a paginação.'
      );
    }


    collected =
      deduplicateByTimestamp_(

        collected.concat(
          batch
        )
      );


    previousEarliest =
      earliest;


    /*
     * Next query finishes one complete
     * interval before the oldest candle.
     */

    cursorTo =
      earliest
      -
      intervalSec;


    page++;
  }


  collected =
    deduplicateByTimestamp_(
      collected
    );


  if (
    collected.length >
    targetBars
  ) {

    collected =
      collected.slice(

        collected.length
        -
        targetBars
      );
  }


  logDiagnostic_(

    'CANDLE_COLLECTION',

    symbol,

    JSON.stringify({

      resolution:
        resolution,

      targetBars:
        targetBars,

      receivedBars:
        collected.length,

      pages:
        page,

      firstUTC:

        collected.length

        ?

        new Date(
          collected[0].t
          * 1000
        ).toISOString()

        :

        null,

      lastUTC:

        collected.length

        ?

        new Date(
          collected[
            collected.length - 1
          ].t
          * 1000
        ).toISOString()

        :

        null
    })
  );


  return collected;
}


// ================================================================
// NORMALIZE API RESPONSE
// ================================================================

function normalizeCandlesResponse_(
  raw,
  symbol
) {

  if (

    !raw

    ||

    !Array.isArray(
      raw.t
    )

    ||

    !Array.isArray(
      raw.o
    )

    ||

    !Array.isArray(
      raw.h
    )

    ||

    !Array.isArray(
      raw.l
    )

    ||

    !Array.isArray(
      raw.c
    )

    ||

    !Array.isArray(
      raw.v
    )
  ) {

    throw new Error(
      'Resposta OHLCV inválida para '
      +
      symbol
      +
      '.'
    );
  }


  const size =
    raw.t.length;


  if (

    raw.o.length !== size

    ||

    raw.h.length !== size

    ||

    raw.l.length !== size

    ||

    raw.c.length !== size

    ||

    raw.v.length !== size
  ) {

    throw new Error(
      'Arrays OHLCV inconsistentes para '
      +
      symbol
      +
      '.'
    );
  }


  const bars = [];


  for (
    let i = 0;
    i < size;
    i++
  ) {

    const bar = {

      t:
        Number(
          raw.t[i]
        ),

      o:
        Number(
          raw.o[i]
        ),

      h:
        Number(
          raw.h[i]
        ),

      l:
        Number(
          raw.l[i]
        ),

      c:
        Number(
          raw.c[i]
        ),

      v:
        Number(
          raw.v[i]
        )
    };


    const validNumbers =

      [
        bar.t,
        bar.o,
        bar.h,
        bar.l,
        bar.c,
        bar.v
      ]
      .every(
        Number.isFinite
      );


    const validOhlc =

      bar.o > 0

      &&

      bar.c > 0

      &&

      bar.h >=
        bar.l

      &&

      bar.h >=
        bar.o

      &&

      bar.h >=
        bar.c

      &&

      bar.l <=
        bar.o

      &&

      bar.l <=
        bar.c

      &&

      bar.v >= 0;


    if (
      validNumbers
      &&
      validOhlc
    ) {

      bars.push(
        bar
      );
    }
  }


  bars.sort(
    function(a, b) {

      return a.t - b.t;
    }
  );


  return deduplicateByTimestamp_(
    bars
  );
}


// ================================================================
// CLOSED CANDLES
// ================================================================

function closedCandlesOnly_(
  bars,
  intervalSec
) {

  const nowSec =
    Math.floor(
      Date.now()
      / 1000
    );


  return bars.filter(
    function(bar) {

      return (

        bar.t
        +
        intervalSec

        <=

        nowSec
      );
    }
  );
}


// ================================================================
// BUILD M5
// ================================================================

function aggregateCandles_(
  m1Bars,
  bucketSec
) {

  if (
    bucketSec % 60 !== 0
  ) {

    throw new Error(
      'Invalid candle bucket: '
      +
      bucketSec
    );
  }


  const expectedBars =
    bucketSec
    / 60;


  const buckets = {};


  m1Bars.forEach(
    function(bar) {

      const bucketStart =
        Math.floor(
          bar.t
          / bucketSec
        )
        *
        bucketSec;


      if (
        !buckets[
          bucketStart
        ]
      ) {

        buckets[
          bucketStart
        ] = [];
      }


      buckets[
        bucketStart
      ].push(
        bar
      );
    }
  );


  const output = [];


  Object.keys(
    buckets
  )
  .map(
    Number
  )
  .sort(
    function(a, b) {

      return a - b;
    }
  )
  .forEach(
    function(bucketStart) {

      const bars =
        buckets[
          bucketStart
        ]
        .sort(
          function(a, b) {

            return a.t - b.t;
          }
        );


      /*
       * Need every M1 candle.
       */

      if (
        bars.length !==
        expectedBars
      ) {

        return;
      }


      /*
       * Need consecutive candles.
       */

      for (
        let i = 1;
        i < bars.length;
        i++
      ) {

        if (

          bars[i].t

          -

          bars[
            i - 1
          ].t

          !==

          60
        ) {

          return;
        }
      }


      let high =
        -Infinity;


      let low =
        Infinity;


      let volume =
        0;


      bars.forEach(
        function(bar) {

          high =
            Math.max(
              high,
              bar.h
            );


          low =
            Math.min(
              low,
              bar.l
            );


          volume +=
            bar.v;
        }
      );


      output.push({

        t:
          bucketStart,

        o:
          bars[0].o,

        h:
          high,

        l:
          low,

        c:
          bars[
            bars.length - 1
          ].c,

        v:
          volume
      });
    }
  );


  return closedCandlesOnly_(
    output,
    bucketSec
  );
}


// ================================================================
// FRESHNESS
// ================================================================

function validateM1Freshness_(
  symbol,
  bars
) {

  if (
    !bars.length
  ) {

    throw new Error(
      symbol
      +
      ': nenhum candle M1 disponível.'
    );
  }


  const lastBar =
    bars[
      bars.length - 1
    ];


  const nowSec =
    Math.floor(
      Date.now()
      / 1000
    );


  const staleness =

    nowSec

    -

    (
      lastBar.t
      +
      60
    );


  if (
    staleness >
    VINSETT.MAX_M1_STALENESS_SEC
  ) {

    throw new Error(

      symbol

      +

      ': último M1 está atrasado '

      +

      staleness

      +

      ' segundos; análise bloqueada para evitar dado antigo.'
    );
  }
}


// ================================================================
// GAP COUNTER
// ================================================================

function countGaps_(
  bars,
  intervalSec
) {

  let gaps = 0;


  for (
    let i = 1;
    i < bars.length;
    i++
  ) {

    const delta =

      bars[i].t

      -

      bars[
        i - 1
      ].t;


    if (
      delta >
      intervalSec
    ) {

      gaps +=

        Math.floor(
          delta
          /
          intervalSec
        )

        -

        1;
    }
  }


  return gaps;
}


// ================================================================
// METRICS
// ================================================================

function calculateMetrics_(
  bars
) {

  const closes =
    bars.map(
      function(bar) {

        return bar.c;
      }
    );


  const ema9 =
    emaSeries_(
      closes,
      VINSETT.EMA_FAST
    );


  const ema21 =
    emaSeries_(
      closes,
      VINSETT.EMA_MID
    );


  const ema50 =
    emaSeries_(
      closes,
      VINSETT.EMA_SLOW
    );


  const vwap50 =
    rollingVwapSeries_(

      bars,

      VINSETT.VWAP_PERIOD
    );


  const dmi =
    dmiAdxSeries_(

      bars,

      VINSETT.DMI_PERIOD
    );


  const index =
    bars.length - 1;


  const previousIndex =
    index - 1;


  const slopeIndex =
    Math.max(
      0,
      index - 3
    );


  const required = [

    ema9[index],

    ema21[index],

    ema50[index],

    vwap50[index],

    dmi.adx[index],

    dmi.plusDI[index],

    dmi.minusDI[index]
  ];


  if (
    !required.every(
      Number.isFinite
    )
  ) {

    throw new Error(
      'Indicadores insuficientes no último candle.'
    );
  }


  return {

    bar:
      bars[index],

    prevBar:
      bars[
        previousIndex
      ],

    ema9:
      ema9[index],

    ema21:
      ema21[index],

    ema50:
      ema50[index],

    ema9Prev:
      ema9[
        previousIndex
      ],

    ema21Prev:
      ema21[
        previousIndex
      ],

    ema50Prev:
      ema50[
        previousIndex
      ],

    ema9SlopeRef:
      ema9[
        slopeIndex
      ],

    ema21SlopeRef:
      ema21[
        slopeIndex
      ],

    vwap:
      vwap50[index],

    vwapPrev:
      vwap50[
        previousIndex
      ],

    adx:
      dmi.adx[index],

    plusDI:
      dmi.plusDI[index],

    minusDI:
      dmi.minusDI[index]
  };
}


// ================================================================
// EMA
// ================================================================

function emaSeries_(
  values,
  period
) {

  const output =
    new Array(
      values.length
    )
    .fill(null);


  if (
    values.length <
    period
  ) {

    return output;
  }


  let sum = 0;


  for (
    let i = 0;
    i < period;
    i++
  ) {

    sum +=
      values[i];
  }


  let ema =
    sum
    /
    period;


  output[
    period - 1
  ] = ema;


  const multiplier =
    2
    /
    (
      period + 1
    );


  for (
    let i = period;
    i < values.length;
    i++
  ) {

    ema =

      values[i]
      *
      multiplier

      +

      ema
      *
      (
        1 - multiplier
      );


    output[i] =
      ema;
  }


  return output;
}


// ================================================================
// VWAP
// ================================================================

function rollingVwapSeries_(
  bars,
  period
) {

  const output =
    new Array(
      bars.length
    )
    .fill(null);


  const priceVolume = [];


  let sumPriceVolume =
    0;


  let sumVolume =
    0;


  for (
    let i = 0;
    i < bars.length;
    i++
  ) {

    const typicalPrice =

      (
        bars[i].h
        +
        bars[i].l
        +
        bars[i].c
      )

      /

      3;


    const currentPriceVolume =

      typicalPrice

      *

      bars[i].v;


    priceVolume.push(
      currentPriceVolume
    );


    sumPriceVolume +=
      currentPriceVolume;


    sumVolume +=
      bars[i].v;


    if (
      i >= period
    ) {

      sumPriceVolume -=

        priceVolume[
          i - period
        ];


      sumVolume -=

        bars[
          i - period
        ].v;
    }


    if (

      i >=
      period - 1

      &&

      sumVolume > 0
    ) {

      output[i] =

        sumPriceVolume

        /

        sumVolume;
    }
  }


  return output;
}


// ================================================================
// ADX / DMI
// ================================================================

function dmiAdxSeries_(
  bars,
  period
) {

  const size =
    bars.length;


  const plusDI =
    new Array(size)
    .fill(null);


  const minusDI =
    new Array(size)
    .fill(null);


  const adx =
    new Array(size)
    .fill(null);


  const trueRange =
    new Array(size)
    .fill(0);


  const plusDM =
    new Array(size)
    .fill(0);


  const minusDM =
    new Array(size)
    .fill(0);


  const dx =
    new Array(size)
    .fill(null);


  if (
    size <
    period * 2 + 2
  ) {

    return {

      plusDI:
        plusDI,

      minusDI:
        minusDI,

      adx:
        adx
    };
  }


  for (
    let i = 1;
    i < size;
    i++
  ) {

    const upMove =

      bars[i].h

      -

      bars[
        i - 1
      ].h;


    const downMove =

      bars[
        i - 1
      ].l

      -

      bars[i].l;


    plusDM[i] =

      upMove >
      downMove

      &&

      upMove > 0

      ?

      upMove

      :

      0;


    minusDM[i] =

      downMove >
      upMove

      &&

      downMove > 0

      ?

      downMove

      :

      0;


    trueRange[i] =
      Math.max(

        bars[i].h
        -
        bars[i].l,

        Math.abs(
          bars[i].h
          -
          bars[
            i - 1
          ].c
        ),

        Math.abs(
          bars[i].l
          -
          bars[
            i - 1
          ].c
        )
      );
  }


  let smoothTR = 0;

  let smoothPlusDM = 0;

  let smoothMinusDM = 0;


  for (
    let i = 1;
    i <= period;
    i++
  ) {

    smoothTR +=
      trueRange[i];


    smoothPlusDM +=
      plusDM[i];


    smoothMinusDM +=
      minusDM[i];
  }


  for (
    let i = period;
    i < size;
    i++
  ) {

    if (
      i > period
    ) {

      smoothTR =

        smoothTR

        -

        smoothTR
        /
        period

        +

        trueRange[i];


      smoothPlusDM =

        smoothPlusDM

        -

        smoothPlusDM
        /
        period

        +

        plusDM[i];


      smoothMinusDM =

        smoothMinusDM

        -

        smoothMinusDM
        /
        period

        +

        minusDM[i];
    }


    if (
      smoothTR > 0
    ) {

      plusDI[i] =

        100

        *

        smoothPlusDM

        /

        smoothTR;


      minusDI[i] =

        100

        *

        smoothMinusDM

        /

        smoothTR;


      const denominator =

        plusDI[i]

        +

        minusDI[i];


      dx[i] =

        denominator > 0

        ?

        100

        *

        Math.abs(
          plusDI[i]
          -
          minusDI[i]
        )

        /

        denominator

        :

        0;
    }
  }


  const firstAdxIndex =
    period * 2 - 1;


  let dxSum = 0;

  let dxCount = 0;


  for (
    let i = period;
    i <= firstAdxIndex;
    i++
  ) {

    if (
      Number.isFinite(
        dx[i]
      )
    ) {

      dxSum +=
        dx[i];


      dxCount++;
    }
  }


  if (
    dxCount === period
  ) {

    adx[
      firstAdxIndex
    ] =

      dxSum
      /
      period;


    for (
      let i =
        firstAdxIndex + 1;

      i < size;

      i++
    ) {

      if (
        Number.isFinite(
          dx[i]
        )
      ) {

        adx[i] =

          (
            (
              adx[
                i - 1
              ]

              *

              (
                period - 1
              )
            )

            +

            dx[i]
          )

          /

          period;
      }
    }
  }


  return {

    plusDI:
      plusDI,

    minusDI:
      minusDI,

    adx:
      adx
  };
}


// ================================================================
// TREND CLASSIFICATION
// ================================================================

function classifyTrend_(
  metrics,
  minimumAdx
) {

  const bullishEmas =

    metrics.ema9
    >
    metrics.ema21

    &&

    metrics.ema21
    >
    metrics.ema50;


  const bearishEmas =

    metrics.ema9
    <
    metrics.ema21

    &&

    metrics.ema21
    <
    metrics.ema50;


  const bullishSlope =

    metrics.ema9
    >
    metrics.ema9SlopeRef

    &&

    metrics.ema21
    >
    metrics.ema21SlopeRef;


  const bearishSlope =

    metrics.ema9
    <
    metrics.ema9SlopeRef

    &&

    metrics.ema21
    <
    metrics.ema21SlopeRef;


  const strongEnough =

    metrics.adx
    >=
    minimumAdx;


  if (

    bullishEmas

    &&

    bullishSlope

    &&

    strongEnough

    &&

    metrics.plusDI
    >
    metrics.minusDI

    &&

    metrics.bar.c
    >
    metrics.vwap
  ) {

    return 'BUY';
  }


  if (

    bearishEmas

    &&

    bearishSlope

    &&

    strongEnough

    &&

    metrics.minusDI
    >
    metrics.plusDI

    &&

    metrics.bar.c
    <
    metrics.vwap
  ) {

    return 'SELL';
  }


  return 'NEUTRAL';
}


// ================================================================
// M1 TRIGGER
// ================================================================

function m1Trigger_(
  metrics,
  direction
) {

  const tolerance =
    VINSETT
      .PULLBACK_TOLERANCE_PCT;


  /*
   * Weak M1 = no trigger.
   */

  if (
    metrics.adx <
    VINSETT.ADX_M1_MIN
  ) {

    return false;
  }


  /*
   * BUY trigger
   */

  if (
    direction ===
    'BUY'
  ) {

    const pullback =

      withinPct_(

        metrics.prevBar.l,

        metrics.ema21Prev,

        tolerance
      )

      ||

      withinPct_(

        metrics.prevBar.l,

        metrics.vwapPrev,

        tolerance
      )

      ||

      metrics.prevBar.c
      <=
      metrics.ema9Prev;


    const resumption =

      metrics.bar.c
      >
      metrics.bar.o

      &&

      metrics.bar.c
      >
      metrics.ema9

      &&

      metrics.bar.c
      >
      metrics.vwap

      &&

      metrics.plusDI
      >
      metrics.minusDI

      &&

      metrics.bar.c
      >
      metrics.prevBar.h;


    return (

      pullback

      &&

      resumption
    );
  }


  /*
   * SELL trigger
   */

  if (
    direction ===
    'SELL'
  ) {

    const pullback =

      withinPct_(

        metrics.prevBar.h,

        metrics.ema21Prev,

        tolerance
      )

      ||

      withinPct_(

        metrics.prevBar.h,

        metrics.vwapPrev,

        tolerance
      )

      ||

      metrics.prevBar.c
      >=
      metrics.ema9Prev;


    const resumption =

      metrics.bar.c
      <
      metrics.bar.o

      &&

      metrics.bar.c
      <
      metrics.ema9

      &&

      metrics.bar.c
      <
      metrics.vwap

      &&

      metrics.minusDI
      >
      metrics.plusDI

      &&

      metrics.bar.c
      <
      metrics.prevBar.l;


    return (

      pullback

      &&

      resumption
    );
  }


  return false;
}


// ================================================================
// TECHNICAL SCORE
// ================================================================

function technicalScore_(
  m15Direction,
  m5Direction,
  m1,
  m5,
  m15,
  trigger
) {

  if (
    m15Direction ===
    'NEUTRAL'
  ) {

    return 0;
  }


  let score =
    35;


  /*
   * Strong M15.
   */

  if (
    m15.adx >= 30
  ) {

    score +=
      5;
  }


  /*
   * M5 aligned.
   */

  if (
    m5Direction ===
    m15Direction
  ) {

    score +=
      30;
  }


  /*
   * Strong M5.
   */

  if (

    m5Direction ===
    m15Direction

    &&

    m5.adx >= 28
  ) {

    score +=
      5;
  }


  /*
   * M1 direction.
   */

  if (
    m15Direction ===
    'BUY'
  ) {

    if (
      m1.plusDI >
      m1.minusDI
    ) {

      score +=
        10;
    }


    if (
      m1.bar.c >
      m1.vwap
    ) {

      score +=
        5;
    }


  } else {

    if (
      m1.minusDI >
      m1.plusDI
    ) {

      score +=
        10;
    }


    if (
      m1.bar.c <
      m1.vwap
    ) {

      score +=
        5;
    }
  }


  /*
   * Valid trigger.
   */

  if (trigger) {

    score +=
      10;
  }


  return Math.max(

    0,

    Math.min(
      100,
      Math.round(
        score
      )
    )
  );
}


// ================================================================
// STRUCTURAL LOCK
// ================================================================

function lockKey_(
  symbol
) {

  return (

    VINSETT.PROP_PREFIX

    +

    'LOCK_'

    +

    symbol.replace(
      /[^A-Z0-9]/g,
      '_'
    )
  );
}


function lockStructure_(
  symbol,
  direction,
  candleTimestamp
) {

  PropertiesService
    .getScriptProperties()
    .setProperty(

      lockKey_(symbol),

      JSON.stringify({

        direction:
          direction,

        candleTimestamp:
          candleTimestamp,

        createdAt:
          Date.now()
      })
    );
}


function isLocked_(
  symbol,
  direction
) {

  const props =
    PropertiesService
      .getScriptProperties();


  const raw =
    props.getProperty(
      lockKey_(symbol)
    );


  if (!raw) {

    return false;
  }


  try {

    return (

      JSON.parse(raw)
        .direction

      ===

      direction
    );


  } catch (error) {

    props.deleteProperty(
      lockKey_(symbol)
    );


    return false;
  }
}


// ================================================================
// STRUCTURAL RESET
// ================================================================

function updateStructuralReset_(
  symbol,
  currentM5Direction,
  m5Metrics
) {

  const props =
    PropertiesService
      .getScriptProperties();


  const key =
    lockKey_(symbol);


  const raw =
    props.getProperty(key);


  if (!raw) {

    return;
  }


  try {

    const lock =
      JSON.parse(raw);


    let reset =
      false;


    /*
     * BUY structure invalidation.
     */

    if (
      lock.direction ===
      'BUY'
    ) {

      reset =

        currentM5Direction ===
        'SELL'

        ||

        m5Metrics.bar.c
        <
        m5Metrics.ema21

        ||

        m5Metrics.plusDI
        <=
        m5Metrics.minusDI;
    }


    /*
     * SELL structure invalidation.
     */

    else if (
      lock.direction ===
      'SELL'
    ) {

      reset =

        currentM5Direction ===
        'BUY'

        ||

        m5Metrics.bar.c
        >
        m5Metrics.ema21

        ||

        m5Metrics.minusDI
        <=
        m5Metrics.plusDI;
    }


    if (reset) {

      props.deleteProperty(
        key
      );


      logDiagnostic_(

        'STRUCTURAL_RESET',

        symbol,

        'Bloqueio '
        +
        lock.direction
        +
        ' removido porque a estrutura M5 foi invalidada.'
      );
    }


  } catch (error) {

    props.deleteProperty(
      key
    );
  }
}


// ================================================================
// HTTP
// ================================================================

function fetchJson_(
  url
) {

  let lastError =
    '';


  for (
    let attempt = 0;
    attempt <=
      VINSETT.MAX_HTTP_RETRIES;
    attempt++
  ) {

    throttlePublicApi_();


    let response;


    try {

      response =
        UrlFetchApp.fetch(

          url,

          {

            method:
              'get',

            muteHttpExceptions:
              true,

            headers: {

              Accept:
                'application/json'
            }
          }
        );


    } catch (error) {

      lastError =

        'Falha de rede: '

        +

        safeError_(error);


      if (

        attempt
        <
        VINSETT.MAX_HTTP_RETRIES
      ) {

        Utilities.sleep(

          VINSETT
            .HTTP_RETRY_BASE_MS

          *

          (
            attempt + 1
          )
        );


        continue;
      }


      throw new Error(
        lastError
      );
    }


    const statusCode =
      response
        .getResponseCode();


    const text =
      response
        .getContentText();


    if (

      statusCode >= 200

      &&

      statusCode < 300
    ) {

      try {

        return JSON.parse(
          text
        );


      } catch (error) {

        throw new Error(
          'JSON inválido recebido da API do Mercado Bitcoin.'
        );
      }
    }


    lastError =

      'HTTP '

      +

      statusCode

      +

      ' em '

      +

      url.replace(
        /\?.*$/,
        ''
      )

      +

      ': '

      +

      text.slice(
        0,
        300
      );


    if (

      (
        statusCode === 429

        ||

        statusCode >= 500
      )

      &&

      attempt <
      VINSETT.MAX_HTTP_RETRIES
    ) {

      Utilities.sleep(

        VINSETT
          .HTTP_RETRY_BASE_MS

        *

        (
          attempt + 1
        )
      );


      continue;
    }


    throw new Error(
      lastError
    );
  }


  throw new Error(

    lastError

    ||

    'Falha HTTP desconhecida.'
  );
}


// ================================================================
// RATE LIMIT
// ================================================================

function throttlePublicApi_() {

  const now =
    Date.now();


  const elapsed =
    now
    -
    vinsettLastRequestAt_;


  if (

    vinsettLastRequestAt_ > 0

    &&

    elapsed <
    VINSETT.REQUEST_GAP_MS
  ) {

    Utilities.sleep(

      VINSETT.REQUEST_GAP_MS

      -

      elapsed
    );
  }


  vinsettLastRequestAt_ =
    Date.now();
}


// ================================================================
// LOG ANALYSIS
// ================================================================

function logAnalysis_(
  analysis
) {

  const sheet =
    getSpreadsheet_()
      .getSheetByName(
        'Analyses'
      );


  if (!sheet) {

    return;
  }


  sheet.appendRow([

    analysis.timestampManaus,

    analysis.symbol,

    analysis.state,

    analysis.direction,

    analysis.technicalScore,

    analysis.price,


    analysis.m15.direction,

    analysis.m15.adx,

    analysis.m15.plusDI,

    analysis.m15.minusDI,

    analysis.m15.ema9,

    analysis.m15.ema21,

    analysis.m15.ema50,

    analysis.m15.vwap,


    analysis.m5.direction,

    analysis.m5.adx,

    analysis.m5.plusDI,

    analysis.m5.minusDI,

    analysis.m5.ema9,

    analysis.m5.ema21,

    analysis.m5.ema50,

    analysis.m5.vwap,


    analysis.m1.direction,

    analysis.m1.adx,

    analysis.m1.plusDI,

    analysis.m1.minusDI,

    analysis.m1.ema9,

    analysis.m1.ema21,

    analysis.m1.ema50,

    analysis.m1.vwap,


    analysis.candleM1StartUTC,

    analysis.reason
  ]);
}


// ================================================================
// LOG SIGNAL
// ================================================================

function logSignal_(
  analysis
) {

  const sheet =
    getSpreadsheet_()
      .getSheetByName(
        'Signals'
      );


  if (!sheet) {

    return;
  }


  sheet.appendRow([

    analysis.timestampManaus,

    analysis.symbol,

    analysis.direction,

    analysis.technicalScore,

    analysis.price,

    analysis.m15.adx,

    analysis.m5.adx,

    analysis.m1.adx,

    analysis.candleM1StartUTC,

    analysis.reason
  ]);
}


// ================================================================
// LOG DIAGNOSTICS
// ================================================================

function logDiagnostic_(
  type,
  symbol,
  detail
) {

  try {

    const sheet =
      getSpreadsheet_()
        .getSheetByName(
          'Diagnostics'
        );


    if (!sheet) {

      return;
    }


    sheet.appendRow([

      Utilities.formatDate(

        new Date(),

        VINSETT.TIME_ZONE,

        'yyyy-MM-dd HH:mm:ss'
      ),

      type,

      symbol || '',

      detail || ''
    ]);


  } catch (ignored) {

  }
}


// ================================================================
// SHEETS
// ================================================================

function ensureSheet_(
  spreadsheet,
  name,
  headers
) {

  let sheet =
    spreadsheet.getSheetByName(
      name
    );


  if (!sheet) {

    sheet =
      spreadsheet.insertSheet(
        name
      );
  }


  if (
    sheet.getLastRow() === 0
  ) {

    sheet
      .getRange(
        1,
        1,
        1,
        headers.length
      )
      .setValues([
        headers
      ]);


    sheet.setFrozenRows(1);
  }


  return sheet;
}


// ================================================================
// GET SPREADSHEET
// ================================================================

function getSpreadsheet_() {

  const spreadsheetId =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        VINSETT.SHEET_PROP
      );


  if (!spreadsheetId) {

    throw new Error(
      'VINSETT não preparado. Execute setupVinsettTraderV1 primeiro.'
    );
  }


  return SpreadsheetApp
    .openById(
      spreadsheetId
    );
}


// ================================================================
// ENSURE SETUP
// ================================================================

function ensureSetup_() {

  const spreadsheetId =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        VINSETT.SHEET_PROP
      );


  if (!spreadsheetId) {

    setupVinsettTraderV1();
  }
}


// ================================================================
// VALIDATE SYMBOL
// ================================================================

function validateSymbol_(
  symbol
) {

  if (
    VINSETT.SYMBOLS
      .indexOf(
        symbol
      )
    ===
    -1
  ) {

    throw new Error(
      'Ativo fora do escopo VINSETT V1: '
      +
      symbol
    );
  }
}


// ================================================================
// VALIDATE QUANTITY
// ================================================================

function validateQuantity_(
  symbol,
  timeframe,
  bars,
  minimum
) {

  if (

    !bars

    ||

    bars.length <
    minimum
  ) {

    throw new Error(

      symbol

      +

      ' '

      +

      timeframe

      +

      ': somente '

      +

      (
        bars
        ?
        bars.length
        :
        0
      )

      +

      ' candles completos; mínimo '

      +

      minimum

      +

      '.'
    );
  }
}


// ================================================================
// DEDUPLICATION
// ================================================================

function deduplicateByTimestamp_(
  bars
) {

  const map = {};


  bars.forEach(
    function(bar) {

      map[
        bar.t
      ] =
        bar;
    }
  );


  return Object.keys(
    map
  )
  .map(
    Number
  )
  .sort(
    function(a, b) {

      return a - b;
    }
  )
  .map(
    function(timestamp) {

      return map[
        timestamp
      ];
    }
  );
}


// ================================================================
// PRICE TOLERANCE
// ================================================================

function withinPct_(
  price,
  reference,
  tolerancePct
) {

  if (

    !Number.isFinite(
      price
    )

    ||

    !Number.isFinite(
      reference
    )

    ||

    reference === 0
  ) {

    return false;
  }


  return (

    Math.abs(
      price
      -
      reference
    )

    /

    Math.abs(
      reference
    )

    *

    100

    <=

    tolerancePct
  );
}


// ================================================================
// METRICS SUMMARY
// ================================================================

function metricsSummary_(
  metrics,
  direction
) {

  return {

    direction:
      direction,

    close:
      roundNumber_(
        metrics.bar.c,
        8
      ),

    ema9:
      roundNumber_(
        metrics.ema9,
        8
      ),

    ema21:
      roundNumber_(
        metrics.ema21,
        8
      ),

    ema50:
      roundNumber_(
        metrics.ema50,
        8
      ),

    adx:
      roundNumber_(
        metrics.adx,
        2
      ),

    plusDI:
      roundNumber_(
        metrics.plusDI,
        2
      ),

    minusDI:
      roundNumber_(
        metrics.minusDI,
        2
      ),

    vwap:
      roundNumber_(
        metrics.vwap,
        8
      )
  };
}


// ================================================================
// ROUND
// ================================================================

function roundNumber_(
  number,
  digits
) {

  if (
    !Number.isFinite(
      number
    )
  ) {

    return null;
  }


  const factor =
    Math.pow(
      10,
      digits || 0
    );


  return (

    Math.round(
      number
      *
      factor
    )

    /

    factor
  );
}


// ================================================================
// SAFE ERROR
// ================================================================

function safeError_(
  error
) {

  const message =

    error

    &&

    error.message

    ?

    error.message

    :

    String(error);


  return message.slice(
    0,
    800
  );
}
