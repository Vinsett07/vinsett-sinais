# Core 0.5.1 — History Buffer Hotfix

Status: ready for Apps Script validation.

## Problem

`historySufficient` could return `false` because Core 0.5 requested only 320 M1 candles. M5 is reconstructed from M1, so 320 continuous M1 bars produce only about 64 theoretical M5 bars. Any gap or incomplete bucket can reduce the result below the required 60 complete M5 candles.

## Fix

Increase the historical safety buffer without lowering the technical minimums:

```javascript
M1_SCAN_BARS: 600,
M1_WATCH_BARS: 120,
M15_SCAN_BARS: 120,
PAGE_SIZE: 200,
MAX_PAGES: 6,
```

Keep the operational requirements unchanged:

- M1 >= 80 complete candles
- M5 >= 60 complete candles
- M15 >= 60 complete candles

The Mercado Bitcoin `/candles` endpoint supports `countback`, so the collector can retrieve the larger history through pagination while respecting the endpoint rate limit.

## Diagnostic target

Expected result after the hotfix:

```text
m1 >= 80
m5 >= 60
m15 >= 60
historySufficient = true
```

Do not reduce the M5/M15 minimum to hide insufficient historical data.
