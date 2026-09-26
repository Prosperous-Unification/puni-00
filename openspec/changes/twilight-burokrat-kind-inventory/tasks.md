## 1. Kind inventory

- [x] 1.1 Validate a candidate-held kind inventory and merge it into the kind graph, recording support files and refusing suffix and composition-root conflicts. Tests: `kind inventory in the kind graph`. Negatives: deleting the composition-root conflict.
- [x] 1.2 Read the inventory from the selected blob through an optional `kindInventory` rule policy field, and leave MOD-LAYOUT, F1 and K2 through K6 unevaluated when it is unusable. Tests: `kind inventory through the production CLI`. Negatives: no inventory entries passed, checkout read, absent-returns-empty, JSON boundary removed, duplicate/stale/suffix checks deleted, each rule's guard replaced by an empty observed list.
- [x] 1.3 Name `docs/code-organization/kinds.json` in the repository rule policy. Test: `the repository rule policy names the tracked kind inventory`.
