# Retained PR44 CI106 success

GitHub Actions run [38123646997](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/38123646997), workflow `Validate implementation`, job `114423361268` (`verify`) completed successfully. All 21 observed steps succeeded.

The workflow head was `4e39cc1a086296226643e6105ffbfc47d467c50f`. The actual hosted checkout was PR merge ref `6212d8d20ec9cda44cd69e19313663f563b16544`, merging that head into `8285608c75791ed1ea01380751abb3805913b639`. The hosted build log reports version `69f29385ad35e068039a` with base `/shinariokanri/`. `build-info.json` is absent from the browser artifact, so build source tree and dirty state remain unobserved. This hosted binding does not reuse the previous local fix/build binding.

Observed counts from the raw job log and selected artifact JSON:

| Suite | Passed | Scope |
| --- | ---: | --- |
| Python checker unit | 24 tests | Existing CI checker suite |
| Unit | 96 files / 890 tests | Existing CI unit suite |
| General E2E | 342 tests | Chromium, Firefox, WebKit |
| RB06 subset within general E2E | 12 tests | Four original cases per engine; first case 18.0s / 22.5s / 22.0s |
| RB10 large analysis | 1 test | Chromium |
| RB03 | 15 component groups + 3 timeline + 3 world smokes | Nine script processes exit 0; isolated components, native App transactions separate |
| RB04 author | 36 checks | Twelve per engine; in-memory component host, native/App acceptance excluded |
| RB04 writing | 4 Chromium + 4 WebKit tests | Existing writing regression suite |

`jobs-final.json` retains every step conclusion. `job.log` retains the raw UTF-8 job log, including its BOM: 304,341 bytes, SHA256 `ca0252ce3e7a17f50ba834c9395d491843ff4a58d9257cddfc38573b6ccd9381`. `job-readable.log` is the separately retained ANSI-stripped convenience copy.

`browser-evidence.zip` is artifact `11697228692`: 18,232,278 bytes, SHA256 `67fd7589678ce0f1fb8df762985a2b6314605919ad86d272d9ffe4d3f61506a3`. Its digest matches GitHub artifact metadata and the upload log. It contains 674 entries, zero error-context files and zero trace ZIPs. Thirteen selected original RB03/RB04 JSON files are retained separately with their original archive paths and hashes.

The original monitoring directory has been copied without editing any of its 43 files: the 42 files listed in its original `provenance-manifest.json`, plus that manifest itself, total 19,273,997 bytes. Original before/after source hashes and destination hashes all agree. `relocation-manifest.json` records the source and destination roots and exact bindings. Original paths and descriptions in copied evidence remain historical observations; use destination-relative paths for retained files. This README and the relocation manifest are separate additions, preserving the original README and manifest unchanged.

This record proves the observed hosted CI suite success. It does not claim completion of the original PR43 plan or its external acceptance conditions. Original CI105 failures and local failed candidates remain in their existing evidence folders. No existing proof, source, branch, PR metadata or workflow was changed by this retention step.
