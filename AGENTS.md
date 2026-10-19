# Repository instructions — shinariokanri

These instructions are additive. The project's requirements, acceptance criteria, authoritative evidence, and review/release procedures remain defined by `docs/spec/REQUIREMENTS.md`, `docs/plan/`, `docs/quality/`, and `.github/workflows/`. Do not substitute a local helper's result for any formal evidence.

## Optional local output reduction

- When a shell is available, read `.agents/skills/rtk-safe-execution/SKILL.md` before using RTK Safe Execution. Its use is **opt-in** and limited initially to long, non-sensitive *local* unit-test output or safe tracked-filename lists.
- For unit tests use the existing, unmodified `npm test -- --maxWorkers=1 --fileParallelism=false` command through the skill wrapper. For a safe list use `git ls-files src tests scripts`. Do not introduce additional tests, skip tests, shorten the existing test inventory, or run the same test twice just for output reduction.
- The underlying command runs once. Preserve its true exit code and complete unfiltered `raw.log` outside the Git checkout. The bounded raw footer and RTK summary are only quick previews; inspect the original log on any failure, ambiguity, or missing detail.
- RTK may be absent; report its absence and do not install it, enable global rewrite hooks, or change Codex Cloud/Work environments without a separate instruction. The skill's self-tests use a mock RTK; do not claim measured real-world savings.
- Do not use this skill to compress official CI/release evidence, multi-engine Playwright acceptance, long-running 7,200-second / full-history recovery trials, performance measurements, security/privacy audits, authentication or Supabase-related output, original provenance records, or personally identifying conversation data.
- Never commit/upload the raw log or attach it to a public PR/Actions artifact without an explicit security and retention review. The runner's secret check is only heuristic and is not a security guarantee.
- Leave existing `.github/workflows/ci.yml`, all quality gates, production files, and evidence retention unchanged. Use a separate Draft PR for changes and do not merge or deploy automatically.
- Pilot instructions: `docs/quality/rtk-safe-execution/README.md`.
