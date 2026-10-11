# 追加機能の調査と採用候補

2026-10-11に公式資料22件を確認した。以前の15ツール/60提案は[既存調査](../research/RESEARCH.md)と[原カタログ](../research/FEATURE_CATALOG.md)を基準にし、今回確認した一次資料を下表へ追加した。全ツールを実際に試用した、全有料プランの動作を比較したという調査ではない。資料から確認した事実と、本製品への提案を分ける。

## まず既存計画へ含まれる機能

年表と提示順の分離、独自暦、家系/正体、地図、状態の初期化/周回、途中試読/巻戻、再利用、伏線の全経路確認、台詞ID、翻訳/音声、素材、絵コンテ、制作期限/依存、作者別案、秘密を除く投影、同期競合、限定共有、索引/保存検索、履歴/完全復元は原104に含まれる。これらを新規追加12件として二重計上しない。未完成ならG06/G16等の既存完成工程で扱う。

## 追加候補12機能

P1は追加案の中で先に検討する価値があるもの、P2は後段向け。原104の完成前に12件全部を作る意味ではない。採用の判断は具体的な要件と費用/確認範囲を持つPRで記録する。

| ID | 優先 | 追加候補 | 既存との違い | 参考 |
| --- | --- | --- | --- | --- |
| X01 | P1 | 用途別の入口と初回の短い案内 | 雛形・表示設定・サンプル作品は既にある。次の一操作を示す案内、ゲーム/小説/動画ごとの入口を追加する。 | RS13 / RS15 / RS18 / RS19 |
| X02 | P2 | 許可された複数作品を横断して探す | 現在の検索/保存一覧は作品内が中心。別作品・共通世界の名前を作品IDと固定版を保って検索する範囲を追加する。 | RS12 / RS14 |
| X03 | P1 | 確認してから行う本文の一括置換 | 検索、一括項目編集、注記位置変換はある。本文の一致箇所を選び、変更内容を見てまとめて置換する操作は別に追加する。 | RS01 / RS19 |
| X04 | P1 | 翻訳表を出して確認して取り込む | 台詞ID・原文hash・言語/音声・担当別JSON出力は既にある。iPhoneで編集可能な表形式の双方向受渡しを追加する。 | RS04 / RS05 / RS06 |
| X05 | P2 | 翻訳の埋込み語と用語の形式を確認する | 口調・用語・原文変更の再確認はある。訳文内の埋込み語の欠落/重複と、言語別の必須表記を独立に検査する。 | RS04 / RS05 / RS06 |
| X06 | P1 | 期待結果を登録した経路のまとめた再確認 | 保存経路・網羅率・再実行・変更後の再確認はある。作者が意図した到達先や状態値を宣言し、テスト集合を一括実行する機能を追加する。 | RS08 / RS11 |
| X07 | P1 | 保存量とバックアップの確認状況を見る | 保存状態・完全出力・復元はある。保存領域の見積、最後に実ファイルを検査した版、復元確認済み版をまとめて示す。 | RS15 / RS17 |
| X08 | P2 | 試読で見つけた文章を直して同じ経路へ戻る | 試読と本文編集、固定版リンクへの移動はある。試読位置から修正候補を作り、変更後の版で同じ経路を再確認する一連の操作を追加する。 | RS07 / RS08 / RS09 |
| X09 | P1 | 二つの版を文章と設定の違いで比べる | 履歴検索、差分の項目名、単体復元、別案比較はある。任意二snapshotを原稿/設定/状態/素材で読み比べる表示を追加する。 | RS14 |
| X10 | P1 | 素材の利用条件と出力の表記を確認する | licenseNote・出所・redistributionAllowedは既にある。出力用途/表記条件/確認根拠/素材hashを持つ構造化した記録と出力前確認を追加する。 | RS06 / RS15 |
| X11 | P2 | 任意の文字数目標と執筆の増減を見る | 文章量/制作量/一経路の量の計算はある。作品/章/作業単位の作者が決める目標を追加する。 | RS10 |
| X12 | P2 | 限定したTwee 3の取り込みと出力 | 汎用JSONと専用形式はある。外部の場面データを作者案として取り込むTwee 3の限定対応を追加する。 | RS02 / RS03 / RS09 |

