# Stage F — approved plan 11, then 10

Worktree: `/workspace/approved32-F`; branch: `impl/stage-f`.
Base: `6a825705c625555291cf58f47b0229bf53f5d593` (reviewed C03/29, B02/04, H19 and M27 inherited).
Read `/workspace/implementation-work/stage-F-brief.md` and this worktree's `AGENTS.md` before implementation. No changes outside this worktree; no subagents, external messages, merge or deployment.

## Implementation

11: History now offers independent arbitrary immutable source/comparison snapshot selectors. Paragraphs match entity ID + field + block ID; settings, status/state, relation and attachment metadata records match stable IDs. Project settings are also compared. Horizontal and vertical comparison remain available at phone widths. Only changed paragraphs uniquely present in both editions and the current draft can be selected. A second preview explicitly shows the current draft before restoration and the selected source paragraph after restoration. Confirmations include project/base revision, both snapshot IDs, exact selected IDs, complete before/after paragraph differences and a confirmation hash. Commit re-previews, rejects stale/tampered confirmation, then uses the existing saveProject command transaction once. Immutable editions and unselected paragraph content remain intact. The existing undo command compensates the entire restoration in one operation. Missing/duplicate IDs require reselection; this implementation intentionally does not guess insertion locations for absent paragraphs.

10: History also offers human-name occurrence search and explicit checkbox selection, with chapter, entity, body/dialogue field, surrounding text, code-point offsets, quotation context, linked target names/IDs/version IDs, and same-name unlinked character candidates. Candidate filtering does not silently select occurrences. Confirmation captures the exact source revision, term/replacement and complete selected positions/context/references; commit checks all positions and source revision before the single saveProject transaction. Replacements run from right to left within each paragraph through existing editRichText and entity/relation reference remappers. Unicode positions, ruby, links and current anchors use the existing semantics; annotations overlapping replaced text become existing unresolved/relink records, while unaffected annotations shift. Historical pinned anchors and snapshots stay fixed. One undo restores the entire command, including text and annotations. Busy controls and a synchronous ref prevent duplicate UI submissions; concurrent store submissions allow at most one save against the same revision. Failures remain atomic.

The author busy state is registered through the existing HistoryPanel state. Cancel buttons abandon each preview without saving. History undo now clears its prior success notice at operation start so an earlier success cannot incorrectly indicate that the next undo has finished.

No new canonical persistence table, schema version, sidecar write or alternate save authority was added. SnapshotAnchorPreview/recovery were inspected; existing immutable snapshot read/save guards and recovery/undo command infrastructure were reused, with no unrelated edits there. Comparison indexing and chapter context lookup avoid repeated full-entity scans; DOM lists use existing paging. No large-work performance acceptance claim is made.

## RED → GREEN and verification

- Initial targeted RED: `npm test -- --maxWorkers=1 --fileParallelism=false tests/stageF.test.ts` failed importing the not-yet-existing selectiveEdits module. Baseline inspection showed history supported history-command whole/entity restoration but no arbitrary immutable pair/selected paragraph or occurrence transaction.
- Added regression RED: restoring one of two identical paragraphs detached the other paragraph's exact anchor. GREEN after `restoreRichTextBlock` registered the known block replacement range with the existing text-origin remapper.
- Added quotation RED: `「アオ」とアオ。` incorrectly marked both occurrences quoted. GREEN after paired quote tracking; same-name unlinked candidate IDs also asserted. Quotation positions are computed once per paragraph.
- Browser first run reached compare, restore, replacement and export checks but its final reload outran the second undo because the previous HistoryPanel success notice remained visible. Clearing that notice at undo start fixed the completion indicator; subsequent browser runs passed through undo + reload.
- Final focused unit command: `npm test -- --maxWorkers=1 --fileParallelism=false tests/stageF.test.ts tests/textEditing.test.ts` — 28 tests, 2 files PASS (10 new Stage F cases plus 18 existing text-edit cases).
- Unit coverage includes stable-ID matching for settings/state/asset metadata despite record reorder; selected paragraph only; both pins unchanged; one-step undo; stale revision; ambiguous IDs; tampered confirmation; same-name linked and unlinked candidates; quotation boundaries; following ruby/link remapping; emoji positions; multiple selected replacements in one paragraph; duplicate/concurrent command attempts; quota fault rollback for both operations.
- `npm run build` — PASS. Vite emits nonfatal dynamic-import and large-chunk warnings.
- `npm run check:docs` — PASS.
- `npm run check:completion-plan` — PASS.
- Browser: `CHROMIUM_PATH=/tmp/approved32-browsers/chromium-1248/chrome-linux64/chrome npm run test:e2e -- --config playwright.stage-f.config.ts` — PASS, dedicated loopback port 4184 with network permission. Config uses only this focused spec. Initial attempt without loopback network permission could not start the server; the permitted run succeeded.
- Browser viewport: Chromium desktop engine, 402×700 portrait and 700×402 landscape. Both comparison modes visible; no document horizontal overflow. Actual downloaded complete archives were parsed and compared after selected restoration, after replacement, and after one undo + reload. Two immutable snapshots, unselected quote block, text and ruby were checked. The helper retains the actual archives as Playwright attachments under the ignored local test-results directory.
- `git diff --check` — PASS.
- Full suite and formal acceptance remain assigned to the root integrator; no full-suite or physical-device claim is made here. No pre-change physical or browser acceptance pass was performed; the baseline evidence is code inspection and targeted RED.

