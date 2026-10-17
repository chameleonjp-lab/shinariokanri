# P2-05 design disposition and rollback

Frozen implementation: `260957a9ec25f3afeda8bede6481ceb2e417685f`, tree `4f2527db1b42eaa3fa7d303c2f9abbadc48ce247`; exact P204 base: `5b3949253937f1880bd426b39706c90a1db2e343`, tree `c24e4391ac29a1e2ef9af3aecc65ae145b13b59a`. [Phase 1 D05](../../phase1/DESIGN.md), the [handoff](../../phase1/HANDOFF.md), original contracts and blocked conditions remain authoritative. Original plan/readiness, every RED/setup attempt and frozen source are in the [sealed archive](evidence.zip), indexed by its [manifest](evidence-manifest.json).

## Adopted behavior and limits

Inactive project graphs use an internal four-entry LRU. `cachedProjects`, `contentHeads`, `cachedHistoryIds` and `completeHistories` leave together; unique per-project identity objects replace permanent numeric tombstones. Version/access/lifetime checks reject late publication and ABA. Concurrent active operations may temporarily own additional identities. Caller-keyed weak tokens, retained editor/history arrays, author drafts and canonical rows lie outside this inactive budget. This is not a project/source/input limit.

A save retains its previous image and native history/head tuple from the same read image independently of cache publication. Hydration need not re-enter the cache; a concurrent preview's eviction/release cannot create a false revision conflict. After native commit, abort skips only new cache publication: canonical revision/history/outbox and successful API completion remain authoritative. Native conflict/hash/asset checks stay unchanged.

Current, ordinary save and complete-project reads select **whole** immutable dependency rows. Explicit editions establish retained owners; selected typed external IDs still probe their direct outer row so a healthy retained copy cannot hide a conflicting selected copy. A missing direct key with an established retained owner remains selected. Unknown shape/owner uses full registry discovery and original structural/hash/owner validation. No synthetic aliases, persisted owner metadata, migration or canonical pruning were added. Unknown-owner work remains O(registry), without an O(closure) claim.

Current/save roots include retained snapshots and alternatives; complete reads also include history before/after images. Selected history retains P204 materialization. Export/recovery retains its single complete native registry capture and original worker selection, including historical/pending/recovery state. P201 selected `loadEditor` and previous-editor release are baseline behavior, not P205 gains.

Save/import immutable guards remain. Local ACK reproduction demonstrated a different-outer retained-ID collision between early prevalidation and final write. Nonempty applied ACK input repeats the global retained-ID guard **inside** the final native write transaction. The early guard preserves original fail-fast/error ordering and replay/conflict paths. This adds a mandatory full scan for that case; ACK is not timed by the capture matrix, so its cost is UNKNOWN. Rejection tests compare every native table with the post-rival image, including assets/outbox/base/prepared/metadata/evidence.

App keeps adopted dependencies and one replaceable preview by exact committed editor ID/revision/selection generation. The latest request fence separately rejects stale publication. Failed newer selection intent does not revoke the committed owner; exact-owner cleanup cannot clear a new/adopted closure. Delayed adoption refresh updates only the owner's adopted map, preserving its newer preview. Same-ID same/older-revision refresh preserves owner/preview; a genuine new revision resets it. Existing account/access/store remount and read lifetime fences remain. Other caller-held details/import completions/author inputs/view graphs lie outside this policy.

## Evidence and tradeoff

[Complete observations](DELIVERY.md) retain 74 OFF comparisons, all ON work and direct store/UI retention. Candidate final tuples were 4/4/4/1/4 with 8,144 JSON payload bytes versus original-size baseline 13/13/13/13/13 and Standard/Large 25,429,866/241,112,367 bytes. Candidate epochs reached zero on close; baselines retained 13 IDs. This supports scoped inactive retention, not total store/App/browser memory boundedness.

