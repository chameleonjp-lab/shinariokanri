# 生証拠

追加測定・原30回の再実行、source/commit/tree/build/fixture SHA、実環境・実行command/exit、全raw、配信buildの原bytesとSHAを別identityで保存する。manifestはbytes/SHA照合用であり、原受入や実機合格の証明ではない。

`baseline-*` は最新main対照、`candidate-*` は第1段階計測コードの製品commit、`historical-*` は既存の原結果に対する参照/数値抽出。ON診断時間、OFFの元30回、command/UI区間を混ぜない。失敗試行も別名で保持する。ファイルの取得時刻を実験の実行時刻へ転記しない。

各診断JSONは実際に配信した全buildファイルのSHA/bytesとsource一覧を持つ。原30回JSONは既存測定器のhelper-retention前後照合、production build-info、fixture、全30生値、frame330値を持つ。build原bytesの保存と、元要件の合否は別に確認する。

- [独立数値判定・stage集計](assessment.json)：原Standard8上限/Large2上限のみ。全30/330生値を再計算。
- [配信buildの保持・結合](build-retention.json) と [64原ファイル](measured-builds.tar.gz)：全member/実bytes/SHAと9runのmanifestを照合。
- `baseline-standard30.json` / `baseline-large30.json`：最新mainの新規実測。
- `candidate-standard30.json` / `candidate-large30.json`：補正済み製品6e03cd9、計測OFFの新規実測。
- `candidate-growth.json` / `candidate-standard.json` / `candidate-large.json` / `candidate-ui.json` / `candidate-calibration.json`：追加ON診断。元受入の代替ではない。
- [元180保存の参照](historical180-reference.json)：HIST。元raw SHAと6条件×30・command/UI区間を維持。
- [失敗・中断・不採用試行](preliminary/status.json)：確定前の観測欠落・失敗・途中build変更を明示。最終比較に混ぜない。

`python3 scripts/check_phase1.py` は原73入力のGit blob、104要件と464条項、監査の双方向参照、生証拠のSHA、元30/330値とnearest-rank、fixture一致、配信build archiveの完全gzip/全member/実bytesを再照合する。CLIの成功は実機・実権限・原116ケース全体の再受入ではない。
