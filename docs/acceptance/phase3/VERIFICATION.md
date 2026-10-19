# 外部受入の独立準備台帳

2026-10-19。準備は各caseの入力・手順・空の記録欄・次操作が定義済みという意味。全22件の実受入は **BLOCKED / 未実行**。実機・実Auth・専用サービス・対象ゲーム・実契約はまだ提供されていない。この台帳作成時に接続・認証・課金・公開設定は変更していない。

原本は [acceptance_cases.json](../../data/acceptance_cases.json)（SHA-256 `e1e4b06a3bb1cd79fc590239ab6350103323335f2e1ee87a2e6a283755834c4f`）のgiven/when/then/negative_or_edgeを以下に逐語保持する。[原外部表](../../quality/pr49-followup-2026-10-15/EXTERNAL_CASES.md)の22IDと一致。原116件を増減しない。[実機手順](../../quality/pr49-followup-2026-10-15/MANUAL_REVIEW.md)にある旧候補のcommit/build/404は過去値であり、今回の実行値へ転記しない。

| 独立分類 | 件数 | 原ID |
| --- | --- | --- |
| 実機 | 9 | AT-B24, AT-F31, AT-F33, AT-N02, AT-N03, AT-N04, AT-N13, AT-E01, AT-E11 |
| 実機＋実サービス | 6 | AT-F01, AT-F34, AT-N07, AT-N11, AT-E06, AT-E12 |
| 実Auth | 4 | AT-F29, AT-F30, AT-N08, AT-E05 |
| ゲーム | 2 | AT-F42, AT-E10 |
| 契約/費用 | 1 | AT-N17 |

各caseの記録欄は空であり、認証秘密・実名・実作品・URL内tokenを入力しない。実行者は匿名役割ラベル、資格情報は承認済みの別経路で渡す。実施時にtarget commit/tree/build/base、fixture path/bytes/SHA、実OS/browser/端末、実操作時刻、四条項それぞれの期待と実結果、raw path/bytes/SHA、判定を埋める。未記入の欄は成功ではない。実二端末はA/Bの機種/OS/browser、同baseRevision、各operation IDと送信順も記録する。

実機計画の端末表は [UI_UX](../../spec/UI_UX.md) を保持する。タッチ/OS IME/VoiceOver/NVDA/Files/旧アプリ更新をLinux自動WebKit、Unicode fill、browser offline、cache ID変更、プログラム取消で置換しない。mock Auth・汎用receiver・一般料金表は原実条件の成功にしない。実行開始前に許可済み隔離対象と担当を明示し、既存本番・別用途Supabaseには接続しない。

## AT-B24

分類: 実機。準備: **PREPARED**。実受入: **BLOCKED / 未実行**。

| 原条項 | 原文 |
| --- | --- |
| given | タッチ端末で作品を開く |
| when | 絞り込んで関係線や条件を編集する |
| then | マウスなしで完了し絞り込みの範囲を把握できる |
| negative_or_edge | 根拠が不足する候補を確定不具合と断定せず、色だけで意味を伝えない |

必要環境・人: iPhone 17 Pro Safari、iPad Pro 2018 Safari。作者1名、実タッチのみ。二端末同期/ゲーム/費用は不要。

隔離入力・成果物: 人物2名・関係線・括弧付き条件と根拠不足の候補を持つ隔離作品。

実施・記録手順: 絞込条件を記録→関係線と条件をタッチ編集→保存して再度開く。根拠不足の候補を確定不具合にしない表示、色以外のラベルを画面記録する。

安全な空の記録様式（このcase専用）:

```json
{
  "case_id": "AT-B24",
  "operator_role": "",
  "target": {
    "commit": "",
    "tree": "",
    "build": "",
    "base": ""
  },
  "environment": {
    "device_A": "",
    "device_B": "",
    "OS_browser_IME_assistive_versions": "",
    "service_role_labels": "",
    "game_engine_adapter": "",
    "actual_contract_cost_period": ""
  },
  "fixture": {
    "path": "",
    "bytes": null,
    "sha256": "",
    "project_id": "",
    "revision": "",
    "version_id": "",
    "entity_ids": []
  },
  "clauses": {
    "given": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "when": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "then": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "negative_or_edge": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    }
  },
  "started_at": "",
  "finished_at": "",
  "result": "not_run",
  "blocker": "",
  "next_action": ""
}
```

次の一操作: 担当者が実タッチ端末の機種/OS/Safari版を記入する。

## AT-F01

分類: 実機＋実サービス。準備: **PREPARED**。実受入: **BLOCKED / 未実行**。

| 原条項 | 原文 |
| --- | --- |
| given | 文章メモ「塔の鍵は鳥が持つ」、画像1枚、音声1件をスマートフォンで保存した作品 |
| when | メモから場面へ変換し、別端末で同期後の変換元と変換先を開く |
| then | スマートフォンで一文を残し、PCで場面へ変えても元のメモを追える。 |
| negative_or_edge | 録音を拒否した端末でも文章を保存できる。変換は元メモを消さず、元と変換先のIDを結ぶ。 |

必要環境・人: iPhone 17 Pro Safari/Chrome＋実PC Chrome/Edge。作者owner/editor、専用同期tenant、録音許可と拒否。二実端末必須。ゲーム/費用試験は不要。

隔離入力・成果物: 隔離作品に原メモ「塔の鍵は鳥が持つ」、PNG1枚、実録音1件。原メモと素材bytesを完全保存する。

実施・記録手順: スマートフォンでメモ/画像/音声を保存→実同期→PCで場面へ変換→両端末で元/先を開く。録音拒否でも文章を保存し、元と先のID連結/元非削除を照合する。

安全な空の記録様式（このcase専用）:

```json
{
  "case_id": "AT-F01",
  "operator_role": "",
  "target": {
    "commit": "",
    "tree": "",
    "build": "",
    "base": ""
  },
  "environment": {
    "device_A": "",
    "device_B": "",
    "OS_browser_IME_assistive_versions": "",
    "service_role_labels": "",
    "game_engine_adapter": "",
    "actual_contract_cost_period": ""
  },
  "fixture": {
    "path": "",
    "bytes": null,
    "sha256": "",
    "project_id": "",
    "revision": "",
    "version_id": "",
    "entity_ids": []
  },
  "clauses": {
    "given": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "when": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "then": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "negative_or_edge": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    }
  },
  "started_at": "",
  "finished_at": "",
  "result": "not_run",
  "blocker": "",
  "next_action": ""
}
```

次の一操作: 管理者がこのアプリ専用の隔離同期tenantと実二端末を指定する。

## AT-F29

分類: 実Auth。準備: **PREPARED**。実受入: **BLOCKED / 未実行**。

| 原条項 | 原文 |
| --- | --- |
| given | 版1の台詞Lにreviewerが指摘したコメント |
| when | 本文改訂、対象段落削除、修正済み、再確認済みを順に行い元版の引用を開く |
| then | 指摘から対象を開け、対象が変わっても何についての指摘だったか追える。 |
| negative_or_edge | 指摘時の対象版と引用範囲を保持する。対象段落が削除されても元指摘は残し、最新位置は不明と表示する。 |

必要環境・人: 実PCまたは実iPhoneのHTTPS候補、owner/editorと実reviewerの資格。実Auth必須、二端末同期/ゲーム/費用は不要。

隔離入力・成果物: 台詞L版1と段落/引用範囲、reviewerが通常ログインして作成する指摘。トークンは台帳外で受渡す。

実施・記録手順: reviewer指摘→editor改訂→段落削除→修正済み→reviewer再確認済み→元引用を開く。元版/引用範囲、削除後の最新位置不明と指摘残存を記録する。

安全な空の記録様式（このcase専用）:

```json
{
  "case_id": "AT-F29",
  "operator_role": "",
  "target": {
    "commit": "",
    "tree": "",
    "build": "",
    "base": ""
  },
  "environment": {
    "device_A": "",
    "device_B": "",
    "OS_browser_IME_assistive_versions": "",
    "service_role_labels": "",
    "game_engine_adapter": "",
    "actual_contract_cost_period": ""
  },
  "fixture": {
    "path": "",
    "bytes": null,
    "sha256": "",
    "project_id": "",
    "revision": "",
    "version_id": "",
    "entity_ids": []
  },
  "clauses": {
    "given": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "when": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "then": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "negative_or_edge": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    }
  },
  "started_at": "",
  "finished_at": "",
  "result": "not_run",
  "blocker": "",
  "next_action": ""
}
```

