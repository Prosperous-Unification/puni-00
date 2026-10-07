---
status: proposed
---

# Activation authority is independent of the candidate

Automatic toolkit activation is issued by an independently controlled activation controller,
with authenticated review evidence and candidate-addressed immutable artifacts, because the
candidate must not confer authority on its own execution. Candidate evaluation, publication and
merging use separate credentials; introducing automation does not remove candidate-specific
certification.

## Considered Options

- Automating the existing three-variable selection is suitable for serialized bootstrap, but
  retains a shared mutable slot and cannot admit concurrent candidates independently.
- A protected controller with candidate-addressed selection supports concurrent evaluation and
  recoverable publication while keeping trust outside the candidate.
- Candidate-owned workflows producing their own trusted review records cannot establish
  independent provenance and are rejected.

## Consequences

External identity, journal verification, durable storage and publisher authority are bootstrap
prerequisites. After bootstrap, normal candidate admission has no human approval or artifact
handling step; failure remains visible and cannot trigger a protection bypass.
