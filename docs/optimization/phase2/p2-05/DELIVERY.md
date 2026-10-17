# P2-05 capture and delivery report

Frozen reviewed product/driver: `260957a9ec25f3afeda8bede6481ceb2e417685f`, tree `4f2527db1b42eaa3fa7d303c2f9abbadc48ce247`; literal P204 baseline: `5b3949253937f1880bd426b39706c90a1db2e343`, tree `c24e4391ac29a1e2ef9af3aecc65ae145b13b59a`. The later delivery commit changes documentation/evidence only. Original `task-5-report.md` and `p205-freeze-manifest.json` remain immutable, including their historical pre-capture STOP language. They are historical handoff records, not current NOT RUN claims.

Six approved captures ran sequentially once after exact260 specification PASS and quality APPROVE, in the controller-allocated exclusive slot at 2026-10-17 09:56:09 UTC. Slot released after the last capture and bounded clean-source checks. No extra/repeated capture, timing-source change, timeout/assertion/retry/skip relaxation or competing team workload was authorized. Packaging reads, hashing and ZIP work occurred after release.

**Outcome:** five overall successes plus the genuine expected literal-baseline pin-preview error. All 296 API rows fulfilled; all 148 ON rows settled with zero pending transactions and no API/observation error. Exact raw OFF comparison has 40 unfavorable pairs (13 Standard / 15 Large / 12 supplemental), including very small near-ties. No universal speed improvement, p95, significance or original acceptance claim. See [design disposition/rollback](DESIGN.md).

## Definitions and comparison limits

- **OFF:** Single performance.now elapsed around actual awaited API. Pre-invocation checkpoint, fixture/input construction, oracle/hash checks and cleanup excluded. No numeric probe. Includes actual API wall wait, scheduling and worker/IDB latency. All raw float values preserved.
- **ON:** Separate newly seeded database and invocation sequence. Raw probe counters/events are instrumentation-affected work diagnostics, not OFF latency. API settled before numeric counter settlement. Every final ON row fulfilled with settled capture and zero pending native transactions.
- **pairing:** Identical suite, literal fixed input, seven overlay bytes, operation labels/order and API options; independent fresh databases. Supplemental successful API prefixes compare; failed baseline UI suffix never compared as equivalent successful latency.
- **missingMetrics:** Raw absent counter keys remain unrecorded, never filled with zero. Baseline lacks declared world/UI gauges: UNKNOWN. Gauge values are instantaneous last samples; counters sum instrumented calls/rows/bytes, not unique rows, physical IDB bytes or retained heap.
- **storeRetention:** Direct outside-interval cachedProjects/contentHeads/cachedHistoryIds/completeHistories/cacheEpochs sizes. records=sum entities+relations of cached graphs; canonicalBytes=sum UTF-8 JSON bytes of cached graphs including cached history. Caller-owned weak tokens, drafts, active save captures and canonical IDB/outbox/assets lie outside this inactive budget.
- **UIRegistry:** Separate actual ON UI gauge: registry object entries; unique project object identities; sum current entities+relations; serialized JSON payload. Shared/caller-owned other views may retain graphs. Unsupported baseline gauge UNKNOWN.
- **heap:** CDP Runtime.getHeapUsage instantaneous renderer/isolate values in separately fresh SMALL six-source fixture context, regardless of original suite flag. No forcedGC, peak, retained/reachable heap or release acceptance; original Large/72MiB memory UNKNOWN.
- **strictUnfavorable:** candidateMilliseconds > baselineMilliseconds on exact stored raw floats, including very small near-tie jitter. No rounded-value omission, statistical inference, p95 or threshold acceptance.

`db.read.*` counts instrumented read calls/requested or returned rows and serialized payload; repeated reads count repeatedly, not unique native rows. `hash.*`, `json.*`, normalization/validation/diff counters and worker message/byte counters describe the exact instrumented source work. Probe JSON payload estimates are not interchangeable with direct `storeRetention.canonicalBytes`. `probe.size.milliseconds` and phase events expose ON instrumentation/sizing cost, not OFF API latency. Every raw counter/event remains in [measurements.json](measurements.json); the [work CSV](work-observations.csv) includes the union of recorded keys with UNKNOWN for absent sides.

The 26 original-size API operations include initial original save, original cold edit, one-character save and cold two-command full history, followed by the same 22 supplemental API operations. Six supplemental work/source iterations call current editing read, dependency listing and source preview; the first editor is retained across pressure, then saved, selected history materialized, cold full project read and fully exported. Fixture construction/setup, oracle validation, digesting and cleanup sit outside API intervals. Setup still changes cache state identically according to each product policy; it is not erased from retention observations.

The API-only original-size pairs use identical `--ui false`. Separate identical actualApp UI captures retain baseline common-prefix observations and its later pin semantic failure; that failed suffix is not compared as an equivalent successful UI latency. UI proofs measure functionality and ON gauges, not UI wait distributions. The optional fresh-context CDP diagnostic is SMALL supplemental regardless of the outer `--suite standard` flag.

## Actual commands, exits and raw captures

All commands below used unchanged runner and permission-enabled local browser/HTTP-loopback child launch. Shell logs and generator logs are unmodified archive members under `raw/<directory-name>...`; [provenance](capture-provenance.json) gives full actual cwd/argv/source/build/input identities. Git directory labels are not source evidence.

