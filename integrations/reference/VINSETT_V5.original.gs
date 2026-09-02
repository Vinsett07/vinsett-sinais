/**
 * VINSETT TRADER PRO — v5.0.0 — BTC / ETH / SOL — Google Apps Script V8
 * CODIGO COMPLETO: substitui TODO o conteudo de Codigo.gs; NAO e complemento.
 * Leia INSTALACAO_VINSETT_V5.md antes de instalar. Guarde o codigo anterior.
 *
 * Ordem: pausarSistema (codigo antigo) -> substituir e salvar ->
 * configurarSistema -> testarSistemaCompleto -> testarCanalTelegram -> retomarSistema.
 * configurarSistema prepara e deixa em MANUTENCAO: nenhum envio automatico.
 * Nao precisa implantar Web App nem criar webhook nem manter navegador aberto.
 *
 * Propriedades existentes preservadas: TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID,
 * TELEGRAM_CHAT_ID (opcional, SOMENTE ID de conversa privada do administrador).
 * NUNCA cole token no codigo, planilha, captura de tela ou conversa.
 *
 * APENAS SINAIS: nao acessa conta de corretora, nao executa ordens, nao usa OTC.
 * Score tecnico /100 NAO e probabilidade, aprendizado de IA ou garantia de lucro.
 * WIN/LOSS e a comparacao abertura/fechamento da vela M1 EXATA da fonte do sinal.
 * Nao confirma execucao, cotacao, taxas, pagamento ou resultado real na Ebinex.
 * Igual = EMPATE. Vela indisponivel apos 30 min = INCONCLUSIVO.
 * Entrega ambigua fica INCERTA, sem reenvio automatico; consulte statusWinLossVinsett.
 *
 * Historico mensal PRIVADO e criado na conta Google que executar configurarSistema.
 * Sinais/resultados ficam na fila persistente ate confirmacao de gravacao na planilha.
 * Diagnosticos: console a cada analise; planilha por mudanca de motivo ou a cada 5 min.
 * Durante falha da planilha, diagnosticos ficam apenas nos logs do Apps Script;
 * novos sinais param, mas a apuracao de sinais ja publicados continua.
 * Filas VINSETT_WL1_ do complemento anterior sao lidas e preservadas, sem reenviar.
 * Sinais antigos que nunca foram registrados nao podem ser reconstruidos.
 *
 * Limites do Apps Script e atrasos externos podem interromper/atrasar o servico.
 * Referencias tecnicas (consultadas em 01/09/2026):
 * https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles
 * https://docs.kraken.com/api-reference/market-data/get-ohlc-data
 * https://core.telegram.org/bots/api#sendmessage
 * https://developers.google.com/apps-script/guides/services/quotas
 */

const VINSETT_CONFIG = Object.freeze({
  VERSION: '5.0.0', TIMEZONE: 'America/Manaus',
  EMA_FAST: 9, EMA_SLOW: 21, RSI_LEN: 14, ATR_LEN: 14, VOLUME_LEN: 20,
  LIVE_CANDLES: 120, MIN_CANDLES: 60, MIN_SCORE: 78,
  MIN_VOLUME_FACTOR: 0.80, MIN_ATR_PCT: 0.015,
  COOLDOWN_MINUTES: 2, MIN_LEAD_SECONDS: 8,
  MAX_DATA_AGE_SECONDS: 120, M5_MAX_AGE_SECONDS: 420, M15_MAX_AGE_SECONDS: 1020,
  CACHE_HIGHER_TIMEFRAMES: true, CYCLE_BUDGET_MS: 50000,
  RESULT_BUDGET_MS: 12000, MAX_RESULT_POSTS: 3, MAX_NEW_SIGNALS: 3,
  MAX_PENDING: 30, KEEP_DONE: 100, MAX_UNARCHIVED: 50,
  SETTLE_DELAY_MS: 5000, RESULT_WAIT_MS: 30 * 60000,
  DIAG_INTERVAL_MS: 5 * 60000, COMMAND_POLL_EVERY_CYCLES: 2
});

const VINSETT_ATIVOS = Object.freeze([
  Object.freeze({ code: 'BTC', pair: 'BTC/USD', coinbase: 'BTC-USD', kraken: 'XBTUSD',
    krakenKeys: ['BTC/USD', 'XBT/USD', 'XXBTZUSD', 'XBTUSD', 'BTCUSD'] }),
  Object.freeze({ code: 'ETH', pair: 'ETH/USD', coinbase: 'ETH-USD', kraken: 'ETHUSD',
    krakenKeys: ['ETH/USD', 'XETHZUSD', 'ETHUSD'] }),
  Object.freeze({ code: 'SOL', pair: 'SOL/USD', coinbase: 'SOL-USD', kraken: 'SOLUSD',
    krakenKeys: ['SOL/USD', 'SOLUSD'] })
]);

const VINSETT_KEYS = Object.freeze({
  TOKEN: 'TELEGRAM_BOT_TOKEN', CHANNEL_ID: 'TELEGRAM_CHANNEL_ID', CHAT_ID: 'TELEGRAM_CHAT_ID',
  PAUSED: 'VINSETT_PAUSED', LAST_CYCLE: 'VINSETT_LAST_CYCLE', LAST_SIGNAL: 'VINSETT_LAST_SIGNAL',
  LAST_ERROR_NOTICE: 'VINSETT_LAST_ERROR_NOTICE', COMMAND_OFFSET: 'VINSETT_COMMAND_OFFSET',
  COMMAND_COUNTER: 'VINSETT_COMMAND_COUNTER', READY: 'VINSETT_V5_READY',
  MAINTENANCE: 'VINSETT_V5_MAINTENANCE', TEST_OK: 'VINSETT_V5_TEST_OK',
  HISTORY_PREFIX: 'VINSETT_V5_HISTORY_', QUEUE_PREFIX: 'VINSETT_WL2_', LEGACY_PREFIX: 'VINSETT_WL1_'
});

let VINSETT_PROPERTY_STATE = null;
function reiniciarPropriedades_() { VINSETT_PROPERTY_STATE = null; }
function propriedades_() {
  if (VINSETT_PROPERTY_STATE) return VINSETT_PROPERTY_STATE;
  const backend = PropertiesService.getScriptProperties();
  const data = backend.getProperties();
  // Snapshot por execucao, atualizado nas escritas: reduz consumo da cota de leitura.
  VINSETT_PROPERTY_STATE = {
    getProperty: function(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    getProperties: function() { return Object.assign({}, data); },
    setProperty: function(k, v) { backend.setProperty(k, String(v)); data[k] = String(v); return this; },
    setProperties: function(values) {
      backend.setProperties(values, false);
      Object.keys(values).forEach(function(k) { data[k] = String(values[k]); }); return this;
    },
    deleteProperty: function(k) { backend.deleteProperty(k); delete data[k]; return this; }
  };
  return VINSETT_PROPERTY_STATE;
}
function ativo_(code) {
  const a = VINSETT_ATIVOS.filter(function(x) { return x.code === code; })[0];
  if (!a) throw new Error('Ativo nao suportado: ' + code);
  return a;
}
function simbolo_(source, a) {
  if (source === 'COINBASE') return a.coinbase;
  if (source === 'KRAKEN') return a.kraken;
  throw new Error('Fonte desconhecida.');
}
function tickerTradingView_(source, a) { return source + ':' + a.code + 'USD'; }
function chaveAtivo_(tipo, code) { return 'VINSETT_V5_' + tipo + '_' + ativo_(code).code; }
function fonteAtual_(a) {
  const p = propriedades_();
  const s = p.getProperty(chaveAtivo_('SOURCE', a.code)) ||
    (a.code === 'BTC' ? p.getProperty('VINSETT_MARKET_SOURCE') : '') || 'COINBASE';
  return s === 'KRAKEN' ? 'KRAKEN' : 'COINBASE';
}
function novoContexto_() {
  return { start: Date.now(), market: {}, books: {}, diagnostics: [], hasErrors: false, dry: false };
}
function prazoDisponivel_(ctx) { return Date.now() - ctx.start < VINSETT_CONFIG.CYCLE_BUDGET_MS; }
function chaveMercado_(spec) {
  return 'V5_' + spec.source + '_' + spec.asset.code + '_' + spec.minutes + '_' +
    Math.floor(Date.now() / (spec.minutes * 60000));
}
function urlMercado_(source, a, minutes) {
  if ([1, 5, 15].indexOf(minutes) < 0) throw new Error('Timeframe nao suportado.');
  if (source === 'COINBASE') return 'https://api.exchange.coinbase.com/products/' +
    encodeURIComponent(a.coinbase) + '/candles?granularity=' + (minutes * 60);
  if (source === 'KRAKEN') return 'https://api.kraken.com/0/public/OHLC?pair=' +
    encodeURIComponent(a.kraken) + '&interval=' + minutes + '&assetVersion=1';
  throw new Error('Fonte desconhecida.');
}

// Todas as requisicoes deste lote sao leituras publicas. Nao usa chaves de corretora.
function carregarLoteMercado_(specs, ctx) {
  const pedidos = [];
  const vistos = {};
  specs.forEach(function(s) {
    const key = chaveMercado_(s);
    if (ctx.market[key] || vistos[key]) return;
    vistos[key] = true;
    if (s.minutes !== 1 && VINSETT_CONFIG.CACHE_HIGHER_TIMEFRAMES && !ctx.dry) {
      try {
        const raw = CacheService.getScriptCache().get(key);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved.symbol !== simbolo_(s.source, s.asset) || saved.source !== s.source ||
              saved.minutes !== s.minutes) throw new Error('Cache de outro mercado.');
          validarSerie_(saved.candles, s.minutes, Date.now());
          ctx.market[key] = { candles: saved.candles };
          return;
        }
      } catch (cacheError) { /* Cache e opcional; usa a fonte. */ }
    }
    pedidos.push({ spec: s, key: key, request: {
      url: urlMercado_(s.source, s.asset, s.minutes), method: 'get',
      muteHttpExceptions: true, followRedirects: false,
      headers: { Accept: 'application/json', 'User-Agent': 'VINSETT/5.0.0' }
    } });
  });
  if (!pedidos.length) return;
  let respostas;
  try { respostas = UrlFetchApp.fetchAll(pedidos.map(function(p) { return p.request; })); }
  catch (erro) {
    pedidos.forEach(function(p) { ctx.market[p.key] = { error: erroSeguro_(erro) }; });
    return;
  }
  pedidos.forEach(function(p, i) {
    try {
      const candles = interpretarRespostaMercado_(respostas[i], p.spec);
      ctx.market[p.key] = { candles: candles };
      if (p.spec.minutes === 1 || !VINSETT_CONFIG.CACHE_HIGHER_TIMEFRAMES || ctx.dry) return;
      const recent = candles.slice(-VINSETT_CONFIG.LIVE_CANDLES);
      validarSerie_(recent, p.spec.minutes, Date.now());
      const ms = p.spec.minutes * 60000;
      const expected = Math.floor(Date.now() / ms) * ms - ms;
      // Nao guarda uma vela anterior sob a chave da vela nova durante a tolerancia.
      if (recent[recent.length - 1].openTime !== expected || chaveMercado_(p.spec) !== p.key) return;
      try {
        CacheService.getScriptCache().put(p.key, JSON.stringify({ candles: recent,
          source: p.spec.source, symbol: simbolo_(p.spec.source, p.spec.asset), minutes: p.spec.minutes
        }), p.spec.minutes * 60 + 5);
      } catch (cacheError) { /* A ausencia de cache nao interrompe a analise. */ }
    } catch (erro) { ctx.market[p.key] = { error: erroSeguro_(erro) }; }
  });
}

