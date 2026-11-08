# Native source Init shape and private fixture diagnostics

The bounded runner's first physical attempt failed after fixture preparation. Its
original nested cause was not retained, so the exact physical cause remains
unverified. A separately reported private inspection confirms that the source
container's native HostConfig omits Init. Local production-path reproduction proves
that this shape was rejected before tag resolution; it does not establish that
this was the sole failure in the physical attempt. No host operations were run by
this correction packet.

## Source-only optional shape

The source decoder now models absent Init as well as explicit null/false/true.
It does not assign or normalize the property. Own undefined, strings and numbers
remain malformed. Whole-source owner tests consume native full JSON through the
same fixture transport, preserve inherited image entrypoint/effective argv, reach
mutable-tag refusal before effects, and reject absent-to-present shape drift.
Absent Init still requires private PID and coherent terminal timestamps. Managed
namespace admission continues to require init:true; no managed decoder changed.

The native owner/tag tests and direct absence decoder test failed at the original
Init guard before this fix. Fresh independent faults remove absence support,
admit own undefined and manufacture a null key; each fails its named production
path. Their receipts and the initial RED output are under
`evidence/source-native-init/`.

## Diagnostic boundary

The source pipeline now attaches a closed static component stage. Nonzero bounded
commands retain only a closed operation class and a validated integer exit status.
The solver receipt stores a safe diagnostic projection instead of an Error string.
All unknown Error names/messages are hash-only; known assertion messages map to
closed categories. No argv, stdout, stderr, Config.Env, enumerable error fields or
raw causes are serialized. Unknown commands/categories are visibly unclassified
and remain failures.

Cause traversal is limited to eight errors, 128 name characters and 4096 message
characters per hash input. Cycles, depth/size limits and malformed fields have
explicit markers. Diagnostic properties are read only from data descriptors over
at most eight prototype levels; accessors produce unreadable-error without any
getter invocation. This includes inherited Error names and typed stage/command/exit
fields. No raw error enumeration or conversion runs. Unknown nested causes stay in memory for propagation;
only the bounded projection enters receipts or final exception text.

The tag-negative catch previously discarded every unexpected cause and replaced
it with a generic failed expectation. The shared expected-refusal boundary now
accepts only the exact modeled tag, stopped-namespace or expired-token category.
A missing refusal or unknown error fails while preserving its stage and cause
hash chain. The actual ordinary stopped-mount audit and actual bounded exit-17
subprocess are exercised locally. Synthetic credential sentinels cover names,
messages, raw causes, arbitrary enumerable fields, argv/stderr and accessor drift.

Both new suites are included in the normal local test target; actual Docker/systemd
acceptance remains opt-in. Independent faults cover hash privacy, single metadata
capture, cycle/depth/size bounds, command attribution, expected-refusal recovery,
closed stage/category/status grammar and configured suite omission. Final command
results follow below. Root's full configured unit result is separate; this packet
does not repeat that suite or claim actual source acceptance, activation, adoption
or compatible restoration.

The creator's refusal JSON and invalid-CLI stderr use the same projection. Its
policy-before-manifest regression independently reads the absent policy and
compares its private fingerprint, rather than retaining the filesystem path.
Direct malformed-manifest and invalid-CLI tests prove payloads are not echoed.

Final focused owner/source/typed API run: **320 passed, zero failed, 2797
assertions** across 15 files (37.83 s). Final fixture/source decoder confirmation:
**97 passed, zero failed, 247 assertions** across eight files (1.23 s); creator
privacy tests were rechecked after the final test type narrowing. All 18 watched
faults failed their intended named test. Uncached Nx lint, typecheck and build,
explicit test typecheck and normal focused OpenSpec validation passed. No full
unit suite or physical host runner was repeated in this packet. Normal commit
hooks remain required before source review and the root-authorized exact-SHA retry.

Descriptor review correction: the earlier single-read implementation could invoke
a getter once, so it did not meet the getter-free boundary. The new regression
first reproduced getter execution and an accessor impersonating the expected tag
refusal. Descriptor-only reads now refuse both without invoking getters, including
nested causes and typed metadata. Unknown objects and private sentinels remain
safe. Three independent watched faults (descriptor access, expected-refusal guard,
prototype depth) each failed the intended test. Evidence is under
`evidence/source-native-init-descriptors/`. Fresh focused run: **324 passed, zero
failed, 2822 assertions**; fixture confirmation: **99 passed, zero failed, 263
assertions**. No full suite or host acceptance was repeated.
