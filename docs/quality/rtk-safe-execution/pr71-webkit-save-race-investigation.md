# PR #71 WebKit RG-R05: cause and correction (2026-10-19)

## Evidence
- Failed GitHub Actions: https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39153571369
- Preserved original WebKit artifact: https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39153571369/artifacts/12147557244
- Test: `tests/e2e/editor-regressions.spec.ts`, RG-R05 integer, second save-state assertion (line 95 before this change).
- 248 of 249 WebKit tests passed. After a successful first save, Playwright reloaded the page. The trace shows the first committed entity at revision **1** with `端末内保存済み`, but the reopened editor was dirty at revision **0**. Editing the emptied integer back to 3 then reported `この情報が別の操作で更新されました` and was not saved.

## Root cause
`src/App.tsx` prefers recovered `drafts[projectId:entityId]` over the committed entity. `src/ui/workspaceDrafts.ts` persists draft cleanup in a separate asynchronous IndexedDB transaction after the entity save succeeds. Reloading before cleanup finishes can restore a stale revision-0 copy despite a committed revision-1 record. The editor then retries saving revision 0 and correctly refuses a stale write. This is an application state-recovery race, not a defect in RTK command compression.

## Repair
- Compare only duplicate workspace drafts against the committed entity using **all authored fields**; only `revision` and `updatedAt` may differ, and the draft must not have a newer revision.
- Hide matching duplicates immediately when choosing what to display, then remove them from the in-memory draft map for later persistence.
- Never discard a different unsaved draft, a newer revision, or malformed state merely because its version is old. Preserve existing conflict rejection and manually recoverable input.
- Keep IndexedDB project rows, command history, acceptance tests, timeouts and CI evidence untouched.

## Regression tests
- New unit tests verify duplicate cleanup, preservation of different/newer inputs, and non-mutation of unrelated projects.
- New RG-R05 Playwright test deliberately writes the stale revision-0 copy into the workspace-inputs store **after** revision 1 is committed, reloads immediately, and checks that the correct saved version is selected, the integer field can be corrected, and the value survives another reload.
- Do not claim all-browser resolution until the complete GitHub Actions matrix succeeds. Failed historical runs and evidence remain unchanged.
