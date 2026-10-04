# 通常PWA採用準備：差分と保存保持のリハーサル

2026-10-04 JST / NOT_DEPLOYED / DEVICE_PENDING / UI_PORT_PENDING

## 承認・対象

- 利用者は22:38に250本ズーム以外OK、22:44に修正後もOKと回答。確認版UIの承認として記録する。
- 承認対象：Public main `55e872d80e20dac280ef56f2ac17ba18b3a90ee6`、`preview/s1/?v=jp-cards-4-zoom-2`。
- 通常PWA採用・Production昇格の許可とは扱わない。PR #22をそのまま採用しない。
- 本ブランチは公開対象docs/を一切変更せず、通常4タブの現行バイト列を利用したSW/保存保持試験用候補だけを一時ディレクトリへ生成する。承認済み5タブUIの移植完了とは呼ばない。

## なぜ3

必要：承認済みUIを通常利用へ移す前に、更新で保存値や他アプリの記録を壊さないことを確かめる。  
現状不足：隔離確認版は固定JSON・通信なし・同一origin権限なしであり、通常PWAのデータ再取得・SW更新は試していない。  
最小安全：本番への反映をせず、生成物とlocalhostで旧→候補→旧の更新試験を行い、残件を分離する。

## 移植差分表

| 領域 | 移植元／現行 | 必要な差分と完了条件 | 現状 |
|---|---|---|---|
| 判断カード・5タブ | preview/s1/candidate + judgment-cards | 現行パネルを再利用し、選択銘柄・旧タブ値の復元を維持 | 確認版承認済み、通常版への接続は未実装 |
| 読込・品質 | candidate/bootstrap.js / experience.js | 同一版status/market/commonの取得、欠損・日時不一致・HOLD・offlineを表示。古いPASSを最新としない | 状態モデルのテストあり、実PWAへの接続は未実装 |
| 個別グラフ | research.js + ohlcvFor | 通常データの日付・終値・指標に結合。異なる取得版は除外 | 固定版のみ。250本は自動更新されない |
| GPT転送 | preview.jsの外側dialog | sandbox専用postMessage経路を通常UI用へ分離。更新中・更新後の古い相談文を無効化。公開allowlistと手動送信維持 | 固定版のみ。全文/分割処理は再利用可能 |
| 履歴配信 | Privateの任意capture | 同じ実行のsnapshotとOHLCVを一括で安全に配信する方式を決定・検証 | 未実装。現在の固定履歴を最新扱いしない |
| SW・キャッシュ | docs/sw.js / app.js | nonce整合、旧保存データの引継ぎ、他PWAキャッシュ・localStorage・IndexedDB保持 | このリハーサルで検証 |
| manifest・アイコン | docs/manifest.webmanifest | 既存scope/start_url/displayを維持 | 変更不要 |
| Core・投資条件・個人記録 | Private / 端末 | 意図しない変更・移行をしない | 本ブランチ変更なし |

## 再現した課題と候補の対策

1. 現行app.jsは `?t=Date.now()` を付けるがSWは `v` だけを除去する。別のt値でオフライン再取得すると保存済み応答に一致しない。単体テストで再現。
2. キャッシュ名だけ更新すると、activateが旧USキャッシュを削除し、データ応答が失われる。単体テストで再現。

候補生成時のみ、appのnonceをvへ統一する。旧キャッシュ `us-stock-check-v0.9.8-cache1` の同一scope内4データendpointに限り、数値t/vを正規化して新キャッシュへ引き継ぐ。ticker/period等の意味のあるqueryは保持する。最も新しいnonceの応答を選ぶが、nonceは品質やデータ日時の証明ではない。新キャッシュに取得済み応答があれば上書きしない。コピー失敗時は元キャッシュを削除しない。

混在した生成版の整合確認はUI側の別責務。キャッシュ移行成功だけをデータ品質PASSとしない。旧キャッシュに存在しないデータを創作しない。

## 実行

- `node --test migration/worker-migration.test.cjs`
- `node migration/build-rehearsal.cjs /tmp/us-pwa-rehearsal`
- `python migration/browser-rehearsal.py`（Playwright/Chromiumが必要）

PRのPWA Migration Rehearsal workflowはcontents:readで実行し、配備・公開・workflow dispatch・他repo書込は行わない。

ブラウザ試験：旧worker起動→保存値/テスト用記録を用意→同じscope/URLで候補workerへ更新→通信遮断・再起動・異なるnonceで4JSONを読込→localStorage/sessionStorage/IndexedDB/他PWAキャッシュ保持→通信復帰→旧workerへ戻す。

これはChromiumでの試験用記録の保持確認であり、実ユーザーの全記録形式やiPhone実機受入を証明しない。旧workerへ戻すにはオンライン接続が必要で、端末への更新反映まで瞬時に取り消せるとは主張しない。旧worker自体のt問題も残るため、旧版への復旧後のオフライン動作を保証しない。

## 次の実装・採用ゲート

1. この試験の結果を確定し、SWの候補差分をレビューする。本番へはまだ反映しない。
2. 同一生成版の通常snapshot/OHLCV配信、GPT内容の更新時無効化、5タブの起動処理を組み立てる（別実装）。
3. 組み立てたUI＋SW全体を同じ移行試験にかける。今回の4タブ試験結果を5タブの合格へ読み替えない。
4. 共通正本のJapan参照UI実機ゲート・US Safari/ホーム画面/縦横/online/offline/保存記録保持を確認する。共通PENDING-019〜022は本作業では解除しない。
5. 差分・試験・復旧手順を提示して通常UI採用の確認を得る。Operational ProductionはIssue #25の別レビュー。

UI承認は得たが、現時点の通常PWA切替条件は未充足。隔離確認版の改善は継続可能。
