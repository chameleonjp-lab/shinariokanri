# AP06 汎用ゲーム受取例の契約補修

2026-10-11。対象は G14、REQ-N20 / AT-N20 と既存の汎用受取例。出力形式は native 1.0.0 / scenario-runtime profile 1.1.0 / scenario-browser-game 1.0.0 のままで、追加したゲームエンジン adapter はない。AT-E09 の世界改訂・媒体版・実期限・制作集計はこの検査の完了対象ではない。

`receiveGamePackage` は以前、外側の版・主要 hash・実行内容を検査した後、未対応の `commands`、内部公開投影の未知版、公開本文にない索引文字列、公開内容と異なる `flow`、未知の profile 能力宣言を受領できた。これらを実行しなくても、受取仕様の不一致を成功として扱っていた。

補修は受領前に package / profile / 公開投影の項目と版、種類別一覧・分岐一覧、公開本文から再生成した検索索引を検査する。未知項目・未知能力・版不一致・一覧不一致を `INTEGRITY_FAILED` として拒否し、元入力を変更しない。既知能力だけの部分集合と既存の固定引用版・版別素材の受領は維持する。保存 schema、archive 上限、原104要件 / 116受入 / 24工程 / 6回帰群、公開 gate は変更しない。

変更ファイル:

- `src/domain/gameProtocol.ts`: 受領前の wire 契約検査。
- `tests/gameReceiverContract.test.ts`: 公開IDと実測 receipt の往復、未知 commands、整合した hash を持つ未知公開版、分岐一覧の不一致、未知能力、既知能力の部分集合、schema版 / runtime hash、投影外索引文字列の拒否。

診断結果は統合ブランチの基底 commit `1ad3c928b9090ab8d9d96a6a8971c597216e3be2` 上の未commit変更を対象とする。生成された配布 build と固定 source tree の最終結果は別に記録する。

| 検査 | 診断結果 |
| --- | --- |
| `npx vitest run tests/gameReceiverContract.test.ts src/storage/rb08Handoff.test.ts` | 23件 passed（新規6件 / 既存17件）、20.43秒 |
| `npx tsc --noEmit` | passed |
| 対象コードの `git diff --check` | passed |

既存17件にはゲーム実測 / stub / mixed、固定引用版と版別素材、受領後の原子保存 / 完全保存 / 空 new・clone 復元、改ざん拒否を含む。これらは部品と保存の診断であり、全116ケースの四節、実iPhone / iPad / 支援技術、専用同期の実API / RLS / Storage、外部ゲームエンジンの受領確認を代替しない。配布する独立ブラウザー受取例は最終 source を固定した後に再生成し、通常画面の実ファイル選択・操作・receipt持ち帰りを別に確認する。

戻す場合はこの受領検査のコード変更と対応テストを戻せる。正本、保存形式、既存ファイルを移行する変更はない。

同日の追補レビューでは、ルビ・公開関係の項目 / 型、公開暦の年 / 月 / 日数を受領前に検査するよう補った。暦は既存の `validateCalendar` を使用し、未知kindやGregorianに属さない `years` を変換前に拒否する。関係とルビの保持される値は元のnative strict検査でも拒否できるが、Gregorian変換で無視される未知metadataには先行検査が必要だった。作者側の外部契約は任意の結果型文字列を保存できるため、公開側で限定したenum値とsemverは `PROJECTION_FIELDS` の規則を受領前に検査する。残る `data.field` の型・条件・参照は `portableRuntimeProject` が変換後に実施する既存 `validateProject` で検査し、添付の削除される `bytesIncluded` は素材受領時に `true` を検査する。

追補テストは、正当なルビ / 関係 / 繰返し暦、未知nested項目と不正値の8変種、再hashした未知暦metadata、未知の外部結果型 / 非semverと元入力不変を追加した。外部契約の負例は公開投影に合わせてnative実行内容・hash・ID対応も再生成し、拒否理由が他の不一致に依存しないようにした。専用テストは計9件となった。

追補後、上記2ファイルの専有検査で新規9件は成功したが、既存の旧世界引用版の往復検査が元の5,000ms timeoutを超過した。`buildGameReceipt` が内部で所有する受領検証済みprivate cloneを、受領証検査へ渡すための内部関数を分離した。公開されている `verifyGameReceipt` は引き続きpackageを受領検証し、内部関数も受領証の構造・hash・package対応・実測値・最終状態の再実行を全て検査する。外部入力のcacheや検査省略は導入しない。

この最小最適化後の診断は上記2ファイル26件（新規9件 / 既存17件）passed、16.18秒。`npx tsc --noEmit` と対象コードの `git diff --check` もpassed。元の5,000ms timeoutおよび受入gateは維持した。生成buildはこの担当では未更新であり、固定候補の最終検査は統合担当が別に記録する。

さらに `ProjectedBlock.links` のoptional位置指定を確認した。`targetEnd` 単独、空文字の `blockId`、falseの `sourceVersionId` はnative変換時に落ち、公開入力・native内容・hash・ID対応を全て整合させた3つの独立負例でも受領されることを再現した。既存公開契約に従い、optionalの段落 / 台詞 / 引用版IDは非空文字列、対象文字位置はstart / endの対であることを変換前に検査する。変換後に保持される文字範囲・参照先の検査は引き続きnative strict検査に任せる。専用負例3件を追加し、元入力が変化しないことも検査する。

リンク境界補修後の指定2ファイルの専有診断は29件（新規12件 / 既存17件）passed、12.69秒、元timeoutは維持した。対象diff検査もpassed。型検査の共有treeは別担当が編集中のAP04 helperに起因する3件で一時失敗したため、AP06差分に型エラーがないことと共有treeの最終型検査を区別して記録する。
