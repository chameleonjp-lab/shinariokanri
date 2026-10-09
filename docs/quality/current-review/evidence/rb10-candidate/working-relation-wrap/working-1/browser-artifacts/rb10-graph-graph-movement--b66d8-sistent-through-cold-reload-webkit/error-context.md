# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: rb10-graph.spec.ts >> graph movement keeps connected lines, device layout and live semantic edits consistent through cold reload
- Location: tests/e2e/rb10-graph.spec.ts:10:1

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: locator('.world-relation-meaning strong').filter({ hasText: '参照 · data.gate.children[1].children[0].variableId' })
Expected: "参照 · data.gate.children[1].children[0].variableId"
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toHaveText" locator('.world-relation-meaning strong').filter({ hasText: '参照 · data.gate.children[1].children[0].variableId' }) with timeout 5000ms
  - waiting for locator('.world-relation-meaning strong').filter({ hasText: '参照 · data.gate.children[1].children[0].variableId' })

```

```yaml
- button "アカウント・専用同期"
- text: この端末の作品
- group "任意持出し診断": この作業の診断を確認・持出し
- link "本文へ移動":
  - /url: "#main-content"
- complementary "主要ナビゲーション":
  - text: S シナリオ管理
  - button "メニューを閉じる"
  - button "配置と意味を分ける 作品一覧へ ⌄":
    - strong: 配置と意味を分ける
    - text: 作品一覧へ ⌄
  - text: WORKSPACE
  - navigation:
    - button "年表"
    - button "構成"
    - button "資料 2"
    - button "検索"
  - text: QUICK NOTE
  - button "アイデアを残す"
  - button "作品・保存"
  - strong: この端末に保存
  - text: 同期接続先は未設定
  - button "暗い配色にする"
- banner:
  - button "メニューを開く"
  - text: 配置と意味を分ける / 年表
  - status: 端末内保存済み
- main:
  - text: STORY TIMELINE
  - heading "年表" [level=1]
  - paragraph: 物語の時間と、そこで起きたこと。
  - button "出来事を追加"
  - tablist "年表と関係":
    - tab "世界内年表"
    - tab "関係表・図" [selected]
    - tab "世界・地図・履歴"
  - group: 最近開いた情報・お気に入り
  - button "関係表"
  - button "関係図"
  - combobox "図の意味を選択":
    - option "作品全体" [selected]
    - option "人物関係"
    - option "家系・師弟・血統"
    - option "因果・前提"
    - option "伏線・回収"
    - option "進行"
    - option "参照"
    - option "制作の依存"
  - button "関係を追加"
  - searchbox "中心にする情報の候補を検索"
  - combobox "中心にする情報":
    - option "選択してください"
    - option "配置A" [selected]
    - option "配置B"
    - option "鍵あり"
    - option "時刻"
    - option "括弧付き条件の入口"
    - option "条件の終端"
    - option "条件の進行"
    - option "括弧付き条件の図"
  - text: 表示範囲
  - combobox "関係の表示範囲":
    - option "一段" [selected]
    - option "二段"
  - text: 線の種類
  - combobox "線の種類":
    - option "すべての種類" [selected]
    - option "関連"
    - option "automatic · 条件の進行"
    - option "分岐グループのノード"
    - option "分岐グループのノード"
    - option "参照 · data.gate.children[0].variableId"
    - option "参照 · data.gate.children[1].children[0].variableId"
    - option "参照 · data.edgeIds[0]"
  - checkbox "階層を表示" [checked]
  - text: 階層を表示
  - checkbox "未確認の時点・経路も表示" [checked]
  - text: 未確認の時点・経路も表示
  - searchbox "関係を検索"
  - text: 世界時点（tick）
  - textbox "世界時点（tick）"
  - text: 経路・状態の記録
  - searchbox "経路・状態の記録を検索"
  - combobox "経路・状態の記録":
    - option "選択してください" [selected]
  - paragraph: 経路の記録を選ぶと、その記録の状態値を使います。未選択の条件は未確認として表示します。
  - paragraph: 表示 2項目・1線 ／ 非表示 6線・範囲外 0線 ／ 未確認 0線
  - paragraph: 実線：保存された関係 破線：元情報からの参照 → 一方向 ←→ 対称 未確認：日時や経路の値が不足
  - article:
    - button "配置A"
    - button "関連 ←→ 対称 · 関係を編集 有効 · 根拠0件 確定":
      - strong: 関連
      - text: ←→ 対称 · 関係を編集 有効 · 根拠0件 確定
    - button "配置B"
  - group: › 名前を付けた表示設定
