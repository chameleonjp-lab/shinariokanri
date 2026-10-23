# GitHub Pages Automatic Deployment Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan. Steps use checkboxes for tracking.

**Goal:** Publish shinariokanri and automatically update its GitHub Pages site whenever a PR is merged into main.

**Architecture:** Add a dedicated GitHub Actions workflow triggered by every push to main, with manual retry support. Build the existing static app and deploy only dist through GitHub's Pages actions. Keep the verified-release workflow and its formal acceptance evidence separate.

**Tech Stack:** GitHub Actions, GitHub Pages, Node.js 24, npm, Vite.

**Spec:** The user's 2026-10-23 publication and automatic-update request; docs/implementation/RELEASE.md for the existing base path and release distinction.

## Global Constraints

- Site URL: https://chameleonjp-lab.github.io/shinariokanri/.
- APP_BASE: /shinariokanri/.
- Publish only the generated dist directory; never repository documents, environment files, or author data.
- Preserve ci.yml, release.yml, formal quality gates, and evidence retention.
- The public main build remains under development; publication does not establish formal acceptance.
- The user explicitly authorizes initial publication and subsequent automated deployments.

## Review Focus

- Non-main branches and unmerged PRs must not deploy.
- Concurrent updates must not interrupt an active deployment; old runs must never overwrite newer main versions, including deployment-only retries.
- A failed build must not replace the currently published site.
- HTML, assets, service worker, and build metadata must use /shinariokanri/.
- Pages must receive generated application assets only.

### Task 1: Configure automatic main deployments

**Files:** Create .github/workflows/pages.yml; update README.md and docs/implementation/RELEASE.md.

**Interfaces:** Consumes npm ci, npm run build, and dist. Produces a GitHub Pages deployment for the triggering main commit.

- [ ] Add push-to-main and workflow_dispatch triggers without path filters, a main-only job guard, read-only build permissions, and Pages/OIDC permissions limited to deployment.
- [ ] Use the existing pages concurrency group with cancel-in-progress false, Node.js 24, the explicit app base, and standard configure/upload/deploy Pages actions.
- [ ] Immediately before deployment, compare GITHUB_SHA to the current main ref and reject a stale run, including deployment-only retries.
- [ ] Document the publication URL, automatic updates, development status, and the existing service-worker update behavior.
- [ ] Validate the workflow with actionlint, build locally, and inspect the generated paths and metadata. Configuration-only change: use existing checks instead of adding implementation-mirroring tests.
- [ ] Review the complete diff, preserving the original CI and verified-release workflows.

### Task 2: Publish and verify

**Files:** No additional product changes.

**Interfaces:** Consumes the reviewed configuration commit. Produces the public site and deployment evidence for main.

- [ ] Integrate the reviewed configuration into main within the user's publication authorization.
- [ ] Observe the automatic Pages run and confirm both build and deployment succeed.
- [ ] Fetch the public HTML, assets, service worker, and build-info.json; match the published commit to main.
- [ ] Open the public app in a browser and verify initial rendering and reload.
- [ ] Report the public URL and automatic update behavior; keep formal acceptance status accurate.