| Directory | Exit / overall | API rows | Actual recordedAt → finishedAt (UTC) |
| --- | --- | ---: | --- |
| `p205-capture-baseline-5b-standard-1` | 0 / ok | 52 | 2026-10-17T09:57:35.141Z → 2026-10-17T09:58:41.944Z |
| `p205-capture-candidate-260-standard-1` | 0 / ok | 52 | 2026-10-17T09:59:26.219Z → 2026-10-17T10:00:37.993Z |
| `p205-capture-baseline-5b-large-1` | 0 / ok | 52 | 2026-10-17T10:00:51.852Z → 2026-10-17T10:07:41.851Z |
| `p205-capture-candidate-260-large-1` | 0 / ok | 52 | 2026-10-17T10:07:56.358Z → 2026-10-17T10:15:58.463Z |
| `p205-capture-baseline-5b-supplemental-1` | 1 / error | 44 | 2026-10-17T10:16:21.048Z → ABSENT: genuine UI error |
| `p205-capture-candidate-260-supplemental-1` | 0 / ok | 44 | 2026-10-17T10:16:53.761Z → 2026-10-17T10:17:03.902Z |

Actual runner commands (each output was unique; baseline cwd `/workspace/p2-02-validation`, candidate cwd `/workspace/phase2`):

```sh
node scripts/optimization/measure-world-ownership.mjs --suite standard --mode capture --ui false --heap true --output /workspace/phase2-progress/p205-capture-baseline-5b-standard-1
node scripts/optimization/measure-world-ownership.mjs --suite standard --mode capture --ui false --heap true --output /workspace/phase2-progress/p205-capture-candidate-260-standard-1
node scripts/optimization/measure-world-ownership.mjs --suite large --mode capture --ui false --output /workspace/phase2-progress/p205-capture-baseline-5b-large-1
node scripts/optimization/measure-world-ownership.mjs --suite large --mode capture --ui false --output /workspace/phase2-progress/p205-capture-candidate-260-large-1
node scripts/optimization/measure-world-ownership.mjs --suite supplemental --mode capture --output /workspace/phase2-progress/p205-capture-baseline-5b-supplemental-1
node scripts/optimization/measure-world-ownership.mjs --suite supplemental --mode capture --output /workspace/phase2-progress/p205-capture-candidate-260-supplemental-1
```

Baseline supplemental error requested literal `P205 newer-only place 0` after holding only the pin adopted-closure refresh while a real source revision triggered newer preview. Actual dialog displayed old `P205 place 0` / edition0. Its unchanged 5,000 ms assertion failed; overall stays error/CLI1 and has no fabricated `finishedAt`. All 44 API rows, ordinary same-revision PASS, failed-input check and six prior source retention boundaries survive in raw checkpoints. This is the pre-existing common-baseline UI behavior, not a successful whole-UI performance baseline.

## Every OFF pair

All 74 paired observations / 148 raw API elapsed values follow, unrounded. `candidate > baseline` uses stored raw floats; even tiny positive differences remain. No raw value is omitted or rerun. CSV preserves LF-only line endings and identical values: [latency-observations.csv](latency-observations.csv).

