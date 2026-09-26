# US Stock Check Web

米国株アプリの公開表示用リポジトリです。

## Current status

- APP_VERSION: 0.9.7
- Mode: SHADOW
- Private core: `nakayama2536-happy/us-stock-check`
- Private → Public automatic publishing: enabled
- GitHub Pages / PWA deployment: enabled
- Automatic trading / order placement: not implemented

## Role

This repository contains only the public presentation layer and public-safe market snapshots.

It must not contain:

- API keys or publisher tokens
- portfolio quantity / shares
- average cost or cost basis
- account information
- private investment rules
- planned order size or transaction history

## Current UI

v0.9.7 uses real tab navigation:

- 概要
- 銘柄
- 市場
- 品質

The selected tab is retained on the device. Data quality, review items, and model-validation information are grouped in the 品質 tab.

## Data flow

`Private us-stock-check → QC / Technical / Shadow / Common validation → public-safe export → us-stock-check-web → GitHub Pages / PWA`

Only validated public-safe snapshots are published. If validation fails, safety gates must not be bypassed simply to refresh the displayed timestamp.

## Published data

- `docs/data/status.json` — run state, timestamps, quality status
- `docs/data/market.json` — public market / stock analytics
- `docs/data/history.json` — public-safe run history
- `docs/data/common_snapshot.json` — Common display snapshot

## Application files

- `docs/index.html` — screen structure
- `docs/app.js` — display logic
- `docs/style.css` — UI styles
- `docs/manifest.webmanifest` — PWA manifest
- `docs/sw.js` — Service Worker

## Operational boundary

This Public PWA is a decision-support display. SHADOW analytics must not be interpreted as automatic trading instructions.

The current U.S. Common adapter does not implement a formal Trade Action Engine. Any future introduction of formal trade actions is a separate design and validation decision from operating this display application.
