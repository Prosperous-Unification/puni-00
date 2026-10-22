# Frozen saved-plan bytes

`input-v1.txt` through `input-v8.txt` are exact serializer output captured from
historical `canonical-plan-input.ts` implementations. `manifest.json` pins each
builder revision and SHA-256. Each old builder was evaluated against the existing
`planFixtureRows` at `be99fdead784c3c879f18e122455d5262a1eca33`; its closed field list
selected the fields that existed in that version. Tests read these committed bytes,
never a dynamically downgraded current builder. The `.txt` suffix preserves their
original compact JSON bytes through formatting.

`schedule-v1.txt` pins the dormant v1 builder's empty-plan output with a retired
algorithm identity. `connected-history.txt` freezes the integrated Slice 1 codec's
two-project fixture for the core integrity reader without importing domain test
source across an Nx project boundary. These are test fixtures, not live captures.
