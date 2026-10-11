# PR44 CI failure retention and restoration synchronization

PR #44 at `89130e555f07fb29397c0fe4abe41ac9b03ea61d` failed [Actions run 38119288143](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/38119288143), job `114410492503`: **340 passed, 2 failed** among 342 browser cases. The original failure remains recorded in `ci-run-38119288143-failure/run.log` and the unchanged 18,909,032-byte `browser-tests.zip` artifact, including both failure traces and error contexts. `rb06-diagnosis.json` records their hashes and initial extraction paths; those `/tmp` paths are historical locations, and the original traces remain inside the retained ZIP.

Both failures were the first RB06 recovery case in Firefox and WebKit. `seed()` started its 5,000 ms sidebar assertion immediately after the restore click returned. The UI event handler starts an asynchronous import, so the click does not wait for atomic restoration. At failure Firefox still displayed restoration validation, while WebKit displayed atomic saving. Neither failure context displayed a product alert; neither retained trace recorded a page or console error. The traces stop while restoration is in progress and therefore do not prove successful completion.

The fix waits for the normal import dialog to close before keeping the original sidebar assertion. App closes this dialog only after `importScenario()` has committed and the imported project is opened. No wait timeout override is added: Playwright config does not override its 30,000 ms test budget or 0 action timeout, so the wait is interrupted by the existing test deadline. The 5,000 ms sidebar assertion, 74-history fixture, recovery assertions, retry policy, and performance thresholds are unchanged. Product source and Playwright config are unchanged.

The first clean fix commit `4810f0f55dacd1ae9fc252f114854b0c53ab8033` built successfully (`ac70e61536847e511bdc`) and ran all four RB06 cases in all three engines: **9 passed, 3 failed**, with no skipped/flaky cases. The seed restoration boundary passed in all engines; the first full case then exceeded the original 30,000 ms budget later in the workflow. `rb06-4810f0f-run1/` preserves the raw runner/JSON/HTML reports, three failure traces, stage durations, build information and clean before/after source/build hashes. These failures remain explicit.

Trace timing identified about 5.7 seconds spent fully inspecting the static 74-history fixture in Node before any UI action. The second fix moves only this unchanged file read and full inspection to `test.beforeAll`, which retains Playwright's existing 30,000 ms hook budget. Normal UI import, quota failure/retry, navigation, cold reload, both actual complete-file downloads, both downloaded-file inspections, and every original assertion remain within the unchanged 30,000 ms test budget. No product source or validation is changed. This is fixture preparation before the UI acceptance sequence, and does not exempt any UI/recovery operation from its deadline.

The second clean fixed commit `15305fc455ce5464a5e31e1295a7695e7dc5e208` built successfully with tree `8ed5bbd6f331506b7e237d31f8b503f52d93136c`, `dirty=false`, base `/shinariokanri/` and build version `0b69d9c9b572f4258d7f`. All four original RB06 cases passed in Chromium, Firefox and WebKit: **12 passed, 0 failed/skipped/flaky**, exit 0. The first case took 16.5 s, 23.9 s and 22.3 s respectively, inside the original 30 s test deadline. `rb06-15305fc-run2/` preserves raw JSON/HTML/runner output, exact command/environment, build metadata and before/after bindings for 381 source inputs and the complete dist. Source input hash `83b8659b3c305857c72f8bcd169361898d7f5afb01a069cfb4307c0de5396f3b` and dist hash `d4b81767ac0cdd2e43a971282b30df2209f36c0ed03a0b8ae36f763b159b867d` were unchanged across this clean build/test run.

This evidence update refers to the prior tested fix commit above; it does not relabel an evidence-only commit as the tested source. Trace retention remains `retain-on-failure`, so the successful run has no failure traces. The original CI and first local failure traces remain retained. The result is the targeted 12-case RB06 verification; full CI and original AP/AT acceptance are not inferred.

Targeted command (source the pinned browser environment first; do not override test timeouts):

```sh
source /workspace/shinariokanri/.playwright-browsers/env.sh
BROWSER_ENGINES=all CI=1 npm run test:e2e -- tests/e2e/rb06-recovery.spec.ts --workers=1
```

`retention-manifest.json` binds every retained evidence file by byte length and SHA-256, together with the fixed spec and unchanged config/fixture hashes. The failed source is identified by its exact Git commit.
