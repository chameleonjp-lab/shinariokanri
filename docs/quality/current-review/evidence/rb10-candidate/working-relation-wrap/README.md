# C8 320pxの参照ラベル折返しと継続検査の修正

関係表の参照経路ラベルを全文のまま折り返す。幅制限・min-width:0・overflow-wrap:anywhereだけを加え、hidden/ellipsisや参照省略を追加しない。SVG内部のスクロール、44px操作、保存・正本・ID・歴史・公開形式を保持する。

既存graph検査の元正常／cold／配置／関係／完全出力の全期待を保持し、booleanとenumを読む入れ子条件の由来ラベル、320pxと文字200%の全文／ページ横幅を追加した。working1は詳細を開いた人物中心の絞込みを解除し忘れ、対象外ラベルを期待した検査側の失敗。3browserすべて同じ原因、source/dist/raw/trace保持。working2は通常comboboxで中心指定を空へ戻し、同じCSS期待を3browserで通過。working1のLibrary回帰は3browser成功。

measure-app.mjsは現行の「試読・検査」タブを選び、App準備後にmenuを判定する。7200秒・測定上限・元fixture・通常編集・検索・作品切替・試読・オフライン・完全出力／空復元の期待は維持。Standard60秒はdirty手順診断として2編集以上と2試読以上、空cold完全復元まで通過。これは最終対象のLarge7200秒を代用しない。元helper fdd63…のC7短時間停止をcandidate-7に保持する。

cleanC8で同一版のCI・各30回・Large復元・実7200秒・独立原116を再実行する。実OS・支援技術・実接続は別にnot_run。
