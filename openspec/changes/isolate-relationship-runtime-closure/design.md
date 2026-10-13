## Approach

A per-extraction TypeScript System facade owns a physical node_modules directory. Filesystem probes identify a top-level package, including scoped names, and copy that complete package into a staging directory before renaming it into place. Relative files and nested node_modules retain their original topology. Packages are copied once per extraction; unrelated development dependencies remain untouched.

The copier resolves every source path against the externally trusted root, rejects escaping links, cycles, unreadability and special files, and writes regular files and directories. Reflinks are requested where supported, with the filesystem's ordinary copy fallback. No package directory symlink enters the materialized workspace.

The same facade supplies config parsing, compiler host operations, and explicit module/type-reference resolution. It denies filesystem probes outside the candidate and copied closure before consumption. Only lib*.d.ts immediately within the bundled compiler's actual standard library directory are readable outside that boundary. Candidate snapshots cannot contain a node_modules path segment at any depth, including a symlink at that segment. After program construction, declaration realpaths are rechecked; TypeScript-classified external sources must be inside the physical copied node_modules directory; an outside path also requires the compiler's default-library classification.

Candidate snapshot materialization and package staging both clean up on exceptions. The outer extraction finally removes the workspace after successful or failed compiler work. The existing environment and archive layouts are unchanged.

## Cost

Cost scales with the complete packages actually probed, including their nested dependencies. A very large single package still costs a complete copy. Copies are per extraction, avoiding a persistent mutable cache and avoiding a 1.6 GB whole-install copy for normal repository extraction.
