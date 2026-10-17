# P2-01: library summaries and selected editing

## Decision before implementation

Choose registered D01 B: an additive internal version 8 derived summary table,
maintained in the existing writeContent transaction. D01 A headers contain ordered
IDs and author alternatives: canonical Standard header 343638 bytes versus full
project 6258972 bytes; Large header 3432555 versus 59407368 bytes. Material bytes
remain 75497472. Headers cannot infer active counts from ID counts. Neither
fixture contents nor portable/native/runtime formats change.

The derived row stores identity, name, revision and exact active entity count,
with a versioned digest. It contains no author alternatives, entity IDs or body.
A native header fingerprint checks freshness on the same transaction snapshot
without decoding packed headers. Raw native reads are explicitly instrumented.
Inline headers still incur their header bytes (bounded by native packing policy);
packed headers incur envelope metadata, not part bodies. This cost is reported
separately from summary bytes and one-time full current backfill.
Missing/invalid/stale summaries are rebuilt independently using the full existing
current validation. Canonical rows remain untouched by backfill; failures become
individual error states. Cancellation and final-stage/quota failures leave the
canonical database intact. Publication rechecks revision transactionally.

## Interfaces and ownership

- listProjectSummaries({signal?, onProgress?}) returns ProjectSummary[]. Each row
  distinguishes unloaded current content from error, retains name/order/revision,
  exact active count or an explicit unavailable count, and pending/recovered
  queue counts. Asset detail is explicitly unloaded. A summary is never proof
  that full content is valid.
- loadEditor(id, {signal?, expectedRevision?, immutableView?, onStage?}) returns
  validated current ProjectData or undefined only for missing data. Inaccessible
  or revoked authorization rejects with CANCELLED; corrupt content rejects with
  its original validation/storage error.
  Captured options, authorization generation, cache lifetime and durable revision
  fence validation/publication. A concurrent save produces a revision conflict.
- The existing listProjectsForEditing/getProjectForEditing APIs remain available.
- App owns summary rows separately from the currently loaded editor. Requests
  own an AbortController and selection generation; late results cannot replace a
  newer selection/save. Account remount cancels them. Existing persisted entity,
  JSON, settings and author-alternative drafts retain their separate ownership.
- Restore targets and world-source choices use all summaries. Only a selected
  restore target/world source hydrates. Selected project world dependencies are
  loaded by pinned snapshot closure, including snapshot/alternative content;
  unknown dependency shapes use the existing safe validation fallback.

## Focused RED/GREEN and subsequent gates

Write focused tests before product changes: independent 1/10/50 expectations and
zero nonselected body reads; deleted counts and pending/recovered state; missing,
stale and corrupt summaries; valid plus unselected corrupt project; cancellation,
option capture, concurrent save and authorization revocation; atomic failure and
legacy upgrade. Add browser library/select/save/restore/world-source proof while
retaining the existing migration retry, world adoption and backup cases.

Controller schedules full unit/build/three-engine/downstream gates and identical
baseline/candidate OFF timing versus ON resource measurement. Focused results do
not substitute for these gates. Retain raw failures and UNKNOWN separately.
Original acceptance stays 94 local / 22 external / RELEASE BLOCKED.

Rollback restores old list/UI behavior while retaining additive v8 schema support;
never delete or downgrade the database. External format versions are unchanged.
