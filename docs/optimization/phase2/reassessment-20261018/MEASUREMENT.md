# 計測定義・全結果・失敗と限界

測定sourceは `d963f3d1f6b75337a432b0ece3ce087184f78e75` / tree `d6b72a68c0e472facfac102771fd7225f2d0a4fc`。321 sourceファイルの実bytes/SHAとGit commit/tree/blobの証明を両runへ保持。製品src treeはmainと同じ。Node 24.19.0のsource直接実行であり、製品UIビルドの性能ではない。

## 定義

元Standard `standard-r06-v1` は8800記録/6258972 JSON bytes、Large `large-material-rb10-v1` は88003記録/59407368 JSON bytesと実75497472素材bytes。元fixtureのSHAと3素材のSHAを前後で検査した。Standardの元SHAはJSON挿入順、Largeの元SHAはcanonical JSONであり、その2契約と別のwireJsonSha256を混同しない。入力生成・素材照合・不変捕捉・結果digest/比較・終了は区間外。session生成費用は別raw。

3方式×30反復×6query×2サイズ = **1080 OFF elapsed値**、180研究sessionである。原180保存とは無関係。各反復で新sessionを作り、current/corpus/resultsの実行順を反復番号mod3で交代。queryは順に `霧`、`霧の`、`門番`、`記録`、`霧`、`霧の`。全queryの件数とID/順序SHAを現行全件結果へ照合。Standardは6700/6700/20/6700/6700/6700、Largeは67000/67000/200/67000/67000/67000件。独立小期待値と意味差分の反例も別テストで検査する。

performance.nowはquery呼出の直前/直後。AのUTF8計数/Map費用、Bのquery key/clone/LRU費用は含む。外のsetupは含まない。3方式それぞれ8owner照合のwrapperを含み、現行対照はその中から元filterを呼ぶ。OFFが時間、別新sessionのONが仕事量である。ON時間をOFFへ足さない。p95は元と同じnearest-rank `ceil(0.95*n)-1`、各区間n=30。以下は表示だけ小数3桁、全浮動小数はJSON/CSVに保存。

## OFF p95 (ms)

| サイズ | query位置 | 現行 | A コーパス | B 結果LRU |
| --- | --- | ---: | ---: | ---: |
| standard | 0: 霧 | 65.142 | 77.159 | 72.930 |
| standard | 1: 霧の | 84.785 | 4.428 | 72.061 |
| standard | 2: 門番 | 73.442 | 4.066 | 69.110 |
| standard | 3: 記録 | 67.574 | 3.352 | 67.107 |
| standard | 4: 霧 | 68.598 | 3.076 | 0.113 |
| standard | 5: 霧の | 65.517 | 2.519 | 0.041 |
| large | 0: 霧 | 657.145 | 825.202 | 661.061 |
| large | 1: 霧の | 619.483 | 525.076 | 623.446 |
| large | 2: 門番 | 599.763 | 485.164 | 615.449 |
| large | 3: 記録 | 608.712 | 486.936 | 638.803 |
| large | 4: 霧 | 611.543 | 502.816 | 617.844 |
| large | 5: 霧の | 687.156 | 483.321 | 601.496 |

## 別ON実行の仕事量と論理保持

| サイズ/方式 | filter行数 | text正規化行数 | 正規化UTF8保持bytes | 結果entry/参照 |
| --- | ---: | ---: | ---: | --- |
| standard/current | 40800 | 40800 | 0 | 0/0 |
| standard/corpus | 40800 | 6800 | 1650697 | 0/0 |
| standard/results | 27200 | 27200 | 0 | 4/20120 |
| large/current | 408018 | 408018 | 0 | 0/0 |
| large/corpus | 408018 | 327673 | 8388607 | 0/0 |
| large/results | 408018 | 408018 | 0 | 1/67000 |

StandardのAは正規化を40800→6800行へ減らし、各queryの全行走査40800行は残る。Largeは8MiBの上限により大半を保持できず、正規化408018→327673行、走査408018行のまま。LargeのBは100000参照budgetに対し67000件の結果を複数保持できず、6miss/0hitで全仕事が残る。容量・query順・結果集合の違いが原因であり、DB読込が減ったという結果ではない。

Aの初回p95はStandard 65.142→77.159ms、Large 657.145→825.202msと悪化。BのLargeは6区間中5区間のp95が悪い。warmの有利値だけを抜き出さない。全720対応差分とstrictなcandidate>baselineのフラグはpaired-differences.csvに保存。これは同反復/位置の対応であり、同時測定や因果的な無作為化比較、全機種の有意差を意味しない。

全sessionと別ON実行でclose後のsource行/語/UTF8/結果entry/結果参照は0。これは研究APIが所有する論理保持の破棄で、元fixture・呼出側返却record・Node/JS heap/GC・ピークの証明ではない。結果keyは最大8個×4096 UTF8 bytes、配列/Map/文字列のruntime overheadを上記bytesに含めない。UI待ち、実DB行数、Worker転送、実heap保持、最適budgetはUNKNOWN。原2000ms/600000ms/7200秒や元性能合否を変更しない。

## 失敗と過去の値

preliminaryに、初回sandboxでのGit spawn EPERM（結果JSON作成前のCLI失敗）、旧driverのStandard全30値、Largeの原SHA照合失敗（測定0行）を保持する。Large生成器のcanonical digestを挿入順JSONで照合したdriver側の不具合を、固定SHAを持つ独立テストでRED→GREENにして修正した。元fixture/期待SHA/素材は変更していない。その後の上記2runを同じclean sourceから直列実行した。旧Standardの速さを新sourceの数値へ付け替えず、旧rawとsource/commitも残す。

初期のowner継承によるguard欠落、query.toJSONによるkey衝突、Aの実filter行数counter欠落は独立コードレビューで再現し、3件ともRED→GREENで修正してから全計測した。意味定義の新規テストではpublic allowlistとenum順序に対する作者側の誤った仮定も修正し、元の製品定義・原テストは変えていない。環境/型検査の失敗と解消はVERIFICATION.md、実ログはevidence/logsを参照。

元Large起動5731.5ms・検索562.8ms・保存5224.1ms等や#60/#61/#62/#63/#64/#65の測定は、それぞれの固定source/環境のHISTのまま。今回のNode値をUI改善率や正式受入へ転用しない。
