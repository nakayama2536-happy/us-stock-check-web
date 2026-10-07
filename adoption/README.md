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
- PR #31のSW移行候補とは独立。ネットワークと転送を外側、5タブ表示をsandbox iframe内に維持する。後述のPWAオプションでPR #31の移行処理と統合した。

## 実装

1. `build.cjs`：承認済みpreview.PINSをGit blob SHA-1で照合してから候補を生成。元ファイルを編集せず、更新経路と表示文言を変える箇所は一意の境界で検査する。PINSの変更は不要。固定版のstatus/market/commonを通常データへ混ぜない。任意の公開済みOHLCVは一致検証が通った場合だけ採用する。
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
- 5タブ全体の移行・タブを閉じてoffline再起動・復旧試験を追加済み。OS終了、実機Safari・ホーム画面での確認は未完了。
- 検証済みの一式を専用Cache APIへ1件だけ原子的に保存し、再起動時にハッシュを再検証して復元する。容量不足やOSによるストレージ削除は実機確認が必要。
- 共通正本docs/common-spec/の正式採用条件、US iPhone/Safari/ホーム画面/縦横/実データ更新の受入。共通ゲートを解除しない。
- 上記の差分・実機結果・復旧手順を提示して通常PWA採用を確認する。正式売買エンジン・予測・Production昇格は別。

本候補を本番へコピーするだけでは、通常PWA採用は完了しない。

## 2026-10-04 PWA・生成パイプライン統合

`build(...,{pwa:true})`だけが候補SWを生成する。公開docs/sw.jsは変更しない。`migration/`の2ファイルはPR #31 head `24deb88e077ba7c2869ec5558c2276af756fdfd7`と同じ内容で再利用している。

- SWは候補の画面資材一式をキャッシュし、旧USキャッシュから4JSONをコピーしてから旧キャッシュを削除する。他アプリのキャッシュや個人記録へ触れない。
- 配信データはSWの自動キャッシュへ戻さず、アプリ側が検証後に専用保存領域へ1セットだけ保存する。保存版を復元した場合は明示し、GPT転送を止める。改変された保存値は再検証で拒否する。
- オンラインで旧版へ戻す場合は元のSWを同じURLで配信する。旧版自身のnonce問題は残るため、復旧後の旧版offline動作は保証しない。
- `import-run.cjs`はPrivate側の同一実行パッケージを検証し、5タブ＋PWA候補を生成する。Privateのcheckout、ログ、個人情報を候補へコピーしない。
- 自動生成は隔離workflowのartifactまで。本番の定時workflow、Public main、GitHub Pagesへの書込みは行わない。実際の本番定時配信への接続には別途採用確認が必要。
# 2026-10-05 未公開候補の表示追従

Public PR #34の実機確認版で修正した保存値表示を、この通常採用候補にも反映。
親から受けた配信状態を保持し、60秒ごとの再描画でもオフライン表示とGPT停止を維持する。
オンラインでも「更新済み」ではなく「保存データ表示」。未知の状態メッセージは無視する。
通常公開ファイル、固定JSON、s1のPINS、Core、SW、個人記録は変更しない。
候補はDraftのまま。Private PR #44のconsumer pinは旧検証版の証拠として維持し、
本変更を含む新しい同一実行パッケージの証拠とは扱わない。