| Suite | Operation | Baseline ms | Candidate ms | Candidate − baseline ms | Candidate > baseline |
| --- | --- | ---: | ---: | ---: | --- |
| standard | `original-fixture-save` | 3395 | 2994.89999999851 | -400.1000000014901 | False |
| standard | `original-cold-editing-amid-six-worlds` | 659.5999999977648 | 753.5 | 93.90000000223517 | True |
| standard | `original-save-one-amid-six-worlds` | 480.5 | 592.5 | 112.0 | True |
| standard | `original-cold-full-history-amid-six-worlds` | 2422 | 2515 | 93 | True |
| standard | `select-work-0` | 1.2000000029802322 | 12.099999997764826 | 10.899999994784594 | True |
| standard | `dependencies-work-0` | 5.800000000745058 | 2.399999998509884 | -3.400000002235174 | False |
| standard | `preview-source-0` | 21.5 | 10.200000002980232 | -11.299999997019768 | False |
| standard | `select-work-1` | 2.2000000029802322 | 9.099999997764826 | 6.899999994784594 | True |
| standard | `dependencies-work-1` | 2.599999997764826 | 2.600000001490116 | 3.725290298461914e-09 | True |
| standard | `preview-source-1` | 7.600000001490116 | 6.799999997019768 | -0.8000000044703484 | False |
| standard | `select-work-2` | 24.600000001490116 | 5.400000002235174 | -19.199999999254942 | False |
| standard | `dependencies-work-2` | 2.199999999254942 | 3.399999998509884 | 1.199999999254942 | True |
| standard | `preview-source-2` | 8.100000001490116 | 6 | -2.100000001490116 | False |
| standard | `select-work-3` | 7.100000001490116 | 5.5 | -1.6000000014901161 | False |
| standard | `dependencies-work-3` | 2.099999997764826 | 1.8999999985098839 | -0.19999999925494194 | False |
| standard | `preview-source-3` | 7.800000000745058 | 7.899999998509884 | 0.09999999776482582 | True |
| standard | `select-work-4` | 4.399999998509884 | 7.5 | 3.100000001490116 | True |
| standard | `dependencies-work-4` | 4.5 | 2.199999999254942 | -2.300000000745058 | False |
| standard | `preview-source-4` | 6.300000000745058 | 11.100000001490116 | 4.800000000745058 | True |
| standard | `select-work-5` | 2 | 7.099999997764826 | 5.099999997764826 | True |
| standard | `dependencies-work-5` | 3.300000000745058 | 1.6000000014901161 | -1.699999999254942 | False |
| standard | `preview-source-5` | 7 | 8.400000002235174 | 1.4000000022351742 | True |
| standard | `save-retained-draft-after-pressure` | 15.5 | 18.300000000745058 | 2.800000000745058 | True |
| standard | `selected-history` | 3.699999999254942 | 1.199999999254942 | -2.5 | False |
| standard | `cold-full-project` | 51.30000000074506 | 48.80000000074506 | -2.5 | False |
| standard | `complete-export-with-history` | 101.39999999850988 | 92.19999999925494 | -9.199999999254942 | False |
| large | `original-fixture-save` | 30696.599999997765 | 30461.699999999255 | -234.89999999850988 | False |
| large | `original-cold-editing-amid-six-worlds` | 5902.5 | 7531.300000000745 | 1628.800000000745 | True |
| large | `original-save-one-amid-six-worlds` | 5035.400000002235 | 6632.5 | 1597.0999999977648 | True |
| large | `original-cold-full-history-amid-six-worlds` | 18097.10000000149 | 21177.300000000745 | 3080.199999999255 | True |
| large | `select-work-0` | 3.599999997764826 | 9.699999999254942 | 6.100000001490116 | True |
| large | `dependencies-work-0` | 4.699999999254942 | 2.599999997764826 | -2.100000001490116 | False |
| large | `preview-source-0` | 8.5 | 8.800000000745058 | 0.30000000074505806 | True |
| large | `select-work-1` | 1.1000000014901161 | 28.600000001490116 | 27.5 | True |
| large | `dependencies-work-1` | 2 | 2.199999999254942 | 0.19999999925494194 | True |
| large | `preview-source-1` | 6.5 | 8.699999999254942 | 2.199999999254942 | True |
| large | `select-work-2` | 1.1000000014901161 | 29.100000001490116 | 28.0 | True |
| large | `dependencies-work-2` | 1.3999999985098839 | 1.8999999985098839 | 0.5 | True |
| large | `preview-source-2` | 6.699999999254942 | 6.100000001490116 | -0.5999999977648258 | False |
| large | `select-work-3` | 1.5 | 25.400000002235174 | 23.900000002235174 | True |
| large | `dependencies-work-3` | 2.899999998509884 | 2 | -0.8999999985098839 | False |
| large | `preview-source-3` | 7.300000000745058 | 6.399999998509884 | -0.9000000022351742 | False |
| large | `select-work-4` | 1.300000000745058 | 5.300000000745058 | 4.0 | True |
| large | `dependencies-work-4` | 2.199999999254942 | 1.199999999254942 | -1.0 | False |
| large | `preview-source-4` | 6.199999999254942 | 5.800000000745058 | -0.3999999985098839 | False |
| large | `select-work-5` | 1.1000000014901161 | 5.399999998509884 | 4.299999997019768 | True |
| large | `dependencies-work-5` | 2.400000002235174 | 1.3999999985098839 | -1.0000000037252903 | False |
| large | `preview-source-5` | 6.199999999254942 | 6.300000000745058 | 0.10000000149011612 | True |
| large | `save-retained-draft-after-pressure` | 24.5 | 14.200000002980232 | -10.299999997019768 | False |
| large | `selected-history` | 1.199999999254942 | 1.300000000745058 | 0.10000000149011612 | True |
| large | `cold-full-project` | 49.30000000074506 | 47.599999997764826 | -1.7000000029802322 | False |
| large | `complete-export-with-history` | 112.69999999925494 | 88.79999999701977 | -23.900000002235174 | False |
| supplemental | `select-work-0` | 1.7000000029802322 | 7.899999998509884 | 6.199999995529652 | True |
| supplemental | `dependencies-work-0` | 3 | 2.199999999254942 | -0.8000000007450581 | False |
| supplemental | `preview-source-0` | 7.600000001490116 | 8 | 0.3999999985098839 | True |
| supplemental | `select-work-1` | 0.8000000007450581 | 5.300000000745058 | 4.5 | True |
| supplemental | `dependencies-work-1` | 1.6000000014901161 | 1.5 | -0.10000000149011612 | False |
| supplemental | `preview-source-1` | 5.600000001490116 | 5.699999999254942 | 0.09999999776482582 | True |
| supplemental | `select-work-2` | 0.7999999970197678 | 4.900000002235174 | 4.100000005215406 | True |
| supplemental | `dependencies-work-2` | 1.5 | 1.199999999254942 | -0.30000000074505806 | False |
| supplemental | `preview-source-2` | 5.200000002980232 | 5.300000000745058 | 0.09999999776482582 | True |
| supplemental | `select-work-3` | 0.6999999992549419 | 4.199999999254942 | 3.5 | True |
| supplemental | `dependencies-work-3` | 1.5999999977648258 | 1.1000000014901161 | -0.4999999962747097 | False |
| supplemental | `preview-source-3` | 6.199999999254942 | 5.100000001490116 | -1.0999999977648258 | False |
| supplemental | `select-work-4` | 0.9000000022351742 | 5.100000001490116 | 4.199999999254942 | True |
| supplemental | `dependencies-work-4` | 1.6000000014901161 | 1.1000000014901161 | -0.5 | False |
| supplemental | `preview-source-4` | 6.300000000745058 | 5.5 | -0.8000000007450581 | False |
| supplemental | `select-work-5` | 1 | 4.699999999254942 | 3.699999999254942 | True |
| supplemental | `dependencies-work-5` | 1.800000000745058 | 1.3999999985098839 | -0.4000000022351742 | False |
| supplemental | `preview-source-5` | 6.099999997764826 | 5 | -1.0999999977648258 | False |
| supplemental | `save-retained-draft-after-pressure` | 8.600000001490116 | 11.900000002235174 | 3.300000000745058 | True |
| supplemental | `selected-history` | 1.699999999254942 | 1.4000000022351742 | -0.29999999701976776 | False |
| supplemental | `cold-full-project` | 46.899999998509884 | 50.600000001490116 | 3.7000000029802322 | True |
| supplemental | `complete-export-with-history` | 83.09999999776483 | 101.89999999850988 | 18.800000000745058 | True |

