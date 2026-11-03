## Context

The existing question catalogue is intentionally publishable system context outside the protected private literal. v10 exploration examples and guidance were instead inside that literal, so a legitimate captured answer triggered the strict lexical detector. Independent review approved reusing the catalogue boundary.

## Goals / Non-Goals

Preserve useful exploration and exact safety semantics while separating content intended for visitors. No content allowlist, detector modification, general tuning, new authority, migration or activation.

## Decisions

Keep a small static public-material object beside prompt composition. Reuse canonical starting-choice labels for its five offers; include only existing example descriptions, browsing/return options and human-review facts. Keep all imperative constraints in the private literal, referring to public material by purpose. Serialize public material once alongside the existing question catalogue into the same system string used by pricing and the provider. No visitor messages, references, stored context or model replies populate either catalogue.

Review the private text and public JSON as distinct canonical blocks in the existing prompt document. The complete composed input is versioned v11; schema 1, final hint and legacy sales v3 stay unchanged. Add exactly v11 to explicit presentation identities and retain v1–v10/opaque behavior.

## Risks / Trade-offs

The unchanged lexical detector can still reject public prose that reproduces a genuine private excerpt. Public membership never overrides a match. Fixtures demonstrate the classification boundary and safety controls, not general semantic secrecy or real-model quality. Fresh paid v11 acceptance remains a controller release gate.

## Migration Plan

No storage changes. Existing records keep their identities and raw replies. New operations record v11. Production remains held pending controller review, CI/gate and fresh bounded paid evaluation.

## Open Questions

None for implementation; release acceptance is separate evidence.
