# VINSETT Trader V1.0 Alpha — Core 0.5.4.1 Telegram Auth Fix

## Problem
`testTelegramVinsett054()` could fail with `HTTP 404: Not Found` when the value stored in `VINSETT_TG_BOT_TOKEN` was malformed, revoked, prefixed with `bot`, pasted as a full Telegram API URL, or contained whitespace/newlines.

## Root cause
Telegram Bot API requests must use the form:

`https://api.telegram.org/bot<TOKEN>/METHOD_NAME`

A malformed or invalid token makes the bot endpoint itself invalid. Chat-ID problems normally surface later as a Bot API error such as `400 Bad Request: chat not found`.

## Core 0.5.4.1 changes
- Normalizes Telegram bot tokens before use.
- Accepts raw token, `bot<TOKEN>`, and full `https://api.telegram.org/bot<TOKEN>/getMe` or `/sendMessage` URLs.
- Removes surrounding quotes, spaces and line breaks.
- Validates token structure before HTTP calls.
- Runs `getMe` as the authentication test before `sendMessage`.
- Adds `diagnoseTelegramVinsett054()`.
- Rewrites a successfully normalized token back into Script Properties.
- Produces specific errors for invalid/revoked token, chat not found, and permission denied.
- Keeps Telegram non-blocking for the trading-analysis engine.
- Automatic real orders remain disabled.

## Required test order
1. Replace the current 0.5.4 code with the validated 0.5.4.1 FULL build.
2. Run `diagnoseTelegramVinsett054()`.
3. If authentication is `ok: true`, run `testTelegramVinsett054()`.
4. If the test message arrives, run `enableTelegramVinsett054()`.
5. Check `integrationsStatusVinsett054()` and `statusVinsett053()`.

## If authentication returns HTTP 404
Create/copy a fresh raw token from BotFather and replace the Script Property `VINSETT_TG_BOT_TOKEN`. Do not include `bot`, quotes, labels, or an API URL.

## Version
Effective Core: `0.5.4.1-FULL`