The unfavorable original cold edit/save/history observations are material: Standard 659.6→753.5, 480.5→592.5, 2422→2515 ms; Large 5902.5→7531.3, 5035.4→6632.5, 18097.1→21177.3 ms. Recorded corresponding project/record-part/decode/hash counts do not isolate a cause. Changed CPU/allocation work, host scheduling and GC/JIT explanations remain UNKNOWN. These are single observations, not regression probabilities, platform predictions or thresholds.

## ON work, extra reads and retained full paths

All 148 ON rows preserve every recorded counter, event, completeness label and zero-pending-transaction boundary in [measurements.json](measurements.json), with all union counter keys in [work-observations.csv](work-observations.csv). No ON top-level API latency is fabricated. Selected work0 can require cold body/world validation on the candidate because the four-entry policy evicted it; baseline retained it. Conversely, dependencies work0/full work0 avoid the unrelated full-registry body read on the known-owner path. The following selected raw work values illustrate this tradeoff without claiming they explain the original-size wait regressions.

| Suite | Operation | Counter | Baseline raw | Candidate raw |
| --- | --- | --- | ---: | ---: |
| standard | `original-save-one-amid-six-worlds` | `db.read.rows.recordParts` | UNRECORDED/UNKNOWN | UNRECORDED/UNKNOWN |
| standard | `original-save-one-amid-six-worlds` | `db.read.payloadBytes.recordParts` | UNRECORDED/UNKNOWN | UNRECORDED/UNKNOWN |
| standard | `original-save-one-amid-six-worlds` | `normalize.rows` | 31200 | 31200 |
| standard | `original-save-one-amid-six-worlds` | `hash.bytes` | 6603220 | 6603220 |
| standard | `original-cold-full-history-amid-six-worlds` | `db.read.rows.recordParts` | 3 | 3 |
| standard | `original-cold-full-history-amid-six-worlds` | `db.read.payloadBytes.recordParts` | 3519704 | 3519704 |
| standard | `original-cold-full-history-amid-six-worlds` | `decode.rows` | 1 | 1 |
| standard | `select-work-0` | `db.read.rows.entities` | UNRECORDED/UNKNOWN | 1 |
| standard | `select-work-0` | `db.read.rows.worlds` | UNRECORDED/UNKNOWN | 1 |
| standard | `dependencies-work-0` | `db.read.rows.worlds` | 7 | 1 |
| standard | `dependencies-work-0` | `db.read.payloadBytes.worlds` | 12358 | 2724 |
| standard | `cold-full-project` | `db.read.rows.worlds` | 6 | 1 |
| standard | `cold-full-project` | `db.read.payloadBytes.worlds` | 9634 | 2724 |
| standard | `complete-export-with-history` | `db.read.rows.worlds` | 6 | 6 |
| standard | `complete-export-with-history` | `db.read.payloadBytes.worlds` | 9634 | 9634 |
| large | `original-save-one-amid-six-worlds` | `db.read.rows.recordParts` | 6 | 6 |
| large | `original-save-one-amid-six-worlds` | `db.read.payloadBytes.recordParts` | 8076674 | 8076674 |
| large | `original-save-one-amid-six-worlds` | `normalize.rows` | 312012 | 312012 |
| large | `original-save-one-amid-six-worlds` | `hash.bytes` | 59408535 | 59408535 |
| large | `original-cold-full-history-amid-six-worlds` | `db.read.rows.recordParts` | 21 | 21 |
| large | `original-cold-full-history-amid-six-worlds` | `db.read.payloadBytes.recordParts` | 39137744 | 39137744 |
| large | `original-cold-full-history-amid-six-worlds` | `decode.rows` | 2 | 2 |
| large | `select-work-0` | `db.read.rows.entities` | UNRECORDED/UNKNOWN | 1 |
| large | `select-work-0` | `db.read.rows.worlds` | UNRECORDED/UNKNOWN | 1 |
| large | `dependencies-work-0` | `db.read.rows.worlds` | 7 | 1 |
| large | `dependencies-work-0` | `db.read.payloadBytes.worlds` | 12358 | 2724 |
| large | `cold-full-project` | `db.read.rows.worlds` | 6 | 1 |
| large | `cold-full-project` | `db.read.payloadBytes.worlds` | 9634 | 2724 |
| large | `complete-export-with-history` | `db.read.rows.worlds` | 6 | 6 |
| large | `complete-export-with-history` | `db.read.payloadBytes.worlds` | 9634 | 9634 |
| supplemental | `select-work-0` | `db.read.rows.entities` | UNRECORDED/UNKNOWN | 1 |
| supplemental | `select-work-0` | `db.read.rows.worlds` | UNRECORDED/UNKNOWN | 1 |
| supplemental | `dependencies-work-0` | `db.read.rows.worlds` | 7 | 1 |
| supplemental | `dependencies-work-0` | `db.read.payloadBytes.worlds` | 12358 | 2724 |
| supplemental | `cold-full-project` | `db.read.rows.worlds` | 6 | 1 |
| supplemental | `cold-full-project` | `db.read.payloadBytes.worlds` | 9634 | 2724 |
| supplemental | `complete-export-with-history` | `db.read.rows.worlds` | 6 | 6 |
| supplemental | `complete-export-with-history` | `db.read.payloadBytes.worlds` | 9634 | 9634 |

