# AP04 main からの独立工程候補

main `8285608c75791ed1ea01380751abb3805913b639` から作成した `test/ap04-original-clause-entrances-20261011`。前提 [AP06 Draft PR47](https://github.com/chameleonjp-lab/shinariokanri/pull/47) の固定 tip `907677bb9a6eb96e20a00d3802cecdac50ddadce` をローカル merge し、AP03/AP02/AP01 の祖先を保持した。main と前提 PR の merge は実施していない。

source commit `45b825c74912a1393aa42f8abe360a8b21764ac5` / tree `517d46baf44de0d9d72deedf426466fc504eef68` は、最新統合 source `4e87fc950b2993196689bf6054174989148aa418` と全 tracked 非 docs bytes が一致する。src/scripts/tests/config/fixtures、generated source、公開例、package も比較に含めた。source 選択・hash・前提と保持範囲は [phase-source.json](phase-source.json) に記録した。この資料を加える docs commit は別であり、最終検査は実際の clean HEAD/tree を読み取って固定する。

`70fa53b` は AP06 runtime-target hunks を前提に保持し、AP04 の publicCatalog import、reader index と HTML/Markdown 接続だけを plain apply した。結合 exports は元の完成版と同 bytes。generic Modal の useId と E09 の通常画面 oracle、F57 の実 UUID 二件への全文検索 oracle を含む。元 fixture/query、原受入、数値上限・期待 budget・公開 gate は維持した。

[原116/464計画](../ap04-2026-10-11/local_acceptance_plan.json)と各 proof は全条項 `not_run`、合格0。静的 literal/hash/行・excerpt の一致は実行証拠ではない。依存 install、生成、typecheck、build、unit、通常 UI、原性能、CI はこの工程候補ではすべて **NOT_RUN**。次の固定候補ではこのブランチの実 commit/tree/build/base と前後 source/dist hash を結び、元条件で実行する。

既存 b56 whole unit の965成功/2失敗と pinned 別21成功、c758 build失敗、b56/c207/76cf/d21 smokeの版別結果と raw を保持した。失敗は失敗のまま、統合候補や PR44 CI の結果を工程候補の成功へ転記しない。前提 AP06 の [元 N20 source proof](prerequisite-ap06-n20-source-proof.json) は exact bytes の独立 support とし、現在の [N20 proof](../ap04-2026-10-11/ap04-original-n20-target-proof.json)だけを実際の結合ソースに再bindした。

実 iPhone/iPad/支援技術、IME/OS Files取消、専用役割/API/private Storage/二端末同期、実ゲーム受取、Large113/600000ms・7200秒・30回p95と未取得旧完全packetは未確認を保持する。AP04/G06/G16 と原24工程/6回帰群の受入完了、公開、merge、課金をこの提出から推定しない。
