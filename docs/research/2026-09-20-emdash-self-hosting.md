# EmDash for the Prosperous Unification website

Research date: 2026-09-20. Scope: EmDash 0.38.0 and the Node Starter at revision
`d24ebbdc6c8a52f4e4bd90f00ac5a0dca708c222`, targeting the proposed k3s website workload for
a landing page and a work-request page. Evaluated release: EmDash 0.38.0 tag revision
`8975a8504bc9612f76834fbde4d1b02bd9698378`. A sandboxed executor prepared the research, scripts and
Dockerfiles; the planner then ran every container step on a workstation from the reviewed scripts,
on one image built once.

## Recommendation

**Adopt EmDash for the website, with two things still to be seen by a person.** On one image built once (345 MB, Node 22.23.2, digest-pinned bases), EmDash 0.38.0 scaffolded, installed and built with Bun alone, served from one container and one volume, kept its content and a submitted work request across a container replacement, served and accepted writes with no network at all, and came back from an online SQLite backup into a fresh volume, where it took a new write. Each of those has its negative: without the volume the same image answers 503 and shows nothing; a backup taken before the markers restores without them; an injected storage failure acknowledges nothing and stores nothing.

Two things were not exercised, because both need a person at a browser with a passkey: the admin setup and an admin edit (the fourth leg of H3), and the first-party forms plugin, which needs an admin to create a form. The work-request path was proven through the prepared fallback endpoint instead. Do both once before 060.2 builds on this; neither is expected to change the verdict, and both are cheap.

## The decision this recommendation rests on

A Node runtime inside the website container is acceptable. Dany decided on 2026-09-20 that
running specialized software written for Node on Node is compatible with the repository rule
“Bun and Nx only; never npm, pnpm, yarn or a second task runner.” The decision does not authorize
npm or a second task runner for code written in this repository. This preparation used Bun and
did not fall back to npm, pnpm, or yarn.

## Hard requirements

| Requirement                                            | Verdict                                | Observed                                                                                                                                                                                 | Negative observed                                                                                                                                                                                                           |
| ------------------------------------------------------ | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1: one container and one persistent volume            | **Pass**                               | A replacement container with a new container ID, on the same image ID and the same volume, showed the marker entry on the public page and held the submitted row.                        | The same image without the volume answered 503, "Database migrations are required", with no marker.                                                                                                                         |
| H2: permissive declared inventory                      | **Pass**                               | All ten direct dependencies declare MIT or Apache-2.0 (`emdash` 0.38.0, `astro` 7.3.3, `@astrojs/node` 11.1.6, `workerd` 1.20260920.1 and the rest).                                     | With `workerd`'s licence set to `MISSING` the audit exited 1 naming it; restored, it passed.                                                                                                                                |
| H3: no required Cloudflare service on the serving path | **Pass for three legs of four**        | With no network at all: the public page served the marker, the admin setup page loaded (200, 204 kB), and a submission was stored (201). No outbound failure appeared in the server log. | The egress probe, in the image's own Node, succeeded with the network on and failed with `fetch failed` with it off, so the denial was real. The fourth leg, an admin edit, was not run: it needs the passkey setup.        |
| H4: work-request submission                            | **Pass through the fallback endpoint** | A complete submission returned 201 and its row was read back from the database; it survived replacement, restore and the offline run.                                                    | A malformed submission returned 422 and stored nothing. With a storage failure injected the request got no acknowledgement and no row was stored. The first-party forms plugin was not run: creating a form needs an admin. |
| H5: backup and restore                                 | **Pass**                               | An online `node:sqlite` backup taken while the server ran, restored with the uploads into a fresh volume, served the marker, passed `integrity_check`, and accepted a new write.         | The baseline backup taken before any marker restored a site with no marker and no submissions table.                                                                                                                        |

## What self-hosting costs

<!-- external-claim -->

