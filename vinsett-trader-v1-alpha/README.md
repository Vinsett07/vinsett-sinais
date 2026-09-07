# VINSETT Trader V1.0 Alpha

Current version: **Core 0.5**

Stable rollback point: **Core 0.4**

## Current scope

- Market data: Mercado Bitcoin API v4
- Assets: BTC-BRL, ETH-BRL, SOL-BRL
- Timeframes: native M15 -> M5 built from M1 -> M1 trigger
- Indicators: EMA 9/21/50, ADX/DMI 14, rolling VWAP 50
- Market scan: every 5 minutes
- Entry watcher: every 1 minute only for `ARMED` assets or pending settlements
- Entry model: next M1 candle after the confirmed trigger
- Settlement: one M1 candle
- Outcomes: WIN, LOSS, DRAW
- Database: Google Sheets `Trades`
- Reports: weekly and monthly WIN%, LOSS%, DRAW and per-asset breakdown
- Notifications: trend ready, entry confirmed, trade result, performance report
- Execution: simulation only; no automatic orders

## Outcome rule

- BUY: next M1 candle closes above its open -> WIN
- BUY: next M1 candle closes below its open -> LOSS
- SELL: next M1 candle closes below its open -> WIN
- SELL: next M1 candle closes above its open -> LOSS
- Open == close -> DRAW

DRAW is stored separately and does not enter the WIN/LOSS percentage denominator.

## Mental map

```text
VINSETT Trader V1.0 Alpha — Core 0.5
│
├── Market Data
│   └── Mercado Bitcoin API v4
│       ├── BTC-BRL
│       ├── ETH-BRL
│       └── SOL-BRL
│
├── Context Scan — every 5 min
│   ├── M15 -> main trend
│   ├── M5  -> confirmation
│   └── State
│       ├── NEUTRAL
│       ├── WATCHING
│       └── ARMED
│
├── Entry Watcher — every 1 min
│   └── Only ARMED assets
│       └── M1 trigger
│           ├── SIGNAL_SENT
│           └── next M1 candle
│
├── Settlement
│   ├── WIN
│   ├── LOSS
│   └── DRAW
│
├── Database
│   ├── Analyses
│   ├── Signals
│   ├── Trades
│   ├── Notifications
│   └── Reports
│
├── Performance
│   ├── Weekly
│   │   ├── WIN %
│   │   ├── LOSS %
│   │   └── per asset
│   └── Monthly
│       ├── WIN %
│       ├── LOSS %
│       └── per asset
│
└── Next layers
    ├── Telegram delivery
    ├── Gemini validation
    └── App / extension
```

## Main Google Apps Script commands

- `setupVinsettTraderV1`
- `testMercadoBitcoinVinsettV1`
- `diagnoseBitcoinDataVinsettV1`
- `runMarketScanVinsettV1`
- `runEntryWatcherVinsettV1`
- `settlePendingTradesVinsettV1`
- `generateWeeklyReportVinsettV1`
- `generateMonthlyReportVinsettV1`
- `installAutomationVinsettV1`
- `removeAutomationVinsettV1`
- `statusVinsettTraderV1`

## Source

Google Apps Script source:

`apps-script/Code.gs`
