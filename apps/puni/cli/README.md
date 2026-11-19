# PUNI

PUNI combines planning, static rules and execution in one Bun executable.

```text
puni navigator    (aliases: nav, n)
puni burokrat     (aliases: bur, b)
puni dash         (alias: d)
```

Use `puni --help`, `puni --version`, and `puni <namespace> --help` for discovery.
`puni completion bash|zsh|fish` prints shell completion definitions.

The local package includes the current Burokrat toolkit, its pinned compiler closure,
Dash migrations and observation launcher. Burokrat execution requires the package's exact
Bun version. Git, GNU tar and other operation-specific external utilities remain explicit
prerequisites. Run the installed executable to retain protected Bun startup.

The delivered ESM entrypoint also exports `main(args, context)` for an explicitly selected
same-process integration. Importing it performs no ambient argv dispatch. The caller captures
installation directory/entrypoint, lookup directory/PATH, caller cwd, Bun runtime, temporary
directory, environment and native output functions before importing. `main` returns
`{kind:'drain'|'exit',status:number}`; the executable caller must honor that completion only after
the owned operation settles. The repository lint adapter selects this artifact through absolute
`PUNI_EXECUTABLE` and forwards `['bur','lint',...operands]`. It does not add a child process or
replace the installed toolkit/activation checks. Missing/unusable exports are errors, never a
source fallback. On failure the executable adapter makes one shared bounded diagnostic
attempt and exits1, including when failed module code retains a timer. The reusable adapter
operation still rejects. This is no promise to flush an abandoned sink or clean arbitrary
module-created resources. The local package integration case exercises the installed main and
actual Nx caller with optional unconfigured lint and required absent-activation refusal. This does
not establish configured semantic certification, default provisioning or complete packaged client
coverage; native cancellation during import is not yet demonstrated.

An already installed PUNI can provision a separate client from an explicitly selected local
archive and an independently obtained expected SHA-256. Set the archive and destination to
absolute paths; the destination must be fresh and outside the caller repository, controlling
installation, Bun runtime and archive authority. Run this operation from the consumer's Git
repository. For example:

```sh
puni dash install-puni "$AUTHENTICATED_PUNI_ARCHIVE" --sha256 "$EXPECTED_PUNI_SHA256" --destination "$NEW_CLIENT_DIRECTORY"
```

The operation admits the current producer profile before a scripts-disabled local Bun install,
then prints one JSON selection containing `schemaVersion`, `archiveSha256` and the native absolute
`entrypoint`. Configure a consumer explicitly with that entrypoint; the JSON is not shell code.
The expected digest binds the archive bytes to the authority you supplied, not to a public release
identity. This operation does not update its controlling installation, choose a registry version,
set a default or activate CI. Cold start still uses standard external Bun package installation.

Local package verification does not establish registry publication authority or a clean
release checkout. Repository-wide script conversion and deployment cutover are tracked in
the `puni-cli` OpenSpec change.

The repository development-port aliases use the same explicit delivered-main selection:
set `PUNI_EXECUTABLE` to the absolute entrypoint of a separately provisioned, reviewed
current PUNI, then use `bun run --shell=bun dev:ports` or `bun run --shell=bun dev:kill`.
They check or explicitly release this checkout's ports through the closed Dash operation;
they never infer the checkout from the installation directory or select a PATH binary.
The explicit Bun package-script shell avoids Bun's default system-shell launcher.
Missing/unusable selection refuses with an operator instruction. The adapter preserves
binary output and the root's completion, and makes one bounded failure diagnostic before
terminal1. This does not promise to flush abandoned output or clean module-created resources.
The historical `bin/dev.sh` and its verification runner remain until their remaining consumers and controls migrate. Default provisioning and complete installed client coverage remain open.

## Complete development repository caller

The default aliases now project only the embedded development purpose: with an explicitly selected reviewed `PUNI_EXECUTABLE`, run `bun run --shell=bun dev` or `bun run --shell=bun dev:local-solver`. The adapter captures this checkout and caller independently of installation, supplies the existing native development IO capability, and leaves preflight, local Nx, signals and capture to PUNI. It adds no child/controller. Missing selection refuses; imported main never falls back to source or PATH. The reusable adapter returns Completion or rejects, and its executable honors exit/drain only after settlement.

The source package callers do not establish installed/container/default delivery. The dev container requires an external read-only whole installation at `/opt/puni-dev` and an explicit mapped entrypoint; see [deployment prerequisites](../../../docs/runbook-dev-deploy.md#puni-development-installation-selection). No registry/public pin or default activation follows. Historical `bin/dev.sh`/`bin/dev.test.sh` remain until the remaining runner/caller/guard coverage converges.

The local packaged test now exercises both complete-development package aliases through a real installed main, using finite local Nx fixtures and an explicitly protected initial Bun launch. It does not establish package-run TTY/control, actual container startup, public release provenance or default provisioning. Remaining legacy Forge/verification callers must migrate before the historical shell files can be retired.
