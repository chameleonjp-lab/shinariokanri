# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: rb08-handoff.spec.ts >> 通常出力を独立ゲームへ渡し、実勝利・経路・受領証跡を戻して原子保存・cold・完全復元する
- Location: tests/e2e/rb08-handoff.spec.ts:28:1

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:4173/shinariokanri/examples/browser-game/index.html
Call log:
  - navigating to "http://127.0.0.1:4173/shinariokanri/examples/browser-game/index.html", waiting until "load"

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - link "本文へ移動" [ref=e4] [cursor=pointer]:
    - /url: "#main-content"
  - complementary "主要ナビゲーション" [ref=e5]:
    - generic [ref=e6]:
      - generic [ref=e7]: S
      - generic [ref=e8]: シナリオ管理
    - button "受渡しの通常操作 作品一覧へ ⌄" [ref=e9] [cursor=pointer]:
      - generic [ref=e11]:
        - strong [ref=e12]: 受渡しの通常操作
        - generic [ref=e13]: 作品一覧へ
      - generic [ref=e14]: ⌄
    - generic [ref=e15]: WORKSPACE
    - navigation [ref=e16]:
      - button "年表" [ref=e17] [cursor=pointer]
      - button "構成" [ref=e18] [cursor=pointer]
      - button "資料 0" [ref=e19] [cursor=pointer]:
        - text: 資料
        - generic [ref=e20]: "0"
      - button "検索" [ref=e21] [cursor=pointer]
    - generic [ref=e22]:
      - generic [ref=e23]: QUICK NOTE
      - button "アイデアを残す" [ref=e24] [cursor=pointer]
    - generic [ref=e26]:
      - button "作品・保存" [ref=e27] [cursor=pointer]
      - generic [ref=e30]:
        - strong [ref=e31]: この端末に保存
        - generic [ref=e32]: 同期接続先は未設定
      - button "暗い配色にする" [ref=e33] [cursor=pointer]
  - generic [ref=e34]:
    - banner [ref=e35]:
      - generic [ref=e36]:
        - generic "受渡しの通常操作" [ref=e37]
        - generic [ref=e38]: /
        - generic [ref=e39]: 作品
      - status [ref=e40]:
        - generic [ref=e42]: 端末内保存済み
        - generic [ref=e43]: LOCAL
    - main [ref=e44]:
      - generic [ref=e46]:
        - generic [ref=e47]: YOUR PROJECT
        - heading "作品" [level=1] [ref=e48]
        - paragraph [ref=e49]: 作品を保存し、いつでも続きを書けるように。
      - tablist "作品の管理" [ref=e50]:
        - tab "完全保存・復元" [ref=e51] [cursor=pointer]
        - tab "目的別出力" [selected] [ref=e52] [cursor=pointer]
        - tab "変更履歴" [ref=e53] [cursor=pointer]
        - tab "作品の設定" [ref=e54] [cursor=pointer]
      - group [ref=e55]:
        - generic "最近開いた情報・お気に入り" [ref=e56] [cursor=pointer]
      - generic [ref=e58]:
        - generic [ref=e59]:
          - paragraph [ref=e60]: 下書き基底revision 0。入力を保持し、差分を確認してから保存します。
          - generic [ref=e61]: 公開・制作・相談用の出力は、選択した範囲と公開文を使って作成します。完全復元には「完全保存」を使用してください。
          - group [ref=e62]:
            - generic [ref=e64]:
              - text: 出力する公開範囲
              - searchbox "出力する公開範囲を検索" [ref=e65]
              - combobox "出力する公開範囲" [ref=e66]:
                - option "選択してください"
                - option "確認したゲーム公開範囲" [selected]
            - generic [ref=e67]:
              - text: 出力目的
              - combobox "出力目的" [ref=e68]:
                - option "読み手向け本文"
                - option "汎用ランタイムJSON" [selected]
                - option "翻訳・収録"
                - option "制作の受渡し"
                - option "手動相談用"
                - option "単体の試遊出力"
            - generic [ref=e70]:
              - text: 出力する作品版
              - searchbox "出力する作品版を検索" [ref=e71]
              - combobox "出力する作品版" [ref=e72]:
                - option "編集稿の現在版 0" [selected]
          - generic [ref=e73]:
            - button "内容を検査・プレビュー" [ref=e74] [cursor=pointer]
            - button "現在稿の範囲を編集" [ref=e75] [cursor=pointer]
            - button "新しい範囲" [ref=e76] [cursor=pointer]
          - generic [ref=e77]:
            - heading "引用する固定版の公開範囲" [level=3] [ref=e78]
            - paragraph [ref=e79]: 旧本文・文字位置・媒体の元設定を含めるときは、その版で公開文を確認した範囲を指定してください。
            - paragraph [ref=e80]: 下書き基底revision 0。入力を保持し、差分を確認してから保存します。
            - group [ref=e81]:
              - generic [ref=e83]:
                - text: 公開出力へ引用する固定版
                - searchbox "公開出力へ引用する固定版を検索" [ref=e84]
                - combobox "公開出力へ引用する固定版" [ref=e85]:
                  - option "選択してください" [selected]
              - generic [ref=e87]:
                - text: 引用版の確認済み公開範囲
                - searchbox "引用版の確認済み公開範囲を検索" [ref=e88]
                - combobox "引用版の確認済み公開範囲" [ref=e89]:
                  - option "選択してください" [selected]
              - button "この固定版の公開引用を保存" [disabled] [ref=e90]
          - generic [ref=e91]:
            - generic [ref=e92]:
              - heading "出力内容の確認" [level=3] [ref=e93]
              - generic [ref=e94]: 7件 · runtime_json · 元の版 0 / 18252e82-d66c-4127-b384-32a93fdfdb68
            - paragraph [ref=e95]: 公開用の文面は作者が内容を確認してください。文章から秘密を自動で判定する機能ではありません。
            - group [ref=e96]:
              - generic "› 出力から除かれる内容（7件）" [ref=e97] [cursor=pointer]
            - generic [ref=e98]:
              - heading "runtime.json" [level=4] [ref=e99]
              - generic [ref=e100]: "{ \"format\": \"scenario-runtime\", \"formatVersion\": \"1.0.0\", \"requiredFeatures\": [ \"runtime-project-1\", \"lifecycle-1\", \"presentation-1\", \"reuse-flattening-1\", \"finite-exceptions-1\" ], \"profile\": { \"profileId\": \"scenario-runtime\", \"profileVersion\": \"1.1.0\", \"schemaVersion\": \"1.0.0\", \"supportedNodeTypes\": [ \"scene\", \"choice\", \"automatic\", \"call\", \"entry\", \"exit\", \"terminal\" ], \"supportedConditions\": [ \"constant\", \"all\", \"any\", \"not\", \"compare\", \"item\", \"known\", \"visited\", \"external\" ], \"supportedEffects\": [ \"set\", \"add\", \"grant\", \"consume\", \"move\", \"assert\", \"mark_seen\", \"reset\" ], \"externalContracts\": [ \"boolean\", \"integer\", \"enum\" ], \"assetTypes\": [ \"image/png\", \"image/jpeg\", \"image/gif\", \"image/webp\", \"audio/wav\", \"audio/mpeg\", \"application/pdf\", \"video/mp4\", \"video/webm\", \"video/ogg\", \"audio/ogg\", \"text/plain\", \"application/json\", \"application/octet-stream\" ], \"omissions\": [ \"author_notes\", \"rejected_and_alternate_records\", \"private_names_and_aliases\", \"original_source_ids_unless_explicitly_approved\", \"asset_bytes\", \"playtest_traces\" ] }, \"title\": \"公開したゲーム\", \"versionLabel\": \"公開一版\", \"contentVersionId\": \"sha256:e335d1740924cb2963f0af828ef8e8fd5e75cdbdfeb445180ffefa6728baa44d\", \"hashScope\": \"public_projection\", \"entities\": [ { \"id\": \"10af284e-b6a6-4c0d-bce2-967cf9036cc3\", \"kind\": \"scene\", \"name\": \"公開対象\", \"status\": \"confirmed\", \"data\": { \"body\": [ { \"id\": \"524f0c96-b443-4361-8fde-526a681620c8\", \"kind\": \"paragraph\", \"text\": \"😀門で勝利を確かめる\" } ], \"eventIds\": [], \"dialogueLineIds\": [ \"0e2a419e-ce81-49b6-80d3-b5cc3e79ce37\" ], \"threadIds\": [], \"blockIds\": [] } }, { \"id\": \"0e2a419e-ce81-49b6-80d3-b5cc3e79ce37\", \"kind\": \"dialogue_line\", \"name\": \"公開対象\", \"status\": \"confirmed\", \"data\": { \"text\": [ { \"id\": \"8b9419e4-a716-490b-ad5c-335ecefc5b70\", \"kind\": \"paragraph\", \"text\": \"😀帰ってきた\" } ], \"cueIds\": [] } }, { \"id\": \"097d1871-dacd-4f86-9a18-299174d54283\", \"kind\": \"flow_node\", \"name\": \"公開対象\", \"status\": \"confirmed\", \"data\": { \"nodeType\": \"automatic\", \"sceneId\": \"10af284e-b6a6-4c0d-bce2-967cf9036cc3\", \"terminalReason\": \"\", \"gate\": { \"op\": \"external\", \"contractId\": \"e8870bf3-ae94-413b-8c05-846a91ee0dc8\" }, \"executionPolicy\": \"first_match\" } }, { \"id\": \"d9dad040-fde7-4cee-a5bb-745e3947eff4\", \"kind\": \"flow_node\", \"name\": \"公開対象\", \"status\": \"confirmed\", \"data\": { \"nodeType\": \"terminal\", \"terminalReason\": \"完了\", \"gate\": { \"op\": \"constant\", \"value\": true }, \"executionPolicy\": \"manual_choice\" } }, { \"id\": \"38018eb6-5233-4d7f-aedd-3e1d0d92b5c2\", \"kind\": \"flow_edge\", \"name\": \"公開対象\", \"status\": \"confirmed\", \"data\": { \"fromId\": \"097d1871-dacd-4f86-9a18-299174d54283\", \"toId\": \"d9dad040-fde7-4cee-a5bb-745e3947eff4\", \"edgeType\": \"automatic\", \"label\": \"\", \"condition\": { \"op\": \"constant\", \"value\": true }, \"effectIds\": [], \"priority\": 0 } }, { \"id\": \"c4e183e3-a0bf-4002-b86a-a1b1d4a0e302\", \"kind\": \"flow_graph\", \"name\": \"公開対象\", \"status\": \"confirmed\", \"data\": { \"nodeIds\": [ \"097d1871-dacd-4f86-9a18-299174d54283\", \"d9dad040-fde7-4cee-a5bb-745e3947eff4\" ], \"edgeIds\": [ \"38018eb6-5233-4d7f-aedd-3e1d0d92b5c2\" ], \"entryIds\": [ \"097d1871-dacd-4f86-9a18-299174d54283\" ], \"exitIds\": [ \"d9dad040-fde7-4cee-a5bb-745e3947eff4\" ], \"parameters\": [] } }, { \"id\": \"e8870bf3-ae94-413b-8c05-846a91ee0dc8\", \"kind\": \"external_contract\", \"name\": \"公開対象\", \"status\": \"confirmed\", \"data\": { \"key\": \"game_result\", \"owner\": \"game\", \"inputType\": \"boolean\", \"outputType\": \"boolean\", \"missingPolicy\": \"block\", \"description\": [], \"version\": \"1.0.0\", \"stubValues\": [ { \"type\": \"boolean\", \"value\": true }, { \"type\": \"boolean\", \"value\": false } ] } } ], \"relations\": [], \"calendars\": [], \"flow\": { \"graphs\": [ { \"id\": \"c4e183e3-a0bf-4002-b86a-a1b1d4a0e302\", \"kind\": \"flow_graph\", \"name\": \"公開対象\", \"status\": \"confirmed\", \"data\": { \"nodeIds\": [ \"097d1871-dacd-4f86-9a18-299174d54283\", \"d9dad040-fde7-4cee-a5bb-745e3947eff4\" ], \"edgeIds\": [ \"38018eb6-5233-4d7f-aedd-3e1d0d92b5c2\" ], \"entryIds\": [ \"097d1871-dacd-4f86-9a18-299174d54283\" ], \"exitIds\": [ \"d9dad040-fde7-4cee-a5bb-745e3947eff4\" ], \"parameters\": [] } } ], \"nodes\": [ { \"id\": \"097d1871-dacd-4f86-9a18-299174d54283\", \"kind\": \"flow_node\", \"name\": \"公開対象\", \"status\": \"confirmed\", \"data\": { \"nodeType\": \"automatic\", \"sceneId\": \"10af284e-b6a6-4c0d-bce2-967cf9036cc3\", \"terminalReason\": \"\", \"gate\": { \"op\": \"external\", \"contractId\": \"e8870bf3-ae9 … プレビューはここまで。保存ファイルには全内容を含みます。"
              - button "この内容を保存" [active] [ref=e101] [cursor=pointer]
        - group [ref=e102]:
          - generic "相談Markdownから作者別案を取り込む" [ref=e103]
          - option "選択してください"
          - option "現在稿" [selected]
          - option "提案メモだけを別案へ保存" [selected]
          - option "制作する場面"
          - option "受渡し台詞"
        - group [ref=e104]:
          - generic "ゲーム受領と実結果を取り込む" [ref=e105]
          - option "現在稿" [selected]
          - option "選択してください" [selected]
          - option "確認したゲーム公開範囲"
    - contentinfo [ref=e106]:
      - generic [ref=e107]: 端末内の作品 · 版 0
      - generic [ref=e108]: 9件の情報 · 0件の関係