Absent keys above are not measured zeros. Baseline declares no P205 world-closure/UI metric support. Candidate unknown-shape/owner fallback remains a full registry scan, guarded by original validators. Unknown owner workload was correctness-tested but its broader performance is not isolated by these known fixtures. Complete export still reads six native world rows in each variant before selecting the one actual outer dependency. Selected output dependency keys match (one in each run); those keys are not the native registry inventory, full archive-byte equality or an independent full-registry oracle. The oracle separately receives every raw native world row and literal ID/hash expectations. Dynamic native writer timestamps/operation IDs can differ across fresh databases.

The retained early ACK guard plus final native-transaction guard performs one extra mandatory full scan for nonempty applied ACK world input. ACK is outside this capture sequence, so cost is UNKNOWN/unmeasured. It must not be advertised as free. Canonical pin/import/export/recovery/hash/owner checks and complete immutable rows remain authoritative.

## Store retention: all captured boundaries

The complete OFF and ON `runs` objects include after-setup and all six source boundaries, final/released/closed tuples, graph record and canonical-byte counts. They are preserved without reduction in [measurements.json](measurements.json). Final/released/closed readings below are direct outside-interval observations, distinct from probe payload/heap.

| Suite / variant / run | Boundary | projects / heads / histories / complete / epochs | records | JSON bytes |
| --- | --- | --- | ---: | ---: |
| standard / baseline-5b / OFF | retention | 13 / 13 / 13 / 13 / 13 | 8813 | 25429866 |
| standard / baseline-5b / OFF | released | 1 / 1 / 1 / 1 / 13 | 8800 | 25380198 |
| standard / baseline-5b / OFF | closed | 0 / 0 / 0 / 0 / 13 | 0 | 0 |
| standard / baseline-5b / ON | retention | 13 / 13 / 13 / 13 / 13 | 8813 | 25429866 |
| standard / baseline-5b / ON | released | 1 / 1 / 1 / 1 / 13 | 8800 | 25380198 |
| standard / baseline-5b / ON | closed | 0 / 0 / 0 / 0 / 13 | 0 | 0 |
| standard / candidate-260 / OFF | retention | 4 / 4 / 4 / 1 / 4 | 4 | 8144 |
| standard / candidate-260 / OFF | released | 0 / 0 / 0 / 0 / 0 | 0 | 0 |
| standard / candidate-260 / OFF | closed | 0 / 0 / 0 / 0 / 0 | 0 | 0 |
| standard / candidate-260 / ON | retention | 4 / 4 / 4 / 1 / 4 | 4 | 8144 |
| standard / candidate-260 / ON | released | 0 / 0 / 0 / 0 / 0 | 0 | 0 |
| standard / candidate-260 / ON | closed | 0 / 0 / 0 / 0 / 0 | 0 | 0 |
| large / baseline-5b / OFF | retention | 13 / 13 / 13 / 13 / 13 | 88016 | 241112367 |
| large / baseline-5b / OFF | released | 1 / 1 / 1 / 1 / 13 | 88003 | 241062699 |
| large / baseline-5b / OFF | closed | 0 / 0 / 0 / 0 / 13 | 0 | 0 |
| large / baseline-5b / ON | retention | 13 / 13 / 13 / 13 / 13 | 88016 | 241112367 |
| large / baseline-5b / ON | released | 1 / 1 / 1 / 1 / 13 | 88003 | 241062699 |
| large / baseline-5b / ON | closed | 0 / 0 / 0 / 0 / 13 | 0 | 0 |
| large / candidate-260 / OFF | retention | 4 / 4 / 4 / 1 / 4 | 4 | 8144 |
| large / candidate-260 / OFF | released | 0 / 0 / 0 / 0 / 0 | 0 | 0 |
| large / candidate-260 / OFF | closed | 0 / 0 / 0 / 0 / 0 | 0 | 0 |
| large / candidate-260 / ON | retention | 4 / 4 / 4 / 1 / 4 | 4 | 8144 |
| large / candidate-260 / ON | released | 0 / 0 / 0 / 0 / 0 | 0 | 0 |
| large / candidate-260 / ON | closed | 0 / 0 / 0 / 0 / 0 | 0 | 0 |
| supplemental / baseline-5b / OFF | retention | 12 / 12 / 12 / 12 / 12 | 13 | 49668 |
| supplemental / baseline-5b / OFF | released | 0 / 0 / 0 / 0 / 12 | 0 | 0 |
| supplemental / baseline-5b / OFF | closed | 0 / 0 / 0 / 0 / 12 | 0 | 0 |
| supplemental / baseline-5b / ON | retention | 12 / 12 / 12 / 12 / 12 | 13 | 49668 |
| supplemental / baseline-5b / ON | released | 0 / 0 / 0 / 0 / 12 | 0 | 0 |
| supplemental / baseline-5b / ON | closed | 0 / 0 / 0 / 0 / 12 | 0 | 0 |
| supplemental / candidate-260 / OFF | retention | 4 / 4 / 4 / 1 / 4 | 4 | 8144 |
| supplemental / candidate-260 / OFF | released | 0 / 0 / 0 / 0 / 0 | 0 | 0 |
| supplemental / candidate-260 / OFF | closed | 0 / 0 / 0 / 0 / 0 | 0 | 0 |
| supplemental / candidate-260 / ON | retention | 4 / 4 / 4 / 1 / 4 | 4 | 8144 |
| supplemental / candidate-260 / ON | released | 0 / 0 / 0 / 0 / 0 | 0 | 0 |
| supplemental / candidate-260 / ON | closed | 0 / 0 / 0 / 0 / 0 | 0 | 0 |

