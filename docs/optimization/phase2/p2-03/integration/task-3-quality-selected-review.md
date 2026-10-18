# P2-03 selected-source independent quality re-review

**APPROVE** — no blocking issue found in the final selected-source disposition, active behavioral tests or preserved experimental evidence. This approval concerns the reviewed comparison and rejection of prototype adoption; it does not establish full CI, release or statistical performance acceptance.

Reviewed clean HEAD `399795e0d718b7f85977a7e37448d61726140f9a`, tree `227e3625621bebf3f3f3ab55ed279345b5229cf5`, in `/workspace/phase2`. Selected production base is exact reviewed, unmerged P2-01 `d3bf88c31172386fd84926a615ed060c2ee2190c`, tree `0f7aa69c80c1d988bdfb7246f16ec252f3c2f8ec`. Experimental source remains `be63656d92b963645c80d617890ff722b373bf7a`, tree `fb8884fc64a34030390b4505d89bfdea545f93a1`, with product bytes from `85054a4`. Main is not substituted for the base. Read final DESIGN/README, source changes, active tests, source/provenance manifests, capture summaries/raw results, archive contents and verification evidence.

## Selected source and test preservation

Independently compared actual working-file bytes against Git blobs at d3bf and the selected-production manifest:

- `src/storage/store.ts`: 172741 bytes, SHA-256 `c931b107510f0c9edfb7687da8fa3d6392bb2aaa0e55d1c60bfc9ce8c0bf862d`; exact equality.
- `src/observability/probe.ts`: 9008 bytes, SHA-256 `b138698865a84b2de5444dac98af29e470e4c2aa60bba99ad27bdd3a5507038c`; exact equality.

The complete src diff from d3bf adds only `src/storage/saveChangeset.test.ts`. No dormant normalized-changes implementation, feature flag, new production cache, validator/probe bypass or changed public save path remains. Existing request v2/v1 replay, validation/integrity, transaction, summary, snapshot/pin, checkpoint and fallback behavior therefore retains the reviewed base implementation.

The active test file has ten behavioral cases: literal/frozen-oracle target/delta/write checks, exact v2 request and replay/conflict, reorder-only zero writes and revisions, present-undefined, five independent negative inputs, and production propagation with cold equality. Relative to the prototype, the constructor-work test is archived and the reorder test retains its behavioral assertions while removing prototype-only instrumentation. Original tests are unchanged. This does not weaken an adopted optimization budget: the optimization itself is rejected, its original strict tests remain unchanged in the archive, and no baseline optimizer pass is claimed.

Independently opened `experimental-source.zip` without extracting or modifying it: its exact nine members match the manifest and the corresponding be63656 Git blobs byte-for-byte, including the entire original 11-case test source, store, probe and design. Both blocks in `experimental-optimizer-tests.txt` match the exact original test blocks, including the constructor budget and exact counter assertions. The ZIP is 63263 bytes, SHA-256 `44841b1240c314892e164bca971f4b8e295da9c72939b61cd214f2fe2a38638f`.

## Provenance and artifact bindings

Read-only byte/hash comparisons independently verified:

- All 47 artifact-manifest entries against committed evidence files.
- All 294 baseline tracked product-source entries against exact d3bf Git blobs; all three measurement-only overlays against be63656. Baseline productDiff is empty and its status lists only the driver and two harness files.
- Every recorded non-generated candidate source-file entry in both candidate raw captures against be63656; the candidate capture metadata is clean and productDiff empty. Generated-input records match the summary's explicit byte/hash entries.
- All four raw capture metadata/build manifests against the comparison summary, and every member of each referenced ZIP against the corresponding recorded build byte count/hash. Baseline archive has 12 members / 1876454 actual bytes; prototype archive has 12 / 1879180, a 2726-byte increase. Standard/Large reuse the same archive only where their source-specific build manifests are exactly equal.
- All eight OFF/ON comparison entries against raw operation times, phase values and write counts. Paired fixture metadata matches exactly; Standard has 8800 records, Large has 88003 records and 75497472 actual asset bytes.
- Selected verification log sizes/hashes and current regenerated runtime bytes against the manifest. The generated runtime is 171219 bytes, SHA-256 `7a9a23aa2934884b8109fc67d06d0ad7795db8a92c3b863e04fc5ce094ed9cc9`.
- All 38 manifest-listed files also present in the external progress directory are identical to their preserved originals, including captures, failure logs and prior review reports.

The source/runtime/build distinctions are explicit. Archived prototype bundles are evidence of the experiment, not builds of the final selected source. The final selection's recorded prebuild and tests are separately identified. Prior APPROVE reviews remain historical reviews of be63656 and are not represented as approving final performance adoption.

## Measurement interpretation

Raw OFF whole-save observations are retained exactly: Standard rename 364.0→384.2 ms, dialogue 240.5→256.9 ms; Large rename 4728.0→5081.1 ms, dialogue 5220.9→5006.3 ms. Thus three observations are slower and one faster. All four phase comparisons and all separate ON observations remain visible. Four capture exits are 0 with empty errors. No unfavorable result was omitted from the sealed comparison, and the original setup failures and injected Git failure remain preserved.

The documentation appropriately states that this is a fixed-order single-observation comparison, with separately seeded OFF then ON stores, warm application caches and uncontrolled JIT/storage/GC effects. It makes no p95, statistical universal-slowdown, formal30/180/7200 or heap-benefit claim. Rejection because benefit is not established is supported; causation of individual phase changes remains unknown.

Verified ON counts agree with the report: paired canonical hashes/calls are unchanged, two current-validation and one integrity-validation calls occur per edit, old row metrics remain entry-length attribution, and prototype prior/current/previous counters are separately documented. Native writes remain differential; there is no write-saving claim. The source-derived `7E+6R` versus `2E+2R` insertion arithmetic is consistent with the two source implementations and is labeled source analysis, not a measured baseline counter. The narrow 34-versus-14-budget observer is not conflated with total work. Longer logical prior-map lifetime and UNKNOWN heap/peak/retention are correctly disclosed.

## Verification limits and nonblocking observation

Selected verification records 161/161 tests in 11 files, TypeScript, prebuild, documentation, completion and original-contract checks at exit 0. I inspected the logs/manifests and their hashes; I did not rerun any tests, builds or timings. The original 104 requirements / 116 cases / 464 clauses / 24 packages / 6 groups / 68 supplemental / 73 locked inputs, 94 local / 22 external and RELEASE BLOCKED remain unchanged. Parent-owned unchanged full CI and formal acceptance are not certified here.

A read-only `git diff --check d3bf88c..HEAD` returned exit 2 solely for four trailing spaces emitted by Vite in the preserved raw capture logs, at line 2 of each before/after Standard/Large log. This is not a source defect or blocker; altering raw logs would break their exact evidence hashes. No product/test/source changes, helpers, test runs, builds, timings or external operations were performed. This external review report is the only write.
