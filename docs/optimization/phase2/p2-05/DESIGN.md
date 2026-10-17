# P2-05 dependency closure and cache ownership plan

> Execute inline with test-driven-development and verification-before-completion. The controller owns independent reviews, CI and publication; no helper agents.

**Goal:** Limit inactive retained project graphs and select operation dependencies without losing immutable editions, drafts or pending saves.

**Architecture:** Read complete immutable world rows for explicit and typed dependencies. Unknown shapes or ownership keep the original full-registry path. Keep save inputs and native head/history in an operation capture; cache retention is separate from content/access invalidation. App keeps adopted dependencies and one current preview owner separately.

**Tech stack:** TypeScript, Dexie/IndexedDB, React, Vitest, Chromium.

**Spec:** [Phase 1 D05](../../phase1/DESIGN.md), [handoff](../../phase1/HANDOFF.md). Exact starting commit: `5b3949253937f1880bd426b39706c90a1db2e343`, tree `c24e4391ac29a1e2ef9af3aecc65ae145b13b59a`.

## Constraints and comparison

Original 104 requirements / 116 cases / 464 clauses / 24 packages / 6 groups / 68 supplements / 73 locked inputs, 94 local / 22 external and RELEASE BLOCKED are unchanged. No fixture/assertion/timeout/retry/skip relaxation. Native formats, canonical snapshots/history, request hashes, global immutable collision guards and original numeric bounds remain unchanged. P201 already implements selected current closure and releaseEditor; those are baseline behavior, not P205 gains.

| Alternative | Decision and cost |
| --- | --- |
| Operation closure of complete rows; direct keys first, owner discovery/full fallback when needed | Selected. No canonical metadata or migration. Unknown owner scans and validates the registry; this cost remains O(registry). Separate current/save/history/export roots; never infer absent from unloaded. |
| Persist retained-snapshot owner catalog | Deferred. Requires all pin/ACK/import writers to maintain a complete versioned catalog atomically, old-version fallback and extra metadata bytes. Existing worldSources catalog proves discovery only. |
| Shared global pin LRU/refcounts | Deferred as in D05: more lifetime/permission complexity than inactive project retention. |

Current/save include current and retained snapshots/alternatives. Full reads include historical before/after. Selected history keeps P204 materialization and current restore validation. Full export/recovery keeps one native capture and every historical/pending/retained/sync-recovery dependency; its full registry capture is a deliberate safe fallback, not an O(closure) claim. Whole immutable rows and the existing writer collision guard remain authoritative.

## Review focus

- Differently keyed retained snapshots, transitive pins and typed anchors must resolve exact original IDs/hashes.
- Eviction between hydration and save continuation must not create a false revision conflict or lose the command parent.
- Old reads/saves must not publish after release, role/lifetime changes or a project token being recreated.
- Clean and dirty editor/history tokens must survive ordinary retention pressure; canonical/outbox/assets are outside this budget.
- UI preview replacement must keep adopted dependencies, all picker choices and failed-preview input.

## Task 1: bounded project ownership and save capture

Modify `src/storage/store.ts`, numeric metrics in `src/observability/probe.ts`; add `tests/optimization/world-cache-ownership.test.ts`.

- [ ] RED: public reads/saves of 12 projects leave at most four inactive cache graphs and matching project/head/history keys; released metadata is empty.
- [ ] RED: actual editing/full hydration returns after release; a valid save advances exactly one revision/history/outbox and retains its literal native parent.
- [ ] RED: a held committed save released before continuation does not repopulate any of the four collections.
- [ ] Implement capacity four as an internal retention choice, unique identity epochs, operation-local previous/head captures and publication fences. No new domain/input limit.
- [ ] GREEN: new ownership tests plus original cacheConcurrency, save/hash/atomic and P201 library tests; targeted TypeScript check.

## Task 2: operation dependencies and preview ownership

Modify `store.ts`, focused `src/storage/worldClosure.ts`, `nativeExport.ts` if the retained-owner RED proves it necessary; `App.tsx`, `ui/WorldVersions.tsx`, focused UI registry helper. Add `tests/optimization/world-operation-closure.test.ts` and focused ownership/browser proofs.

- [ ] RED: full/editing/save known dependencies avoid unrelated body reads; compare actual output against full-registry validators plus literal pin/record/hash expectations.
- [ ] RED: retained old snapshot stored only under new outer key survives current/full/save/export/import and selected history; corrupted/missing/unsupported dependencies reject unchanged canonical/input state.
- [ ] RED: A→B→C preview sequence retains adopted A plus current preview, while failed preview preserves author choices and late results cannot publish.
- [ ] Implement only the evidence-backed paths; unknown shapes/ownership retain full fallback and count it honestly.
- [ ] GREEN: new proofs and original worldPins/hash/import/export/recovery/cold/clean-dirty alternative tests without changing original tests.

## Task 3: check-default comparison driver and frozen review checkpoint

Add owned `scripts/optimization/measure-world-ownership.mjs` and `tests/optimization/world-ownership-measurement-*` files. Reuse the reviewed P204 observer only after inspecting its failure semantics.

- [ ] RED/GREEN controlled tests for check-mode clock/probe prohibition, rejected OFF elapsed, ON observation completeness and active interruption evidence.
- [ ] Default check mode: real Chromium, literal exact baseline and candidate, same original Standard/Large generator; actual source/overlay/generated/build ZIP/member/input provenance; unique output directories preserve failed attempts.
- [ ] Separate OFF latency, ON rows/hash/bytes and store/UI retention counts. Optional separate fresh-context CDP heap observations explain GC/transient limitations; no retained-memory/peak acceptance claim.
- [ ] Run focused tests/typecheck/docs and correctness-only checks. Record actual commands/exits and limitations. Commit clean source+driver, request independent exact-head spec and quality reviews, then STOP before timing capture.

Rollback: restore full registry readers, disable bounded retention and replace preview owner policy with the original paths. No canonical deletion or migration rollback is required.

The comparison runner's default 1,200,000 ms watchdog bounds its supplemental browser orchestration (core sequence and functional UI proof). It is separate from the unchanged original 600,000 ms operation condition and 2,000 ms conditions; it changes no original fixture, accepted condition, retry, timeout or skip. Check mode records no interval clocks, probes or heap observations. A separate optional fresh-context CDP diagnostic is available only in capture mode after the controller's review gate.
