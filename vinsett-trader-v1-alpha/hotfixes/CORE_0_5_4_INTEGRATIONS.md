# VINSETT Trader V1.0 Alpha — Core 0.5.4 FULL

Status: prepared and locally validated on 2026-09-07.

## Scope

Core 0.5.4 keeps the deterministic Core 0.5.3 trading-analysis engine and adds integration hardening without enabling real orders.

### Encoding hardening
- Runtime strings are ASCII-only to eliminate mojibake such as `tendÃªncia` / `HistÃ³rico` in Apps Script logs.
- Existing 0.5.3 spreadsheet/state keys are retained so historical data is preserved.

### Telegram
- Credentials are read only from Apps Script Script Properties.
- No bot token is hardcoded in source.
- Uses Telegram Bot API `sendMessage` via HTTPS POST.
- TREND_READY and ENTRY_SIGNAL route to the signal chat.
- TRADE_RESULT routes to signal + private chat, with duplicate chat IDs deduplicated.
- PERFORMANCE_REPORT routes to the private chat (falling back to signal chat when needed).
- Telegram failures are logged and do not stop the deterministic market-analysis engine.
- Telegram is enabled only after a successful integration test.

Required Script Properties:
- `VINSETT_TG_BOT_TOKEN`
- `VINSETT_TG_SIGNAL_CHAT_ID`
- `VINSETT_TG_PRIVATE_CHAT_ID`
- `VINSETT_TG_ENABLED` (managed by enable/disable functions)

### Gemini second-stage validator
- Optional and disabled by default.
- Uses Gemini Interactions API.
- Default model: `gemini-3.8-flash`.
- Called only after deterministic M15/M5/M1 rules and Technical Score >= 80 have already produced a candidate.
- Gemini can APPROVE or REJECT only; it cannot flip BUY/SELL and cannot create its own signal.
- Default fail-closed behavior when Gemini is enabled but its API fails.
- Validation decisions are stored in `AI_Validations_054`.
- Gemini is enabled only after a successful integration test.

Required Script Properties:
- `VINSETT_GEMINI_API_KEY`
- `VINSETT_GEMINI_MODEL` (default `gemini-3.8-flash`)
- `VINSETT_GEMINI_ENABLED` (managed by enable/disable functions)
- `VINSETT_GEMINI_FAIL_CLOSED` (default `true`)

## Validation performed

- JavaScript syntax check: PASS.
- Runtime source contains zero non-ASCII characters: PASS.
- Internal 053/054 function dependency scan: 103 functions / zero missing references: PASS.
- Robust indicator self-tests:
  - Flat series: ADX 0, +DI 0, -DI 0.
  - Trend series: finite ADX/DMI.
  - Sparse/synthetic series: finite ADX/DMI.
- Gemini JSON parser tests: approve and reject payloads PASS.
- Telegram 4096-character safety splitter test: PASS using 4000-character chunks.
- Integration defaults: Telegram OFF, Gemini OFF, Gemini fail-closed ON.

## Safety mode

- `automaticOrders: false`
- Simulation only.
- Technical Score remains a deterministic technical score, not a probability or guarantee of profit.
