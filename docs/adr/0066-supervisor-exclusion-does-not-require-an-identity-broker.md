---
status: accepted
---

# Supervisor exclusion does not require an identity broker

Cross-project-dependencies delivery requires actual solver stop/drain, continuous request/restart/installer fencing and independently pinned compatible restoration alongside complete participant exclusion. Keep the proposed root-owned identity broker and TLS protocol in a separate followup rather than make a new privileged host component a delivery prerequisite: runtime identity observation does not itself exclude a solver or prevent restart. This scope decision preserves [ADR 0069's monotone activation and attended compatible recovery boundary](0069-cross-project-dependency-activation-is-monotone.md), including refusal of unknown authority; it does not weaken exclusion, admit incapable restoration or claim those controls already exist. [ADR 0070](0070-root-authority-publishes-live-supervisor-identity.md) remains proposed only for that followup.
