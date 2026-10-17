# P2-01 original CI continuity repair

Reviewed and measured product source: `da2068677c9d1d2d43cabc8c358bc809e77cd599`, tree `703fe8b821983ca97030575397a22bee9682d60d`. Repair commits are `18a75df` and `da20686`, based on failed-CI source `d3bf88c`. Both independent reviewers approve the final repair. This new subtree supplements the [earlier evidence](../README.md); none of its sealed artifacts is rewritten.

## Failures and repairs

Initial PR62 run39007267884 remains FAILED: Chromium and WebKit each234 passed/2 failed of236; Firefox233 passed/3 failed. Its original unit1172/build passed. Complete failed-CI proof and the independent clean final product build are controller-owned integration artifacts, separate from this repair evidence.

- Original E12 migration/retry clicked a project card then immediately reloaded. Selection was persisted only after asynchronous full validation. The repair records account-scoped pending selection intent synchronously and resumes it through unchanged full validation; it publishes no unvalidated editor. Current cancellation/error clears intent, late results cannot replace newer intent, and the last validated selection remains separate.
- Original F35 had two independent causes. An import acknowledgement could precede selected-editor publication, losing the clone completion notice. The repair binds the pending notice to project/revision/selection generation and consumes it only on matching validated publication. Authenticated bootstrap also left the role map fetched before bootstrap stale. The repair requests authoritative roles using the captured session/account/signal, rejecting revoked, aborted, closed, malformed or stale responses before publication. It does not infer owner permission from local bootstrap. The actual Chromium trace contained the target access-denial alert; a different page's final screenshot was not evidence of preview clearing.
- Original Firefox link-candidate helper observed a temporary library before remembered selection finished. Startup now retains its loading state until the owned selected validation settles. Cancellation/retry and editor publication guards remain intact.
- Both reviewers found that confirmed logout omitted the new pending-selection preference. The follow-up adds only the exact account key to existing cleanup. Actual confirmed-logout regression proves matching account removal and guest/other-account preservation. Ordinary unmount, reload, expiry and account switching do not gain cleanup.

Existing storage load/save/summary methods are unchanged by this repair. The store file does change: it adds the guarded role-refresh helper. Canonical import/rollback, draft ownership, full-validation and revision/access/lifetime fences are preserved. Original tests, fixtures, assertions, timeouts, retries and skips are unchanged.

## Verification and retained failures

[Raw repair archive](repair-evidence.zip) retains87 members: exact logs/exits, failed traces/error contexts, intermediate build bytes, source snapshots/diff, provenance manifests, full report, both CHANGES REQUIRED reviews and both final approval reviews. [Manifest](manifest.json) records every member's exact bytes/SHA; archive CRC and member hashes were verified. Review members are `raw/task-2-{spec,quality}-continuity-{review,approval}.md`. Reviews inspected source and retained results; they did not rerun tests.

| Check | Result |
|---|---|
| Original E12 and F35 on old source | Both reproduced RED at original failure lines |
| New access-refresh negatives | Expected API/session RED retained; final6 passed |
| Focused units including prior55, access refresh, acknowledgement and account/session tests | 94/94 passed, exit0 |
| Combined browser verification before test-gate correction | 15 passed/2 NEW setup failures, exit1; all3 original workflows and prior7 library cases passed |
| Corrected new continuity file | 7/7 passed, exit0 |
| Logout counterexample | Initial OPTIONS setup failure retained; corrected RED fails only retained matching account pending key |
| Final cleanup browser run | 19/19 passed, exit0: new continuity8, prior library7, unchanged rb09-inputs4 |
| TypeScript and production builds | Passed; raw intermediate source/build identities retained |

The mixed15/2 run is not relabelled all-green. Other initial clone/startup/gate/type-check failures remain in the archive. The corrected tests are new tests only; the original procedures remain untouched. Final19-case command was `npx playwright test tests/e2e/library-loading-continuity.spec.ts tests/e2e/library-summaries.spec.ts tests/e2e/rb09-inputs.spec.ts --project chromium --reporter list`. Exact commands and output paths remain in raw logs/report.

The intermediate build used for original successful reruns records d3bf88c/dirtytrue; its actual bytes and source-hash correspondence are preserved, not relabelled a clean repair build. The cleanup build similarly records18a/dirtytrue. Controller independently built clean da206 successfully; its final build proof is integrated separately. HTTP-loopback diagnostics did not alter the browser administrator's file:// policy.