次の一操作: 管理者が隔離Authの実reviewer/editor役割を指定する。

## AT-F30

分類: 実Auth。準備: **PREPARED**。実受入: **BLOCKED / 未実行**。

| 原条項 | 原文 |
| --- | --- |
| given | chapter限定reader、reviewer、editorと秘密の本名/関係/添付 |
| when | 各役割で本文、検索、図、リンク、素材と直接APIを操作し、秘密の取得と本文更新を試す |
| then | 秘密を隠した本文から、検索や関連図、リンク先を使って秘密が見えない。 |
| negative_or_edge | 権限はサーバー側と出力時に検証する。非公開データを送ってCSSで隠す方式を禁止し、検索・素材・参照数にも同じ投影を適用する。 |

必要環境・人: 専用HTTPS/Auth/DataAPI/private Storage。owner/editor/reviewer/chapter限定reader/nonmemberの5実役割。実PCの独立セッション。二端末同期/ゲーム/費用は不要。

隔離入力・成果物: 秘密の本名/関係/添付とchapter限定投影を持つ隔離作品。期待allowlistと拒否対象の合成IDを先に固定。

実施・記録手順: 各役割の本文/検索/図/リンク/素材/直接APIと更新を実施。許可投影だけの応答を検査し、秘密本文/名称/ID/件数/素材メタデータをサーバーと出力双方で拒否する。秘密値を証跡へ複写せず拒否対象ラベルと応答hashを残す。

安全な空の記録様式（このcase専用）:

```json
{
  "case_id": "AT-F30",
  "operator_role": "",
  "target": {
    "commit": "",
    "tree": "",
    "build": "",
    "base": ""
  },
  "environment": {
    "device_A": "",
    "device_B": "",
    "OS_browser_IME_assistive_versions": "",
    "service_role_labels": "",
    "game_engine_adapter": "",
    "actual_contract_cost_period": ""
  },
  "fixture": {
    "path": "",
    "bytes": null,
    "sha256": "",
    "project_id": "",
    "revision": "",
    "version_id": "",
    "entity_ids": []
  },
  "clauses": {
    "given": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "when": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "then": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "negative_or_edge": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    }
  },
  "started_at": "",
  "finished_at": "",
  "result": "not_run",
  "blocker": "",
  "next_action": ""
}
```

次の一操作: 管理者が専用private bucketと5役割の安全な資格受渡し先を指定する。

## AT-F31

分類: 実機。準備: **PREPARED**。実受入: **BLOCKED / 未実行**。

| 原条項 | 原文 |
| --- | --- |
| given | 人物/条件/関係線/専用ファイルを持つ作品と未保存入力 |
| when | 幅320/390/768/1024/1440、縦横/分割で配置を切替え、狭幅だけで編集と読み込みを完了する |
| then | 人物、条件、関係線、読み込みの編集を、スマートフォンだけでも完了できる。 |
| negative_or_edge | 端末の幅で表示を切り替え、重要操作をPCに限定しない。分割表示やソフトキーボードで確定ボタンが隠れない。 |

必要環境・人: iPhone 17 Pro Safari、iPad Pro 2018 Safari（実Split View）、実PC。作者1名。二端末同期/ゲーム/費用は不要。

隔離入力・成果物: 人物/条件/関係線/専用ファイルと未保存入力。幅320/390/768/1024/1440、縦横/分割の対応表。

実施・記録手順: 各幅で実配置を記録→狭幅だけで編集と読込→縦横/分割/ソフトキーボードで確定へ到達。未保存文を前後比較し、PCに切り替えず完了を記録する。

安全な空の記録様式（このcase専用）:

```json
{
  "case_id": "AT-F31",
  "operator_role": "",
  "target": {
    "commit": "",
    "tree": "",
    "build": "",
    "base": ""
  },
  "environment": {
    "device_A": "",
    "device_B": "",
    "OS_browser_IME_assistive_versions": "",
    "service_role_labels": "",
    "game_engine_adapter": "",
    "actual_contract_cost_period": ""
  },
  "fixture": {
    "path": "",
    "bytes": null,
    "sha256": "",
    "project_id": "",
    "revision": "",
    "version_id": "",
    "entity_ids": []
  },
  "clauses": {
    "given": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "when": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "then": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "negative_or_edge": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    }
  },
  "started_at": "",
  "finished_at": "",
  "result": "not_run",
  "blocker": "",
  "next_action": ""
}
```

次の一操作: 担当者がiPhone/iPad/PCと実幅・OS・browserの割当を記入する。

## AT-F33

分類: 実機。準備: **PREPARED**。実受入: **BLOCKED / 未実行**。

| 原条項 | 原文 |
| --- | --- |
| given | PC幅で保存した拡大率/図位置とスマートフォン別設定 |
| when | 名前付き検索/お気に入りから再開し、別端末の同場面と削除済み再開リンクを開く |
| then | 別端末で同じ場面を開いても、小さい画面へPCの細かい配置を押し付けない。 |
| negative_or_edge | 内容と端末別の表示設定を分ける。削除された対象への再開リンクは履歴または復元案内へ移し白画面にしない。 |

必要環境・人: 実PC Chrome/Edgeと実iPhone Safariの二実端末。作者1名。内容受渡しは完全ファイル（実同期合格へは転記しない）。ゲーム/費用は不要。

隔離入力・成果物: 同一作品、PC拡大率/図位置とスマートフォン別表示設定、名前付き検索/お気に入り、削除済み再開リンク。

実施・記録手順: PC設定保存→スマートフォンで同場面を開く→名前付き検索/お気に入りから再開→削除済みリンク。内容ID一致と端末設定非強制、履歴/復元案内と白画面無しを記録する。

安全な空の記録様式（このcase専用）:

```json
{
  "case_id": "AT-F33",
  "operator_role": "",
  "target": {
    "commit": "",
    "tree": "",
    "build": "",
    "base": ""
  },
  "environment": {
    "device_A": "",
    "device_B": "",
    "OS_browser_IME_assistive_versions": "",
    "service_role_labels": "",
    "game_engine_adapter": "",
    "actual_contract_cost_period": ""
  },
  "fixture": {
    "path": "",
    "bytes": null,
    "sha256": "",
    "project_id": "",
    "revision": "",
    "version_id": "",
    "entity_ids": []
  },
  "clauses": {
    "given": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "when": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "then": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "negative_or_edge": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    }
  },
  "started_at": "",
  "finished_at": "",
  "result": "not_run",
  "blocker": "",
  "next_action": ""
}
```

次の一操作: 担当者が二実端末と同じ完全ファイルのSHAを指定する。

## AT-F34

分類: 実機＋実サービス。準備: **PREPARED**。実受入: **BLOCKED / 未実行**。

| 原条項 | 原文 |
| --- | --- |
| given | 二端末が同じbaseRevisionの作品を取得済み |
| when | 機内モードで同じ本文を別々に編集し、順不同で同期して競合を選び再送する |
| then | 二つの端末で同じ項目を変えた場合、片方を黙って消さずに両方を確認して選べる。 |
| negative_or_edge | 同一項目の競合は双方と共通元を保持する。保存済みと同期済みを混同せず、再送・削除対編集でも黙って上書きしない。 |

必要環境・人: 専用実Authと同期、同baseRevisionを取得した二実端末（iPhone＋PC）。作者owner/editor。ゲーム/費用は不要。

隔離入力・成果物: 同じ本文の共通元、A/B別案、削除対編集、重複/順逆送信表。元完全ファイル保持。

実施・記録手順: OS機内モードでA/B変更→順逆同期→共通元/双方を比較し選択→再送→削除対編集。各操作ID・baseRevision・端末内保存/同期表示を比較し黙示上書きを拒否する。

安全な空の記録様式（このcase専用）:

```json
{
  "case_id": "AT-F34",
  "operator_role": "",
  "target": {
    "commit": "",
    "tree": "",
    "build": "",
    "base": ""
  },
  "environment": {
    "device_A": "",
    "device_B": "",
    "OS_browser_IME_assistive_versions": "",
    "service_role_labels": "",
    "game_engine_adapter": "",
    "actual_contract_cost_period": ""
  },
  "fixture": {
    "path": "",
    "bytes": null,
    "sha256": "",
    "project_id": "",
    "revision": "",
    "version_id": "",
    "entity_ids": []
  },
  "clauses": {
    "given": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "when": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "then": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "negative_or_edge": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    }
  },
  "started_at": "",
  "finished_at": "",
  "result": "not_run",
  "blocker": "",
  "next_action": ""
}
```

次の一操作: 管理者が隔離同期環境と二実端末の同baseRevisionを指定する。

## AT-F42

分類: ゲーム。準備: **PREPARED**。実受入: **BLOCKED / 未実行**。

| 原条項 | 原文 |
| --- | --- |
| given | ゲーム管理の戦闘結果enum契約とstub勝利、実ゲーム証跡未登録 |
| when | stubで通った道を出力し、後にactual結果をline/flow ID対応付きで記録して比較する |
| then | 仮の戦闘結果で通れた道と、ゲーム上で実際に確認した道を区別する。番号と値の対応を保つ。 |
| negative_or_edge | 外部値の管理元・型・欠損時の扱いを固定する。仮の外部応答とゲーム実機の確認結果は別証跡とする。 |

必要環境・人: 対象ゲームの名称/engine/version/adapterと実行担当、作者とゲーム確認者。実対象が必須。実Auth/二端末同期/費用は対象ゲームが要求する場合だけ別途指定。

隔離入力・成果物: 管理元gameの戦闘結果enum契約、型/欠損方針/版、stub勝利、未登録actual。packageとline/flow ID対応。

実施・記録手順: stub経路の実出力を保持→対象ゲームで戦闘→actual receiptとhash/ID対応を取込→差分比較。仮/実を別証跡にし、欠損/型不一致を拒否する。

安全な空の記録様式（このcase専用）:

```json
{
  "case_id": "AT-F42",
  "operator_role": "",
  "target": {
    "commit": "",
    "tree": "",
    "build": "",
    "base": ""
  },
  "environment": {
    "device_A": "",
    "device_B": "",
    "OS_browser_IME_assistive_versions": "",
    "service_role_labels": "",
    "game_engine_adapter": "",
    "actual_contract_cost_period": ""
  },
  "fixture": {
    "path": "",
    "bytes": null,
    "sha256": "",
    "project_id": "",
    "revision": "",
    "version_id": "",
    "entity_ids": []
  },
  "clauses": {
    "given": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "when": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "then": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "negative_or_edge": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    }
  },
  "started_at": "",
  "finished_at": "",
  "result": "not_run",
  "blocker": "",
  "next_action": ""
}
```

次の一操作: ゲーム担当者が対象ゲーム名/engine/version/adapterを記入する。

## AT-N02

分類: 実機。準備: **PREPARED**。実受入: **BLOCKED / 未実行**。

| 原条項 | 原文 |
| --- | --- |
| given | UI_UXの対象端末表 |
| when | 同じ総合試験を対象環境で実行する |
| then | 保存・再読込・ファイル往復・タッチ操作が成功する |
| negative_or_edge | 自動ブラウザー試験だけを実端末の合格証拠にしない |

必要環境・人: UI_UX端末表のiPhone 17 Pro Safari/Chrome、iPad Pro 2018 Safari、Windows/macOS Chrome/Edge/Firefox、macOS Safari。作者。二端末同期/ゲーム/費用は不要。

隔離入力・成果物: 同一総合fixtureの完全ファイルと対象build。端末ごとの元ID/内容を固定。

実施・記録手順: 対象表の各実環境で保存→cold再読込→実ファイル往復→タッチ操作。OS/browser/版とID/bytes/結果を別行で記録し自動3engine結果を転記しない。

安全な空の記録様式（このcase専用）:

```json
{
  "case_id": "AT-N02",
  "operator_role": "",
  "target": {
    "commit": "",
    "tree": "",
    "build": "",
    "base": ""
  },
  "environment": {
    "device_A": "",
    "device_B": "",
    "OS_browser_IME_assistive_versions": "",
    "service_role_labels": "",
    "game_engine_adapter": "",
    "actual_contract_cost_period": ""
  },
  "fixture": {
    "path": "",
    "bytes": null,
    "sha256": "",
    "project_id": "",
    "revision": "",
    "version_id": "",
    "entity_ids": []
  },
  "clauses": {
    "given": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "when": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "then": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "negative_or_edge": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    }
  },
  "started_at": "",
  "finished_at": "",
  "result": "not_run",
  "blocker": "",
  "next_action": ""
}
```

次の一操作: 担当者がUI_UX表の実機ごとの実施者とOS/browser版を割り当てる。

## AT-N03

分類: 実機。準備: **PREPARED**。実受入: **BLOCKED / 未実行**。

| 原条項 | 原文 |
| --- | --- |
| given | キーボードとVoiceOverまたはNVDA |
| when | 主な作成から出力まで操作する |
| then | フォーカス・読み上げ・エラー・完了通知が判断できる |
| negative_or_edge | 図だけで編集を強制せず、見える焦点や拡大を無効にしない |

必要環境・人: 実iPhone/macOS VoiceOverまたは実Windows NVDA＋キーボード。作者と支援技術確認者。二端末同期/ゲーム/費用は不要。

隔離入力・成果物: 空作品から人物/場面/本文/不正入力/出力まで。図の一覧代替と取消モーダル。

実施・記録手順: 作成→保存→試読→出力をキーボード/実読上げで操作し、焦点順/見える焦点/読上げ/エラー/完了通知を逐次記録。図強制や拡大無効を検出する。

安全な空の記録様式（このcase専用）:

```json
{
  "case_id": "AT-N03",
  "operator_role": "",
  "target": {
    "commit": "",
    "tree": "",
    "build": "",
    "base": ""
  },
  "environment": {
    "device_A": "",
    "device_B": "",
    "OS_browser_IME_assistive_versions": "",
    "service_role_labels": "",
    "game_engine_adapter": "",
    "actual_contract_cost_period": ""
  },
  "fixture": {
    "path": "",
    "bytes": null,
    "sha256": "",
    "project_id": "",
    "revision": "",
    "version_id": "",
    "entity_ids": []
  },
  "clauses": {
    "given": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "when": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "then": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "negative_or_edge": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    }
  },
  "started_at": "",
  "finished_at": "",
  "result": "not_run",
  "blocker": "",
  "next_action": ""
}
```

次の一操作: 担当者が実VoiceOverまたはNVDAと確認者を指定する。

## AT-N04

分類: 実機。準備: **PREPARED**。実受入: **BLOCKED / 未実行**。

| 原条項 | 原文 |
| --- | --- |
| given | 標準データと実測対象端末 |
| when | 指定操作を30回ずつ実行する |
| then | 記録した条件で全目標値を満たす |
| negative_or_edge | 実測前の数値を達成済みとしない。超過を要件削減で黙って隠さない |

必要環境・人: 原性能手順の実測対象端末と指定OS/browser。測定担当。二端末同期/ゲーム/費用は不要。

隔離入力・成果物: 元Standard/Large生成物と各SHA、操作一覧/元上限表を固定。Linux過去値を入力しない。

実施・記録手順: 指定操作を各30回、raw全標本とp95算出法・条件を保存→原目標値と比較。超過も記録し要件や標本を削らない。

安全な空の記録様式（このcase専用）:

```json
{
  "case_id": "AT-N04",
  "operator_role": "",
  "target": {
    "commit": "",
    "tree": "",
    "build": "",
    "base": ""
  },
  "environment": {
    "device_A": "",
    "device_B": "",
    "OS_browser_IME_assistive_versions": "",
    "service_role_labels": "",
    "game_engine_adapter": "",
    "actual_contract_cost_period": ""
  },
  "fixture": {
    "path": "",
    "bytes": null,
    "sha256": "",
    "project_id": "",
    "revision": "",
    "version_id": "",
    "entity_ids": []
  },
  "clauses": {
    "given": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "when": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "then": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "negative_or_edge": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    }
  },
  "started_at": "",
  "finished_at": "",
  "result": "not_run",
  "blocker": "",
  "next_action": ""
}
```

