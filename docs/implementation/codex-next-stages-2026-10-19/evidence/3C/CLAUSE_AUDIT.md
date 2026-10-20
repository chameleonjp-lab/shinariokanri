# 3C：原文単位の未実行・阻害判定

2026-10-20 UTC。開始main `006333705a7e556fa0e54f1054df6b2910053cde`。**NP07の正式逐条確定はBLOCKED**。3BのF・seal・正式raw・実終了が存在しないため、この表は現時点の不足を原文単位で確認した記録であり、実操作による受入合格表ではない。

原本T＝[1D暫定表](../../../../acceptance/phase3/TRACEABILITY.json)（Git blob `9fc2823df8c76202538594c4da6988307cbfd178`、SHA-256 `2c7adc4445ef1fce122939c7f2327c2845d6e3eee306a431ad432a781c031a0d`）。Tの各JSON pointerは、原文・source候補/UI操作・fixture定義・仕様由来の独立期待・観測slotを指す。原JSONや暫定statusを変更していない。[空領域での全入力照合](REACQUISITION.md)と原検査器の実exit0により、件数だけでなく全ID集合・原文・対応を照合した。

| 対象 | 現時点の結論 |
| --- | --- |
| 原104要件 | 同一Fの新しい合格証拠0、全104未実行 |
| 原116ケース | not_run 94 / blocked 22。旧94合格の転記ではない |
| 原464条項 | not_run 405 / blocked 59 / passed 0。条項の外部指定59とケース全体22を分ける |
| 原24工程 | local_gate 24件not_run / 依存込みwhole_gate 24件blocked |
| 原6回帰群 | RG-R01〜06は全件not_run。1Bの補助RG01〜03と別 |
| 原68補助 | G32件not_run / X36件not_adopted。116へ加算しない |

各行の「未取得」は actual_observation / evidence.path / target_binding / runtime seed・初期native・素材の実観測が未取得であることを示す。Tのfixtureとindependent_expectationは仕様上の準備であり、実fixture・literal期待値・独立対照の取得完了を意味しない。Tのplanned_rootは予定slotであって実原本pathではない。

`not_run` の全行に不足F（同一source/tree/build/配信bytes/fixture/driver/argv/raw/実exit/cleanup/seal）がある。`blocked` の行にはそれに加えてTのexternal_requirementsがある。外部ケース中の局所条項はnot_runのまま保持し、局所成功でcase全体を解除しない。特にAT-F42・AT-E10・AT-N11は4条項の外部タグが空でも原外部22ケースに含む。

## 116ケース・464条項

source/UI・fixture・独立期待の列はTの実在pointerである。過去snapshotのsource候補52件は現在Fでの到達・観測を証明しない。観測・原本の列は全行で未取得。

