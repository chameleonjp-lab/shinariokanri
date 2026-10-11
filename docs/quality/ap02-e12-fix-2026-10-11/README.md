# E12 official WebKit offline engine correction

The retained PR45, PR46 and PR47 WebKit failures stop at the original offline `Page.reload` call. A standalone Playwright 1.63 literal service-worker response reproduces the failure without application or cache dependencies. Official Playwright 1.64 includes upstream fix microsoft/playwright#42894 for #42775. Actual old/new controls and E12 verification are retained separately.

The source retains the original offline `Page.reload`. It additionally requires a different document nonce, exact cached base/index/assets bytes, the active controller, the genuinely installed waiting worker, and unchanged complete durable native data. Original fixtures, four clauses, limits and external-condition exclusions remain unchanged. The planned proof remains `not_run`.

The failed fresh-query candidate and its 2 PASS / 1 WebKit FAIL are immutable at `/tmp/ap02-e12-fix-1af9000/attempt1`. No failure result is promoted.

Official 1.64 passed the offline cold assertions, then exposed an unnecessary project-only command from a manual save after the initial auto-save had already completed. The editor now treats a clean manual save as a no-op, after preserving the separate template confirmation path. E12 retains its exact two-command history expectation. A separate normal UI regression checks all eleven durable tables, history/outbox counts, and the next real edit. These observations remain planned until independently executed.
