#!/usr/bin/env bash
set -uo pipefail
source /workspace/shinariokanri/.playwright-browsers/env.sh
cd /workspace/runtime-verification
python3 /tmp/shinariokanri-ap02-3bea751-run1/binding.py before || exit 90
export BROWSER_ENGINES=all
export PLAYWRIGHT_JSON_OUTPUT_FILE=/tmp/shinariokanri-ap02-3bea751-run1/report.json
export PLAYWRIGHT_HTML_OUTPUT_DIR=/tmp/shinariokanri-ap02-3bea751-run1/html
npx playwright test tests/e2e/link-candidate-ignore.spec.ts tests/e2e/consultation-context.spec.ts tests/e2e/startup-migration-retry.spec.ts --reporter=list,json,html --output=/tmp/shinariokanri-ap02-3bea751-run1/test-results 2>&1 | tee /tmp/shinariokanri-ap02-3bea751-run1/runner.log
result=${PIPESTATUS[0]}
python3 /tmp/shinariokanri-ap02-3bea751-run1/binding.py after || exit 91
printf '%s\n' "$result" > /tmp/shinariokanri-ap02-3bea751-run1/exit-code.txt
exit "$result"