The original-sized graph is eventually evicted on the candidate during the six-source sequence; it is not deleted from native storage, caller-owned returned values, author input or history. All candidate final release/close collections and epochs are zero; baseline original-size release retains the original graph and close retains 13 epoch IDs. Weak read/history metadata is not enumerable and has no global boundedness proof. Caller-held drafts/details/history arrays and simultaneous active-save captures remain outside the inactive budget.

## Actual HTTP App UI retention and failures

The actual App ran through HTTP loopback, not a pure helper substitute. Both variants retain all six common-prefix checkpoints before the baseline pin error. Candidate full proof preserves all six picker choices and adopted edition, author input after failed source hash, held source2→3→2, preview pending before a real import/editor-read rejection, subsequent ABA detail resolution, held pin adopted-refresh/newer distinct detail and held ordinary idle SyncPanel same-revision refresh. The fixed local same-account session performs zero transport sends/downloads/unexpected network calls; shares/members are inert local metadata, not live Auth/service evidence.

| Candidate boundary | Registry entries / unique project objects / records | Probe payload bytes | Store projects / heads / histories / complete / epochs | Store JSON bytes |
| --- | --- | ---: | --- | ---: |
| source 0 | 2 / 2 / 4 | 6176 | 4 / 4 / 4 / 2 / 4 | 13532 |
| source 1 | 2 / 2 / 3 | 4424 | 4 / 4 / 4 / 2 / 4 | 11297 |
| source 2 | 2 / 2 / 3 | 4424 | 4 / 4 / 4 / 2 / 4 | 11297 |
| source 3 | 2 / 2 / 3 | 4424 | 4 / 4 / 4 / 2 / 4 | 11297 |
| source 4 | 2 / 2 / 3 | 4424 | 3 / 3 / 3 / 1 / 3 | 7030 |
| source 5 | 2 / 2 / 3 | 4424 | 2 / 2 / 2 / 0 / 2 | 2763 |
| final | 2 / 2 / 3 | 4424 | 3 / 3 / 3 / 1 / 3 | 6351 |

Baseline UI registry entry/project/record/payload gauges are UNKNOWN because literal5b does not provide those metrics. Its six direct store checkpoints and raw supporting probe values remain archived; unavailable final UI output is not zero. Candidate final store has four records/6,351 canonical JSON bytes while registry has three records/4,424 probe payload bytes. Neither is heap or proof that every App graph is released.

## All eight instantaneous CDP rows

Actual capability `CDP Runtime.getHeapUsage` succeeded for both variants. Each used a separately fresh renderer/context and **SMALL added six-source fixture** after API work, outside all API/UI timing. `freshContext=true`, `forcedGC=false`. There was no snapshot/GC/peak/reachable-retained/release acceptance measurement, and original Large/72 MiB heap remains UNKNOWN/NOT RUN. JIT, GC, transient allocations, renderer/embedder/harness scope and asynchronous collection prevent interpreting after-release values as retained memory or proof of reclamation.

| Variant | Boundary | usedSize bytes | totalSize bytes | embedderHeapUsedSize bytes | backingStorageSize bytes |
| --- | --- | ---: | ---: | ---: | ---: |
| baseline-5b | pre-load | 5361568 | 8237056 | 1704640 | 2190506 |
| baseline-5b | after multi-source selection | 16926428 | 29474816 | 5289096 | 2385608 |
| baseline-5b | after editor/preview release | 16966680 | 29474816 | 5289096 | 2385608 |
| baseline-5b | after store close | 16973092 | 29474816 | 5289096 | 2385608 |
| candidate-260 | pre-load | 5331876 | 8241152 | 1703744 | 2194477 |
| candidate-260 | after multi-source selection | 11929912 | 27340800 | 5304256 | 2389583 |
| candidate-260 | after editor/preview release | 11970628 | 27340800 | 5304256 | 2389583 |
| candidate-260 | after store close | 11976624 | 27340800 | 5304256 | 2389583 |

## Provenance and sealed artifacts

The [sealed ZIP](evidence.zip) is 77,875,411 bytes, SHA256 `dc2f188c4c0824774ae4adc89de07bb513494f09a1797914c5e23b40dda11451`, with 1,238 actual members / 197,329,884 uncompressed bytes. Every member was read and verified against original bytes plus SHA256 and ZIP CRC. Its [manifest](evidence-manifest.json) binds every member and all 609 original evidence input paths. No existing evidence/source files in that inventory were dropped and no delivery Git blob reaches 100 MiB; lossless chunking was unnecessary.

The archive retains raw historical directories/build ZIPs/extracted members/results/logs, exact immutable baseline303/candidate305 runtime source files, all22 owned candidate paths (overlapping runtime subsets stored once), seven common overlays and unchanged shared P204 observer. Frozen22 documentation is the original260 version; current delivery docs are a separately changed later commit. Full source Git blobs, generator commands, fresh generated outputs, environment, fixture hashes and actual build members are in [capture provenance](capture-provenance.json). The historical packaging/parent-verification scripts in the archive are evidence provenance, not newly advertised public CI commands.

