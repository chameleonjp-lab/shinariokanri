# P2-03 repaired-dependency specification review

**PASS for the incremental specification scope.** No concrete specification defect or new interaction was found between the repaired P2-01 dependency, P2-03's retained save implementation, its ten active behavioral tests, and the preserved rejected experiment. This is source/specification approval, not hosted-CI, performance or release acceptance.

Reviewed clean PR63 head `8d2fd69cc31f06d17c9c67921f97e7186d9c6674`, tree `73cddec690cffba424ff7f631d3a24fa5539085e`, in `/workspace/p2-02-validation`. Repaired PR62 comparison source is `8733280484c65a0e3cdb78f046779fe116d0f467`, tree `4d3ce460809cbc9917e77643a96f03d8ca25d6db`. The four inherited repair/evidence commits are `09ba25f`, `72d9223`, `60ef5c8`, and `8d2fd69`; they preserve the dependency repair through cherry-picks, with no merge or history rewrite performed by this reviewer.

## Current source versus historical selection

Independently compared the current production-source delta against repaired PR62: `git diff --name-only 8733280 HEAD -- src ':(exclude)src/**/*.test.ts'` is empty. Actual current bytes of store, probe, App, SyncPanel and AccountWorkspace all equal their repaired-PR62 blobs and match the separate current-source proof at `/workspace/phase2-progress/p2-03-repaired-source-proof.json`. In particular:

- `src/storage/store.ts`: 173559 bytes, SHA-256 `f71050d15999edbd080b394887b373e0f3c394cb1ab513766e489011282d0c14`.
- `src/observability/probe.ts`: 9008 bytes, SHA-256 `b138698865a84b2de5444dac98af29e470e4c2aa60bba99ad27bdd3a5507038c`.

The complete source/test/support delta against repaired PR62 consists of the new behavioral test, frozen oracle, measurement driver and two harness files. No existing original test, fixture, limit, retry or skip changes. All P2-03 documentation/evidence and those five source/support additions are unchanged from previously reviewed integration `ae757fbb389f0d77e9a9737cd9acd461692bf72e`.

The historical selected-production proof and prior reviews continue to describe selected commit `399795e0d718b7f85977a7e37448d61726140f9a`, tree `227e3625621bebf3f3f3ab55ed279345b5229cf5`, and exact old P2-01 `d3bf88c31172386fd84926a615ed060c2ee2190c`. They were not rewritten or used as whole-file equivalence proof for current `8d2fd69`. Current source inherits the separately reviewed dependency repair; no old timing or build capture is relabelled as a measurement of this new source.

## Interaction and behavior review

Read the cumulative repair source, prior selected specification/quality reviews, repair README/integration record and both final repair approval reports inside the retained ZIP. The only store addition since the old selection is `refreshAuthorAccess` at `src/storage/store.ts:482`. It publishes an authoritative response only while captured access generation, lifetime, abort signal and caller session predicate remain valid; malformed roles fail before publication. SyncPanel obtains that response from the captured client/session after confirmed bootstrap. It grants no owner role from bootstrap alone.

Publication uses the existing `setAuthorAccess` cache invalidation path. The subsequent editor refresh must reload and validate current rows; stale access-bound editor reads are cancelled. The existing save implementation still checks authoritative owner access before work and inside the native transaction. Its history-token, request-v2/v1, normalization, global/current/integrity validation, immutable snapshot/pin, checkpoint64, summary freshness and differential-write bodies are unchanged. No private changeset or new save-path probe metric is reintroduced.

The App repair persists only the requested account-scoped ID before asynchronous validation. Editor publication retains cancellation/generation/revision guards; pending import notices require matching project, revision and selection generation. Confirmed logout removes the exact matching account's pending-selection key, preserving guest and other-account keys. These UI changes do not alter canonical save input encoding or durable record format.

Read all ten active `saveChangeset.test.ts` cases and the frozen oracle. Literal target/hash/order/tombstone/revision expectations, exact v2 replay/conflict, reorder zero writes, presence semantics, five invalid-input/no-commit cases, production propagation and cold equality remain active and unchanged. The oracle remains frozen to d3bf algorithms and imports no optimized helper. Because the dependency changes none of these save algorithms, its frozen baseline remains applicable.

Independently reopened the rejected prototype archive: all nine members still match pinned `be63656d92b963645c80d617890ff722b373bf7a` byte-for-byte. Both extracted optimizer blocks exactly match that test source, including `2*(entities.length+relations.length)` and the one-build/7-prior/7-current/7-previous/zero-fallback assertions. Archive bytes remain 63263, SHA-256 `44841b1240c314892e164bca971f4b8e295da9c72939b61cd214f2fe2a38638f`. Prototype adoption remains rejected. The previously approved full 47-artifact audit was not repeated.

## Inspected verification and limits

Read current-source `p2-03-repaired-checks.json` and raw logs: the parent's generator, focused test command and unchanged `npm run build` each record exit 0. Raw focused output records 167/167 tests in 12 files. The clean build metadata pins the same head/tree with `dirty:false`; raw build output includes TypeScript and successful Vite completion. Independently checked the new product ZIP's bytes/SHA, CRC and all 13 members against its manifest: 1094409 bytes, SHA-256 `963e3a329870e86e097be53c017244d6e760520758a47153c1f10811fc4287d5`. These are inspected parent execution records; this reviewer ran no tests, builds or timings.

PR63 remains stacked on unmerged PR62. The parent reports current main as `5e52f8edb34f910cbeabbb1441cf21350efb20f9` following a human merge of PR61; the historical `03aa371` reference in the old integration record is not treated as current main. This review does not certify the pending hosted main/PR62 or PR63 CI combination. The existing later P2-06 integration gate remains separate.

Original 104 requirements / 116 cases / 464 clauses / 24 packages / 6 groups / 68 supplemental / 73 locked originals, all 30/180/7200/600000/2000 conditions, and **94 local / 22 external / RELEASE BLOCKED** remain unchanged. No optimization or acceptance is promoted. Review actions were read-only Git/source/archive/hash/log inspection plus this requested external report; no repository edits, helpers, tests, builds, timing runs, production/auth/device access, push, merge or publication occurred.
