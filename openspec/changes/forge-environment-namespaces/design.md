## Namespace lifecycle

The namespace is the owned workload boundary. `forge-namespace.ts` creates it atomically and decodes trusted metadata before adoption or teardown. UID-precondition deletion prevents an inspected namespace from authorizing deletion of a replacement. Interrupted creates keep their namespace and shared claims, allowing the same pair to retry or run down; failed deletes retain admission and claims until teardown can finish.

The overlay remains a `puni-forge` template; binding writes the environment namespace after validating the template. Namespace-local ServiceAccount, Role and RoleBinding use the admitted workload identity while their binding subject remains the controller in `puni-forge`. Pod discovery scans lab-labelled Pods across namespaces; atomic Leases retain cross-namespace uniqueness. Existing shared-namespace environments must be stopped using the prior revision before upgrading; databases are not transferred.