| 原ケース／条項 | 原文（逐語、表のescapeのみ） | Tのsource/UI・fixture・独立期待 | 実観測／実原本／F binding | 判定 |
| --- | --- | --- | --- | --- |
| AT-B01 / given | 空の作品 | `/cases/0/clauses/0` | 未取得 | not_run |
| AT-B01 / when | 名前だけの人物と要約だけの出来事を登録する | `/cases/0/clauses/1` | 未取得 | not_run |
| AT-B01 / then | 同じ作品の一覧・詳細・検索から再度開ける | `/cases/0/clauses/2` | 未取得 | not_run |
| AT-B01 / negative_or_edge | 必須項目や参照先が不正な変更は保存せず、入力途中の文章と修正箇所を保持する | `/cases/0/clauses/3` | 未取得 | not_run |
| AT-B02 / given | 共通出来事と二人が関わる出来事がある | `/cases/1/clauses/0` | 未取得 | not_run |
| AT-B02 / when | 年表を開き出来事を編集する | `/cases/1/clauses/1` | 未取得 | not_run |
| AT-B02 / then | 共通レーンと人物レーンから同一IDの情報を開ける | `/cases/1/clauses/2` | 未取得 | not_run |
| AT-B02 / negative_or_edge | 共通レーンへの表示だけでは全員を関係者や知識の保有者に登録しない | `/cases/1/clauses/3` | 未取得 | not_run |
| AT-B03 / given | 人物が二つのグループに属する | `/cases/2/clauses/0` | 未取得 | not_run |
| AT-B03 / when | 片方を折りたたみ並べ替える | `/cases/2/clauses/1` | 未取得 | not_run |
| AT-B03 / then | 人物の本体・所属・出来事のIDは変わらない | `/cases/2/clauses/2` | 未取得 | not_run |
| AT-B03 / negative_or_edge | グループ削除では人物を連鎖削除せず、表示への影響を確認する | `/cases/2/clauses/3` | 未取得 | not_run |
| AT-B04 / given | 横に長い年表 | `/cases/3/clauses/0` | 未取得 | not_run |
| AT-B04 / when | 指またはスクロール操作で過去と未来へ移動する | `/cases/3/clauses/1` | 未取得 | not_run |
| AT-B04 / then | 人物名と共通レーンの識別を保ち対象の出来事を編集できる | `/cases/3/clauses/2` | 未取得 | not_run |
| AT-B04 / negative_or_edge | ページ全体の横ずれや、編集欄のスクロールとの取り違えが起きない | `/cases/3/clauses/3` | 未取得 | not_run |
| AT-B05 / given | 確定日時と不確定日時の出来事がある | `/cases/4/clauses/0` | 未取得 | not_run |
| AT-B05 / when | 表示単位と拡大率を切り替える | `/cases/4/clauses/1` | 未取得 | not_run |
| AT-B05 / then | 保存された日時・条件・関係線を変更しない | `/cases/4/clauses/2` | 未取得 | not_run |
| AT-B05 / negative_or_edge | 現在の暦に存在しない単位は理由付きで選択不可とし、暗黙の換算をしない | `/cases/4/clauses/3` | 未取得 | not_run |
| AT-B06 / given | 本編開始より前後に出来事がある | `/cases/5/clauses/0` | 未取得 | not_run |
| AT-B06 / when | 本編開始の基準点だけ変更する | `/cases/5/clauses/1` | 未取得 | not_run |
| AT-B06 / then | 出来事の絶対位置を保ち、相対表示だけ更新する | `/cases/5/clauses/2` | 未取得 | not_run |
| AT-B06 / negative_or_edge | 本編開始を動かしただけで全出来事を移動しない | `/cases/5/clauses/3` | 未取得 | not_run |
| AT-B07 / given | 二つの出来事がある | `/cases/6/clauses/0` | 未取得 | not_run |
| AT-B07 / when | 始点と終点をタップで指定して線の種類を選ぶ | `/cases/6/clauses/1` | 未取得 | not_run |
| AT-B07 / then | 年表と関係一覧から同じ関係IDを編集できる | `/cases/6/clauses/2` | 未取得 | not_run |
| AT-B07 / negative_or_edge | 存在しない終点や型の異なる関係を保存せず理由を示す | `/cases/6/clauses/3` | 未取得 | not_run |
| AT-B08 / given | 参加者が未設定の出来事 | `/cases/7/clauses/0` | 未取得 | not_run |
| AT-B08 / when | 二人を異なる役割で登録してメモを書く | `/cases/7/clauses/1` | 未取得 | not_run |
| AT-B08 / then | 人物側の参照元にも同じ出来事が現れる | `/cases/7/clauses/2` | 未取得 | not_run |
| AT-B08 / negative_or_edge | 登場、目撃、伝聞、知識取得を同じ関係として扱わない | `/cases/7/clauses/3` | 未取得 | not_run |
| AT-B09 / given | 年表に登場する二人がいる | `/cases/8/clauses/0` | 未取得 | not_run |
| AT-B09 / when | 関係図で関係を更新して年表から詳細を開く | `/cases/8/clauses/1` | 未取得 | not_run |
| AT-B09 / then | 同じ関係の意味と時期が表示される | `/cases/8/clauses/2` | 未取得 | not_run |
| AT-B09 / negative_or_edge | 図上の配置変更は人物の所属・時期・関係を変更しない | `/cases/8/clauses/3` | 未取得 | not_run |
| AT-B10 / given | 同名人物と別名がある | `/cases/9/clauses/0` | 未取得 | not_run |
| AT-B10 / when | 候補を確認して本文にリンクを付ける | `/cases/9/clauses/1` | 未取得 | not_run |
| AT-B10 / then | 選んだ対象のIDと本文位置に対応する | `/cases/9/clauses/2` | 未取得 | not_run |
| AT-B10 / negative_or_edge | 同名や一般語を自動で一人へ確定しない | `/cases/9/clauses/3` | 未取得 | not_run |
| AT-B11 / given | 場所と物品がある | `/cases/10/clauses/0` | 未取得 | not_run |
| AT-B11 / when | 出来事に関連付けて各一覧を開く | `/cases/10/clauses/1` | 未取得 | not_run |
| AT-B11 / then | 関係する人物・出来事へ相互移動できる | `/cases/10/clauses/2` | 未取得 | not_run |
| AT-B11 / negative_or_edge | 物品の種類と個体を区別し、一つの個体の複製で所有を二重化しない | `/cases/10/clauses/3` | 未取得 | not_run |
| AT-B12 / given | 条件・本文・関係線・素材を含む作品 | `/cases/11/clauses/0` | 未取得 | not_run |
| AT-B12 / when | 完全保存ファイルを新規作品へ読み戻す | `/cases/11/clauses/1` | 未取得 | not_run |
| AT-B12 / then | 安定IDと情報内容と素材の対応が一致する | `/cases/11/clauses/2` | 未取得 | not_run |
| AT-B12 / negative_or_edge | 破損・未対応版・危険なパス・参照不整合は既存作品を変更せず拒否する | `/cases/11/clauses/3` | 未取得 | not_run |
| AT-B13 / given | 古い出来事を後の回想で示す構成 | `/cases/12/clauses/0` | 未取得 | not_run |
| AT-B13 / when | 回想の提示位置を変更する | `/cases/12/clauses/1` | 未取得 | not_run |
| AT-B13 / then | 世界時間を変えず読者の開示順だけ変わる | `/cases/12/clauses/2` | 未取得 | not_run |
| AT-B13 / negative_or_edge | 場面の並べ替えを出来事の日付変更として保存しない | `/cases/12/clauses/3` | 未取得 | not_run |
| AT-B14 / given | 鍵を得る道と得ない道が合流する | `/cases/13/clauses/0` | 未取得 | not_run |
| AT-B14 / when | 二経路で同じ合流先へ進む | `/cases/13/clauses/1` | 未取得 | not_run |
| AT-B14 / then | 所持状態の違いを保ったまま到着する | `/cases/13/clauses/2` | 未取得 | not_run |
| AT-B14 / negative_or_edge | 選択肢ゼロや不正な効果は終端と区別し、途中までの更新を残さない | `/cases/13/clauses/3` | 未取得 | not_run |
| AT-B15 / given | 型の異なる状態がある | `/cases/14/clauses/0` | 未取得 | not_run |
| AT-B15 / when | 条件を組み立て更新する | `/cases/14/clauses/1` | 未取得 | not_run |
| AT-B15 / then | 値と更新元を確認できる | `/cases/14/clauses/2` | 未取得 | not_run |
| AT-B15 / negative_or_edge | 未定義の値を暗黙に偽またはゼロにせず未確認と表示する | `/cases/14/clauses/3` | 未取得 | not_run |
| AT-B16 / given | 二つの選択肢と効果がある | `/cases/15/clauses/0` | 未取得 | not_run |
| AT-B16 / when | 片方へ進み戻って他方へ進む | `/cases/15/clauses/1` | 未取得 | not_run |
| AT-B16 / then | 所持品・知識・既読・抽選状態を巻き戻した結果で進行する | `/cases/15/clauses/2` | 未取得 | not_run |
| AT-B16 / negative_or_edge | 試し読みの操作で作者の正本や公開版を上書きしない | `/cases/15/clauses/3` | 未取得 | not_run |
| AT-B17 / given | 嘘の証言と真相がある | `/cases/16/clauses/0` | 未取得 | not_run |
| AT-B17 / when | 誰がどの経路で聞いたか登録する | `/cases/16/clauses/1` | 未取得 | not_run |
| AT-B17 / then | 真偽・出所・知っている範囲を別々に確認できる | `/cases/16/clauses/2` | 未取得 | not_run |
| AT-B17 / negative_or_edge | 同じ場面に居るだけで真相を全員へ伝播しない | `/cases/16/clauses/3` | 未取得 | not_run |
| AT-B18 / given | 人物が途中で移動し所属を変える | `/cases/17/clauses/0` | 未取得 | not_run |
| AT-B18 / when | 変化前後と別経路を選ぶ | `/cases/17/clauses/1` | 未取得 | not_run |
| AT-B18 / then | 指定した時点と経路の状態が表示される | `/cases/17/clauses/2` | 未取得 | not_run |
| AT-B18 / negative_or_edge | 順序や経路が不明な場合は複数候補または不明とし唯一の状態を作らない | `/cases/17/clauses/3` | 未取得 | not_run |
| AT-B19 / given | 任意の手掛かりと続編用の謎がある | `/cases/18/clauses/0` | 未取得 | not_run |
| AT-B19 / when | 今作の回収状況を表示する | `/cases/18/clauses/1` | 未取得 | not_run |
| AT-B19 / then | 必須の未回収と意図した持ち越しを分ける | `/cases/18/clauses/2` | 未取得 | not_run |
| AT-B19 / negative_or_edge | プレイヤーに提示しただけで理解・推理済みと判定しない | `/cases/18/clauses/3` | 未取得 | not_run |
| AT-B20 / given | 目的が変化する人物 | `/cases/19/clauses/0` | 未取得 | not_run |
| AT-B20 / when | 変化の根拠となる場面を登録する | `/cases/19/clauses/1` | 未取得 | not_run |
| AT-B20 / then | 変化前後と根拠へ移動できる | `/cases/19/clauses/2` | 未取得 | not_run |
| AT-B20 / negative_or_edge | 役割を未入力の場面を作成不能にしない | `/cases/19/clauses/3` | 未取得 | not_run |
| AT-B21 / given | 日付未定と相対日時の出来事がある | `/cases/20/clauses/0` | 未取得 | not_run |
| AT-B21 / when | 先行出来事との日数制約を設定する | `/cases/20/clauses/1` | 未取得 | not_run |
| AT-B21 / then | 確定していない範囲を表現し前後関係を確認できる | `/cases/20/clauses/2` | 未取得 | not_run |
| AT-B21 / negative_or_edge | 循環する相対制約や存在しない日付は拒否または未解決とし、日時を捏造しない | `/cases/20/clauses/3` | 未取得 | not_run |
| AT-B22 / given | 会話とクエストと設定がある | `/cases/21/clauses/0` | 未取得 | not_run |
| AT-B22 / when | 場面の前提と台詞へ関連付ける | `/cases/21/clauses/1` | 未取得 | not_run |
| AT-B22 / then | 双方から根拠を追える | `/cases/21/clauses/2` | 未取得 | not_run |
| AT-B22 / negative_or_edge | クエストの完了と本文・実装の完成を一つの状態に統合しない | `/cases/21/clauses/3` | 未取得 | not_run |
| AT-B23 / given | 確定リンクと履歴のある人物 | `/cases/22/clauses/0` | 未取得 | not_run |
| AT-B23 / when | 改名し復元して再起動する | `/cases/22/clauses/1` | 未取得 | not_run |
| AT-B23 / then | IDと参照を保ち復元も新しい履歴として残る | `/cases/22/clauses/2` | 未取得 | not_run |
| AT-B23 / negative_or_edge | 容量不足や書き込み失敗を保存済みと表示せず、元データを失わせない | `/cases/22/clauses/3` | 未取得 | not_run |
| AT-B24 / given | タッチ端末で作品を開く | `/cases/23/clauses/0` | 未取得 | blocked |
| AT-B24 / when | 絞り込んで関係線や条件を編集する | `/cases/23/clauses/1` | 未取得 | blocked |
| AT-B24 / then | マウスなしで完了し絞り込みの範囲を把握できる | `/cases/23/clauses/2` | 未取得 | not_run |
| AT-B24 / negative_or_edge | 根拠が不足する候補を確定不具合と断定せず、色だけで意味を伝えない | `/cases/23/clauses/3` | 未取得 | not_run |
| AT-F01 / given | 文章メモ「塔の鍵は鳥が持つ」、画像1枚、音声1件をスマートフォンで保存した作品 | `/cases/24/clauses/0` | 未取得 | blocked |
| AT-F01 / when | メモから場面へ変換し、別端末で同期後の変換元と変換先を開く | `/cases/24/clauses/1` | 未取得 | blocked |
| AT-F01 / then | スマートフォンで一文を残し、PCで場面へ変えても元のメモを追える。 | `/cases/24/clauses/2` | 未取得 | blocked |
| AT-F01 / negative_or_edge | 録音を拒否した端末でも文章を保存できる。変換は元メモを消さず、元と変換先のIDを結ぶ。 | `/cases/24/clauses/3` | 未取得 | not_run |
| AT-F02 / given | 人物雛形に名前だけの既存人物Aがある作品 | `/cases/25/clauses/0` | 未取得 | not_run |
| AT-F02 / when | 説明付きenum項目「所属」を任意項目として追加し、後で必須化と数値型への変更を試す | `/cases/25/clauses/1` | 未取得 | not_run |
| AT-F02 / then | 設定を細かくしない作品でも、名前と要約だけで登録を始められる。 | `/cases/25/clauses/2` | 未取得 | not_run |
| AT-F02 / negative_or_edge | 必須項目の追加や型変更は既存値の影響を事前表示する。不適合値を黙って削除・変換しない。 | `/cases/25/clauses/3` | 未取得 | not_run |
| AT-F03 / given | 場面Sと恋愛/戦争の二つの筋がある作品 | `/cases/26/clauses/0` | 未取得 | not_run |
| AT-F03 / when | Sを二つの筋へ表示し、一方のカードで本文を修正してもう一方から開く | `/cases/26/clauses/1` | 未取得 | not_run |
| AT-F03 / then | 場面を別の筋にも表示しても、本文が別々に複製されない。 | `/cases/26/clauses/2` | 未取得 | not_run |
| AT-F03 / negative_or_edge | 筋から外しても本文を消さない。表示レーンと実際の参加関係は別に保持する。 | `/cases/26/clauses/3` | 未取得 | not_run |
| AT-F04 / given | 人物Aが鍵を探す場面Sと役割未入力の場面T | `/cases/27/clauses/0` | 未取得 | not_run |
| AT-F04 / when | Sに視点A、目標、対立、結果、新情報を登録し、Tは空欄のまま保存する | `/cases/27/clauses/1` | 未取得 | not_run |
| AT-F04 / then | 場面を開くと、物語に加える理由と変化を確認できる。 | `/cases/27/clauses/2` | 未取得 | not_run |
| AT-F04 / negative_or_edge | 未記入を許し、作者が定めた役割を評価の正解として自動判定しない。 | `/cases/27/clauses/3` | 未取得 | not_run |
| AT-F05 / given | 緊張度2/8/未入力の三場面と一つの構成雛形 | `/cases/28/clauses/0` | 未取得 | not_run |
| AT-F05 / when | 別案に雛形を適用して章順を変え、緊張度の表示と算出対象を確認する | `/cases/28/clauses/1` | 未取得 | not_run |
| AT-F05 / then | 表示は作者が付けた値から作り、作品の良し悪しを自動採点しない。 | `/cases/28/clauses/2` | 未取得 | not_run |
| AT-F05 / negative_or_edge | 雛形適用は別案または差分確認を経る。緊張度の未入力をゼロと集計せず算出母数を示す。 | `/cases/28/clauses/3` | 未取得 | not_run |
| AT-F06 / given | 要約「門が開く」、本文「門番は去った」、秘密の作者メモとルビを持つ場面 | `/cases/29/clauses/0` | 未取得 | not_run |
| AT-F06 / when | カードから本文へ移り本文を変更し、選んだ章を横書き/縦書きで通読する | `/cases/29/clauses/1` | 未取得 | not_run |
| AT-F06 / then | 作者メモを試し読みへ出さず、本文の修正が関連する表示へ反映される。 | `/cases/29/clauses/2` | 未取得 | not_run |
| AT-F06 / negative_or_edge | 要約の更新は本文を上書きしない。公開用読み物へ作者メモを混ぜず、ルビと縦書きでも元の段落IDを保つ。 | `/cases/29/clauses/3` | 未取得 | not_run |
| AT-F07 / given | 生年月日が確定した人物、死亡後登場、誕生日未定の人物 | `/cases/30/clauses/0` | 未取得 | not_run |
| AT-F07 / when | 暦を選んで誕生日前後の年齢を確認し、死亡後登場へ回想の理由を付ける | `/cases/30/clauses/1` | 未取得 | not_run |
| AT-F07 / then | 死亡後の場面は、回想・記録・復活などの意図を添えて例外扱いできる。 | `/cases/30/clauses/2` | 未取得 | not_run |
| AT-F07 / negative_or_edge | 生年月日や暦の対応が未定なら年齢は範囲または不明とする。回想・復活の例外を時期と経路付きで記録する。 | `/cases/30/clauses/3` | 未取得 | not_run |
| AT-F08 / given | A終了100、B開始200、終了から50–100tickの制約と固定日時C | `/cases/31/clauses/0` | 未取得 | not_run |
| AT-F08 / when | Aの終了を180へ動かす候補を作り、連動対象を確認して適用後に取り消す | `/cases/31/clauses/1` | 未取得 | not_run |
| AT-F08 / then | 表示の拡大・縮小で日付は変わらず、日付変更の影響を取り消せる。 | `/cases/31/clauses/2` | 未取得 | not_run |
| AT-F08 / negative_or_edge | 循環制約・固定日時との衝突は影響一覧を示す。承認された可動日時だけを一括変更し、取消時は全変更を戻す。 | `/cases/31/clauses/3` | 未取得 | not_run |
| AT-F09 / given | 共通世界Wの公開版1を参照する旧作Pと続編Q | `/cases/32/clauses/0` | 未取得 | not_run |
| AT-F09 / when | Wに改訂版2を作りQだけ参照更新し、Pの公開版1の設定を再度開く | `/cases/32/clauses/1` | 未取得 | not_run |
| AT-F09 / then | 過去作品の公開時点の設定を保ったまま、続編用の設定を作れる。 | `/cases/32/clauses/2` | 未取得 | not_run |
| AT-F09 / negative_or_edge | 共通設定の公開版は不変とし作品が参照する版を固定する。続編の改訂を旧作へ自動適用しない。 | `/cases/32/clauses/3` | 未取得 | not_run |
| AT-F10 / given | 同じ場所IDを持つ街と建物が地図なしで登録済み | `/cases/33/clauses/0` | 未取得 | not_run |
| AT-F10 / when | 場所一覧から出来事を編集し、街/建物の地図画像とpinを後から追加して往復する | `/cases/33/clauses/1` | 未取得 | not_run |
| AT-F10 / then | 地図画像がなくても場所の一覧で作業でき、地図を追加しても同じ場所を参照する。 | `/cases/33/clauses/2` | 未取得 | not_run |
| AT-F10 / negative_or_edge | 地図画像がない場合は場所の一覧を同等に使う。地図階層の循環と無効な座標参照を拒否する。 | `/cases/33/clauses/3` | 未取得 | not_run |
| AT-F11 / given | 人物が街Aから街Bへ100tick差で移動し、手段の最低所要時間は未設定 | `/cases/34/clauses/0` | 未取得 | not_run |
| AT-F11 / when | 移動検査を行い、最低200tickを登録して再検査し、場所の破壊前後を表示する | `/cases/34/clauses/1` | 未取得 | not_run |
| AT-F11 / then | 計算に使う時間が未設定なら、移動不可能と断定せず未確認にする。 | `/cases/34/clauses/2` | 未取得 | not_run |
| AT-F11 / negative_or_edge | 移動手段・距離・所要時間の根拠がない場合は未確認とする。時点による改名や支配の違いを恒久上書きしない。 | `/cases/34/clauses/3` | 未取得 | not_run |
| AT-F12 / given | 同一人物の偽名と非公開本名、非公開の親子関係 | `/cases/35/clauses/0` | 未取得 | not_run |
| AT-F12 / when | 正体開示前のreader投影を作り、検索、家系、索引、リンク、添付名を調べる | `/cases/35/clauses/1` | 未取得 | not_run |
| AT-F12 / then | 正体を明かす前の資料に、本名や家系のつながりが表示されない。 | `/cases/35/clauses/2` | 未取得 | not_run |
| AT-F12 / negative_or_edge | 家系は関係種類と根拠を持つ。正体の公開前は本名だけでなく、索引・画像名・リンク・親子関係からも漏らさない。 | `/cases/35/clauses/3` | 未取得 | not_run |
| AT-F13 / given | 章内に場面、場面内に会話があり、未接続の出口が一つある階層graph | `/cases/36/clauses/0` | 未取得 | not_run |
| AT-F13 / when | 章まで折りたたんで未完成件数を確認し、会話へ掘り下げ出口を再接続する | `/cases/36/clauses/1` | 未取得 | not_run |
| AT-F13 / then | 図を折りたたんでも、中に条件や未完成箇所があることを確認できる。 | `/cases/36/clauses/2` | 未取得 | not_run |
| AT-F13 / negative_or_edge | 下位図の未解決入口・出口・条件エラーは上位図の件数に反映し、折りたたみでエラーを隠さない。 | `/cases/36/clauses/3` | 未取得 | not_run |
| AT-F14 / given | gateは鍵あり、triggerは入室、once=runの出来事 | `/cases/37/clauses/0` | 未取得 | not_run |
| AT-F14 / when | 鍵を得るだけの状態更新、入室、同じoccurrenceIdの再送、再入室を順に行う | `/cases/37/clauses/1` | 未取得 | not_run |
| AT-F14 / then | 前提が成り立つだけで出来事が勝手に起こらず、きっかけが必要か選べる。 | `/cases/37/clauses/2` | 未取得 | not_run |
| AT-F14 / negative_or_edge | 条件評価だけでは効果を実行しない。自動発火は明示設定とし、重複した同一トリガーでは一度だけ規則を守る。 | `/cases/37/clauses/3` | 未取得 | not_run |
| AT-F15 / given | 鍵あり・好感度5のcheckpointと初期値欠落のcheckpoint | `/cases/38/clauses/0` | 未取得 | not_run |
| AT-F15 / when | 途中開始で進み戻り、不足値のcheckpointと別版checkpointからの開始を試す | `/cases/38/clauses/1` | 未取得 | not_run |
| AT-F15 / then | 途中開始で必要な状態がない場合、最初から開始した場合と区別して表示する。 | `/cases/38/clauses/2` | 未取得 | not_run |
| AT-F15 / negative_or_edge | 版不一致の開始状態は移行確認が必要。不足値は未確認とし、途中開始の証跡を通しプレイの証跡として扱わない。 | `/cases/38/clauses/3` | 未取得 | not_run |
| AT-F16 / given | 鍵取得/未取得の二経路が合流し、初期好感度0 | `/cases/39/clauses/0` | 未取得 | not_run |
| AT-F16 / when | 二経路を同じ版から進め、合流先の差分と変更元を比べ、明示resetの有無で再実行する | `/cases/39/clauses/1` | 未取得 | not_run |
| AT-F16 / then | 合流後に差が残る場合、差を消すのか、会話などへ反映するのか確認できる。 | `/cases/39/clauses/2` | 未取得 | not_run |
| AT-F16 / negative_or_edge | 合流時は自動初期化しない。差を解消するには明示効果を登録し、差分から変更元へ戻れるようにする。 | `/cases/39/clauses/3` | 未取得 | not_run |
| AT-F17 / given | 場面4、選択肢3、条件真偽4項目の母数を持つ版 | `/cases/40/clauses/0` | 未取得 | not_run |
| AT-F17 / when | 二選択肢だけの経路記録を保存して再実行し、内容変更後の確認待ちを調べる | `/cases/40/clauses/1` | 未取得 | not_run |
| AT-F17 / then | 確認できた割合は対象を明記する。場面を見ただけで全条件を確認済みにしない。 | `/cases/40/clauses/2` | 未取得 | not_run |
| AT-F17 / negative_or_edge | 台詞到達率・選択肢到達率・条件結果の網羅率を別々に算出する。版変更後の経路は再確認待ちとする。 | `/cases/40/clauses/3` | 未取得 | not_run |
| AT-F18 / given | 到達可能終端、意図した終端、選択肢ゼロ、無制限ループ、外部条件を含むgraph | `/cases/41/clauses/0` | 未取得 | not_run |
| AT-F18 / when | 参照検査と有限探索を実行し、各結果区分、証人経路、上限超過を開く | `/cases/41/clauses/1` | 未取得 | not_run |
| AT-F18 / then | 外部の処理など分からない条件は未確認にする。意図した終わりと進めない不具合を区別する。 | `/cases/41/clauses/2` | 未取得 | not_run |
| AT-F18 / negative_or_edge | 外部値・無制限ループ・探索打切りは未確認とする。不具合候補には再現経路または不成立の根拠を添える。 | `/cases/41/clauses/3` | 未取得 | not_run |
| AT-F19 / given | 共通会話Cを参照するS、独立複製T、台詞のみoverrideするU | `/cases/42/clauses/0` | 未取得 | not_run |
| AT-F19 / when | Cの台詞を改訂し、影響一覧と適用版を確認してS/T/Uの文章を比較する | `/cases/42/clauses/1` | 未取得 | not_run |
| AT-F19 / then | 元を変更するとどこが変わるか分かり、意図しない分岐へ反映されない。 | `/cases/42/clauses/2` | 未取得 | not_run |
| AT-F19 / negative_or_edge | 参照・複製・差分上書きの方式を保存する。元を削除する前に全参照先を示し、更新の適用範囲を固定する。 | `/cases/42/clauses/3` | 未取得 | not_run |
| AT-F20 / given | 初回/再訪反応と抽選3候補、run所持金、across_runs記憶 | `/cases/43/clauses/0` | 未取得 | not_run |
| AT-F20 / when | seed固定で初回/再訪/戻るを行い、周回と全リセット後の記憶/所持金を比べる | `/cases/43/clauses/1` | 未取得 | not_run |
| AT-F20 / then | 繰り返しでも重要な情報が失われず、抽選の結果を記録して再現できる。 | `/cases/43/clauses/2` | 未取得 | not_run |
| AT-F20 / negative_or_edge | 乱数種・抽選位置・既読・周回持越しを保存する。抽選候補ゼロを無言で進行せず不成立時の処理に従う。 | `/cases/43/clauses/3` | 未取得 | not_run |
| AT-F21 / given | 台詞L1/L2と対応する翻訳/音声/外部参照 | `/cases/44/clauses/0` | 未取得 | not_run |
| AT-F21 / when | 話者改名とL1/L2並替え、L1編集、複製、分割を行い各IDと対応履歴を確認する | `/cases/44/clauses/1` | 未取得 | not_run |
| AT-F21 / then | 並べ替えや改名をしても、別の台詞の音声へ取り違えない。 | `/cases/44/clauses/2` | 未取得 | not_run |
| AT-F21 / negative_or_edge | 既存台詞の編集はID維持、コピーは新ID、分割は元から二つの新IDへの対応履歴を残す。IDの手動再利用を拒否する。 | `/cases/44/clauses/3` | 未取得 | not_run |
| AT-F22 / given | 話者/背景/音楽/間が指定され、背景は仮素材、音楽は欠落 | `/cases/45/clauses/0` | 未取得 | not_run |
| AT-F22 / when | 本文だけの表示と演出込み表示を切り替え、素材一覧で不足と仮完成を調べる | `/cases/45/clauses/1` | 未取得 | not_run |
| AT-F22 / then | シナリオだけを読める表示と、演出を含めて確認する表示を切り替えられる。 | `/cases/45/clauses/2` | 未取得 | not_run |
| AT-F22 / negative_or_edge | 欠落素材と仮素材を別状態にし、素材がなくても本文を読める。素材IDの取り替えで台詞IDを変えない。 | `/cases/45/clauses/3` | 未取得 | not_run |
| AT-F23 / given | 原文hashに対応し翻訳/収録が確認済みの台詞 | `/cases/46/clauses/0` | 未取得 | not_run |
| AT-F23 / when | 原文を修正して担当別出力し、並べ替えだけの場合と見直し対象を比較する | `/cases/46/clauses/1` | 未取得 | not_run |
| AT-F23 / then | 元の文章だけが変わっても、古い翻訳や音声を完成済みのまま扱わない。 | `/cases/46/clauses/2` | 未取得 | not_run |
| AT-F23 / negative_or_edge | 原文の内容ハッシュが変わった場合のみ依存成果物を確認待ちにする。音声・翻訳の版と確認者を保持する。 | `/cases/46/clauses/3` | 未取得 | not_run |
| AT-F24 / given | 作者メモ、没案、公開名、分岐、添付、未対応外部処理を持つ版 | `/cases/47/clauses/0` | 未取得 | not_run |
| AT-F24 / when | 完全保存の往復、reader、playable、runtimeの各出力を選び除外と拒否を確認する | `/cases/47/clauses/1` | 未取得 | not_run |
| AT-F24 / then | 保存用の読み戻しでは情報を保つ。制作・公開用には作者メモや秘密を必要に応じて除く。 | `/cases/47/clauses/2` | 未取得 | not_run |
| AT-F24 / negative_or_edge | 完全保存・公開資料・試遊・制作データの各プロファイルを選択する。未対応の条件や外部コマンドは制作出力を拒否し説明する。 | `/cases/47/clauses/3` | 未取得 | not_run |
| AT-F25 / given | 正本と公開版1を持つ作品 | `/cases/48/clauses/0` | 未取得 | not_run |
| AT-F25 / when | 別案の場面を作って没にし、ゲーム内に選択分岐を追加して正本を制作出力する | `/cases/48/clauses/1` | 未取得 | not_run |
| AT-F25 / then | 没案がゲーム用の出力へ混ざらず、元の案を消さずに比較できる。 | `/cases/48/clauses/2` | 未取得 | not_run |
| AT-F25 / negative_or_edge | 作者別案とゲーム内経路を別ID・別種として保存する。没・仮の情報が正本の制作出力へ混入しない。 | `/cases/48/clauses/3` | 未取得 | not_run |
| AT-F26 / given | 人物Aを参照する台詞/伏線/翻訳と、意味だけ関連した場面 | `/cases/49/clauses/0` | 未取得 | not_run |
| AT-F26 / when | A改名と死亡設定の変更を別々に実行し、自動表示更新と人の確認待ちを比較する | `/cases/49/clauses/1` | 未取得 | not_run |
| AT-F26 / then | 改名だけの自動反映と、本文を人が見直す必要のある変更を区別する。 | `/cases/49/clauses/2` | 未取得 | not_run |
| AT-F26 / negative_or_edge | ID参照の改名反映と意味の見直しを区別する。見直し候補を確定修正として本文へ適用しない。 | `/cases/49/clauses/3` | 未取得 | not_run |
| AT-F27 / given | 同名人物「葵」2人、一般語としての葵、別名を含む本文 | `/cases/50/clauses/0` | 未取得 | not_run |
| AT-F27 / when | 候補を確認して一人に確定リンク、一般語を除外し、対象の逆参照と再候補を調べる | `/cases/50/clauses/1` | 未取得 | not_run |
| AT-F27 / then | 本文中の普通の単語を人物名と勝手に結び付けず、候補を選んで確定できる。 | `/cases/50/clauses/2` | 未取得 | not_run |
| AT-F27 / negative_or_edge | リンク候補の除外を保持し、同名では識別情報を示す。普通の単語や引用資料を無断で置換しない。 | `/cases/50/clauses/3` | 未取得 | not_run |
| AT-F28 / given | Web資料URL、PDF添付、画像、作者の解釈を持つ設定 | `/cases/51/clauses/0` | 未取得 | not_run |
| AT-F28 / when | 参照ページ/取得日を指定して設定に結び、公開出力の再配布許可を確認する | `/cases/51/clauses/1` | 未取得 | not_run |
| AT-F28 / then | 設定の説明と参考資料の文章を区別し、後から元の資料へ戻れる。 | `/cases/51/clauses/2` | 未取得 | not_run |
| AT-F28 / negative_or_edge | 添付と外部URLを区別し、参照箇所・取得日・解釈を分ける。外部資料の再配布権限がない場合はリンクと書誌情報だけを出す。 | `/cases/51/clauses/3` | 未取得 | not_run |
| AT-F29 / given | 版1の台詞Lにreviewerが指摘したコメント | `/cases/52/clauses/0` | 未取得 | blocked |
| AT-F29 / when | 本文改訂、対象段落削除、修正済み、再確認済みを順に行い元版の引用を開く | `/cases/52/clauses/1` | 未取得 | not_run |
| AT-F29 / then | 指摘から対象を開け、対象が変わっても何についての指摘だったか追える。 | `/cases/52/clauses/2` | 未取得 | not_run |
| AT-F29 / negative_or_edge | 指摘時の対象版と引用範囲を保持する。対象段落が削除されても元指摘は残し、最新位置は不明と表示する。 | `/cases/52/clauses/3` | 未取得 | not_run |
| AT-F30 / given | chapter限定reader、reviewer、editorと秘密の本名/関係/添付 | `/cases/53/clauses/0` | 未取得 | blocked |
| AT-F30 / when | 各役割で本文、検索、図、リンク、素材と直接APIを操作し、秘密の取得と本文更新を試す | `/cases/53/clauses/1` | 未取得 | blocked |
| AT-F30 / then | 秘密を隠した本文から、検索や関連図、リンク先を使って秘密が見えない。 | `/cases/53/clauses/2` | 未取得 | blocked |
| AT-F30 / negative_or_edge | 権限はサーバー側と出力時に検証する。非公開データを送ってCSSで隠す方式を禁止し、検索・素材・参照数にも同じ投影を適用する。 | `/cases/53/clauses/3` | 未取得 | blocked |
| AT-F31 / given | 人物/条件/関係線/専用ファイルを持つ作品と未保存入力 | `/cases/54/clauses/0` | 未取得 | not_run |
| AT-F31 / when | 幅320/390/768/1024/1440、縦横/分割で配置を切替え、狭幅だけで編集と読み込みを完了する | `/cases/54/clauses/1` | 未取得 | blocked |
| AT-F31 / then | 人物、条件、関係線、読み込みの編集を、スマートフォンだけでも完了できる。 | `/cases/54/clauses/2` | 未取得 | blocked |
| AT-F31 / negative_or_edge | 端末の幅で表示を切り替え、重要操作をPCに限定しない。分割表示やソフトキーボードで確定ボタンが隠れない。 | `/cases/54/clauses/3` | 未取得 | blocked |
| AT-F32 / given | 右クリック/ドラッグに相当する編集作業 | `/cases/55/clauses/0` | 未取得 | not_run |
| AT-F32 / when | タップボタンだけで線作成/順序移動/一括編集を完了し、同じ作業をキーボードで行う | `/cases/55/clauses/1` | 未取得 | not_run |
| AT-F32 / then | 触れるとだけ現れる操作や右クリックだけの操作を、タッチ用のボタンからも使える。 | `/cases/55/clauses/2` | 未取得 | not_run |
| AT-F32 / negative_or_edge | ドラッグ・ホバー・右クリック・長押しの各操作は常時アクセスできるボタンと一覧で代替する。ブラウザーの文字拡大を妨げない。 | `/cases/55/clauses/3` | 未取得 | not_run |
| AT-F33 / given | PC幅で保存した拡大率/図位置とスマートフォン別設定 | `/cases/56/clauses/0` | 未取得 | not_run |
| AT-F33 / when | 名前付き検索/お気に入りから再開し、別端末の同場面と削除済み再開リンクを開く | `/cases/56/clauses/1` | 未取得 | blocked |
| AT-F33 / then | 別端末で同じ場面を開いても、小さい画面へPCの細かい配置を押し付けない。 | `/cases/56/clauses/2` | 未取得 | blocked |
| AT-F33 / negative_or_edge | 内容と端末別の表示設定を分ける。削除された対象への再開リンクは履歴または復元案内へ移し白画面にしない。 | `/cases/56/clauses/3` | 未取得 | not_run |
| AT-F34 / given | 二端末が同じbaseRevisionの作品を取得済み | `/cases/57/clauses/0` | 未取得 | blocked |
| AT-F34 / when | 機内モードで同じ本文を別々に編集し、順不同で同期して競合を選び再送する | `/cases/57/clauses/1` | 未取得 | blocked |
| AT-F34 / then | 二つの端末で同じ項目を変えた場合、片方を黙って消さずに両方を確認して選べる。 | `/cases/57/clauses/2` | 未取得 | blocked |
| AT-F34 / negative_or_edge | 同一項目の競合は双方と共通元を保持する。保存済みと同期済みを混同せず、再送・削除対編集でも黙って上書きしない。 | `/cases/57/clauses/3` | 未取得 | blocked |
| AT-F35 / given | 条件・線・素材・巨大tick・単体履歴を持つ作品 | `/cases/58/clauses/0` | 未取得 | not_run |
| AT-F35 / when | 全体を出力し空環境へ復元、別途単体復元と追加/置換/統合を選択する | `/cases/58/clauses/1` | 未取得 | not_run |
| AT-F35 / then | 書き出して読み戻したとき、番号、条件、矢印、日時、素材が対応したまま残る。 | `/cases/58/clauses/2` | 未取得 | not_run |
| AT-F35 / negative_or_edge | 単体復元は最新の関連情報への影響を提示する。追加・置換・統合のID規則を適用し、失敗時は全体をロールバックする。 | `/cases/58/clauses/3` | 未取得 | not_run |
| AT-F36 / given | 確定設定と未確定設定、秘密、前後状態を持つ場面S | `/cases/59/clauses/0` | 未取得 | not_run |
| AT-F36 / when | S周辺だけ相談用に出力し、提案文章を別案として取り込み、正本との比較を開く | `/cases/59/clauses/1` | 未取得 | not_run |
| AT-F36 / then | 相談で出た案が、自動で確定設定を書き換えず、変更候補として比較できる。 | `/cases/59/clauses/2` | 未取得 | not_run |
| AT-F36 / negative_or_edge | 相談用出力にも公開範囲を適用する。AIサービスへ自動送信せず、取り込む文章は出所と対象版を持つ別案とする。 | `/cases/59/clauses/3` | 未取得 | not_run |
| AT-F37 / given | 新しい作品と下書き状態 | `/cases/60/clauses/0` | 未取得 | not_run |
| AT-F37 / when | 生存をenumの存命/死亡で宣言し、integer好感度と未設定booleanを登録して型違い代入を試す | `/cases/60/clauses/1` | 未取得 | not_run |
| AT-F37 / then | 「死亡」と「存命」のような反対の意味の値を重複して管理しない。未設定を偽と決め付けない。 | `/cases/60/clauses/2` | 未取得 | not_run |
| AT-F37 / negative_or_edge | 同義語・反対語は同じ状態の値として表現する候補を示す。型違い、許容値外、未定義の使用は拒否または未確認とする。 | `/cases/60/clauses/3` | 未取得 | not_run |
| AT-F38 / given | run所持金10、across_runs記憶、好感度から算出する好意 | `/cases/61/clauses/0` | 未取得 | not_run |
| AT-F38 / when | 値更新、周回、全リセット、算出値への直接代入、循環式の保存を試す | `/cases/61/clauses/1` | 未取得 | not_run |
| AT-F38 / then | 持ち越す記憶と初期化する所持金を分ける。「好感度が一定以上」を別の値として二重更新しない。 | `/cases/61/clauses/2` | 未取得 | not_run |
| AT-F38 / negative_or_edge | 算出状態への直接代入と循環式を拒否する。周回初期化と全リセットを別コマンドとし、持ち越し対象を一覧化する。 | `/cases/61/clauses/3` | 未取得 | not_run |
| AT-F39 / given | 状態Xを条件で読む場面、更新する場面、resetする処理と未使用Y | `/cases/62/clauses/0` | 未取得 | not_run |
| AT-F39 / when | Xの利用箇所と試読変更履歴を開き、外部利用宣言のあるYを整理候補で確認する | `/cases/62/clauses/1` | 未取得 | not_run |
| AT-F39 / then | 値が変わった理由から対象の選択や処理へ戻れる。使われていない状態も候補として見つかる。 | `/cases/62/clauses/2` | 未取得 | not_run |
| AT-F39 / negative_or_edge | 値の参照元と書込元を安定IDで追う。未使用状態は削除候補だけを示し、外部で使う宣言がある値を誤削除しない。 | `/cases/62/clauses/3` | 未取得 | not_run |
| AT-F40 / given | 鍵booleanと時刻enum昼/夜、同時成立する自動候補2件 | `/cases/63/clauses/0` | 未取得 | not_run |
| AT-F40 / when | all(鍵,any(昼,夜))を作り真/偽/不明、優先同値、fallbackなしを順に評価する | `/cases/63/clauses/1` | 未取得 | not_run |
| AT-F40 / then | 「鍵あり、かつ、昼または夜」の括弧を明示する。今の値で選択肢が出ない理由を説明する。 | `/cases/63/clauses/2` | 未取得 | not_run |
| AT-F40 / negative_or_edge | 括弧・優先順・不成立時処理を明示する。未知を偽にしない三値評価を行い、任意のコードを条件として実行しない。 | `/cases/63/clauses/3` | 未取得 | not_run |
| AT-F41 / given | 未受注→進行中→完了/失敗のみを許すクエスト | `/cases/64/clauses/0` | 未取得 | not_run |
| AT-F41 / when | 完了→未受注と同時に所持金加算するeffect群を実行し、理由付きresetを別途試す | `/cases/64/clauses/1` | 未取得 | not_run |
| AT-F41 / then | 完了済みのクエストが意図せず未受注へ戻った場合、変更した処理と規則を確認できる。 | `/cases/64/clauses/2` | 未取得 | not_run |
| AT-F41 / negative_or_edge | 禁止遷移は一連の効果を原子的に拒否する。例外は理由・対象経路・期限付きで明示し、以前の状態を記録する。 | `/cases/64/clauses/3` | 未取得 | not_run |
| AT-F42 / given | ゲーム管理の戦闘結果enum契約とstub勝利、実ゲーム証跡未登録 | `/cases/65/clauses/0` | 未取得 | not_run |
| AT-F42 / when | stubで通った道を出力し、後にactual結果をline/flow ID対応付きで記録して比較する | `/cases/65/clauses/1` | 未取得 | not_run |
| AT-F42 / then | 仮の戦闘結果で通れた道と、ゲーム上で実際に確認した道を区別する。番号と値の対応を保つ。 | `/cases/65/clauses/2` | 未取得 | not_run |
| AT-F42 / negative_or_edge | 外部値の管理元・型・欠損時の扱いを固定する。仮の外部応答とゲーム実機の確認結果は別証跡とする。 | `/cases/65/clauses/3` | 未取得 | not_run |
| AT-F43 / given | 独立伏線Qに二つの手掛かりと二つの回収がある | `/cases/66/clauses/0` | 未取得 | not_run |
| AT-F43 / when | 手掛かり場面を分割/移動/削除し、Q本体を開いて根拠位置を付け直す | `/cases/66/clauses/1` | 未取得 | not_run |
| AT-F43 / then | 場面を分割・移動しても伏線そのものは残り、手掛かりと回収先を付け直せる。 | `/cases/66/clauses/2` | 未取得 | not_run |
| AT-F43 / negative_or_edge | 場面を削除しても伏線本体は残す。複数の手掛かり・回収と代替説明を別IDで対応付ける。 | `/cases/66/clauses/3` | 未取得 | not_run |
| AT-F44 / given | 世界tickが古い回想を提示順の最後に置く構成 | `/cases/67/clauses/0` | 未取得 | not_run |
| AT-F44 / when | 回想を先頭/最後に移動し、人物と読者提示の開示段階を二経路で確認する | `/cases/67/clauses/1` | 未取得 | not_run |
| AT-F44 / then | 回想の世界内の日付が古くても、読み手が後から見るなら後の開示として扱う。 | `/cases/67/clauses/2` | 未取得 | not_run |
| AT-F44 / negative_or_edge | 開示の段階は経路上の提示位置で評価する。章の並べ替えは世界時間を変えず開示評価だけを再確認待ちにする。 | `/cases/67/clauses/3` | 未取得 | not_run |
| AT-F45 / given | 必須情報Cと代替説明D、C/Dを両方飛ばして回収Pへ行けるgraph | `/cases/68/clauses/0` | 未取得 | not_run |
| AT-F45 / when | 各経路の提示検査を行い、不足する証人経路と任意手掛かりの扱いを確認する | `/cases/68/clauses/1` | 未取得 | not_run |
| AT-F45 / then | 手掛かりを飛ばして真相へ到達する経路を示せる。プレイヤーが推理できたと自動判定はしない。 | `/cases/68/clauses/2` | 未取得 | not_run |
| AT-F45 / negative_or_edge | 作者が必要とした情報の提示有無だけを評価する。探索の制限超過や外部条件は未確認、プレイヤーの理解は自動認定しない。 | `/cases/68/clauses/3` | 未取得 | not_run |
| AT-F46 / given | 真実T、人物Aの嘘の証言、Bの誤解、Cの未取得知識 | `/cases/69/clauses/0` | 未取得 | not_run |
| AT-F46 / when | 出所と取得箇所を登録し、CがTを断言する台詞と理由付き嘘の台詞を検査する | `/cases/69/clauses/1` | 未取得 | not_run |
| AT-F46 / then | 知らないはずの人物の発言を確認候補にする。意図した嘘や誤解は、その理由を添えて扱える。 | `/cases/69/clauses/2` | 未取得 | not_run |
| AT-F46 / negative_or_edge | 証言の誤り、意図した嘘、未確定案を真実から分離する。知識取得には出所と時点または経路位置を必要とする。 | `/cases/69/clauses/3` | 未取得 | not_run |
| AT-F47 / given | 今作回収Q、続編回収R、意図した未回収S、没T | `/cases/70/clauses/0` | 未取得 | not_run |
| AT-F47 / when | 今作/特定分岐の未回収を抽出し、Qの回収先を変えて確認待ちを調べる | `/cases/70/clauses/1` | 未取得 | not_run |
| AT-F47 / then | 続編用に残した謎が不具合一覧へ混ざらず、今作で回収する予定の漏れを見つけられる。 | `/cases/70/clauses/2` | 未取得 | not_run |
| AT-F47 / negative_or_edge | 今作・分岐・続編など対象範囲と意図を明示する。回収先変更時は再確認待ちにし、意図した未回収は警告の集計から分ける。 | `/cases/70/clauses/3` | 未取得 | not_run |
| AT-F48 / given | 時期で一人称が変わる人物と表記ゆれ用語、意図した例外 | `/cases/71/clauses/0` | 未取得 | not_run |
| AT-F48 / when | 時期前後の台詞と字幕/翻訳へ候補検査を行い、本文が無断置換されないか確認する | `/cases/71/clauses/1` | 未取得 | not_run |
| AT-F48 / then | 人物が成長して口調を変える場合は時期を指定する。指摘は候補として示し、本文を勝手に置換しない。 | `/cases/71/clauses/2` | 未取得 | not_run |
| AT-F48 / negative_or_edge | 表記・口調の期間と例外を保持する。指摘は置換候補であり、本文や翻訳を自動修正しない。 | `/cases/71/clauses/3` | 未取得 | not_run |
| AT-F49 / given | 企画に対象/体験/主題と版1の採用判断がある | `/cases/72/clauses/0` | 未取得 | not_run |
| AT-F49 / when | 修正指摘を企画目的へ結び付け、却下案の理由と版2の別判断を登録する | `/cases/72/clauses/1` | 未取得 | not_run |
| AT-F49 / then | 修正依頼から企画のどの目的に関わるかを確認できる。却下した案の理由も後から分かる。 | `/cases/72/clauses/2` | 未取得 | not_run |
| AT-F49 / negative_or_edge | 企画・判断には対象版と根拠を保存する。却下・保留を削除せず、方針変更を公開済み版へ自動反映しない。 | `/cases/72/clauses/3` | 未取得 | not_run |
| AT-F50 / given | 危険と説明する場面、実装仕様では無条件通過、意図は未入力 | `/cases/73/clauses/0` | 未取得 | not_run |
| AT-F50 / when | 探索/戦闘/報酬/チュートリアルと作業を関連付け、食い違いに意図を追記する | `/cases/73/clauses/1` | 未取得 | not_run |
| AT-F50 / then | 物語で危険な場所が、実際には安全に通れるなどの食い違いを、意図も含めて確認できる。 | `/cases/73/clauses/2` | 未取得 | not_run |
| AT-F50 / negative_or_edge | 遊びの仕様と物語の記述の差は意図付き確認候補にする。ゲーム機能の未実装を執筆未完了と混同しない。 | `/cases/73/clauses/3` | 未取得 | not_run |
| AT-F51 / given | 執筆done、実装todoの場面と現実の期限、素材待ち作業 | `/cases/74/clauses/0` | 未取得 | not_run |
| AT-F51 / when | 場面の世界日付を変更し未実装を抽出、作業依存の循環を作ろうとする | `/cases/74/clauses/1` | 未取得 | not_run |
| AT-F51 / then | 物語内の日付を変えても制作期限は動かない。本文が完成していても未実装の場面を抽出できる。 | `/cases/74/clauses/2` | 未取得 | not_run |
| AT-F51 / negative_or_edge | 執筆・実装・翻訳・収録・確認・公開の状態と実日付を別々に保存する。依存作業の循環と期限不整合を示す。 | `/cases/74/clauses/3` | 未取得 | not_run |
| AT-F52 / given | 二経路で共通場面一件を再利用し速度が未設定 | `/cases/75/clauses/0` | 未取得 | not_run |
| AT-F52 / when | 固有場面/台詞/素材数と各経路の出現数を集計し、速度を設定して時間を再見積もりする | `/cases/75/clauses/1` | 未取得 | not_run |
| AT-F52 / then | 二つの経路に出る共通場面を制作量では二重に数えない。所要時間は速度などの仮定を示す。 | `/cases/75/clauses/2` | 未取得 | not_run |
| AT-F52 / negative_or_edge | 制作数は安定IDの集合、体験量は経路ごとの出現回数で集計する。速度・重複・未確定箇所・対象版を明示する。 | `/cases/75/clauses/3` | 未取得 | not_run |
| AT-F53 / given | 台詞にコマと演出開始1000ms、世界tick -10がある | `/cases/76/clauses/0` | 未取得 | not_run |
| AT-F53 / when | コマから本文へ戻り、参考画像を完成素材へ差替え確認待ちを開く | `/cases/76/clauses/1` | 未取得 | not_run |
| AT-F53 / then | 物語の年月日と動画・演出内の秒数を混同しない。必要なコマから対象の本文へ戻れる。 | `/cases/76/clauses/2` | 未取得 | not_run |
| AT-F53 / negative_or_edge | 演出時刻はミリ秒、世界時刻は暦のtickとして分離する。素材差替え後は依存コマを確認待ちにする。 | `/cases/76/clauses/3` | 未取得 | not_run |
| AT-F54 / given | 共通設定版1を参照する公開済み小説/動画と未公開ゲーム | `/cases/77/clauses/0` | 未取得 | not_run |
| AT-F54 / when | 共通設定を版2へ改訂し、媒体ごとの変更候補と旧公開原稿を比較する | `/cases/77/clauses/1` | 未取得 | not_run |
| AT-F54 / then | 元設定を変えても各媒体の文章を自動で同じ文へ置換せず、公開済みの版と修正候補を比べられる。 | `/cases/77/clauses/2` | 未取得 | not_run |
| AT-F54 / negative_or_edge | 派生作品は共通設定の版を参照する。媒体別文章と公開済みスナップショットは保持し、変更候補だけを伝える。 | `/cases/77/clauses/3` | 未取得 | not_run |
| AT-F55 / given | 人物A→Bの信頼と時期/経路付き所属関係 | `/cases/78/clauses/0` | 未取得 | not_run |
| AT-F55 / when | 信頼の逆向き表示、時点切替え、図の自動整列を行い正本の関係を比較する | `/cases/78/clauses/1` | 未取得 | not_run |
| AT-F55 / then | 信頼する関係を逆向きにも自動適用しない。図の配置だけを変えても物語上の関係は変わらない。 | `/cases/78/clauses/2` | 未取得 | not_run |
| AT-F55 / negative_or_edge | 方向と時期・経路と根拠を検証する。自己関係を許す種類だけ認め、対称性や推移性を勝手に補わない。 | `/cases/78/clauses/3` | 未取得 | not_run |
| AT-F56 / given | 同名人物2名、参照型項目、既存enum値のある雛形 | `/cases/79/clauses/0` | 未取得 | not_run |
| AT-F56 / when | 改名、必須/nullable変更、enum→数値型の変更、型不正のファイル読み込みを試す | `/cases/79/clauses/1` | 未取得 | not_run |
| AT-F56 / then | 空欄を許す項目と必須を区別する。同名を許す範囲を決め、単なる改名で対応を壊さない。 | `/cases/79/clauses/2` | 未取得 | not_run |
| AT-F56 / negative_or_edge | 同名は原則許可しIDで識別する。キー項目だけ所定スコープで一意とする。型変更に適合しない値を消さず影響を示す。 | `/cases/79/clauses/3` | 未取得 | not_run |
| AT-F57 / given | 漢字名/読み/旧名/別名/同名/秘密名と作者が選んだ索引 | `/cases/80/clauses/0` | 未取得 | not_run |
| AT-F57 / when | 読みと表記ゆれで検索し五十音/分類索引から段落へ移り、公開索引を出力する | `/cases/80/clauses/1` | 未取得 | not_run |
| AT-F57 / then | 漢字名を読みから探せる。全文検索、作者が選ぶ索引、タグを区別し、秘密の名前は公開索引へ出さない。 | `/cases/80/clauses/2` | 未取得 | not_run |
| AT-F57 / negative_or_edge | 原文を保持し検索用正規化を別に持つ。作者索引と自動検索を分け、秘匿対象の読み・別名・参照数を公開側へ出さない。 | `/cases/80/clauses/3` | 未取得 | not_run |
| AT-F58 / given | 未実装かつ人物Aが出る動的一覧と固定ID一覧 | `/cases/81/clauses/0` | 未取得 | not_run |
| AT-F58 / when | 場面を追加し各一覧を再度開き、カード/表/図を切替え一括編集を取り消す | `/cases/81/clauses/1` | 未取得 | not_run |
| AT-F58 / then | 表示を変えても別のデータができない。検索を再実行する一覧と、固定した選択の一覧を区別する。 | `/cases/81/clauses/2` | 未取得 | not_run |
| AT-F58 / negative_or_edge | 動的条件一覧と固定ID集合の一覧を区別する。一括編集は変更前後を確認し、一部だけ失敗した更新を確定しない。 | `/cases/81/clauses/3` | 未取得 | not_run |
| AT-F59 / given | 人物/因果/伏線/進行/参照/制作依存が混在する情報 | `/cases/82/clauses/0` | 未取得 | not_run |
| AT-F59 / when | 種類別、一段/二段、凡例、関係表を切り替え、隠れた範囲を確認して全体へ戻る | `/cases/82/clauses/1` | 未取得 | not_run |
| AT-F59 / then | 矢印、ラベル、線種で意味を読める。表示を絞ったと分かり、全体や元の対象へ戻れる。 | `/cases/82/clauses/2` | 未取得 | not_run |
| AT-F59 / negative_or_edge | 凡例・線種・矢印・ラベルを持ち、色以外でも意味を伝える。表示範囲と隠れた件数を示すが公開側の秘密の件数は漏らさない。 | `/cases/82/clauses/3` | 未取得 | not_run |
| AT-F60 / given | 重複候補人物、未参照背景設定、外部利用状態、読み欠落 | `/cases/83/clauses/0` | 未取得 | not_run |
| AT-F60 / when | 残すIDと参照変更を確認して統合/取消し、保持指定と一括編集取消を行う | `/cases/83/clauses/1` | 未取得 | not_run |
| AT-F60 / then | 背景設定だけの項目は残せる。統合・一括変更・削除を取り消し、元の参照を追える。 | `/cases/83/clauses/2` | 未取得 | not_run |
| AT-F60 / negative_or_edge | 統合の残すIDと全参照書換えを事前表示する。背景設定・外部利用を保持指定でき、統合・削除・一括変更は補償操作で戻せる。 | `/cases/83/clauses/3` | 未取得 | not_run |
| AT-N01 / given | 幅320・390 CSS pxの縦画面 | `/cases/84/clauses/0` | 未取得 | not_run |
| AT-N01 / when | 入力と一覧による線編集と復元を行う | `/cases/84/clauses/1` | 未取得 | not_run |
| AT-N01 / then | 確定ボタンとエラーへ到達でき横図にも一覧代替がある | `/cases/84/clauses/2` | 未取得 | not_run |
| AT-N01 / negative_or_edge | PC専用操作やページ全体の不要な横スクロールを残さない | `/cases/84/clauses/3` | 未取得 | not_run |
| AT-N02 / given | UI_UXの対象端末表 | `/cases/85/clauses/0` | 未取得 | blocked |
| AT-N02 / when | 同じ総合試験を対象環境で実行する | `/cases/85/clauses/1` | 未取得 | blocked |
| AT-N02 / then | 保存・再読込・ファイル往復・タッチ操作が成功する | `/cases/85/clauses/2` | 未取得 | blocked |
| AT-N02 / negative_or_edge | 自動ブラウザー試験だけを実端末の合格証拠にしない | `/cases/85/clauses/3` | 未取得 | blocked |
| AT-N03 / given | キーボードとVoiceOverまたはNVDA | `/cases/86/clauses/0` | 未取得 | blocked |
| AT-N03 / when | 主な作成から出力まで操作する | `/cases/86/clauses/1` | 未取得 | blocked |
| AT-N03 / then | フォーカス・読み上げ・エラー・完了通知が判断できる | `/cases/86/clauses/2` | 未取得 | blocked |
| AT-N03 / negative_or_edge | 図だけで編集を強制せず、見える焦点や拡大を無効にしない | `/cases/86/clauses/3` | 未取得 | not_run |
| AT-N04 / given | 標準データと実測対象端末 | `/cases/87/clauses/0` | 未取得 | blocked |
| AT-N04 / when | 指定操作を30回ずつ実行する | `/cases/87/clauses/1` | 未取得 | blocked |
| AT-N04 / then | 記録した条件で全目標値を満たす | `/cases/87/clauses/2` | 未取得 | blocked |
| AT-N04 / negative_or_edge | 実測前の数値を達成済みとしない。超過を要件削減で黙って隠さない | `/cases/87/clauses/3` | 未取得 | not_run |
| AT-N05 / given | 大規模データと長い分岐 | `/cases/88/clauses/0` | 未取得 | not_run |
| AT-N05 / when | 探索を打ち切り別の画面へ移る | `/cases/88/clauses/1` | 未取得 | not_run |
| AT-N05 / then | 編集中の内容を保ち結果を未確認として開ける | `/cases/88/clauses/2` | 未取得 | not_run |
| AT-N05 / negative_or_edge | 探索の途中終了を全経路の安全証明にしない | `/cases/88/clauses/3` | 未取得 | not_run |
| AT-N06 / given | 保存中の容量不足と移行失敗を注入 | `/cases/89/clauses/0` | 未取得 | not_run |
| AT-N06 / when | 複数対象の変更を試す | `/cases/89/clauses/1` | 未取得 | not_run |
| AT-N06 / then | 全変更が確定するか全変更が未確定となり再試行できる | `/cases/89/clauses/2` | 未取得 | not_run |
| AT-N06 / negative_or_edge | 一部更新・未検証のマイグレーション・偽の保存表示を残さない | `/cases/89/clauses/3` | 未取得 | not_run |
| AT-N07 / given | オフラインの二端末 | `/cases/90/clauses/0` | 未取得 | blocked |
| AT-N07 / when | 同じ本文を変更し順不同で同期する | `/cases/90/clauses/1` | 未取得 | blocked |
| AT-N07 / then | 二案を比較して解決でき再送しても効果が二重化しない | `/cases/90/clauses/2` | 未取得 | blocked |
| AT-N07 / negative_or_edge | 端末時計や最終書込だけで片方を消さない | `/cases/90/clauses/3` | 未取得 | blocked |
| AT-N08 / given | 非メンバーと限定閲覧者 | `/cases/91/clauses/0` | 未取得 | blocked |
| AT-N08 / when | 直接APIと検索と素材へアクセスする | `/cases/91/clauses/1` | 未取得 | blocked |
| AT-N08 / then | 許可した投影以外の本文・名称・ID・メタデータが取得できない | `/cases/91/clauses/2` | 未取得 | blocked |
| AT-N08 / negative_or_edge | secretキーの公開、UIのみの非表示、他作品のID差替えを許さない | `/cases/91/clauses/3` | 未取得 | blocked |
| AT-N09 / given | 破損・未対応版・参照切れ・圧縮爆弾のファイル | `/cases/92/clauses/0` | 未取得 | not_run |
| AT-N09 / when | 既存作品へ読み込もうとする | `/cases/92/clauses/1` | 未取得 | not_run |
| AT-N09 / then | 既存データは不変で対象パスと理由が示される | `/cases/92/clauses/2` | 未取得 | not_run |
| AT-N09 / negative_or_edge | 一時解析の失敗を既存作品の一部置換として残さない | `/cases/92/clauses/3` | 未取得 | not_run |
| AT-N10 / given | scriptやjavascript URLを含む文章 | `/cases/93/clauses/0` | 未取得 | not_run |
| AT-N10 / when | 編集・試読・公開資料で表示する | `/cases/93/clauses/1` | 未取得 | not_run |
| AT-N10 / then | 内容を安全なテキストまたは検査済み表示として扱う | `/cases/93/clauses/2` | 未取得 | not_run |
| AT-N10 / negative_or_edge | ファイル名だけの種類判定や任意コードの条件実行を許さない | `/cases/93/clauses/3` | 未取得 | not_run |
| AT-N11 / given | 取得済み作品で機内モードにする | `/cases/94/clauses/0` | 未取得 | not_run |
| AT-N11 / when | 編集して閉じ再度開き専用ファイルを出す | `/cases/94/clauses/1` | 未取得 | not_run |
| AT-N11 / then | 端末内保存済みと未送信が区別され作品内容が残る | `/cases/94/clauses/2` | 未取得 | not_run |
| AT-N11 / negative_or_edge | 初回取得や未キャッシュ添付を利用済みと偽表示しない | `/cases/94/clauses/3` | 未取得 | not_run |
| AT-N12 / given | 同じ版の抽選を含む経路 | `/cases/95/clauses/0` | 未取得 | not_run |
| AT-N12 / when | 確認記録から再実行する | `/cases/95/clauses/1` | 未取得 | not_run |
| AT-N12 / then | 同じ条件の結果が再現され版変更時は要再確認となる | `/cases/95/clauses/2` | 未取得 | not_run |
| AT-N12 / negative_or_edge | 新しい版の結果を古い版の合格証跡として扱わない | `/cases/95/clauses/3` | 未取得 | not_run |
| AT-N13 / given | 日本語変換途中と負の巨大tick | `/cases/96/clauses/0` | 未取得 | blocked |
| AT-N13 / when | 保存・検索・出力・読み戻しを行う | `/cases/96/clauses/1` | 未取得 | blocked |
| AT-N13 / then | 原文とIDとtick文字列が完全一致する | `/cases/96/clauses/2` | 未取得 | not_run |
| AT-N13 / negative_or_edge | IME変換を操作キーで確定前に破壊したり、tickを浮動小数で丸めない | `/cases/96/clauses/3` | 未取得 | blocked |
| AT-N14 / given | 端末内データを失った空環境 | `/cases/97/clauses/0` | 未取得 | not_run |
| AT-N14 / when | 完全保存ファイルを読み込む | `/cases/97/clauses/1` | 未取得 | not_run |
| AT-N14 / then | 本文・ID・条件・素材を保って編集を再開できる | `/cases/97/clauses/2` | 未取得 | not_run |
| AT-N14 / negative_or_edge | 端末内履歴だけを外部バックアップの代わりとして保証しない | `/cases/97/clauses/3` | 未取得 | not_run |
| AT-N15 / given | 認証エラーと本文を含む失敗 | `/cases/98/clauses/0` | 未取得 | not_run |
| AT-N15 / when | 診断を生成して内容を確認する | `/cases/98/clauses/1` | 未取得 | not_run |
| AT-N15 / then | 必要な識別情報だけが出力され送信前に利用者が選べる | `/cases/98/clauses/2` | 未取得 | not_run |
| AT-N15 / negative_or_edge | ログや分析サービスへ作品本文を自動送信しない | `/cases/98/clauses/3` | 未取得 | not_run |
| AT-N16 / given | 同じ条件を異なる表示から編集する | `/cases/99/clauses/0` | 未取得 | not_run |
| AT-N16 / when | 純粋な評価処理とUI統合を実行する | `/cases/99/clauses/1` | 未取得 | not_run |
| AT-N16 / then | 同じ規則とエラーコードが得られる | `/cases/99/clauses/2` | 未取得 | not_run |
| AT-N16 / negative_or_edge | 画面ごとに別の条件評価や独自のID管理を作らない | `/cases/99/clauses/3` | 未取得 | not_run |
| AT-N17 / given | 公開候補の構成と見積表 | `/cases/100/clauses/0` | 未取得 | blocked |
| AT-N17 / when | サブパス・直リンク・更新・再読込を確認する | `/cases/100/clauses/1` | 未取得 | not_run |
| AT-N17 / then | 表示版が対象commitと一致し費用の有無を確認できる | `/cases/100/clauses/2` | 未取得 | blocked |
| AT-N17 / negative_or_edge | この資料の作成だけで公開済みや費用ゼロと宣言しない | `/cases/100/clauses/3` | 未取得 | not_run |
| AT-N18 / given | 保存・参照・同期の失敗 | `/cases/101/clauses/0` | 未取得 | not_run |
| AT-N18 / when | 修正または再試行を行う | `/cases/101/clauses/1` | 未取得 | not_run |
| AT-N18 / then | 同じ入力から復帰し成功時だけ完了と表示する | `/cases/101/clauses/2` | 未取得 | not_run |
| AT-N18 / negative_or_edge | 白画面・無言の失敗・黙ったデータ削除を残さない | `/cases/101/clauses/3` | 未取得 | not_run |
| AT-N19 / given | 公開済み作品と別案がある | `/cases/102/clauses/0` | 未取得 | not_run |
| AT-N19 / when | 改訂して制作出力を行う | `/cases/102/clauses/1` | 未取得 | not_run |
| AT-N19 / then | 選択した正本版だけが対象となり旧公開版は不変で残る | `/cases/102/clauses/2` | 未取得 | not_run |
| AT-N19 / negative_or_edge | 別案の編集で公開済み本文や参照設定を上書きしない | `/cases/102/clauses/3` | 未取得 | not_run |
| AT-N20 / given | 未対応の外部コマンドがある作品 | `/cases/103/clauses/0` | 未取得 | not_run |
| AT-N20 / when | 対応先別の制作出力を選ぶ | `/cases/103/clauses/1` | 未取得 | not_run |
| AT-N20 / then | 不一致の箇所を示し安全な出力だけを生成する | `/cases/103/clauses/2` | 未取得 | not_run |
| AT-N20 / negative_or_edge | Unity・Unreal・ink・Yarn等すべてに対応済みと仮定しない | `/cases/103/clauses/3` | 未取得 | not_run |
| AT-E01 / given | iPhone縦画面と空作品 | `/cases/104/clauses/0` | 未取得 | blocked |
| AT-E01 / when | 人物2名、共通/個人出来事、場所、線、括弧付き条件を作成して専用ファイルを書き出し読み戻す | `/cases/104/clauses/1` | 未取得 | blocked |
| AT-E01 / then | PCを使わずIDと内容が一致し再編集できる | `/cases/104/clauses/2` | 未取得 | blocked |
| AT-E01 / negative_or_edge | 入力中のキーボード、横画面、取消、Filesのキャンセルでも入力を失わない | `/cases/104/clauses/3` | 未取得 | blocked |
| AT-E02 / given | 世界tick -10の出来事を後章で回想する作品 | `/cases/105/clauses/0` | 未取得 | not_run |
| AT-E02 / when | 表示単位、本編基準点、回想章順をそれぞれ変更する | `/cases/105/clauses/1` | 未取得 | not_run |
| AT-E02 / then | 世界tickは不変、相対表示と開示順だけが所定に変わる | `/cases/105/clauses/2` | 未取得 | not_run |
| AT-E02 / negative_or_edge | 暦の存在しない日付と相対制約循環は拒否される | `/cases/105/clauses/3` | 未取得 | not_run |
| AT-E03 / given | 鍵取得/未取得が同じ合流先へ続く固定作品 | `/cases/106/clauses/0` | 未取得 | not_run |
| AT-E03 / when | 二経路を実行し戻す、禁止遷移を含む一括効果を選ぶ | `/cases/106/clauses/1` | 未取得 | not_run |
| AT-E03 / then | 合流後も鍵差が残り、戻すと全状態が復元され、不正効果は全体拒否となる | `/cases/106/clauses/2` | 未取得 | not_run |
| AT-E03 / negative_or_edge | 未知の値は偽にされず、有効選択肢ゼロは意図した終端と区別される | `/cases/106/clauses/3` | 未取得 | not_run |
| AT-E04 / given | 必須手掛かりを飛ばせる経路と嘘の証言と続編の謎 | `/cases/107/clauses/0` | 未取得 | not_run |
| AT-E04 / when | 真相へ行く二経路を解析する | `/cases/107/clauses/1` | 未取得 | not_run |
| AT-E04 / then | 手掛かり欠落の証人経路を示し、人物の認識と真実を区別し続編謎を別集計する | `/cases/107/clauses/2` | 未取得 | not_run |
| AT-E04 / negative_or_edge | 理解したと判定せず、外部条件を含む経路は未確認とする | `/cases/107/clauses/3` | 未取得 | not_run |
| AT-E05 / given | 非公開の本名と家系と添付がある限定共有snapshot | `/cases/108/clauses/0` | 未取得 | blocked |
| AT-E05 / when | 閲覧者が本文、検索、索引、図、リンク、素材、直接APIを調べる | `/cases/108/clauses/1` | 未取得 | blocked |
| AT-E05 / then | 許可した別名だけが出て秘密のID・名前・関係・件数・ファイル名が取得できない | `/cases/108/clauses/2` | 未取得 | blocked |
| AT-E05 / negative_or_edge | IDやproject_idを差替えたアクセスと権限撤回後の新規取得は拒否する | `/cases/108/clauses/3` | 未取得 | blocked |
| AT-E06 / given | 共通revisionを取得した二端末 | `/cases/109/clauses/0` | 未取得 | blocked |
| AT-E06 / when | 両方オフラインで同じ本文を編集、片方削除、重複と順逆で送信する | `/cases/109/clauses/1` | 未取得 | blocked |
| AT-E06 / then | 双方と共通元を比較でき、解決後は同じ結果、二重効果と勝手な復活はない | `/cases/109/clauses/2` | 未取得 | blocked |
| AT-E06 / negative_or_edge | 容量不足と認証失効時にも未送信を失わず、同期済みと表示しない | `/cases/109/clauses/3` | 未取得 | blocked |
| AT-E07 / given | 全entity種・未知日時・巨大tick・素材を含む作品 | `/cases/110/clauses/0` | 未取得 | not_run |
| AT-E07 / when | 空環境へ全情報往復し、別途ハッシュ不一致/参照切れ/危険パス/未対応版を投入する | `/cases/110/clauses/1` | 未取得 | not_run |
| AT-E07 / then | 正規化した保存情報が一致し、不正ファイルは既存作品を一切変えない | `/cases/110/clauses/2` | 未取得 | not_run |
| AT-E07 / negative_or_edge | 安全上限直前・直後、添付重複、ID衝突を確認する | `/cases/110/clauses/3` | 未取得 | not_run |
| AT-E08 / given | 原文と翻訳と音声が確認済みの台詞 | `/cases/111/clauses/0` | 未取得 | not_run |
| AT-E08 / when | 改名/並替え、原文編集、分割、差戻しを行う | `/cases/111/clauses/1` | 未取得 | not_run |
| AT-E08 / then | 音声取り違えがなく内容変更時だけ見直し対象となり分割対応履歴を追える | `/cases/111/clauses/2` | 未取得 | not_run |
| AT-E08 / negative_or_edge | 取消や単体復元も新revisionとなり古い成果物を自動確認済みにしない | `/cases/111/clauses/3` | 未取得 | not_run |
| AT-E09 / given | 二経路で再利用する場面と公開済み小説版 | `/cases/112/clauses/0` | 未取得 | not_run |
| AT-E09 / when | 世界設定改訂と制作集計、場面の日付変更を行う | `/cases/112/clauses/1` | 未取得 | not_run |
| AT-E09 / then | 固有制作数は一回、体験量は各経路で算出し、小説旧版と実期限は不変 | `/cases/112/clauses/2` | 未取得 | not_run |
| AT-E09 / negative_or_edge | 未設定速度の所要時間は不明とし、執筆済でも実装未完了を抽出する | `/cases/112/clauses/3` | 未取得 | not_run |
| AT-E10 / given | 抽選・無制限ループ・外部戦闘を含む作品 | `/cases/113/clauses/0` | 未取得 | not_run |
| AT-E10 / when | 同じ記録を再実行して探索上限まで解析する | `/cases/113/clauses/1` | 未取得 | not_run |
| AT-E10 / then | 抽選は再現され、未確認の範囲と分母を示し、仮戦闘結果と実ゲーム結果を別に記録する | `/cases/113/clauses/2` | 未取得 | not_run |
| AT-E10 / negative_or_edge | 対象版の変更で再確認待ちになり、打切りを到達不能の証明としない | `/cases/113/clauses/3` | 未取得 | not_run |
| AT-E11 / given | 標準/大規模データと対象ブラウザー表 | `/cases/114/clauses/0` | 未取得 | blocked |
| AT-E11 / when | キーボード、VoiceOver、200%拡大、狭い幅、図の一覧代替、指定性能を測定する | `/cases/114/clauses/1` | 未取得 | blocked |
| AT-E11 / then | 全操作へ到達でき所定環境の測定結果と証拠を残す | `/cases/114/clauses/2` | 未取得 | blocked |
| AT-E11 / negative_or_edge | 色依存・ドラッグ専用・焦点喪失・IME破壊・全件DOM描画を検出する | `/cases/114/clauses/3` | 未取得 | blocked |
| AT-E12 / given | キャッシュ済みアプリと未送信作品 | `/cases/115/clauses/0` | 未取得 | not_run |
| AT-E12 / when | 機内モード、保存容量不足、途中更新、移行失敗、専用出力からの再開を行う | `/cases/115/clauses/1` | 未取得 | not_run |
| AT-E12 / then | 失敗と未保存を明示し、更新は安全地点で適用し、書き出しと復元で再開できる | `/cases/115/clauses/2` | 未取得 | not_run |
| AT-E12 / negative_or_edge | 初回未取得・未取得素材・保存先取消を成功と扱わない | `/cases/115/clauses/3` | 未取得 | blocked |

