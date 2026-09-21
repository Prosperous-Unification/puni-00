# Design

P5 of [the package plan](../../../docs/superpowers/plans/2026-09-17-twilight-burokrat-package.md#p5--switch-every-consumer-path-to-the-package) defines the adoption sequence. Trusted bootstrap creates a scratch consumer from base-owned package and lock files, configures an explicit registry, installs frozen with lifecycle scripts disabled, and only then reads candidate bytes. Root diagnostics use the local installed executable while `bin/tool-wiki-lint.sh` remains an external compatibility route.

Package compatibility is checked against the externally selected activation. Deployment preparation consumes the admitted source SHA, package identity, activation identity, and staged image digest as separate fields.

## Shape

- `infra/ci/burokrat/consumer.json` is the one base-owned switch: `admission` is `archive-launcher` or `installed-package`, plus the explicit `registry`. `trusted-wiki` sparse-checks-out `infra/ci/burokrat/` at `github.event.pull_request.base.sha`, so a pull request editing the switch is judged by its base.
- `bootstrap.sh` validates the switch, manifest and lock, copies only `package.json` and `bun.lock` into `$RUNNER_TEMP/twilight-burokrat/consumer`, and installs with `--frozen-lockfile --ignore-scripts --registry` under `env -i` from that directory, before the candidate checkout step. It copies `admit.sh` beside the install.
- `admit.sh` joins the installed package's `twilight-burokrat-v<version> <toolkitIdentity>` to the activation root's `toolkit-release`, runs the installed `lint committed` with only `PATH`, `HOME` and the two admission variables, and on certification writes `admission.json`.
- `requireDeploymentAdmission` (`tools/tool-devsync/src/burokrat-consumer.ts`) is the typed deployment descriptor: it validates that record and joins it to the staged `sha256:` image digest and deployed source SHA. F11 wires it into `tool-deploy`.
- `bin/tool-wiki-package-lint.sh` is the root compatibility route to `node_modules/twilight-burokrat`, refusing without an exact root pin, on a version mismatch, and on re-entry.

## Assumptions (recorded, not asked)

1. The package is unpublished, so no registry integrity exists. The committed switch stays `archive-launcher` and no `infra/ci/burokrat/bun.lock` is committed; `installed-package` without a lock refuses. Live `trusted-wiki` behavior is unchanged apart from the extra sparse base checkout and bootstrap step, which prints `route=archive-launcher`.
2. The end-to-end proof serves the tarball the `twilight-burokrat:pack` target produces at the tested commit (the same artifact `test:package` installs) from an in-process loopback registry. The lock is generated against that registry, so its tarball URL is loopback-specific and is never committed. `consumer.json` accepts `http://127.0.0.1:<port>/` only for this purpose; every other registry must be HTTPS.
3. Package/activation compatibility is equality of the activation's `toolkit-release` with the installed package's version and toolkit identity. Activations without that descriptor, including every pre-package archive, are incompatible with the package route.
4. The root devDependency, lefthook, CI diagnostic step, `twilight-burokrat:lint` and h2puni gate still call `bin/tool-wiki-lint.sh`, because a root registry pin would break `bun install --frozen-lockfile` before publication. `bin/tool-wiki-lint.sh` also remains the launcher source the release planner and frozen exhaustive corpus name, so its reusable implementation is not moved yet; the new route takes that name after the freeze.
5. The gate's source-project exclusion already names `twilight-burokrat` (done in P1); it is unchanged.
6. `consumer-bootstrap.test.ts` belongs to `test:package` (it needs the packed tarball), not to the ordinary `test` target, matching `install.test.ts`. The CI gate runs `test:package` in its own step whenever Tool Wiki is in scope, and `gate-entrypoints.test.ts` carries the registry-free ordering, literal and refusal checks in the ordinary `test` target.
7. Every pull request is judged by its base's pin against the currently selected activation, so a pin change merges first and the variables follow; a base/activation mismatch is repaired through the variables, never through a pull request.
8. The deployment descriptor lives in `tool-devsync` because `infra/ci` is not an Nx project and `tools/tool-deploy` is owned by F11. It uses plain type guards because buildable `tool-devsync` may not import `@shared/validation`.
