# AP04 原 B 条項の通常 UI 実行入口

原 `original_acceptance_audit.json` を変更せず、B02–B22 のうち別担当の B10 を除く 20 ケース・80 節を、新規の通常画面操作として作成した。現時点の実観測は **0/80**。登録したテスト名や既存回帰の成功は合格証拠にしていない。

対応は [ap04-original-bm-proof.json](ap04-original-bm-proof.json) にある。各 given/when/then/negative_or_edge の原文を保持し、対応する callback の実ソース・行番号・hash・予定する直接確認を収録した。実行時には同じ given の `.scenario` bytes/hash と観測 JSON を Playwright attachment に残す。

| spec | 原ケース | 直接確認する主な内容 |
| --- | --- | --- |
| `tests/e2e/ap04-original-bm-timeline.spec.ts` | B02/B03/B04/B05/B06/B07/B09/B21 | 同じ event の複数レーン、群削除の本体保持、実 wheel と固定見出し、暦と単位、本編基準、関係の意味・型拒否理由・有効期間、日数範囲・相対循環・実在しない暦日 |
| `tests/e2e/ap04-original-bm-author.spec.ts` | B08/B11/B13/B20/B22 | 参加者と知識、場所/種類/個体と二重取得、回想の提示順、人物目的の根拠、会話/クエスト/設定と別々の完了状態 |
| `tests/e2e/ap04-original-bm-runtime.spec.ts` | B14/B15/B16 | 鍵の有無と同一合流先、不正効果群の原子拒否、三つの型と未確認値、二択・巻戻し・既読/知識/所持品/抽選・公開版不変 |
| `tests/e2e/ap04-original-bm-archive.spec.ts` | B12 | UI が書き出した条件/本文/関係/実 WAV の同じ完全保存を新規作品へ UI 復元し、同じ ZIP 由来の四種不正入力を元作品から拒否 |
| `tests/e2e/ap04-original-bm-world-narrative.spec.ts` | B17/B18/B19 | 真相/嘘の証言/取得者/出所、移動/所属の前後と二経路・不明候補、任意手掛かり/今作必須未回収/続編持越しと理解未認定 |

given の構築・保存ファイルの検査は通常の公開 domain/storage 関数を使用する。作品の操作は画面経由。正本比較の IndexedDB アクセスは readonly に限る。B12 の破損入力は、そのケースで画面が作った完全保存を複製し、hash/版/パス/参照の各一点を変える。通常画面の結果を偽装する state/UUID/判定値の注入は行わない。

ソース読解で判明した二つの実 UI 不足は、親担当の許可範囲内で補った。

- B07: `RelationForm` が端点型に不適合な選択肢を除外して disabled にしていたが、理由を表示していなかった。既存 `RELATION_TYPES` の定義から端点種別・自己参照・対称指定の理由を表示する。保存型、guard、参照、storage、schema を変更していない。
- B09: 人物の元詳細が関係の raw type を表示していたが、その世界内有効期間を表示していなかった。既存 relation の意味名、開始を含み終了を含まない期間、経路条件を表示する。保存値を変更していない。

B12 と B21 は通常復元 UI と日時編集 UI に実行入口があり、追加の product 修正はソース上では必要ない。実行により新たな失敗が判明した場合は、元条件・元期待・元閾値を保持して修正する。

B10 は既存リンクライフサイクル担当の範囲。B24 は原 given の実タッチ端末条件を保持し、マウス操作で実機合格へ転記しない。B01/B23 の既存入口も本資料から結果を転記しない。

統合した候補で型検査・build が完了してから、5 本の spec を直列実行する。候補 freeze 時に proof の source hash を更新する。現在の proof は変更途中のソース snapshot で、ブラウザ、TSC、unit、build は未実行。

```sh
npx playwright test tests/e2e/ap04-original-bm-timeline.spec.ts tests/e2e/ap04-original-bm-author.spec.ts tests/e2e/ap04-original-bm-runtime.spec.ts tests/e2e/ap04-original-bm-archive.spec.ts tests/e2e/ap04-original-bm-world-narrative.spec.ts --project=chromium --workers=1
```

同じ実行・同じ given に対する四節すべての観測が成立してから、そのケースを原条項の受入候補として扱う。
