# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: rb10-library-reopen.spec.ts >> library selection keeps canonical projects clean and resumes a failed draft across another project, cold reload and empty new/clone restoration
- Location: tests/e2e/rb10-library-reopen.spec.ts:49:1

# Error details

```
Test timeout of 120000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=f1e3]:
  - generic [ref=f1e4]:
    - generic [ref=f1e5]:
      - button "アカウント・専用同期" [ref=f1e6] [cursor=pointer]
      - generic [ref=f1e7]: この端末の作品
    - group "任意持出し診断" [ref=f1e8]:
      - generic "この作業の診断を確認・持出し" [ref=f1e9]
  - generic [ref=f1e11]:
    - link "本文へ移動" [ref=f1e12] [cursor=pointer]:
      - /url: "#main-content"
    - complementary "主要ナビゲーション" [ref=f1e13]:
      - generic [ref=f1e14]:
        - generic [ref=f1e15]: S
        - generic [ref=f1e16]: シナリオ管理
      - button "選び直す作品B 作品一覧へ ⌄" [ref=f1e17] [cursor=pointer]:
        - generic [ref=f1e19]:
          - strong [ref=f1e20]: 選び直す作品B
          - generic [ref=f1e21]: 作品一覧へ
        - generic [ref=f1e22]: ⌄
      - generic [ref=f1e23]: WORKSPACE
      - navigation [ref=f1e24]:
        - button "年表" [ref=f1e25] [cursor=pointer]
        - button "構成" [ref=f1e26] [cursor=pointer]
        - button "資料 1" [ref=f1e27] [cursor=pointer]:
          - text: 資料
          - generic [ref=f1e28]: "1"
        - button "検索" [ref=f1e29] [cursor=pointer]
      - generic [ref=f1e30]:
        - generic [ref=f1e31]: QUICK NOTE
        - button "アイデアを残す" [ref=f1e32] [cursor=pointer]
      - generic [ref=f1e34]:
        - button "作品・保存" [ref=f1e35] [cursor=pointer]
        - generic [ref=f1e38]:
          - strong [ref=f1e39]: この端末に保存
          - generic [ref=f1e40]: 同期接続先は未設定
        - button "暗い配色にする" [ref=f1e41] [cursor=pointer]
    - generic [ref=f1e42]:
      - banner [ref=f1e43]:
        - generic [ref=f1e44]:
          - generic "選び直す作品B" [ref=f1e45]
          - generic [ref=f1e46]: /
          - generic [ref=f1e47]: 作品
        - status [ref=f1e48]:
          - generic [ref=f1e50]: 端末内保存済み
          - generic [ref=f1e51]: LOCAL
      - main [ref=f1e52]:
        - generic [ref=f1e54]:
          - generic [ref=f1e55]: YOUR PROJECT
          - heading "作品" [level=1] [ref=f1e56]
          - paragraph [ref=f1e57]: 作品を保存し、いつでも続きを書けるように。
        - tablist "作品の管理" [ref=f1e58]:
          - tab "完全保存・復元" [selected] [ref=f1e59] [cursor=pointer]
          - tab "目的別出力" [ref=f1e60] [cursor=pointer]
          - tab "変更履歴" [ref=f1e61] [cursor=pointer]
          - tab "作品の設定" [ref=f1e62] [cursor=pointer]
          - tab "同期・限定共有" [ref=f1e63] [cursor=pointer]
        - group [ref=f1e64]:
          - generic "最近開いた情報・お気に入り" [ref=f1e65] [cursor=pointer]
        - generic [ref=f1e68]:
          - generic [ref=f1e72]:
            - heading "作品を完全保存" [level=3] [ref=f1e73]
            - paragraph [ref=f1e74]: 本文・状態・固定世界・履歴・送信待ち・添付を .scenario ファイルに保存します。
            - button "完全保存ファイルを作成" [ref=f1e75] [cursor=pointer]
            - button "素材bytesを除いて保存" [ref=f1e76] [cursor=pointer]
          - generic [ref=f1e80]:
            - heading "ファイルから復元" [level=3] [ref=f1e81]
            - paragraph [ref=f1e82]: 元ファイルと対応の入力を端末内に保持し、影響を確認してから復元します。
            - generic [ref=f1e83] [cursor=pointer]:
              - text: 保存ファイルを選ぶ
              - button "保存ファイルを選ぶ" [ref=f1e84]
          - status [ref=f1e85]: 完全保存ファイルを作成しました。端末のダウンロードを確認してください。
      - contentinfo [ref=f1e86]:
        - generic [ref=f1e87]: 端末内の作品 · 版 1
        - generic [ref=f1e88]: 2件の情報 · 0件の関係
```