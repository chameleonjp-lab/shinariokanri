# P2-02: scope-specific reference preparation

Product implementation/initial new tests/measurement driver: commit `3824501`. The evidence commit additionally strengthens the new duplicate-ID ordering assertion; measured product/fixture/driver bytes remain unchanged.
Frozen baseline: main `03aa371042ea7f3ddf6d05afc8200194b67e51f0`, `src/domain/referenceChoices.ts`; only import paths and provenance header adapted. `source-identity.log` binds all new source files to the product commit. The comparison additionally records SHA-256 values of implementation, baseline, unchanged fixture source, and both driver files.

## Behavior and choice

D08 A is adopted: prepare active entities only for scopes which consume them, prepare entity choices only for entity/record/presentation/projection_record, and prepare the ID→name Map only for relation/record/projection_record. Calendar/project/identity visit no entity rows. Snapshot still reads current authored snapshot entities and ignores the requested pin. Existing recursive rich-text walk, deduplication, first ID position/last label, archive filtering, source-pin resolution, and current editable public-policy handling retain their original rules. There is no persistent product candidate cache.

The test-only D08 B alternative retains the eleven default-scope arrays in one owner. Its warmed lookup timing excludes cold construction and returns shared arrays. It does not implement product mutable-input/pin/schema/account/role/visibility invalidation or fresh-result ownership. An explicit rename counterexample records its stale result. It is rejected for product adoption; warm times are a lower-bound experiment rather than a directly deployable substitute.

## Verification ledger

| Command | Exit | Evidence |
| --- | ---: | --- |
| `npm test -- src/domain/referenceChoicesLazy.test.ts` before implementation | 1 | `red.log`: six expected unnecessary-preparation failures, thirteen existing-behavior checks pass |
| `npm test -- src/domain/referenceChoices.test.ts src/domain/referenceChoicesLazy.test.ts tests/optimization/probe.test.ts` after implementation | 0 | `green.log`: 34 pass |
| Same focused command after additional literal work-counter/all-kind/mutable-policy checks | 0 | `green-final.log`: 37 pass, three files |
| `node_modules/.bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --jsx react-jsx --skipLibCheck --lib ES2022,DOM,DOM.Iterable --types vite/client,node scripts/optimization/referenceChoicesMeasurement.ts src/domain/referenceChoicesLazy.test.ts` | 1 | `typecheck-first-failure.log`: TypeScript 7 requires `--ignoreConfig` with explicit source filenames |
| Same targeted typecheck, adding `--ignoreConfig --strict` | 0 | `typecheck.log` |
| `node scripts/optimization/measure-reference-choices.mjs` first attempt | 1 | `comparison-first-failure.log`: forbidden Vite WebSocket and metadata `spawnSync git` EPERM; no comparison result was persisted |
| `P2_REFERENCE_COMMIT="$(git rev-parse HEAD)" P2_REFERENCE_DIRTY=true node scripts/optimization/measure-reference-choices.mjs` final attempt | 0 | `comparison.json` preserves every sample and separate ON diagnostics |
| `git diff --check`; frozen baseline equality after import/header adaptation; committed/current byte identity | 0 | source identity verified before product commit; repeated on final evidence |

The failed first harness's source is retained in `comparison-first-driver.ts.txt` and `comparison-first-entry.mjs.txt`. Final harness disables both WebSocket and HMR. The shell supplies public Git metadata before Node starts; Node performs no subprocess metadata collection. The dirty flag is true because evidence/documents remain untracked during the measurement. No permission escalation was requested.

The new tests cover every valid scope, every real entity kind and singleton kind filter, undefined/empty/mixed filters, archived flags, absent/current/captured/missing pins, equal names with different IDs, unnamed fallback, actual resource IDs, all supported block types and 40-character truncation, aliases, triggers, current/captured public texts, archived current policies, snapshot pin changes, mutable names/archive flags, deduplication and output order. Literal expectations are independent of the frozen baseline. Probe-enabled and disabled behavior are both checked for scopes which must avoid entity preparation; a throwing source-array Proxy detects real row reads rather than relying only on a counter.

Full unit/build/browser/regression groups are delegated to the controller, as required by this task. These focused results do not claim those suites passed.

## Measurement interpretation

