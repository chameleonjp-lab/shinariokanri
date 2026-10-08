# RB05第4追加・独立候補5再検査 2f5453e

commit `2f5453e70e3dedde51b0530632cf68e59bed20cb`、tree `8ea4185ef64059712db7b12fd99305ce1b6593aa`。154srcを隔離・再SHA256照合し全件commit一致。原契約4資料はmain基底と一致、旧main3099 fixture4ファイルも対象commitと一致。a21/5c/32の負例を変更せず、候補4は凍結だけを保持した。

同じNP14、EN01〜18、旧main3099固定flow/chapterの独立34件と提出関連13件が成功した。通常Appは10群が成功。保存待ち/連打/移動/失敗再試行/最新props/cold/native/cloneに加え、章tick5と元custom1sceneの移動・cold保持、承認後6で保存停止/5へ戻して許可を確認した。

EN09の元『選択した唯一use場面を1回提示→terminal』を保持し、EN16の空[]/選択章過大化、EN17の通常内部経路の開始clock矛盾、UI10の章入力消失は解消した。EN14はpartial base7/別値12/所持品/周回3＋stub8/外部true/tick5を原子保存・store再起動・native・clone後に維持。未知/期限0・9・10/曖昧な旧clock/hash改ざん/base・外部値矛盾を保守的に停止する。旧a21stubとmain3099証跡も保全した。

追加した**CTX-graph/CTX-chapterの2件は失敗**する。固定scene referenceの例外を、元と変わらない実際のcaller graph/章IDで限定すると、旧固定版の直接開始はready、reference後の同じ使用先は相互排他違反errorとなる。schema-validでtick5/確定根拠/期限内であり、childGraph依存はない。範囲指定だけのgraph/章をmodule依存へ取り込み、限定先をvirtual IDへ書換える一方、実行contextは実使用先IDなので一致しない。章限定は章開始も拒否する。

固定元版だけのscope成功を、graph/章境界成功へ換算しない。修正時は本当に借用・実行するchildGraph内部namespaceと、caller範囲だけの参照を区別し、別scope/未知/期限切れを許可しないこと。宣言入口はreuseAuthorContentから取り、借用scope依存graphを全宣言入口へ数える問題は現コードに見当たらない。

EN04の元fixtureは未所属の1sceneを明示した経路である。EN16修正後は通常UIで同じcustom1sceneを選ぶ手順を明記した。期待値や範囲を変更していない。harnessの旧源をsetupへ残した。

この結果は全RB05・104要件・116受入・24工程・6回帰群の合格ではない。独立実AppはChromium151/Vite dev、部品保存はfake IndexedDB、ブラウザー保存はnative IndexedDB。親のclean production/build/full suiteや実機/実APIとは別の証拠。製品・repo証拠・commitは編集していない。

詳細は `INDEPENDENT_REVIEW.json`、154src/原契約/legacyのhash結合は `SOURCE_COMMIT_BINDING.json`、生ログ・fixture・harnessのSHA256は `ARTIFACT_BINDING.json`。
