# E12 offline cold navigation source correction

The retained PR45, PR46 and PR47 WebKit failures stop at the original offline `Page.reload` protocol call. Their cause remains unknown; later quota, migration and recovery observations were not reached.

This source-only correction retains offline mode and uses a distinct scoped query navigation. It requires a different document nonce, exact cached base/index/assets bytes, the active controller, the genuinely installed waiting worker, and unchanged complete durable native data. Original fixtures, four clauses, limits and external-condition exclusions remain unchanged. The planned proof remains `not_run`; independent three-engine execution is recorded separately.

Retained source diagnosis: `/tmp/pr45-e12-failure-diagnosis`. Original failed CI artifacts are immutable.