The unchanged generators produce Standard (`standard-r06-v1`) and material Large (`large-material-rb10-v1`, including three actual 24 MiB assets). Fixture generation, assets, encoding, equality checks, retained-size inspection, and probe collection are outside timed intervals. Each scope has 30 raw per-call milliseconds for current, lazy, and retained warm variants. Variant order rotates. All 30 outputs are checked for exact ID/label/order equality. Diagnostics with the probe ON are separate from timing with the probe OFF.

**Metric definition changed:** original `reference.choices.rows` counted `source.entities.length` once, regardless of actual scope work. New `reference.choices.rows` counts actual entity-row visits across preparation passes (source filter, active filter/map, names Map, rich-text root walk, snapshot filter/map, trigger pass and current policy pass when applicable). It excludes relation/calendar/snapshot-array passes and nested rich-text object visits. The legacy baseline counter and new counter are explicitly **not directly comparable**. `sourceVisits` applies the identical Proxy observation to both functions and reports directly comparable source entity/relation array element reads. It does not observe subsequent passes over intermediate active arrays.

Persistent candidate retention for current/lazy is zero; outputs and source data are still required by their callers. The retained alternative reports exact canonical bytes of all eleven candidate arrays plus choice-object/key counts, excluding runtime strings/Map/array overhead. This is not heap, peak-memory, or GC evidence. Cold cache construction work is reported separately with the probe ON. Fixture rows include canonical project bytes and exact canonical `StoredProject`-style header bytes (without source entity/relation/snapshot/history/view arrays; with their ordered IDs); these were computed outside timing for D01 planning.

Supplemental Node domain measurements are not formal Standard/Large UI/save/search metrics, and do not replace the original 30 iterations, 180 saves, 600000ms/2000ms limits, 7200-second run, physical-device work, or any original acceptance gate. Original 94 local/22 external-waiting and RELEASE BLOCKED remain unchanged.


## Observed results (supplemental Node measurements)

Each cell is median / p95 milliseconds, probe OFF, 30 raw samples retained.

| Size/scope | Current | Lazy | Source entity reads current → lazy |
| --- | ---: | ---: | ---: |
| Standard project | 1.211 / 1.378 | 0.0023 / 0.0030 | 6,800 → 0 |
| Standard calendar | 1.213 / 1.333 | 0.0022 / 0.0329 | 6,800 → 0 |
| Standard identity | 1.208 / 1.414 | 0.0017 / 0.0032 | 6,800 → 0 |
| Large project | 39.395 / 62.608 | 0.0121 / 0.0700 | 68,003 → 0 |
| Large calendar | 36.067 / 43.171 | 0.0110 / 0.0125 | 68,003 → 0 |
| Large identity | 37.145 / 51.778 | 0.0105 / 0.0133 | 68,003 → 0 |
| Large entity | 57.089 / 72.730 | 37.563 / 43.759 | 68,003 → 68,003 |
| Large relation | 43.697 / 60.027 | 32.386 / 46.780 | 68,003 → 68,003 |
| Large record | 67.067 / 89.017 | 70.991 / 85.523 | 68,003 → 68,003 |
| Large projection_record | 164.747 / 225.837 | 165.019 / 194.951 | 68,003 → 68,003 |
| Large block | 123.937 / 147.762 | 90.782 / 102.235 | 68,003 → 68,003 |
| Large alias | 105.098 / 117.368 | 67.682 / 79.588 | 68,003 → 68,003 |

All 22 size/scope cases match the baseline for every measured result. Improvement is not universal: Large record median is 5.9% slower, projection_record median is essentially flat (+0.2%), and Standard block/alias p95 are slower even though their medians improve. D08 A is adopted for verified removal of unnecessary preparation, without claiming a universal timing improvement. No extra repeats were used to remove unfavorable samples.

The retained alternative stores 55,203 choice objects / 6,831,738 canonical bytes for Standard and 552,015 / 68,927,510 for Large, across eleven keys. Both sizes demonstrate stale choices after an in-place rename. Its warm timings are recorded in JSON and do not include required copying or product invalidation/ownership costs.

For D01: canonical StoredProject-style header bytes are 343,638 Standard and 3,432,555 Large; canonical project bytes are 6,258,972 and 59,407,368. Large includes 75,497,472 actual asset bytes separately. Header ID arrays still carry ordered IDs for every record; their lengths cannot infer active-only entity/relation counts in the presence of archived rows.

## Rollback

Revert the evidence commit first, then product commit `3824501`, so the later strengthening of the new test does not cause a modify/delete conflict. There is no DB migration, persisted format change, or data rollback. The frozen baseline provides the exact original function for review and comparison; product code never imports it.
