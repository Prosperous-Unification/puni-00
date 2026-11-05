# Private PostgreSQL observer publication

The private observer and deadline component is implemented and independently approved at source commit `0a1658be27912903d7321b9942ccfa0b609aa016`. It is unused by the production provider selector. The transaction/session owner is still Task 2; all complete-provider acceptance and transfer tasks remain open.

The observer uses a reserved same-role read-only session and a session-bound prepared SELECT containing both continuity checks and the complete backend inspection. It tracks exact registered PID/start identities, writer cookies and parallel ancestry. Missing visibility, lost/replaced probes and ambiguous ancestry reject. Observed PID supersession is retained across scans. The owner must still prevent future writers, drain operations, close writer resources and dispose the final observer; the observer alone cannot establish those guarantees or resolve an unknown COMMIT.

## Observed verification

The final real PostgreSQL18.6/Bun1.4.4 suite recorded **23 pass / 0 fail**. Without both optional fixture variables it recorded four pass and 19 visible database skips. A supplied wrong owner rejected before mutation. Scoped ESLint, TypeScript build and Prettier passed. The actual compiler was TypeScript7.0.2 through `node_modules/@typescript/native/bin/tsc`; no TypeScript6 run is claimed.

Two review fix rounds corrected missing/cyclic ancestry, cross-scope links, PID reuse across probes and partial fixture acquisition. The final independent review found no remaining Critical, Important or Minor findings within Task 1. The final five Bun controls O9/O10/O13/O16/O17 each produced native exit1 and the intended assertion, then restored exact source bytes. Prior controls and red attempts remain in their original dated records. Root independently verified final streams, source/restoration hashes, compiler identity and 21 unchanged historical artifacts without replaying historical tests.

The [manifest](postgres-observer-manifest.json) binds four exact source hashes and the [compressed evidence packet](postgres-observer-20261104.json.gz). The packet preserves all 150 original regular files from the SDD ledger, including plans/briefs, implementation reports, all three reviews, native commands/streams, controls, failed attempts and the independent root audit. To inspect it with Bun, call `gunzipSync`, parse the JSON, and decode each entry's `base64`; verify `bytes` and SHA-256 before using an entry. Never execute archived mutation runners during inspection.

## Deviations and limits

The original implementer used Python for edits/report/control orchestration, violating the Bun-only rule; actual test children were Bun. That deviation is disclosed and the original runner is preserved unchanged as evidence, not an approved tool. Later fixes and controls used Bun only. Some earliest attempt streams were overwritten before archiving and remain uncredited; their absence is inventoried in the packet. Earlier failed lint/compiler expectations remain separate from final checks. Publication does not erase or replay that provenance.

The disposable real-server fixture is exclusively owned and marked before test mutation. Its final cleanup is an outstanding root responsibility while the next lifecycle task is pending. No complete session queue, creation fence, sticky disposal, whole-branch/full host gate, complete 26+2 PostgreSQL conformance, transfer, production selection, operator-store migration or deployment is accepted here. Full Twilight tests/build were not run for Task 1. Ordinary unconfigured CI visibly skips this optional database profile; the real configured run is retained above. Existing P10 failures remain historical and are not resolved by observer-only acceptance.
