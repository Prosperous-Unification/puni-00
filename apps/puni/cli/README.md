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

Local package verification does not establish registry publication authority or a clean
release checkout. Repository-wide script conversion and deployment cutover are tracked in
the `puni-cli` OpenSpec change.