## 採用順の提案

まずG01〜G05の統合と復元の問題を解消し、原104の確認を進める。そのうえで用途別の入口、保存確認、二版比較、素材条件を共通土台として整える。本文の一括置換、翻訳表、経路の期待結果はその土台と原子保存を使う。横断検索、試読中の修正、執筆目標、Tweeは追加後の負担を測って後段へ回す。納期/工数/費用は未確定で、機能数から日数を推定しない。

## 保留・採用しない案

| 案 | 今回の判断 | 理由・再検討の条件 |
| --- | --- | --- |
| AIが本文を自動修正/自動送信 | 採用しない | 原稿・秘密・作者判断を自動で外へ送らず、既存F36の手動相談と出所付き別案を使う |
| 同期中の同時文字編集を新方式に変更 | 保留 | 既存の確定版/送信待ち/競合解決をまず完成する。共同作業の具体例と変換/取消の受入が揃う場合に別設計 |
| ink/Yarn/Unity/Unrealの全面変換 | 保留 | 固有の状態・時間・外部処理を無損失変換できる根拠がない。adapter単位で仕様とfixtureを宣言する |
| Fountain/EPUB/PDFの専用出版組版 | 保留 | 文字形式/読み物出力は既存F24を利用。具体的な媒体と利用者の用途を確認して別要件にする |
| 自動課金・外部素材市場・常時分析送信 | 採用しない | 無料範囲/本人選択の診断を維持。新費用を前提にしない |
| 自然言語だけで矛盾を完全自動判定 | 採用しない | 構造化した条件/状態/根拠と未知を扱う。人物の理解や作品の良し悪しを自動で確定しない |

## 公式資料の確認一覧

