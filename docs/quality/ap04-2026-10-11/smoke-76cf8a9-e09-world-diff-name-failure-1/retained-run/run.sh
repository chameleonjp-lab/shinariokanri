#!/usr/bin/env bash
# Prepared only: root must release the exclusive browser slot before execution.
# One retained run only. A failed attempt stops this script; no automatic retries.
set -uo pipefail

AP04_RUN_DIR=/tmp/ap04-76cf8a9-smoke-attempt1
AP04_SOURCE_DIR=/workspace/runtime-verification
AP04_ENV_SCRIPT=/workspace/shinariokanri/.playwright-browsers/env.sh

python3 - "$AP04_RUN_DIR/preparation.json" <<'PYREADY' || exit 90
import json,sys
if json.load(open(sys.argv[1]))['status'] != 'prepared_not_started':
    raise SystemExit('Preparation awaits final root READY binding; browser execution refused.')
PYREADY

if [ -e "$AP04_RUN_DIR/invoked-at.txt" ]; then
  printf '%s\n' 'This retained run already started; prepare a distinct run directory.' >&2
  exit 88
fi
finish_run() {
  local result=$?
  trap - EXIT INT TERM
  date -u +%Y-%m-%dT%H:%M:%SZ > "$AP04_RUN_DIR/finished-at.txt"
  # Restore global observation scope before the overall after-binding.
  export AP04_EVIDENCE_DIR='' AP04_SMOKE_SPEC=''
  if [ -e "$AP04_RUN_DIR/binding-before.json" ]; then
    python3 "$AP04_RUN_DIR/binding.py" after "$AP04_RUN_DIR" > "$AP04_RUN_DIR/binding-after.log" 2>&1
    local binding_result=$?
    printf '%s\n' "$binding_result" > "$AP04_RUN_DIR/binding-after-exit-code.txt"
    if [ "$result" -eq 0 ] && [ "$binding_result" -ne 0 ]; then result=91; fi
  fi
  printf '%s\n' "$result" > "$AP04_RUN_DIR/exit-code.txt"
  # This summarizes execution only; every original acceptance result stays not_run.
  python3 "$AP04_RUN_DIR/check-report.py" summary "$AP04_RUN_DIR" "$result" > "$AP04_RUN_DIR/summary.log" 2>&1
  local summary_result=$?
  if [ "$result" -eq 0 ] && [ "$summary_result" -ne 0 ]; then
    result=92
    printf '%s\n' "$result" > "$AP04_RUN_DIR/exit-code.txt"
  fi
  exit "$result"
}
trap finish_run EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

date -u +%Y-%m-%dT%H:%M:%SZ > "$AP04_RUN_DIR/invoked-at.txt"
python3 "$AP04_RUN_DIR/binding.py" preflight "$AP04_RUN_DIR" > "$AP04_RUN_DIR/preflight.log" 2>&1
preflight_result=$?
printf '%s\n' "$preflight_result" > "$AP04_RUN_DIR/preflight-exit-code.txt"
if [ "$preflight_result" -ne 0 ]; then exit 90; fi
source "$AP04_ENV_SCRIPT" || exit 89
cd "$AP04_SOURCE_DIR" || exit 89
export CI=1 TZ=UTC LANG=C.UTF-8 LC_ALL=C.UTF-8 BROWSER_ENGINES=chromium
export PLAYWRIGHT_HTML_OPEN=never
export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--require=$AP04_RUN_DIR/artifact-hook.cjs"
export AP04_EVIDENCE_DIR='' AP04_SMOKE_SPEC=''
python3 - <<'PY' > "$AP04_RUN_DIR/port-check.log" 2>&1
import socket
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 4173))
PY
port_result=$?
printf '%s\n' "$port_result" > "$AP04_RUN_DIR/port-check-exit-code.txt"
if [ "$port_result" -ne 0 ]; then exit 88; fi
date -u +%Y-%m-%dT%H:%M:%SZ > "$AP04_RUN_DIR/started-at.txt"
python3 "$AP04_RUN_DIR/binding.py" before "$AP04_RUN_DIR" > "$AP04_RUN_DIR/binding-before.log" 2>&1 || exit 90

