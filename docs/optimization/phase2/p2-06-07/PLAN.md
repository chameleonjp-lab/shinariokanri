# P2-06/07 implementation plan

> Execute inline with `superpowers:executing-plans`; use TDD and one independent whole-branch review. The user authorized completion of phase 2 on 2026-10-18. Only PR #67 was authorized to merge; subsequent work is submitted as Draft PR evidence.

**Goal:** Complete the remaining derived-index, field-semantics and collection-read work against actual integrated main, with bounded retention, independent correctness checks and literal-source measurements.

**Architecture:** A ScenarioStore-owned, revocable lease binds derived work to private immutable current content. Evaluation scopes check the complete source/header identity and actual schema signature before sharing. Unknown/mutable inputs retain full regeneration. Ordered ID collections separate row acquisition, page and selection; full editor/DB validation remains intact.

**Tech stack:** Existing TypeScript/React/Dexie/Vitest/Playwright; no new dependencies or external services.

**Spec:** `docs/implementation/codex-three-phase-2026-10-17/PHASE_2_OPTIMIZATION.md`, `docs/optimization/phase1/DESIGN.md`, `docs/optimization/phase1/HANDOFF.md`, and historical `docs/optimization/phase2/reassessment-20261018/`.

## Global constraints

- Baseline is actual main `a13d8fad93b1a4a14c4cc4d45ab98783388de177`, tree `7876a9346443f47f49e5f057801f647c85726f56`; original #63/#64/#65 merge commits are all ancestors.
- Preserve 104 requirements, 116 cases/464 clauses, 24 stages/6 groups/68 supporting checks, all original fixture/seed/bytes/assert/timeout/retry/skip values, and native 1.0 format.
- Preserve 30 repetitions, 180 saves, 7200 seconds, 600000 ms and 2000 ms as their original contracts. Final integrated formal reacceptance belongs to phase 3; supplemental measurements never replace it.
- No devices, production/auth/service changes, payment, deployment, publication, further main merges, DB migrations, X-feature adoption or changed release criteria. RELEASE BLOCKED remains.
- Author classifications, confirmed references, suggestions/ignore decisions and post-projection public terms remain separate. A derived cache is not validation or authorization evidence.
- Source identity, raw values/failures, actual build bytes and independent expectations accompany every comparison. OFF latency and separate ON numeric diagnostics are not mixed.

## Review focus

1. Equal IDs/revisions in different accounts, revoked roles, old views after close/release/save, and delayed reference preparation must not share or republish another owner’s cache.
2. Mutable or foreign records passed to the single-record query API must keep their own text/meaning; a trusted project must not turn an ID match into an object-identity proof.
3. In-place schema edits, root header edits and same-ID/different-hash world replacements must invalidate work; malformed/cyclic dependencies cannot establish a proof.
4. `character.goals`/`group.members` are formal references, while `scene.goals` and authored UUID-looking text are searchable; public names/IDs and private aliases stay separate.
5. Hidden selected IDs, tail pages, Japanese search/order and original move indices survive filtered navigation. Unloaded/stale data is not an absent row; paging does not claim fewer DB rows.

## Task 1: Correct formal-reference text boundaries

**Files:** `src/domain/catalog.ts`, focused catalog tests, `tests/optimization/semanticStudy.test.ts`.

**Interface:** `collectCatalogText(entity)` retains its API; its corpus excludes only actual formal-reference leaf paths in addition to the existing ignored metadata.

- [x] Add tests that search concrete goals/member IDs and retain scene goal text and authored UUID-looking strings; watch the original implementation fail.
- [x] Use the existing model reference walker to exclude those paths. Keep type- and field-specific meanings, original query order and foreign-record behavior.
- [x] Update the live known-discrepancy assertion to require zero; keep the archived historical discrepancy/source/evidence unchanged.
- [x] Run focused domain/research tests and commit the correction.

## Task 2: Store-owned bounded derived indexes (P2-06)

**Files:** new `src/domain/derivedIndexes.ts`, `src/storage/store.ts`, `src/domain/model.ts`, `src/domain/catalog.ts`, `src/domain/stateUsage.ts`, `src/domain/linkCandidates.ts`, `src/ui/referenceIndex.ts`, their callers/tests and numeric probe declarations.

