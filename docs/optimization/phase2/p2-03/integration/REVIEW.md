# Controller verification of the selected save design

The selected source is `399795e0d718b7f85977a7e37448d61726140f9a`, tree
`227e3625621bebf3f3f3ab55ed279345b5229cf5`. Independent final specification
and quality reviews both approve retaining the exact P2-01 production source.
The rejected prototype remains pinned at `be63656` and is preserved as actual
source, strict optimizer assertions, raw captures and build bytes. No optimizer
budget was raised to make the retained baseline pass.

The controller independently verified all47 sealed artifacts, all9 experimental
source members against their Git commit, all four capture source/tree manifests,
all tracked and explicitly overlaid measurement source hashes, paired fixtures,
ZIP CRCs and every measurement build member. `store.ts` and `probe.ts` match
`d3bf88c` byte for byte; there are no other production-source changes. Generated
portable code was independently regenerated at the prototype and selected heads;
both match the measured hashes exactly.

A separate clean detached checkout of the selected head passed the unchanged
`npm run build` with exit0. The actual product build archive, its member hashes,
raw log and source identity are retained here. This is distinct from both
measurement bundles. Subsequent integration documentation does not change the
selected source or measured prototype.

The selected source's recorded focused verification is161/161 tests in11files,
including10 new independent behavioral cases, with TypeScript and original
contract checks passing. The prototype's162 tests and strict optimizer counts
are explicitly historical evidence, not selected-baseline results. Full original
unit/build/three-engine complete inventory and downstream CI remain required on
the submitted Draft and are not certified by these source reviews.

The decision rejects adoption because consistent latency or heap benefit was
not established, with three unfavorable OFF singles and longer previous-map
lifetime. It does not assert universal statistical regression. All four values,
every phase, separate ON counters, limitations and UNKNOWN heap remain retained.
The original104 requirements/116cases/464clauses/24packages/6groups/68supplemental,
73 locked inputs and94local/22external/**RELEASE BLOCKED** remain unchanged.
No devices, production/auth changes, deployment, merge or publication occurred.

This Draft stacks on unmerged P2-01 Draft62. Main was rechecked at
`03aa371042ea7f3ddf6d05afc8200194b67e51f0`; no dependency is represented as merged.
P2-04 must consume the retained P2-01 store, not assume an adopted changeset.
