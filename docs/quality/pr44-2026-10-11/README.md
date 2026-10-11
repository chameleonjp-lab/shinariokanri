# PR44 CI failure retention and restoration synchronization

PR #44 at `89130e555f07fb29397c0fe4abe41ac9b03ea61d` failed [Actions run 38119288143](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/38119288143), job `114410492503`: **340 passed, 2 failed** among 342 browser cases. The original failure remains recorded in `ci-run-38119288143-failure/run.log` and the unchanged 18,909,032-byte `browser-tests.zip` artifact, including both failure traces and error contexts. `rb06-diagnosis.json` records their hashes and initial extraction paths; those `/tmp` paths are historical locations, and the original traces remain inside the retained ZIP.

Both failures were the first RB06 recovery case in Firefox and WebKit. `seed()` started its 5,000 ms sidebar assertion immediately after the restore click returned. The UI event handler starts an asynchronous import, so the click does not wait for atomic restoration. At failure Firefox still displayed restoration validation, while WebKit displayed atomic saving. Neither failure context displayed a product alert; neither retained trace recorded a page or console error. The traces stop while restoration is in progress and therefore do not prove successful completion.

The fix waits for the normal import dialog to close before keeping the original sidebar assertion. App closes this dialog only after `importScenario()` has committed and the imported project is opened. No wait timeout override is added: Playwright config does not override its 30,000 ms test budget or 0 action timeout, so the wait is interrupted by the existing test deadline. The 5,000 ms sidebar assertion, 74-history fixture, recovery assertions, retry policy, and performance thresholds are unchanged. Product source and Playwright config are unchanged.

At this retention commit the fixed browser spec has **not been rerun**. Build and all four RB06 cases in all three engines will be run from a clean fixed commit after exclusive execution is available, with raw JSON/HTML/trace output and before/after source/build bindings retained separately. This failure record does not promote original acceptance or claim CI success.

Targeted command (source the pinned browser environment first; do not override test timeouts):

```sh
source /workspace/shinariokanri/.playwright-browsers/env.sh
BROWSER_ENGINES=all CI=1 npm run test:e2e -- tests/e2e/rb06-recovery.spec.ts --workers=1
```

`retention-manifest.json` binds every retained evidence file by byte length and SHA-256, together with the fixed spec and unchanged config/fixture hashes. The failed source is identified by its exact Git commit.