次の一操作: 測定担当が原指定端末・電源/負荷条件と対象buildを記入する。

## AT-N07

分類: 実機＋実サービス。準備: **PREPARED**。実受入: **BLOCKED / 未実行**。

| 原条項 | 原文 |
| --- | --- |
| given | オフラインの二端末 |
| when | 同じ本文を変更し順不同で同期する |
| then | 二案を比較して解決でき再送しても効果が二重化しない |
| negative_or_edge | 端末時計や最終書込だけで片方を消さない |

必要環境・人: 実オフライン二端末、専用実Auth/同期、owner/editor。ゲーム/費用は不要。

隔離入力・成果物: 同本文/共通revision、A/B変更、送信順AB/BAと同一operation再送表。

実施・記録手順: 各実端末を機内モード→同本文別案保存→順逆同期→二案/共通元比較→解決→重複再送。効果一回と両案保持をoperation IDで確認し端末時計に依存しない。

安全な空の記録様式（このcase専用）:

```json
{
  "case_id": "AT-N07",
  "operator_role": "",
  "target": {
    "commit": "",
    "tree": "",
    "build": "",
    "base": ""
  },
  "environment": {
    "device_A": "",
    "device_B": "",
    "OS_browser_IME_assistive_versions": "",
    "service_role_labels": "",
    "game_engine_adapter": "",
    "actual_contract_cost_period": ""
  },
  "fixture": {
    "path": "",
    "bytes": null,
    "sha256": "",
    "project_id": "",
    "revision": "",
    "version_id": "",
    "entity_ids": []
  },
  "clauses": {
    "given": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "when": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "then": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "negative_or_edge": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    }
  },
  "started_at": "",
  "finished_at": "",
  "result": "not_run",
  "blocker": "",
  "next_action": ""
}
```

次の一操作: 管理者が実二端末と隔離同期接続を指定する。

## AT-N08

分類: 実Auth。準備: **PREPARED**。実受入: **BLOCKED / 未実行**。

| 原条項 | 原文 |
| --- | --- |
| given | 非メンバーと限定閲覧者 |
| when | 直接APIと検索と素材へアクセスする |
| then | 許可した投影以外の本文・名称・ID・メタデータが取得できない |
| negative_or_edge | secretキーの公開、UIのみの非表示、他作品のID差替えを許さない |

必要環境・人: 専用Auth/DataAPI/private Storage、実nonmemberと限定reader、owner準備者。実PC独立セッション。二端末同期/ゲーム/費用は不要。

隔離入力・成果物: 許可投影と非公開本文/名称/ID/メタデータ/素材、別作品の合成ID。

実施・記録手順: 各実役割で検索/直接API/private素材取得→別project ID差替え。拒否とallowlistの応答を記録しUI非表示だけで判定しない。公開bundleにsecretキーを含めない。

安全な空の記録様式（このcase専用）:

```json
{
  "case_id": "AT-N08",
  "operator_role": "",
  "target": {
    "commit": "",
    "tree": "",
    "build": "",
    "base": ""
  },
  "environment": {
    "device_A": "",
    "device_B": "",
    "OS_browser_IME_assistive_versions": "",
    "service_role_labels": "",
    "game_engine_adapter": "",
    "actual_contract_cost_period": ""
  },
  "fixture": {
    "path": "",
    "bytes": null,
    "sha256": "",
    "project_id": "",
    "revision": "",
    "version_id": "",
    "entity_ids": []
  },
  "clauses": {
    "given": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "when": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "then": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "negative_or_edge": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    }
  },
  "started_at": "",
  "finished_at": "",
  "result": "not_run",
  "blocker": "",
  "next_action": ""
}
```

次の一操作: 管理者が専用環境の実nonmember/限定readerを指定する。

## AT-N11

分類: 実機＋実サービス。準備: **PREPARED**。実受入: **BLOCKED / 未実行**。

| 原条項 | 原文 |
| --- | --- |
| given | 取得済み作品で機内モードにする |
| when | 編集して閉じ再度開き専用ファイルを出す |
| then | 端末内保存済みと未送信が区別され作品内容が残る |
| negative_or_edge | 初回取得や未キャッシュ添付を利用済みと偽表示しない |

必要環境・人: 取得済みPWAの実iPhone/PC、OS機内モード、専用remote素材サービス（未cache対照を保持）、owner。二端末同期/ゲーム/費用は不要。

隔離入力・成果物: 取得済み作品/素材、初回未取得作品と未cache remote素材の対照。元完全保存。

実施・記録手順: OS機内モード→編集/保存→アプリを閉じcold再開→実Filesへ完全出力。端末内保存と未送信を区別し、未取得作品/素材は成功表示しない。remote未cacheをDB削除だけで代用しない。

安全な空の記録様式（このcase専用）:

```json
{
  "case_id": "AT-N11",
  "operator_role": "",
  "target": {
    "commit": "",
    "tree": "",
    "build": "",
    "base": ""
  },
  "environment": {
    "device_A": "",
    "device_B": "",
    "OS_browser_IME_assistive_versions": "",
    "service_role_labels": "",
    "game_engine_adapter": "",
    "actual_contract_cost_period": ""
  },
  "fixture": {
    "path": "",
    "bytes": null,
    "sha256": "",
    "project_id": "",
    "revision": "",
    "version_id": "",
    "entity_ids": []
  },
  "clauses": {
    "given": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "when": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "then": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "negative_or_edge": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    }
  },
  "started_at": "",
  "finished_at": "",
  "result": "not_run",
  "blocker": "",
  "next_action": ""
}
```

次の一操作: 担当者がキャッシュ済み実端末と未cache remote素材の隔離先を指定する。

## AT-N13

分類: 実機。準備: **PREPARED**。実受入: **BLOCKED / 未実行**。

| 原条項 | 原文 |
| --- | --- |
| given | 日本語変換途中と負の巨大tick |
| when | 保存・検索・出力・読み戻しを行う |
| then | 原文とIDとtick文字列が完全一致する |
| negative_or_edge | IME変換を操作キーで確定前に破壊したり、tickを浮動小数で丸めない |

必要環境・人: 実iPhone/macOS/Windows日本語OS IME、対象キーボード。作者。二端末同期/ゲーム/費用は不要。

隔離入力・成果物: 日本語の変換途中の文と負の巨大tick文字列（例 -900719925474099312345）、元ID/原文を完全ファイルに保持。

実施・記録手順: 未確定変換中に操作キー/保存/検索/出力/読戻し→原文・ID・tickの文字列完全一致。IME途中破壊と浮動小数丸めを検出し実キーと変換状態を記録する。

安全な空の記録様式（このcase専用）:

```json
{
  "case_id": "AT-N13",
  "operator_role": "",
  "target": {
    "commit": "",
    "tree": "",
    "build": "",
    "base": ""
  },
  "environment": {
    "device_A": "",
    "device_B": "",
    "OS_browser_IME_assistive_versions": "",
    "service_role_labels": "",
    "game_engine_adapter": "",
    "actual_contract_cost_period": ""
  },
  "fixture": {
    "path": "",
    "bytes": null,
    "sha256": "",
    "project_id": "",
    "revision": "",
    "version_id": "",
    "entity_ids": []
  },
  "clauses": {
    "given": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "when": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "then": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "negative_or_edge": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    }
  },
  "started_at": "",
  "finished_at": "",
  "result": "not_run",
  "blocker": "",
  "next_action": ""
}
```

次の一操作: 担当者が実OS IMEの名称/版と操作キーボードを記入する。

## AT-N17

分類: 契約/費用。準備: **PREPARED**。実受入: **BLOCKED / 未実行**。

| 原条項 | 原文 |
| --- | --- |
| given | 公開候補の構成と見積表 |
| when | サブパス・直リンク・更新・再読込を確認する |
| then | 表示版が対象commitと一致し費用の有無を確認できる |
| negative_or_edge | この資料の作成だけで公開済みや費用ゼロと宣言しない |

