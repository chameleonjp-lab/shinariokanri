候補9 `7a40c7c52b5e3e2c8058a41bcc78c0113b9e1a0c` / tree `8362d0c22aa9eb9f5732d976227c9b37930795e5` を隔離して独立レビューした。部品12件、Chromium151の通常App操作12件が成功し、この実行範囲では新しい不具合を確認しなかった。対象製品155 srcはcommit内容と全件一致、候補8との差はReader.tsxとreaderDraft.tsの2ファイルである。

候補8のRD-replay-reenter／RD-version-selectionは、同じfixture bytes・given／when／正しい期待値で成功した。再生待ちに画面へ再入しても旧固定版Aと終端表示が揃い、現稿変更の誤警告は出ない。次回開始用に明示した固定版Bは、旧版Aの実行状態を保持したまま画面往復後も保たれる。RD-editions原fixture SHA256は`e6c19af2a629d56be29a268f316ce0af2bcf8ac25f2887d486a9390f1344bd7e`であり、製品commitのtests/fixtures/rb05-reader-editions.jsonともbytesが一致した。

通常App検査には固定子graphの呼出し・復帰・巻戻し、原子保存→cold reload→完全保存／clone、同一ターン連打、保存待ち移動・失敗再試行、開始／再生待ちと別作品への切替、基底revision競合、最新props検証中の古い再生完了、triggerとunknown停止を含む。部品検査は固定元有限例外のscopeとtick、全効果原子拒否、partial／stubの保存復元と改ざん拒否、固定旧fixture互換を確認した。

Chromium151.0.7922.173（/usr/bin/chromium）、Debian13.6/Linux6.18.44、Node24.19.0、Vitest5.0.3で実施。Appは隔離したViteの製品ソースとnative IndexedDB、部品保存検査はfake-indexeddb。テスト側で実SHA digestと保存の完了を遅延・失敗させた。専用ポート5313は終了後停止した。

候補8の2失敗とraw logsは変更せず保持し、そのreport SHA256 `d26b5b3237f6a6210f1f1ffa8752431b15f96be4c778e5269967c87832c001a2`も再一致した。元PDF・要件／受入／計画／契約15ファイル、旧記録4ファイルと原fixture、今回の実結果／raw logsをSOURCE_COMMIT_BINDING.jsonとARTIFACT_BINDING.jsonに結んだ。repo製品・既存証拠への書込み／commit／pushは行っていない。

104要件・116受入・24工程・6回帰群・RB05全体の完成判定ではない。親のproduction／全suiteとは別の証拠であり、過去候補の成功を今回の成功へ換算していない。実iPhone／iPad・支援技術・全性能条件・長時間オフライン・実Auth／API／private Storageは未実行のままである。
