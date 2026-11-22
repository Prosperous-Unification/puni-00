---
status: accepted
---

# Step retirement preserves identity

Retiring an unbound step removes it from the active catalogue while preserving its definition, code and name reservation, explicit package values, merge aliases and immutable history. Physical deletion would either fail their foreign keys or erase SC21 values and SC13 identity; refusing every referenced unbound definition would make ordinary retirement depend on invisible storage history. We retain an explicit retirement record instead, with no implicit reactivation through binding, import or replay; downgrade must refuse recorded retirements rather than silently make them active again.