```

# Test source

```ts
  1  | import {test,expect,type Page} from '@playwright/test';
  2  | import {readFile} from 'node:fs/promises';
  3  | import {createProject,createEntity,textToRichText,newId} from '../../src/domain/model';
  4  | import {createWorldSnapshot} from '../../src/domain/world';
  5  | import {exportScenario,inspectScenario} from '../../src/storage/archive';
  6  | import {unzipSync,strFromU8} from 'fflate';
  7  | import {mkdtemp,writeFile} from 'node:fs/promises';
  8  | import {tmpdir} from 'node:os';
  9  | import {join} from 'node:path';
  10 | import {pathToFileURL} from 'node:url';
  11 | import type {ProjectData} from '../../src/domain/types';
  12 | import {prepareAsset} from '../../src/domain/attachments';
  13 | async function nav(page:Page,name:RegExp){const menu=page.getByRole('button',{name:'メニューを開く'});if(await menu.isVisible())await menu.click();await page.getByRole('button',{name}).first().click();}
  14 | async function seed(page:Page,p:ProjectData,assets:Record<string,Uint8Array>={}){await page.goto('./');await page.getByRole('button',{name:'保存ファイルを読み込む',exact:true}).click();await page.locator('input[type=file]').setInputFiles({name:'handoff.scenario',mimeType:'application/zip',buffer:Buffer.from(await exportScenario(p,{loadAsset:hash=>assets[hash]}))});await page.getByLabel('復元方法と対象への影響を確認しました').check();await page.getByRole('button',{name:'この内容で復元する',exact:true}).click();await expect(page.locator('.project-switch')).toBeVisible();}
  15 | async function backup(page:Page){await nav(page,/^作品・保存/);await page.getByRole('tab',{name:'完全保存・復元',exact:true}).click();const pending=page.waitForEvent('download');await page.getByRole('button',{name:'完全保存ファイルを作成',exact:true}).click();return inspectScenario(new Uint8Array(await readFile((await (await pending).path())!)),{worker:false});}
  16 | async function quota(page:Page){await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;let fail=true;IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){if(fail&&this.name==='projects'){fail=false;throw new DOMException('fixture quota','QuotaExceededError');}return put.apply(this,args);};});}
  17 | async function production(page:Page){await nav(page,/^構成/);await page.getByRole('tab',{name:'制作',exact:true}).click();}
  18 | async function output(page:Page){await nav(page,/^作品・保存/);await page.getByRole('tab',{name:'目的別出力',exact:true}).click();}
  19 | function story(){const p=createProject('受渡しの通常操作'),scene=createEntity(p.projectId,'scene','制作する場面',{body:textToRichText('😀門で勝利を確かめる')}),line=createEntity(p.projectId,'dialogue_line','受渡し台詞',{text:textToRichText('😀帰ってきた')}),task=createEntity(p.projectId,'production_task','場面の実装',{targetIds:[scene.id],stage:'implementation',progress:'doing',deadline:{date:'2026-10-10',timeZone:'Asia/Tokyo'}}),entry=createEntity(p.projectId,'flow_node','ゲーム入口',{nodeType:'automatic',executionPolicy:'first_match',sceneId:scene.id}),terminal=createEntity(p.projectId,'flow_node','ゲーム終端',{nodeType:'terminal',terminalReason:'完了'}),edge=createEntity(p.projectId,'flow_edge','ゲーム進行',{fromId:entry.id,toId:terminal.id,edgeType:'automatic'}),graph=createEntity(p.projectId,'flow_graph','ゲーム経路',{nodeIds:[entry.id,terminal.id],entryIds:[entry.id],exitIds:[terminal.id],edgeIds:[edge.id]});scene.data.dialogueLineIds=[line.id];p.entities.push(scene,line,task,entry,terminal,edge,graph);p.entities.forEach(e=>e.status='confirmed');return {p,scene,line,task,entry,edge,terminal};}
  20 | function publicPolicy(p:ProjectData){const selected=p.entities.filter(e=>['scene','dialogue_line','flow_node','flow_edge','flow_graph','external_contract'].includes(e.kind)),publicTexts=Object.fromEntries(selected.map(e=>[e.id,Object.fromEntries(Object.entries(e.data).filter(([field,value])=>value!=null&&['body','text','key','label','terminalReason','description'].includes(field)).map(([field,value])=>[field,Array.isArray(value)?value.map(block=>({...block,id:newId()})):value]))]));const profile=createEntity(p.projectId,'projection_profile','確認したゲーム公開範囲',{audience:'reader',publicTitle:'公開したゲーム',publicVersionLabel:'公開一版',includedIds:selected.map(e=>e.id),allowedKinds:[...new Set(selected.map(e=>e.kind))],idPolicy:'preserve',namePolicy:{defaultPolicy:{mode:'replace',replacement:'公開対象'}},publicTexts});profile.status='confirmed';p.entities.push(profile);return profile;}
  21 | 
  22 | test('制作見積の入力を移動とcold再開から保持し、quota拒否後の原子保存を完全ファイルへつなぐ',async({page})=>{const f=story();await seed(page,f.p);await production(page);let panel=page.locator('.production-planning');await expect(panel).toContainText('固有場面 1');await panel.getByLabel('見積する制作タスク',{exact:true}).selectOption(f.task.id);await panel.getByLabel('一作業日の固有件数',{exact:true}).fill('2');await panel.getByLabel('見積の仮定',{exact:true}).fill('場面と台詞を固有件数で一度だけ制作');await nav(page,/^資料/);await production(page);await expect(panel.getByLabel('一作業日の固有件数',{exact:true})).toHaveValue('2');await page.reload();await production(page);panel=page.locator('.production-planning');await expect(panel.getByLabel('見積の仮定',{exact:true})).toHaveValue('場面と台詞を固有件数で一度だけ制作');await panel.getByRole('button',{name:'制作見積を確認',exact:true}).click();await expect(panel).toContainText('1作業日');await quota(page);await panel.getByRole('button',{name:'確認した制作見積を保存',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('容量');await panel.getByRole('button',{name:'確認した制作見積を保存',exact:true}).click();await expect(panel).toContainText('見積 1 作業日');await page.reload();const restored=(await backup(page)).project;expect(restored.entities.find(e=>e.id===f.task.id)).toMatchObject({data:{estimate:{value:1,speed:2,unknownCount:0,assumptions:['場面と台詞を固有件数で一度だけ制作']}}});});
  23 | 
  24 | test('旧媒体と元pinを保持し、未保存候補を再開して独立改訂・予定日・完全復元を確認する',async({page})=>{const f=story(),p=await createWorldSnapshot(f.p,'旧元設定'),pin=p.snapshots.at(-1)!,media=createEntity(p.projectId,'media_variant','公開済み小説',{medium:'novel',baseSnapshotId:pin.id,sourceIds:[f.scene.id],body:textToRichText('公開済みの旧本文'),releaseAt:'2026-10-09T01:00:00Z'});media.status='confirmed';p.entities.push(media);const current=p.entities.find(e=>e.id===f.scene.id)!;if(current.kind==='scene')current.data.body=textToRichText('元設定の新稿');await seed(page,p);async function open(){await nav(page,/^資料/);await page.getByLabel('情報の種類',{exact:true}).selectOption('media_variant');await page.locator('.entity-card').filter({has:page.getByRole('heading',{name:media.name,exact:true})}).click();}await open();let tool=page.locator('details').filter({has:page.locator('summary').filter({hasText:'媒体の旧公開版と改訂候補を比較'})});await tool.locator('summary').click();await tool.getByLabel('媒体の改訂候補本文',{exact:true}).fill('作者が書く改訂候補😀');await nav(page,/^構成/);await page.reload();await open();tool=page.locator('details').filter({has:page.locator('summary').filter({hasText:'媒体の旧公開版と改訂候補を比較'})});await tool.locator('summary').click();await expect(tool.getByLabel('媒体の改訂候補本文',{exact:true})).toHaveValue('作者が書く改訂候補😀');await tool.getByRole('button',{name:'媒体の改訂差分を確認',exact:true}).click();await expect(tool).toContainText('公開済みの旧本文');await expect(tool).toContainText('元設定の新稿');await quota(page);await tool.getByRole('button',{name:'旧媒体を保持して改訂候補を保存',exact:true}).click();await expect(tool.getByRole('alert')).toContainText('容量');await tool.getByRole('button',{name:'旧媒体を保持して改訂候補を保存',exact:true}).click();await tool.getByRole('button',{name:'保存した媒体改訂候補を開く',exact:true}).click();await expect(page.getByLabel('媒体の予定公開日時',{exact:true})).toHaveValue('2026-10-09T01:00:00Z');await page.reload();const restored=(await backup(page)).project;expect(restored.entities.find(e=>e.id===media.id)).toMatchObject({data:{body:[{text:'公開済みの旧本文'}],baseSnapshotId:pin.id}});expect(restored.entities.find(e=>e.kind==='media_variant'&&e.data.previousVariantId===media.id)).toMatchObject({status:'provisional',data:{body:[{text:'作者が書く改訂候補😀'}],needsReview:true}});expect(restored.snapshots.find(s=>s.id===pin.id)).toEqual(pin);});
  25 | 
  26 | test('相談MDの出所と対象版をcold再開し、作者別案へ保存・選択採用して正本と採用記録を復元する',async({page})=>{const f=story(),p=await createWorldSnapshot(f.p,'相談対象版'),pin=p.snapshots.at(-1)!;await seed(page,p);await output(page);let panel=page.locator('.consultation-import');await panel.locator('summary').click();await panel.getByLabel('提案の出所',{exact:true}).fill('作者が保存した相談.md');await panel.getByLabel('提案の相談対象版',{exact:true}).selectOption(pin.id);await panel.getByLabel('提案を比較する本文対象',{exact:true}).selectOption(f.scene.id);await panel.getByLabel('提案MDを選ぶ',{exact:true}).setInputFiles({name:'proposal.md',mimeType:'text/markdown',buffer:Buffer.from('😀別案の門を描く')});await expect(panel.getByLabel('提案Markdown',{exact:true})).toHaveValue('😀別案の門を描く');await nav(page,/^構成/);await page.reload();await output(page);panel=page.locator('.consultation-import');await panel.locator('summary').click();await expect(panel.getByLabel('提案の出所',{exact:true})).toHaveValue('作者が保存した相談.md');await panel.getByRole('button',{name:'提案の別案差分を確認',exact:true}).click();await quota(page);await panel.getByRole('button',{name:'提案を作者別案として保存',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('容量');await panel.getByRole('button',{name:'提案を作者別案として保存',exact:true}).click();await expect(panel.getByRole('status')).toContainText('作者別案へ保存');await nav(page,/^構成/);await page.getByRole('tab',{name:'作者別案',exact:true}).click();await page.getByLabel('別案内の編集対象',{exact:true}).selectOption(f.scene.id);await expect(page.getByLabel('別案内の場面本文',{exact:true})).toHaveValue('😀別案の門を描く');for(const change of await page.locator('.alternative-diff-list input[type=checkbox]').all())await change.check();await page.getByRole('button',{name:'選択した変更を正本へ採用',exact:true}).click();await expect(page.getByText(/正本へ採用した記録 1件/)).toBeVisible();await page.reload();const restored=(await backup(page)).project;expect(restored.entities.find(e=>e.id===f.scene.id)).toMatchObject({data:{body:[{text:'😀別案の門を描く'}]}});expect(restored.authorAlternatives?.[0].applyReceipts).toHaveLength(1);expect(restored.authorAlternatives?.[0].versions.at(-1)?.content.entities.find(e=>e.kind==='note')?.customValues).toMatchObject({consultationSource:'作者が保存した相談.md',consultationTargetVersionId:pin.id});});
  27 | 
> 28 | test('通常出力を独立ゲームへ渡し、実勝利・経路・受領証跡を戻して原子保存・cold・完全復元する',async({page,context})=>{const f=story(),contract=createEntity(f.p.projectId,'external_contract','勝敗管理',{key:'game_result',owner:'game',inputType:'boolean',outputType:'boolean',version:'1.0.0',missingPolicy:'block',stubValues:[{type:'boolean',value:true},{type:'boolean',value:false}]});contract.status='confirmed';f.p.entities.push(contract);f.entry.data.gate={op:'external',contractId:contract.id};const profile=publicPolicy(f.p);await seed(page,f.p);await output(page);await page.getByLabel('出力目的',{exact:true}).selectOption('runtime_json');await page.getByRole('button',{name:'内容を検査・プレビュー',exact:true}).click();await expect(page.locator('.export-result')).toContainText('runtime.json');const exported=page.waitForEvent('download');await page.locator('.export-artifact').getByRole('button',{name:'この内容を保存',exact:true}).click();const bytes=await readFile((await (await exported).path())!),pkg=JSON.parse(bytes.toString());expect(pkg.runtimeProject).toBeTruthy();const game=await context.newPage();await game.goto('http://127.0.0.1:4173/shinariokanri/examples/browser-game/index.html');await game.getByLabel('ゲームが受け取るruntime.json',{exact:true}).setInputFiles({name:'runtime.json',mimeType:'application/json',buffer:bytes});await expect(game.getByRole('status')).toContainText('受領hash');await game.getByRole('button',{name:`ゲームで勝利 (${contract.id})`,exact:true}).click();await expect(game.getByRole('status')).toContainText('actual');await game.getByRole('button',{name:'測定結果でゲームの物語を開始',exact:true}).click();await expect(game.getByText('😀帰ってきた',{exact:true})).toBeVisible();await game.getByRole('button',{name:'ゲームの規則で次へ',exact:true}).click();await expect(game.getByRole('status')).toContainText('terminal');const response=game.waitForEvent('download');await game.getByRole('button',{name:'受領hash・実結果の証跡を保存',exact:true}).click();const receiptBytes=await readFile((await (await response).path())!),receipt=JSON.parse(receiptBytes.toString());expect(receipt).toMatchObject({mode:'actual',status:'terminal',dialogueIds:[f.line.id]});await game.close();const panel=page.locator('.game-handoff');await panel.locator('summary').click();await panel.getByLabel('受渡しの公開範囲',{exact:true}).selectOption(profile.id);await panel.getByLabel('ゲームの受領証跡',{exact:true}).setInputFiles({name:'game-receipt.json',mimeType:'application/json',buffer:receiptBytes});await panel.getByRole('button',{name:'受領hash・ID対応・実結果を検証',exact:true}).click();await expect(panel).toContainText('実行証跡による分類 actual');await quota(page);await panel.getByRole('button',{name:'検証したゲーム受領を保存',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('容量');await panel.getByRole('button',{name:'検証したゲーム受領を保存',exact:true}).click();await expect(panel.getByRole('status')).toContainText('表示版を確認');await page.reload();const restored=(await backup(page)).project,note=restored.entities.find(e=>e.kind==='note'&&e.data.handoffReceipt);expect(note?.kind==='note'&&note.data.handoffReceipt).toMatchObject({mode:'actual',packageHash:receipt.packageHash,receiptHash:receipt.receiptHash});expect(restored.entities.find(e=>e.id===f.entry.id)?.data).toEqual(f.entry.data);});
     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:4173/shinariokanri/examples/browser-game/index.html
  29 | 
  30 | test('通常画面で旧版と現稿の公開範囲を作り、固定引用のUnicode位置を試遊ZIPから開いて戻り、承認をcold復元する',async({page,context})=>{
  31 |  const f=story(),p=await createWorldSnapshot(f.p,'引用する旧本文'),pin=p.snapshots.at(-1)!,oldScene=pin.content.entities.find(entity=>entity.id===f.scene.id)!;if(oldScene.kind!=='scene')throw Error('fixture');const current=p.entities.find(entity=>entity.id===f.scene.id)!;if(current.kind!=='scene')throw Error('fixture');current.data.body=[{...textToRichText('😀現在稿から旧本文へ')[0],links:[{start:0,end:1,target:{entityId:f.scene.id,sourceVersionId:pin.id,blockId:oldScene.data.body[0].id,start:0,end:1}}]}];await seed(page,p);await output(page);
  32 |  async function createScope(title:string,version:string){const create=page.getByRole('button',{name:'公開範囲を作成',exact:true});if(await create.isVisible())await create.click();else await page.getByRole('button',{name:'新しい範囲',exact:true}).click();const modal=page.getByRole('dialog');await modal.getByLabel('公開範囲の元作品版',{exact:true}).selectOption(version);await modal.getByLabel('公開用の作品名',{exact:true}).fill(title);for(const entity of [f.scene,f.line,f.entry,f.terminal,f.edge,f.p.entities.find(entity=>entity.kind==='flow_graph')!])await modal.getByLabel('追加する対象',{exact:true}).selectOption(entity.id);await modal.getByLabel('選んだ対象の本文・表記を公開文へコピーする',{exact:true}).check();await modal.getByRole('button',{name:'範囲を作成して内容を確認',exact:true}).click();await expect(modal).toBeHidden();await page.getByLabel('情報の状態',{exact:true}).selectOption('confirmed');await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み').catch(async cause=>{console.log('RB08_SCOPE_EDITOR_FAILURE',await page.locator('.detail-panel').innerText());throw cause;});const id=await page.locator('.detail-panel').getAttribute('data-entity-id');await page.getByRole('button',{name:'詳細を閉じる',exact:true}).click();const selected=await page.getByLabel('出力する公開範囲',{exact:true}).inputValue();expect(selected).toBeTruthy();return selected;}
  33 |  const child=await createScope('旧版の公開文',pin.id),root=await createScope('現在版の公開文','');await page.getByLabel('出力する公開範囲',{exact:true}).selectOption(root);await page.getByLabel('公開出力へ引用する固定版',{exact:true}).selectOption(pin.id);await page.getByLabel('引用版の確認済み公開範囲',{exact:true}).selectOption(child);await quota(page);await page.getByRole('button',{name:'この固定版の公開引用を保存',exact:true}).click();await expect(page.getByRole('alert')).toContainText('容量');await page.getByRole('button',{name:'この固定版の公開引用を保存',exact:true}).click();await expect(page.getByRole('button',{name:'引用承認を外す',exact:true})).toBeEnabled();await page.getByLabel('出力目的',{exact:true}).selectOption('playable_preview');await page.getByRole('button',{name:'内容を検査・プレビュー',exact:true}).click();await expect(page.locator('.export-result')).toContainText('playable-preview.zip');const pending=page.waitForEvent('download');await page.locator('.export-artifact').getByRole('button',{name:'この内容を保存',exact:true}).click();const files=unzipSync(new Uint8Array(await readFile((await(await pending).path())!))),htmlPath=join(await mkdtemp(join(tmpdir(),'rb08-citation-ui-')),'index.html');await writeFile(htmlPath,strFromU8(files['index.html']));const trial=await context.newPage();await trial.goto(pathToFileURL(htmlPath).href);await expect(trial.locator('#scene p').filter({hasText:'😀現在稿から旧本文へ'}).first()).toBeVisible().catch(async cause=>{console.log('RB08_CITATION_TRIAL_FAILURE',await trial.locator('body').innerText());throw cause;});const link=trial.getByRole('button',{name:'関連: 😀',exact:true});await link.click();await expect(trial.getByRole('dialog')).toContainText(oldScene.data.body[0].text);await expect(trial.getByRole('dialog').locator('mark')).toHaveText('😀');await trial.getByRole('button',{name:'元の読み位置へ戻る',exact:true}).click();await expect(link).toBeFocused();await trial.close();await page.reload();const restored=(await backup(page)).project,parent=restored.entities.find(entity=>entity.id===root);expect(parent?.kind==='projection_profile'&&parent.data.citedVersions).toMatchObject([{sourceVersionId:pin.id,profileId:child}]);
  34 | });
  35 | 
  36 | test('通常画面で企画・プレイ行動・実装作業を照合し、容量失敗後に対象版付き確認を保存しcold完全復元する',async({page})=>{
  37 |  const f=story(),spec=createEntity(f.p.projectId,'gameplay_spec','門のプレイ仕様',{sceneId:f.scene.id,action:textToRichText('門を押して勝利を確認する'),mechanic:'入力と勝敗の判定',tutorial:textToRichText('門を一回押す'),taskIds:[f.task.id],intentionalDifference:'本文は勝利、操作は勝敗の入力を確認する'}),brief=createEntity(f.p.projectId,'creative_brief','企画の判断元',{targetAudience:textToRichText('初めて読む人'),experience:textToRichText('分岐の意味を確かめる'),theme:textToRichText('判断'),tone:textToRichText('静か'),scope:textToRichText('一場面'),deliverableIds:[f.scene.id,spec.id]});spec.status=brief.status='confirmed';f.p.entities.push(spec,brief);await seed(page,f.p);await production(page);await expect(page.getByRole('heading',{name:'プレイヤーが行う行動'})).toBeVisible();await expect(page.getByText('門を押して勝利を確認する',{exact:true})).toBeVisible();await quota(page);await page.getByRole('button',{name:'遊びと物語の差を確認候補へ保存',exact:true}).click();await expect(page.getByRole('alert')).toContainText('容量');await page.getByRole('button',{name:'遊びと物語の差を確認候補へ保存',exact:true}).click();await expect(page.getByRole('button',{name:'遊びと物語の差を確認候補へ保存',exact:true})).toBeEnabled();await page.reload();const restored=(await backup(page)).project,review=restored.entities.find(entity=>entity.kind==='review'&&entity.name==='門のプレイ仕様 · 遊びと物語の差の確認');expect(review?.kind==='review'&&review.data.stage).toBe('open');if(review?.kind!=='review')throw Error('確認候補なし');expect(review.data.target).toBe(spec.id);const fixed=restored.snapshots.find(pin=>pin.id===review.data.targetVersionId);expect(fixed?.content.entities.find(entity=>entity.id===spec.id)).toMatchObject({data:{mechanic:'入力と勝敗の判定'}});expect(review.data.body?.map(block=>block.text).join('\n')).toContain('門を押して勝利を確認する');
  38 | });
  39 | 
  40 | 
  41 | test('通常出力の試遊ZIPが同じ素材IDの旧動画decodeと新音声bytesを別々に検証して固定参照から戻る',async({page,context})=>{
  42 |  const f=story(),old=await prepareAsset(new Uint8Array(await readFile('tests/fixtures/media/fixture-blue.mp4')),'旧動画'),{bytes:oldBytes,preview:_oldPreview,...oldMeta}=old,asset=createEntity(f.p.projectId,'attachment','公開する素材',oldMeta);asset.status='confirmed';f.p.entities.push(asset);const pinned=await createWorldSnapshot(f.p,'旧動画の版'),pin=pinned.snapshots.at(-1)!,newAsset=await prepareAsset(new Uint8Array(await readFile('tests/fixtures/media/fixture-tone.wav')),'新音声'),{bytes:newBytes,preview:_newPreview,...newMeta}=newAsset,current=pinned.entities.find(entity=>entity.id===asset.id)!;if(current.kind!=='attachment')throw Error('fixture');current.data=newMeta;const scene=pinned.entities.find(entity=>entity.id===f.scene.id)!;if(scene.kind!=='scene')throw Error('fixture');scene.data.body=[{...textToRichText('旧素材へ')[0],links:[{start:0,end:4,target:{entityId:asset.id,sourceVersionId:pin.id}}]}];
  43 |  function scope(records:typeof pinned.entities,version?:string){const publicTexts=Object.fromEntries(records.map(entity=>[entity.id,Object.fromEntries(Object.entries(entity.data).filter(([field,value])=>value!=null&&['body','text','key','label','terminalReason','description','displayName'].includes(field)).map(([field,value])=>[field,Array.isArray(value)?value.map(block=>({...block,id:newId()})):value]))])),policy=createEntity(pinned.projectId,'projection_profile','素材出力承認',{audience:'reader',publicTitle:'素材確認',includedIds:records.map(entity=>entity.id),allowedKinds:[...new Set(records.map(entity=>entity.kind))],idPolicy:'preserve',namePolicy:{defaultPolicy:{mode:'replace',replacement:'確認した素材と場面'}},publicTexts,approvedAttachmentIds:[asset.id],...(version?{sourceVersionId:version}:{})});policy.status='confirmed';pinned.entities.push(policy);return policy;}
  44 |  const child=scope(pin.content.entities.filter(entity=>entity.kind==='attachment'),pin.id),root=scope(pinned.entities.filter(entity=>['scene','dialogue_line','flow_node','flow_edge','flow_graph','attachment'].includes(entity.kind)));root.data.citedVersions=[{sourceVersionId:pin.id,profileId:child.id,publicVersionId:newId()}];await seed(page,pinned,{[oldMeta.contentHash]:oldBytes,[newMeta.contentHash]:newBytes});await output(page);await page.getByLabel('出力する公開範囲',{exact:true}).selectOption(root.id);await page.getByLabel('出力目的',{exact:true}).selectOption('playable_preview');await page.getByRole('button',{name:'内容を検査・プレビュー',exact:true}).click();await expect(page.locator('.export-result')).toContainText('playable-preview.zip');const download=page.waitForEvent('download');await page.locator('.export-artifact').getByRole('button',{name:'この内容を保存',exact:true}).click();const files=unzipSync(new Uint8Array(await readFile((await(await download).path())!))),htmlPath=join(await mkdtemp(join(tmpdir(),'rb08-old-material-')),'index.html');await writeFile(htmlPath,strFromU8(files['index.html']));const trial=await context.newPage();await trial.goto(pathToFileURL(htmlPath).href);await trial.getByRole('button',{name:'関連: 旧素材へ',exact:true}).click();await expect(trial.getByRole('dialog').locator('video')).toBeVisible();await expect.poll(()=>trial.getByRole('dialog').locator('video').evaluate((element:HTMLVideoElement)=>({width:element.videoWidth,height:element.videoHeight,duration:element.duration}))).toEqual({width:160,height:90,duration:0.5});await trial.getByRole('button',{name:'元の読み位置へ戻る',exact:true}).click();await expect(trial.getByRole('button',{name:'関連: 旧素材へ',exact:true})).toBeFocused();await trial.close();await page.reload();const restored=await backup(page);expect(restored.assets.map(asset=>asset.contentHash)).toEqual(expect.arrayContaining([oldMeta.contentHash,newMeta.contentHash]));
  45 | });
  46 | 
```