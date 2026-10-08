# RB05第4追加・独立候補3再検査 32c1608

commit `32c1608cce042a24f9ae95685cd8ef7ac1c8f40f`、tree `1a57efba5b1f86c3dd600fbe9c34d6f90c433c3b`。154srcを隔離・SHA256再照合し、全件commitと一致。原要件/受入/behavior/data-model4資料はmain基底と一致。a21/5cの負例を保持した。

同じNP14・EN01〜08の22件、提出済み関連13件は成功。EN10/11の旧差は解消し、EN09の初期章開始も固定元例外でreadyになる。EN09末尾は選択した唯一の場面提示後もreadyとなるため、元期待を反復へ緩めずEN16と同じ原因として残す。

追加EN12/13は新stub入力のID対応と旧a21再生保全を確認。独立EN14はpartial base7/別値12/所持品/周回3＋stub8/外部true/tick5を、原子保存・store再起動・native・cloneで保持した。EN15は未知停止、半開区間0/9許容10拒否、clock5復元、hash改ざん拒否、旧2時点の曖昧拒否を確認。EN18はbase別値/版/外部入力/外部捕捉の4矛盾を再生・durable・nativeで拒否した。

- **EN16**: 明示chapterIdsでも未所属source場面が混ざり、空[]も0件にならない。既定全体と選択章の範囲を区別する必要がある。EN09末尾も同原因。
- **EN17**: 通常full/internal flowのcp tick5とtrace tick6の矛盾は直接再生で止まるが、stubなし経路がdurable検査対象外なので完全保存へ通る。
- **UI10**: 通常章UIのtick5入力・移行previewは移動前に有効。資料へ移動して戻ると入力だけ空になり、preview5を保持しながら保存disabledとなる。作品/基底版別の章パラメーター保持が必要。

独立部品32件は29成功・3失敗（EN09/EN16は同原因）、提出関連13件は別に成功。実AppのChromium151/Vite devは10群中9成功1失敗。UI01〜08で保存遅延/連打/移動/失敗再試行/最新props/cold/native/cloneを現行srcで再実行し、UI09でflow clock承認固定と移動保持を確認した。UI10の失敗を残す。

全RB05、104要件、116受入、24工程、6回帰群の完成には換算していない。実機・支援技術・実API・性能・完成release gateは未実行。親のproduction/build/full suiteとは別の証拠である。製品・repo証拠・commitへ変更は加えていない。

詳細は `INDEPENDENT_REVIEW.json`、源版は `SOURCE_COMMIT_BINDING.json`、生ログとfixtureを含む成果物hashは `ARTIFACT_BINDING.json`。
