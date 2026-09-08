/**
 * VINSETT Trader V1.0 Alpha - Core 0.5.5 FULL
 * Standalone Apps Script build.
 * Analysis/simulation only. No automatic orders.
 * Source: Mercado Bitcoin API v4 public candles.
 */

const VINSETT = Object.freeze({
  APP: 'VINSETT Trader',
  VERSION: '1.0-ALPHA',
  CORE: '0.5.5-FULL',
  MODE: 'SIMULATION_NO_ORDERS',
  TIME_ZONE: 'America/Manaus',
  API_BASE: 'https://api.mercadobitcoin.net/api/v4',
  SYMBOLS: Object.freeze(['BTC-BRL','ETH-BRL','SOL-BRL']),

  M1_REAL_TARGET_BARS: 900,
  M1_CONTINUOUS_BARS: 900,
  M1_WATCH_CONTINUOUS_BARS: 120,
  M15_REAL_TARGET_BARS: 120,
  M15_CONTINUOUS_BARS: 120,
  PAGE_SIZE: 200,
  MAX_PAGES: 8,
  REQUEST_GAP_MS: 1150,
  MAX_HTTP_RETRIES: 2,
  HTTP_RETRY_BASE_MS: 1500,

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

  MIN_M1: 80,
  MIN_M5: 60,
  MIN_M15: 60,
  MIN_REAL_M1_PCT_LAST_60: 20,
  MAX_LAST_REAL_AGE_MIN: 5,
  MAX_CONTEXT_AGE_MS: 8 * 60 * 1000,

  PROP_PREFIX: 'VINSETT_053_',
  SHEET_PROP: 'VINSETT_053_SHEET_ID',
  SHEETS: Object.freeze({
    ANALYSES: 'Analyses_053',
    SIGNALS: 'SignalEvents_053',
    TRADES: 'Trades_053',
    NOTIFICATIONS: 'Notifications_053',
    REPORTS: 'Reports_053',
    DIAGNOSTICS: 'Diagnostics_053',
    AI: 'AI_Validations_054',
    CANDIDATES: 'CandidateEvents_055',
    ANALYTICS: 'Analytics_055',
    SNAPSHOTS: 'AnalyticsSnapshots_055',
    README: 'README_053'
  }),

  TELEGRAM_BOT_TOKEN_PROP: 'VINSETT_TG_BOT_TOKEN',
  TELEGRAM_SIGNAL_CHAT_PROP: 'VINSETT_TG_SIGNAL_CHAT_ID',
  TELEGRAM_PRIVATE_CHAT_PROP: 'VINSETT_TG_PRIVATE_CHAT_ID',
  TELEGRAM_ENABLED_PROP: 'VINSETT_TG_ENABLED',

  GEMINI_API_KEY_PROP: 'VINSETT_GEMINI_API_KEY',
  GEMINI_ENABLED_PROP: 'VINSETT_GEMINI_ENABLED',
  GEMINI_MODEL_PROP: 'VINSETT_GEMINI_MODEL',
  GEMINI_FAIL_CLOSED_PROP: 'VINSETT_GEMINI_FAIL_CLOSED',
  GEMINI_API_URL: 'https://generativelanguage.googleapis.com/v1beta/interactions',
  GEMINI_DEFAULT_MODEL: 'gemini-3.8-flash',

  SCAN_HANDLER: 'runMarketScanVinsett053',
  WATCH_HANDLER: 'runEntryWatcherVinsett053',
  WEEKLY_HANDLER: 'generatePreviousWeekReportVinsett053',
  MONTHLY_HANDLER: 'generatePreviousMonthReportVinsett053',
  ANALYTICS_HANDLER: 'generateDailyAnalyticsVinsett055'
});

let vinsett053LastRequestAt_ = 0;

// IMPORTANT: Full validated source is maintained in the mobile delivery artifact for this release.
// This repository file is the release marker for Core 0.5.5-FULL and must be replaced by the
// exact validated full source when synchronizing from the ChatGPT delivery artifact.
