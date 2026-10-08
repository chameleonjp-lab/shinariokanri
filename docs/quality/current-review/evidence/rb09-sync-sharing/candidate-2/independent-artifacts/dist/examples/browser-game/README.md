# Independent browser game receiver

Build with `npm run build`. Open `<base>/examples/browser-game/index.html` or serve this directory. `index.html` and generated `game.js` are an independent application using the same locked runtime engine; it does not read the author application's database or execute a trial's side effects.

Export a confirmed `scenario-runtime` profile 1.1.0, then select the JSON file here. The receiver checks public content, runtime content, specification features, ID mappings and every material's bytes/hash/signature. Missing materials and unknown specifications stop reception.

Choose a game-owned external contract, perform a game action (win/lose/collect), choose an entry and start the story with measured values. Stub buttons remain explicitly stub. Export the receipt and import it into the author application against the same edition and policy. Receipt mode is derived from actions, checked result mechanics and replay; a manually changed label is rejected.

Specification: `scenario-browser-game/1.0.0`. Receiver owner: this independent browser example. No accounts, server, ranking database, network transmission or billing are used. This is a generic handoff example, not an adapter guarantee for every engine or proof of live external authentication. Its source and generated artifacts retain the repository license; file-format compatibility is documented in `docs/implementation/EXPORT_COMPATIBILITY.md`.
