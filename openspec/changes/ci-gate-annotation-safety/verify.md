# Verification

At `58884b708056ccb181c8577de1891fac7023eea9` on h2puni:

- `bin/h2puni-gate.sh` passed all test, lint, typecheck, and build targets for 26
  projects, then passed the three-case solver image smoke.
- The borrowed dependency tree passed the required manifest check before and after
  the gate: 78 declared dependencies, 0 mismatches.
- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.3.0 validate --all --json`
  passed 68/68 items.

| Fault                                        | Expected proof                                            |
| -------------------------------------------- | --------------------------------------------------------- |
| Remove the unsafe-command guard              | The real CLI test emits the tab-bearing command and fails |
| Remove the safe-tail prefix or bare-CR split | A rendered line begins with a workflow command            |
| Decode printable percent spellings           | The exact accepted stdout assertion fails                 |
