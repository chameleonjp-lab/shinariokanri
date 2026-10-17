# P2-01: library summaries and selected editing

## Decision before implementation

Choose registered D01 B: an additive internal version 8 derived summary table,
maintained in the existing writeContent transaction. D01 A headers contain ordered
IDs and author alternatives: canonical Standard header 343638 bytes versus full
project 6258972 bytes; Large header 3432555 versus 59407368 bytes. Material bytes
remain 75497472. Headers cannot infer active counts from ID counts. Neither
fixture contents nor portable/native/runtime formats change.

The derived row stores identity, name, revision and exact active entity count,
with a versioned digest and bounded alternative head identities/hashes (at most100). It contains no alternative content/version arrays, entity IDs or body.
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

## Review counterexamples and catalog extension

Independent review requires preserving registry-only world sources even when the
selected work has no world references. Version 8 therefore also adds a derived
worldSources table: immutable registry key, source project ID, name, revision and
versioned digest, maintained in each existing guarded atomic world writer.
Catalog reads compare canonical key presence and the derivation digest; existing
writers prohibit replacing a key with unequal world content. Missing/corrupt
catalog entries are independently backfilled and do not modify canonical rows.
Selected source hydration verifies the full stored source and snapshot hashes.
A catalog entry is never full-content verification. Unselected native corruption
remains unloaded until selection; same-key native corruption must reject there.

Unknown asset acknowledgement status cannot establish fully synced. Summaries
report unloaded sync state unless a conflict or pending queue establishes a
stronger state; exact pending/recovered counts remain available.

For retained alternative drafts, a bounded list (domain maximum 100 branches) of
id/name/headVersionId/sealed contentHash accompanies each project summary.
Neither version arrays nor content are retained. A focused status hook compares
retained draft content and structurePlan using the existing sealed hash contract,
with immediate checks for head/name/JSON/invalid/new-entity differences. Missing
hash or unavailable summary is unknown, never clean. Async completion is fenced
by the exact input identity and summary-head signature; unrelated summary refresh
or project selection cannot initiate repeated full-draft hashing. The existing
canonical comparison remains the independent test oracle.

## Source-bound editor publication and retained editions

Selected editor reads capture a native-header fingerprint on the same transaction
snapshot as the decoded header and current rows. Cached canonical graphs carry
only their own verified fingerprint in a WeakMap; a missing/mismatched fingerprint
requires a full read. A newly observed header is never stamped onto an older cache
hit accepted only by revision/history IDs. The returned view's weak proof carries
identity, revision, access generation and lifetime. Final editor and world-result
publication compares the native fingerprint; callers without that proof retain
the original decoded revision fallback. Packed header parts therefore decode once,
while native envelope reads remain explicitly counted. Same-revision header
changes and concurrent saves still reject. Full selected validation remains the
only authority for body integrity.

With zero canonical registry rows, an observed count query can return the only
possible world registry, empty, without scanning the project graph. Existing full
validation still rejects unresolved foreign references. Nonempty registry handling
and historical-key fallback retain their existing behavior. There is no closure
cache: mutable returned roots cannot reuse graph results merely by id/revision.

Selected editable world sources merge their current image with all retained fixed
editions of that source, including editions present only in the registry. This
retains the existing merge order and full selected validation. Pin-save publication
captures the active owner/generation after save confirmation and rechecks after the
world read; a late A save cannot replace B's registry, while A→B→A before save
confirmation can still publish A's new closure. Source-picker callbacks also check
the rendered project/revision and selection generation before publication.

Catalog failures retain identified source ownership from a recognizable canonical
row projectId separately from unknown ownership. Selected-source loading rejects
errors belonging to that source and errors with unknown ownership, but an explicitly
unrelated corrupt source does not turn absent retained editions into a failure.
Per-entry errors remain separate from grouped valid entries so a valid edition
cannot conceal a corrupt edition of the same source. This classification is for
error routing only; it never verifies or repairs malformed canonical content.
