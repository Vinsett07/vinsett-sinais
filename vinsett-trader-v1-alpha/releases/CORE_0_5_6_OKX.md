# VINSETT Trader V1.0 Alpha — Core 0.5.6 FULL

Status: validated locally, live OKX connectivity must be confirmed from Apps Script with `testOkxAdapterVinsett056()` before migration.

## Primary change
- Market source: OKX API v5 public SPOT candles
- Symbols: BTC-USDT, ETH-USDT, SOL-USDT
- Native timeframes: 1m, 5m, 15m
- No local M5 reconstruction in production
- Only completed candles (`confirm=1`) enter the engine
- No locally fabricated settlement candle; settlement waits for the exact native M1 candle
- Existing strategy thresholds, Gemini, Telegram and Analytics are preserved
- Automatic orders remain OFF

## Strategy preserved
- EMA 9/21/50
- ADX/DMI 14
- VWAP 50
- M15 ADX >= 23
- M5 ADX >= 20
- M1 ADX >= 18
- Technical Score >= 80

## Validation
- JavaScript syntax: PASS
- Functions: 142
- Duplicate functions: 0
- Missing internal versioned references: 0
- OKX response parser: PASS
- `confirm=0` excluded: PASS
- `confirm=1` accepted: PASS
- native zero-volume candle handling: PASS
- recent-gap fail-closed gate: PASS
- settlement `after` cursor calculation: PASS
- Core indicator self-test: PASS
- Analytics self-test: PASS

Validated artifact SHA-256: `092a2a69052fe6a3702eae17c214c639ceda339edfa481471e740fced19f4dbc`

## Required migration sequence
1. Replace Apps Script code with validated Core 0.5.6 artifact.
2. Run `preflightMigrationVinsett056()`.
3. Run `testCore053StandaloneVinsettV1()`.
4. Run `testAnalyticsVinsett055()`.
5. Run `testOkxAdapterVinsett056()`.
6. Only if OKX test passes, run `migrateToOkxVinsett056()`.
7. Run `diagnoseCore053VinsettV1()`.
8. Run `runMarketScanVinsett053()`.
9. Run `runEntryWatcherVinsett053()`.
10. Confirm `integrationsStatusVinsett054()`, `analyticsStatusVinsett055()`, and `statusVinsett053()`.

The validated full source was delivered as the mobile TXT artifact in the ChatGPT project workflow; this release note records the exact hash and architecture.