- contentinfo: 端末内の作品 · 版 1 8件の情報 · 1件の関係
```

# Test source

```ts
  1  | import {expect,test,type Page} from '@playwright/test';
  2  | import {readFile} from 'node:fs/promises';
  3  | import {createEntity,createProject,emptyValidity,newId} from '../../src/domain/model';
  4  | import {exportScenario,inspectScenario} from '../../src/storage/archive';
  5  | 
  6  | async function nav(page:Page,name:RegExp){await page.locator('.app-shell').waitFor();const menu=page.getByRole('button',{name:'メニューを開く',exact:true});if(await menu.isVisible())await menu.click();await page.locator('.sidebar').getByRole('button',{name}).first().click();}
  7  | async function graph(page:Page){await nav(page,/^年表/);await page.getByRole('tab',{name:'関係表・図',exact:true}).click();await page.getByRole('button',{name:'関係図',exact:true}).click();}
  8  | async function completeImage(page:Page){await nav(page,/^作品/);await page.getByRole('tab',{name:'完全保存・復元',exact:true}).click();const pending=page.waitForEvent('download');await page.getByRole('button',{name:'完全保存ファイルを作成',exact:true}).click();return (await inspectScenario(new Uint8Array(await readFile((await (await pending).path())!)),{worker:false})).project;}
  9  | 
  10 | test('graph movement keeps connected lines, device layout and live semantic edits consistent through cold reload',async({page})=>{
  11 |  const p=createProject('配置と意味を分ける'),a=createEntity(p.projectId,'character','配置A'),b=createEntity(p.projectId,'character','配置B');a.status=b.status='confirmed';p.entities.push(a,b);p.relations.push({id:newId(),projectId:p.projectId,revision:'0',fromId:a.id,toId:b.id,relationType:'trust',direction:'forward',validity:emptyValidity(),evidenceIds:[],status:'confirmed',visibility:'private'});
  12 |  const key=createEntity(p.projectId,'variable','鍵あり',{key:'key',valueType:'boolean',scope:'run',initial:{type:'boolean',value:false},allowed:{values:[false,true]}}),clock=createEntity(p.projectId,'variable','時刻',{key:'clock',valueType:'enum',scope:'run',initial:{type:'enum',value:'昼'},allowed:{values:['昼','夜']}});
  13 |  const entry=createEntity(p.projectId,'flow_node','括弧付き条件の入口',{nodeType:'automatic',executionPolicy:'first_match',gate:{op:'all',children:[{op:'compare',variableId:key.id,comparator:'eq',value:{type:'boolean',value:true}},{op:'any',children:[{op:'compare',variableId:clock.id,comparator:'eq',value:{type:'enum',value:'昼'}},{op:'compare',variableId:clock.id,comparator:'eq',value:{type:'enum',value:'夜'}}]}]}}),end=createEntity(p.projectId,'flow_node','条件の終端',{nodeType:'terminal',terminalReason:'条件を満たして完了'}),edge=createEntity(p.projectId,'flow_edge','条件の進行',{fromId:entry.id,toId:end.id,edgeType:'automatic',priority:0,condition:{op:'constant',value:true}}),flow=createEntity(p.projectId,'flow_graph','括弧付き条件の図',{nodeIds:[entry.id,end.id],edgeIds:[edge.id],entryIds:[entry.id],exitIds:[end.id]});
  14 |  for(const entity of [key,clock,entry,end,edge,flow]){entity.status='confirmed';p.entities.push(entity);}
  15 |  await page.setViewportSize({width:1440,height:1000});await page.goto('');await page.getByRole('button',{name:'保存ファイルを読み込む',exact:true}).click();await page.locator('input[type=file][accept*=".scenario"]').setInputFiles({name:'graph.scenario',mimeType:'application/zip',buffer:Buffer.from(await exportScenario(p))});await page.getByLabel('復元方法と対象への影響を確認しました').check();await page.getByRole('button',{name:'この内容で復元する',exact:true}).click();await expect(page.locator('.app-shell')).toBeVisible();
  16 |  const before=await completeImage(page);await graph(page);
  17 |  const node=page.getByRole('button',{name:'配置Aを選択。矢印キーで配置を移動、Enterで詳細',exact:true}),other=page.getByRole('button',{name:'配置Bを選択。矢印キーで配置を移動、Enterで詳細',exact:true}),line=page.getByRole('button',{name:'配置Aから配置Bへ、信頼、関係を編集',exact:true});
  18 |  const x=Number(await node.locator('text').getAttribute('x')),otherX=await other.locator('text').getAttribute('x');await node.press('ArrowRight');await node.press('ArrowRight');await expect(node.locator('text')).toHaveAttribute('x',String(x+40));await expect(line.locator('line').first()).toHaveAttribute('x1',String(x+40));await expect(other.locator('text')).toHaveAttribute('x',otherX!);await expect(page.getByLabel('選択した項目の横位置',{exact:true})).toHaveValue(String(x+40));
  19 |  const box=(await node.boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+32,box.y+box.height/2,{steps:4});await page.mouse.up();await expect.poll(async()=>Number(await node.locator('text').getAttribute('x'))).toBeGreaterThan(x+40);await expect(line.locator('line').first()).toHaveAttribute('x1',(await node.locator('text').getAttribute('x'))!);await page.getByLabel('選択した項目の横位置',{exact:true}).fill(String(x+40));await page.getByRole('button',{name:'座標を適用',exact:true}).click();await expect(node.locator('text')).toHaveAttribute('x',String(x+40));
  20 |  await page.reload();await graph(page);await expect(node.locator('text')).toHaveAttribute('x',String(x+40));await page.setViewportSize({width:390,height:844});await expect(node.locator('text')).toHaveAttribute('x',String(x));await node.click();await page.getByRole('button',{name:'選択項目を→へ移動',exact:true}).click();await expect(node.locator('text')).toHaveAttribute('x',String(x+20));await expect(line.locator('line').first()).toHaveAttribute('x1',String(x+20));await page.setViewportSize({width:1440,height:1000});await expect(node.locator('text')).toHaveAttribute('x',String(x+40));
  21 |  expect(await completeImage(page)).toEqual(before);await graph(page);await node.press('Enter');await expect(page.locator('.detail-heading')).toContainText('配置A');await page.getByRole('button',{name:'詳細を閉じる',exact:true}).click();await line.press('Enter');const dialog=page.getByRole('dialog',{name:'意味付きの関係を編集',exact:true});await dialog.getByLabel('関係の種類',{exact:true}).selectOption('related');await dialog.getByRole('combobox',{name:'関係の始点',exact:true}).selectOption(a.id);await dialog.getByRole('combobox',{name:'関係の終点',exact:true}).selectOption(b.id);await dialog.getByLabel('関係の向き',{exact:true}).selectOption('symmetric');await dialog.getByRole('button',{name:'関係を保存',exact:true}).click();await expect(dialog).toBeHidden();
  22 |  const updated=page.getByRole('button',{name:'配置Aから配置Bへ、関連、関係を編集',exact:true});await expect(updated).toBeVisible();await expect(line).toHaveCount(0);await expect(updated.locator('line').nth(1)).toHaveAttribute('marker-start','url(#world-relation-arrow)');
> 23 |  await page.setViewportSize({width:320,height:844});await page.getByRole('button',{name:'関係表',exact:true}).click();const reference=page.locator('.world-relation-meaning strong').filter({hasText:'参照 · data.gate.children[1].children[0].variableId'});await expect(reference).toHaveText('参照 · data.gate.children[1].children[0].variableId');await expect(reference).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
     |                                                                                                                                                                                                                                                                                 ^ Error: expect(locator).toHaveText(expected) failed
  24 |  await page.evaluate(()=>document.documentElement.style.fontSize='200%');await expect(reference).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);await page.evaluate(()=>document.documentElement.style.removeProperty('font-size'));await page.setViewportSize({width:1440,height:1000});await page.reload();await graph(page);await expect(updated).toBeVisible();await expect(node.locator('text')).toHaveAttribute('x',String(x+40));const after=await completeImage(page);expect(after.relations).toHaveLength(1);expect(after.relations[0]).toMatchObject({id:p.relations[0].id,fromId:a.id,toId:b.id,relationType:'related',direction:'symmetric'});expect(after.entities).toEqual(before.entities);
  25 | });
  26 | 
```