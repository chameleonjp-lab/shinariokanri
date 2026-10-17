# P2-04 history metadata — limited adoption

Adopt the registered canonical representation **only for already-packed, store-owned commands whose accepted metadata fits the unchanged native threshold**. Standard and the added valid heavy input demonstrate removal of actual command-body payload reads from history pages while retaining all metadata IDs and referenced part-key checks. Original inline histories and oversized metadata remain complete-reader fallback. This is not a general solution to the original 10000-history cost or a claim of neutral full-read latency.

Product source is the independently approved `0479d4eedae9b51fbc6fd785265bbbc2de870e78`; the approved measurement driver/capture source is clean `547ab05dd38fe36c939a94c80c236582d3d8ef77` (tree `f9206f05e37bb5fddda13f3975537986989779c3`). Literal baseline is repaired `17a4cfb9dad2c20eb5adb369b7951a3f5a85c1aa` plus the identical seven-file measurement overlay. Later documentation commits do not relabel these source/build identities.

## Actual observations

All twelve serial captures exited0: six original/additional input suites × baseline/candidate, each with one OFF API observation and a separately seeded ON work capture. All literal/oracle/all-ID/selected/full comparisons passed; no retry, source edit, watchdog interruption or capacity failure occurred. Fixed baseline-then-candidate order and one observation per API do not establish distributions, significance, full-read neutrality or the registered final30-run acceptance. ON times are not latency measurements.

| Input | First-page OFF baseline → candidate (ms) | Candidate native command representation | Page command-body work |
| --- | ---: | --- | --- |
| Original100 | 5.9 → 10.7 | 100inline | All100 full inline rows |
| Original1000 | 37.4 → 31.4 | 1000inline | All1000 full inline rows |
| Original10000 | 362.8 → 346.6 | 10000inline | All10000 full inline rows;4,484,613 estimated legacy payload bytes |
| Original Standard | 770.9 → 11.7 | 2inline +1canonical | 3body parts/3,519,095actual bytes →0payload reads; all3keys checked |
| Original Large +72MiB assets | 6946.9 → 7051.4 | 2inline +1packed fallback | Unchanged18body parts/35,095,682actual bytes; plus3project-header parts/4,037,855bytes |
| Added two-operation heavy | 109.6 → 6.1 | 1inline +1canonical | 20body parts/4,503,988actual bytes →0payload reads; all20keys checked |

Original Large input is59,407,368 canonical bytes plus75,497,472 actual asset bytes (three24MiB arrays, individually hashed); no asset placeholder or threshold change. Its metadata size triggered the recorded size fallback. Original Standard input is6,258,972 canonical bytes. Added heavy input is separately frozen9,012,384 canonical bytes with4,500,031 historical text bytes, not an original scale replacement. Canonical10000-heavy scope is unexecuted/UNKNOWN; no shared parts or low threshold simulates it.

[measurements.json](measurements.json) preserves all92 OFF values, separate ON counters, exact fixture hashes/counts/assets, native inventories and verified source/build manifests. [latency-observations.csv](latency-observations.csv) contains all46 paired API observations. Every one of the15 unfavorable observations follows; none is discarded or explained away as noise.

| Input / operation | Baseline → candidate OFF ms |
| --- | ---: |
| Original100 first page | 5.9 →10.7 |
| Original100 last page | 5.8 →6.7 |
| Original100 query | 5.7 →8.1 |
| Original100 full command rows | 4.6 →4.8 |
| Original1000 full command rows | 31.6 →34.4 |
| Original10000 full command rows | 315.9 →450.0 |
| Original10000 selected command | 7.6 →9.1 |
| Original10000 full-reader page oracle | 316.4 →320.4 |
| Standard dialogue save | 245.4 →248.3 |
| Large first page | 6946.9 →7051.4 |
| Large query | 6833.9 →7403.1 |
| Large full command rows | 6336.1 →6477.9 |
| Large full-reader page oracle | 6859.6 →7166.2 |
| Added heavy full command rows | 80.4 →109.3 |
| Added heavy full-reader page oracle | 97.6 →100.5 |

Their causes were not isolated. Ordinary inline getMany now incurs an own-property metadata-marker recognition branch, a real static cost. Canonical full readers add metadata/seal correspondence validation after original body decoding. Neither identifies the cause of the observed134.1ms original10000 full-read difference. Full-read neutrality remains unproved; final30-run acceptance was not executed.

## Writer and validation cost

Initial save/import OFF observations were Standard3017.1→2906.9ms, Large29877.6→28421.5ms and added-heavy import382.7→371.4ms. These single observations do not imply that new preparation is free or faster. Standard adds one writer seal/344,277bytes (main-thread hash total4→5calls,6,603,049→6,947,326bytes). Added import adds one seal/4,216bytes (3→4calls,774→4,990bytes). Large attempts one metadata candidate and size-falls-back, with no seal; candidate construction/shape/size scan work still occurs and is not separately timed. Later inline rename/dialogue writes have no candidate/seal. Candidate page/full verification adds its own seal calls; writer-only counters exclude them.

