# SQLite and backup cleanup provenance

A snapshot operation can currently throw the same error shape for an ordinary semantic refusal and for an original descriptor or SQLite connection whose cleanup threw. Backup also cannot retain a native client that failed initialization before returning a Connection. Storage can sanitize those errors before their original ownership reaches the outer owner.

The existing seven-path cleanup design separates authentic cleanup provenance from later owner retention. Implement its complete five-adapter component privately: retain actual acquired originals and ordered failures in an opaque, identity-classified failure; preserve ordinary primary identity when cleanup succeeds; and attempt every remaining directly owned cleanup once. Cover initialization, the two backup-used Drizzle wrappers, and all existing bounded/legacy backup ownership branches.

Successful APIs, byte/deadline/publication semantics, existing signatures and normal cleanup remain unchanged. The changed cleanup-only failure identity is deliberate. No raw resource accessor, retry/discharge API, global owner registry, keeper or adapter-to-tool dependency is added.

This component does not repair storage sanitizer handoff, capsule enrollment, runtime/outer lock unwind or parked producers. Those remain deferred behind the constructor RED sequence. Keep the frozen successor proposal and captured original untouched; no main adoption or deployment follows. All new native fault cases require frozen source, exact original delegation/fixture retirement and a separate bounded execution grant before running.