## 原104要件の対応

| 原ID | Tの原文・case対応 | 今回の合格証拠 |
| --- | --- | --- |
| REQ-B01 | `/requirements/0` → AT-B01 | 未取得 / not_run |
| REQ-B02 | `/requirements/1` → AT-B02 | 未取得 / not_run |
| REQ-B03 | `/requirements/2` → AT-B03 | 未取得 / not_run |
| REQ-B04 | `/requirements/3` → AT-B04 | 未取得 / not_run |
| REQ-B05 | `/requirements/4` → AT-B05 | 未取得 / not_run |
| REQ-B06 | `/requirements/5` → AT-B06 | 未取得 / not_run |
| REQ-B07 | `/requirements/6` → AT-B07 | 未取得 / not_run |
| REQ-B08 | `/requirements/7` → AT-B08 | 未取得 / not_run |
| REQ-B09 | `/requirements/8` → AT-B09 | 未取得 / not_run |
| REQ-B10 | `/requirements/9` → AT-B10 | 未取得 / not_run |
| REQ-B11 | `/requirements/10` → AT-B11 | 未取得 / not_run |
| REQ-B12 | `/requirements/11` → AT-B12 | 未取得 / not_run |
| REQ-B13 | `/requirements/12` → AT-B13 | 未取得 / not_run |
| REQ-B14 | `/requirements/13` → AT-B14 | 未取得 / not_run |
| REQ-B15 | `/requirements/14` → AT-B15 | 未取得 / not_run |
| REQ-B16 | `/requirements/15` → AT-B16 | 未取得 / not_run |
| REQ-B17 | `/requirements/16` → AT-B17 | 未取得 / not_run |
| REQ-B18 | `/requirements/17` → AT-B18 | 未取得 / not_run |
| REQ-B19 | `/requirements/18` → AT-B19 | 未取得 / not_run |
| REQ-B20 | `/requirements/19` → AT-B20 | 未取得 / not_run |
| REQ-B21 | `/requirements/20` → AT-B21 | 未取得 / not_run |
| REQ-B22 | `/requirements/21` → AT-B22 | 未取得 / not_run |
| REQ-B23 | `/requirements/22` → AT-B23 | 未取得 / not_run |
| REQ-B24 | `/requirements/23` → AT-B24 | 未取得 / not_run |
| REQ-F01 | `/requirements/24` → AT-F01 | 未取得 / not_run |
| REQ-F02 | `/requirements/25` → AT-F02 | 未取得 / not_run |
| REQ-F03 | `/requirements/26` → AT-F03 | 未取得 / not_run |
| REQ-F04 | `/requirements/27` → AT-F04 | 未取得 / not_run |
| REQ-F05 | `/requirements/28` → AT-F05 | 未取得 / not_run |
| REQ-F06 | `/requirements/29` → AT-F06 | 未取得 / not_run |
| REQ-F07 | `/requirements/30` → AT-F07 | 未取得 / not_run |
| REQ-F08 | `/requirements/31` → AT-F08 | 未取得 / not_run |
| REQ-F09 | `/requirements/32` → AT-F09 | 未取得 / not_run |
| REQ-F10 | `/requirements/33` → AT-F10 | 未取得 / not_run |
| REQ-F11 | `/requirements/34` → AT-F11 | 未取得 / not_run |
| REQ-F12 | `/requirements/35` → AT-F12 | 未取得 / not_run |
| REQ-F13 | `/requirements/36` → AT-F13 | 未取得 / not_run |
| REQ-F14 | `/requirements/37` → AT-F14 | 未取得 / not_run |
| REQ-F15 | `/requirements/38` → AT-F15 | 未取得 / not_run |
| REQ-F16 | `/requirements/39` → AT-F16 | 未取得 / not_run |
| REQ-F17 | `/requirements/40` → AT-F17 | 未取得 / not_run |
| REQ-F18 | `/requirements/41` → AT-F18 | 未取得 / not_run |
| REQ-F19 | `/requirements/42` → AT-F19 | 未取得 / not_run |
| REQ-F20 | `/requirements/43` → AT-F20 | 未取得 / not_run |
| REQ-F21 | `/requirements/44` → AT-F21 | 未取得 / not_run |
| REQ-F22 | `/requirements/45` → AT-F22 | 未取得 / not_run |
| REQ-F23 | `/requirements/46` → AT-F23 | 未取得 / not_run |
| REQ-F24 | `/requirements/47` → AT-F24 | 未取得 / not_run |
| REQ-F25 | `/requirements/48` → AT-F25 | 未取得 / not_run |
| REQ-F26 | `/requirements/49` → AT-F26 | 未取得 / not_run |
| REQ-F27 | `/requirements/50` → AT-F27 | 未取得 / not_run |
| REQ-F28 | `/requirements/51` → AT-F28 | 未取得 / not_run |
| REQ-F29 | `/requirements/52` → AT-F29 | 未取得 / not_run |
| REQ-F30 | `/requirements/53` → AT-F30 | 未取得 / not_run |
| REQ-F31 | `/requirements/54` → AT-F31 | 未取得 / not_run |
| REQ-F32 | `/requirements/55` → AT-F32 | 未取得 / not_run |
| REQ-F33 | `/requirements/56` → AT-F33 | 未取得 / not_run |
| REQ-F34 | `/requirements/57` → AT-F34 | 未取得 / not_run |
| REQ-F35 | `/requirements/58` → AT-F35 | 未取得 / not_run |
| REQ-F36 | `/requirements/59` → AT-F36 | 未取得 / not_run |
| REQ-F37 | `/requirements/60` → AT-F37 | 未取得 / not_run |
| REQ-F38 | `/requirements/61` → AT-F38 | 未取得 / not_run |
| REQ-F39 | `/requirements/62` → AT-F39 | 未取得 / not_run |
| REQ-F40 | `/requirements/63` → AT-F40 | 未取得 / not_run |
| REQ-F41 | `/requirements/64` → AT-F41 | 未取得 / not_run |
| REQ-F42 | `/requirements/65` → AT-F42 | 未取得 / not_run |
| REQ-F43 | `/requirements/66` → AT-F43 | 未取得 / not_run |
| REQ-F44 | `/requirements/67` → AT-F44 | 未取得 / not_run |
| REQ-F45 | `/requirements/68` → AT-F45 | 未取得 / not_run |
| REQ-F46 | `/requirements/69` → AT-F46 | 未取得 / not_run |
| REQ-F47 | `/requirements/70` → AT-F47 | 未取得 / not_run |
| REQ-F48 | `/requirements/71` → AT-F48 | 未取得 / not_run |
| REQ-F49 | `/requirements/72` → AT-F49 | 未取得 / not_run |
| REQ-F50 | `/requirements/73` → AT-F50 | 未取得 / not_run |
| REQ-F51 | `/requirements/74` → AT-F51 | 未取得 / not_run |
| REQ-F52 | `/requirements/75` → AT-F52 | 未取得 / not_run |
| REQ-F53 | `/requirements/76` → AT-F53 | 未取得 / not_run |
| REQ-F54 | `/requirements/77` → AT-F54 | 未取得 / not_run |
| REQ-F55 | `/requirements/78` → AT-F55 | 未取得 / not_run |
| REQ-F56 | `/requirements/79` → AT-F56 | 未取得 / not_run |
| REQ-F57 | `/requirements/80` → AT-F57 | 未取得 / not_run |
| REQ-F58 | `/requirements/81` → AT-F58 | 未取得 / not_run |
| REQ-F59 | `/requirements/82` → AT-F59 | 未取得 / not_run |
| REQ-F60 | `/requirements/83` → AT-F60 | 未取得 / not_run |
| REQ-N01 | `/requirements/84` → AT-N01 | 未取得 / not_run |
| REQ-N02 | `/requirements/85` → AT-N02 | 未取得 / not_run |
| REQ-N03 | `/requirements/86` → AT-N03 | 未取得 / not_run |
| REQ-N04 | `/requirements/87` → AT-N04 | 未取得 / not_run |
| REQ-N05 | `/requirements/88` → AT-N05 | 未取得 / not_run |
| REQ-N06 | `/requirements/89` → AT-N06 | 未取得 / not_run |
| REQ-N07 | `/requirements/90` → AT-N07 | 未取得 / not_run |
| REQ-N08 | `/requirements/91` → AT-N08 | 未取得 / not_run |
| REQ-N09 | `/requirements/92` → AT-N09 | 未取得 / not_run |
| REQ-N10 | `/requirements/93` → AT-N10 | 未取得 / not_run |
| REQ-N11 | `/requirements/94` → AT-N11 | 未取得 / not_run |
| REQ-N12 | `/requirements/95` → AT-N12 | 未取得 / not_run |
| REQ-N13 | `/requirements/96` → AT-N13 | 未取得 / not_run |
| REQ-N14 | `/requirements/97` → AT-N14 | 未取得 / not_run |
| REQ-N15 | `/requirements/98` → AT-N15 | 未取得 / not_run |
| REQ-N16 | `/requirements/99` → AT-N16 | 未取得 / not_run |
| REQ-N17 | `/requirements/100` → AT-N17 | 未取得 / not_run |
| REQ-N18 | `/requirements/101` → AT-N18 | 未取得 / not_run |
| REQ-N19 | `/requirements/102` → AT-N19 | 未取得 / not_run |
| REQ-N20 | `/requirements/103` → AT-N20 | 未取得 / not_run |

