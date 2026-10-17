# P2-01 independent code-quality re-review

Status: **CHANGES REQUIRED** for frozen `609be2017634c703ff60e7650d18d4dae750d89a`, tree `cb66fa196853671014e3231662ac9bc8f6062282`. The original review remains intact in `task-2-quality-review.md`. Both original findings are resolved for their recorded scenarios, but the retained-edition fix introduces one additional blocking case below.

Reviewed committed `b7812bb..609be201` changes and cumulative relevant source through `git show`/`git diff`, including the exact source-fingerprint capture/cache/view proofs, final publication fences, selected-world lookup, zero-registry fast path, instrumentation, and added regression tests. No product/test edits, test runs, timings, helpers, live services, or devices were used.

## Remaining finding

**Medium — unrelated catalog corruption now blocks a healthy editable world with no retained registry editions.** `src/ui/WorldVersions.tsx:28` newly calls `loadWorldSource(worldId)` unconditionally after successfully loading editable W. `src/storage/store.ts:859` throws when W has no matching unloaded catalog summary but **any** catalog entry has `contentState === 'error'`.

Concrete scenario: editable W contains a valid snapshot and has never been pinned into the registry; unrelated registry source Z has a recognizable different project ID but invalid/unsupported stored content and a missing/invalid catalog derivation. Catalog backfill reports Z as error while preserving its canonical row. Open healthy independent B and select W. `loadEditor(W)` succeeds because W has no dependency on Z, but the optional retained-edition lookup throws solely because of Z. `WorldVersions` enters error state and removes W's usable snapshot choices. This undoes the intended isolation of unloaded malformed sources.

Distinguish absence of retained editions for W from catalog/source failures belonging to W. Keep actual selected-source corruption as error/unknown; do not swallow every retained lookup error into an empty registry. Add the W-with-no-registry plus unrelated malformed-Z counterexample alongside the selected-corrupt-source rejection test.

## Resolved original findings

1. **Retained editions for editable sources:** `WorldVersions.tsx:28`–29 now obtains retained source images and merges them with editable current content through the existing `mergeWorldSources` ordering. The dedicated browser scenario constructs editable S1 plus registry-only S2 and exercises S2 selection and adoption. This addresses the original lost-edition case; the remaining finding concerns error attribution when the selected source has no registry editions.
2. **Late pin publication:** `App.tsx:245`–249 applies the saved project, captures the active selection generation/project/revision, checks ownership before the dependency read, and rechecks after it. A completion owned by A cannot overwrite active B. Capturing after save confirmation also permits an A→B→A return before completion to publish the newly saved A closure. The source-picker callback additionally checks rendered owner/revision/generation. The added delayed-pin browser scenario targets the original race.

## Source-proof and instrumentation checks

- Native source hash is captured in the same read transaction as decoded header/current rows (`store.ts:696`–703). Selected cache hits require the canonical graph's previously recorded source hash, in addition to revision/history checks. A newly observed same-revision header cannot be stamped onto an older graph merely because revision/history still match.
- Cold graphs pass the existing full selected validation before cache association. `rememberProject` keeps its epoch/lifetime/newer-save protections; a rejected cache publication does not cause another graph to inherit its hash. The returned view receives a separate weak proof, so final `loadEditor` publication compares against the captured native source. Hash mismatch rejects and avoids evicting a strictly newer revision.
- `listEditorWorldSnapshots` checks proof identity, revision, access generation and lifetime before using the native-header fence. Callers without an applicable proof retain the decoded revision fallback. It recomputes the dependency closure; mutable view roots do not reuse a cached closure solely by ID/revision.
- The zero-world count query returns the only possible registry, empty, while full selected validation still runs and rejects unresolved foreign references. Count calls/results have explicit numeric probe metrics. This does not redefine `.rows` as traversal counts or hide the added native header reads.
- Added tests address packed header decoding once across editor/world publication, mid-read same-revision mutation, H0→same-revision H1 cache refresh then unsupported H2 rejection, and missing foreign references with an empty registry. Their reported successful execution is controller/implementer evidence, not independently rerun here.
- The pending-assets test now creates a real unacknowledged attachment and checks the original `getSaveState` oracle (`pendingAssetCount: 1`, pending) alongside the summary's unloaded aggregate.

The original harness provenance/scope conclusions remain: shared candidate store/components, single OFF/ON observations, inclusive display/check work, explicit one-time backfill, and canonical cache bytes rather than heap/GC proof. Reported 54/54 focused, Chromium 6/6 and TypeScript success do not establish full original CI/build/three-engine/downstream acceptance or formal 30/180/7200 conditions. All original inventory/fixture/assertion/limit and RELEASE BLOCKED constraints remain in force.