必要環境・人: 許可された専用HTTPS検証URLと実構成/tier/region/使用量/残量/費用の読取り権限。管理者/費用確認者。二端末/ゲームは不要。

隔離入力・成果物: 対象commit/tree/build/base、実契約見積と計測時刻。一般料金表は参考別欄。既存本番/別用途projectは触らない。

実施・記録手順: サブパス/直リンク/更新/再読込を実URLで確認→build-infoとcommit一致→実tier/region/使用量/残枠/費用・通貨/期間/税込別を記録。文書作成だけで公開済/費用0にしない。

安全な空の記録様式（このcase専用）:

```json
{
  "case_id": "AT-N17",
  "operator_role": "",
  "target": {
    "commit": "",
    "tree": "",
    "build": "",
    "base": ""
  },
  "environment": {
    "device_A": "",
    "device_B": "",
    "OS_browser_IME_assistive_versions": "",
    "service_role_labels": "",
    "game_engine_adapter": "",
    "actual_contract_cost_period": ""
  },
  "fixture": {
    "path": "",
    "bytes": null,
    "sha256": "",
    "project_id": "",
    "revision": "",
    "version_id": "",
    "entity_ids": []
  },
  "clauses": {
    "given": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "when": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "then": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "negative_or_edge": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    }
  },
  "started_at": "",
  "finished_at": "",
  "result": "not_run",
  "blocker": "",
  "next_action": ""
}
```

次の一操作: 管理者が変更不要の専用検証URLと実契約の読取り資料を指定する。

## AT-E01

分類: 実機。準備: **PREPARED**。実受入: **BLOCKED / 未実行**。

| 原条項 | 原文 |
| --- | --- |
| given | iPhone縦画面と空作品 |
| when | 人物2名、共通/個人出来事、場所、線、括弧付き条件を作成して専用ファイルを書き出し読み戻す |
| then | PCを使わずIDと内容が一致し再編集できる |
| negative_or_edge | 入力中のキーボード、横画面、取消、Filesのキャンセルでも入力を失わない |

必要環境・人: iPhone 17 Pro Safari縦画面だけ、作者。PC補助なし。実Files/回転/ソフトキーボード。二端末同期/ゲーム/費用は不要。

隔離入力・成果物: 空作品→人物2名、共通/個人出来事、場所、線、括弧付き条件を実入力。

実施・記録手順: iPhoneだけで全登録→専用ファイル実Files保存→OS保存先取消/再試行→空領域new復元→ID/内容比較→再編集。横画面/入力中キーボード/取消の未保存保持を記録する。

安全な空の記録様式（このcase専用）:

```json
{
  "case_id": "AT-E01",
  "operator_role": "",
  "target": {
    "commit": "",
    "tree": "",
    "build": "",
    "base": ""
  },
  "environment": {
    "device_A": "",
    "device_B": "",
    "OS_browser_IME_assistive_versions": "",
    "service_role_labels": "",
    "game_engine_adapter": "",
    "actual_contract_cost_period": ""
  },
  "fixture": {
    "path": "",
    "bytes": null,
    "sha256": "",
    "project_id": "",
    "revision": "",
    "version_id": "",
    "entity_ids": []
  },
  "clauses": {
    "given": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "when": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "then": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "negative_or_edge": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    }
  },
  "started_at": "",
  "finished_at": "",
  "result": "not_run",
  "blocker": "",
  "next_action": ""
}
```

次の一操作: 担当者がiPhoneと実Filesの空検証領域を指定する。

## AT-E05

分類: 実Auth。準備: **PREPARED**。実受入: **BLOCKED / 未実行**。

| 原条項 | 原文 |
| --- | --- |
| given | 非公開の本名と家系と添付がある限定共有snapshot |
| when | 閲覧者が本文、検索、索引、図、リンク、素材、直接APIを調べる |
| then | 許可した別名だけが出て秘密のID・名前・関係・件数・ファイル名が取得できない |
| negative_or_edge | IDやproject_idを差替えたアクセスと権限撤回後の新規取得は拒否する |

必要環境・人: 専用実Auth/DataAPI/private Storage、owner/editor/reviewer/限定reader/nonmember。HTTPS実セッション。二端末同期/ゲーム/費用は不要。

隔離入力・成果物: 本名/家系/添付を非公開にした限定共有snapshotと公開別名、他作品合成ID。

実施・記録手順: 閲覧者で本文/検索/索引/図/リンク/素材/直接APIを検査→ID/project_id差替え→ownerが隔離権限撤回→新規取得拒否。名前/ID/関係/件数/ファイル名全項目の拒否を照合する。

安全な空の記録様式（このcase専用）:

```json
{
  "case_id": "AT-E05",
  "operator_role": "",
  "target": {
    "commit": "",
    "tree": "",
    "build": "",
    "base": ""
  },
  "environment": {
    "device_A": "",
    "device_B": "",
    "OS_browser_IME_assistive_versions": "",
    "service_role_labels": "",
    "game_engine_adapter": "",
    "actual_contract_cost_period": ""
  },
  "fixture": {
    "path": "",
    "bytes": null,
    "sha256": "",
    "project_id": "",
    "revision": "",
    "version_id": "",
    "entity_ids": []
  },
  "clauses": {
    "given": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "when": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "then": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "negative_or_edge": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    }
  },
  "started_at": "",
  "finished_at": "",
  "result": "not_run",
  "blocker": "",
  "next_action": ""
}
```

次の一操作: 管理者が隔離snapshotと各実役割、限定した撤回操作の担当を指定する。

## AT-E06

分類: 実機＋実サービス。準備: **PREPARED**。実受入: **BLOCKED / 未実行**。

| 原条項 | 原文 |
| --- | --- |
| given | 共通revisionを取得した二端末 |
| when | 両方オフラインで同じ本文を編集、片方削除、重複と順逆で送信する |
| then | 双方と共通元を比較でき、解決後は同じ結果、二重効果と勝手な復活はない |
| negative_or_edge | 容量不足と認証失効時にも未送信を失わず、同期済みと表示しない |

必要環境・人: 同revisionの実二端末、専用実Auth/同期/容量制限用隔離先。owner/editorと管理者。ゲーム/費用は不要。

隔離入力・成果物: 共通元/両本文案、片方削除、重複/順逆送信、容量不足/認証失効の試行表。

実施・記録手順: 両端末機内モード→同本文変更/片側削除→重複/順逆送信→双方/共通元比較→解決→結果一致。容量不足/実認証失効時の未送信保持と同期済でない表示、二重効果/復活無しを記録する。

安全な空の記録様式（このcase専用）:

```json
{
  "case_id": "AT-E06",
  "operator_role": "",
  "target": {
    "commit": "",
    "tree": "",
    "build": "",
    "base": ""
  },
  "environment": {
    "device_A": "",
    "device_B": "",
    "OS_browser_IME_assistive_versions": "",
    "service_role_labels": "",
    "game_engine_adapter": "",
    "actual_contract_cost_period": ""
  },
  "fixture": {
    "path": "",
    "bytes": null,
    "sha256": "",
    "project_id": "",
    "revision": "",
    "version_id": "",
    "entity_ids": []
  },
  "clauses": {
    "given": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "when": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "then": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "negative_or_edge": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    }
  },
  "started_at": "",
  "finished_at": "",
  "result": "not_run",
  "blocker": "",
  "next_action": ""
}
```

次の一操作: 管理者が実二端末と失効/容量拒否を行える専用隔離先を指定する。

## AT-E10

分類: ゲーム。準備: **PREPARED**。実受入: **BLOCKED / 未実行**。

| 原条項 | 原文 |
| --- | --- |
| given | 抽選・無制限ループ・外部戦闘を含む作品 |
| when | 同じ記録を再実行して探索上限まで解析する |
| then | 抽選は再現され、未確認の範囲と分母を示し、仮戦闘結果と実ゲーム結果を別に記録する |
| negative_or_edge | 対象版の変更で再確認待ちになり、打切りを到達不能の証明としない |

必要環境・人: 対象ゲーム名称/engine/version/adapterと実担当。解析は固定build。実Auth/二端末同期/費用は対象ゲームに必要なら別途指定。