## 原24工程のlocal gateと依存込みgate

| 原工程 | Tのdeliverables・completion_gate・依存 | 依存 | local / whole |
| --- | --- | --- | --- |
| WP01 | `/work_packages/0` | なし | not_run / blocked |
| WP02 | `/work_packages/1` | WP01 | not_run / blocked |
| WP03 | `/work_packages/2` | WP01, WP02 | not_run / blocked |
| WP04 | `/work_packages/3` | WP01, WP02, WP03 | not_run / blocked |
| WP05 | `/work_packages/4` | WP04 | not_run / blocked |
| WP06 | `/work_packages/5` | WP04 | not_run / blocked |
| WP07 | `/work_packages/6` | WP02, WP05, WP06 | not_run / blocked |
| WP08 | `/work_packages/7` | WP05, WP06, WP07 | not_run / blocked |
| WP09 | `/work_packages/8` | WP06, WP08 | not_run / blocked |
| WP10 | `/work_packages/9` | WP05, WP06 | not_run / blocked |
| WP11 | `/work_packages/10` | WP01, WP04, WP05 | not_run / blocked |
| WP12 | `/work_packages/11` | WP08, WP10, WP11 | not_run / blocked |
| WP13 | `/work_packages/12` | WP11, WP12 | not_run / blocked |
| WP14 | `/work_packages/13` | WP13 | not_run / blocked |
| WP15 | `/work_packages/14` | WP09, WP10, WP13, WP14 | not_run / blocked |
| WP16 | `/work_packages/15` | WP03, WP09, WP10, WP15 | not_run / blocked |
| WP17 | `/work_packages/16` | WP03, WP16 | not_run / blocked |
| WP18 | `/work_packages/17` | WP05, WP09, WP15, WP17 | not_run / blocked |
| WP19 | `/work_packages/18` | WP10, WP12, WP18 | not_run / blocked |
| WP20 | `/work_packages/19` | WP18, WP19 | not_run / blocked |
| WP21 | `/work_packages/20` | WP10, WP14, WP19, WP20 | not_run / blocked |
| WP22 | `/work_packages/21` | WP16, WP18, WP19, WP20, WP21 | not_run / blocked |
| WP23 | `/work_packages/22` | WP07, WP08, WP14, WP15, WP17, WP18, WP22 | not_run / blocked |
| WP24 | `/work_packages/23` | WP23 | not_run / blocked |