## Requirement correspondence

[Repair correspondence](p2-01-ci-repair-requirements.json) copies the exact phase1 requirement rows, four original clause names/pointers, historical results and procedure paths. This static mapping supplements the earlier P2-01 correspondence; it does not establish fresh acceptance.

| Boundary | Requirement and clauses | Relevant existing procedures |
|---|---|---|
| SyncPanel authoritative role refresh | REQ-F34: AT-F34/E06/E12; REQ-N07: AT-N07/E06 | `tests/e2e/ap04-original-e12-continuity.spec.ts`, `src/storage/rb09Sync.test.ts`, `tests/rb09Features.test.ts` |
| Sharing/access compatibility | REQ-F30: AT-F30/E05; REQ-N08: AT-N08/E05 | Registered phase1 procedure lists remain empty; existing `tests/e2e/rb09-sharing.spec.ts` remains supporting coverage |
| AccountWorkspace continuity/cleanup | REQ-B23: AT-B23/E12; REQ-N06: AT-N06/E06/E12; REQ-N11: AT-N11/E12 | `tests/e2e/ap04-original-e12-continuity.spec.ts`, `tests/e2e/ap04-original-identity-impact.spec.ts`, `tests/e2e/ap04-original-n-atomic-migration.spec.ts`, `tests/e2e/ap04-original-n-mobile-offline.spec.ts`, `tests/e2e/rb09-inputs.spec.ts` |

The explicit confirmed-logout contract is `docs/spec/SYNC_SECURITY.md:50`. Original F35 new/clone/replacement/rollback uses `tests/e2e/ap04-original-f-source-schema.spec.ts` and its unchanged replacement helper; the readiness failure uses `tests/e2e/link-candidate-ignore.spec.ts`. New `tests/e2e/library-loading-continuity.spec.ts` and `tests/optimization/library-access-refresh.test.ts` add deterministic ownership, access and cleanup counterexamples. Existing world-source and import-target regressions remain in the prior seven-case library file.

## Affected UI capture

[Exact raw capture](p2-01-ci-repair-ui.json), [log](p2-01-ci-repair-ui.log), [exit](p2-01-ci-repair-ui.exit), [summary](ui-summary.json) and [actual build](ui-build.zip) record one authorized UI-only run on clean da206. All12 observations completed, exit0/errors=[]; all recorded source and build hashes were independently rechecked against actual files before sealing. The portable generator ran first and recorded171219 bytes/SHA `7a9a23aa2934884b8109fc67d06d0ad7795db8a92c3b863e04fc5ce094ed9cc9`. The actual UI build has12 members; its complete member list is in the manifest. No Standard/Large or storage recapture was performed.

Command: set `P2_SOURCE_COMMIT`, `P2_SOURCE_TREE`, `P2_SOURCE_DIRTY` from the current Git head/tree/status, then run `node scripts/optimization/measure-library-loading.mjs --suite ui --output <capture.json>`.

The comparator is pinned old App with candidate common store/components, not literal main-before. Times cover inclusive App mount through requested entity input being visible, enabled, editable and focused, followed by two animation frames. The unchanged runner uses1/10/50 small growth fixtures and fixed variant order. These single observations have JIT/cache/order noise; they are not p95, formal30/180/7200 or600000ms acceptance. ON payload accounting affects timings and is separate from OFF.

| Works | Old App/common store OFF ms | Candidate OFF ms | Old App/common store ON ms | Candidate ON ms |
|---|---:|---:|---:|---:|
| 1 | 330.2 | 209.8 | 163.2 | 190.9 |
| 10 | 213.9 | 178.7 | 291.7 | 199.4 |
| 50 | 416.0 | 271.8 | 1422.7 | 318.4 |

The unfavorable1-work ON result is retained. Store-retained graphs are1/10/50 versus1; at50 works canonical cache bytes are272690 versus5453. These counts exclude JavaScript overhead and UI graph duplication; actual heap/GC remains UNKNOWN. Earlier UI values are superseded for changed App source. Earlier fa4 API/read/write diagnostics retain their exact historical source metadata; unchanged measured storage method bodies do not make those captures measurements of this new whole-file source.

Full hosted three-engine/downstream verification remains a separate gate. All104 requirements/116 cases/464 clauses,24 work packages,6 regression groups,68 supplemental checks and original numeric conditions remain unchanged. Original94 local/22 external/RELEASE BLOCKED status is not promoted by this focused repair or its diagnostics.
