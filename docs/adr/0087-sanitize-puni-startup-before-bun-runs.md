# Sanitize PUNI startup before Bun runs

PUNI ships an interpreted Bun bundle whose executable shebang uses the OS `env` utility to remove startup preload controls and supplies `--no-env-file --config=/dev/null`, before any application code can run. Compilation was rejected as an isolation boundary: pinned Bun 1.4.4 still honors inherited preload controls in compiled executables, while compiled paths also change the installed-asset and helper contracts. This keeps first-party code in Bun and makes the OS utility an explicit installation prerequisite; toolkit and activation verification remain separate requirements.

Generated helpers use the same sanitizer with the selected Bun executable and canonical `dash` namespace; direct `[bun, entrypoint]` invocation bypasses shebang protection. Remove `BUN_OPTIONS`, `BUN_INSPECT_PRELOAD`, `NODE_OPTIONS` and `BUN_BE_BUN`; the first two executed preloads in the pinned-runtime probes, while the latter two retain the explicit startup-environment contract without a claimed execution negative on an interpreted Bun entry. Linux/GNU `env -S` is verified; other supported host implementations require their own installation evidence.

The concrete probes, killed controls and limits belong in [PUNI verification](../../openspec/changes/puni-cli/verify.md#startup-boundary-probes-2026-11-09). Package builders and helper composers must share the launch contract so a helper cannot silently reintroduce an unprotected startup path.

The [shared startup composer](../../libs/shared/adapters/bun-startup/src/index.ts) owns the shared script header and programmatic prefix.

The selected Bun executable must have an absolute path without an equals sign: env parses a command containing equals as an environment assignment even after its option separator. Installed script and operand paths may contain equals signs; the composer refuses only the unsupported runtime path before constructing an invocation.