隔離入力・成果物: 抽選seed、無制限ループ、外部戦闘契約/仮値を同じ作品/版/IDで固定。

実施・記録手順: 同記録再実行→原探索上限まで解析→分母/未確認範囲保存→対象ゲームactual結果を別記録→対象版改訂して再確認待ち。打切りを到達不能にせずstub/actualとID対応を比較する。

安全な空の記録様式（このcase専用）:

```json
{
  "case_id": "AT-E10",
  "operator_role": "",
  "target": {
    "commit": "",
    "tree": "",
    "build": "",
    "base": ""
  },
  "environment": {
    "device_A": "",
    "device_B": "",
    "OS_browser_IME_assistive_versions": "",
    "service_role_labels": "",
    "game_engine_adapter": "",
    "actual_contract_cost_period": ""
  },
  "fixture": {
    "path": "",
    "bytes": null,
    "sha256": "",
    "project_id": "",
    "revision": "",
    "version_id": "",
    "entity_ids": []
  },
  "clauses": {
    "given": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "when": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "then": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "negative_or_edge": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    }
  },
  "started_at": "",
  "finished_at": "",
  "result": "not_run",
  "blocker": "",
  "next_action": ""
}
```

次の一操作: ゲーム担当者が実対象のengine/version/adapterと実結果記録方法を指定する。

## AT-E11

分類: 実機。準備: **PREPARED**。実受入: **BLOCKED / 未実行**。

| 原条項 | 原文 |
| --- | --- |
| given | 標準/大規模データと対象ブラウザー表 |
| when | キーボード、VoiceOver、200%拡大、狭い幅、図の一覧代替、指定性能を測定する |
| then | 全操作へ到達でき所定環境の測定結果と証拠を残す |
| negative_or_edge | 色依存・ドラッグ専用・焦点喪失・IME破壊・全件DOM描画を検出する |

必要環境・人: UI_UX実端末表、実VoiceOver/NVDA、日本語OS IME、OS文字200%と狭幅。作者/支援技術/性能担当。二端末同期/ゲーム/費用は不要。

隔離入力・成果物: 原Standard/Large・図の一覧代替・原性能目標。各入力SHAを固定。

実施・記録手順: キーボード/実VoiceOver/OS200%/狭幅で全操作→表代替→指定性能raw取得。色依存/ドラッグ専用/焦点喪失/IME破壊/全件DOMを検出し全項目を環境別記録する。

安全な空の記録様式（このcase専用）:

```json
{
  "case_id": "AT-E11",
  "operator_role": "",
  "target": {
    "commit": "",
    "tree": "",
    "build": "",
    "base": ""
  },
  "environment": {
    "device_A": "",
    "device_B": "",
    "OS_browser_IME_assistive_versions": "",
    "service_role_labels": "",
    "game_engine_adapter": "",
    "actual_contract_cost_period": ""
  },
  "fixture": {
    "path": "",
    "bytes": null,
    "sha256": "",
    "project_id": "",
    "revision": "",
    "version_id": "",
    "entity_ids": []
  },
  "clauses": {
    "given": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "when": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "then": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "negative_or_edge": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    }
  },
  "started_at": "",
  "finished_at": "",
  "result": "not_run",
  "blocker": "",
  "next_action": ""
}
```

次の一操作: 担当者が実端末表へ支援技術と性能実施者を割り当てる。

## AT-E12

分類: 実機＋実サービス。準備: **PREPARED**。実受入: **BLOCKED / 未実行**。

| 原条項 | 原文 |
| --- | --- |
| given | キャッシュ済みアプリと未送信作品 |
| when | 機内モード、保存容量不足、途中更新、移行失敗、専用出力からの再開を行う |
| then | 失敗と未保存を明示し、更新は安全地点で適用し、書き出しと復元で再開できる |
| negative_or_edge | 初回未取得・未取得素材・保存先取消を成功と扱わない |

必要環境・人: 実旧アプリbuild＋更新候補の許可済専用HTTPS、実端末機内モード/実Files、専用実Auth/同期/remote未取得素材/容量制限。owner/管理者。二端末は復帰比較に使う場合のみ。ゲーム/費用は不要。

隔離入力・成果物: キャッシュ済み旧build、未送信作品、初回未取得/未取得素材対照、完全ファイル、旧build/新build SHA。

実施・記録手順: 機内モード→実容量拒否→途中更新の安全地点確認→移行失敗/再試行→実Files保存先取消/再試行→専用file復元。失敗/未保存/未送信と素材未取得を保持し、cache ID変更やプログラム取消を実旧更新/OS取消へ転記しない。

安全な空の記録様式（このcase専用）:

```json
{
  "case_id": "AT-E12",
  "operator_role": "",
  "target": {
    "commit": "",
    "tree": "",
    "build": "",
    "base": ""
  },
  "environment": {
    "device_A": "",
    "device_B": "",
    "OS_browser_IME_assistive_versions": "",
    "service_role_labels": "",
    "game_engine_adapter": "",
    "actual_contract_cost_period": ""
  },
  "fixture": {
    "path": "",
    "bytes": null,
    "sha256": "",
    "project_id": "",
    "revision": "",
    "version_id": "",
    "entity_ids": []
  },
  "clauses": {
    "given": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "when": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "then": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    },
    "negative_or_edge": {
      "observed": "",
      "raw_path": "",
      "raw_sha256": "",
      "status": "not_run"
    }
  },
  "started_at": "",
  "finished_at": "",
  "result": "not_run",
  "blocker": "",
  "next_action": ""
}
```

次の一操作: 管理者が実旧buildと新buildを保持した専用更新URLを指定する。

## 既存入力・生成手順の原本対応（22件）

以下の実pathとSHAは今回再利用できる入力原本または既存生成手順sourceの識別であり、これら専門E2Eを今回実行した結果ではない。生成手順のSHAを実生成fixtureのSHAへ置換しない。UUID等を生成する手順は実施時に添付するgiven scenarioのbytes/SHAも採取する。生成コマンドは既存configの `BROWSER_ENGINES=all npm run test:e2e -- tests/e2e/<対象spec>` で、指定caseのgiven添付と実完全fileを保持する。実機用の入力を取り出す前に統合担当が原全CI/版結合を確認する。helperは呼出元specから実行する。`run_formal.py` は原正式手順専用で、この依頼では起動しない。

PREPAREDは台帳・空様式・既存入力への参照準備に限る。実録音、二実端末の同base取得、実Auth指摘、実旧build、実ゲーム結果、実契約見積は未取得であり、合成WAV/固定UUID/局所receiverをそれらの入力完成と呼ばない。必要環境が提供された後、各caseのgivenを実環境で成立させた記録を別途残す。

