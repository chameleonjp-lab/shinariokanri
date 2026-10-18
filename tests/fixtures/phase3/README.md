# 第3段階の証拠検査用の過去入力

`historical-original180.json.gz`は製品`1fcadcca`の実180保存raw（216319 bytes、SHA256 `99c71e325c7ad1353cfaff73c9a1fd3baccd8d64659f9c25c7eb200733e9e780`）を変更せずgzip圧縮した検査入力である。

出所は証拠commit `d5e132ef6f4db6a0f3fbe888228ffd1007d653f9`の`formal-1fcadcca`束、member `original180-actual-output/raw.json`。全part/全memberを元manifestと照合して回収した。新候補の受入結果として使わず、同数別fixture・欠落・重複operation・書込数・hash走査の改ざん反例にだけ使う。