function numeroMercado_(v) {
  if ((typeof v !== 'number' && typeof v !== 'string') || String(v).trim() === '')
    throw new Error('Valor de mercado vazio ou invalido.');
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error('Valor de mercado nao numerico.');
  return n;
}
function interpretarRespostaMercado_(response, spec) {
  if (!response || response.getResponseCode() !== 200)
    throw new Error(spec.source + ' HTTP ' + (response ? response.getResponseCode() : 'sem resposta'));
  let body;
  try { body = JSON.parse(response.getContentText()); }
  catch (erro) { throw new Error(spec.source + ': JSON invalido.'); }
  let rows;
  if (spec.source === 'COINBASE') rows = body;
  else {
    if (!body || !Array.isArray(body.error) || body.error.length || !body.result)
      throw new Error('Kraken recusou os dados ou retornou formato invalido.');
    const keys = Object.keys(body.result).filter(function(k) { return k !== 'last'; });
    if (keys.length !== 1 || spec.asset.krakenKeys.indexOf(keys[0]) < 0)
      throw new Error('Kraken: resposta nao identifica o ativo solicitado.');
    rows = body.result[keys[0]];
    if (Array.isArray(rows)) rows = rows.slice(0, -1); // Kraken: ultima vela SEMPRE nao confirmada.
  }
  if (!Array.isArray(rows)) throw new Error(spec.source + ': lista de velas invalida.');
  const now = Date.now();
  let cutoff = now;
  // Uma resposta em cache pode ter uma vela que estava aberta quando foi produzida.
  const headers = response.getAllHeaders ? response.getAllHeaders() : {};
  Object.keys(headers).forEach(function(k) {
    if (k.toLowerCase() === 'date') {
      const stamp = Date.parse(String(headers[k]));
      if (Number.isFinite(stamp)) cutoff = Math.min(cutoff, stamp);
    }
    if (k.toLowerCase() === 'age' && /^\d+$/.test(String(headers[k])))
      cutoff = Math.min(cutoff, now - Number(headers[k]) * 1000);
  });
  const ms = spec.minutes * 60000;
  return rows.map(function(row) {
    if (!Array.isArray(row) || row.length < (spec.source === 'COINBASE' ? 6 : 7))
      throw new Error('Vela incompleta.');
    const t = numeroMercado_(row[0]) * 1000;
    const cb = spec.source === 'COINBASE';
    const c = { openTime: t, closeTime: t + ms - 1,
      open: numeroMercado_(row[cb ? 3 : 1]), high: numeroMercado_(row[2]),
      low: numeroMercado_(row[cb ? 1 : 3]), close: numeroMercado_(row[4]),
      volume: numeroMercado_(row[cb ? 5 : 6]) };
    validarOHLC_(c, ms);
    if (c.openTime > Math.floor(now / ms) * ms) throw new Error('Vela com horario futuro.');
    return c;
  }).filter(function(c) { return c.closeTime < cutoff; })
    .sort(function(a, b) { return a.openTime - b.openTime; });
}
function validarOHLC_(c, ms) {
  if (!c || !Number.isSafeInteger(c.openTime) || c.openTime <= 0 || c.openTime % ms !== 0 ||
      c.closeTime !== c.openTime + ms - 1) throw new Error('Horario da vela invalido.');
  ['open', 'high', 'low', 'close'].forEach(function(k) {
    if (!Number.isFinite(c[k]) || c[k] <= 0) throw new Error('OHLC invalido.');
  });
  if (!Number.isFinite(c.volume) || c.volume < 0 || c.low > Math.min(c.open, c.close) ||
      c.high < Math.max(c.open, c.close) || c.low > c.high) throw new Error('OHLCV inconsistente.');
}
function validarSerie_(candles, minutes, now) {
  if (!Array.isArray(candles) || candles.length < VINSETT_CONFIG.MIN_CANDLES)
    throw new Error('M' + minutes + ': menos de ' + VINSETT_CONFIG.MIN_CANDLES + ' velas fechadas.');
  const ms = minutes * 60000;
  candles.forEach(function(c, i) {
    validarOHLC_(c, ms);
    if (c.closeTime >= now) throw new Error('M' + minutes + ': vela ainda aberta ou futura.');
    if (i && c.openTime - candles[i - 1].openTime !== ms)
      throw new Error('M' + minutes + ': lacuna, duplicacao ou ordem incorreta nas velas.');
  });
  const age = Math.floor((now - candles[candles.length - 1].closeTime) / 1000);
  const limits = { 1: VINSETT_CONFIG.MAX_DATA_AGE_SECONDS,
    5: VINSETT_CONFIG.M5_MAX_AGE_SECONDS, 15: VINSETT_CONFIG.M15_MAX_AGE_SECONDS };
  if (!limits[minutes] || age < 0 || age > limits[minutes])
    throw new Error('M' + minutes + ': dados atrasados ' + age + 's; limite=' + limits[minutes] + 's.');
  return age;
}
function validarMulti_(multi, now) {
  return { m1: validarSerie_(multi.m1, 1, now), m5: validarSerie_(multi.m5, 5, now),
    m15: validarSerie_(multi.m15, 15, now) };
}
function specsPacote_(a, source) {
  return [1, 5, 15].map(function(m) { return { asset: a, source: source, minutes: m }; });
}
function obterVelas_(a, source, minutes, ctx) {
  const spec = { asset: a, source: source, minutes: minutes };
  let key = chaveMercado_(spec);
  carregarLoteMercado_([spec], ctx);
  // Uma consulta pode atravessar a virada de minuto. Usa a resposta obtida,
  // revalidada pelo consumidor, sem fabricar outra consulta ou outro horario.
  const value = ctx.market[key];
  if (!value || value.error) throw new Error(value ? value.error : 'Resposta de mercado ausente.');
  return value.candles;
}
function buscarMultiTimeframeComFallback_(a, ctx) {
  const preferred = fonteAtual_(a);
  const order = preferred === 'KRAKEN' ? ['KRAKEN', 'COINBASE'] : ['COINBASE', 'KRAKEN'];
  const errors = [];
  for (let i = 0; i < order.length; i += 1) {
    const source = order[i];
    try {
      carregarLoteMercado_(specsPacote_(a, source), ctx);
      const multi = { asset: a.code, source: source };
      [1, 5, 15].forEach(function(m) {
        multi['m' + m] = obterVelas_(a, source, m, ctx).slice(-VINSETT_CONFIG.LIVE_CANDLES);
      });
      multi.ages = validarMulti_(multi, Date.now());
      if (!ctx.dry && fonteAtual_(a) !== source)
        propriedades_().setProperty(chaveAtivo_('SOURCE', a.code), source);
      return multi;
    } catch (erro) {
      errors.push(source + ': ' + erroSeguro_(erro));
      console.warn(a.code + ' [FONTE REJEITADA] ' + errors[errors.length - 1]);
    }
  }
  throw new Error(a.code + ': nenhuma fonte valida. ' + errors.join(' | '));
}

