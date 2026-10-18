# P2-03 final selected-source spec review

**PASS.** The final selection retains the exact reviewed P2-01 production implementation and accurately preserves the rejected shared-changeset experiment. No concrete specification issue remains in this selected-source review.

Reviewed clean HEAD `399795e0d718b7f85977a7e37448d61726140f9a`, tree `227e3625621bebf3f3f3ab55ed279345b5229cf5`, in `/workspace/phase2`. Original comparison base is `d3bf88c31172386fd84926a615ed060c2ee2190c` (unmerged P2-01 Draft 62); rejected prototype is `85054a450a000f49de12ffe51e92fc4f66f3e34e`, with measurement-only repair at `be63656d92b963645c80d617890ff722b373bf7a`. Earlier reviews are preserved and describe their explicitly pinned prototype sources, not final adoption.

## Verified selected source

Independent byte comparisons against `git show d3bf88c:<path>` confirm:

- `src/storage/store.ts` exactly equals d3bf; SHA-256 `c931b107510f0c9edfb7687da8fa3d6392bb2aaa0e55d1c60bfc9ce8c0bf862d`.
- `src/observability/probe.ts` exactly equals d3bf; SHA-256 `b138698865a84b2de5444dac98af29e470e4c2aa60bba99ad27bdd3a5507038c`.

There is no dormant shared changeset or corresponding new probe metric in these selected product files. The entire base-to-final file list contains only new documentation/evidence, the new behavioral test file, and measurement/oracle support; no original product file or original test/fixture/checker/CI file differs from the exact base. Consequently the reviewed full public save API, v2 bytes/v1 replay, current/global/integrity validation and memo proofs, immutable snapshots/pins, checkpoint64, history-omitted tokens, native transaction, summary work and old import/history/sync paths remain the reviewed P2-01 implementation.

## Preserved strict experiment and active behavioral tests

All nine members of `evidence/experimental-source.zip` were compared byte-for-byte with the corresponding files at be63656; all match, including their manifest sizes/SHA-256. Both optimizer-specific test blocks in `evidence/experimental-optimizer-tests.txt` exactly match their complete original blocks in that pinned test source. The constructor budget remains `2*(entities.length+relations.length)` (14 for that fixture), and the exact one-build/7 previous/7 current/7 prior/zero-fallback counter expectations remain intact. No budget was relaxed or historical optimizer pass relabeled as a selected-baseline pass.

The active test diff removes the rejected implementation's constructor assertion and probe-specific assertions; it retains reorder behavior as an active test. Literal target/hash/order/tombstone/revision checks, frozen target/delta/write oracle equality, v2 replay/different-request conflict, optional-field presence, five rejection cases with unchanged durable state, production propagation and cold equality remain active. These are 10 active behavioral cases versus the prototype's 11 cases, consistent with the reported 161 versus 162 suite totals. Original existing test assertions remain untouched.

## Evidence and disposition

README and DESIGN explicitly select exact d3bf production and reject prototype adoption because consistent time/heap benefit was not established, with longer logical lifetime for the shared prior maps. They explicitly avoid claiming universal statistical slowdown. DESIGN preserves the original experimental design/counter definitions under the stated rejected-prototype context, and its final disposition agrees with README and `selected-production.json`.

Independently read all four raw captures. Paired fixture metadata and environments match, errors are empty, and the retained OFF whole-save observations are:

| Operation | Baseline ms | Prototype ms |
| --- | ---: | ---: |
| Standard rename | 364.0 | 384.2 |
| Standard dialogue | 240.5 | 256.9 |
| Large rename | 4728.0 | 5081.1 |
| Large dialogue | 5220.9 | 5006.3 |

The favorable Large dialogue observation and all three unfavorable observations are retained. Separate ON observations are also retained. Documentation correctly identifies these as singles, with fixed ordering, warm caches, uncontrolled browser/storage/JIT/GC effects, no distribution or p95 inference, and no formal30/180/7200 acceptance. It distinguishes actual observed counters from source-derived Map insertion counts and the constructor observer's omissions. Heap/peak/retention benefit remains UNKNOWN; fewer cumulative inputs are not used as proof of memory benefit. Baseline provenance identifies exact d3bf plus three measurement-only overlay files, rather than treating the candidate store as its own baseline. Generated portable inputs and actual material bytes are disclosed.

All 47 entries in `artifact-manifest.json` match the retained file sizes and hashes. Both build ZIPs contain the 12 expected members, and every member matches each applicable raw comparison build manifest for all four captures. Thus the actual bundles and raw favorable/unfavorable results are retained, rather than only summarized.

Inspected selected verification evidence records 161/161 tests in 11 files, TypeScript exit0, generated input, docs/completion/original-contract checks. The raw focused log agrees with the test total, and the original-contract log records 73 locked originals / 104 requirements / 116 cases / 464 clauses / 24 packages / 6 groups / 68 supplemental with `acceptancePromoted:false`. These are recorded implementer/controller results; no such checks were rerun during this review.

Original fixtures/assertions/limits/retries/skips, 30/180/7200/600000/2000 obligations and 94 local / 22 external / RELEASE BLOCKED remain unchanged. Full unchanged CI/browser/downstream gates and final Draft handling remain parent-owned. This review does not certify final performance, external services, devices, or release acceptance.

Review actions were read-only source/diff/archive/hash/log inspection, plus this specifically requested external report. No product/test/evidence mutation, tests, builds, timing captures, helpers, cloud/live service/device operations, push, merge or publication were performed.
