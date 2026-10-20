# NP07：暫定逐条表の読み方

[TRACEABILITY.json](TRACEABILITY.json)は1Dの準備表。原JSONは変更していない。対象snapshotは開始main aa86e25b91287329c061a97d1d3f9c4e0e0e9f85、最終候補はnull。NP07の正式逐条確定と証拠再取得は3Cに残る。

| 領域 | 固定するもの | 最新正式候補の状態 |
| --- | --- | --- |
| requirements | 原104 ID・shall/failure_behavior等の原文とcase対応 | not_run |
| cases / clauses | 原116 ID、各given/when/then/negative_or_edge＝464原文 | 全条項not_runまたはblocked。合格0 |
| work_packages | 原24工程、deliverables/completion_gate/依存/own cases | local_gate=not_run、依存込みwhole_gate=blockedを別欄 |
| regression_groups | 原RG-R01〜06のgiven/steps/expected/environment/依存 | 原全文を保持しnot_run。1B補助RG01〜03と別namespace |
| supplemental | 原68 ID/原文＝既存G32＋未採用X36 | Gの新正式判定はnot_run、Xはnot_adopted。原116へ加算しない |
| locked_inputs | 原contract-lockの73 path/bytes/Git blob | 検査器が全実bytesを照合。fixture内容を件数で代替しない |
| performance_fixtures | 原Standard/Largeのseed・hash・records・素材hash/実bytes | 独立したimmutable期待定義のみ。旧測定値を転用しない |
| external_cases | 原22ケースの全ID | 1Cの準備済と原実条件blockedを分離 |
| separate_remaining_conditions | 実2account、旧C29の37part/MANIFEST＋18宣言、CP15確認者/結果 | 原22件外の3欄でblocked |

各条項はsource_paths/source_scope、UI操作入口、原givenと固定入力台帳、原文に由来するindependent_expectation、実観測・path・実bytes/exit等のevidence_slotを持つ。source候補52件の過去snapshotのpath/Git blobはsource_inventoryで固定する。台帳のcompact JSON（key順序をsortし末尾LFを含む）のGit blob `cff43926407d0e1f66aa9cb02f081c590c076744` とsnapshot定数で参照の付け替えを拒否する。過去のsource読解はsource_observation/historical_reviewに限定し、その旧観測・buildを新候補のactualへ移していない。

外部手順だけが存在するケースでは、そのことをsource_scopeへ明記した。全項目にLinux実行sourceがそろったという主張ではない。期待は原文をそのまま保持した仕様上の基準で、最適化処理から生成した答えではない。3B/3Cは同じgivenのseed/初期native/実素材、各実操作のIDと版、保存後/cold/実ファイルの値、拒否時保全と再試行を実観測して条項単位で照合する。個別の観測値・literal期待の追加が必要な条項はmissingのまま残す。

fixture.runtime_seed_or_hash/native_before/assets、evidence_slot.path、current.actual_observation/target_bindingは現在null、actual evidenceは空。planned_rootは3Cが作る予定の論理slotであり、既存原本pathではない。旧CLAUSE_REVIEWのpassedや旧94/22、1B/1Cの局所成功、CI全件成功はここへ自動転記しない。

原acceptance_planの外部要否が明記されたケースは19件だが、原EXTERNAL_CASESの全22件を別表で保持した。後者にはAT-F42/AT-E10/AT-N11も含まれる。前者の条項単位の外部記述を改変せず、case全体のblockedを22件に適用する。局所自動条項が実行できても、そのケースの実外部条件を解除しない。

```sh
python3 scripts/check_stage1_traceability.py
python3 -m unittest discover -s scripts -p 'test_check_stage1_traceability.py' -v
```

検査器は原ID集合/全文/全73実bytes/Git blob・原Large binary SHA・immutable fixture期待・過去source台帳とsnapshotの整合性・依存の非循環を照合する。原73入力以外の過去source候補を後続workspaceのbytesへ強制しない。後続PRでE2Eや準備文書が正当に更新されても、この未実行の過去表はそのまま参照できる。現在の実行sourceの証明は各候補の新seal・実結果へ結ぶ。この暫定schemaでは、偽receiptを付けてもpassedやfinal_candidateを受け入れない。3Cで正式判定を追加する時は、実測包/独立照合を入力とする別のレビュー可能な成果を作り、この準備表のstatus書換えだけで確定しない。

JSONと検査器を含むため今回のCIは既存のfull scope。原全unit/build、3engine全inventory、後続rb03/rb04/rb10、失敗証拠回収/verifyを維持する。検査成功はこの準備表の整合性を意味し、正式受入や原release 9gateの合格ではない。
