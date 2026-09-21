# US Stock Check Web

米国株アプリの公開表示用リポジトリです。

## 役割
- GitHub Pages / PWA
- 公開可能な市場データと判定結果のみ保持
- APIキー、保有数量、取得単価、非公開ルールは保持しない

## 構成
- `docs/index.html`: 画面
- `docs/app.js`: 表示ロジック
- `docs/style.css`: UI
- `docs/manifest.webmanifest`: PWA設定
- `docs/sw.js`: Service Worker
- `docs/data/status.json`: 更新状態
- `docs/data/market.json`: 最新市場データ
- `docs/data/history.json`: 公開用履歴

## 現在の状態
v0.1.0 / Shadow構築中。Private側 `us-stock-check` からの自動公開はまだ有効化していません。