| Capture | Actual build ZIP bytes / SHA256 | Actual members |
| --- | --- | ---: |
| `p205-capture-baseline-5b-standard-1` | 1124699 / `48157337d6538194668619de4f682e1351447564c736f3fbe8c799de5768c0cc` | 12 |
| `p205-capture-candidate-260-standard-1` | 1126021 / `417e06d24ef9f46d01bba8743f107c4c84956fe049f0c8eb222e76d0ba31dbc0` | 12 |
| `p205-capture-baseline-5b-large-1` | 1124699 / `6bff10b6d21ca3694d03d937a9a2fbcea695815a66b1939c96841d209741bc6b` | 12 |
| `p205-capture-candidate-260-large-1` | 1126021 / `90f0c1a033df0bd5d27e425d6375833ba2c528d3c03afaefb2ba9474b0eabce1` | 12 |
| `p205-capture-baseline-5b-supplemental-1` | 1124699 / `3bfe830edd835dc0bb9e4baeaec7f52e48961776b62145e86d3d0b8818620c15` | 12 |
| `p205-capture-candidate-260-supplemental-1` | 1126021 / `55dd98062741bf8eade7f218e3e1ce9d476d3eafdf233c421b05a7509e6cc72a` | 12 |

The separate unchanged original `npm run build` exited0 at clean260, with original base `/shinariokanri/`, build-info commit/tree/dirty=false and13 actual members: `actual-product-build.zip`, 1098160 bytes, SHA256 `55fef0011353754379923667fd0b994ae19158bf8c6b77dbfd725dbb63d9445c`. Its generator/build log/build-info/extracted bytes/member manifest and ZIP are archived, independently reverified against every member. Measurement builds are custom12-member Vite harness bundles and are not substituted for this production build.

| Immutable record | Bytes / SHA256 |
| --- | --- |
| `task-5-report.md` | 21392 / `3832792b4247301d9658f3ea0d1e582c6cfbaac7b594f9f60e210d996c0a0a9b` |
| `p205-freeze-manifest.json` | 269411 / `29916a48843abe712246d13a545bc5807b6b0a8895a04c59e4c469b609fa9062` |
| `task-5-spec-final-review.md` | 20122 / `11449b2da9282e06c3dba5d5b9c70a25f254791187739f7a3dab6bd17a28f821` |
| `task-5-quality-final-review.md` | 20680 / `2bd31c1215a94c66f69286b9e118a925c3b54c1c879d6ffe60b12d87884ee117` |
| `p205-capture-gate.json` | 1131 / `5984902b94b515565ace38858e95f6df350ffc3e23c35c274b86ddd79655a3cf` |
| `p205-capture-parent-verification.json` | 36979 / `46801cb3486e199bf9534d5b581a01ca33a20eeca8a4120b7ae8d06f03368586` |
| `verify-p205-capture-parent.py` | 8846 / `d98ae5b32eceef4d25f4b706b045dab9cf2556073698f5b7e89021ab5c2ceec0` |
| `p205-retention-parent-extraction.json` | 19228 / `67231baea04da27f9707a282fce96624a8cdbb2977f53780a4cdcc95eff7de6d` |
| `remote-integration-observation-1024.json` | 4698 / `97ed3f42ee2b54fa5c5c1df924e5f8dbc457bbd480fef63dd9a7c4f8e0f157cc` |

The frozen manifest additionally binds all22 owned paths, 305 runtime inputs, seven overlay hashes, generated output, six final correctness builds, original production build, verification commands and preserved logs. Root receipts preserve original276/274 procedure continuity, exact3 authorized v8 strict changes, original104/116/464/24/6/68/73 contract checks, and all296 P204-cumulative test/fixture/CI/config files byte-identical to exact5b with12 additive files. Receipts prove source continuity, not re-executed acceptance. The independent parent capture receipt verified six ZIPs/72members, Git source blobs/overlays/fixtures, all296 fulfilled rows, raw40-unfavorable count, baseline partial UI failure and eight SMALL CDP rows.

Original Standard input: `standard-r06-v1`, 6,258,972 JSON bytes, SHA256 `a15eb7d1c10e6c008c9881cc215239a67fa80e28eef0f7627e4742a2de05c13e`,8,800records,0assets. Large: `large-material-rb10-v1`,59,407,368 JSON bytes, SHA256 `814daf96a6511cf47409f3497b03c7ba0309af250bfd87306c44a1dec5d5a917`,88,003records,actual75,497,472asset bytes (3×25,165,824); all three actual asset byte/hash fields match original declared hashes. Supplemental input18,858bytes SHA256 `70a0d99d2a89eb92a8e123676aea2043ba175443bfa874ec013c4e65c806d293`; UI-only distinct-edition input18,880bytes SHA256 `f0d6e5bd0b3bcc424d7b88a275b6116852d072106d5f28a846bb36b863be08a0`. All sizes/seeds/generated bytes are original or explicitly added supplemental inputs; no weakened original fixture.

The driver generated original project/asset values in memory and recorded their actual byte/hash fields; it did not dump serialized Standard/Large projects or the 72 MiB asset buffers as standalone files. Those values are reproducible from the archived immutable original generator source and recorded seeds. The archive preserves all existing raw result/build files and generator code, rather than claiming to contain a byte dump that was never written. Packaging did not rerun the fixture generator or recapture data.

## Historical RED/GREEN and failed setup cohorts

All32 runner result directories retain their actual status/source/overlay/argv/input/build identity in [historical-cohorts.json](historical-cohorts.json), with every raw byte archived. Old80da/3210/bd9d/651 checks are historical, not final260. A baseline directory suffix `d68` was a naming typo; actual `result.source` and overlay hashes remain authoritative.