// Mesma estrategia v4.0.1. Diagnosticos novos NAO mudam os limiares nem os scores.
function analisarMercado_(multi, now) {
  const ages = validarMulti_(multi, now);
  const m1 = indicadoresUltimo_(multi.m1), m5 = indicadoresUltimo_(multi.m5),
    m15 = indicadoresUltimo_(multi.m15);
  const volumeFactor = m1.volumeMean > 0 ? m1.volume / m1.volumeMean : 0;
  const common = [
    ['Volume M1 abaixo de ' + VINSETT_CONFIG.MIN_VOLUME_FACTOR + ' da media', volumeFactor >= VINSETT_CONFIG.MIN_VOLUME_FACTOR],
    ['ATR M1 abaixo de ' + VINSETT_CONFIG.MIN_ATR_PCT + '%', m1.atrPct >= VINSETT_CONFIG.MIN_ATR_PCT]
  ];
  const buy = [
    ['M15: EMA9 nao supera EMA21', m15.emaFast > m15.emaSlow],
    ['M15: RSI nao supera 52', m15.rsi > 52],
    ['M5: EMA9 nao supera EMA21', m5.emaFast > m5.emaSlow],
    ['M5: RSI nao supera 50', m5.rsi > 50],
    ['M1: EMA9 nao supera EMA21', m1.emaFast > m1.emaSlow],
    ['M1: fechamento nao supera EMA9', m1.close > m1.emaFast],
    ['M1: RSI fora de 52 < RSI < 75', m1.rsi > 52 && m1.rsi < 75]
  ].concat(common);
  const sell = [
    ['M15: EMA9 nao esta abaixo de EMA21', m15.emaFast < m15.emaSlow],
    ['M15: RSI nao esta abaixo de 48', m15.rsi < 48],
    ['M5: EMA9 nao esta abaixo de EMA21', m5.emaFast < m5.emaSlow],
    ['M5: RSI nao esta abaixo de 50', m5.rsi < 50],
    ['M1: EMA9 nao esta abaixo de EMA21', m1.emaFast < m1.emaSlow],
    ['M1: fechamento nao esta abaixo de EMA9', m1.close < m1.emaFast],
    ['M1: RSI fora de 25 < RSI < 48', m1.rsi > 25 && m1.rsi < 48]
  ].concat(common);
  const reasonsBuy = buy.filter(function(c) { return !c[1]; }).map(function(c) { return c[0]; });
  const reasonsSell = sell.filter(function(c) { return !c[1]; }).map(function(c) { return c[0]; });
  const buyScore = reasonsBuy.length ? 0 : calcularScoreTecnico_('BUY', m15, m5, m1, volumeFactor);
  const sellScore = reasonsSell.length ? 0 : calcularScoreTecnico_('SELL', m15, m5, m1, volumeFactor);
  if (!reasonsBuy.length && buyScore < VINSETT_CONFIG.MIN_SCORE) reasonsBuy.push('Score abaixo do minimo');
  if (!reasonsSell.length && sellScore < VINSETT_CONFIG.MIN_SCORE) reasonsSell.push('Score abaixo do minimo');
  const direction = buyScore >= VINSETT_CONFIG.MIN_SCORE && buyScore > sellScore ? 'BUY' :
    (sellScore >= VINSETT_CONFIG.MIN_SCORE && sellScore > buyScore ? 'SELL' : null);
  return { signal: !!direction, direction: direction, score: Math.max(buyScore, sellScore),
    buyScore: buyScore, sellScore: sellScore, price: m1.close, ages: ages,
    reasonsBuy: reasonsBuy, reasonsSell: reasonsSell, volumeFactor: volumeFactor,
    indicators: { m1: m1, m5: m5, m15: m15 } };
}
function calcularScoreTecnico_(direction, m15, m5, m1, volumeFactor) {
  const volumeScore = limitar_(((volumeFactor - VINSETT_CONFIG.MIN_VOLUME_FACTOR) / 0.70) * 5, 0, 5);
  const atrScore = limitar_(((m1.atrPct - VINSETT_CONFIG.MIN_ATR_PCT) / 0.065) * 5, 0, 5);
  return Math.round(limitar_(60 + forcaTimeframe_(direction, m15, 10) +
    forcaTimeframe_(direction, m5, 10) + forcaTimeframe_(direction, m1, 10) + volumeScore + atrScore, 0, 100));
}
function forcaTimeframe_(direction, ind, maxPoints) {
  const gapBps = Math.abs((ind.emaFast - ind.emaSlow) / ind.close) * 10000;
  const distance = direction === 'BUY' ? Math.max(0, ind.rsi - 50) : Math.max(0, 50 - ind.rsi);
  return maxPoints * (limitar_(gapBps / 8, 0, 1) * 0.55 + limitar_(distance / 20, 0, 1) * 0.45);
}
function indicadoresUltimo_(candles) {
  const closes = candles.map(function(c) { return c.close; });
  const fast = emaSerie_(closes, VINSETT_CONFIG.EMA_FAST), slow = emaSerie_(closes, VINSETT_CONFIG.EMA_SLOW);
  const last = candles[candles.length - 1];
  return { close: last.close, volume: last.volume, emaFast: fast[fast.length - 1],
    emaSlow: slow[slow.length - 1], rsi: rsiUltimo_(closes, VINSETT_CONFIG.RSI_LEN),
    atrPct: atrPctUltimo_(candles, VINSETT_CONFIG.ATR_LEN),
    volumeMean: mediaVolumeUltimo_(candles, VINSETT_CONFIG.VOLUME_LEN) };
}
function emaSerie_(values, length) {
  if (!Array.isArray(values) || values.length < length) throw new Error('Dados insuficientes para EMA.');
  const k = 2 / (length + 1), result = [];
  let prev = 0;
  for (let i = 0; i < length; i += 1) prev += values[i];
  prev /= length;
  for (let i = 0; i < length - 1; i += 1) result.push(null);
  result.push(prev);
  for (let i = length; i < values.length; i += 1) {
    prev = values[i] * k + prev * (1 - k); result.push(prev);
  }
  return result;
}
function rsiUltimo_(closes, length) {
  if (closes.length < length + 2) throw new Error('Dados insuficientes para RSI.');
  let gains = 0, losses = 0;
  for (let i = closes.length - length; i < closes.length; i += 1) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gains += change; else losses -= change;
  }
  const avgGain = gains / length, avgLoss = losses / length;
  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;
  return 100 - 100 / (1 + avgGain / avgLoss);
}
function atrPctUltimo_(candles, length) {
  if (candles.length < length + 1) throw new Error('Dados insuficientes para ATR.');
  let sum = 0;
  for (let i = candles.length - length; i < candles.length; i += 1) {
    const c = candles[i], prev = candles[i - 1].close;
    sum += Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev));
  }
  return (sum / length / candles[candles.length - 1].close) * 100;
}
function mediaVolumeUltimo_(candles, length) {
  if (candles.length < length) throw new Error('Dados insuficientes para volume.');
  let sum = 0;
  for (let i = candles.length - length; i < candles.length; i += 1) sum += candles[i].volume;
  return sum / length;
}
function limitar_(v, min, max) { return Math.max(min, Math.min(max, Number(v))); }

// === FILA PERSISTENTE, COMPATIVEL COM VINSETT_WL1_ ===
function ativoRegistro_(r) { return ativo_(r.v === 1 ? 'BTC' : r.asset); }
function idRegistro_(r) { return ativoRegistro_(r).code + '_' + r.start; }
function chaveRegistro_(r) {
  return r.v === 1 ? VINSETT_KEYS.LEGACY_PREFIX + r.start : VINSETT_KEYS.QUEUE_PREFIX + idRegistro_(r);
}
function finalizado_(r) { return r.state === 'CONCLUIDO' || r.state === 'CANCELADO_ANTES_ENVIO'; }
function historicoSujo_(r) { return (r.archivedRevision || 0) < (r.revision || 1); }
function validarRegistro_(r) {
  const states = ['ENVIANDO_SINAL', 'AGUARDANDO_VELA', 'ENVIANDO_RESULTADO',
    'ENTREGA_INCERTA_SINAL', 'ENTREGA_INCERTA_RESULTADO', 'CONCLUIDO', 'CANCELADO_ANTES_ENVIO'];
  if (!r || [1, 2].indexOf(r.v) < 0 || !Number.isSafeInteger(r.start) || r.start <= 0 ||
      r.start % 60000 !== 0 || r.end !== r.start + 60000 || !r.chatId ||
      ['BUY', 'SELL'].indexOf(r.direction) < 0 || ['COINBASE', 'KRAKEN'].indexOf(r.source) < 0 ||
      states.indexOf(r.state) < 0) throw new Error('Registro WIN/LOSS invalido. Nao apague a fila.');
  const a = ativoRegistro_(r);
  if (r.pair !== a.pair || r.symbol !== simbolo_(r.source, a))
    throw new Error('Ativo/simbolo do registro diverge da configuracao. Nao altere registros pendentes.');
  if (['AGUARDANDO_VELA', 'ENVIANDO_RESULTADO', 'ENTREGA_INCERTA_RESULTADO', 'CONCLUIDO'].indexOf(r.state) >= 0 &&
      (!Number.isSafeInteger(r.signalMessageId) || r.signalMessageId <= 0))
    throw new Error('Registro sem confirmacao identificavel do sinal.');
  if (r.v === 2 && (!Number.isFinite(r.score) || r.score < 0 || r.score > 100))
    throw new Error('Score do registro invalido.');
  if (['ENVIANDO_RESULTADO', 'ENTREGA_INCERTA_RESULTADO', 'CONCLUIDO'].indexOf(r.state) >= 0 && !r.result)
    throw new Error('Estado do registro exige resultado armazenado.');
  if (r.result) {
    if (['WIN', 'LOSS', 'EMPATE', 'INCONCLUSIVO'].indexOf(r.result.outcome) < 0)
      throw new Error('Resultado armazenado invalido.');
    if (r.result.outcome !== 'INCONCLUSIVO' &&
        (!Number.isFinite(r.result.open) || !Number.isFinite(r.result.close) || r.result.open <= 0 || r.result.close <= 0))
      throw new Error('Precos do resultado invalido.');
  }
}
function gravarRegistroBruto_(r) {
  validarRegistro_(r);
  const json = JSON.stringify(r);
  if (Utilities.newBlob(json).getBytes().length > 7500) throw new Error('Registro excede o limite seguro.');
  propriedades_().setProperty(chaveRegistro_(r), json);
}
function salvarRegistro_(r) {
  r.revision = (r.revision || 0) + 1;
  gravarRegistroBruto_(r);
}
function listarRegistros_() {
  const all = propriedades_().getProperties(), list = [], ids = {};
  Object.keys(all).forEach(function(k) {
    const legacy = k.indexOf(VINSETT_KEYS.LEGACY_PREFIX) === 0;
    const current = k.indexOf(VINSETT_KEYS.QUEUE_PREFIX) === 0;
    if (!legacy && !current) return;
    if (legacy && !/^\d+$/.test(k.slice(VINSETT_KEYS.LEGACY_PREFIX.length))) return;
    let r;
    try { r = JSON.parse(all[k]); }
    catch (erro) { throw new Error('Fila corrompida: ' + k + '. Nao apague registros.'); }
    validarRegistro_(r);
    if (chaveRegistro_(r) !== k) throw new Error('Chave inconsistente na fila: ' + k);
    if (ids[idRegistro_(r)]) throw new Error('Dois registros para o mesmo ativo/minuto. Revisao manual necessaria.');
    ids[idRegistro_(r)] = true;
    list.push(r);
  });
  return list.sort(function(a, b) { return a.start - b.start || idRegistro_(a).localeCompare(idRegistro_(b)); });
}
function limparArquivados_() {
  const done = listarRegistros_().filter(function(r) { return finalizado_(r) && !historicoSujo_(r); });
  const excess = done.length - VINSETT_CONFIG.KEEP_DONE;
  // Somente cache operacional PROPRIO, ja confirmado na planilha. Nunca apaga historico.
  for (let i = 0; i < excess; i += 1) propriedades_().deleteProperty(chaveRegistro_(done[i]));
}
function normalizarEnviosInterrompidos_() {
  listarRegistros_().forEach(function(r) {
    if (r.state !== 'ENVIANDO_SINAL' && r.state !== 'ENVIANDO_RESULTADO') return;
    r.state = r.state === 'ENVIANDO_SINAL' ? 'ENTREGA_INCERTA_SINAL' : 'ENTREGA_INCERTA_RESULTADO';
    r.error = 'Execucao interrompida durante envio; confira a mensagem no Telegram. Sem reenvio automatico.';
    salvarRegistro_(r);
  });
}
function avaliarVela_(r, candles, now) {
  validarRegistro_(r);
  if (now < r.end + VINSETT_CONFIG.SETTLE_DELAY_MS) throw new Error('Vela ainda nao encerrada com margem.');
  if (!Array.isArray(candles)) throw new Error('Historico de velas invalido.');
  const exact = candles.filter(function(c) { return c && c.openTime === r.start; });
  if (exact.length !== 1) throw new Error('Vela exata ausente ou duplicada.');
  const c = exact[0];
  validarOHLC_(c, 60000);
  if (c.closeTime !== r.end - 1 || c.closeTime >= now) throw new Error('Horario de apuracao invalido.');
  let outcome = 'EMPATE';
  if (c.close !== c.open) {
    const win = r.direction === 'BUY' ? c.close > c.open : c.close < c.open;
    outcome = win ? 'WIN' : 'LOSS';
  }
  return { outcome: outcome, open: c.open, high: c.high, low: c.low, close: c.close,
    volume: c.volume, assessedAt: now };
}
function processarResultados_(ctx) {
  const deadline = Date.now() + VINSETT_CONFIG.RESULT_BUDGET_MS;
  const waiting = listarRegistros_().filter(function(r) {
    return r.state === 'AGUARDANDO_VELA' && Date.now() >= r.end + VINSETT_CONFIG.SETTLE_DELAY_MS;
  });
  const specs = waiting.filter(function(r) { return !r.late; }).map(function(r) {
    return { asset: ativoRegistro_(r), source: r.source, minutes: 1 };
  });
  carregarLoteMercado_(specs, ctx);
  let attempted = 0;
  for (let i = 0; i < waiting.length; i += 1) {
    if (Date.now() >= deadline || !prazoDisponivel_(ctx) || attempted >= VINSETT_CONFIG.MAX_RESULT_POSTS) break;
    const r = waiting[i];
    let result;
    if (r.late) result = { outcome: 'INCONCLUSIVO', reason: 'Sinal publicado depois do inicio anunciado.' };
    else {
      try {
        // Nao usa fallback nem limite de atualidade sobre uma vela historica de apuracao.
        result = avaliarVela_(r, obterVelas_(ativoRegistro_(r), r.source, 1, ctx), Date.now());
      } catch (erro) {
        ctx.hasErrors = true;
        const message = erroSeguro_(erro);
        if (Date.now() < r.end + VINSETT_CONFIG.RESULT_WAIT_MS) {
          if (r.error !== message) { r.error = message; salvarRegistro_(r); }
          console.log('RESULTADO PENDENTE | ' + idRegistro_(r) + ' | ' + message);
          continue;
        }
        result = { outcome: 'INCONCLUSIVO', reason: 'Vela exata da fonte original indisponivel/invalida apos 30 minutos.' };
      }
    }
    r.result = result; r.state = 'ENVIANDO_RESULTADO'; r.resultAttemptAt = Date.now();
    salvarRegistro_(r); // Falha aqui: nenhum envio externo foi iniciado.
    attempted += 1;
    try {
      const message = enviarMensagem_(r.chatId, mensagemResultado_(r), r.signalMessageId);
      r.resultMessageId = message.message_id; r.finishedAt = Date.now(); r.state = 'CONCLUIDO';
      delete r.error; salvarRegistro_(r);
      console.log('RESULTADO | ' + idRegistro_(r) + ' | ' + result.outcome);
    } catch (erro) {
      ctx.hasErrors = true;
      r.state = 'ENTREGA_INCERTA_RESULTADO'; r.error = erroSeguro_(erro);
      salvarRegistro_(r);
      notificarErroComCooldown_('Resultado ' + idRegistro_(r), new Error('Entrega incerta. Confira o grupo; nao reenviamos automaticamente.'));
    }
  }
}

