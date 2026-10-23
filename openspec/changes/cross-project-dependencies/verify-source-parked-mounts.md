# Source mount identity during parked restoration

Historical ordering scope: the earlier source-only ordering exception and unrelated
array-order refusal premise are superseded by verify-native-mount-identity.md.
Their proof receipts remain historical and are not counted as current guards.
Startup, lifecycle, exact raw membership and parked full-member validation remain
required. Current inventory ordering applies uniformly to every native container.

This follow-up integrates the native source binding packet on root05e6dc1df's
compatible solver restoration implementation. The shared composition fixture now
rotates source mounts on every native observation, including after solver removal
and exclusion-token expiry. The first full restoration success test failed at
exact parked participant comparison before this fix, then passed afterward.

One pure projection now derives full native source mount order from the actual
exact raw inventory member, preserving every field and every unrelated member.
It rejects a copied source object absent from the inventory. Live owner audits
independently validate the source before projection. Parked comparisons locate
the captured source identity, decode it, compare its entire member with retained
state and require terminal PID-zero/restart inhibition before projection. No
expected fields are copied into actual inventory identity.

The parked monitor's nonsolver baseline/current identities and the read-only
backend monitor's before/after full inventories use this same projection. They
receive ordinary captured monitoring state, without recreating or retaining an
exclusion token after expiry. Existing namespace admission and exact raw returned
recognition remain unchanged.

Full restoration success with successive source mount permutations and three
post-expiry negatives (duplicate target, native source field drift, unrelated
native mount field drift) passed alongside a direct raw-membership/actual-field
regression: 5 passed, zero failed, 8426 assertions. Five independent watched
faults failed the intended named tests: parked ordering, parked backend ordering,
retained member equality, source-only scope and exact raw membership. All faults
were restored. The remaining focused source/owner/native/typed run passed 312 tests with zero
failures and 883 assertions across 14 files. Normal Nx lint/typecheck/build, explicit
test typecheck and focused OpenSpec validation passed. Results are recorded under
evidence/source-parked-mounts/.

No full unit suite or host runner was executed here. The separate optional source
observer deadline correction remains required before the final combined review.
