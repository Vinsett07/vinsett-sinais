# VINSETT Trader V1.0 Alpha — Core 0.5.6.1-FULL

Release: Source Comparator / OKX vs Mercado Bitcoin

## Primary architecture
- Primary signal source: OKX SPOT USDT
- Symbols: BTC-USDT, ETH-USDT, SOL-USDT
- Native OKX timeframes: M1, M5, M15
- Mercado Bitcoin is research/comparator only and cannot authorize, block, alter, or create a signal.
- Automatic orders remain OFF.

## Comparator
- Mercado Bitcoin pairs: BTC-BRL, ETH-BRL, SOL-BRL
- Mercado Bitcoin native timeframes used: M1 and M15
- M5 is derived from M1 only for laboratory comparison
- Source Score: availability, freshness, continuity, M1 activity, native timeframe coverage
- Compares ADX, DMI spread, VWAP distance, trend direction, hypothetical candidate/score, timestamp skew and residual price basis after median implied BRL/USDT normalization
- Telegram comparator alerts are OFF by default
- No automatic source switching
- Comparator uses its own lease and does not hold the primary engine ScriptLock

## New sheets
- Comparator_0561
- ComparatorRuns_0561
- SourceHealth_0561
- ComparatorAlerts_0561
- ComparatorSummary_0561

## New trigger
- runComparatorVinsett0561 (default every 15 minutes)

## All-in-one activation
After replacing the Apps Script source, run only:

`activateCore0561Vinsett`

The activator performs setup, Core/Analytics/Comparator/parser self-tests, live OKX+Mercado Bitcoin validation, installs the comparator, persists the first run, generates the summary, and returns final status. If the live dual-source test fails, activation aborts before installing the comparator.

## Validation
- JavaScript syntax: PASS
- Lines: 2095
- Functions: 181
- Duplicate functions: 0
- Missing 0561 references: 0
- Core market-scan comparator reference: none
- Entry-watcher comparator reference: none
- Comparator header/data alignment: 68 columns PASS
- Core indicator self-tests: PASS
- Analytics self-test: PASS
- Comparator self-test: PASS
- Parser/continuity self-test: PASS

SHA-256 of delivered source artifact:
`f15254c7557b8c264266cd14716aa0d633b99a11623e428fd83ac446c7dd2f5c`
