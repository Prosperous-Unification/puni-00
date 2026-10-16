# WBS090 compensating hosted diagnostic proof

The proof branch adds instrumentation only atop PR #550 source
`54f9f950c91cbae3bc7ed8e27f0c6bec580b4ad9`, tree
`7ac6e2ddde3151d852074cd75241b219b1fb1c29`. The independently checked
candidate uses those exact bytes against release base
`e22e55f615be361551519cd9dd7ffdf40da7e326`, tree
`7d1d1d3c987e14104171669a24aef793cbe60b58`.

The evaluator tarball, executable, toolkit closure and policy retain the immutable
pins used by keyboard hosted run 38873684503. Five serial committed-source
surveys cover selected F7 base/candidate, an exact-original 1127-line production
fault, and full fourteen-rule base/candidate. Comparisons require exactly the
compensating F7 finding to disappear and every unrelated finding and unevaluated
entry to remain equal. Verdicts remain noncertifying. Comparator injections must
fail selected-finding, unrelated-finding and unevaluated assertions, followed by
restored comparisons. The production fault modifies only the selected file.

No evaluator, Nx gate, browser or application tests run on the laptop. Hosted
execution and receipts remain unverified until the workflow completes. This proof
does not close WBS090, change PR #550, activate policy, merge or deploy anything.
