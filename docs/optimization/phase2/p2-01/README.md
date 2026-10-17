# P2-01: library summaries and selected editor loading

The current product includes the [original-CI continuity repair](ci-repair/README.md), independently approved and recaptured at `da206867`. [Parent integration proof](ci-repair/parent-integration/REVIEW.md) retains the initial failed CI and a separate clean product build. The earlier source cohorts and observations below remain historical; they are not relabelled as measurements of the repair.

Frozen product is `4daf23beb88538cf99f0a5f76fa8f529ce455717`; measured runner source is `fa4c5a843dc12e375b6c9081ac3ad68a537a0880` (tree `5734032730eab836c94de7814598a1d24c4d6aed`) (base `03aa371`). This is independent of P2-02/PR61. The additive internal v8 schema stores project summaries and a registry-only world-source catalog. Library startup retains one selected current image; other works remain unloaded. Full selected validation, durable revision/access/cancellation fences, restore-target mapping, all world sources, and retained draft warnings remain explicit.

[DESIGN.md](DESIGN.md) records D01B and its preimplementation comparison. Original Standard/Large canonical headers are343638/3432555 bytes and include ordered IDs; they cannot supply exact active counts. The pre-save byte source is [pinned P2-02 comparison](https://github.com/chameleonjp-lab/shinariokanri/blob/d828b8a797314c19ec4c4e55d31efc84cf78df2a/docs/optimization/phase2/p2-02/comparison.json), computed by [the pinned fixture-header construction](https://github.com/chameleonjp-lab/shinariokanri/blob/3824501d69b0612cb6e3a9c96e6ddf8473cdc3ca/scripts/optimization/referenceChoicesMeasurement.ts#L59); this is provenance only, not a dependency on that independent PR. Summary freshness uses the native header envelope on the same IDB snapshot. A packed body remains unverified until full editor validation. Inline header bytes, catalog keys, metadata, and one-time legacy backfill are real read costs.

## Compatibility and proof

- New `listProjectSummaries` returns exact active counts, revision, order and pending/recovered queue counts; unknown asset status produces unloaded sync state rather than an unsupported synced claim. Error rows retain known queues. Old full-array APIs remain available.
- `loadEditor` returns undefined only for actual absence; authorization/cancel rejects, malformed content retains its validation error, and concurrent durable revision changes reject. App rechecks after loading world dependencies. Unknown historical snapshot ownership uses the original full-registry fallback; this is not the general P2-05 closure optimization.
- Registry-only sources have bounded derived metadata maintained in every guarded atomic world writer. Canonical immutable keys plus the catalog digest establish catalog identity under those writers. Missing/corrupt metadata rebuilds independently; full selected source validation catches native corruption. A corrupt catalog that prevents identifying a requested source is an error, not proof of absence. Identified unrelated catalog errors do not block a healthy editable source with no retained editions; selected and unknown-owner errors reject before accepting grouped successes.
- Alternative draft checks retain at most100 head identities/hashes per summary, never content/version arrays. The existing content+nullable structurePlan hash is equivalent to the original dirty comparison on valid JSON. Immediate name/head/JSON/invalid/new-entity differences remain dirty; missing hashes are unknown. Input identity and summary-head signature fence async completion. Each actual draft input change can hash its retained content; unchanged summary refresh/project switching does not. The signature covers all retained summaries, so a changed relevant head signature may recheck retained drafts. Actual heap/GC and hashing latency of maximum-size drafts are UNKNOWN.
- Selected read fingerprints are captured with the canonical native snapshot. Cached graph proofs are weakly keyed by that exact graph, preventing same-revision header changes from inheriting an older cache image. Final editor/world publication reads raw envelopes instead of decoding packed headers again. Non-proof callers retain the decoded revision fallback. Empty registry counts are recorded separately as numeric count calls/results; unresolved foreign references still reject under full validation.
- The internal native DB version assertions change exactly70→80 in existing native-v1 migration/retry tests. All rollback, content, new/clone, timeout and original fixture assertions remain. No external portable/native/runtime format version changes.

New unit cases cover1/10/50 independent outputs, deleted counts, pending/recovered state, corrupt/unselected work isolation, source-bound rebuilds, quota/abort, actual v1/v7 DBs, import/clone, immutable packed envelopes, role revocation, concurrent saves and second-world-read publication. New browser cases cover library→editor→save→other work→restore ID mapping/world adoption, registry-only imported world choice, clean/dirty A→B/reload drafts, a deliberately held clean hash completing after newer dirty input, editable sources with registry-only editions, and a late pin save completing after another work opens, and healthy own-edition adoption despite an identified unrelated corrupt registry row.

Existing procedures retained and relevant: `src/storage/cacheConcurrency.test.ts`, `src/storage/worldPins.test.ts`, `src/storage/basicRegistration.test.ts`, `src/storage/rb09Sync.test.ts` (account/session/role and ack transaction), `src/ui/BackupPanelImportedVersions.test.ts`, `src/ui/AuthorAlternativeDraft.test.ts`, `src/storage/authorAlternativesDurability.test.ts`, `tests/e2e/project-drafts.spec.ts`, `tests/e2e/rb10-library-reopen.spec.ts`, `tests/e2e/world-workspace.spec.ts`, `tests/e2e/startup-migration-retry.spec.ts`, and `tests/e2e/ap04-original-n-atomic-migration.spec.ts`. Existing source paths are correspondence, not a claim that every case was rerun in this focused task.

## Original requirements and clauses

[requirement-correspondence.json](requirement-correspondence.json) copies the impacted production-path rows from the registered phase1 requirements map, including exact original clause pointers and procedures. All listed cases preserve `given`, `when`, `then`, and `negative_or_edge`. This is a static audit, not fresh acceptance.

| Original requirement | Original cases/clauses | Existing procedure sources |
|---|---|---|
| REQ-B12 | AT-B12, AT-E01, AT-E07 | `tests/e2e/ap04-original-bm-archive.spec.ts`, `tests/e2e/ap04-original-e07-safety-bounds.spec.ts`, `tests/e2e/ap04-original-root-restoration-output.spec.ts` |
| REQ-B13 | AT-B13, AT-E02 | `tests/e2e/ap04-original-bm-author.spec.ts`, `tests/e2e/ap04-original-e02-time-presentation.spec.ts` |
| REQ-B18 | AT-B18 | `tests/e2e/ap04-original-bm-world-narrative.spec.ts` |
| REQ-B20 | AT-B20 | `tests/e2e/ap04-original-bm-author.spec.ts` |
| REQ-B23 | AT-B23, AT-E12 | `tests/e2e/ap04-original-e12-continuity.spec.ts`, `tests/e2e/ap04-original-identity-impact.spec.ts` |
| REQ-F03 | AT-F03 | `tests/e2e/ap04-original-f-writing.spec.ts` |
| REQ-F04 | AT-F04 | `tests/e2e/ap04-original-f-writing.spec.ts` |
| REQ-F05 | AT-F05 | `tests/e2e/ap04-original-f-writing.spec.ts` |
| REQ-F06 | AT-F06 | `tests/e2e/ap04-original-f-writing.spec.ts` |
| REQ-F09 | AT-F09, AT-E09 | `tests/e2e/ap04-original-e09-world-production.spec.ts`, `tests/e2e/ap04-original-f-world-versions.spec.ts` |
| REQ-F10 | AT-F10 | `tests/e2e/ap04-original-bm-f07-12-world.spec.ts` |
| REQ-F11 | AT-F11 | `tests/e2e/ap04-original-bm-f07-12-world.spec.ts` |
| REQ-F12 | AT-F12, AT-E05 | `tests/e2e/ap04-original-bm-f07-12-private-projection.spec.ts` |
| REQ-F25 | AT-F25 | `tests/e2e/ap04-original-f-material-output.spec.ts` |
| REQ-F31 | AT-F31, AT-E01, AT-E11 | `tests/e2e/ap04-original-f31-same-work-helper.ts`, `tests/e2e/ap04-original-n-mobile-offline.spec.ts` |
| REQ-F32 | AT-F32, AT-E01, AT-E11 | `tests/e2e/ap04-original-f-source-schema.spec.ts` |
| REQ-F33 | AT-F33 | `tests/e2e/ap04-original-f-resume-recovery.spec.ts` |
| REQ-F35 | AT-F35, AT-E07, AT-E12 | `tests/e2e/ap04-original-e07-safety-bounds.spec.ts`, `tests/e2e/ap04-original-e12-continuity.spec.ts`, `tests/e2e/ap04-original-f-source-schema.spec.ts`, `tests/e2e/ap04-original-root-restoration-output.spec.ts` |
| REQ-N01 | AT-N01, AT-E01 | `tests/e2e/ap04-original-n-mobile-offline.spec.ts` |
| REQ-N06 | AT-N06, AT-E06, AT-E12 | `tests/e2e/ap04-original-e12-continuity.spec.ts`, `tests/e2e/ap04-original-n-atomic-migration.spec.ts` |
| REQ-N09 | AT-N09, AT-E07 | `tests/e2e/ap04-original-e07-safety-bounds.spec.ts`, `tests/e2e/ap04-original-root-restoration-output.spec.ts`, `tests/e2e/rb10-import-errors.spec.ts` |
| REQ-N11 | AT-N11, AT-E12 | `tests/e2e/ap04-original-e12-continuity.spec.ts`, `tests/e2e/ap04-original-n-mobile-offline.spec.ts` |
| REQ-N14 | AT-N14, AT-E07 | `tests/e2e/ap04-original-e07-safety-bounds.spec.ts`, `tests/e2e/ap04-original-n-safety-recovery.spec.ts`, `tests/e2e/ap04-original-root-restoration-output.spec.ts` |
| REQ-N18 | AT-N18, AT-E12 | `tests/e2e/ap04-original-e12-continuity.spec.ts`, `tests/e2e/ap04-original-n-failure-retry.spec.ts` |
| REQ-N19 | AT-N19 | `tests/e2e/ap04-original-root-restoration-output.spec.ts` |

Supporting state/access clauses also retain REQ-F34 (AT-F34/E06/E12), REQ-N07 (AT-N07/E06), and REQ-N08 (AT-N08/E05), with exact original pointers copied in the correspondence artifact. `src/storage/rb09Sync.test.ts`, `tests/rb09Features.test.ts`, `tests/e2e/rb09-inputs.spec.ts` and `tests/e2e/rb09-sharing.spec.ts` remain relevant account/session/role procedures. The new store role-revocation and cancelled-lifetime tests supplement these; they do not establish live-service auth acceptance.

Independent [specification review](evidence/task-2-spec-approval-review.md) and [code-quality review](evidence/task-2-quality-approval-review.md) approve product source4daf23b within their stated limits. Controller separately approved the measurement-only runner fix fa4c5a8; product/test files are identical.

## Validation and measurement limits

Final documentation and completion-plan checkers passed, preserving all original inventories. Final focused verification:55/55 unit tests in6 files, TypeScript exit0,7/7 real HTTP-loopback Chromium cases. Original migration/retry cases passed4/4 in a production HTTP build before the review follow-up; existing project-drafts/library-reopen/world-workspace passed in the earlier wider run. The dev-server migration attempt had4 setup failures because its build-info fallback opened the new DB before v1 seeding; that raw run is retained separately. Initial test setup failures, expected RED failures, first falsely passing world counterexample, corrected RED, and superseded d4/63/b781/609 measurements remain distinguishable from final GREEN.

The browser administrator blocks file://. No browser policy, test expectation or original timeout was altered. HTTP-loopback diagnostics use supported permissions. Controller reports the complete original suites and hosted gates separately.

The timed backfill deletes only derived summary rows from the seeded native DB; it measures missing-derivation reconstruction, not the v1→v8 schema upgrade itself. Actual v1/v7 compatibility is a separate correctness test.

Every comparison captures source/build hashes, browser/environment, original fixture hashes, real material bytes, OFF intervals and ON numeric diagnostics. Common-store comparisons use the candidate store for both legacy API and selected API. The frozen main App has import-path-only adaptation but shares candidate components/store; it is not literal main-before. OFF time covers list plus display-summary preparation (active-count filtering, independent JSON assertions and summary-byte preparation), not isolated API duration. Each value is a single observation, not p95 and not formal30/180/7200 acceptance. The API harness uses separate newly reopened stores on one seeded DB, in fixed legacy→summary→selected order; fixture seeding is excluded. Browser/OS storage caches are not flushed, so cold means application-cache cold, not device cold. ON payload accounting affects timings and is kept separate.

The unchanged phase1 ON profile compares literal-main and candidate reads/writes on the same original fixtures, exposing new source-fingerprint/summary writer overhead. It does not substitute for OFF latency or formal acceptance. Retained cache records mean entity+relation records; canonical byte counts exclude JavaScript overhead, UI duplication, heap and GC. Browsing world sources can retain their graphs in the current editor registry for preview/adoption; no bounded heap claim is made for that path.

## Rollback and unresolved gates

Restore the legacy list/UI behavior while retaining additive v8 schema support. Do not downgrade/delete the native database. Derived rows can be rebuilt; canonical content is never repaired by summary backfill. Large legacy backfill can still be expensive and catalog backfill may read full worlds; steady-state savings do not remove that one-time cost. General dependency closure, save-pipeline optimization and other phase2 tasks remain separate.

All original104 requirements/116 cases/464 clauses,24 work packages,6 regression groups,68 supplemental checks, fixtures, material bytes and30/180/7200/600000/2000 thresholds remain unchanged. Original acceptance remains94 local/22 external/RELEASE BLOCKED. Full downstream/browser-engine gates, real devices, remote auth/settings, and formal performance acceptance are not promoted by these diagnostics.

## Generated-input provenance correction

The earlier `p2-01-approved-*` cohort on4daf is superseded: its ignored generated portable runtime was stale (171175 bytes; SHA recorded in the four library/UI raw captures). Clean prebuild produces171219 bytes, SHA `7a9a23aa2934884b8109fc67d06d0ad7795db8a92c3b863e04fc5ce094ed9cc9`; the difference includes the new numeric count probe dimensions. Git cleanliness alone did not detect the stale generated input. Commit fa4c5a8 makes the new library runner invoke the existing portable-runtime generator before source hashing and bundling, with generator output on stderr and failures preserved through the existing error path. Original phase1 runner remains unchanged; its original prebuild runs first. All six final `p2-01-consistent-*` captures use fa4c5a8 and the regenerated input. Earlier raw results and actual builds remain intact and explicitly superseded, including unfavorable observations. No product change or original assertion adjustment accompanied this correction.

The unchanged phase1 driver lists tracked sources and therefore omits the ignored runtime from its own source-file array. [Supplemental generated-input provenance](evidence/p2-01-generated-input-provenance.json) records the successful immediately preceding prebuild and exact generated bytes; the four library/UI raws directly record that same SHA. Original profile JSON is unmodified.

## Final observed results (measured source fa4c5a8; product4daf23b)

[Comparison summary](evidence/p2-01-comparison-summary.json), [exact commands](evidence/commands.json), [comparator provenance](evidence/p2-01-comparator-provenance.json), and [artifact digests](evidence/artifact-manifest.json) accompany all raw captures. [Build archives](evidence/build-archives.json) contain the actual built bytes; complete equal manifests alone permit archive deduplication. All6 final capture exits are0, errors arrays empty, and source/tree/clean status agree.

| Input | Legacy list + display OFF ms | Summary + display OFF ms | Selected OFF ms | Missing-summary backfill ON ms |
|---|---:|---:|---:|---:|
| growth / 1 work(s) | 11.7 | 3.4 | 10.9 | 15.6 |
| growth / 10 work(s) | 51.3 | 14.2 | 6.1 | 109.4 |
| growth / 50 work(s) | 299.6 | 77.6 | 6.9 | 562.2 |
| standard / 1 work(s) | 570.0 | 8.5 | 649.6 | 2261.3 |
| large / 1 work(s) | 5609.7 | 12.8 | 5692.1 | 21606.5 |

These single observations do not prove a latency distribution. Selected loading is slower than the legacy list in both Standard and Large observations, and the candidate UI is slower at10 works; these unfavorable values are retained. Source identity adds reads/hashes/fences; these single times do not isolate that cost. Large selected now reads3 packed parts, equal to legacy3, while summaries read0; the rejected earlier capture read6. No assertion or fence was weakened to obtain that work reduction.

Steady summaries return0 entity/relation/block/snapshot/command/asset/part bodies and retain0 full current images. At1/10/50 works, legacy entity rows are6/60/300 versus selected6; retained store graphs are1/10/50 versus selected1. Native small headers remain928B each; derived rows302B. Standard persisted native header343740B stays inline and is read; summary row307B. Large native envelope720B replaces decoded header3432657B during listing; summary row308B. In selected load the raw native header is observed3 times (initial fingerprint, actual header decode, final fingerprint), while part bodies decode once. App's subsequent world publication adds a raw fingerprint check. All of these reads are counted. Probe payload byte estimates differ from exact canonical header bytes and are labeled accordingly.

| UI works | Old App/common store OFF ms | Candidate App OFF ms | Old/candidate retained store graphs |
|---|---:|---:|---|
| 1 | 352.5 | 191.9 | 1 / 1 |
| 10 | 198.4 | 244.1 | 10 / 1 |
| 50 | 417.0 | 296.5 | 50 / 1 |

UI input-ready means the requested entity name input is visible, enabled, editable, focused, followed by two animation frames. Raw ON UI samples are separate; some ON single samples are faster than OFF due order/JIT/noise, so these do not establish instrumentation overhead. At50 works, canonical retained current-cache bytes are272690→5453; this excludes UI graph duplication and is not heap/GC evidence.

The unchanged phase1 ON profiles compare complete literal-main03aa371 against candidate fa4c5a8 (unchanged product4daf23b). Standard rename/dialogue add2 hashes and344034/344073 canonical hash bytes; material Large adds2 hashes and953 bytes for either edit. Both sizes add1 native header read and1 committed derived summary row per save. Source-derived active-count work adds a filter over6800/68003 entities (not recorded as a new measured normalize counter). Original measured normalization stays31200/312012 rows, and target/delta/writeContent work stays17600/176006. Each edit still commits1 entity/1 command/1 outbox; dialogue commits1 block. This is added write cost, not a claimed save optimization; P2-03 remains separate.

| ON profile | Main rename/dialogue ms | Candidate rename/dialogue ms |
|---|---|---|
| standard | 1398.1 / 1250.1 | 1678.1 / 1485 |
| large | 18439.3 / 18569.7 | 19616.1 / 18863.6 |

ON times include substantial payload-accounting overhead and are not OFF latency or formal acceptance. GC-affected before/after heap snapshots remain raw diagnostic values; no retention improvement is inferred from their negative deltas. Native returned rows/keys do not measure all cursor/index traversal.

Original Standard fixture SHA is `de0b9420abec95bcc37fc7fb7c3dc4c2667082258678f750af33bb53f8a557f5`; canonical project SHA is `a15eb7d1c10e6c008c9881cc215239a67fa80e28eef0f7627e4742a2de05c13e`. Their serialization definitions differ, not their fixture. Material Large original/canonical SHA is `814daf96a6511cf47409f3497b03c7ba0309af250bfd87306c44a1dec5d5a917`, with88003 records and75497472 actual asset bytes. Baseline/candidate fixture metadata and fixture-source SHA match exactly.

Raw log bytes are preserved exactly, including Vite/Playwright trailing spaces. The unrestricted staged whitespace check reports those log lines; source, documentation and JSON pass the check with `.log` artifacts excluded. This is an artifact-format exception, not a changed test result.
