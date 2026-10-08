# 2026-10-08 RV01〜RV10補修の検証範囲

開始時のmainは3099c9d、PR #8後。製品コードはレビュー基準0474856から未変更だった。古いPR2のbaseline件数と計画のplanned/not_runは現在の合格数ではない。[現在104件](CURRENT_REQUIREMENTS.md)・[116原条件と対象hash](current-implementation.json)・[独立基準版監査](INDEPENDENT_MAIN_AUDIT.md)を分ける。

回帰検査は悪い結果を期待する歴史的 `latest-review.test.ts` を保持し、新規 `tests/review-runtime-regressions.test.ts` で正しい結果を期待する。補修前の正期待6件はすべて失敗し、補修後は正常・未知・期限境界・対象外・原子拒否・終了境界・欠落途中状態・巻戻を検査する。旧testの通常reason迂回期待は拒否へ変更し、確定真実を調べる既存世界fixtureの採用状態をconfirmedへ明示した。仮の情報を確定とみなす緩和は行わない。

| 差分 | 実装・検査 |
| --- | --- |
| RV01 | scene/chapter/run終了、new_loop、full_reset、算出再計算、全原因、同一場面terminal、欠落状態、全状態巻戻。章記録検証も共通境界を実行 |
| RV02 | 一般reasonの禁則迂回を拒否。期間内の明示例外、根拠未採用・欠落・別対象・期限末・未知を区別。金額/物品を含む群を全拒否。開始前/進行時のtick入力と保存再生文脈を接続 |
| RV03 | 没/別案を有効状態・世界真実・関係・年表/地図/世界履歴の採用判定から除外。仮/要確認は未知 |
| RV04 | 固定世界をhash検証後に別集合で解決。条件、初期状態、効果、借用クエスト・外部契約を同じ集合で解決。save→reload→replay→完全保存→new/clone復元、世界改訂、破損hash停止 |
| RV05 | 現在稿のノードがアーカイブされても旧版入口から通常画面で開始し、保存/再読込/再実行 |
| RV06 | 固定版、段落、Unicode位置を本文リンクから開き、mark対象を検査。閉じると元の試読位置 |
| RV07 | 遅延保存から最新props反映まで進行/戻る/周回/版切替を停止。失敗後は現在位置から続ける。同一ターンの再入を防ぐ |
| RV08 | 作品別の設定下書き、基底revision、不正JSON、保存待ち。移動/再マウント、ack、保存失敗、別revisionで入力を保持 |
| RV09 | 影響確認した基底版と規則を固定。revision変更で再確認必須。入力保持、二重保存と失敗を検査 |
| RV10 | 作品/版/graph/章/経路/本文位置を共有契約で評価。対象外の未知は停止に使わず、対象内未知は停止。すべての候補条件を効果前の同じ状態で観測 |

`src/storage/flowWorldDurability.test.ts` はfake IndexedDBの保存結合証拠。実ブラウザーnative保存は `tests/e2e/review-runtime.spec.ts` のproduction通常画面証拠と分ける。`tests/browser/review-interactions.mjs` は実React部品を遅延/失敗ホストで操作する実ブラウザー検査。jsdomや注入ホストを実機/通常App/実Authの代替へしない。

部品ホストのChromium、Firefox155.0、WebKit26.6で9群が成功。Linuxの自動ブラウザーであり、実iOS/macOS Safariではない。WebKitの共有ライブラリは一時ディレクトリへ展開し、起動wrapperへ渡した。host依存検査のldconfig限定GLES判定は省略して実プロセスの起動と全画面操作を確認した。製品の実行条件や期待値を省略した意味ではない。

通常Appの最初の全38件では36成功/2失敗。失敗は再実行の既存noticeを補修で短くした点の厳密期待だったため、既存文言を保持する修正を行った。関連14件は再成功し、対象コードの最終全体検査は証拠logへ記録する。元116受入のgiven/when/then/negative全体の合格へ換算しない。

独立レビューで同一終了内の原因上書き、同一場面終端、章境界、欠落途中値、範囲判定の三値順序、設定保存中再入・ack、不正JSON、借用仮値、旧記録の空原因互換、借用クエストの禁則、初期提示例外の文脈を再現し修正した。[独立候補レビュー](INDEPENDENT_CANDIDATE_REVIEW.md)のhashと証拠を保持する。

完成対象commitの116受入、24工程、6回帰群、実iPhone/iPad/PC全ブラウザー、IME/Files/録音/回転/200%/VoiceOver/NVDA、Standard全指標30回と素材付きLarge/2時間、専用接続先の実Auth/RLS/private Storageは未実行。RV11〜RV30の独立して進められる残実装は現在照合へ残す。公開gateを変更しない。

最終補修対象の単体・保存検査553件とproduction Chromium38件が成功した。build、schema生成、文書検査、計画検査、Python15件も検査する。原仕様へ追加説明を挿入した際は計画の凍結hash検査が拒否したため、原文を復元し、[追加実装契約](../../implementation/RUNTIME_REPAIR_CONTRACT.md)へ説明を分離した。検査条件を変更して通したものではない。非同期開始の時点・解析条件はhash確認前に捕捉する。
# RB05第2追加の検査

階層・反応系列・途中開始は[追加契約](../../implementation/RB05_STRUCTURE_READING.md)と`evidence/rb05-structure`を参照。通常production3件は固定版付き途中状態の通常編集→保存→再読込→開始→巻戻、反応下書き→画面移動→cold reload→作成→保存→初回／再訪、階層→未接続の通常修正→再読込を検査する。Node/保存の587件も成功。並列の独立ブラウザー検査と全60 workerを同時に実行した回では既存5,001イベントの20秒上限が一度切れた。上限や期待値は変えず、worker4で587件を再実行して成功し、失敗logも保持する。実端末や116受入の完成結果へ換算しない。
