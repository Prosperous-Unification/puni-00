---
status: accepted
---

# Cross-project dependency activation is monotone

Cross-project dependency authoring changes the meaning that every WBS reader, writer and replay consumer must understand. We persist activation authority once a deployment has excluded incompatible participants, and an incapable binary keeps refusing even after the last live external edge is removed. Live row count is not a safe rollback signal: command journals, saved plans and replay evidence may still name external endpoints. We chose this over an automatic disable-on-empty mode because absence of current edges does not prove the retained evidence is gone; a future deactivation protocol would need an explicit, complete proof of that fact. After possible semantic activation, or exposure that prevents proof of an eligible dormant rollback, recovery preserves current bytes and uses an attended compatible binary rather than automatically reversing migrations or restoring a pre-exposure snapshot, which could discard writes. The independently verified dormant Kubernetes rollback contract remains available before that boundary.
