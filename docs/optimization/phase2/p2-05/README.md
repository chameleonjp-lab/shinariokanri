# P2-05 dependency closure and retained graph delivery

P205 bounds inactive store graphs and obsolete App previews while preserving exact immutable editions and pending saves. Reviewed product/driver are frozen at `260957a9ec25f3afeda8bede6481ceb2e417685f`, tree `4f2527db1b42eaa3fa7d303c2f9abbadc48ce247`, on exact P204 `5b3949253937f1880bd426b39706c90a1db2e343`. This later delivery changes documentation and evidence only.

Six approved, exclusive, sequential captures completed once: five overall successes and the expected literal-baseline pin-preview UI failure. All 296 API rows fulfilled; all 148 ON rows settled. The [delivery report](DELIVERY.md), [74 OFF pairs / 148 raw values](latency-observations.csv), [all ON counters](work-observations.csv), [complete observations](measurements.json), [provenance](capture-provenance.json), [historical cohorts](historical-cohorts.json) and [archive manifest](evidence-manifest.json) retain adverse results and failures. The archive contains every historical P205 run/build/log, six actual capture ZIPs and the separate original 13-member product build.

There is no universal speed claim: raw comparisons have 40 unfavorable pairs (Standard 13, Large 15, supplemental 12), including near-tie floating-point jitter. Standard original cold edit/save/history changed from 659.6/480.5/2422 ms to 753.5/592.5/2515 ms; Large changed from 5902.5/5035.4/18097.1 ms to 7531.3/6632.5/21177.3 ms. Their causes were not isolated. The policy trades bounded inactive retention and dependency correctness for possible extra cold reads; [design disposition and rollback](DESIGN.md) explain its limited adoption and unmeasured alternatives. One observation per variant is not a distribution, p95, significance result or formal acceptance.

Actual final store tuples (projects/heads/history collections/complete-history sets/epochs) were 13/13/13/13/13 for both original-size baselines and 4/4/4/1/4 for candidates. Candidate cached payload ended at 8,144 canonical JSON bytes; baseline Standard/Large ended at 25,429,866/241,112,367 bytes. These are serialized graph payload counts, not browser memory. Candidate HTTP UI gauges retained two registry entries throughout six source choices; all choices, adopted edition and author inputs remained. Unsupported baseline UI registry gauges remain UNKNOWN. Its final pin UI failure and six earlier boundaries are preserved.

All eight CDP samples used separately fresh **SMALL supplemental** contexts without forced GC. They establish neither original Large/72 MiB heap nor peak, reachable retained memory or release acceptance. Values and limits are in the report and raw observations.

The runner remains correctness-only by default:

```sh
node scripts/optimization/measure-world-ownership.mjs --suite supplemental --output /absolute/unique/output
node scripts/optimization/measure-world-ownership.mjs --suite standard --ui false --output /absolute/unique/output
```

Check mode starts no API interval clocks, numeric probes or heap diagnostics. Capture commands in the report ran only after both exact-head reviews and an exclusive slot. The supplemental watchdog remains 1,200,000 ms, distinct from unchanged original 600,000/2,000 ms operation conditions. Original fixtures, sizes, assertions, retry/skip and 30/180/7,200 conditions are unchanged.

Controller read-only remote observation is documented in the delivery report: main contains repaired PR62; PR63/64 merged into feature branches, not main. These external merges do not change literal local source provenance. This agent performed no merge/rebase/push/PR creation/deployment. The controller owns subsequent remote-base verification, delivery review, Draft PR and full unchanged CI.

The WIP full-suite diagnostic retained 1,264 passing tests and two unchanged export-browser failures. Permission-correct targeted execution classified both as administrator-blocked `file://` navigation; this is not a local all-green full-suite or final-head CI claim. Original 104 requirements, 116 cases, 464 clauses, 24 packages, 6 groups, 68 supplements, 73 locked inputs, 94 local / 22 external remain unchanged: **RELEASE BLOCKED**. Formal Stage 3 follows human integration.