## Files

- `src/domain/selectiveEdits.ts`: comparison indexes, unique paragraph resolution, occurrence context and pure selected transformations.
- `src/domain/text.ts`: explicit block restore origin registration using existing position transforms.
- `src/storage/store.ts`: four preview/commit entry points using current revision guards, confirmation hashes, existing saveProject and undo.
- `src/ui/SelectiveEditsPanel.tsx`: pair comparison, phone layout switch, selected preview/commit/cancel, occurrence search/filter/selection.
- `src/ui/HistoryPanel.tsx`: integrate panel and existing busy state; clear prior undo completion notice.
- `src/ui/TextAnnotations.tsx`: direct users to the saved-draft occurrence flow.
- `src/styles.css`: comparison columns and wrapping at phone widths.
- `tests/stageF.test.ts`: focused domain/store regression and failure tests.
- `tests/e2e/stage-f-selective-edits.spec.ts`: actual UI, complete archive verification and undo/reload.
- `playwright.stage-f.config.ts`: reproducible dedicated port 4184 focused browser config.
- `stage-F-report.md`: this handoff.

## Exact manual updates for root integration

Per task instruction `no manualcontent`, `src/manuals/content.ts` is unchanged. Add the following two steps to the existing `text` manual (title `本文・段落・ルビ・リンク・検索位置`), directly after the current step beginning `「本文のルビ・リンク」で段落と語句の範囲を選び`:

```ts
      '人名の一括置換は、編集中の内容を保存してから履歴で行います。「文章と参照先を検索」で章・本文・台詞・引用・参照先IDを確認し、一致位置を選び、置換差分を確認して一度に保存します。別の編集が入ったら再検索します。取消1回で本文・ルビ・リンク・参照をまとめて戻せます。',
      '履歴の「任意の二つの固定稿を比較」で戻す稿と比較稿を選び、横並びと縦の順送りを切り替えます。選択段落と現稿の復元差分を確認し、選択段落だけ現稿へ保存します。IDが欠落・重複する段落は選び直します。設定・状態・素材の差分もIDで確認でき、固定稿は保持されます。',
```

## Pending physical / formal checks

- iPhone 17 Pro Safari: record real model, OS, Safari version, viewport; portrait/landscape/402×700-like short portrait and enlarged text. Verify touch sizes, long scroll, Japanese keyboard, rotation and app switching. Chromium viewport emulation above is separate evidence.
- Large standard/large manuscript cold-start/typing/search/two-edition timing and memory against the existing performance plan remain unmeasured.
- Real quota exhaustion/interrupted browser process and another-tab editing acceptance remain pending; injected transactional faults, concurrent submissions and stale revisions are covered by focused unit tests.
- Complete old-material archive open/edit/export/restore across a separate physical device with real image/audio playback remains pending. This change preserves immutable snapshots in exported fixture archives; its asset comparison test covers metadata, not physical media playback.
- Root must integrate exact manual steps and run full-suite/formal CI. No formal release acceptance or deployment is asserted.
