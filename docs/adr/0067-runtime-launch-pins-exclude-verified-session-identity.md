---
status: proposed
---

# Pin runtime launch authority separately from login-session identity

The historical full authority digest includes loaded login-session scopes, so an incidental session ending can prevent a later legitimate solver restart. We propose a separate, independently prepared runtime-launch pin: collect and validate every existing surface, but normalize only positively associated logind scopes that match approved configuration profiles, while preserving the old full digest and census for their original callers. A bounded data-only profile constant and complete within-pass readbacks avoid changing supervisor authority or learning expected pins from current observations.

Keeping the full digest for restart would preserve the incompatibility; filtering all transient or loaded-only units would discard meaningful configuration/launch changes. This proposed private contract therefore requires explicit new pin preparation and scoped collector changes, not new approval machinery or architectural main/deployment adoption; native qualification and the remaining handoff obligations stay open.
