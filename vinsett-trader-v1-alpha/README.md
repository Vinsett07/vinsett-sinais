# VINSETT Trader V1.0 Alpha

Stable baseline: **Core 0.4**

## Current scope

- Market data: Mercado Bitcoin API v4
- Assets: BTC-BRL, ETH-BRL, SOL-BRL
- Timeframes: native M15 -> M5 built from M1 -> M1 trigger
- Indicators: EMA 9/21/50, ADX/DMI 14, rolling VWAP 50
- Decisions: BUY, SELL, NO_TRADE
- Repeated-signal protection: structural lock/reset
- Execution: analysis/simulation only; no automatic orders

## Mental map

```text
VINSETT Trader V1.0 Alpha
│
├── Market Data
│   └── Mercado Bitcoin API v4
│       ├── BTC-BRL
│       ├── ETH-BRL
│       └── SOL-BRL
│
├── Analysis Engine
│   ├── M15 -> main trend/context
│   ├── M5  -> confirmation
│   └── M1  -> entry trigger
│
├── Indicators
│   ├── EMA 9/21/50
│   ├── ADX/DMI 14
│   └── VWAP 50
│
├── Decision
│   ├── BUY
│   ├── SELL
│   └── NO_TRADE
│
└── Protection
    ├── closed candles
    ├── minimum technical score
    ├── structural lock
    └── structural reset
```

## Stable code

Google Apps Script source:

`apps-script/Code.gs`

Core 0.4 is the rollback point before development of Core 0.5.