## 原6回帰群

| 原ID | Tのgiven・全steps・expected・environment | 判定 |
| --- | --- | --- |
| RG-R01 | `/regression_groups/0` | not_run / 全手順・全環境の同一F原本なし |
| RG-R02 | `/regression_groups/1` | not_run / 全手順・全環境の同一F原本なし |
| RG-R03 | `/regression_groups/2` | not_run / 全手順・全環境の同一F原本なし |
| RG-R04 | `/regression_groups/3` | not_run / 全手順・全環境の同一F原本なし |
| RG-R05 | `/regression_groups/4` | not_run / 全手順・全環境の同一F原本なし |
| RG-R06 | `/regression_groups/5` | not_run / 全手順・全環境の同一F原本なし |

## 原68補助

| 原ID | Tの原文 | 分類 | 判定 |
| --- | --- | --- | --- |
| AC-G01-N | `/supplemental/0` | existing_G | not_run |
| AC-G01-E | `/supplemental/1` | existing_G | not_run |
| AC-G02-N | `/supplemental/2` | existing_G | not_run |
| AC-G02-E | `/supplemental/3` | existing_G | not_run |
| AC-G03-N | `/supplemental/4` | existing_G | not_run |
| AC-G03-E | `/supplemental/5` | existing_G | not_run |
| AC-G04-N | `/supplemental/6` | existing_G | not_run |
| AC-G04-E | `/supplemental/7` | existing_G | not_run |
| AC-G05-N | `/supplemental/8` | existing_G | not_run |
| AC-G05-E | `/supplemental/9` | existing_G | not_run |
| AC-G06-N | `/supplemental/10` | existing_G | not_run |
| AC-G06-E | `/supplemental/11` | existing_G | not_run |
| AC-G07-N | `/supplemental/12` | existing_G | not_run |
| AC-G07-E | `/supplemental/13` | existing_G | not_run |
| AC-G08-N | `/supplemental/14` | existing_G | not_run |
| AC-G08-E | `/supplemental/15` | existing_G | not_run |
| AC-G09-N | `/supplemental/16` | existing_G | not_run |
| AC-G09-E | `/supplemental/17` | existing_G | not_run |
| AC-G10-N | `/supplemental/18` | existing_G | not_run |
| AC-G10-E | `/supplemental/19` | existing_G | not_run |
| AC-G11-N | `/supplemental/20` | existing_G | not_run |
| AC-G11-E | `/supplemental/21` | existing_G | not_run |
| AC-G12-N | `/supplemental/22` | existing_G | not_run |
| AC-G12-E | `/supplemental/23` | existing_G | not_run |
| AC-G13-N | `/supplemental/24` | existing_G | not_run |
| AC-G13-E | `/supplemental/25` | existing_G | not_run |
| AC-G14-N | `/supplemental/26` | existing_G | not_run |
| AC-G14-E | `/supplemental/27` | existing_G | not_run |
| AC-G15-N | `/supplemental/28` | existing_G | not_run |
| AC-G15-E | `/supplemental/29` | existing_G | not_run |
| AC-G16-N | `/supplemental/30` | existing_G | not_run |
| AC-G16-E | `/supplemental/31` | existing_G | not_run |
| AC-X01-N | `/supplemental/32` | unadopted_X | not_adopted |
| AC-X01-E | `/supplemental/33` | unadopted_X | not_adopted |
| AC-X01-B | `/supplemental/34` | unadopted_X | not_adopted |
| AC-X02-N | `/supplemental/35` | unadopted_X | not_adopted |
| AC-X02-E | `/supplemental/36` | unadopted_X | not_adopted |
| AC-X02-B | `/supplemental/37` | unadopted_X | not_adopted |
| AC-X03-N | `/supplemental/38` | unadopted_X | not_adopted |
| AC-X03-E | `/supplemental/39` | unadopted_X | not_adopted |
| AC-X03-B | `/supplemental/40` | unadopted_X | not_adopted |
| AC-X04-N | `/supplemental/41` | unadopted_X | not_adopted |
| AC-X04-E | `/supplemental/42` | unadopted_X | not_adopted |
| AC-X04-B | `/supplemental/43` | unadopted_X | not_adopted |
| AC-X05-N | `/supplemental/44` | unadopted_X | not_adopted |
| AC-X05-E | `/supplemental/45` | unadopted_X | not_adopted |
| AC-X05-B | `/supplemental/46` | unadopted_X | not_adopted |
| AC-X06-N | `/supplemental/47` | unadopted_X | not_adopted |
| AC-X06-E | `/supplemental/48` | unadopted_X | not_adopted |
| AC-X06-B | `/supplemental/49` | unadopted_X | not_adopted |
| AC-X07-N | `/supplemental/50` | unadopted_X | not_adopted |
| AC-X07-E | `/supplemental/51` | unadopted_X | not_adopted |
| AC-X07-B | `/supplemental/52` | unadopted_X | not_adopted |
| AC-X08-N | `/supplemental/53` | unadopted_X | not_adopted |
| AC-X08-E | `/supplemental/54` | unadopted_X | not_adopted |
| AC-X08-B | `/supplemental/55` | unadopted_X | not_adopted |
| AC-X09-N | `/supplemental/56` | unadopted_X | not_adopted |
| AC-X09-E | `/supplemental/57` | unadopted_X | not_adopted |
| AC-X09-B | `/supplemental/58` | unadopted_X | not_adopted |
| AC-X10-N | `/supplemental/59` | unadopted_X | not_adopted |
| AC-X10-E | `/supplemental/60` | unadopted_X | not_adopted |
| AC-X10-B | `/supplemental/61` | unadopted_X | not_adopted |
| AC-X11-N | `/supplemental/62` | unadopted_X | not_adopted |
| AC-X11-E | `/supplemental/63` | unadopted_X | not_adopted |
| AC-X11-B | `/supplemental/64` | unadopted_X | not_adopted |
| AC-X12-N | `/supplemental/65` | unadopted_X | not_adopted |
| AC-X12-E | `/supplemental/66` | unadopted_X | not_adopted |
| AC-X12-B | `/supplemental/67` | unadopted_X | not_adopted |