The pinned Node deployment guide requires Node 22.16 or later, a standalone `@astrojs/node`
build, persistent SQLite and uploads paths, and a continuously running process for scheduled
tasks. [EmDash Node deployment source](https://github.com/emdash-cms/emdash/blob/8975a8504bc9612f76834fbde4d1b02bd9698378/docs/src/content/docs/deployment/nodejs.mdx)
(Retrieved 2026-09-20.)

The prepared configuration puts `data.db` and `uploads` under `/app/data`, selects manual runtime
migrations, disables hosted registry discovery, and keeps the local sandbox runner. The existing
infrastructure plan’s single-writer shape—one replica, a persistent volume and external SQLite
backup—is compatible in shape, but no k3s deployment was exercised.

<!-- external-claim -->

Published 0.38.0 validates the `EMDASH_ENCRYPTION_KEY` format but does not use it to encrypt plugin
secrets; those values remain plaintext in the database, and losing the key has no current recovery
effect. [Tagged Node deployment guide](https://github.com/emdash-cms/emdash/blob/8975a8504bc9612f76834fbde4d1b02bd9698378/docs/src/content/docs/deployment/nodejs.mdx)
and [tagged secret handling](https://github.com/emdash-cms/emdash/blob/8975a8504bc9612f76834fbde4d1b02bd9698378/packages/core/src/config/secrets.ts)
(Retrieved 2026-09-20.) Unreleased `main` contains encryption code, but that later behavior is not
attributed to the evaluated release. Backups of 0.38.0 are sensitive because plugin secrets may be
plaintext.

## Node and Bun

<!-- external-claim -->

The pinned core manifest is EmDash 0.38.0, requires Node `>=22.16`, and declares MIT.
[Pinned core manifest](https://github.com/emdash-cms/emdash/blob/8975a8504bc9612f76834fbde4d1b02bd9698378/packages/core/package.json)
(Retrieved 2026-09-20.)

<!-- external-claim -->

The pinned starter declares Astro `^7.3.2`, `@astrojs/node` `^11.1.5`, EmDash `^0.38.0`, and local
paths `./data.db` and `./uploads` before relocation.
[Pinned starter manifest](https://github.com/emdash-cms/templates/blob/d24ebbdc6c8a52f4e4bd90f00ac5a0dca708c222/starter/package.json)
and [starter configuration](https://github.com/emdash-cms/templates/blob/d24ebbdc6c8a52f4e4bd90f00ac5a0dca708c222/starter/astro.config.mjs)
(Retrieved 2026-09-20.)

The preparation host had Node 24.20.0 and Bun 1.4.2. Bun failed before creating the site, so install,
build and serve compatibility remain unknown. The handoff pins `create-emdash` 0.38.0 and freezes
the lock only after all dependencies and local sources are added; no npm, pnpm or yarn fallback is
present.

## The plugin sandbox off Cloudflare

<!-- external-claim -->

On Node, EmDash runs sandboxed plugins in a local `workerd` child process; without a runner,
config-declared sandboxed plugins are not loaded, and setting `registry: false` disables discovery
without disabling those local plugins.
[Pinned sandbox guide](https://github.com/emdash-cms/emdash/blob/8975a8504bc9612f76834fbde4d1b02bd9698378/docs/src/content/docs/deployment/plugin-sandbox.mdx)
and [configuration reference](https://github.com/emdash-cms/emdash/blob/8975a8504bc9612f76834fbde4d1b02bd9698378/docs/src/content/docs/reference/configuration.mdx)
(Retrieved 2026-09-20.)

The handoff uses the source-documented string `@emdash-cms/sandbox-workerd/sandbox` and disables
the hosted registry. Published plugin CLI 0.11.0 requires publisher, author and security ownership
metadata for noninteractive scaffolding; preparation did not invent a publisher identity. The
local sandbox plugin, runner-off negative and runner-on route are therefore unsupported.

## Taking a work request

<!-- external-claim -->

The pinned forms schema accepts `{formId, data, files?}`. A malformed envelope is HTTP 400; a
structurally valid submission missing a required field is HTTP 200 with an outer success envelope
whose nested data is `{success:false, errors}`. The handler writes a submission only after field
validation succeeds, and honeypot mode avoids the Turnstile branch.
[Pinned forms schema](https://github.com/emdash-cms/emdash/blob/8975a8504bc9612f76834fbde4d1b02bd9698378/packages/plugins/forms/src/schemas.ts),
[submit handler](https://github.com/emdash-cms/emdash/blob/8975a8504bc9612f76834fbde4d1b02bd9698378/packages/plugins/forms/src/handlers/submit.ts),
and [route envelope](https://github.com/emdash-cms/emdash/blob/8975a8504bc9612f76834fbde4d1b02bd9698378/packages/core/src/plugins/routes.ts)
(Retrieved 2026-09-20.)

The packet’s former flat JSON body and expected 4xx are not valid for the pinned forms path. The
planner must create the form in the admin, submit the nested envelope, assert the handler’s
application-level rejection and unchanged storage, then verify a stored marker after replacement.
The fallback endpoint is prepared with HTTP 422 for incomplete input and an explicit
`EVAL_FORCE_STORAGE_FAILURE` fault, but neither was served or tested.

<!-- external-claim -->

Issues 3033 (Editor permission fallback) and 154 (custom form not shown on a post) were both open
at retrieval time. [Issue 3033](https://github.com/emdash-cms/emdash/issues/3033) and
[issue 154](https://github.com/emdash-cms/emdash/issues/154) (Retrieved 2026-09-20.) Their effect on
a single-administrator site remains unobserved.

## Backup and restore

<!-- external-claim -->

The upstream backup guide says JSON export is not a restore mechanism and recommends SQLite’s
online backup command for a serving database, with media backed up separately.
[Pinned backup guide](https://github.com/emdash-cms/emdash/blob/8975a8504bc9612f76834fbde4d1b02bd9698378/docs/src/content/docs/guides/backups.mdx)
(Retrieved 2026-09-20.)

The planner still must take the baseline backup before markers, take an online backup after
markers, restore database and uploads into a separate fresh volume, and prove entry, media, fresh
sign-in and a new write against the same image ID. No backup or restore occurred in preparation.

## Beta and breaking-change risk

<!-- external-claim -->

The current core release remained 0.38.0, published 2026-09-15; no later `emdash@` release appeared
in the retrieved release page. [GitHub releases API](https://api.github.com/repos/emdash-cms/emdash/releases?per_page=100)
(Retrieved 2026-09-20.) S6 therefore has a prepared desk-research count of zero releases and zero
Breaking entries after 0.38.0, but the operational update experiment remains outside this slice.

<!-- external-claim -->

Core migrations are forward-only, and the pinned CLI supports status, explicit apply and check
against the build’s `.emdash/migrations.json`; manual runtime mode performs no migration or status
query.
[Pinned migration guide](https://github.com/emdash-cms/emdash/blob/8975a8504bc9612f76834fbde4d1b02bd9698378/docs/src/content/docs/deployment/core-migrations.mdx)
(Retrieved 2026-09-20.) Determinism remains unproved until the planner uses a disposable database
with known pending migrations, observes manual mode leave it unchanged, then applies and checks the
matching manifest.

## Soft requirements

| Requirement               | Result                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1: runs under Bun        | **Yes.** Scaffold, install and build used Bun only. The same build also served under the Bun runtime: home page 200, admin setup page 200, a stored submission 201, in a 375 MB image at about 103 MiB. The recommended runtime remains Node, which is what upstream tests.                                                                                            |
| S2: memory                | About 81 MiB resident, idle, under Node.                                                                                                                                                                                                                                                                                                                               |
| S3: clean termination     | **No.** `docker stop` waited its full 30 seconds and killed the process (exit 137): the server does not act on SIGTERM as PID 1. The database still passed `integrity_check` afterwards. A deployment needs an init process or a signal handler, or every rollout waits out the grace period.                                                                          |
| S4: deterministic deploys | **Yes.** With `migrations.runtime: "manual"` a fresh database reported 0 applied and 76 pending; a request got 503 and left the state untouched; `migrate --check` exited 2; applying with a well-formed but wrong target fingerprint exited 4 and changed nothing; applying with the right fingerprint succeeded, after which `--check` exited 0 and the site served. |
| S5: image size            | 345 MB under Node, below the one gigabyte ceiling.                                                                                                                                                                                                                                                                                                                     |
| S6: update cost           | Desk research: zero core releases and zero Breaking entries after 0.38.0 as of 2026-09-20.                                                                                                                                                                                                                                                                             |

## When to reconsider

Revisit the verdict if the passkey setup or the first-party forms plugin fails when a person runs them, if a release after 0.38.0 carries a Breaking entry, or if the termination behaviour cannot be fixed with an init process. Research alternatives separately before recommending one.

## Evidence limits

The planner ran the container steps on 2026-09-20 on a workstation with Docker 29.7.2, from the executor's reviewed scripts. Every container, volume and image carried one run label and was recorded in a ledger; host ports were bound to the loopback address; the offline runs used no network at all; a fresh synthetic key was generated by the image's own `emdash secrets generate`, never printed, and removed afterwards. Cleanup removed only what the ledger named, and nothing with the run's label remained. Evidence files and the scripts are kept outside this repository.

Not observed, and why: the admin setup, authentication and an admin edit, media upload, and the first-party forms plugin, all of which need a person with a passkey in a browser; the sandboxed plugin runner, because the published plugin tooling refuses to scaffold without a real publisher identity and none was invented; behaviour on k3s. Content was created with the release's own `emdash seed` command rather than through the admin, which proves storage and serving but not the editing experience.

Three defects in the prepared files were found and fixed while running them, and none changes a result: the run identity contained upper-case letters, which Docker refuses in an image tag; the Dockerfile declared its second base-image argument after the first `FROM`, where a later `FROM` cannot see it; and one in-container check was first invoked without its argument and printed a false negative, rerun correctly straight away.

Two findings for whoever deploys this: the server ignores SIGTERM (see S3), and an error thrown inside an API route surfaced to the client as the site's 404 page rather than a 500, which will mislead monitoring that counts server errors.
