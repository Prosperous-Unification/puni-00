# Detached Kubernetes dependency evidence

This bounded prerequisite for tasks 10.1/10.2 preserves evidence across a future
coordinator interruption. It adds no release caller, filesystem persistence,
Kubernetes observation, SQL operation, activation authority, participant fencing,
restoration or exposure. ADR 0060 remains the recovery boundary.

`dependency-evidence.ts` exports a pure closed version-1 codec and conservative
recovery classifier. The envelope contains a decoded payload, exact canonical JSON
text and SHA256 over that text's UTF-8 bytes. Decoding checks all three against one
another and against an independently supplied binding. Key ordering uses JavaScript
ordinal string comparison; array order and embedded proof/policy bytes are
preserved. Every list requires an own element at every integer index; sparse
arrays refuse before any omitted slot can change the canonical projection. SHA256
detects inconsistency, not authenticity or malicious resealing.
The caller must retain the expected binding separately from the envelope.

The binding pins transaction, cluster UID, namespace, PVC name/UID, volume name,
PV UID, database path, candidate/retained digest images, migration-capture hash
and separately attributed candidate/retained invocations. Each invocation retains
observation ID, namespace, Job name/UID, Pod UID, image, exact command array and
its hash. Equal image digests still require different observation, Job and Pod
identities. This transport preserves claims; it does not re-observe the cluster.

Store progress is explicitly incomplete with a reason, or observed at the
pre-migration/pre-exposure stage. An observation preserves B2 interval ID,
ownership-record hash, start/observation times, exact source binding, invocation,
strict B1 DISABLED/no-external-relationship authority and absent receipt. Interval
ordering is structural validation. This version cannot certify that B2 stayed
continuous, nor represent an ENABLED store scan. No missing or null store value
becomes dormant authority.

Participant evidence retains policy identity/revision, required roles and complete
policy body; immutable roster identities; attributed entries with complete proof
bytes/hash; and unresolved member obligations. The codec refuses duplicate IDs,
foreign claims, mismatched member identities, missing required-role coverage and
unrepresented absent/unresolved claims. An explicit unresolved obligation can
remain alongside a claim. These checks only establish internal claim consistency.
A matching roster and an empty unresolved list do not establish complete verified
participant exclusion or identify a trusted authorizer. An external participant
fencing protocol remains unimplemented.

Activation progress is not-requested, durable-intent with the existing exact
nine-field receipt, or confirmed with that receipt plus command evidence and a
separate independent readback. The six coordinator attribution fields bind to the
source, images, migration capture and complete participant evidence hash. Protocol,
version and nonnegative integer timestamp retain the existing receipt contract.
The timestamp is asserted by the intent, then compared exactly in both completion
receipts; this codec cannot establish clock truth. Confirmed command and readback
must agree on all nine fields and use distinct invocation identities. Encoding a
confirmation is not proof that any command actually ran.

Exposure progress is not-started, durable-intent with an intent identity and exact
candidate image, or confirmed with an invocation. A future coordinator must durably
persist intent before starting a candidate. This pure module cannot enforce write
ordering or durability. Activation evidence does not reuse
`ReleaseRequest.admission.activation`, and no `ReleaseEffects` surface changes.

Available malformed trusted evidence throws. Explicit lost/uncertain availability
routes to `requires-attended-recovery`; activation or exposure intent/confirmation
also routes there. Only two explicit unstarted progress states route to
`requires-dormant-admission`, including valid incomplete store/participant evidence.
That outcome requires independent dormant admission; it never grants rollback.
The module cannot establish migration exact-set restoration, participant capability,
production activation or live Kubernetes safety. Parent tasks 10.1/10.2 remain open.