| ID | 公式資料 | 確認した範囲 | 推論/利用範囲の注意 |
| --- | --- | --- | --- |
| RS01 | [Twine: 文章の検索と置換](https://twinery.org/reference/en/editing-stories/finding-replacing.html) | 作品内の文章を検索し、置換できる。 | 正規表現も扱うが、初期対応を文字列一致に絞るのは本製品の提案。 |
| RS02 | [Twine: 作品の取り込み](https://www.twinery.org/reference/en/story-library/creating.html) | 編集途中・公開形式・Twee等の取り込みを案内する。 | 本製品の独自状態や秘密をTweeで完全往復できるとは推定しない。 |
| RS03 | [IFTF: Twee 3仕様 v3.0.2](https://github.com/iftechfoundation/twine-specs/blob/master/twee-3-specification.md) | 場面ヘッダー、名前のescape、StoryDataのIFID、script/stylesheetの意味を定める。 | 規格と各ストーリー形式の実行規則を区別する。 |
| RS04 | [Yarn Spinner: 台詞と多言語素材](https://docs.yarnspinner.dev/yarn-spinner-for-unity/assets-and-localization) | 台詞IDで言語ごとの文章と素材を対応させる。 | 台詞IDの土台は本製品にも既にあり、追加対象に数えない。 |
| RS05 | [Yarn Spinner: CSVによる翻訳](https://docs.yarnspinner.dev/yarn-spinner-for-unity/assets-and-localization/inbuilt-localisation) | 翻訳表に台詞IDと変更検出用の値を持ち、原文変更後の更新を扱う。 | 本製品の表は独自形式として版と互換範囲を宣言する。Yarn表への互換を自動で主張しない。 |
| RS06 | [articy:draft X: 翻訳の書き出しと取り込み](https://www.articy.com/help/adx/Localization_TextExport.html) | 翻訳表を出し、原文変更や競合を確認して取り込む。 | 公式のExcel連携はMicrosoft Officeで確認され、Pages/Numbersは非対応と記載される。iPhone往復は本製品側で別に検査する。 |
| RS07 | [Arcweave: Play Mode](https://docs.arcweave.com/project-tools/play-mode/overview) | 分岐を選び、作者・編集者は試読中にも本文を直せる。 | 公開閲覧者と作者の操作範囲は異なる。 |
| RS08 | [Arcweave: Debugger](https://docs.arcweave.com/project-tools/play-mode/debugger) | 試読時の変数と前後の値を確認できる。 | 本製品の前後差分は既存F16。追加案は期待結果の宣言とまとめた再実行。 |
| RS09 | [ink / Inky](https://www.inklestudios.com/ink/) | 編集・試読・定義への移動・Web/JSON出力を案内する。 | inkへの完全変換は提案範囲に含めない。 |
| RS10 | [Scrivener: 統計と執筆目標](https://www.literatureandlatte.com/blog/track-statistics-and-targets-in-your-scrivener-projects) | 作品・文書・作業単位の目標と文章量の統計を扱う。 | 日本語の数え方と差分集計は本製品で定義する。 |
| RS11 | [Ren’Py: 自動テスト](https://www.renpy.org/doc/html/testcases.html) | テストの集合、指定した条件の確認、実行の手順を定義できる。 | Ren’Pyを本製品の実行エンジンに採用する意味ではない。 |
| RS12 | [Aeon Timeline: 世界順と提示順](https://help.timeline.app/article/149-chronological-vs-narrative-order) | 出来事の日時順と物語の提示順を分ける。 | 既存B13/F03で採用済み。新しい機能として再計上しない。 |
| RS13 | [Aeon Timeline: モバイル画面](https://help.timeline.app/article/244-mobile-ui-overview) | 携帯向けの操作と画面構成を説明する。 | 本製品の初回案内と用途別の入口は独自提案。 |
| RS14 | [Obsidian: 版の履歴](https://help.obsidian.md/Obsidian%2BSync/Version%2Bhistory) | 変更と過去の版を確認して復元する。 | 本製品には既に履歴・復元があり、追加は二版の内容を読める比較表示。 |
| RS15 | [Campfire: よくある質問](https://www.campfirewriting.com/faq) | 人物・場所・原稿等を項目と画面から管理する。共同作業者の画像にはオフライン時の制約も記載する。 | 他製品の利用可否を本製品の通信なし操作の保証へ転用しない。 |
| RS16 | [Fountain: 脚本の文字形式](https://fountain.io/syntax/) | 場面見出し・話者・台詞等の文字形式を定義する。 | 映画脚本の専門出力は、利用作品が具体化してから別要件にする。 |
| RS17 | [MDN: 保存領域の確認](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager) | 保存量の見積と永続保存の許可状態を取得する仕組みを説明する。 | 見積は予約された空き容量ではない。許可と永久保管の保証を区別する。 |
| RS18 | [W3C: ドラッグの代替](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) | ドラッグを使う操作に単一ポインターでの代替を用意する条件を説明する。 | 本製品のタップ代替は既存B24/F32/N03。 |
| RS19 | [W3C: フォーカスが隠れない条件](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum) | 選んだ入力先が作者の表示物で完全に隠れない条件を説明する。 | 44px以上、推奨48pxは本製品の操作方針。W3Cの全基準をこの寸法だけで満たすとはしない。 |
| RS20 | [Supabase: Data APIの保護](https://supabase.com/docs/guides/api/securing-your-api) | APIから到達できる権限と行ごとの権限を別々に確認する。 | 画面の非表示だけでは権限検証を満たさない。 |
| RS21 | [Supabase: Storageへのアクセス制御](https://supabase.com/docs/guides/storage/security/access-control) | 素材の取得・追加・更新等を役割に沿って保護する。 | 作品データと素材の実権限をそれぞれ確認する。 |
| RS22 | [Supabase: 更新履歴](https://supabase.com/changelog) | 2026-10-11に更新一覧を確認した。実接続時には対象版と使用機能の変更を再照合する。 | Markdown版は取得先のContent-Typeで失敗し、HTML一覧を確認した。将来の料金や接続先設定をここで確定しない。 |

調査の単位は文書の記載範囲である。未発表・限定試用を一般利用可能と扱わない。参照先が将来変わる場合は、実装時に対象仕様版・依存版・ライセンスと上限を再確認する。X02の横断検索、X10の利用条件記録等の具体動作は本製品の提案であり、参照ツールが同じ一式を備えるという主張ではない。