Actual HTTP UI kept two registry entries across six sources, preserving choices/adopted edition/failed input/in-flight 2→3→2/failed outer selection/delayed adoption refresh/ordinary same-revision idle refresh. Baseline still showed old detail for a selected new edition after pin refresh; its partial common prefix and failure remain. Unsupported baseline gauges are UNKNOWN.

Latency is not uniformly improved. Exact raw comparisons have 40 unfavorable pairs (13 Standard / 15 Large / 12 supplemental), including tiny near-ties. All three original cold edit/save/history waits worsened at both sizes. Their recorded project/record-part/decode/hash counts do not isolate those regressions' causes; host scheduling, GC/JIT and changed CPU/allocation costs remain UNKNOWN. The supplemental sequence shows a specific tradeoff: eviction causes cold body/dependency validation where baseline retained a graph, while selected listing/full reads avoid some unrelated world rows. Intrusive ON JSON-sizing elapsed is not OFF latency or causal proof.

Retain this limited implementation for explicit retention ownership, save correctness and immutable collision fixes, with observed latency costs disclosed for human integration. It is not a universal speed improvement or proof that four is optimal. Formal performance acceptance remains blocked; the controller may defer adoption or select a measured alternative without changing requirements.

| Alternative | Completeness, cost, invalidation and disposition |
| --- | --- |
| Selected whole rows plus operation-local owner discovery/full fallback | Adopted without persistent format changes. Unknown owners still scan; caller validators remain authoritative. Reader rollback is available. |
| Derived versioned retained-owner catalog | Unimplemented. May reduce unknown-owner body scans but adds metadata bytes/reads and atomic completeness obligations on save pin/import/ACK writers, old-version/missing/drift fallback and repair. Catalog discovery cannot replace body/hash/owner validation. No measured universal ranking. |
| New canonical owner metadata | Unimplemented. Adds migration/recovery/export/all-writer obligations; no evidence establishes necessity or lower cost. Separate format/rollback design required. |
| Four versus eight/sixteen/unbounded or byte-aware inactive budget | Only four was implemented/captured. Larger/weighted budgets may reduce cold rereads and retain more payload. No optimality, comparative timing or heap evidence. Unbounded baseline retains the observed large payload. |
| Shared global pin LRU/refcounts | Deferred per D05. Could share graphs but adds view/save/account lifetime and writer invalidation complexity. Not measured or declared universally worse. |

## Rollback

Selected reads can revert to full-registry reads; inactive LRU enforcement can be disabled/reconsidered without canonical deletion or migration. Revert preview policy only against preserved HTTP counterexamples: cumulative retention restores its memory tradeoff; indiscriminate cleanup restores demonstrated races. Keep local same-image save capture/publication fences and the independently justified atomic ACK guard when rolling back only an optimization. Do not silently remove correctness fixes with cache policy.

Exact baseline/candidate source blobs, seven overlays and actual build members are archived. Delivery documentation can revert independently. Account/role/access, canonical snapshots/history, assets/outbox/prepared state, request hashes and native formats remain authoritative.

## Verification and gates

Corrected full-registry/literal REDs preceded store/closure/cancellation/selected-corruption/ACK fixes. Invalid new fixtures, inadequate pin-oracle PASS, same-revision harness failure, initial missing helper/module and WIP full-suite/browser-policy failures remain archived. Historical source identities remain historical.

Exact260 received independent specification PASS/quality APPROVE before six exclusive captures. All 296 API rows fulfilled; candidate HTTP UI passed; baseline's pin error remains error with no invented `finishedAt`. Eight CDP rows are instantaneous separate fresh SMALL-context values without forced GC, not Large/retained/peak/release proof. No p95/significance/formal acceptance claim.

Original 104/116/464/24/6/68/73 and 94 local / 22 external remain **RELEASE BLOCKED**. Fixtures/assertions/retry/skip and 600,000/2,000/30/180/7,200 conditions stay unchanged; 1,200,000 ms bounds only supplemental orchestration. The controller owns unchanged hosted CI, delivery review and Draft PR; no agent merge/push/deploy/device/live Auth/cloud tests.