Normal save, import, local ACK merge and confirmed sync resolution all have focused canonical native-row correctness coverage. Only normal save and added import have these writer timing observations; ACK/resolution performance is UNKNOWN. The existing bounded import-pair path adds a resolved-value await for recoveredPending header preparation; this input is absent from captures, so its cost is UNKNOWN. Worker-internal hash work and native keepalive requests are UNKNOWN. Baseline missing new history counters are unsupported/UNKNOWN, not zero.

## Correctness and rollback boundary

Metadata pages remain O(Nmetadata) with all history IDs, project correspondence, order, query normalization and every referenced part key checked. A seal is neither authentication nor proof of unread body bytes. Canonical body correspondence is UNLOADED until a selected/full reader validates original v1 parts and exact accepted metadata. Coordinated recomputed metadata/checksum and intact-key body corruption negatives retain these distinct detection points. Original legacy/unknown/full-reader corruption behavior remains unchanged.

Focused evidence covers all four writers, cold/full/export, new/clone import, local ACK/resolution, outbox, checkpoint64/cycles, importOrigin, native part-byte parity, cancellation/quota/atomic rollback, and exact request-scoped metadata capability under concurrent same-parent r/rw get/bulkGet/query/cursor. Review-found sparse-array and non-plain-record checksum collisions now reject recognized malformed rows and retain writer fallback. Own undefined never becomes sealable through canonical JSON omission. The real HTTP browser test uses normal UI import, real IndexedDB, query/selection, actual cold full download and corrupt-body rejection/native preservation. Product focused202tests and new Chromium case passed; parent owns original fullCI/three-engine results.

Rollback retains the compatible full decoder and disables the page fast path, or fully validates and atomically rewrites commands/parts into old envelopes before an old binary is used. A literal old binary rejects extra metadata fields; no unsupported old-binary compatibility, destructive migration or DB downgrade is claimed. Failed/cancelled rewrites preserve native rows/parts.

## Alternative comparison and limits

| Alternative | Decision and tradeoff |
| --- | --- |
| Original complete command reader | Retained as literal baseline and all inline/legacy/oversized fallback; reads all bodies, preserves original errors. |
| Derived metadata cache/fingerprint | Not adopted as an integrity shortcut: a fingerprint is not unread body integrity/authentication proof; authoritative correspondence and all-writer invalidation remain necessary. No unsupported speed ranking. |
| Canonical metadata reusing existing commands/v1 parts | Limited adoption on the measured packed/bounded-metadata path. Preserves original body bytes/atomic part machinery, adds seal/key checks and writer/full-reader work. |
| Separate metadata/body table for every command | Unimplemented/unmeasured UNKNOWN. Could cover inline rows, but requires migration/old-row policy, two-store atomic correspondence, all body-key completeness, added selected/full joins, writer and rollback costs. Not adopted in this unit because it expands representation/compatibility scope before measured need; not declared slower or inferior. |

No original condition, fixture, threshold, timeout, retry, skip, archive/native external format, schema version, auth/sync external contract or CI configuration changed. Original104requirements/116cases/464clauses/24packages/6groups/68supplemental/73locked/94local/22external and RELEASE BLOCKED remain unchanged. These captures are not formal30/180/7200 acceptance, actual-device/service tests or a claim of universal optimization.

## Sealed evidence

[evidence.zip](evidence.zip) retains all P2-04 raw captures/build ZIPs/member directories, source manifests/snapshots, generator source, recorded fixture byte/hash manifests, browser downloads/traces, focused/build/doc logs, original failed attempts and all independent review reports. [evidence-manifest.json](evidence-manifest.json) binds every member plus the complete archive. Original per-run source HEAD/tree/status is retained; dirty setup/check builds are never relabelled as clean captures. [requirement-correspondence.json](requirement-correspondence.json) retains the original case/clause/procedure crosswalk.

The parent independently reverified all12runs, all144actual build-ZIP members, the302baseline/303candidate tracked product files and identical seven overlays. Generated runtime fixture/asset bytes were hashed during the runs; the full generated input arrays are not separately retained as raw files. Added-heavy prepared exports are distinct actual outputs: baseline14,831bytes/SHA256`c723e3dbb66d72d9eb14a8bdab88bfa9b88ab099d6e7ba54ee82f159ce03241f`, candidate14,832bytes/SHA256`7b51d4d8832a618460422766f5060d49cd3a3090bb01aadb1d57f8254965c5ae`. Existing export defaults generate snapshot IDs/timestamps. Decoded canonical input and all20body-part byte/hash records match; byte-identical prepared ZIPs are not claimed. The parent's initial overbroad whole-fixture equality failure, corrected verifier and successful verification report are all retained in the evidence archive.
