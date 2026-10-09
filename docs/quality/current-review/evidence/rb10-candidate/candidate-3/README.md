# 固定C3の局所検証とLarge初回表示の未達

C3 `e4987dfcc76e425c693a393bdb5dc005fcc19002` / tree `7d92a7eb010e918ed3ee28a6770025087cf1245e`。base main `c590b47`。clean production build `3b3892c69e1c8050c8c6` / `/shinariokanri/`。原26文書と354 source、12 dist、生成runtimeのhashをbindingへ記録。

CI run 37878165457は全20step成功（756単体、255 production E2E、RB03/RB04、Python15、文書/計画/build）。Standard8,800件・30回はlocalの原8性能条件内。active図/年表は各30gestures・330frame interval、idle frameと区別。

Large88,003件＋3×24MiBの実素材は新document/App/Store/workerで保存済みデータを毎回読んだ初回表示30回p95が11,094.5msで10秒未達。検索p95は692.9msで2秒内。全レコード、実素材75,497,472bytesのSHA、history31/pending31を保持。Standardの保存/描画条件をLargeへ勝手に適用しない。初期1回の7,968.3msや遅い回を除外して成功へ変更しない。30回の未cache HTTPダウンロードや全素材の初表示ではなく、cold local datasetの初回表示。

候補C3は性能未達。C1/C2の失敗も保存。Large new/clone復元・2時間、原116の最終全条件、実機・支援技術・実Auth/RLS/privateStorage・現行tenant quota/費用は未実行で、CI成功を完成へ換算しない。
