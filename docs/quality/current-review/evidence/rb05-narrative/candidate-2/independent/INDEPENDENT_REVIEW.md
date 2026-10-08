# RB05第4追加・独立候補再検査 5c28c04

対象 commit `5c28c04f6cd823694323dc5de78c56e2496c9592`、tree `87884488bc25d99075ebda8680a5a96f95b2544f`。154 srcを隔離し、全SHA256を対象commitのgit showへ再照合した。原requirements/acceptance/behavior/data-modelの4ファイルもmain基底と一致する。a21候補の失敗・fixture・ログは変更していない。

同じNP14・EN01〜08の正期待22件と提出済み関連13件は成功。追加EN12/13も成功し、新しい型付きstub入力のID対応、native/clone後のstub由来、旧a21記録の再生維持と入力不明時の再確認停止を確認した。追加EN09〜11は期待差が残る。

- **EN09**: 固定共通場面の確定根拠・元pin限定例外・tick5（0以上10未満）で、分岐開始はready、章開始は相互排他違反として拒否する。章開始時のexclusionに固定元のruleContextsがない。
- **EN10**: 同じ有効partial開始の移行previewも拒否する。移行contextはprojectIdだけで対象入口・graph・章・tick・固定元文脈がない。worldTickは現行APIで型付き入力できないため、本検査の追加worldTickは不足機能の提案入力としてcastしたもの。実装済みAPIの合格・不合格へ混ぜず、移行contextの不足として記録する。
- **EN11**: 保存初期stub8を開始入力metadataだけ99へ変更しても再生terminal・durable integrity issuesなし・完全保存再取込成功となる。合法型/範囲内99なので型エラーではなく、捕捉済み開始状態との矛盾である。再確認時にだけ止めると旧証跡自体の入力整合性が未検証のまま残る。

実App/ScenarioStore/IndexedDBによる独立Chromium151・Vite dev検査8群は成功した。保存遅延中の移動/再入、同一ターンの二重操作、保存失敗と再試行、基底revision更新、入口変更、最新propsによる完了通知、cold reloadを含む。UI08は個別章開始8を明示移行し、改訂稿経路を別保存してcold reloadし、実ブラウザーのnative/clone再生でpartial8/scenesを保持した。

通知文の拡張に対応するharness regexと、native再生APIの引数修正の初回ログをsetupディレクトリへ残した。製品コードは変更していない。Vite devは親のclean production/Chromium153証拠・実機証拠と別である。元116受入や全RB05の合格へ換算せず、EN09〜11の補修が必要な候補として扱う。

詳細・fixture・期待値・環境は `INDEPENDENT_REVIEW.json`、source bindingは `SOURCE_COMMIT_BINDING.json`。生ログ末尾空白を保ち、成果物SHA256を `ARTIFACT_BINDING.json` に記録する。
