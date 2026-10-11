# AP03 元Large113履歴の完全保存と長時間復元

対象はG05/G13/G15。元Largeの88,003記録・実素材72MiB・112通常編集後の113履歴/送信待ち、完全保存600000ms、進捗/取消2000ms、Standard/Large各30回と実7200秒の条件を維持する。元契約・fixture・公開gate・保存形式は変更しない。

`createSharedArrayJsonEncoder` は再帰的に不変と証明された配列だけを64記録ずつ同じ順序・同じobject identityで照合し、元のcanonical bytesを再利用する。全commandの全bytesとSHA-256は引き続き検査する。cacheは呼出しごとに所有し、64MiBとentry数を制限する。不正・可変・accessor等の入力は既存の経路で扱う。

完全保存は同じ依存世界を所有する構造/整合性検査sessionを使い、検査済みとの申告や検査skipを外部から受け取らない。保存済みDBのprivate captureは全plain-data graphを検査してから凍結し、main threadでは短い区切りで取消を確認して画面処理へ戻る。作者の編集中入力は凍結しない。素材とsnapshotの共通走査も不変な値だけを共有する。

`scripts/measure-large-history.mjs` は通常Appの112保存から元113入力を作り、実downloadの全履歴・hash・操作順・ID・素材を空new/cloneとcold後のnative保存情報で照合する。`--soak-seconds 0` は完全入力の診断だけであり7200秒の合格ではない。`--soak-seconds 7200` は実時計で7200秒以上の通常編集・検索・補助試読・viewport変更・offline cold後に同じ完全照合を行う。入力を減らす処理はない。

現在の診断ではimmutable async capture、canonical bytes共有、復元検査sessionの3ファイル30件が成功した（10.01秒）。実ファイル出力・全復元・性能30回・7200秒の実結果は固定した統合候補の記録へ別途結び付ける。部品検査からそれらの成功は推定しない。

戻す場合はこの最適化を個別に取り除ける。正本/履歴/送信待ちの原子性、元canonical形式と全検査が残るため、既存完全ファイルへの移行は不要である。Linux自動ブラウザーは実端末・支援技術・実同期の証拠を代替しない。
