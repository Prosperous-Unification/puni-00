## Intent

Compose the independently reviewed organization DNS proof scheduler and
verification-only SMTP branches without losing either boot contract. Their
shared configuration, process entrypoints and browser-process fixture overlap.
The aggregate must preserve exact source ancestry, independent optional authority,
DNS worker cancellation/storage ordering, surfaced background failures and SMTP
final-acceptance/deadline/refusal semantics.

The outcome is a locally reviewable candidate with both focused boot suites and
a combined configured boot test. Source heads are scheduler
457a919eedb91c39b138a9c07e37513528955fc1 and SMTP
17f83ffdecf86867175e338c9dd4c516cbae3215. No source branch is changed.

This composition does not enable invitation/join mail, alter DNS destination
policy, restore obsolete signal handlers, configure a live relay/resolver or
claim release acceptance. No schema migration or new runtime capability is
introduced. Laptop verification stays serial and focused; full hosted CI and
canonical h2 gate remain required. Public push remains blocked pending specific
approval and is outside this task.