**Interfaces:** `beginDerivedEvaluation(project)` returns a revocable evaluation only for a registered immutable saved view. `ProjectDerivedOwner` binds views, admits bounded numeric-cost entries and clears immediately. Store construction supports an internal disabled/budget comparison option; no product UI setting is added.

- [ ] Add real-store tests showing two compilations currently build two indexes/text corpora; assert one build on the same valid saved source, then full rebuild on revision/role/account/close/schema/root changes.
- [ ] Implement source ownership without copying/retaining history, proving immutable plain current data lazily. Check actual schema rules once per evaluation, never once per entity.
- [ ] Share dependency indexes and normalized text, Japanese author terms, link-term preparation and eligible state/reference indexes. Keep option-dependent labels/exclusions per call and hash verification before fixed reuse assessment.
- [ ] Use bounded admission without repeated whole-corpus LRU eviction; report logical references/text units separately from heap. Invalidation clears entries and strong source references.
- [ ] Preserve mutable/unknown full fallbacks and reference preparation’s no-partial-publication/cancel contract. Returned mutable containers cannot corrupt shared internal values.
- [ ] Run lifecycle, negative, existing targeted domain/UI/storage tests and the full unit suite; commit.

## Task 3: Common meaning and ordered collection reads (P2-07)

**Files:** new field-semantics/ordered-collection modules and independent expectation fixture; `src/ui/fieldSpecs.ts`, `WindowedList.tsx`, `ListWindow.tsx`, `CatalogPanel.tsx`, relevant list callers/tests.

**Interfaces:** descriptors derive model field/reference semantics from the existing registry, while UI labels/layout and public allowlists retain independent contracts. Ordered collections expose ordered IDs, bounded page reads, original ordinal and independent selection lookup.

- [ ] Freeze independent baseline field/UI/public expectations before deriving new behavior; add negative tests for kind-specific goals, references, conditional/nested fields and deliberate public enum restrictions.
- [ ] Implement descriptor coverage and consume it at an existing semantic/UI boundary. Keep schema generator output unchanged and detect drift against independent fixtures.
- [ ] Add failing page/selection/ordinal tests, then implement the ID collection provider and integrate list/catalog consumers. Compare current, ordinal-only A and provider B without calling A a DB read model.
- [ ] Keep full validated current DB reads as the safe fallback. Record actual provider row reads, search scans, DOM count and DB reads independently; do not infer DB reduction from page size.
- [ ] Run all original relevant navigation/Japanese/catalog/public/reference checks plus new counterexamples; commit.

## Task 4: Measurements, review and final Draft delivery

**Files:** supplemental measurement harness/checker/tests and `docs/optimization/phase2/p2-06-07/` reports, manifests, source/build identities and raw evidence.

- [ ] Seal clean product commits and unchanged original Standard/Large inputs. Measure repeated queries and page/selected reads with 30 repetitions; compare disabled/current, selected bounded reuse and the rejected alternative/budget. Separate cold setup, repeated work, retained logical entries and actual heap observations.
- [ ] Exercise real native IndexedDB and browser UI paths where claimed. Record save/rename/alias/delete and dependency invalidation; unchanged operations retain existing literal-source evidence and are not relabeled as new formal acceptance.
- [ ] Keep all failures and adverse values. Reject unsafe or slower alternatives; state limits of causal claims, heap/GC and any unexecuted phase-3/external conditions.
- [ ] Implement evidence validation with real negative/tamper tests; run docs/completion/phase1 and archived-source checks, original full unit/build and complete three-engine CI with recovery originals/later regressions/aggregate.
- [ ] Obtain one fresh whole-branch review, address material findings by RED→GREEN tests and suite, and submit all results as a new main-targeted Draft PR. Do not merge it.

## Completion boundary

Phase 2 implementation/comparison delivery requires every task above and original CI on the submitted source. It does not declare the phase-3 8 metrics × Standard/Large ×30, 180-save distribution, real 7200-second soak, final 72 MiB/113-history complete new/clone/cold acceptance, physical devices or external services newly passed.
