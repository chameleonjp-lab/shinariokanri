# 同一読込版の全件分割と取消

C8の強いLarge30回は10,306.8msで未達。読み始め順だけを変えたdirty3回は12,026/11,199/12,841msで改善せず、採用しない。要求開始から完了までのtable時間は待ちを含む。

C9は同じreadonly8table transactionを保ち、compoundキーの全範囲を2048件ずつnative getAllで読む。直前の最終IDを排他的な下限にし、最後の不足batchまで全件を読む。非進行/不正境界は拒否する。全範囲取得後に元header順へ戻し、欠損・scope・Unicode/schema/hash/parts・固定世界/版を元のcold検証で確認する。変更途中の版を混ぜず、派生結果の未完了を公開しない。schema・DBv7・完全形式・元上限は不変。

2049件を逆の作者順で保存し、別作品同ID、2048後の取消とnative8table不変、再開全件、末尾foreignと不正blockの安全拒否、修復後の再読込を検査した。初回全単体は既存763成功、新しい機能検査の30秒watchdog1件超過。新規検査だけ120秒と段階ログに変え、元fixture/全期待/性能時間は不変で全764件成功。対象storage46件も成功。

320/200%関係表と一覧再選択/保存/空new-clone/coldは3browser計6件成功。最初のCLIに存在しないdiagnosticsファイル名があり実行対象には入らなかったため、その結果へ診断成功を混ぜない。正しいrb10-completionの実保存失敗/任意診断とnative parts取消/再試行/cold本文を別に3browser計6件実行し成功した。

全dirty source/dist/raw/初回失敗/独立静的レビューをSHA/bytesで梱包後も再検算したtar.gzに保持する。dirty3回8,285/7,434/7,693msは診断だけ。cleanC9の元各30回・Large全bytes復元・実7200秒・原116は別実行とし、実機/支援技術/実Auth/専用現行費用を合格へ置き換えない。
