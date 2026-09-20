## 1. Part A — adopted-set ratcheting

- [ ] 1.1 Accept ratchet mode only with a unique consumer-supplied adopted set, map findings inside it to refusals and findings outside it to debt, and amend the owning service-taxonomy requirement — tests: `refuses ratchet when the policy states no adopted set`, `reports ratchet debt outside the adopted set and allows the candidate`, `refuses ratchet debt inside the adopted set`, and `refuses an adopted set that repeats a prefix`; negatives: A1 removes the missing-set refusal, A2/A3 force one ratchet effect, and A4 removes prefix uniqueness.

## 2. Part B — F7 file-size ratchet

- [ ] 2.1 Measure production TypeScript sources under declared roots, enforce the ceiling and shrinking pins, refuse stale pins, and register F7 — tests: `F7 the size ratchet`; negatives: B1 through B10 break line counting, boundaries, pin behavior, schema narrows, and required policy input propagation.

## 3. Part C — kind resolution and module layout

- [ ] 3.1 Resolve filename kinds, delivery files, nearest modules and composition roots, then require a checked module index and regular contract file through MOD-LAYOUT — tests: `kind resolution` and `MOD-LAYOUT`; negatives: C1 through C7 break suffix, view, nearest-module, layout, regular-file, and unavailable-index handling.

## 4. Part D — K3 and K4 import direction

- [ ] 4.1 Memoize relationship extraction, follow barrels, register K3 and K4, and preserve REL-EXTRACT behavior — tests: `K3 and K4` plus `reports a declared relationship that the candidate leaves unresolved`; negatives: D1 through D6 break barrel traversal, forbidden-kind filtering, composition exclusion, unavailable-graph propagation, and K3/K4 directions.

## 5. Part E — K2, K5, K6, F1 and record

- [ ] 5.1 Register K2, K5 and K6, enforce F1 for kinded services and declared plain-TypeScript paths, document all B2 rules, and consolidate verification — tests: `K2, K5, K6 and F1`; negatives: E1 through E10 break direction lists, sideways-module detection, React coverage, selector freshness, required policy input propagation, and registry metadata.
