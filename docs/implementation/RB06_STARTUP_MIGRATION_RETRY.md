# 旧DBの移行失敗後の通常再試行

REQ-B22/F32/F35/N04/N12/N18、RB06/RB10、AT-E12の検証補助。C29の実native IndexedDB v1（native version 10）の起動時移行を容量不足で原子拒否すると、全表と元DB版は保持されたが、通常の「読み込みを再試行」も同じfailed-open状態から抜けられなかった。原C29の失敗証拠を保持する。

通常の再試行で、同じアカウントに固定されたScenarioStoreを明示openしてから作品・必要な保持入力・固定世界レジストリを再読込する。接続済みDBのcloseや削除は行わない。成功した場合は古いエラーを解除する。再度の失敗は具体的なエラーを残し、中止・画面破棄後の古い結果で作品や入力を更新しない。同一ターンの二重実行を抑える。中止はloadingを直ちに解除し、まだ旧openが完了していなくても新しい再試行を許す。初回の作品・入力・世界登録の結果も、現在のcontrollerに一致する場合だけ適用する。

`tests/e2e/startup-migration-retry.spec.ts`は元の2,237-byte旧完全ファイル（SHA256 `ab5b4b920b22ebd4453945e4d366bccc8f3c5893357c04993548e0a4359b84e1`）から実native v1 schema・全行を作る。移行のobjectStore作成を1回または2回QuotaExceededErrorで拒否し、各失敗時に全表/索引/全行/native version 10が不変であることを確認する。その後は通常の再試行だけでversion 70へ進み、元project全体に一致する実完全ファイル、cold再開、空環境new/cold、旧固定traceの意図した終端を確認する。実fixture・完全bytes・browser.versionを添付する。追加の取消ケースでは本物のnative open成功通知を1,000ms遅らせ、再試行→中止→旧open完了前の新しい再試行→coldを通常ボタンで行う。native移行が既にcommitした場合はversion 70を期待し、元15表の全行/索引は不変と確認する。移行commit自体を取消で巻き戻したとは扱わない。各case 180,000ms・retry 0を保持する。

2026-10-10の未commit準備検査ではLinux Chromium / Firefox / WebKitの6/6とproduction buildが成功。実browser期間21:45:55.336961〜21:47:16.826301 UTC、stdout SHA256 `cd57733802b65e3a703c159b4754b2f953a9ee47ce2bd3a707f074b1101ff17f`、450入力の前後hash不変。commit後の確認は別に記録する。

独立レビューが再試行中の取消後にもloadingが残る追加差分を指摘したため、終了処理と初回の遅延結果のcontroller照合を補修した。後の未commit準備検査はLinux Chromium / Firefox / WebKitの9/9成功（21:50:24.149931〜21:52:00.766883 UTC、stdout SHA256 `188da6bea3dc6b25dc68b3a4e059cdf4ae0b40eb0d6b018581688c120aa2902a`、450入力hash不変）。先の6件をこの追加修正の成功に付け替えない。独立静的seal SHA256 `cfe93a46c3e16f900e193e34ae6b5768ffa229570ab68afe6dea268cd9382ea7` は最新sourceの取消・遅延結果の追加blockerなし、runtime検査0として保持する。

元116ケースと全受入句は変更しない。これは通常retryの局所検査であり、AT-E12の旧アプリbuild取得を含む全互換条件、実端末のアプリ更新、実容量不足、全工程、release完成は同版の別実証拠まで保留する。