run_attempt() {
  local stage=$1 spec=$2 pattern=$3 count=$4
  local attempt_dir="$AP04_RUN_DIR/$stage"
  mkdir "$attempt_dir" || exit 88
  export PLAYWRIGHT_JSON_OUTPUT_FILE="$attempt_dir/report.json"
  export PLAYWRIGHT_HTML_OUTPUT_DIR="$attempt_dir/html"
  export AP04_EVIDENCE_DIR="$attempt_dir/actual-artifacts" AP04_SMOKE_SPEC="$spec"
  python3 "$AP04_RUN_DIR/binding.py" before "$attempt_dir" > "$attempt_dir/binding-before.log" 2>&1 || exit 90
  local command=(npx --no-install playwright test "tests/e2e/$spec" --project=chromium --workers=1 --retries=0 --max-failures=1 --trace=on --reporter=list,json,html --grep "$pattern" --output "$attempt_dir/test-results")
  printf '%q ' "${command[@]}" > "$attempt_dir/command.sh"
  printf '\n' >> "$attempt_dir/command.sh"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$attempt_dir/started-at.txt"
  "${command[@]}" 2>&1 | tee "$attempt_dir/runner.log"
  local pipeline_results=("${PIPESTATUS[@]}")
  local command_result=${pipeline_results[0]} tee_result=${pipeline_results[1]}
  date -u +%Y-%m-%dT%H:%M:%SZ > "$attempt_dir/finished-at.txt"
  printf '%s\n' "$command_result" > "$attempt_dir/playwright-exit-code.txt"
  printf '%s\n' "$tee_result" > "$attempt_dir/tee-exit-code.txt"
  python3 "$AP04_RUN_DIR/binding.py" after "$attempt_dir" > "$attempt_dir/binding-after.log" 2>&1
  local binding_result=$?
  printf '%s\n' "$binding_result" > "$attempt_dir/binding-after-exit-code.txt"
  python3 "$AP04_RUN_DIR/audit-artifacts.py" "$attempt_dir" > "$attempt_dir/artifact-audit.log" 2>&1
  local artifact_result=$?
  printf '%s\n' "$artifact_result" > "$attempt_dir/artifact-audit-exit-code.txt"
  python3 "$AP04_RUN_DIR/check-report.py" attempt "$attempt_dir" "$stage" "$spec" "$pattern" "$count" "$command_result" "$tee_result" "$binding_result" "$artifact_result" > "$attempt_dir/assessment.log" 2>&1
  local assessment_result=$?
  printf '%s\n' "$assessment_result" > "$attempt_dir/assessment-exit-code.txt"
  # Preserve Playwright's actual nonzero before considering harness/binding failures.
  if [ "$command_result" -ne 0 ]; then exit "$command_result"; fi
  if [ "$tee_result" -ne 0 ]; then exit 74; fi
  if [ "$binding_result" -ne 0 ]; then exit 91; fi
  if [ "$artifact_result" -ne 0 ]; then exit 93; fi
  if [ "$assessment_result" -ne 0 ]; then exit 87; fi
}

# Each grep belongs solely to its file. No timeout/global-timeout overrides.
run_attempt 01-condition ap04-original-n-condition-parity.spec.ts 'AT-N16 ' 1
run_attempt 02-hierarchy ap04-original-f-hierarchy.spec.ts 'AT-F13 ' 1
run_attempt 03-production ap04-original-f-production.spec.ts 'AT-F5[12] ' 2
run_attempt 04-world-production ap04-original-e09-world-production.spec.ts 'AT-E09 ' 1
run_attempt 05-runtime-origin ap04-original-n-f16-20.spec.ts 'AT-F16 ' 1
run_attempt 06-trigger-resend ap04-original-n-f14-trigger.spec.ts 'AT-F14 ' 1
run_attempt 07-public-index ap04-original-f-index.spec.ts 'AT-F57 ' 1
run_attempt 08-local-archive-resume ap04-original-f-resume-recovery.spec.ts 'AT-F33 ' 1
run_attempt 09-runtime-targets ap04-original-n20-targets.spec.ts 'AT-N20 ' 2
run_attempt 10-complete-recovery ap04-original-root-restoration-output.spec.ts 'AT-E07 ' 1