function publicarSinal_(a, multi, analysis, target, ctx) {
  const p = propriedades_();
  const r = { v: 2, asset: a.code, start: target, end: target + 60000,
    source: multi.source, symbol: simbolo_(multi.source, a), pair: a.pair,
    direction: analysis.direction, score: analysis.score, version: VINSETT_CONFIG.VERSION,
    chatId: String(p.getProperty(VINSETT_KEYS.CHANNEL_ID)).trim(), createdAt: Date.now(),
    state: 'ENVIANDO_SINAL', analysis: { at: Date.now(), price: analysis.price,
      buyScore: analysis.buyScore, sellScore: analysis.sellScore, ages: analysis.ages,
      volumeFactor: analysis.volumeFactor, indicators: analysis.indicators } };
  salvarRegistro_(r);
  // Recheca tambem depois de persistir: a gravacao pode demorar.
  if (Math.floor((target - Date.now()) / 1000) < VINSETT_CONFIG.MIN_LEAD_SECONDS || !prazoDisponivel_(ctx)) {
    r.state = 'CANCELADO_ANTES_ENVIO'; r.error = 'Antecedencia insuficiente apos gravacao; nao publicado.';
    salvarRegistro_(r); return 'SEM_ANTECEDENCIA';
  }
  try {
    const msg = enviarMensagem_(r.chatId, mensagemSinal_(r), null);
    r.signalMessageId = msg.message_id;
    if (msg.chat && msg.chat.id !== undefined) r.chatId = String(msg.chat.id);
    r.sentAt = Number.isFinite(Number(msg.date)) && Number(msg.date) > 0 ? Number(msg.date) * 1000 : Date.now();
    r.late = r.sentAt >= r.start;
    r.state = 'AGUARDANDO_VELA'; salvarRegistro_(r);
  } catch (erro) {
    ctx.hasErrors = true;
    r.state = 'ENTREGA_INCERTA_SINAL'; r.error = erroSeguro_(erro); salvarRegistro_(r);
    notificarErroComCooldown_('Sinal ' + idRegistro_(r), new Error('Entrega incerta; confira o grupo e statusWinLossVinsett.'));
    return 'ENTREGA_INCERTA';
  }
  const values = {};
  values[chaveAtivo_('LAST_SIGNAL_TIME', a.code)] = String(r.start);
  values[VINSETT_KEYS.LAST_SIGNAL] = JSON.stringify({ asset: a.code, pair: a.pair,
    direction: r.direction, score: r.score, source: r.source, reference: tickerTradingView_(r.source, a),
    targetStart: r.start, sentAt: r.sentAt, price: analysis.price });
  if (a.code === 'BTC') values.VINSETT_LAST_SIGNAL_TIME = String(r.start);
  p.setProperties(values);
  console.log('SINAL REGISTRADO | ' + idRegistro_(r) + ' | ' + r.direction + ' | ' + r.score + '/100');
  return 'SINAL_ENVIADO';
}

function cicloVinsett() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1500)) return;
  reiniciarPropriedades_();
  const ctx = novoContexto_();
  let failed = false;
  try {
    const p = propriedades_();
    if (p.getProperty(VINSETT_KEYS.READY) !== VINSETT_CONFIG.VERSION ||
        p.getProperty(VINSETT_KEYS.MAINTENANCE) !== 'false') {
      console.log('MANUTENCAO: execute configurarSistema, testarSistemaCompleto e retomarSistema.'); return;
    }
    p.setProperty(VINSETT_KEYS.LAST_CYCLE, String(Date.now()));
    validarTelegram_();
    try { processarComandosSeNecessario_(); }
    catch (erro) { console.warn('Comandos privados: ' + erroSeguro_(erro)); }
    normalizarEnviosInterrompidos_();
    let historyOk = true;
    try {
      const currentBook = obterHistorico_(Date.now(), ctx, true);
      sincronizarHistorico_(ctx);
      if (!sistemaPausado_()) verificarEscritaHistorico_(currentBook);
    }
    catch (erro) {
      historyOk = false; failed = true;
      console.error('HISTORICO: ' + erroSeguro_(erro));
      notificarErroComCooldown_('Historico', new Error('Falha de gravacao. Novos sinais bloqueados; fila preservada.'));
    }
    processarResultados_(ctx); // Continua quando novos sinais estiverem PAUSADOS.
    if (sistemaPausado_() || !historyOk || !prazoDisponivel_(ctx)) return;
    const list = listarRegistros_();
    if (list.filter(function(r) { return !finalizado_(r); }).length >= VINSETT_CONFIG.MAX_PENDING ||
        list.filter(historicoSujo_).length >= VINSETT_CONFIG.MAX_UNARCHIVED) {
      console.warn('FILA CHEIA: novos sinais bloqueados. Consulte statusWinLossVinsett.'); return;
    }
    const target = (Math.floor(Date.now() / 60000) + 1) * 60000;
    // Alterna a prioridade para nenhum ativo ficar sempre por ultimo em ciclos lentos.
    const shift = Math.floor(Date.now() / 60000) % VINSETT_ATIVOS.length;
    const assets = VINSETT_ATIVOS.slice(shift).concat(VINSETT_ATIVOS.slice(0, shift));
    carregarLoteMercado_([].concat.apply([], assets.map(function(a) {
      return specsPacote_(a, fonteAtual_(a));
    })), ctx);
    let sent = 0;
    assets.forEach(function(a) {
      const targetKey = chaveAtivo_('LAST_TARGET', a.code);
      if (p.getProperty(targetKey) === String(target)) return;
      p.setProperty(targetKey, String(target));
      let multi = null, analysis = null, decision = '', error = '';
      try {
        const fullQueue = listarRegistros_();
        if (fullQueue.filter(function(r) { return !finalizado_(r); }).length >= VINSETT_CONFIG.MAX_PENDING) {
          decision = 'FILA_CHEIA'; return;
        }
        const records = fullQueue.filter(function(r) { return ativoRegistro_(r).code === a.code; });
        if (records.some(function(r) { return r.start === target; })) { decision = 'JA_REGISTRADO'; return; }
        if (records.some(function(r) { return r.state.indexOf('INCERTA') >= 0; })) {
          ctx.hasErrors = true; decision = 'ENTREGA_INCERTA_PENDENTE'; return;
        }
        if (!prazoDisponivel_(ctx) || Math.floor((target - Date.now()) / 1000) < VINSETT_CONFIG.MIN_LEAD_SECONDS) {
          decision = 'SEM_ANTECEDENCIA'; return;
        }
        multi = buscarMultiTimeframeComFallback_(a, ctx);
        analysis = analisarMercado_(multi, Date.now());
        if (!analysis.signal) { decision = 'SEM_SINAL'; return; }
        const last = Math.max(Number(p.getProperty(chaveAtivo_('LAST_SIGNAL_TIME', a.code)) || 0),
          records.reduce(function(n, r) { return r.signalMessageId ? Math.max(n, r.start) : n; }, 0));
        if (target - last < VINSETT_CONFIG.COOLDOWN_MINUTES * 60000) { decision = 'COOLDOWN'; return; }
        if (sent >= VINSETT_CONFIG.MAX_NEW_SIGNALS) { decision = 'LIMITE_DO_CICLO'; return; }
        // Todos os timeframes e o horario sao verificados de novo antes da publicacao.
        validarMulti_(multi, Date.now());
        if (Math.floor((target - Date.now()) / 1000) < VINSETT_CONFIG.MIN_LEAD_SECONDS) {
          decision = 'SEM_ANTECEDENCIA'; return;
        }
        decision = publicarSinal_(a, multi, analysis, target, ctx);
        sent += 1;
      } catch (erro) {
        failed = true; decision = 'ERRO'; error = erroSeguro_(erro);
        console.error(a.code + ': ' + error);
      } finally { registrarDiagnostico_(a, multi, analysis, decision, error, ctx); }
    });
  } catch (erro) {
    failed = true; console.error(erroSeguro_(erro)); notificarErroComCooldown_('ciclo', erro);
  } finally {
    try {
      if (propriedades_().getProperty(VINSETT_KEYS.READY) === VINSETT_CONFIG.VERSION &&
          propriedades_().getProperty(VINSETT_KEYS.MAINTENANCE) === 'false') {
        sincronizarHistorico_(ctx); gravarDiagnosticos_(ctx); limparArquivados_();
      }
    } catch (erro) { failed = true; console.error('Fila preservada; historico pendente: ' + erroSeguro_(erro)); }
    try { propriedades_().setProperties({ VINSETT_V5_LAST_FINISH: String(Date.now()),
      VINSETT_V5_LAST_DURATION_MS: String(Date.now() - ctx.start), VINSETT_V5_LAST_HEALTH: failed || ctx.hasErrors ? 'COM_ERROS' : 'OK' }); }
    finally { lock.releaseLock(); }
  }
}