| Cohort | Actual distinction / retained GREEN |
| --- | --- |
| `p205-cache-red.log` | Five intended retention/hydrate/save failures; corrected36-test GREEN and final196-test store cohort. WIP RED has no at-start frozen source manifest. |
| `p205-closure-red1/2/3.log` | Invalid new fixture setup (scope/body/default-note), not behavioral RED. |
| `p205-closure-red4.log` | Corrected valid full-registry/literal oracle: three behavioral failures;48-test GREEN. |
| `p205-preview-red.log` / `p205-driver-red.log` | Initial missing new helper API / missing new module; not HTTP-race or performance proof. |
| `p205-outer-selection-red-80da-overlay-1` | Actual import then failed editor read leaves detail unresolved; final pending-preview/ABA HTTP GREEN. |
| `p205-pin-refresh-red-3210-overlay-1` | Inadequate oracle PASS: identical old/new names allowed adopted fallback; not valid GREEN. |
| `p205-pin-refresh-red-3210-overlay-2` | Genuine RED with distinct newer-only literal; final literal5b common-trigger RED and260 GREEN. |
| `p205-cache-cancel-red.log` | Postcommit success/native rev2 but wrong new cache publication;11-test GREEN retains old tuple/native success. |
| `p205-selected-corruption-red.log` | Four APIs wrongly fulfilled and save mutated;20-test GREEN rejects direct-copy conflict/all-native preservation. |
| `p205-ack-collision-red.log` | Supported local ACK native barrier race wrongly commits;14-test GREEN incl originals, all native image preserved relative to rival. |
| `p205-same-revision-red-651b-overlay-1` | Local harness setup failure for ordinary shares metadata; not preview-loss RED. |
| `p205-same-revision-red-651b-overlay-2` | Genuine held ordinary idle refresh rev1/detail loss with send0/network0; exact260 HTTP and17-test helper/driver/library GREEN. |
| Earlier type/docs/prototype checks | Initial new-test/driver errors and later corrections retained separately; no original assertion/fixture relaxed. |

Actual successful focused commands and source limits are retained verbatim in `p205-verification-commands.json` under raw archive. The19-file explicit Vitest cohort exited0 with196tests at bd9d-era source; final store/closure/ACK bytes are identical, later UI helper change has separate17tests/5files exited0. `npx tsc --noEmit` and pre-freeze docs exited0; final original product build exited0. These are not an exact-final full-suite CI claim.

The ordinary WIP `npm test` exited1:1,264passed/2failed tests,135passed/1failed files. Both unchanged exports tests failed child/browser launch EPERM/setsockopt under initial launch permissions. A permission-correct targeted `npx vitest run tests/exports.test.ts -t 'runs the exported HTML|rolls back every exported effect'` exited1 with administrator-blocked `file://` navigation. The19 unselected tests were CLI filtering, not source skips. No browser policy/original test/timeout changed. WIP full run lacks an at-start frozen source manifest and remains diagnostic; no local all-green full-suite claim. P204/#64 CI success is not reassigned to P205; controller must collect unchanged full hosted CI for delivery.

## Original requirement mapping and remaining gates

The [correspondence](requirement-correspondence.json) adds the late selected-corruption and ACK procedures to the explicitly relevant **then / negative_or_edge** guard subsets of original F09(case32),F54(77),N06(89),F35(58),N14(97),E12(115). The archived immutable six-case external map preserves all four original clause texts/procedure paths and distinguishes actual651/current-unchanged procedure hashes from historical registry-declared hashes. These guards do not replace complete media/export/migration/physical-loss/real-Files/flight-mode/old-app workflows or promote entire original cases.

Controller remote observation at 2026-10-17 10:24 UTC is archived with raw refs. Main `b32de9525c4acf5206ac3d6d1d23f5b90967ec95`, tree `83ae5006ead9c7e2a83316b95a0e643a2338167b`, equals repaired PR62 CI tree;62 merged into main09:26:44. PR63 merge `c06ff7becc75f6ed34b097e1ae5134074b1c50ad` at09:26:58 targeted the library-loading feature branch, not main. PR64 merge `559777cf1b5301483f2fbbd17014ffc190f7c2f3` at09:52:41 targeted the save-changeset feature branch, not main. Actual remote history-metadata branch remained exact5b. Actual Git parents/current remote refs are authoritative; normalized get_pr_info reported historical base SHAs are labelled as such in the receipt. No merge/rebase was performed by this agent or controller. P203/P204 have not thereby propagated into main; local P205 remains based on literal5b. Controller verifies actual base again before any Draft PR/push.

Original104requirements/116cases/464clauses/24packages/6groups/68supplements/73locked inputs,94local/22external and **RELEASE BLOCKED** remain unchanged. Native formats/request hashes/canonical snapshots/history/assets/outbox/guards are not relaxed. Original600,000/2,000ms conditions and30/180/7,200 limits remain;1,200,000ms bounds only supplemental orchestration. Formal8metrics×2sizes×30/180save/7,200 and113-history actual72MiB new/clone/cold stay Stage3 after human integration. Real devices, production, live Auth/billing/cloud and external acceptance remain unperformed. Delivery review, original hosted full CI and any publication/merge are controller/human gates.

Packaging/documentation validation commands and logs are in [delivery validation](delivery-validation/commands.json); [source equivalence](delivery-validation/source-equivalence.json) verifies frozen runtime/driver/test bytes. The separate [parent post-seal receipt](delivery-validation/parent-seal-review.json) independently verifies all1,238 members,609 raw files,624 source snapshots,five exact analysis copies and74 raw OFF/ON pairs. It was added after sealing without changing the archive or creating a self-reference. Exact later delivery head/tree are recorded in the controller handoff after commit. No new test/build/benchmark was run to package this delivery.
