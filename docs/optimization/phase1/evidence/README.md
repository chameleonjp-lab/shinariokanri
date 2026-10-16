# 生証拠

追加測定・原30回の再実行、source/commit/tree/build/fixture SHA、実環境・実行command/exit、全raw、配信buildの原bytesとSHAを別identityで保存する。manifestはbytes/SHA照合用であり、原受入や実機合格の証明ではない。

`baseline-*` は最新main対照、`candidate-*` は第1段階計測コードの製品commit、`historical-*` は既存の原結果に対する参照/数値抽出。ON診断時間、OFFの元30回、command/UI区間を混ぜない。失敗試行も別名で保持する。ファイルの取得時刻を実験の実行時刻へ転記しない。

各診断JSONは実際に配信した全buildファイルのSHA/bytesとsource一覧を持つ。原30回JSONは既存測定器のhelper-retention前後照合、production build-info、fixture、全30生値、frame330値を持つ。build原bytesの保存と、元要件の合否は別に確認する。