| 原ID | 今ある入力・生成手順の実path / SHA-256 | givenとの対応と未充足部分 |
| --- | --- | --- |
| AT-B24 | [tests/e2e/ap04-original-f31-same-work-helper.ts](../../../tests/e2e/ap04-original-f31-same-work-helper.ts)<br>`b25743826fed5afe8c6b76f6056fa8b1a3416020f37b8d634fcc1fecc4dfaa5c` | exerciseF31SameWorkの人物/条件/線/関係の同一作品生成手順。タッチ端末というgivenは未充足 |
| AT-F01 | [tests/e2e/catalog-notes.spec.ts](../../../tests/e2e/catalog-notes.spec.ts)<br>`1c41ee2f6ccfdbb0e4e02976f24695c3bbc6afe8dab3d97fc1baee13a50d4cf1`<br>[tests/fixtures/media/fixture-tone.wav](../../../tests/fixtures/media/fixture-tone.wav)<br>`9d32f6d21a9c5da7a62fe802f9e30f2f4467e0e91ec21641ebfeb97cadbeaebd` | AT-F01のメモ「塔の鍵は鳥が持つ」/PNG生成/変換元先ID fixture生成手順。再利用できる合成WAV原本。スマートフォン実録音ではない |
| AT-F29 | [src/testing/sharedReviewFixture.ts](../../../src/testing/sharedReviewFixture.ts)<br>`5e3551e5caff977249187a0fce11c2da10f976a02269fd2186efce651bf6cbf7`<br>[tests/e2e/ap04-original-f-source-schema.spec.ts](../../../tests/e2e/ap04-original-f-source-schema.spec.ts)<br>`2fc8f4145853b354c8a1bdbabb599932cc40fe9e53024aa4e58b705de7caed64` | sharedReviewFixtureの固定版台詞/引用と公開出所。AT-F29の版1/改訂/削除/指摘stage手順。reviewer UUIDは実Authでない |
| AT-F30 | [tests/fixtures/sync/browser/shared.json](../../../tests/fixtures/sync/browser/shared.json)<br>`562e90218030e0cb874dfef76c92e8faddc4520e0c077cf5ca2993dfaf61992a`<br>[tests/fixtures/sync/postgres-auth-storage-fixture.sql](../../../tests/fixtures/sync/postgres-auth-storage-fixture.sql)<br>`825678c499dce863d639de949fb6249f9520e585b8bc5a9e8c63eaa1ef154ebe` | 限定共有snapshotの局所投影入力。実役割/Auth未充足。隔離用認証/storageデータ手順の参照原本。未適用/実接続なし |
| AT-F31 | [tests/e2e/ap04-original-f31-same-work-helper.ts](../../../tests/e2e/ap04-original-f31-same-work-helper.ts)<br>`b25743826fed5afe8c6b76f6056fa8b1a3416020f37b8d634fcc1fecc4dfaa5c` | 人物/条件/関係線/専用ファイルと未保存入力の生成。実回転/SplitView/OS keyboard未充足 |
| AT-F33 | [tests/e2e/ap04-original-f-resume-recovery.spec.ts](../../../tests/e2e/ap04-original-f-resume-recovery.spec.ts)<br>`1137a9edecc842a3d0ab4c5bd8105623500e87795be22997ea05e3124784f9c3`<br>[tests/fixtures/rb06-history.scenario](../../../tests/fixtures/rb06-history.scenario)<br>`d5cb57db596d4e41c11033b9f0b5158088de3388709857c37eeffce00bd03513` | AT-F33の表示class別設定/お気に入り/削除済み再開リンク生成手順。実PC/スマートフォン受渡し未充足。削除前/旧完全file比較用の元native入力 |
| AT-F34 | [tests/fixtures/sync/browser/editor-base.json](../../../tests/fixtures/sync/browser/editor-base.json)<br>`7becda112fe108b5592d64e5ddae0349c5292acfebdb898ed8d11119ed4b0d40`<br>[tests/fixtures/sync/browser/remote-native.json](../../../tests/fixtures/sync/browser/remote-native.json)<br>`44e2bfec75f98d8454a1cc0cfba4c331a4e2c6c44633cacc9062ce50aa365b61` | 共通baseRevisionの局所編集入力。実二端末/実Auth未充足。順逆/競合の対照入力。実同期でない |
| AT-F42 | [tests/e2e/ap04-original-e-f37-42-state.spec.ts](../../../tests/e2e/ap04-original-e-f37-42-state.spec.ts)<br>`73398a06f03d2e4102025ba955a63e1e08eb0553085668818cee87042b154e60` | AT-F42の戦闘enum/stub/ID対応生成手順。実対象ゲーム/adapter/戦闘結果未取得 |
| AT-N02 | [docs/spec/UI_UX.md](../../../docs/spec/UI_UX.md)<br>`46be9bb0b4c131c7c3c8892432f967a8f2bd0a394ffde5c90aa508ec047fdea4`<br>[tests/e2e/ap04-original-f31-same-work-helper.ts](../../../tests/e2e/ap04-original-f31-same-work-helper.ts)<br>`b25743826fed5afe8c6b76f6056fa8b1a3416020f37b8d634fcc1fecc4dfaa5c` | givenの対象端末表原本。総合試験の作品/完全file準備手順。実端末表実施は未実行 |
| AT-N03 | [tests/e2e/phase3-authoring-continuity.spec.ts](../../../tests/e2e/phase3-authoring-continuity.spec.ts)<br>`bda31bc7a2f7d8d3a2c25ea927a5054045a2ba0980e91af61e34dd66daae2200` | 空作品→作成/本文/試読/出力の操作手順。実VoiceOver/NVDA/キーボード操作未実行 |
| AT-N04 | [src/testing/performanceFixture.ts](../../../src/testing/performanceFixture.ts)<br>`41f6eb244ee7c0c53736bcf7003473b8b0b818711f758fa6be1d7bf6bb6fd571`<br>[scripts/acceptance/run_formal.py](../../../scripts/acceptance/run_formal.py)<br>`1a6fdf68a1aff9ae28c1ba18ebcd9eb1aced173b75e9e48c1681fd8b814bf676` | createPerformanceFixture(seed, standard/large)の標準/大規模原生成手順。source SHAと生成物SHAを区別。正式受入の入口。対象実端末30回は未実行 |
| AT-N07 | [tests/fixtures/sync/browser/editor-base.json](../../../tests/fixtures/sync/browser/editor-base.json)<br>`7becda112fe108b5592d64e5ddae0349c5292acfebdb898ed8d11119ed4b0d40`<br>[tests/fixtures/sync/browser/remote-native.json](../../../tests/fixtures/sync/browser/remote-native.json)<br>`44e2bfec75f98d8454a1cc0cfba4c331a4e2c6c44633cacc9062ce50aa365b61` | 同本文/共通元の局所入力。別案比較用入力。実二端末/機内モード/実同期未充足 |
| AT-N08 | [tests/fixtures/sync/browser/shared.json](../../../tests/fixtures/sync/browser/shared.json)<br>`562e90218030e0cb874dfef76c92e8faddc4520e0c077cf5ca2993dfaf61992a`<br>[tests/fixtures/sync/rls-contract.sql](../../../tests/fixtures/sync/rls-contract.sql)<br>`6ae9b8059ea83b7eac150a826aff514e19e39c31ba53363e95b1e336c53c720e` | 限定投影と秘密の対照入力。直接API/RLS期待の既存SQL原本。非メンバー/限定reader実Auth未実行/未適用 |
| AT-N11 | [tests/e2e/ap04-original-n-mobile-offline.spec.ts](../../../tests/e2e/ap04-original-n-mobile-offline.spec.ts)<br>`904b32fa30f25842094b043ec5332c1c817e375c395251cbe1ccbea4959858a3`<br>[tests/fixtures/media/fixture-tone.wav](../../../tests/fixtures/media/fixture-tone.wav)<br>`9d32f6d21a9c5da7a62fe802f9e30f2f4467e0e91ec21641ebfeb97cadbeaebd` | AT-N11の取得済み作品/未cache素材の局所対照生成手順。取得済み素材の実bytes対照。実remote未cache/OS機内モードは未充足 |
| AT-N13 | [tests/e2e/review-runtime.spec.ts](../../../tests/e2e/review-runtime.spec.ts)<br>`5f1315b86d135bee75c795d30bbe318a6d3b8cd9ebfb2c4a4e7ff30b85acfd40`<br>[tests/e2e/phase3-authoring-continuity.spec.ts](../../../tests/e2e/phase3-authoring-continuity.spec.ts)<br>`bda31bc7a2f7d8d3a2c25ea927a5054045a2ba0980e91af61e34dd66daae2200` | 負の巨大tick -9007199254740993を設定/再開する既存生成手順。日本語/Unicode本文とID/実file読戻し。実OS変換途中IMEというgivenは未充足 |
| AT-N17 | [scripts/build/service-worker.mjs](../../../scripts/build/service-worker.mjs)<br>`96a36362acd0974f8de4102b482e348a357cb5e036ecb2ba460156068c281ac2` | 配信版/build情報の既存生成手順。実構成/見積表/契約/検証URLのgivenは未取得 |
| AT-E01 | [tests/e2e/phase3-authoring-continuity.spec.ts](../../../tests/e2e/phase3-authoring-continuity.spec.ts)<br>`bda31bc7a2f7d8d3a2c25ea927a5054045a2ba0980e91af61e34dd66daae2200`<br>[tests/e2e/ap04-original-f31-same-work-helper.ts](../../../tests/e2e/ap04-original-f31-same-work-helper.ts)<br>`b25743826fed5afe8c6b76f6056fa8b1a3416020f37b8d634fcc1fecc4dfaa5c` | 空作品開始の通常UI手順。条件/線/専用ファイルの生成手順。実iPhone空環境/OS Files/人物2名等の原全操作は未実行 |
| AT-E05 | [tests/fixtures/sync/browser/shared.json](../../../tests/fixtures/sync/browser/shared.json)<br>`562e90218030e0cb874dfef76c92e8faddc4520e0c077cf5ca2993dfaf61992a`<br>[src/testing/sharedReviewFixture.ts](../../../src/testing/sharedReviewFixture.ts)<br>`5e3551e5caff977249187a0fce11c2da10f976a02269fd2186efce651bf6cbf7` | 限定共有snapshotの局所入力。秘密/公開投影の固定版準備。実Auth/直接API/撤回後の拒否は未実行 |
| AT-E06 | [tests/fixtures/sync/browser/editor-base.json](../../../tests/fixtures/sync/browser/editor-base.json)<br>`7becda112fe108b5592d64e5ddae0349c5292acfebdb898ed8d11119ed4b0d40`<br>[tests/fixtures/sync/browser/remote-native.json](../../../tests/fixtures/sync/browser/remote-native.json)<br>`44e2bfec75f98d8454a1cc0cfba4c331a4e2c6c44633cacc9062ce50aa365b61` | 共通revisionの元入力。競合比較入力。実二端末/削除対編集/実失効/容量拒否は未実行 |
| AT-E10 | [tests/e2e/ap04-original-e10-exploration.spec.ts](../../../tests/e2e/ap04-original-e10-exploration.spec.ts)<br>`45411742867c871a364363910dc91f59fd2166da6ab5e4f0f5a571b3a3e43718` | 抽選/無制限ループ/外部戦闘同作品の生成手順と解析上限。対象ゲーム実結果未取得 |
| AT-E11 | [src/testing/performanceFixture.ts](../../../src/testing/performanceFixture.ts)<br>`41f6eb244ee7c0c53736bcf7003473b8b0b818711f758fa6be1d7bf6bb6fd571`<br>[docs/spec/UI_UX.md](../../../docs/spec/UI_UX.md)<br>`46be9bb0b4c131c7c3c8892432f967a8f2bd0a394ffde5c90aa508ec047fdea4` | 標準/大規模原生成手順。対象実端末表。実VoiceOver/OS200%/IME/原性能測定未実行 |
| AT-E12 | [docs/quality/current-review/evidence/legacy/3099c9d-flow-trace.scenario](../../../docs/quality/current-review/evidence/legacy/3099c9d-flow-trace.scenario)<br>`ab5b4b920b22ebd4453945e4d366bccc8f3c5893357c04993548e0a4359b84e1`<br>[tests/e2e/ap04-original-e12-continuity.spec.ts](../../../tests/e2e/ap04-original-e12-continuity.spec.ts)<br>`7b91f8a112ab0dd2b0f9d6db5d3f53f30073fc6100d403c78843de9af42cf338` | 既存未送信作品のnative入力。waiting worker/移行retry/容量拒否の局所手順。実旧アプリbuild/実OS/実サービス/Files取消は未充足 |