// === HISTORICO MENSAL — NAO APAGA LINHAS OU PLANILHAS ANTERIORES ===
function cabecalhoSinais_() {
  return ['ID', 'Ativo', 'Par', 'Fonte', 'Simbolo', 'Direcao', 'Score_100', 'Criado_Manaus',
    'Publicado_Manaus', 'Entrada_Manaus', 'Fim_M1_Manaus', 'Estado_entrega', 'Resultado_referencia',
    'Abertura', 'Maxima', 'Minima', 'Fechamento', 'Volume_vela', 'Apurado_Manaus', 'Resultado_enviado_Manaus',
    'ID_mensagem_sinal', 'ID_mensagem_resultado', 'Chat_destino', 'Versao', 'Score_BUY', 'Score_SELL',
    'Idade_M1_s', 'Idade_M5_s', 'Idade_M15_s', 'RSI_M1', 'RSI_M5', 'RSI_M15', 'Fator_volume_M1',
    'ATR_M1_pct', 'Preco_analise', 'Erro_ou_observacao', 'URL_dados', 'Revisao', 'Indicadores_JSON', 'Inicio_UNIX_ms'];
}
function cabecalhoDiagnosticos_() {
  return ['ID', 'Hora_Manaus', 'Ativo', 'Fonte', 'Decisao', 'Score_BUY', 'Score_SELL',
    'Bloqueios_BUY', 'Bloqueios_SELL', 'Erro', 'Idade_M1_s', 'Idade_M5_s', 'Idade_M15_s',
    'RSI_M1', 'RSI_M5', 'RSI_M15', 'EMA9_M1', 'EMA21_M1', 'Fator_volume_M1', 'ATR_M1_pct',
    'Preco_analise', 'Score_minimo', 'Versao', 'URL_dados'];
}
function mesHistorico_(stamp) { return Utilities.formatDate(new Date(stamp), VINSETT_CONFIG.TIMEZONE, 'yyyyMM'); }
function validarCabecalho_(sheet, expected) {
  if (!sheet || sheet.getLastRow() < 1) throw new Error('Aba de historico ausente ou sem cabecalho.');
  const actual = sheet.getRange(1, 1, 1, expected.length).getValues()[0];
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error('Cabecalho alterado em ' + sheet.getName() + '. Restaure-o antes de retomar.');
}
function capacidadeLinhas_(sheet, finalRow, columns) {
  if (sheet.getMaxColumns() < columns) sheet.insertColumnsAfter(sheet.getMaxColumns(), columns - sheet.getMaxColumns());
  if (sheet.getMaxRows() < finalRow) sheet.insertRowsAfter(sheet.getMaxRows(), Math.max(1000, finalRow - sheet.getMaxRows()));
}
function prepararAbaHistorico_(book, name, headers) {
  let sheet = book.getSheetByName(name);
  if (!sheet) sheet = book.insertSheet(name);
  capacidadeLinhas_(sheet, 1000, headers.length);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1); sheet.setFrozenColumns(3); sheet.setHiddenGridlines(true);
    sheet.getRange(1, 1, 1, headers.length).setBackground('#173D56').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.setRowHeight(1, 44); sheet.getRange(1, 1, 1, headers.length).setWrap(true);
    sheet.setColumnWidths(1, headers.length, 145); sheet.setColumnWidth(1, 205);
    if (name === 'Sinais') {
      [8, 9, 10, 11, 19, 20].forEach(function(col) {
        sheet.getRange(2, col, sheet.getMaxRows() - 1, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
        sheet.setColumnWidth(col, 165);
      });
      sheet.getRange(2, 14, sheet.getMaxRows() - 1, 5).setNumberFormat('0.###############');
      sheet.setColumnWidth(12, 230); sheet.setColumnWidth(36, 360); sheet.setColumnWidth(39, 360);
    } else {
      sheet.getRange(2, 2, sheet.getMaxRows() - 1, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
      [8, 9, 10].forEach(function(col) { sheet.setColumnWidth(col, 340); });
    }
    sheet.getRange(1, 1, sheet.getMaxRows(), headers.length).createFilter();
  }
  validarCabecalho_(sheet, headers); return sheet;
}
function inicializarLivro_(book) {
  book.setSpreadsheetTimeZone(VINSETT_CONFIG.TIMEZONE); book.setSpreadsheetLocale('pt_BR');
  let info = book.getSheetByName('LeiaMe');
  if (!info) {
    const sheets = book.getSheets();
    if (sheets.length === 1 && sheets[0].getLastRow() === 0) info = sheets[0].setName('LeiaMe');
    else info = book.insertSheet('LeiaMe');
  }
  if (info.getLastRow() === 0) {
    const rows = [
      ['VINSETT_V5_HISTORY', 'Historico operacional — BTC, ETH e SOL — versao 5.0.0'],
      ['Escopo', 'APENAS REFERENCIA: nao confirma operacoes ou pagamentos na Ebinex. Nao usa OTC.'],
      ['Sinais', 'Uma linha por ativo/minuto; atualizada com a entrega e o resultado. Nao remova a coluna ID.'],
      ['Diagnostico', 'Motivos por mudanca de estado/filtro ou a cada 5 minutos. Console: cada analise.'],
      ['Score', '0 a 100: pontuacao tecnica; NAO e probabilidade de acerto. Minimo atual: 78.'],
      ['Avaliacao', 'BUY: fechar acima da abertura = WIN. SELL: abaixo = WIN. Igual = EMPATE.'],
      ['INCONCLUSIVO', 'Vela exata invalida/indisponivel apos 30 min ou sinal publicado depois da entrada.'],
      ['Entrega incerta', 'Pode ter sido entregue. Nao reenviamos automaticamente. Confira o ID no Telegram.'],
      ['Fuso horario', VINSETT_CONFIG.TIMEZONE + '; datas tipadas, sem conversao para texto.'],
      ['Fontes', 'USD spot: Coinbase Exchange e Kraken. Apuracao sempre na fonte fixada no sinal.'],
      ['Leitura', 'M15 + M5 -> M1. EMA 9/21; RSI 14; ATR 14; media de volume 20.'],
      ['Atualidade', 'M1 <=120s; M5 <=420s; M15 <=1020s; series sem lacunas ou duplicacoes.'],
      ['Risco', 'Tres ativos podem sinalizar juntos e estar correlacionados. Nao e diversificacao garantida.'],
      ['Continuacao', 'Novo livro por mes (Manaus). Execute abrirHistorico para listar os enderecos.'],
      ['Interrupcoes', 'Novos sinais param quando nao ha gravacao segura. Resultados pendentes continuam na fila.'],
      ['Migracao', 'Importa apenas os registros ainda presentes em VINSETT_WL1_. Nao reconstrui sinais perdidos.'],
      ['Cotas', 'O Apps Script possui cotas de tempo, propriedades e HTTP. Servico continuo nao e garantido.'],
      ['Coinbase', 'https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles'],
      ['Kraken', 'https://docs.kraken.com/api-reference/market-data/get-ohlc-data'],
      ['Google', 'https://developers.google.com/apps-script/guides/services/quotas']
    ];
    info.getRange(1, 1, rows.length, 2).setValues(rows); info.setFrozenRows(1); info.setHiddenGridlines(true);
    info.setColumnWidth(1, 170); info.setColumnWidth(2, 730);
    info.getRange(1, 1, 1, 2).setBackground('#173D56').setFontColor('#FFFFFF').setFontWeight('bold');
    info.getRange(1, 1, rows.length, 2).setWrap(true); info.setRowHeights(1, rows.length, 44);
  }
  if (info.getRange(1, 1).getValue() !== 'VINSETT_V5_HISTORY') throw new Error('Planilha nao pertence ao historico VINSETT.');
  prepararAbaHistorico_(book, 'Sinais', cabecalhoSinais_());
  prepararAbaHistorico_(book, 'Diagnostico', cabecalhoDiagnosticos_());
  SpreadsheetApp.flush();
}
function obterHistorico_(stamp, ctx, allowCreate) {
  const month = mesHistorico_(stamp);
  if (ctx.books[month]) return ctx.books[month];
  const p = propriedades_(), key = VINSETT_KEYS.HISTORY_PREFIX + month;
  let entry = null;
  if (p.getProperty(key)) {
    try { entry = JSON.parse(p.getProperty(key)); }
    catch (erro) { throw new Error('Referencia do historico corrompida: ' + month); }
  }
  let book;
  if (!entry) {
    if (!allowCreate) throw new Error('Historico nao configurado. Execute configurarSistema.');
    // Marcador evita criar varios livros caso a resposta da criacao se perca.
    p.setProperty(key, JSON.stringify({ status: 'CRIANDO', since: Date.now() }));
    book = SpreadsheetApp.create('VINSETT — BTC ETH SOL — ' + month.slice(0, 4) + '-' + month.slice(4));
    entry = { status: 'INICIALIZANDO', id: book.getId() }; p.setProperty(key, JSON.stringify(entry));
  }
  if (!entry.id) throw new Error('Criacao do historico ficou incerta. Verifique seu Google Drive; nao recrie/apague a referencia automaticamente.');
  if (!book) book = SpreadsheetApp.openById(entry.id);
  if (entry.status === 'INICIALIZANDO') {
    if (!allowCreate) throw new Error('Inicializacao pendente. Execute configurarSistema novamente.');
    inicializarLivro_(book); entry.status = 'PRONTO'; p.setProperty(key, JSON.stringify(entry));
  }
  if (entry.status !== 'PRONTO') throw new Error('Historico em estado desconhecido.');
  const signals = book.getSheetByName('Sinais'), diagnostics = book.getSheetByName('Diagnostico'), info = book.getSheetByName('LeiaMe');
  if (!info || info.getRange(1, 1).getValue() !== 'VINSETT_V5_HISTORY') throw new Error('Identificacao da planilha VINSETT ausente.');
  validarCabecalho_(signals, cabecalhoSinais_()); validarCabecalho_(diagnostics, cabecalhoDiagnosticos_());
  ctx.books[month] = { book: book, signals: signals, diagnostics: diagnostics, info: info, index: null, next: 0 };
  return ctx.books[month];
}
function verificarEscritaHistorico_(book) {
  // Celulas reservadas em LeiaMe: confirma permissao/servico ANTES de novos sinais.
  book.info.getRange(22, 1, 1, 2).setValues([['Ultima verificacao de escrita', new Date(Date.now())]]);
  book.info.getRange(22, 2).setNumberFormat('yyyy-mm-dd hh:mm:ss');
  SpreadsheetApp.flush();
}
function dataCelula_(n) { return Number.isFinite(n) && n > 0 ? new Date(n) : ''; }
function valorCelula_(v) {
  if (v === undefined || v === null) return '';
  // APIs ou erros nao podem injetar formulas no historico.
  if (typeof v === 'string') return /^[=+@-]/.test(v) ? "'" + v : v;
  return v;
}
function linhaSinal_(r) {
  const a = ativoRegistro_(r), result = r.result || {}, analysis = r.analysis || {},
    ind = analysis.indicators || {}, ages = analysis.ages || {},
    m1 = ind.m1 || {}, m5 = ind.m5 || {}, m15 = ind.m15 || {};
  return [idRegistro_(r), a.code, r.pair, r.source, r.symbol, r.direction, r.score,
    dataCelula_(r.createdAt), dataCelula_(r.sentAt), dataCelula_(r.start), dataCelula_(r.end),
    r.state, result.outcome, result.open, result.high, result.low, result.close, result.volume,
    dataCelula_(result.assessedAt), dataCelula_(r.finishedAt), r.signalMessageId, r.resultMessageId,
    r.chatId, r.version || '4.0.1 + WL1', analysis.buyScore, analysis.sellScore,
    ages.m1, ages.m5, ages.m15, m1.rsi, m5.rsi, m15.rsi, analysis.volumeFactor, m1.atrPct,
    analysis.price, r.error || result.reason || '', urlMercado_(r.source, a, 1), r.revision || 1,
    JSON.stringify(ind), r.start].map(valorCelula_);
}
function indiceSinais_(book) {
  if (book.index) return;
  book.index = {};
  const last = book.signals.getLastRow(); book.next = Math.max(2, last + 1);
  if (last < 2) return;
  book.signals.getRange(2, 1, last - 1, 1).getValues().forEach(function(row, i) {
    if (!row[0]) return;
    const id = String(row[0]);
    if (book.index[id]) throw new Error('ID duplicado no historico: ' + id + '. Revisao manual necessaria.');
    book.index[id] = i + 2;
  });
}
function sincronizarHistorico_(ctx) {
  const dirty = listarRegistros_().filter(historicoSujo_).slice(0, 12);
  if (!dirty.length) return;
  const groups = {};
  dirty.forEach(function(r) {
    const month = mesHistorico_(r.start);
    if (!groups[month]) groups[month] = [];
    groups[month].push(r);
  });
  Object.keys(groups).forEach(function(month) {
    const records = groups[month], book = obterHistorico_(records[0].start, ctx, true);
    indiceSinais_(book);
    const writes = records.map(function(r) {
      const id = idRegistro_(r);
      if (!book.index[id]) book.index[id] = book.next++;
      return { row: book.index[id], values: linhaSinal_(r) };
    }).sort(function(a, b) { return a.row - b.row; });
    capacidadeLinhas_(book.signals, book.next - 1, cabecalhoSinais_().length);
    let i = 0;
    while (i < writes.length) {
      const first = writes[i].row, values = [writes[i].values]; i += 1;
      while (i < writes.length && writes[i].row === first + values.length) { values.push(writes[i].values); i += 1; }
      book.signals.getRange(first, 1, values.length, cabecalhoSinais_().length).setValues(values);
      book.signals.getRange(first, 14, values.length, 5).setNumberFormat('0.###############');
      // Inclui linhas novas alem das 1000 iniciais; datas permanecem legiveis.
      [8, 9, 10, 11, 19, 20].forEach(function(col) {
        book.signals.getRange(first, col, values.length, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
      });
    }
    SpreadsheetApp.flush();
    records.forEach(function(r) {
      r.archivedRevision = r.revision || 1;
      gravarRegistroBruto_(r); // Se falhar, a proxima execucao atualiza o mesmo ID.
    });
  });
}
function registrarDiagnostico_(a, multi, analysis, decision, error, ctx) {
  const p = propriedades_(), key = chaveAtivo_('DIAG', a.code);
  let previous = {};
  try { previous = JSON.parse(p.getProperty(key) || '{}'); } catch (ignored) { /* Nao afeta a fila. */ }
  const d = { at: Date.now(), asset: a.code, source: multi ? multi.source : '', decision: decision || 'IGNORADO',
    error: error || '', reasonsBuy: analysis ? analysis.reasonsBuy : [], reasonsSell: analysis ? analysis.reasonsSell : [],
    buyScore: analysis ? analysis.buyScore : null, sellScore: analysis ? analysis.sellScore : null,
    ages: analysis ? analysis.ages : {}, indicators: analysis ? analysis.indicators : {},
    volumeFactor: analysis ? analysis.volumeFactor : null, price: analysis ? analysis.price : null,
    lastSheetAt: previous.lastSheetAt || 0, lastSheetSignature: previous.lastSheetSignature || '' };
  d.signature = JSON.stringify([d.source, d.decision, d.reasonsBuy, d.reasonsSell, d.error]);
  console.log(a.code + ' | ' + d.decision + ' | fonte=' + d.source + ' | BUY=' + d.buyScore + ' SELL=' + d.sellScore +
    ' | bloqueios BUY: ' + d.reasonsBuy.join('; ') + ' | bloqueios SELL: ' + d.reasonsSell.join('; ') + ' | ' + d.error);
  p.setProperty(key, JSON.stringify(d));
  if (d.signature !== d.lastSheetSignature || d.at - d.lastSheetAt >= VINSETT_CONFIG.DIAG_INTERVAL_MS)
    ctx.diagnostics.push(d);
}
function linhaDiagnostico_(d) {
  const m1 = d.indicators.m1 || {}, m5 = d.indicators.m5 || {}, m15 = d.indicators.m15 || {};
  return [d.asset + '_' + Math.floor(d.at / 60000), dataCelula_(d.at), d.asset, d.source, d.decision,
    d.buyScore, d.sellScore, d.reasonsBuy.join('; '), d.reasonsSell.join('; '), d.error,
    d.ages.m1, d.ages.m5, d.ages.m15, m1.rsi, m5.rsi, m15.rsi, m1.emaFast, m1.emaSlow,
    d.volumeFactor, m1.atrPct, d.price, VINSETT_CONFIG.MIN_SCORE, VINSETT_CONFIG.VERSION,
    d.source ? urlMercado_(d.source, ativo_(d.asset), 1) : ''].map(valorCelula_);
}
function gravarDiagnosticos_(ctx) {
  if (!ctx.diagnostics.length) return;
  const groups = {};
  ctx.diagnostics.forEach(function(d) {
    const month = mesHistorico_(d.at); if (!groups[month]) groups[month] = []; groups[month].push(d);
  });
  Object.keys(groups).forEach(function(month) {
    const ds = groups[month], sheet = obterHistorico_(ds[0].at, ctx, true).diagnostics;
    const last = sheet.getLastRow(), count = Math.min(12, Math.max(0, last - 1));
    const ids = count ? sheet.getRange(last - count + 1, 1, count, 1).getValues().map(function(r) { return r[0]; }) : [];
    const rows = ds.map(linhaDiagnostico_).filter(function(row) {
      if (ids.indexOf(row[0]) >= 0) return false; ids.push(row[0]); return true;
    });
    if (rows.length) {
      capacidadeLinhas_(sheet, last + rows.length, cabecalhoDiagnosticos_().length);
      sheet.getRange(last + 1, 1, rows.length, cabecalhoDiagnosticos_().length).setValues(rows);
      sheet.getRange(last + 1, 2, rows.length, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
      SpreadsheetApp.flush();
    }
    ds.forEach(function(d) {
      d.lastSheetAt = d.at; d.lastSheetSignature = d.signature;
      propriedades_().setProperty(chaveAtivo_('DIAG', d.asset), JSON.stringify(d));
    });
  });
  ctx.diagnostics = [];
}

// === TELEGRAM E CONTROLE PRIVADO ===
function escapeHtml_(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function erroSeguro_(erro) {
  let message = String(erro && erro.message ? erro.message : erro);
  const token = String(propriedades_().getProperty(VINSETT_KEYS.TOKEN) || '').trim();
  if (token) message = message.split(token).join('[TOKEN OCULTO]');
  return message.replace(/(?:bot)?\d{5,}:[A-Za-z0-9_-]+/g, '[TOKEN OCULTO]').slice(0, 500);
}
function formatarDataHora_(stamp) {
  return Utilities.formatDate(new Date(stamp), VINSETT_CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm:ss');
}
function validarTelegram_() {
  const p = propriedades_();
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(String(p.getProperty(VINSETT_KEYS.TOKEN) || '').trim()))
    throw new Error('TELEGRAM_BOT_TOKEN ausente ou invalido nas Propriedades do script.');
  if (!String(p.getProperty(VINSETT_KEYS.CHANNEL_ID) || '').trim()) throw new Error('TELEGRAM_CHANNEL_ID ausente.');
  const privateId = String(p.getProperty(VINSETT_KEYS.CHAT_ID) || '').trim();
  if (privateId && !/^[1-9]\d*$/.test(privateId))
    throw new Error('TELEGRAM_CHAT_ID opcional deve ser o ID positivo da sua conversa PRIVADA com o bot, nao o grupo.');
}
function telegramApi_(method, payload) {
  if (['sendMessage', 'getMe', 'getChat', 'getChatMember', 'getUpdates', 'getWebhookInfo'].indexOf(method) < 0)
    throw new Error('Metodo Telegram nao permitido por esta versao.');
  const token = String(propriedades_().getProperty(VINSETT_KEYS.TOKEN) || '').trim();
  if (!token) throw new Error('Token nao configurado.');
  let response;
  try {
    response = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + method, {
      method: 'post', contentType: 'application/json', payload: JSON.stringify(payload || {}),
      muteHttpExceptions: true, followRedirects: false
    });
  } catch (erro) { throw new Error(erroSeguro_(erro)); }
  let parsed;
  try { parsed = JSON.parse(response.getContentText()); }
  catch (erro) { throw new Error('Resposta Telegram invalida; entrega nao confirmada.'); }
  if (response.getResponseCode() !== 200 || !parsed || !parsed.ok)
    throw new Error('Telegram ' + method + ': ' + erroSeguro_(parsed && parsed.description ? parsed.description : response.getResponseCode()));
  return parsed;
}
function enviarMensagem_(chatId, text, replyId) {
  const payload = { chat_id: chatId, text: text, parse_mode: 'HTML', link_preview_options: { is_disabled: true } };
  if (replyId) payload.reply_parameters = { message_id: replyId, allow_sending_without_reply: true };
  const response = telegramApi_('sendMessage', payload);
  if (!response || !response.ok || !response.result || !Number.isSafeInteger(response.result.message_id) || response.result.message_id <= 0)
    throw new Error('Telegram nao confirmou ID de mensagem. Nao reenviar automaticamente.');
  return response.result;
}
function mensagemSinal_(r) {
  return '<b>🚨 VINSETT — SINAL DE REFERÊNCIA</b>\n\n' +
    '💱 <b>ATIVO:</b> ' + escapeHtml_(r.pair) + '\n' +
    '📊 <b>DIREÇÃO:</b> ' + r.direction + (r.direction === 'BUY' ? ' 🟢' : ' 🔴') + '\n' +
    '🔎 M15 + M5 → M1\n' +
    '🕐 <b>ENTRADA:</b> ' + formatarDataHora_(r.start) + ' (Manaus)\n' +
    '🏁 <b>FIM M1:</b> ' + formatarDataHora_(r.end) + '\n' +
    '🎯 <b>SCORE TÉCNICO:</b> ' + r.score + '/100 — não é probabilidade\n' +
    '📡 <b>FONTE:</b> ' + r.source + ' | ' + escapeHtml_(tickerTradingView_(r.source, ativoRegistro_(r))) + '\n' +
    '🆔 ' + idRegistro_(r) + '\n\n' +
    '⚠️ Somente análise. Aguarde o horário exato. Cotações e resultados podem diferir da Ebinex; não é OTC.';
}
function mensagemResultado_(r) {
  const result = r.result, icons = { WIN: '✅', LOSS: '❌', EMPATE: '➖', INCONCLUSIVO: '⚠️' };
  if (!result || !icons[result.outcome]) throw new Error('Resultado invalido para mensagem.');
  let text = '<b>' + icons[result.outcome] + ' ' + result.outcome + ' — RESULTADO DE REFERÊNCIA</b>\n\n' +
    '💱 ' + escapeHtml_(r.pair) + ' | ' + r.direction + '\n' +
    '🕐 Entrada: ' + formatarDataHora_(r.start) + ' (Manaus)\n' +
    '🏁 Fim M1: ' + formatarDataHora_(r.end) + '\n' +
    '📡 Fonte original: ' + r.source + '\n';
  if (result.outcome === 'INCONCLUSIVO') text += 'Motivo: ' + escapeHtml_(result.reason || 'Dados insuficientes.') + '\n';
  else text += 'Abertura: ' + String(result.open) + '\nFechamento: ' + String(result.close) + '\n';
  return text + '🆔 ' + idRegistro_(r) + '\n\n' +
    '⚠️ Comparação da vela M1 da fonte indicada. Não confirma execução, lucro ou pagamento na Ebinex.';
}
function enviarPrivado_(text) {
  const id = String(propriedades_().getProperty(VINSETT_KEYS.CHAT_ID) || '').trim();
  if (!/^[1-9]\d*$/.test(id)) return;
  return enviarMensagem_(id, text, null);
}
function notificarErroComCooldown_(context, erro) {
  try {
    const p = propriedades_(), id = String(p.getProperty(VINSETT_KEYS.CHAT_ID) || '').trim();
    if (!/^[1-9]\d*$/.test(id)) return;
    if (Date.now() - Number(p.getProperty(VINSETT_KEYS.LAST_ERROR_NOTICE) || 0) < 3600000) return;
    p.setProperty(VINSETT_KEYS.LAST_ERROR_NOTICE, String(Date.now()));
    enviarPrivado_('<b>⚠️ VINSETT — AVISO ADMINISTRATIVO</b>\n' + escapeHtml_(context) + '\n' + escapeHtml_(erroSeguro_(erro)));
  } catch (ignored) { console.warn('Aviso privado nao confirmado. Consulte os registros de execucao.'); }
}
function processarComandosSeNecessario_() {
  const p = propriedades_(), chatId = String(p.getProperty(VINSETT_KEYS.CHAT_ID) || '').trim();
  if (!/^[1-9]\d*$/.test(chatId)) return;
  const count = (Number(p.getProperty(VINSETT_KEYS.COMMAND_COUNTER) || 0) + 1) % VINSETT_CONFIG.COMMAND_POLL_EVERY_CYCLES;
  p.setProperty(VINSETT_KEYS.COMMAND_COUNTER, String(count));
  if (count !== 0) return;
  if (Date.now() - Number(p.getProperty('VINSETT_V5_WEBHOOK_CHECK_AT') || 0) > 600000) {
    const info = telegramApi_('getWebhookInfo', {}).result;
    p.setProperties({ VINSETT_V5_WEBHOOK_CHECK_AT: String(Date.now()), VINSETT_V5_WEBHOOK_ACTIVE: info && info.url ? 'true' : 'false' });
  }
  if (p.getProperty('VINSETT_V5_WEBHOOK_ACTIVE') === 'true') return; // Nao altera integracao de outro servico.
  const response = telegramApi_('getUpdates', { offset: Number(p.getProperty(VINSETT_KEYS.COMMAND_OFFSET) || 0),
    limit: 20, timeout: 0, allowed_updates: ['message'] });
  const updates = Array.isArray(response.result) ? response.result : [];
  updates.forEach(function(update) {
    if (!Number.isSafeInteger(update.update_id)) return;
    p.setProperty(VINSETT_KEYS.COMMAND_OFFSET, String(update.update_id + 1));
    const m = update.message;
    if (!m || !m.chat || m.chat.type !== 'private' || !m.from || String(m.chat.id) !== chatId ||
        String(m.from.id) !== chatId || typeof m.text !== 'string') return;
    const cmd = m.text.trim().toLowerCase().split(/\s+/)[0].split('@')[0];
    if (cmd === '/pausar') { p.setProperty(VINSETT_KEYS.PAUSED, 'true'); enviarPrivado_('⏸ Novos sinais pausados. Resultados pendentes continuam.'); }
    else if (cmd === '/retomar') {
      verificarPronto_(); p.setProperty(VINSETT_KEYS.PAUSED, 'false'); enviarPrivado_('▶️ BTC, ETH e SOL ativos. Somente sinais aprovados pelos filtros.');
    } else if (cmd === '/status') enviarPrivado_(montarStatus_());
    else if (cmd === '/ultimo') enviarPrivado_(montarUltimoSinal_());
    else if (cmd === '/motivos') enviarPrivado_(montarMotivos_());
    else if (cmd === '/historico') enviarPrivado_(montarHistoricos_());
    else if (cmd === '/start' || cmd === '/ajuda') enviarPrivado_('/status /ultimo /motivos /historico /pausar /retomar\nSomente o administrador configurado pode comandar.');
  });
}
function sistemaPausado_() { return propriedades_().getProperty(VINSETT_KEYS.PAUSED) !== 'false'; }
function montarStatus_() {
  const p = propriedades_(), list = listarRegistros_(), last = Number(p.getProperty(VINSETT_KEYS.LAST_CYCLE) || 0);
  const mode = p.getProperty(VINSETT_KEYS.MAINTENANCE) !== 'false' ? 'MANUTENCAO' : (sistemaPausado_() ? 'PAUSADO' : 'ATIVO');
  return '<b>VINSETT v' + VINSETT_CONFIG.VERSION + '</b>\nEstado: ' + mode + '\n' +
    VINSETT_ATIVOS.map(function(a) { return a.pair + ': ' + fonteAtual_(a); }).join('\n') + '\n' +
    'Ultimo inicio: ' + (last ? formatarDataHora_(last) : 'nenhum') + '\n' +
    'Duracao anterior: ' + Number(p.getProperty('VINSETT_V5_LAST_DURATION_MS') || 0) / 1000 + 's\n' +
    'Saude anterior: ' + (p.getProperty('VINSETT_V5_LAST_HEALTH') || 'n/d') + '\n' +
    'Registros nao finalizados: ' + list.filter(function(r) { return !finalizado_(r); }).length + '\n' +
    'Entregas incertas: ' + list.filter(function(r) { return r.state.indexOf('INCERTA') >= 0; }).length + '\n' +
    'Gravacoes pendentes: ' + list.filter(historicoSujo_).length + '\n' +
    'Score minimo: 78/100; intervalo de 2 min POR ATIVO. Resultados sao de referencia.';
}
function montarUltimoSinal_() {
  const raw = propriedades_().getProperty(VINSETT_KEYS.LAST_SIGNAL);
  if (!raw) return 'Nenhum sinal registrado.';
  const r = JSON.parse(raw);
  return '<b>ULTIMO SINAL</b>\n' + escapeHtml_(r.pair || 'BTC/USD') + ' | ' + escapeHtml_(r.direction) + '\n' +
    'Score: ' + r.score + '/100\nFonte: ' + escapeHtml_(r.source) + '\nEntrada: ' + formatarDataHora_(r.targetStart) + ' (Manaus)';
}
function montarMotivos_() {
  return '<b>ULTIMO DIAGNOSTICO POR ATIVO</b>\n' + VINSETT_ATIVOS.map(function(a) {
    const raw = propriedades_().getProperty(chaveAtivo_('DIAG', a.code));
    if (!raw) return a.code + ': ainda nao analisado.';
    const d = JSON.parse(raw);
    return a.code + ' — ' + escapeHtml_(d.decision) + ' (' + formatarDataHora_(d.at) + ')\n' +
      'BUY: ' + escapeHtml_((d.reasonsBuy.join('; ') || 'nenhum bloqueio tecnico').slice(0, 300)) + '\n' +
      'SELL: ' + escapeHtml_((d.reasonsSell.join('; ') || 'nenhum bloqueio tecnico').slice(0, 300)) +
      (d.error ? '\nErro: ' + escapeHtml_(d.error.slice(0, 200)) : '');
  }).join('\n\n');
}
function montarHistoricos_() {
  const all = propriedades_().getProperties();
  const keys = Object.keys(all).filter(function(k) { return /^VINSETT_V5_HISTORY_\d{6}$/.test(k); }).sort().reverse();
  if (!keys.length) return 'Historico ainda nao configurado.';
  return '<b>HISTORICO — ULTIMOS 6 MESES</b>\n' + keys.slice(0, 6).map(function(k) {
    const entry = JSON.parse(all[k]);
    return k.slice(-6) + ': ' + (entry.id ? 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(entry.id) + '/edit' : 'criacao pendente');
  }).join('\n');
}

// === CONFIGURACAO, MIGRACAO E TESTES MANUAIS ===
function comLock_(callback) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('Outro ciclo esta em andamento. Tente novamente.');
  reiniciarPropriedades_();
  try { return callback(); } catch (erro) { throw new Error(erroSeguro_(erro)); }
  finally { lock.releaseLock(); }
}
function assinaturaTeste_() { return VINSETT_CONFIG.VERSION + '|' + VINSETT_ATIVOS.map(function(a) { return a.code; }).join(','); }
function garantirAcionador_() {
  const own = ScriptApp.getProjectTriggers().filter(function(t) { return t.getHandlerFunction() === 'cicloVinsett'; });
  if (!own.length) ScriptApp.newTrigger('cicloVinsett').timeBased().everyMinutes(1).create();
  else own.slice(1).forEach(function(t) { ScriptApp.deleteTrigger(t); }); // Somente duplicatas desta funcao.
  const old = ScriptApp.getProjectTriggers().filter(function(t) { return t.getHandlerFunction() !== 'cicloVinsett'; });
  if (old.length) console.warn('Outros acionadores preservados: ' + old.map(function(t) { return t.getHandlerFunction(); }).join(', ') +
    '. cicloM1 e obsoleto; remova apenas esse acionador antigo. Confirme a finalidade dos demais.');
}
function configurarSistema() {
  return comLock_(function() {
    const p = propriedades_();
    p.setProperties({ VINSETT_PAUSED: 'true', VINSETT_V5_MAINTENANCE: 'true', VINSETT_V5_TEST_OK: '' });
    validarTelegram_();
    listarRegistros_(); // Valida a fila existente antes de qualquer migracao.
    const values = {};
    ['LAST_TARGET', 'LAST_SIGNAL_TIME'].forEach(function(name) {
      const key = chaveAtivo_(name, 'BTC');
      if (!p.getProperty(key) && p.getProperty('VINSETT_' + name)) values[key] = p.getProperty('VINSETT_' + name);
    });
    if (!p.getProperty(chaveAtivo_('SOURCE', 'BTC')) && p.getProperty('VINSETT_MARKET_SOURCE'))
      values[chaveAtivo_('SOURCE', 'BTC')] = fonteAtual_(ativo_('BTC'));
    if (Object.keys(values).length) p.setProperties(values);
    normalizarEnviosInterrompidos_();
    const ctx = novoContexto_();
    const book = obterHistorico_(Date.now(), ctx, true); sincronizarHistorico_(ctx);
    garantirAcionador_();
    p.setProperty(VINSETT_KEYS.READY, VINSETT_CONFIG.VERSION);
    console.log('CONFIGURACAO V5 OK — MANUTENCAO. Nenhuma mensagem enviada.');
    console.log('Historico: ' + book.book.getUrl());
    console.log('Agora execute testarSistemaCompleto; depois testarCanalTelegram e retomarSistema.');
  });
}
function verificarPronto_() {
  const p = propriedades_(); validarTelegram_();
  if (p.getProperty(VINSETT_KEYS.READY) !== VINSETT_CONFIG.VERSION) throw new Error('Execute configurarSistema.');
  if (p.getProperty(VINSETT_KEYS.TEST_OK) !== assinaturaTeste_()) throw new Error('Execute testarSistemaCompleto com sucesso antes de ativar.');
}
function pausarSistema() {
  return comLock_(function() {
    propriedades_().setProperty(VINSETT_KEYS.PAUSED, 'true');
    console.log('Novos sinais pausados. Se o sistema ja esta ativo, resultados pendentes continuam.');
  });
}
function retomarSistema() {
  return comLock_(function() {
    verificarPronto_(); obterHistorico_(Date.now(), novoContexto_(), true); garantirAcionador_();
    propriedades_().setProperties({ VINSETT_PAUSED: 'false', VINSETT_V5_MAINTENANCE: 'false' });
    console.log('ATIVO — BTC/USD, ETH/USD e SOL/USD. Somente sinais aprovados. Veja Execucoes e o historico.');
  });
}
function desinstalarSistema() {
  return comLock_(function() {
    propriedades_().setProperties({ VINSETT_PAUSED: 'true', VINSETT_V5_MAINTENANCE: 'true' });
    ScriptApp.getProjectTriggers().forEach(function(t) {
      if (t.getHandlerFunction() === 'cicloVinsett') ScriptApp.deleteTrigger(t);
    });
    console.log('Acionadores cicloVinsett removidos. Configuracoes, fila e historico preservados. Resultados nao serao apurados ate reativar.');
  });
}
function removerAcionadorAntigoCicloM1() {
  return comLock_(function() {
    let count = 0;
    ScriptApp.getProjectTriggers().forEach(function(t) {
      if (t.getHandlerFunction() === 'cicloM1') { ScriptApp.deleteTrigger(t); count += 1; }
    });
    console.log('Removidos ' + count + ' acionador(es) obsoleto(s) cicloM1. Demais acionadores preservados.');
  });
}
function verificarAcessoTelegram_() {
  validarTelegram_();
  const id = propriedades_().getProperty(VINSETT_KEYS.CHANNEL_ID), me = telegramApi_('getMe', {}).result;
  const chat = telegramApi_('getChat', { chat_id: id }).result;
  const member = telegramApi_('getChatMember', { chat_id: id, user_id: me.id }).result;
  const admin = member && (member.status === 'administrator' || member.status === 'creator');
  if (!chat || !member || ['left', 'kicked'].indexOf(member.status) >= 0) throw new Error('Bot fora do grupo/canal.');
  if (chat.type === 'channel' && (!admin || member.can_post_messages === false))
    throw new Error('No canal, conceda ao bot permissao de administrador para publicar.');
  if (['group', 'supergroup'].indexOf(chat.type) >= 0 && !admin) {
    if ((member.status === 'restricted' && (!member.is_member || !member.can_send_messages)) ||
        (member.status !== 'restricted' && chat.permissions && chat.permissions.can_send_messages === false))
      throw new Error('O grupo nao permite que o bot envie mensagens.');
  }
  console.log('Telegram: acesso de leitura e permissao de publicacao verificados; nenhum envio.');
}
function testarSistemaCompleto() {
  return comLock_(function() {
    const p = propriedades_();
    p.setProperty(VINSETT_KEYS.TEST_OK, '');
    if (p.getProperty(VINSETT_KEYS.READY) !== VINSETT_CONFIG.VERSION) throw new Error('Execute configurarSistema primeiro.');
    testarWinLossVinsett();
    verificarAcessoTelegram_();
    const ctx = novoContexto_(); ctx.dry = true;
    verificarEscritaHistorico_(obterHistorico_(Date.now(), ctx, false)); listarRegistros_();
    carregarLoteMercado_([].concat.apply([], VINSETT_ATIVOS.map(function(a) { return specsPacote_(a, fonteAtual_(a)); })), ctx);
    const errors = [];
    VINSETT_ATIVOS.forEach(function(a) {
      try {
        const multi = buscarMultiTimeframeComFallback_(a, ctx), analysis = analisarMercado_(multi, Date.now());
        console.log('TESTE ' + a.pair + ' OK | ' + multi.source + ' | idades M1/M5/M15=' +
          analysis.ages.m1 + '/' + analysis.ages.m5 + '/' + analysis.ages.m15 + 's | score BUY/SELL=' +
          analysis.buyScore + '/' + analysis.sellScore + ' | simulacao, sem publicar');
      } catch (erro) { const message = erroSeguro_(erro); errors.push(message); console.error(a.code + ': ' + message); }
    });
    if (errors.length) throw new Error('TESTE INCOMPLETO: ' + errors.join(' | '));
    p.setProperty(VINSETT_KEYS.TEST_OK, assinaturaTeste_());
    console.log('TESTE COMPLETO OK — BTC, ETH, SOL, fila, historico e Telegram verificados. NENHUMA mensagem enviada.');
  });
}
function testarFonteMercado() {
  return comLock_(function() {
    const ctx = novoContexto_(); ctx.dry = true; const errors = [];
    VINSETT_ATIVOS.forEach(function(a) {
      try {
        const multi = buscarMultiTimeframeComFallback_(a, ctx);
        console.log(a.pair + ' | ' + multi.source + ' | idades=' + JSON.stringify(multi.ages));
      } catch (erro) { errors.push(erroSeguro_(erro)); }
    });
    if (errors.length) throw new Error(errors.join(' | '));
    console.log('FONTES OK. Nenhuma mensagem enviada.');
  });
}
function testarCanalTelegram() {
  return comLock_(function() {
    validarTelegram_();
    enviarMensagem_(propriedades_().getProperty(VINSETT_KEYS.CHANNEL_ID),
      '<b>✅ VINSETT V5 — TESTE DE CONEXÃO</b>\nBTC/USD • ETH/USD • SOL/USD\n' +
      'Esta mensagem não é um sinal e não será classificada como WIN/LOSS.\n' +
      'Score técnico não é probabilidade. Resultados serão apenas de referência.', null);
    console.log('Teste de conexao enviado. Confirme a mensagem no grupo e execute retomarSistema.');
  });
}
function testarSinalCanal() { testarCanalTelegram(); } // Compatibilidade: nao fabrica um sinal negociavel.
function testarCorrecaoM1() { testarFonteMercado(); }
function testarWinLossVinsett() {
  const start = (Math.floor(Date.now() / 60000) - 2) * 60000;
  const cases = [['BUY', 100, 101, 'WIN'], ['BUY', 100, 99, 'LOSS'], ['SELL', 100, 99, 'WIN'],
    ['SELL', 100, 101, 'LOSS'], ['BUY', 100, 100, 'EMPATE'], ['SELL', 100, 100, 'EMPATE']];
  VINSETT_ATIVOS.forEach(function(a) {
    cases.forEach(function(c) {
      const r = { v: 2, asset: a.code, start: start, end: start + 60000, pair: a.pair,
        source: 'COINBASE', symbol: a.coinbase, chatId: 'TESTE_LOCAL', direction: c[0], score: 80,
        state: 'AGUARDANDO_VELA', signalMessageId: 1 };
      const candle = { openTime: start, closeTime: start + 59999, open: c[1], close: c[2],
        high: Math.max(c[1], c[2]), low: Math.min(c[1], c[2]), volume: 10 };
      if (avaliarVela_(r, [candle], Date.now()).outcome !== c[3]) throw new Error('Falha no teste WIN/LOSS.');
    });
  });
  console.log('TESTE WIN/LOSS OK — 18 casos ficticios; sem rede, mensagens, gravacoes ou acionadores.');
}
function statusVinsett() { reiniciarPropriedades_(); console.log(montarStatus_().replace(/<[^>]*>/g, '')); }
function statusWinLossVinsett() {
  reiniciarPropriedades_();
  const records = listarRegistros_();
  if (!records.length) console.log('Nenhum sinal acompanhado ainda.');
  records.forEach(function(r) { console.log(idRegistro_(r) + ' | ' + r.source + ' | ' + r.direction + ' | ' + r.state +
    (r.result ? ' | ' + r.result.outcome : '') + (r.error ? ' | ' + erroSeguro_(r.error) : '')); });
}
function abrirHistorico() {
  reiniciarPropriedades_();
  const all = propriedades_().getProperties();
  Object.keys(all).filter(function(k) { return /^VINSETT_V5_HISTORY_\d{6}$/.test(k); }).sort().forEach(function(k) {
    const entry = JSON.parse(all[k]);
    console.log(k.slice(-6) + ' | ' + (entry.id ? 'https://docs.google.com/spreadsheets/d/' + entry.id + '/edit' : 'criacao pendente'));
  });
}
// === FIM DO CODIGO COMPLETO VINSETT V5 ===
