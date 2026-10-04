# 米国株 実機確認版（隔離PWA）

目的：承認済みの5タブUIを、通常アプリを切り替えずにSafari・ホーム画面起動・オフライン再起動で確認する。

- 公開先：`/us-stock-check-web/preview/device/`
- ホーム画面名：**米国確認**（アイコン画像は通常版と同じ。名前とアプリID・scopeが別）
- 通常版：Core v0.9.8 / SHADOW / 4タブを維持。
- 確認データ：2026-10-04 23:37:44 JST生成、株価基準日2026-10-02。固定した確認用配信であり、自動更新・売買利用はしない。
- 入力：Private PR #44 の実行37209927730、artifact 11306590625。Public PR #32 の生成候補を隔離用に派生。
- 入力ZIPのSHA256、Private/Public生成元SHA、全実行ファイルのSHA256は `BUILD.json`。配信4ファイルのSHA256は `delivery/current.json`。
- 元の `preview/s1/` と `preview.js` PINSは変更しない。通常JSON、Core、投資条件、通常SW・個人記録も変更しない。

## 実機での確認

1. SafariでこのURLを開き、判断・銘柄・市場・品質・管理の5タブ、250本の高さと最新側表示を確認。
2. 共有→ホーム画面に追加→「米国確認」で起動。画面上部「実機確認の手順・状態」の起動・SW表示を確認。
3. オンライン読込完了後に通信を切り、確認版を閉じて再起動。保存版表示とGPT転送停止を確認。
4. 通信を戻し、配信版表示への復帰を確認。通常アプリが4タブで、個人記録が残ることを確認。

通常アプリの削除・データ消去は不要。iOSバージョン、Safari/ホーム画面の別、実際の再起動方法と結果を記録する。

## 分離境界と未完了

SW scopeはこのディレクトリのみ。静的資材は `us-stock-device-shell-*`、検証済み公開データは `us-stock-device-delivery-v1` に保存。SW更新は同じ確認版の旧shellだけを削除し、通常キャッシュの移行・削除は行わない。通常アプリのlocalStorage設定は読み書きしない。iframeはallow-scriptsだけのsandbox。

自動検証はChromium上の並行起動・タブを閉じたオフライン再起動・通常記録保全。iPhone/Safari・OSによる終了後の再起動・ストレージ削除等を代替しない。DEVICE_PASS、通常PWA採用、本番切替、Production昇格は未承認。PR #22/#31/#32およびPrivate #44のマージ許可ではない。

再生成：検証済みartifact ZIPを展開し、`node scripts/build-device-preview.cjs <展開先> docs/preview/device`。生成スクリプトは今回のreleaseに固定しており、データ更新には別途レビューが必要。
