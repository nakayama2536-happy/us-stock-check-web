# 通常データ接続候補 — 未公開

2026-10-04 JST / UI候補 / NOT_DEPLOYED / DEVICE_PENDING

## なぜ3

- 必要：承認済み5タブを、日々変わる公開データでも安全に表示し、表示とGPT相談文を一致させる。
- 現状不足：固定確認版だけでは、更新中の旧データ、ファイル混在、履歴欠損を扱えない。
- 最小安全：Public mainの公開JSONを版別に包装し、使い捨てディレクトリの候補で検証する。docs/・通常SW・Core・固定確認版・個人記録は変更しない。

## 基準

- Public main：`55e872d80e20dac280ef56f2ac17ba18b3a90ee6`
- Private main：`55a826c63754ae04e1061ce01bd7775bc65d0f3b`
- 承認済みUI：`preview/s1/?v=jp-cards-4-zoom-2`。ユーザーの2026-10-04 22:44 OKは確認版UIの承認。通常PWA切替・Production昇格・DEVICE_PASSではない。
- PR #31のSW移行候補とは独立。今回はSWを登録せず、ネットワークと転送を外側、5タブ表示をsandbox iframe内に維持する。

## 実装

1. `build.cjs`：承認済みpreview.PINSをGit blob SHA-1で照合してから候補を生成。元ファイルを編集せず、更新経路と表示文言を変える箇所は一意の境界で検査する。PINSの変更は不要。候補へ固定データのコピーを混ぜない。
2. `delivery.js`：`current.json` → `releases/<SHA-256>/` のstatus/market/commonと任意OHLCVを読込。ファイル名・容量・SHA-256・配信版ID・基準日・共通計算日時・5銘柄の一意性を検証。15秒の通信制限、更新競合・遅延応答の破棄を実装。
3. 日足：既存検証で日付・終値・主要指標・出典が一致したものだけ採用。不在ならグラフ不可と表示し、固定確認版の250本や観測終値へ戻さない。
4. GPT：表示中の版の公開項目だけを転送し、実際の入力ハッシュ・配信版を付記。再読込開始・失敗・offline時に相談文を消去し、再取得成功まで転送を停止。旧世代のiframeメッセージを拒否。コピー/全文保存/分割・手動送信を維持。
5. 更新中も選択タブ・銘柄をメモリ内で維持。起動時は既存の`usstock.activeTab`を読み、端末記録への書込みはしない。sandbox内の既存storage処理は同一origin権限がないためアクセス不可。

ハッシュは「一つに包装された配信版」の証拠。バックエンド同一実行や価格の正しさ、品質PASS、売買判断の証明ではない。OHLCVは現状、別capture実行から一致検証して採用している。旧固定版のOHLCVを次の株価日に自動採用しない。

## 再現

```bash
node --test adoption/delivery.test.cjs
node adoption/build.cjs /tmp/us-data-candidate 55e872d80e20dac280ef56f2ac17ba18b3a90ee6 docs/preview/s1/data/ohlcv-history.json
python adoption/browser.py
```

出力先はrepo外の使い捨てディレクトリ限定。OHLCV引数は省略可能。`pack(out,input,revision,ohlcv)`は版ディレクトリ作成後、最後にcurrent.jsonを置換する。同一releaseの既存バイト列は上書き変更しない。HTTP配信の原子的切替や通常更新workflowへの接続は、まだ実装していない。

PRの`US Data-connected UI Candidate`はcontents:readで、公開処理なし。ブラウザー試験はlocalhostの使い捨てサイトと明示的な更新fixtureで実施。実市場の次営業日更新・実ユーザー記録の全形式・実機Safariの合格へ読み替えない。

## 未完了／次の工程

- Privateの通常生成処理から同じ実行のsnapshotとOHLCVを作り、Publicへ版別・一括配信する接続。現状のcaptureは任意実行であり、自動配信済みではない。
- 本候補とPR #31のSWを統合し、5タブ全体の旧版→候補→旧版、再起動・offline・保存保持を試験。4タブ試験の合格を流用しない。
- 通信不能時の版別バンドル保存と再起動復元（現候補はメモリ内の前回表示だけを保持）。無制限なrelease保存・旧版削除は未設計。
- 共通正本docs/common-spec/の正式採用条件、US iPhone/Safari/ホーム画面/縦横/実データ更新の受入。共通ゲートを解除しない。
- 上記の差分・実機結果・復旧手順を提示して通常PWA採用を確認する。正式売買エンジン・予測・Production昇格は別。

本候補を本番へコピーするだけでは、通常PWA採用は完了しない。
