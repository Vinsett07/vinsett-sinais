# VINSETT Trader V1.0 Alpha — Core 0.5.5 Analytics

Status: validated release candidate for Apps Script simulation.

## Objective
Add a statistics layer without changing the deterministic trading rules from Core 0.5.4.2.

## Preserved rules
- M15 ADX >= 23
- M5 ADX >= 20
- M1 ADX >= 18
- Technical Score >= 80
- EMA 9/21/50
- DMI/ADX 14
- VWAP 50
- Data Quality gate unchanged
- Gemini remains second-stage APPROVE/REJECT only
- Telegram integration preserved
- Automatic real orders remain OFF

## New database sheets
- `CandidateEvents_055`
- `Analytics_055`
- `AnalyticsSnapshots_055`

## Candidate tracking
Every deterministic candidate with score >= 80 receives a unique candidate ID before the Gemini decision.

For Gemini-approved candidates, Analytics associates the candidate with the simulated trade result.

For Gemini-rejected candidates, Core 0.5.5 records a counterfactual result using the same next-M1 settlement rule. This allows descriptive comparison of approved vs rejected candidates without allowing Gemini to create or reverse trades.

## Analytics dimensions
- Overall WIN / LOSS / DRAW
- Asset
- BUY vs SELL
- Score bands: 80-84, 85-89, 90-94, 95-100
- M15 ADX bands
- M5 ADX bands
- M1 ADX bands
- Hour of day (Manaus)
- Day of week
- Real vs synthetic entry candle
- Recent real-M1 data-quality bands
- Gemini approved vs rejected counterfactual results

## Sample checkpoints
- 0-29 settled trades: collecting
- 30+: initial checkpoint
- 50+: stronger checkpoint
- 100+: robust descriptive checkpoint

No threshold optimization should be made from a very small sample.

## Main functions
- `setupAnalyticsVinsett055()`
- `testAnalyticsVinsett055()`
- `generateAnalyticsVinsett055()`
- `generateDailyAnalyticsVinsett055()`
- `analyticsStatusVinsett055()`
- `installAnalyticsVinsett055()`
- `removeAnalyticsAutomationVinsett055()`

## Automation
`installAnalyticsVinsett055()` adds one daily analytics trigger around 23:00 in `America/Manaus`. It does not remove or replace the existing market-scan, entry-watcher, weekly-report, or monthly-report triggers.

## Safety
`MODE = SIMULATION_NO_ORDERS` remains unchanged. Core 0.5.5 does not execute brokerage orders.
