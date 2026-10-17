# P2-04: canonical metadata for already packed commands

Base: `ae757fbb389f0d77e9a9737cd9acd461692bf72e` (stacked P2-03/P2-01 drafts, not merged main). The P2-03 changeset prototype was rejected; the store is the P2-01 implementation.

## Comparison before implementation

| Representation | Integrity and work | Decision |
| --- | --- | --- |
| Current complete commands | All header IDs read; all packed body parts decoded and verified; metadata identity checked for every command. Does not reconstruct every before/after. | Keep as fallback and frozen oracle. |
| Derived metadata table | A source fingerprint cannot verify unread parts. Verifying old packed bodies retains their I/O; trusting only a derivative would change legacy failure behavior. | Reject unchecked derivative. No persistent derived table. |
| Canonical metadata plus existing packed body | New heavy command envelopes carry canonical metadata and the existing v1 packed descriptor. Every header ID and every referenced part key is checked; selected/full readers verify complete bodies. | Prototype registered D04 B using existing transactional stores. Adoption requires independent correctness review and measured benefit. |

Only commands already exceeding the unchanged packing threshold receive the new envelope, and only through explicitly bound store writer transactions. Inline commands and pre-existing packed commands keep the original full-reader semantics. Original `historySeries` 100/1000/10000 direct rows remain untouched fallback, not evidence of an all-metadata path. No schema upgrade, eager migration, external native/runtime format change, or new table is needed. Metadata strings can themselves be large; reject the optimization for envelopes exceeding the existing native packing threshold and retain the original packed representation.

## Canonical representation and verification boundary

The commands row retains its existing index fields and `__scenarioRecordParts` descriptor, plus a versioned canonical metadata marker. A SHA-256 seal covers all envelope fields including exact metadata, indexed identities, descriptor/root, scope and part keys/hashes/byte sizes. The complete original command remains losslessly encoded in its original v1 parts. This seal verifies metadata/descriptor correspondence, **not unread body bytes**.

Page reads remain O(N metadata), retain header order, query normalization, bounds and all-ID/project/missing checks, and check existence of every referenced body part using key reads in the same transaction. Missing off-page commands or parts reject. New canonical body bytes remain unloaded: stale/corrupt bytes with intact keys reject at selected-command/full reconstruction/export, through the existing part hashes, graph validation and index correspondence, plus exact canonical metadata equality. Legacy and unknown-version envelopes use complete decoding; malformed recognized metadata rejects. Unknown metadata must still correspond exactly to decoded original fields and the envelope seal. No unchecked marker grants a fast path.

## Writers, readers and atomicity

Normal save, local native ACK command creation, confirmed sync resolution, and imported command batches bind canonical packing. Existing middleware still atomically writes commands and all parts, aborts partial requests, and removes replaced/deleted parts. Direct table fixtures and old databases are not rebound automatically. Readers (`get`, `bulkGet`, indexed queries, filtered cursors), parent reconstruction, replay, outbox and full export continue receiving the exact original command. Only the scoped history-page transaction asks for metadata.

Optional rewriting is ordinary full validated read plus bound put in one transaction; it is not performed on opening or paging. Failure/quota retains original rows/parts. No accepted old row is deleted without its original body being retained in the new envelope's parts.

## Rollback

Disable metadata reads while retaining the compatible decoder; this reads all command bodies on the unchanged v8 schema. A literal old binary rejects the additional envelope fields and is **not** a rollback adapter. A validated transactional rewrite through the old writer (binding disabled) removes new metadata while preserving all command values; only after every new envelope has been rewritten can the old decoder be used. Test both adapter paths and interrupted rewrite. Never delete or downgrade the database.

## Validation and measurement

Independent literal page/query/order expectations and a frozen original oracle precede implementation. Cover metadata/ID/project/descriptor corruption, absent off-page rows/parts, legacy body corruption, canonical deferred corruption, rollback, cancellation/quota, all four writer families, parent cycle/64 checkpoints/importOrigin, import/clone/cold/export. Existing tests/assertions/fixtures/limits remain unchanged.

After product-source freeze and independent spec/quality approvals, compare identical legacy and separately encoded equivalent inputs, probe OFF timings separately from ON work counts. Report header bytes, canonical metadata/descriptor bytes, inline fallback body bytes, actual part bytes, key visits, decoded body rows and retained objects. No O(page), universal speedup, formal phase3, heap or acceptance claim. Preserve unsuccessful attempts and unfavorable samples.

References: [registered D04](../../phase1/DESIGN.md), [handoff](../../phase1/HANDOFF.md), [stage 2 request](../../../implementation/codex-three-phase-2026-10-17/PHASE_2_OPTIMIZATION.md).
