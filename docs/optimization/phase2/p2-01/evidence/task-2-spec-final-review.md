# P2-01 final SPEC boundary review

Status: **CHANGES REQUIRED** for one residual isolation issue in frozen head `609be2017634c703ff60e7650d18d4dae750d89a`, tree `cb66fa196853671014e3231662ac9bc8f6062282`.

Prior reports are preserved. Reviewed committed product code, added tests and design changes since the 41855fd review through `git show`/`git diff`; no tests, measurements, helper agents or product/test edits were performed.

## Residual finding

**Medium — an unrelated corrupt registry source disables a healthy editable world's snapshot picker.** `src/ui/WorldVersions.tsx:28` now calls `loadWorldSource(worldId)` for every editable source to obtain additional retained editions. `src/storage/store.ts:859` throws when the requested project has no valid catalog source and **any** catalog entry is an error, without relating that error to the requested project.

Exact scenario: healthy editable W has its own valid snapshot S1 and no entries in `worlds` (normal for a world saved/imported as an editable project before any pin is retained). A different registry source X has an unsupported or corrupt native project and a missing/corrupt catalog entry, so per-row backfill returns an error for X. From independent B, select W. `loadEditor(W)` succeeds, but its newly mandatory retained-edition lookup throws because X is an error. WorldVersions catches this, sets W's source state to error and exposes none of W's already validated snapshots. In 41855fd this editable-source path did not perform that optional registry lookup, so it did not have this coupling.

This violates the explicit isolation of unselected corrupt/unsupported works and retention of existing world-source selection. Do not treat a global catalog error as proof that the requested source failed. Preserve the selected corrupt source's error/unknown semantics while keeping unrelated healthy editable W and its verified S1 usable. Add this combined counterexample; the present tests separately cover corrupt registry sources and current+retained valid editions, but not their interaction.

## Other final changes checked

- Native source fingerprints are captured in the same read transaction as decoded current content. A cached graph is reused by selected loading only when its own WeakMap source binding matches that capture; a revision-only cached image is reread. `rememberProject` epoch behavior cannot stamp the newly observed fingerprint onto a different cached graph. Returned-view proofs are separate. Final editor and world-publication fences compare native fingerprints, while proofless callers keep the old revision fallback. The new tests cover same-revision H0→H1 refresh, unsupported H2 rejection, mutation during validation, and one packed-header decoding across editor/world publication.
- Empty canonical registry count returns the exact empty registry; full cold validation still executes and rejects unresolved foreign references. Its observed count is explicitly instrumented. No dependency-closure cache was introduced for mutable returned roots.
- With valid registry entries, editable source selection now merges current W with retained editions such as registry-only S2; the browser test selects and saves S2. Snapshot merge ordering uses the existing `mergeWorldSources` behavior.
- Pin-save result publication checks active owner, selection generation and saved revision after save confirmation and again after loading worlds. A late A completion does not replace B's closure. Source-picker publication also checks the rendered owner's generation/revision. The added browser scenario exercises A save completion after selecting B.
- The asset-status regression now includes a real unacknowledged attachment and verifies the old `getSaveState` oracle reports pending before asserting the summary's explicitly unloaded state.

The original three findings remain addressed; the residual above arises from the subsequent retained-edition integration. Focused result counts were inspected as test definitions, not independently executed. Performance measurements and full mandatory CI remain separate pending gates; this report does not alter the original inventories, time limits, external blockers or release status.