## 元22件とは別の残条件（3欄を独立保持）

| 条件 | 準備 | 実受入・原本取得 | 記録欄（空） | 次の一操作 |
| --- | --- | --- | --- | --- |
| AC-G02-N/E・CP04 実2アカウント | 同一作品/本文、一般語の候補、確定済リンク、個別除外/解除の手順を準備 | BLOCKED / 実2account未指定 | account A役割: ／account B役割: ／project/revision/SHA: ／A除外→cold: ／通常logout/切替→B: ／A解除/再保存/再読込: ／確定リンク保持: ／raw/SHA/時刻: | 管理者が同じ隔離作品を使える実2accountの役割を指定する |
| 旧C29・AC-G07・CP10 | 37part/MANIFESTの全bytes/hash/順序/空領域展開と旧不足18宣言の個別照合欄を準備 | BLOCKED / 旧37part＋MANIFESTと旧18宣言の実bytes未取得 | 元保管先: ／37part件数・bytes・SHA: ／MANIFEST path/SHA: ／各member検証結果: ／旧18宣言別path/SHA/取得状況: ／空領域検証argv/exit/raw: | 原証拠管理者が旧C29の原MANIFESTと37partの取得可能な保管先を指定する |
| CP15 独立確認者・結果 | 原四条項/原本hash/未実行/9gateを照合する独立受入手順を準備 | BLOCKED / 確認者・結果未取得 | 確認者（著者と別）: ／確認日時: ／対象commit/tree/build: ／使用MANIFEST SHA: ／条項別結果/raw: ／指摘: ／判定: | ユーザーが独立確認者を指定し、既存INDEPENDENT_REVIEWの原手順を渡す |

旧C29の37part/MANIFESTと旧18宣言は同じ残条件欄内で別々に照合し、新しい候補の出力で旧原本を再生成したとは扱わない。CP15の確認者と結果は別欄のまま未記入。fresh agentのコードレビューは原CP15の独立ユーザー受入に代えない。

## 9 release gates

`realDevices`、`accessibilityManual`、`performance`、`restoreDrill`、`syncLive`、`rlsLive`、`independentReview`、`hostingCosts`、`directLinks`を維持する。元 [check_release.py](../../../scripts/check_release.py) と証拠schemaは変更しない。台帳PREPARED・自動3engine成功・新しい完全ファイルだけではgateをpassedにしない。公開・配備・mergeはこの依頼で実行しない。

## 今回の自動接続検査

[制作接続表](AUDIT_AND_DESIGN.md)のNP04節と `phase3-authoring-continuity.spec.ts` / `phase3-persona-handoff.ts` を参照。各engineの実argv/exit・build・添付は統合担当が本候補に結合する。正式全CI、現行30/180・heap、原外部実受入はそれぞれ独立であり、この文書に未取得値を成功として補完しない。

### 2026-10-19の局所実行結果

開始HEAD `6611287b986553f90c6d8587c7bff2d64afac458` / tree `4c68097a07722860f720d32cfa1710c23db77be0` の未commit差分を検査。development build `6bcf74d891d634f05368` は `commit=unknown / tree=unknown / dirty=true` のため正式候補への版結合には使わない。製品sourceは変更していない。

| 検査 | 実argvの本体 | exit / 実結果 |
| --- | --- | --- |
| 最初の3engine局所試行 | `BROWSER_ENGINES=all npm run test:e2e -- tests/e2e/phase3-authoring-continuity.spec.ts` | 1。Chromiumは追加selectorが変更確認noteも拾うstrict違反。製品違反ではなく、対象headingで固定。Firefoxはprofile folder起動失敗、WebKitはhost6libraries不足で起動前失敗 |
| selector訂正後Chromium | `npm run test:e2e -- tests/e2e/phase3-authoring-continuity.spec.ts` | 0、1 passed / 54.1秒。実行中の入力添付区分訂正を含まないため最終sourceで次行を実行 |
| 最終source Chromium | `npm run test:e2e -- tests/e2e/phase3-authoring-continuity.spec.ts` | 0、1 passed / 42.8秒（test40.2秒）。実完全scenario8件、実公開Markdown、相談MD入力原本とcontinuity観測をHTML reportへ保持 |
| 型検査 | `node_modules/.bin/tsc --noEmit --pretty false` | 0 |
| 文書検査 | `python3 scripts/check_docs.py` | 0。製品受入の代替ではない |
| 台帳照合 | 原外部表との22ID集合、88条項の逐語、分類、22空JSONと9gateを独立Pythonで照合 | 0、22 unique / 9+6+4+2+1 / 88条項 |

Playwright実行時は `PLAYWRIGHT_BROWSERS_PATH=/workspace/task-integration/playwright-browsers`、`CHROMIUM_PATH` は同環境の `require("playwright").chromium.executablePath()` から取得。既存configのtimeout180秒/retries0を維持。局所logs/HTML report/実scenario/実argvとexitは `/workspace/task-integration/1c/REPORT.md` および同ディレクトリに保持し、統合担当が最終commitの原全CI・全3engine証拠へ結合する。今回の局所成功をFirefox/WebKit成功、正式全CI、原実条件、現行30/180やheap合格とはしない。
