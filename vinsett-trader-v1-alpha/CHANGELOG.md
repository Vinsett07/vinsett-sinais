# Changelog

## Core 0.5 — Monitoring, settlement and performance database

- Preserves Core 0.4 strategy: Mercado Bitcoin, BTC-BRL / ETH-BRL / SOL-BRL, M15 -> M5 -> M1.
- Adds a 5-minute market-context scan.
- Adds a 1-minute entry watcher that only queries assets already in `ARMED` state.
- Adds persistent states: `NEUTRAL`, `WATCHING`, `ARMED`, `SIGNAL_SENT`, `PENDING_RESULT`, `LOCKED`.
- Adds simulated one-candle M1 entries.
- Entry is modeled at the open of the next M1 candle after the confirmed trigger.
- Adds automatic settlement after the entry candle closes.
- Outcomes: `WIN`, `LOSS`, `DRAW`.
- BUY: close > open = WIN; SELL: close < open = WIN.
- `DRAW` is recorded separately and excluded from the WIN/LOSS percentage denominator.
- Adds `Trades` sheet as the Alpha historical database.
- Adds `Notifications` sheet with trend, entry, result and report messages.
- Adds post-entry result messages showing WIN / LOSS / DRAW.
- Adds weekly reports with WIN%, LOSS%, DRAW and per-asset breakdown.
- Adds monthly reports with WIN%, LOSS%, DRAW and per-asset breakdown.
- Adds automatic weekly and monthly report triggers.
- Adds trigger installation/removal commands.
- Automatic order execution remains disabled.
- Gemini and Telegram delivery remain disabled; the notification outbox is ready for Telegram integration.

## Core 0.4 — Stable baseline / rollback point

- Mercado Bitcoin API v4 selected as market-data source.
- BTC-BRL, ETH-BRL and SOL-BRL enabled.
- Native M15 data collection.
- M5 built from M1 candles.
- M1 used only as entry trigger.
- EMA 9/21/50 implemented.
- ADX/DMI 14 implemented.
- Rolling VWAP 50 implemented.
- Technical score implemented with minimum signal threshold.
- BUY / SELL / NO_TRADE states implemented.
- Repeated-signal structural lock implemented.
- Structural reset implemented.
- Diagnostics, analyses and signals recorded in Google Sheets.
- Automatic order execution remains disabled.

Core 0.4 remains the stable rollback point before Core 0.5.
