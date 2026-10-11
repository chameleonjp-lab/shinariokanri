#!/usr/bin/env bash
# Prepared only. Start this script solely after root grants the browser slot.
set -uo pipefail
source /workspace/shinariokanri/.playwright-browsers/env.sh
cd /workspace/runtime-verification || exit 89
export CI=1 TZ=UTC LANG=C.UTF-8 LC_ALL=C.UTF-8 BROWSER_ENGINES=all
export PLAYWRIGHT_HTML_OPEN=never
export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--require=/tmp/shinariokanri-ap02-b56e8b9-run2/upload-hook.cjs"
export PLAYWRIGHT_JSON_OUTPUT_FILE=/tmp/shinariokanri-ap02-b56e8b9-run2/report.json
export PLAYWRIGHT_HTML_OUTPUT_DIR=/tmp/shinariokanri-ap02-b56e8b9-run2/html
python3 - <<'PY'
import pathlib, socket
out = pathlib.Path('/tmp/shinariokanri-ap02-b56e8b9-run2')
if (out / 'started-at.txt').exists():
    raise SystemExit('This retained run has already started; use a distinct new run directory')
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 4173))
PY
if [ "$?" -ne 0 ]; then exit 88; fi
python3 /tmp/shinariokanri-ap02-b56e8b9-run2/binding.py before || exit 90
date -u +%Y-%m-%dT%H:%M:%SZ > /tmp/shinariokanri-ap02-b56e8b9-run2/started-at.txt
npx --no-install playwright test tests/e2e/link-candidate-ignore.spec.ts tests/e2e/consultation-context.spec.ts tests/e2e/startup-migration-retry.spec.ts --project=chromium --project=firefox --project=webkit --workers=1 --retries=0 --max-failures=0 --trace=on --reporter=list,json,html --output=/tmp/shinariokanri-ap02-b56e8b9-run2/test-results 2>&1 | tee /tmp/shinariokanri-ap02-b56e8b9-run2/runner.log
result=${PIPESTATUS[0]}
date -u +%Y-%m-%dT%H:%M:%SZ > /tmp/shinariokanri-ap02-b56e8b9-run2/finished-at.txt
printf '%s\n' "$result" > /tmp/shinariokanri-ap02-b56e8b9-run2/exit-code.txt
python3 /tmp/shinariokanri-ap02-b56e8b9-run2/binding.py after || exit 91
python3 /tmp/shinariokanri-ap02-b56e8b9-run2/audit-uploads.py || exit 92
exit "$result"
