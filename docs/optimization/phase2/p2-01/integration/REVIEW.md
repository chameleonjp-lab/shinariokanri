# Independent integration review

Product source was frozen at `4daf23beb88538cf99f0a5f76fa8f529ce455717`,
tree `a0b607038111c3de686fe25d22f6da49f1f17924`. Subsequent evidence commits do
not change the measured product. Two separate reviewers inspected specification
and code quality; both approved this source after counterexamples were corrected.

## Specification result: PASS

Catalog failures retain recognizable canonical source ownership separately from
unknown ownership. Selected-source loading rejects failures belonging to that
source and failures with unknown owners before accepting successful grouped
entries. An identified unrelated corrupt source does not block healthy editable W
when W has no retained editions. A valid W edition cannot conceal a corrupt W
edition. New storage cases cover all three routing outcomes; a browser case covers
the exact prior failure through snapshot preview and confirmed adoption.

Earlier review findings were also resolved: registry-only world sources remain
discoverable; current plus retained editions are merged; asset status cannot
falsely establish fully synced; clean/dirty alternative drafts retain correct
unload semantics after project switches. Native-header/cache/view proofs and
authorization/lifetime/revision/late-publication fences remain authoritative.

## Code-quality result: APPROVE

The final ownership fix is narrow and does not treat malformed canonical content
as validated or repair it. Late pin-save publication captures the actual active
owner after save confirmation and rechecks after asynchronous dependency reading.
An A completion cannot overwrite B; A→B→A before confirmation still supports A.
Native source fingerprints belong to the exact read snapshot/canonical graph;
new header hashes are never stamped onto a revision-only older cache hit.
Same-revision source changes and mid-read mutations remain covered. Empty registry
handling avoids unnecessary closure traversal while full validation still rejects
unresolved foreign references.

## Parent verification and limits

The parent built a separate clean detached checkout of the frozen source using
the original `npm run build`: exit0, runtime `c02e8881b35f1c5484bd`, dirtyfalse.
The retained archive has13 actual members, each independently checked against the
manifest's size and SHA-256. This product build is distinct from the helper/UI
comparison builds; none establishes final formal performance acceptance.

The measurement-only runner correction `fa4c5a8` regenerates ignored portable
inputs before hashing/building. Product and tests are unchanged from `4daf23b`.
The parent independently matched305 tracked source hashes per final capture to
that commit, plus the generated runtime to the clean prebuild's171219 bytes and
SHA-256. All142 evidence artifacts and9 actual-build archives were checked for
size/SHA; ZIP CRC and every raw capture's build-member binding also passed.
The stale generated-input finding and superseded raw values remain intact.
Final Standard/Large selected-load and10-work UI observations include regressions;
they are disclosed rather than represented as general latency improvement.

The unchanged phase1 contract checker confirms73 locked inputs,104 requirements,
116 cases/464 clauses,24 packages/6 groups and68 supplemental checks, with no
acceptance promotion. The authorized additive internal DB v8 changes only exact
native version expectations from70 to80 in the two migration test files. Their
behavior/content/rollback assertions remain intact. No external portable/native/
runtime format changes. Rollback keeps v8 schema support and restores old UI/API
behavior; never downgrade/delete user databases.

Reported focused checks are55/55 across6 files, TypeScript exit0 and HTTP Chromium
7/7. Source inspection approvals do not replace full mandatory unit/build,
three-engine complete inventory or downstream rb03/rb04/rb10. Those existing CI
gates are required on the submitted Draft. Single OFF/ON observations are not p95
or original30/180/7200/complete-restore acceptance. Canonical retained-cache byte
estimates are not heap/GC proof and exclude UI worldRegistry preview graphs;
P2-05 owns further bounded retention work.

Original94 local/22 external and **RELEASE BLOCKED** remain unchanged. No devices,
production/auth settings, deployment, merge or publication were used.
