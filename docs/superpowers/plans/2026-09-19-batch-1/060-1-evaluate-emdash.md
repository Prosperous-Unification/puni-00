# 060.1 Evaluate EmDash for self-hosting

| Field                                      | Value                                                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Work item                                  | 060.1 in "PUNI platform plan"                                                                       |
| Size class                                 | RES                                                                                                 |
| top-model-high-effort-planning-tokens      | 3000000                                                                                             |
| mid-level-mid-effort-implementation-tokens | 1000000                                                                                             |
| top-model-high-effort-review-tokens        | 1000000                                                                                             |
| Implements                                 | The hosting target in the [infra evolution plan](../../../plans/2026-09-15-infra-evolution-plan.md) |
| Naming                                     | [Names and boundaries](../../../twilight-structure/names.md)                                        |
| Revision                                   | Revised 2026-09-19 after an adversarial review. Section 13 records every finding's disposition.     |

This packet has two parts. Sections 3 and 4 are the planning-stage desk research, already done,
with a source URL and the retrieval date for every external claim. Sections 6 to 11 are the
hands-on evaluation a medium-tier model executes to turn those findings into a decision.

## Dispatch amendment, 2026-09-20: two actors, one preparation checkpoint

These instructions are controlling and supersede any conflicting text below, including section
13's historical dispositions.

### Who does what

The executor owns refreshed desk research in sections 2–4; preparation portions of steps 1–4, 6,
9–11 and 15–17; every script, fixture, Dockerfile and configuration needed for the experiment;
step 18's initial note; and section 10's applicable repository checks. It does not start
application servers, access Docker, run browser flows or execute container experiments.

The planner owns daemon/browser preflight; all serving and runtime portions of steps 5 and 7–14;
step 16's migration experiment; container cleanup in step 19; and appending actual observations
and the final recommendation. The original numerical order is superseded by the experiment order
below.

Use `$WORK="$TMPDIR/emdash-handoff"` and keep proof output under `$TMPDIR/evidence`. Create the
note before experiments, with recommendation "Blocked — pending planner experiment." Runtime rows
remain unobserved until the planner supplies evidence. Preserve all preparation artifacts on
success, failure and stop.

The planner dispatches the committed amendment as slice `prepare`, with `--network --preserve
emdash-handoff`. Before execution, it verifies the preserved directory and reviews all scripts,
not merely the repository diff. Preparation completion is not experiment completion.

Research may contact `registry.npmjs.org`, `github.com`, `api.github.com`,
`raw.githubusercontent.com`, `codeload.github.com`, `release-assets.githubusercontent.com`,
`docs.emdashcms.com`, `docs.astro.build` and `bun.com`. Use unauthenticated public requests, not
authenticated `gh`. No npm, pnpm or yarn fallback is authorized. Keep `BUN_INSTALL_CACHE_DIR`
unset and obey the preamble's temporary-file and telemetry rules.

### Cleanup

Replace the supplied cleanup script. The executor writes and syntax-checks it but never installs
its trap or executes it.

The planner installs cleanup before creating resources. Runtime experiments use containers;
cleanup never signals host PIDs. Record each created resource's identifier and exact run label.
Before removal, verify both against the ledger; an ownership mismatch stops cleanup with an
error.

Remove containers, volumes and networks only from that ledger. Remove images only through
recorded run-specific tags, without force and with `--no-prune`; never remove image IDs, shared
base/helper images, or global caches. Never run a prune command. Do not use privileged
containers, host networking, host PID namespaces, Docker-socket mounts or arbitrary host bind
mounts. [Docker image removal semantics](https://docs.docker.com/reference/cli/docker/image/rm/)

Cleanup preserves `$WORK` and `$TMPDIR/evidence`, reports failures, and can run twice safely.
Disable traps before explicit final cleanup. Capture expected nonzero statuses explicitly rather
than allowing `set -e` to terminate before evidence is recorded. All host-published ports bind to
`127.0.0.1`; a container may listen on `0.0.0.0` internally.

### Experiment order and the immutable image

**Experiment order.** Finish the selected submission implementation and plugin configuration
before the final image build. Keep local plugins inside the declared build context. Supply a
`.dockerignore` excluding host dependencies, build output, databases, uploads, Git metadata and
credential files. Freeze the final dependency lockfile after all additions; record the scaffolder
version, template commit and source hashes. The planner resolves and records base/helper image
digests before building.

Build the final application once and record its full image ID. Use that ID, not its mutable tag,
for H1, H3, H4 and H5. Any application rebuild restarts those proofs with fresh volumes.

Initialize a fresh labelled volume through that image. After setup but before creating markers,
save the baseline SQLite backup needed by section 8 row 1. Then create the entry, uploaded media
and submission through this container. Save their identifiers, media checksum and exact database
readback queries.

Run egress, replacement and recovery against this image and its mounted database. Never use the
host development database as evidence. Query storage through labelled containers, not Docker's
host volume directory.

Prove replacement using a new container ID on the original volume; prove the negative using the
same image without that volume. Restore the online backup and uploads into a separate fresh
volume and verify content, media bytes, fresh sign-in and a new write. Exercise the pre-marker
backup negative separately, then restore the passing backup and rerun green. Give concurrent
instances distinct ports and measure each before stopping it.

### Proof contracts

Generated scripts must implement these proof contracts rather than copy the defective command
blocks:

- Use a bounded egress probe implemented with the image's Node runtime and propagate its exit
  status. Run the identical probe successfully with egress enabled, observe a connectivity
  failure under denial, then succeed after restoration. Missing executables, invalid commands,
  certificate failures and HTTP errors are not evidence of isolation. Under denial, all four H3
  legs must succeed; an unavailable admin edit leaves H3 blocked.
- Resolve plugin registration, authentication, form creation, submission envelopes and readback
  queries against pinned source. For the currently cited [forms
  schema](https://raw.githubusercontent.com/emdash-cms/emdash/main/packages/plugins/forms/src/schemas.ts),
  submit `{"formId":"…","data":{"name":"…","email":"…","request":"…"}}`. Assert the pinned
  handler's actual rejection contract and unchanged storage; do not infer acceptance from HTTP
  status alone. Use synthetic local credentials and a dedicated browser profile.
- Test the sandbox without its runner before enabling the runner. Keep this comparison separate
  from the final persistence artifact.
- For the selected submission path, include malformed/incomplete-input assertions and an injected
  storage failure proving no successful acknowledgement and no inserted record; restore and
  rerun the positive case.
- Add H2's missing-licence negative against a copied inventory. Save the failing audit, restore
  the inventory and rerun it. Perform the claim audit's negative on a scratch copy containing an
  unsupported claim.
- S4 requires a disposable database with pending migrations, unchanged migration state after a
  request in manual mode, then explicit migration and a successful migration check using the
  matching build manifest. Silence on an already-migrated database proves neither migration
  policy nor deterministic rebuilding. [Migration
  contract](https://docs.emdashcms.com/deployment/core-migrations/)

Save expected outcomes separately from observed outputs. Unsupported procedures produce a
PARTIAL preparation report; they must not be replaced with guessed APIs or fabricated
observations. No hard requirement passes without its observed positive, negative and restoration
evidence.

### Encryption claims are disputed

The historical encryption and key-loss claims in sections 3.2, 3.6 and 13 are disputed and must
not be copied as verified facts. Current documentation describes format validation without
stored-data encryption. Inspect the selected release's implementation and distinguish
documentation, source inspection and runtime observations. Until resolved, confidentiality and
key-loss behaviour remain unknown. [EmDash Node deployment
guide](https://docs.emdashcms.com/deployment/nodejs/)

Do not read existing credential files or extract values from `.env`. If the pinned configuration
needs an evaluation key, generate a fresh synthetic value using its verified procedure and pass
it without printing or preserving it in public evidence.

Correcting these explicitly disputed planning claims during desk research is permitted; record
the source and retrieval date. Runtime contradictions still follow the experiment's stop
conditions.

## 1. Goal and non-goals

**Goal.** Decide, with observed evidence, whether the Prosperous Unification website (a landing
page presenting the company as an AI-first software services company, plus a page that takes
work requests) can be built on EmDash and run on the self-managed k3s cluster with no required
Cloudflare service on the serving path, and record the decision as a research note whose verdict
is one of four: adopt, adopt with named conditions, reject with an alternative, or blocked.

**Non-goals.** No website content, design, domain or privacy notice; those are work item 060.4
and belong to Dany. No GitHub App connection, which is later work. No change to any application
or infrastructure file in this repository. No purchase, no sign-up, no publication, and nothing
installed into this repository.

## 2. Read first

| File or URL                                                | Why                                                                                                                                                        |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                                                | Rules R1 to R5. R5 governs section 8; R1 forbids claims without fresh output.                                                                              |
| `LLM_README.md`                                            | Repository index and routing, and the standing rule that h2puni is the build box and h1claw never builds.                                                  |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`      | The packet contract, the rules for every executor, and the "Standard blocks every packet uses" section, whose completion gate this packet reuses verbatim. |
| `docs/plans/2026-09-15-infra-evolution-plan.md`            | Sections 2.2, 6, 7 and 9: namespaces, PVCs, single-writer SQLite, deploy shape.                                                                            |
| `docs/twilight-structure/names.md`                         | Company and product names. Full names in anything public-facing.                                                                                           |
| `docs/research/2026-09-17-react-dependency-composition.md` | The house shape of a research note: dated scope, recommendation first, evidence with links, "When to reconsider", "Evidence limits".                       |
| `libs/wbs/adapters/store-sqlite/src/db.ts`                 | How this repository already opens a single-writer SQLite database. `apps/wbs/be-01/src/repository/db.ts` is only a re-export of it.                        |
| https://docs.emdashcms.com/deployment/nodejs/              | The Node.js deployment contract the evaluation follows.                                                                                                    |
| https://docs.emdashcms.com/deployment/plugin-sandbox/      | The sandbox runner off Cloudflare, and the Miniflare-versus-workerd split between dev and production.                                                      |
| https://docs.emdashcms.com/guides/backups/                 | What is and is not a restorable backup.                                                                                                                    |
| https://docs.emdashcms.com/plugins/registry/               | The hosted registry the sandbox runner enables, which section 6.2 H3 must reason about.                                                                    |

## 3. Verified facts, retrieved 2026-09-19

Every line here was retrieved on 2026-09-19. Lines marked **Inference** are the planner's
reading of the cited source, not a statement the source makes. Every one of these lines describes
a mutable source: step 1 pins the versions actually evaluated, and section 11 says which
contradictions are escalations and which are ordinary drift.

### 3.1 Project, licence, version and cadence

- The repository is `emdash-cms/emdash`, MIT licensed, default branch `main`, created
  2026-04-01, last pushed 2026-09-19, 12,421 stars, 326 open issues, not archived, homepage
  `https://emdashcms.com`, described as "EmDash is a full-stack TypeScript CMS based on Astro;
  the spiritual successor to WordPress". Source: GitHub REST API
  `https://api.github.com/repos/emdash-cms/emdash`. Star and issue counts move daily and are
  context, not facts the evaluation depends on.
- The README states EmDash is "a full-stack TypeScript CMS built on Astro and Cloudflare",
  supports "Cloudflare (D1 + R2 + Workers)" and "Node.js servers with SQLite", says plugins
  "run in sandboxed Worker isolates", and calls the project a beta preview. Source:
  `https://github.com/emdash-cms/emdash`.
- The current core release is `emdash@0.38.0`, published 2026-09-15. The core package has had
  45 releases between `emdash@0.1.0` (2026-04-01) and 0.38.0, roughly one minor release a week
  since June. Source: `https://api.github.com/repos/emdash-cms/emdash/releases` (paginated).
- Version policy: "A patch release, for example 0.35.0 to 0.35.1, carries bug fixes and small
  improvements. A minor release, for example 0.35 to 0.36, carries new features and any
  breaking change. A breaking change is marked **Breaking** in its release entry, and the entry
  states the action it requires from you." `emdash` and `@emdash-cms/cloudflare` share a
  version; plugin packages version independently and declare a minimum `emdash` version.
  Source: `https://docs.emdashcms.com/deployment/updating/`.
- The same page states that for versions below 1.0 a caret range admits patch releases only,
  so `^0.38.0` will not silently take 0.39.0. Source as above.
- `@emdash-cms/plugin-forms` is at 0.2.6 and is MIT, author Matt Kane. Confirmed in two places
  on 2026-09-19: the manifest at
  `https://raw.githubusercontent.com/emdash-cms/emdash/main/packages/plugins/forms/package.json`
  and the npm registry document `https://registry.npmjs.org/@emdash-cms/plugin-forms`, whose
  `dist-tags.latest` was `0.2.6`.

### 3.2 What "runs on any Node.js server with SQLite" concretely requires

- Runtime: "EmDash runs on Node.js 22.16 or later." The core package declares
  `"engines": { "node": ">=22.16" }` and peer dependencies `astro >=6.0.0-beta.0`,
  `@astrojs/react >=5.0.0-beta.0`, `react >=18`, `react-dom >=18`. Sources:
  `https://docs.emdashcms.com/deployment/nodejs/` and
  `https://raw.githubusercontent.com/emdash-cms/emdash/main/packages/core/package.json`.
- Adapter: `@astrojs/node` with `mode: "standalone"`; the built entry point is
  `./dist/server/entry.mjs` and is started with `node ./dist/server/entry.mjs`. The standalone
  entry "does not load `.env` automatically"; the documented workaround is
  `node --env-file=.env ./dist/server/entry.mjs`. Source:
  `https://docs.emdashcms.com/deployment/nodejs/`.
- The Node Starter template's own configuration, which step 1 scaffolds, is:

  ```js
  // starter/astro.config.mjs, retrieved 2026-09-19 from
  // https://raw.githubusercontent.com/emdash-cms/templates/main/starter/astro.config.mjs
  import node from '@astrojs/node';
  import react from '@astrojs/react';
  import { defineConfig } from 'astro/config';
  import emdash, { local } from 'emdash/astro';
  import { sqlite } from 'emdash/db';

  export default defineConfig({
    output: 'server',
    adapter: node({ mode: 'standalone' }),
    image: { layout: 'constrained', responsiveStyles: true },
    integrations: [
      react(),
      emdash({
        database: sqlite({ url: 'file:./data.db' }),
        storage: local({ directory: './uploads', baseUrl: '/_emdash/api/media/file' }),
      }),
    ],
    devToolbar: { enabled: false },
  });
  ```

  Two paths matter for containers: the database is `./data.db` at the project root and media go
  to `./uploads`, a sibling. Neither is under a single directory, so a container that mounts one
  volume at `/app/data` persists neither. Step 5 relocates both before any persistence claim.

- The Starter's `src/pages/index.astro` queries `getEmDashCollection("posts", { orderBy: {
published_at: "desc" } })` and links each entry as `/posts/${post.id}`, and `src/pages` also
  contains `[slug].astro`, `posts`, `category`, `tag` and `404.astro`. So a `posts` entry has a
  public URL without any new route being written. Source:
  `https://raw.githubusercontent.com/emdash-cms/templates/main/starter/src/pages/index.astro`
  and the GitHub contents listing of `starter/src/pages`.
- Collections: "Administrators manage collections under **Content Types**. Seed files can define
  the same collection settings when a site or environment is set up from configuration." Slugs
  are lowercase letters, numbers and underscores, at most 63 characters, chosen before creation
  and never renamed. Source: `https://docs.emdashcms.com/concepts/collections/`.
- Database: `sqlite({ url: "file:./data.db" })` from `emdash/db`, with `postgres()` and
  `libsql()` as the alternatives for several processes sharing one database. "SQLite requires a
  persistent filesystem. It does not work on platforms with ephemeral storage without
  additional configuration," and a SQLite deployment needs "one writable persistent volume and
  operational database backups". Source: `https://docs.emdashcms.com/deployment/database/`.
- SQLite driver: the core opens the database through `node:sqlite`'s `DatabaseSync`, not
  through `better-sqlite3`. `packages/core/src/db/node-sqlite-compat.ts` begins
  `import { DatabaseSync } from "node:sqlite";` and sets `PRAGMA busy_timeout = 5000`,
  `foreign_keys = ON`, `cache_size = -16000`, optional `journal_mode = WAL` and, when WAL is
  active, `synchronous = NORMAL`. A GitHub code search for `better-sqlite3` under
  `packages/core/src` returns zero hits; the matches in the repository are in tests, the
  `workerd` package and the repository's own root Dockerfile. Sources:
  `https://raw.githubusercontent.com/emdash-cms/emdash/main/packages/core/src/db/node-sqlite-compat.ts`
  and GitHub code search `repo:emdash-cms/emdash better-sqlite3 path:packages/core/src`.
- The Node.js deployment page notes that "Node.js 22 prints
  `ExperimentalWarning: SQLite is an experimental feature`... Node.js 24 does not print this
  warning", which corroborates that the built-in driver is the one in use. Source:
  `https://docs.emdashcms.com/deployment/nodejs/`.
- File storage: local storage for one server, or S3-compatible storage "when media must
  survive independently of the server disk". Source: `https://docs.emdashcms.com/deployment/nodejs/`.
- Migrations: "With the default `auto` migration mode, the first request applies pending core
  migrations. A fresh database also receives the embedded seed." An `emdash migrate` command
  applies deployment-managed migrations ahead of a deploy, with `auto`, `check` and `manual`
  runtime policies. Sources: `https://docs.emdashcms.com/deployment/nodejs/` and
  `https://docs.emdashcms.com/deployment/database/`.
- Plugin settings encryption, quoted verbatim from
  `https://raw.githubusercontent.com/emdash-cms/emdash/main/docs/src/content/docs/deployment/nodejs.mdx`
  and confirmed against the rendered page `https://docs.emdashcms.com/deployment/nodejs/`, both
  on 2026-09-19: "`EMDASH_ENCRYPTION_KEY` encrypts plugin settings declared as secrets. A
  malformed value produces an operator-facing startup message, and plugin secret-setting
  operations fail until the value is fixed." and "The value is operator-provided and is not
  stored in the database... Restoring the database without a referenced key leaves the
  corresponding settings unreadable." The adversarial review reported different wording on this
  page; see unknown 12 and section 13.
  [Superseded by the dispatch amendment: this is disputed, not verified. Current documentation
  describes format validation without stored-data encryption; do not copy this bullet as a
  verified fact until the pinned release's implementation is inspected.]
- Scheduler: "The built-in scheduler runs only while a Node.js process is running... Keep at
  least one Node.js process running continuously in production." Source as above.
- Containers: the upstream repository has a root `Dockerfile`, a `.dockerignore` and a
  `compose.yaml`. The root Dockerfile is `node:22-slim`, enables corepack with pnpm 10.28.0,
  installs `python3 make g++` for the `better-sqlite3` node-gyp fallback, builds the repository
  and bundles `templates/blog` into a standalone deployment, creates `data` and `uploads`,
  and sets `HOST=0.0.0.0` and `PORT=4321`. `compose.yaml` mounts named volumes at `/app/data`
  and `/app/uploads`. Sources: GitHub contents API for `Dockerfile` and `compose.yaml` on `main`.
- The Node deployment page carries a second, different Dockerfile for "your own EmDash site",
  based on `node:22-alpine`, ending `CMD ["node", "./dist/server/entry.mjs"]`, with an explicit
  note that it "is not interchangeable with the `Dockerfile` in the root of the EmDash
  repository, which builds the whole" project. It also documents
  `docker run -p 4321:4321 -v emdash-data:/app/data` and an equivalent Compose file, and states
  that "The seed file is read at build time and inlined into the bundle" while "Migrations run
  on the first request after a deploy". Source: the raw `nodejs.mdx` cited above.
  **Inference:** that documented `-v emdash-data:/app/data` line persists nothing on the Starter
  template as configured, because neither `data.db` nor `uploads` lives under `/app/data`. Step 5
  fixes the configuration rather than trusting the documented command.

### 3.3 Bun, Node, and what the repository rules actually say

- The EmDash documentation never presents Bun as a server runtime. The getting-started
  prerequisites say "Install Node.js 22.16 or later and npm", and the deployment page names
  Node.js only. Sources:
  `https://raw.githubusercontent.com/emdash-cms/emdash/main/docs/src/content/docs/getting-started.mdx`
  and `https://docs.emdashcms.com/deployment/nodejs/`.
- Bun is a supported package manager in the scaffolder: `packages/create-emdash/src/flags.ts`
  declares `export type PackageManager = "pnpm" | "npm" | "yarn" | "bun";` and the CLI accepts
  `--pm <pnpm | npm | yarn | bun>`; `packages/create-emdash/src/index.ts` detects a `bun` user
  agent and offers `bun` in the interactive prompt. Pull request
  `https://github.com/emdash-cms/emdash/pull/71`, "feat(create-emdash): add Bun runtime and
  database setup options", was merged 2026-04-24; its own Scope section says "This PR is
  intentionally limited to CLI/project scaffolding behavior in create-emdash". Sources: the two
  raw source files and `https://api.github.com/repos/emdash-cms/emdash/issues/71`.
  **Inference:** that pull request is evidence about install and run commands, not about the
  server runtime.
- The plugin CLI likewise "detects whether npm, pnpm, Yarn, or Bun launched it and generates
  matching commands". Source:
  `https://docs.emdashcms.com/plugins/creating-plugins/cli/`.
- Astro's Bun recipe carries this caution, verbatim: "Using Bun with Astro may reveal rough
  edges. Some integrations may not work as expected. Consult Bun's official documentation for
  working with Astro for details." It does not contain the words "not officially supported".
  The `@astrojs/node` adapter page mentions neither Bun nor Deno. Sources:
  `https://raw.githubusercontent.com/withastro/docs/main/src/content/docs/en/recipes/bun.mdx`
  and `https://docs.astro.build/en/guides/integrations-guide/node/`.
  **Inference:** a documented caution is weaker than an unsupported-configuration statement, so
  "Bun is unsupported for Astro SSR" is an inference, not a quotation, and the note must say so.
- Bun's Node compatibility page lists `node:sqlite` as "Fully implemented", with the caveat
  that "`backup()` runs synchronously and blocks the event loop for the duration of the copy";
  `node:worker_threads` and `node:child_process` are listed as partially implemented. The page
  states it covers Bun v1.4.2. Source: `https://bun.com/docs/runtime/nodejs-apis`.
- Observed locally on 2026-09-19 with the host's Bun 1.4.2, complete command:

  ```sh
  bun -e 'const {DatabaseSync}=require("node:sqlite"); const d=new DatabaseSync(":memory:"); d.exec("create table t(a)"); d.prepare("insert into t values (?)").run(1); console.log("bun node:sqlite OK", JSON.stringify(d.prepare("select * from t").all()));'
  ```

  It printed `bun node:sqlite OK [{"a":1}]` and exited 0. This proves the module exists under
  Bun; it proves nothing about EmDash.

- **What the repository rules say, without interpretation.** `AGENTS.md` says "Bun and Nx only.
  Never npm, pnpm, yarn or a second task runner", and the batch README repeats "Bun and Nx only.
  Never npm". Neither text grants an exemption of any kind, and this packet claims none. Two
  separate questions follow, and the packet keeps them apart:
  - _Which tool the evaluation itself uses._ The evaluation runs in a throwaway directory under
    the executor's temporary space, outside this repository and never committed, so it changes
    nothing this repository ships. Section 7 nevertheless uses Bun for scaffolding, dependency
    installation and scripts, both because it is the house tool and because it tests soft
    requirement S1 for free. No npm, pnpm or yarn fallback is authorized for the evaluation
    either. Where Bun cannot do something, that is a recorded finding for Dany, not a fallback:
    the executor records the exact command and the complete Bun error and stops that path rather
    than reaching for npm, pnpm or yarn.
  - _Whether a product in this repository may ship a container image containing a Node runtime._
    **Decided by Dany on 2026-09-20: yes.** "Running specialized software written for Node on Node
    is fine." The rule governs this repository's own toolchain, not the runtime a third-party
    system was written for. EmDash requires Node 22.16 or later (3.2), and that no longer blocks
    it. The research note records the decision with its date under its own heading, keeps the
    evidence, and no longer makes the recommendation conditional on it. This does not extend to
    the repository's own code or tooling: no npm, pnpm, yarn or second task runner here.

### 3.4 The plugin sandbox off Cloudflare

All quotations in this subsection are from
`https://raw.githubusercontent.com/emdash-cms/emdash/main/docs/src/content/docs/deployment/plugin-sandbox.mdx`,
retrieved 2026-09-19.

- Two plugin formats. "Native plugins under `plugins: []` run in the EmDash server process and
  do not gain sandbox isolation." Sandboxed plugins need a runner.
- On Cloudflare the runner is `sandbox()` from `@emdash-cms/cloudflare` and requires "Workers
  Paid plan, a `worker_loaders` binding, `PluginBridge` exported from the Worker entry point".
- On Node.js "the server starts [`workerd`](https://github.com/cloudflare/workerd), the
  open-source Workers runtime, as a child process and runs each plugin as a service inside it."
  The runner is the string `"@emdash-cms/sandbox-workerd/sandbox"`, and the requirement is "The
  `workerd` package", documented as `npm install @emdash-cms/sandbox-workerd workerd`.
- The `workerd` package "installs the binary for the current platform (Linux, macOS, and
  Windows on x64; Linux and macOS on arm64) through an optional dependency... In a multi-stage
  Docker build, run the install in a stage with the same platform as the runtime stage."
- **Development and production use different sandboxes.** "The runner declares Miniflare as an
  optional dependency... When `NODE_ENV` is `development`, which `astro dev` sets, the runner
  hands the plugins to Miniflare, which manages its own `workerd` process; the crash policy
  below does not apply... `astro preview` sets `NODE_ENV` to `production` and
  `node ./dist/server/entry.mjs` leaves it unset; both use `workerd`." Step 10 therefore tests
  the sandbox only against the built entry, never against the dev server.
- Operational behaviour on the built entry: workerd starts on the first request, EmDash waits up
  to 10 seconds for plugin services, output is prefixed `[emdash:workerd]`, plugin services
  listen on `127.0.0.1` with a Unix domain socket back to the server so "No inbound port needs
  to be opened", the child receives only `PATH`, `HOME`, `TMPDIR`, `TMP`, `TEMP`, `LANG`,
  `LC_ALL` unless `EMDASH_WORKERD_PASSTHROUGH_ENV` names more, restarts back off from 1 to 30
  seconds, and after "5 times in 60 seconds" the runner gives up until the server restarts.
- Enforced limits differ: Cloudflare enforces "CPU time, subrequests, wall time"; Node enforces
  "Wall time".
- Without `sandboxRunner`, "plugins under `sandboxed: []` are not loaded" and installing or
  updating a sandboxed plugin "fails with `SANDBOX_NOT_AVAILABLE`".
- Configuring `sandboxRunner` "selects the runner and enables the hosted registry catalog", and
  "EmDash uses the hosted registry at `https://registry.emdashcms.com` by default when the site
  has an enabled plugin sandbox"; the configuration reference can "select a different
  aggregator, set registry policy, or disable discovery". Sources: the sandbox page above and
  `https://docs.emdashcms.com/plugins/registry/`.
- A sandboxed plugin can be obtained without any registry account: `emdash-plugin init`
  scaffolds `emdash-plugin.jsonc`, `src/plugin.ts`, a package manifest, a tsconfig, a vitest
  config and "a workerd-backed test", and "The source starts with one route assigned to a
  `SandboxedPlugin`-typed constant and exported as default." Plugins are developed against a
  real site by installing the local directory as a file dependency and importing the default
  export into `emdash({ sandboxed: [...] })`. Source:
  `https://docs.emdashcms.com/plugins/creating-plugins/cli/`.
- Plugin routes are served at `/_emdash/api/plugins/<id>/<route>`. Source:
  `https://docs.emdashcms.com/plugins/overview/`.
- **Inference:** the sandbox does not depend on Cloudflare _the service_; it depends on
  `workerd`, Cloudflare's open-source runtime, shipped as an npm package with a platform binary.
  A site with no sandboxed plugins needs no runner and no registry at all.

### 3.5 Admin UI and authentication

Source: `https://docs.emdashcms.com/guides/authentication/`, plus the admin URL from
`https://raw.githubusercontent.com/emdash-cms/emdash/main/docs/src/content/docs/getting-started.mdx`.

- The admin panel is served by the site itself at `/_emdash/admin/`; a new site redirects to a
  setup wizard.
- Sessions use "Astro's session store"; the browser holds "Astro's opaque `astro-session`
  identifier" while "user and credential records remain in the EmDash database".
- Passkeys (WebAuthn) are the primary credential, up to 10 per user, and the last one cannot be
  removed. "Configure an email provider before using invites or magic-link login" — email is
  optional for passkey sign-in and required for invites and magic-link recovery.
- Five roles with numeric levels: Subscriber 10, Contributor 20, Author 30, Editor 40, Admin
  50, each inheriting the levels below.
- The fetched page did not mention TOTP or `EMDASH_ENCRYPTION_KEY`. Pull request
  `https://github.com/emdash-cms/emdash/pull/27` (closed 2026-04-01) mentions "TOTP 2FA" in its
  title, which is not confirmation that the shipped release's admin has it.

### 3.6 Content storage and backup

Source: `https://raw.githubusercontent.com/emdash-cms/emdash/main/docs/src/content/docs/guides/backups.mdx`.

- Content lives in the database, not in Git. The admin has a JSON backup ("Download backup",
  admin role) and optional daily automatic backups written to the configured storage under a
  `backups/` prefix, retained 1 to 30 archives, run by the scheduled maintenance tick.
- The JSON export is **not** a restore path: "EmDash has no admin action, API endpoint, or CLI
  command for JSON restore. Use D1 Time Travel, a raw D1 SQL dump, or a copy of the SQLite
  database as described above."
- For SQLite: "For an offline SQLite backup, stop every process that writes the database and
  copy the database file. For a consistent online backup, use SQLite's backup command:
  `sqlite3 emdash.db \".backup backup.db\"`." Media and the `EMDASH_ENCRYPTION_KEY` rotation
  list are backed up separately. Recovery is: "stop every server process, retain a copy of the
  damaged database, replace it with the verified backup, restore the runtime keys and any
  required media objects, and start the matching application version. Verify sign-in, public
  content, an encrypted plugin setting, an edit, and a media read before reopening traffic."
  [Superseded by the dispatch amendment: "an encrypted plugin setting" and "the runtime keys" are
  disputed, not verified; see the encryption note in 3.2 and section 13.]
- **Inference:** this is the same single-writer shape as WBS `be-01` in the infra plan
  (one replica, `Recreate`, `ReadWriteOncePod`, hourly `VACUUM INTO` pulls). The existing
  SQLite backup pipeline is the natural fit; `sqlite3 .backup` or `VACUUM INTO` replaces the
  plain file copy.

### 3.7 Taking a work request submission

- Plugins can "Serve API routes ... Expose endpoints under
  `/_emdash/api/plugins/<id>/<route>` for the admin UI or external integrations". Source:
  `https://docs.emdashcms.com/plugins/overview/`.
- A first-party forms plugin exists: `packages/plugins/forms` with `src/handlers/submit.ts`,
  `src/handlers/forms.ts`, `src/handlers/submissions.ts`, `src/handlers/cron.ts`,
  `src/admin.tsx` and `src/astro/Form.astro`; published as `@emdash-cms/plugin-forms` 0.2.6,
  MIT. Sources: GitHub code search `repo:emdash-cms/emdash forms path:packages` and the
  manifest and registry document cited in 3.1.
- **The forms plugin has a Cloudflare path that must be switched off explicitly.**
  `packages/plugins/forms/src/handlers/submit.ts` imports `verifyTurnstile` from
  `../turnstile.js`, branches on `settings.spamProtection === "turnstile"`, reads
  `input.data["cf-turnstile-response"]` and the stored `settings:turnstileSecretKey`, and throws
  `PluginRouteError.internal("Turnstile is not configured")` when the secret is missing; the
  alternative branch is `settings.spamProtection === "honeypot"`. The same file also fetches
  `settings.webhookUrl` when one is configured. Source:
  `https://raw.githubusercontent.com/emdash-cms/emdash/main/packages/plugins/forms/src/handlers/submit.ts`,
  297 lines, retrieved 2026-09-19. Cloudflare Turnstile is a Cloudflare service, so step 11
  configures spam protection to honeypot or none and records which, and leaves the webhook unset.
- Two open issues touch this path, with their exact URLs:
  `https://github.com/emdash-cms/emdash/issues/3033` (opened 2026-09-10): "Every route of
  @emdash-cms/plugin-forms is registered without a permission, so the core falls back to
  `plugins:manage` for all of them, including the read-only ones", so an Editor gets 403.
  `https://github.com/emdash-cms/emdash/issues/154` (opened 2026-04-03, still open): "After
  creating a custom form and inserting it into a post, the form does not appear on the published
  page."
- **Inference:** the site is an Astro application, so a plain Astro server endpoint in the
  site's own source is a fallback path for a work-request form that does not involve the forms
  plugin at all. Step 11b supplies that endpoint's source and exercises it.

### 3.8 Beta and breaking-change risk

- Self-described beta preview at 0.38.0, about one minor release a week, and an explicit policy
  that any minor may carry a breaking change (3.1).
- Core migrations run automatically and "have no operational undo step"; the update guide
  requires a restorable database backup and a media backup before every update. Source:
  `https://docs.emdashcms.com/deployment/updating/`.
- EmDash 0.38.0 peers on `astro >=6.0.0-beta.0`, and the 0.38.0 release entry for
  `@emdash-cms/cloudflare` requires "stable Astro 6.0.0 or later". Sources: the core package
  manifest and the releases API.
- **Inference:** the risk is not that a released version breaks by itself; a pinned digest keeps
  running. The risk is the cost of staying current: an update is a read of every release entry
  in the range, a backup, a rebuild and a verification pass, and a skipped update accumulates
  irreversible migrations.

### 3.9 Alternatives: unevaluated names only

No source was retrieved for any of these on 2026-09-19 and none was researched. They are
recorded so the note does not invent them later, and they are **not** a comparison: Keystatic,
Payload, Directus, and "plain Astro content collections plus one Elysia endpoint in this
repository". Per section 11, a reject verdict may not name an alternative until that alternative
has a bounded, sourced comparison of its own; otherwise the verdict is "reject, alternative
unevaluated" and choosing one is separate work.

## 4. Unknowns

Each line names how the executor resolves it. Nothing here may be stated as fact in the note
without an observation.

1. Whether the pinned EmDash release builds and serves under Bun (`bun run build`, then
   `bun ./dist/server/entry.mjs`). Step 9 observes it. Bun's `node:child_process` and
   `node:worker_threads` are only partially implemented, which is the likely failure surface.
2. Whether `bun install` resolves the scaffolded site's dependency tree, **including
   `@emdash-cms/sandbox-workerd` and the `workerd` platform binary**. Step 6 installs the
   sandbox dependencies before the Bun comparison in step 9 so that step 9 can answer this.
3. Whether the workerd sandbox starts under the built Node entry with production settings, and
   whether the scaffolded sandboxed plugin's route answers. Step 10 observes it.
4. Whether anything on the serving path reaches a host the operator does not control. Step 12
   is an egress-denied exercise with a control request that must fail; if the control does not
   fail, H3 is blocked, not passed.
5. Whether `sqlite3 .backup` taken while the server serves restores into a clean second
   instance. Step 13 observes it, with the deterministic negative in section 8, row 1.
6. Whether the work-request submission path works with Turnstile off, through
   `@emdash-cms/plugin-forms` or through the plain Astro endpoint of step 11b, and whether
   issues 3033 and 154 affect a single-admin site.
7. Whether the site image builds and whether both the database and an uploaded media file
   survive **container replacement** on a mounted volume. Steps 7 and 8 observe it.
8. Container memory, image size and termination behaviour, against the proposed thresholds in
   6.3. Steps 8 and 14 record them.
9. Which Astro 6 version and which `emdash` version a fresh scaffold installs today, and whether
   they are stable releases. Step 3 pins and records them.
10. Which licences the shipped components carry, within the inventory H2 declares in 6.2.
    Step 15 records them.
11. Whether a passkey can be created in the executor's environment at all, and what the admin
    needs behind Traefik with a real hostname. Step 4 records the loopback case; the
    behind-ingress case is explicitly out of scope and stays unknown.
12. Whether the plugin-settings encryption text in 3.2 is what the shipped release implements.
    The adversarial review reported that the same page says the variable only validates format
    while plugin secrets stay plaintext; two fetches on 2026-09-19, raw and rendered, did not
    show that text (section 13, Important 3). Step 3 records the docs shipped with the pinned
    release, and the note must not assert confidentiality of stored plugin secrets on the
    strength of the documentation alone.
13. Whether the Starter template's seed defines collections that make step 5's relocation or
    step 6's content work differently than expected. Step 3 records the seed directory's
    contents.

## 5. File plan

| File                                              | Change                                                                                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/research/2026-09-DD-emdash-self-hosting.md` | New. The only repository file this task creates. The executor fills in `DD` with the day the note is written.                                          |
| `$WORK` (a unique directory in temporary space)   | Throwaway working tree outside the repository, named in step 1. Never committed, never referenced by a repository file, removed by the cleanup script. |

Nothing else in the repository is created, edited or deleted: no manifest, no lockfile, no
deployment manifest, no plan file. The executor never stages, reverts, cleans or commits another
lane's files; step 2 captures the pre-existing working-tree state so that "only my file was
added" can be shown against that baseline rather than against an imagined clean tree.

## 6. Interfaces: the note's outline and the decision criteria

### 6.1 Outline of `docs/research/2026-09-DD-emdash-self-hosting.md`

The note follows the house shape of `docs/research/2026-09-17-react-dependency-composition.md`:
recommendation first, every external claim carrying its link, evidence limits at the end.
Headings, in order:

```markdown
# EmDash for the Prosperous Unification website

Research date: 2026-09-DD. Scope: <one sentence naming the pinned EmDash and Astro versions,
the k3s target, and the landing page plus work-request page>. Evaluated release: <emdash
version, template revision, image digest>.

## Recommendation

<Adopt | Adopt with conditions | Reject, alternative unevaluated | Blocked. One paragraph. If
conditions, a numbered list, each testable. If reject, the one hard requirement that failed.
If blocked, what could not be observed and what would unblock it. No adoption verdict may be
given while any hard requirement is blocked.>

## The decision this recommendation rests on

<A Node runtime inside the website's container image. The repository rule is "Bun and Nx only,
never npm, pnpm, yarn or a second task runner". EmDash requires Node 22.16 or later. Dany decided
on 2026-09-20 that running specialized software written for Node on Node is fine: the rule
governs this repository's own toolchain. Record the decision, its date and its scope (it does not
license npm or a second task runner for code written here), and keep the evidence.>

## Hard requirements

<The table of section 6.2, each row with its observed verdict, the command that produced it,
and the observed negative that showed the check can fail.>

## What self-hosting costs

<Adapter, driver, the relocated data paths, volume, environment, image, and what has to be
operated: the long-running scheduler process, migration mode, the encryption key.>

## Node and Bun

<What was observed under each runtime, and which package-manager commands were used where and
why. No npm, pnpm or yarn fallback is authorized; where Bun could not do something, name that
as a finding for Dany, not a fallback.>

## The plugin sandbox off Cloudflare

<What workerd does here, what was observed against the built entry, and whether the site needs
the sandbox at all.>

## Taking a work request

<Which path stored a submission, with spam protection set away from Turnstile, and the state of
issues 3033 and 154.>

## Backup and restore

<The restore into a clean instance: entry, media, fresh sign-in, new write; the deterministic
negative; and how this maps onto the existing SQLite pull pipeline.>

## Beta and breaking-change risk

<Cadence, the minor-may-break policy, the irreversibility of core migrations, and the update
routine this implies.>

## Soft requirements

<The table of section 6.3, each with its measurement and the proposed threshold it was read
against.>

## When to reconsider

<The conditions that would change the verdict.>

## Evidence limits

<Everything not observed, everything observed once, every surviving unknown from section 4,
every injected fault and the failure it produced, and the environment the observations came
from, sanitized per section 11.>
```

### 6.2 Hard requirements: every one must pass, or the verdict is reject or blocked

| #   | Requirement                                             | Passes when                                                                                                                                                                                                                                                                                                                                                      | Proven by   |
| --- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| H1  | Self-hostable in a container with one persistent volume | With the database and uploads relocated under the volume mount point, a unique entry and a unique uploaded media file created in one container are both readable after that container is **destroyed** and a new one is created from the same image on the same volume.                                                                                          | Steps 7, 8  |
| H2  | Permissive licence across the declared inventory        | The upstream repository LICENSE is MIT, and every direct dependency of the scaffolded site plus `workerd` and `@emdash-cms/sandbox-workerd` declares a permissive licence. Transitive dependencies and base-image contents are outside this inventory and are disclosed as unverified in the note.                                                               | Step 15     |
| H3  | No required Cloudflare service on the serving path      | Under enforced egress denial, with a control request that is observed to fail, a cold start, a public page read, an admin content edit and a work-request submission all succeed. Admin-initiated registry discovery is not the serving path and is reported separately; if it cannot be disabled and the site will not serve without it, that is an H3 failure. | Step 12     |
| H4  | Can take a work request submission                      | A submission posted to a public path is stored and read back by a unique marker after the serving container is replaced, with spam protection configured away from Turnstile.                                                                                                                                                                                    | Steps 11, 8 |
| H5  | Can be backed up and restored                           | A backup taken while the server is serving restores into a **separate clean instance** of the same version where the unique entry, the unique media file, a fresh sign-in and a new write all succeed.                                                                                                                                                           | Step 13     |

Two rules govern these rows. First, a row may be marked passed only after its paired negative in
section 8 has been observed to fail. Second, a row whose evidence is inconclusive is **blocked**,
never passed: R5 forbids treating unknown as success.

H3 has one stated carve-out: the `workerd` binary is Cloudflare's open-source runtime obtained as
an npm package and executed locally. Running it is not a dependency on a Cloudflare service. A
violation of H3 is a connection that the serving path _requires_ to a host the operator does not
control; `https://registry.emdashcms.com` is reached by admin-initiated discovery, which the
configuration reference can disable, so it is recorded and reasoned about separately rather than
silently failing or silently passing the row.

### 6.3 Soft requirements: each is a named condition, not a veto

| #   | Requirement                  | Measured as                                                                                                                                                  | Proposed threshold                                                                                                                                                                         |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S1  | Runs under Bun               | Step 9: `bun install`, `bun run build`, `bun ./dist/server/entry.mjs`, plus whether the sandbox dependencies install under Bun.                              | No threshold. A failure is a condition, not a reject, because the image ships its own runtime.                                                                                             |
| S2  | Memory fits a website budget | Step 14: container memory from `docker stats --no-stream` on the run's own container, and separately the server process RSS from `ps` inside that container. | 1.0 GB, **proposed by this packet**. The infra plan's 1.0 GB row is "Novel prod or staging"; no website budget exists yet, so this number is a proposal for Dany, not a quoted allocation. |
| S3  | Clean termination            | Step 14: `docker stop -t 30`, then the exit code and `OOMKilled` from `docker inspect`, then a SQLite integrity check on the volume.                         | Exit before the timeout with a non-137 code, and an `ok` integrity check. Elapsed time alone proves nothing, because Docker sends SIGKILL after the timeout.                               |
| S4  | Deterministic deploys        | Step 16: set migration mode to `manual`, run the documented migrate command, start the server, and confirm the first request applies no migration.           | The first request logs no migration. If migration mode cannot be forced, record it as a condition.                                                                                         |
| S5  | Image size                   | Step 8: `docker image ls` for the run's own tag.                                                                                                             | 1.0 GB cumulative image size, proposed, not compressed transfer size. Larger is a condition about pull time, not a reject.                                                                 |
| S6  | Update cost                  | Step 17: count the `emdash@` release entries between the pinned version and the current one, and how many are marked Breaking.                               | More than two Breaking entries per month is a condition requiring a named update owner.                                                                                                    |

## 7. Steps

**Hard rules for this section.** Every command runs in an explicitly named directory. Every
command has an expected result and a pass or fail criterion. Nothing binds to a public
interface. Every resource carries this run's identifier and cleanup removes only those. The
executor never invents content: where a value must come from the environment, the step says
which command reads it.

### 7.0 Run identity, isolation and cleanup, installed first

- [ ] **Step 1. Create the run identity and the cleanup script before anything else exists.**
      Run, in a shell that stays open for the whole evaluation:

  ```sh
  set -euo pipefail
  export RUN_ID="emdash-eval-$(date +%Y%m%d-%H%M%S)-$$"
  export WORK="$(mktemp -d "${TMPDIR:-/tmp}/${RUN_ID}.XXXXXX")"
  export PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
  printf 'RUN_ID=%s\nWORK=%s\nPORT=%s\n' "$RUN_ID" "$WORK" "$PORT" | tee "$WORK/run-identity.txt"
  cat > "$WORK/cleanup.sh" <<'SH'
  #!/bin/sh
  # Removes only resources labelled with this run's RUN_ID, plus this run's directory.
  set -u
  : "${RUN_ID:?RUN_ID must be set}"
  : "${WORK:?WORK must be set}"
  if [ -f "$WORK/server.pid" ]; then kill "$(cat "$WORK/server.pid")" 2>/dev/null || true; fi
  if [ -f "$WORK/server-bun.pid" ]; then kill "$(cat "$WORK/server-bun.pid")" 2>/dev/null || true; fi
  if [ -f "$WORK/server-restore.pid" ]; then kill "$(cat "$WORK/server-restore.pid")" 2>/dev/null || true; fi
  docker ps -aq --filter "label=puni.eval=$RUN_ID" | xargs -r docker rm -f
  docker volume ls -q --filter "label=puni.eval=$RUN_ID" | xargs -r docker volume rm
  docker network ls -q --filter "label=puni.eval=$RUN_ID" | xargs -r docker network rm
  docker image ls -q --filter "label=puni.eval=$RUN_ID" | xargs -r docker image rm -f
  # [Superseded by the dispatch amendment: cleanup removes images only by recorded run-specific
  # tag, without force and with --no-prune, never by image ID.]
  rm -rf -- "$WORK"
  SH
  chmod +x "$WORK/cleanup.sh"
  trap '"$WORK/cleanup.sh"' EXIT INT TERM
  ```

  Expected: three variables printed, `$WORK` exists, `$WORK/cleanup.sh` is executable.
  Pass: `test -x "$WORK/cleanup.sh" && test -d "$WORK"` exits 0.
  Fail: if `mktemp` or `python3` is unavailable, stop and report; do not fall back to a
  fixed directory name or a fixed port.
  Every label, volume, network, image tag and container name below is derived from
  `$RUN_ID`, so no command in this packet can touch another run's or another project's
  resources. Cleanup is installed here, before the first resource exists, and the `trap`
  makes it run on success, on failure and on every stop condition in section 11.

- [ ] **Step 2. Preflight the host and the tools.** Run and record each:

  ```sh
  hostname
  node --version
  bun --version
  docker info --format '{{.ServerVersion}} {{.OperatingSystem}}'
  sqlite3 --version
  curl --version | head -1
  python3 --version
  git -C <repository path> status --short | tee "$WORK/git-baseline.txt"
  ```

  Expected and pass criteria, all of which must hold before step 3:
  - `hostname` is not `h1claw` and not a shared build or production host. `LLM_README.md`
    forbids building on h1claw and names h2puni as the build and production box; this
    evaluation builds container images and must not run on either. If the host is one of
    them, stop and report. This is the first stop condition, not a warning.
  - `node --version` reports v22.16.0 or later. Otherwise stop and report; do not install or
    change a Node version on a shared host.
  - `docker info` succeeds, which proves daemon access; `docker --version` alone does not.
    If it fails, stop and report H1, S2, S3 and S5 as blocked.
    [Superseded by the dispatch amendment: the executor does not access Docker at all; this
    preflight, including `docker info`, belongs to the planner before the container steps.]
  - `sqlite3`, `curl` and `python3` are present. A missing tool blocks the steps that use it
    and is reported, per `AGENTS.md`.
  - `git status --short` output is saved as the baseline. The working tree already carries
    other lanes' modified files; that is expected and must be preserved untouched.
    Also record, in one line, whether this environment can drive a browser and create a WebAuthn
    passkey. If it cannot, step 4 uses whatever non-passkey credential the wizard offers and the
    note records that the passkey flow was not exercised.

### 7.1 Install and pin

- [ ] **Step 3. Scaffold with Bun and pin every version.**

  ```sh
  cd "$WORK"
  bunx create-emdash@latest site --template node:starter --pm bun --yes 2>&1 | tee "$WORK/scaffold.log"
  ```

  Expected: a `site` directory with `astro.config.mjs`, `package.json`, `src`, `seed`, and a
  gitignored `.env` holding a generated `EMDASH_ENCRYPTION_KEY`.
  Pass: `test -f "$WORK/site/astro.config.mjs" && test -f "$WORK/site/.env"` exits 0.
  Fail: if `bunx create-emdash@latest` fails, record the complete error, then retry once. If it
  fails again, record in `$WORK/findings.md`, under the heading "Bun scaffold failed", the exact
  command and the complete error, and stop this step. No npm, pnpm or yarn fallback is
  authorized for the evaluation, per section 3.3 and the dispatch amendment; this is a recorded
  finding for Dany, not a fallback.
  Then pin and record, all into `$WORK/pinned-versions.txt`:

  ```sh
  cd "$WORK/site"
  node -p "require('./node_modules/emdash/package.json').version"
  node -p "require('./node_modules/astro/package.json').version"
  node -p "require('./node_modules/@astrojs/node/package.json').version"
  ls seed
  cp -a "$WORK/site/bun.lock" "$WORK/pinned-lockfile" 2>/dev/null || cp -a "$WORK/site/package-lock.json" "$WORK/pinned-lockfile"
  ```

  Expected: three version strings and the seed listing.
  Pass: the `emdash` version is recorded. Every factual claim in the note is bound to this
  version, not to 0.38.0, unless they are the same.

### 7.2 Relocate the data paths, then run

- [ ] **Step 4. Relocate the database and uploads under one directory, before the first start.**
      The Starter writes `./data.db` and `./uploads` (3.2). Edit `$WORK/site/astro.config.mjs` so
      both live under `./data`:

  ```js
  emdash({
    database: sqlite({ url: 'file:./data/data.db' }),
    storage: local({ directory: './data/uploads', baseUrl: '/_emdash/api/media/file' }),
  });
  ```

  Then `mkdir -p "$WORK/site/data"`.
  Expected: `grep -n 'file:./data/data.db' "$WORK/site/astro.config.mjs"` and
  `grep -n './data/uploads' "$WORK/site/astro.config.mjs"` each print one line.
  Pass: both greps exit 0. Fail: if the installed version rejects either option, record the
  error and stop; H1 cannot be proven with the paths split across two mounts, and inventing a
  third layout is not this task's job.

- [ ] **Step 5. Start the development server on loopback only, with a readiness wait.**

  ```sh
  cd "$WORK/site"
  ( bun run dev --port "$PORT" > "$WORK/dev.log" 2>&1 & echo $! > "$WORK/server.pid" )
  for i in $(seq 1 60); do
    code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/" || true)
    [ "$code" = "200" ] && break
    sleep 1
  done
  printf 'readiness code=%s after %ss\n' "$code" "$i" | tee -a "$WORK/findings.md"
  ```

  Expected: `readiness code=200` within 60 seconds.
  Pass: 200. Fail: record the tail of `$WORK/dev.log` and stop.
  Never pass `--host`: Astro's dev server binds loopback by default and this evaluation must
  not expose a port on a shared workstation. Record the first-request log lines, including any
  migration, seed or `ExperimentalWarning` message.

- [ ] **Step 6. Install the sandbox dependencies now, before any Bun comparison.**

  ```sh
  cd "$WORK/site"
  bun add @emdash-cms/sandbox-workerd workerd 2>&1 | tee "$WORK/sandbox-install.log"
  ls -l node_modules/workerd/bin 2>&1 | tee -a "$WORK/sandbox-install.log"
  ```

  Expected: both packages install and a platform binary exists under the `workerd` package.
  Pass: the binary path is printed and is executable. Fail: record the exact error. This is
  the answer to unknown 2; installing here rather than after step 9 is deliberate, so the Bun
  copy carries the same dependency set.

### 7.3 Content, with a failing assertion first

- [ ] **Step 7. Create content and media, asserting absence first.** The Starter already ships a
      `posts` collection queried by `src/pages/index.astro` and routed at `/posts/<id>`, so no new
      collection is needed for the persistence proof. Define two markers once:

  ```sh
  export ENTRY_MARKER="PUNI-EVAL-ENTRY-$RUN_ID"
  export MEDIA_MARKER="puni-eval-media-$RUN_ID.txt"
  printf 'ENTRY_MARKER=%s\nMEDIA_MARKER=%s\n' "$ENTRY_MARKER" "$MEDIA_MARKER" >> "$WORK/run-identity.txt"
  ```

  7a. **Failing assertion first.** `curl -s "http://127.0.0.1:$PORT/" | grep -c "$ENTRY_MARKER"`
  Expected: `0`, and the grep exits 1. Pass: the marker is absent. If it is present before
  creation, the environment is dirty; stop and report.
  7b. Complete the setup wizard at `http://127.0.0.1:$PORT/_emdash/admin/` and create the
  administrator credential. Record which credential types were offered, whether a passkey
  could be created on loopback over plain HTTP, and whether an email provider was demanded.
  7c. In the admin, create and publish one `posts` entry whose title is exactly
  `$ENTRY_MARKER`, and upload one small file named `$MEDIA_MARKER` through the media library,
  attaching it to that entry.
  7d. **Passing assertion.** Re-run 7a's command.
  Expected: a count of 1 or more.
  Pass: `curl -s "http://127.0.0.1:$PORT/" | grep -q "$ENTRY_MARKER"` exits 0, and the entry's
  `/posts/<id>` URL returns 200. Record that URL in `$WORK/findings.md`.
  7e. Record where the files landed: `ls -la "$WORK/site/data" "$WORK/site/data/uploads"`,
  then `sqlite3 "$WORK/site/data/data.db" "PRAGMA journal_mode; PRAGMA foreign_keys;"` and
  `sqlite3 "$WORK/site/data/data.db" ".tables"`.
  Expected: exactly one `data.db`, the uploaded file under `data/uploads`, and EmDash tables.
  Pass: the marker file is found under `data/uploads` and the table list is non-empty.
  7f. Stop the dev server and wait for the port to free:
  `kill "$(cat "$WORK/server.pid")" && rm -f "$WORK/server.pid"`, then poll until
  `curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/"` fails.
  Pass: the port is free before any later step reuses it. No two steps ever hold `$PORT` at
  once.

### 7.4 The container, where persistence is actually proven

- [ ] **Step 8. Build the site image with a runtime chosen by evidence.** Write
      `$WORK/site/Dockerfile`. The build stage uses Bun if step 9's build succeeded, and Node
      otherwise; the runtime stage is Node either way, because EmDash requires Node (3.2). Run
      step 9 first if that ordering is convenient; otherwise start with the Node build stage and
      record why.

  ```dockerfile
  # Build stage. Swap oven/bun for node:22-slim (and bun for npm) if step 9 shows the Bun
  # build fails; record which one was used.
  FROM oven/bun:1.4.2 AS build
  WORKDIR /app
  COPY package.json bun.lock* package-lock.json* ./
  RUN bun install --frozen-lockfile
  COPY . .
  RUN bun run build

  FROM node:22-slim
  WORKDIR /app
  COPY --from=build /app/node_modules ./node_modules
  COPY --from=build /app/dist ./dist
  COPY --from=build /app/package.json ./package.json
  RUN mkdir -p /app/data/uploads
  ENV HOST=127.0.0.1
  ENV PORT=4321
  EXPOSE 4321
  CMD ["node", "./dist/server/entry.mjs"]
  ```

  `HOST=127.0.0.1` inside the container plus a loopback-bound publish on the host is
  deliberate; if the server then refuses connections through the published port, set
  `HOST=0.0.0.0` **and keep the host-side publish bound to `127.0.0.1`**, which is what
  actually controls exposure. Record which was needed.

  ```sh
  cd "$WORK/site"
  docker build --label "puni.eval=$RUN_ID" -t "$RUN_ID:site" . 2>&1 | tee "$WORK/build.log"
  docker image ls "$RUN_ID:site" --format '{{.Repository}}:{{.Tag}} {{.Size}}' | tee -a "$WORK/findings.md"
  docker volume create --label "puni.eval=$RUN_ID" "$RUN_ID-data"
  docker run -d --name "$RUN_ID-c1" --label "puni.eval=$RUN_ID" \
    -p "127.0.0.1:$PORT:4321" -v "$RUN_ID-data:/app/data" \
    -e EMDASH_ENCRYPTION_KEY="$(grep EMDASH_ENCRYPTION_KEY "$WORK/site/.env" | cut -d= -f2-)" \
    "$RUN_ID:site"
  ```

  Expected: the build succeeds, the image is tagged and labelled, and one container runs.
  Pass: `docker ps --filter "label=puni.eval=$RUN_ID" --format '{{.Names}}'` prints
  `$RUN_ID-c1`, and `curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/"`
  returns 200 within a 60-second readiness loop like step 5's.
  Fail: record the build log tail and stop; H1, S2, S3 and S5 are blocked.
  Record S5 from the `docker image ls` line.

- [ ] **Step 9. The Bun runtime comparison, on a copy that already has the sandbox packages.**

  ```sh
  cp -a "$WORK/site" "$WORK/site-bun"
  cd "$WORK/site-bun"
  rm -rf node_modules
  bun install 2>&1 | tee "$WORK/bun-install.log"
  bun run build 2>&1 | tee "$WORK/bun-build.log"
  BUN_PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
  ( PORT="$BUN_PORT" HOST=127.0.0.1 bun ./dist/server/entry.mjs > "$WORK/bun-serve.log" 2>&1 & echo $! > "$WORK/server-bun.pid" )
  ```

  Then the same 60-second readiness loop against `http://127.0.0.1:$BUN_PORT/`, a fetch of
  `/_emdash/admin/`, and one content edit through the admin.
  Expected: either all three succeed, or a recorded first failure per command.
  Pass S1: both URLs return 200 under Bun and an admin edit persists.
  Fail S1: record the exact error and the module or binary that caused it. A failure here sets
  the image's build stage to Node in step 8 and is a condition in the note, not a reject.
  Also record whether `bun install` resolved `@emdash-cms/sandbox-workerd` and the `workerd`
  binary: that is unknown 2's answer.
  Always stop this server afterwards: `kill "$(cat "$WORK/server-bun.pid")"` and free
  `$BUN_PORT`.

- [ ] **Step 10. The plugin sandbox, against the built entry only.** The dev server uses
      Miniflare, so it cannot answer this (3.4).
      10a. Scaffold a sandboxed plugin without any registry account:

  ```sh
  cd "$WORK"
  bunx @emdash-cms/plugin-cli init eval-plugin --yes 2>&1 | tee "$WORK/plugin-init.log"
  cat "$WORK/eval-plugin/src/plugin.ts"
  ```

  Read the scaffolded `src/plugin.ts` and record, verbatim, the plugin id and the one route it
  declares together with the response that route returns. These are generated values, not
  values to invent; every assertion below uses what this file actually says.
  10b. Build the plugin and install it into the site as a file dependency, then register its
  default export under `sandboxed: []` and set
  `sandboxRunner: "@emdash-cms/sandbox-workerd/sandbox"` in `$WORK/site/astro.config.mjs`.
  10c. **Failing assertion first**: with `sandboxRunner` still absent, build and start the
  site's built entry and request the plugin route.
  Expected: the plugin is not loaded; the route does not return the recorded response, and the
  logs or the install attempt mention `SANDBOX_NOT_AVAILABLE`.
  Pass: the route does **not** answer. This is section 8's sandbox negative.
  10d. Add `sandboxRunner`, rebuild, start `node ./dist/server/entry.mjs` on a fresh loopback
  port, and request `/_emdash/api/plugins/<id>/<route>` with the id and route from 10a.
  Expected: the exact response recorded in 10a, plus `[emdash:workerd]` lines in the server
  log and a `workerd` child process visible as
  `docker exec`-free local `pgrep -P "$(cat "$WORK/server.pid")" -a workerd`.
  Pass: the response matches and the child process exists, with no Cloudflare account, token
  or binding present anywhere in the environment.
  Fail: record the error and mark the sandbox unproven; this fails no hard requirement,
  because a site with no sandboxed plugins needs no runner.

### 7.5 The work request, egress denial, and restore

- [ ] **Step 11. The work-request submission path, with Turnstile explicitly off.**
      11a. Forms plugin. `bun add @emdash-cms/plugin-forms` in `$WORK/site`, register it as a
      native plugin under `plugins: []`, rebuild, and start the built entry. In the admin, create
      a form whose fields are exactly `name` (text, required), `email` (email, required) and
      `request` (long text, required), and set its spam protection to honeypot or none — never
      Turnstile, which is a Cloudflare service (3.7) — and leave the webhook URL empty. Record the
      form's public path and the submit route the admin shows.
      **Failing assertion first**: post a body missing `request` and record the response.
      Expected: a 4xx refusal, not a success.
      Then post a complete body whose `name` is exactly `$ENTRY_MARKER`:

  ```sh
  curl -s -o "$WORK/submit-response.txt" -w '%{http_code}\n' \
    -X POST "http://127.0.0.1:$PORT/<the submit path recorded above>" \
    -H 'content-type: application/json' \
    -d "{\"name\":\"$ENTRY_MARKER\",\"email\":\"eval@example.invalid\",\"request\":\"Evaluation submission for $RUN_ID\"}"
  ```

  [Superseded by the dispatch amendment: this flat body does not match the pinned forms schema.
  Submit `{"formId":"…","data":{"name":"…","email":"…","request":"…"}}` instead, and assert the
  pinned handler's actual rejection contract rather than inferring acceptance from HTTP status.]

  Expected: a 2xx status and the submission listed under the form's submissions in the admin.
  Pass H4 candidate: the marker is visible in the admin list and in
  `sqlite3 "$WORK/site/data/data.db" ".tables"`-discoverable storage; record the exact table
  and the query that found it.
  Also record whether the form rendered on a published page (issue 154) and, if a second
  non-admin user can be created cheaply, what that user sees (issue 3033).
  11b. Fallback endpoint, used if 11a cannot store a submission. Create
  `$WORK/site/src/pages/api/work-request.ts` with exactly this content, which writes into a
  table of its own in the same database on the same volume:

  ```ts
  import type { APIRoute } from 'astro';
  import { DatabaseSync } from 'node:sqlite';

  const DATABASE_PATH = process.env['EVAL_DB_PATH'] ?? './data/data.db';

  export const POST: APIRoute = async ({ request }) => {
    const submission = await request.json();
    const name = typeof submission?.name === 'string' ? submission.name : null;
    const email = typeof submission?.email === 'string' ? submission.email : null;
    const body = typeof submission?.request === 'string' ? submission.request : null;
    if (name === null || email === null || body === null) {
      return new Response(JSON.stringify({ error: 'name, email and request are required' }), {
        status: 422,
        headers: { 'content-type': 'application/json' },
      });
    }
    const database = new DatabaseSync(DATABASE_PATH);
    try {
      database.exec(
        'CREATE TABLE IF NOT EXISTS eval_work_requests (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL)',
      );
      database
        .prepare(
          'INSERT INTO eval_work_requests (name, email, body, created_at) VALUES (?, ?, ?, ?)',
        )
        .run(name, email, body, new Date().toISOString());
    } finally {
      database.close();
    }
    return new Response(JSON.stringify({ stored: true }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  };
  ```

  **Failing assertion first**: post `{"name":"x"}`.
  Expected: HTTP 422 and no row written.
  Then post the complete body with `name` set to `$ENTRY_MARKER`.
  Expected: HTTP 201, and
  `sqlite3 "$WORK/site/data/data.db" "select count(*) from eval_work_requests where name='$ENTRY_MARKER';"`
  prints 1.
  Pass H4 candidate: the count is 1.
  This endpoint opens the same SQLite file the server already holds open; if it fails with a
  lock error, record that verbatim, because it is a real finding about single-writer SQLite
  under one process, not a defect in the step.
  H4 is finally proven in step 8's container-replacement readback, not here.

- [ ] **Step 12. Cloudflare independence, under enforced egress denial with a control.**

  ```sh
  docker network create --internal --label "puni.eval=$RUN_ID" "$RUN_ID-net"
  docker rm -f "$RUN_ID-c1" 2>/dev/null || true
  docker run -d --name "$RUN_ID-c2" --label "puni.eval=$RUN_ID" \
    --network "$RUN_ID-net" -v "$RUN_ID-data:/app/data" \
    -e EMDASH_ENCRYPTION_KEY="$(grep EMDASH_ENCRYPTION_KEY "$WORK/site/.env" | cut -d= -f2-)" \
    "$RUN_ID:site"
  ```

  12a. **The control, which must fail.**
  `docker exec "$RUN_ID-c2" sh -c 'curl -sS -m 5 https://registry.npmjs.org >/dev/null; echo exit=$?'`
  Expected: a non-zero exit, that is, a DNS or connect failure.
  Pass: the control fails. **If the control succeeds, egress denial is not enforced and H3 is
  blocked.** Record that and do not proceed to claim H3 by any other means.
  12b. With denial enforced, exercise the whole serving path from inside the container, since
  an internal network has no published port:
  - Cold start: the container was just created; wait for readiness with
    `docker exec "$RUN_ID-c2" sh -c 'for i in $(seq 1 60); do curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4321/ | grep -q 200 && exit 0; sleep 1; done; exit 1'`.
  - Public read: `docker exec "$RUN_ID-c2" curl -s http://127.0.0.1:4321/ | grep -c "$ENTRY_MARKER"`.
  - Work-request submission: the same POST as step 11, issued with `docker exec` against
    `http://127.0.0.1:4321/`.
  - Admin content edit: exercise through the admin API with the session the executor can
    obtain inside the container; if no admin edit can be driven without a browser, record that
    the admin-edit leg of H3 was not exercised and mark H3 **blocked**, not passed.
  - Plugin configuration: record which configuration the container was built with — sandbox
    enabled or not — because H3's verdict is about that configuration only.
    Expected: every exercised leg succeeds while the control fails.
    Pass H3: cold start, public read and submission all succeed under enforced denial, and the
    admin edit either succeeds or is explicitly reported as not exercised, in which case H3 is
    blocked.
    12c. Record separately, with egress restored, whether the admin's Registry section is
    reachable and whether discovery can be disabled per the configuration reference. Registry
    discovery is admin-initiated and is not the serving path; it is reported, not counted
    against H3, unless the site refuses to serve without it.

- [ ] **Step 13. Backup, and restore into a separate clean instance.**
      13a. With a container serving and a write in flight if possible, take two copies:
      `docker exec "$RUN_ID-c2" sh -c 'cp /app/data/data.db /app/data/copy-plain.db'` and
      `docker exec "$RUN_ID-c2" sh -c 'sqlite3 /app/data/data.db ".backup /app/data/copy-backup.db"'`
      (install `sqlite3` in the image, or run the copy from the host against the volume's mount
      point if the image has no `sqlite3`; record which was done).
      13b. Check both: `PRAGMA integrity_check;` and a query for `$ENTRY_MARKER` in each.
      Expected: `copy-backup.db` reports `ok` and contains the marker. Record `copy-plain.db`'s
      result whichever way it falls; both outcomes are findings.
      13c. **Restore into a separate clean instance.** Create a second volume and a second
      container from the same image:

  ```sh
  docker volume create --label "puni.eval=$RUN_ID" "$RUN_ID-restore"
  # copy copy-backup.db and the uploads tree into the new volume via a throwaway helper
  # container that also carries the run's label:
  docker run --rm --label "puni.eval=$RUN_ID" \
    -v "$RUN_ID-data:/from" -v "$RUN_ID-restore:/to" busybox \
    sh -c 'cp /from/copy-backup.db /to/data.db && mkdir -p /to/uploads && cp -a /from/uploads/. /to/uploads/'
  docker run -d --name "$RUN_ID-restore-c" --label "puni.eval=$RUN_ID" \
    -p "127.0.0.1:$PORT:4321" -v "$RUN_ID-restore:/app/data" \
    -e EMDASH_ENCRYPTION_KEY="$(grep EMDASH_ENCRYPTION_KEY "$WORK/site/.env" | cut -d= -f2-)" \
    "$RUN_ID:site"
  ```

  13d. Against the restored instance, verify all four: the entry `$ENTRY_MARKER` is served,
  the media file `$MEDIA_MARKER` is fetchable through the media route, a **fresh sign-in**
  succeeds, and a **new write** (edit the entry's title suffix) persists across a restart of
  that container.
  Expected: all four succeed on the same application version as the backup.
  Pass H5: all four. Fail or partial: record exactly which leg failed; a partial pass is a
  blocked H5, not a pass.

### 7.6 Persistence, measurements, licences, determinism

- [ ] **Step 14. Persistence by destruction, and termination behaviour.** This is H1's proof.
      14a. `docker stop -t 30 "$RUN_ID-c2"`, then
      `docker inspect -f '{{.State.ExitCode}} {{.State.OOMKilled}} {{.State.FinishedAt}}' "$RUN_ID-c2"`.
      Expected: a non-137 exit code recorded before the 30-second timeout.
      Pass S3: exit code is not 137, `OOMKilled` is false, and a subsequent
      `PRAGMA integrity_check` on the volume's database prints `ok`. Elapsed time alone is not
      evidence, because Docker sends SIGKILL after the stop timeout.
      14b. Before stopping, record S2: `docker stats --no-stream --format '{{.Name}} {{.MemUsage}}' "$RUN_ID-c2"`
      for container memory, and
      `docker exec "$RUN_ID-c2" sh -c 'ps -o rss=,comm= -C node'` for the server process RSS.
      Record both numbers separately; container memory is not process RSS.
      14c. **Destroy and recreate.** `docker rm -f "$RUN_ID-c2"`, then create `$RUN_ID-c3` from
      the same image on the same `$RUN_ID-data` volume with the same loopback publish.
      Expected: after readiness, `curl -s "http://127.0.0.1:$PORT/" | grep -q "$ENTRY_MARKER"`
      exits 0, the media file `$MEDIA_MARKER` fetches 200 through the media route, and the
      work-request marker from step 11 is still readable by its recorded query.
      Pass H1 and the durable half of H4: all three markers survive container destruction.
      14d. The negative, per section 8 row 2: create `$RUN_ID-c4` from the same image with **no
      volume**, wait for readiness, and run the same three assertions.
      Expected: all three fail — the entry absent, the media 404, the submission absent.
      Pass: the negative fails as expected. If any marker survives without the volume, the data is
      inside the image layer or elsewhere; find where before claiming H1.
      Remove `$RUN_ID-c4` afterwards.

- [ ] **Step 15. Licences, within the declared inventory.**

  ```sh
  cd "$WORK/site"
  for pkg in $(node -p "Object.keys(require('./package.json').dependencies||{}).concat(Object.keys(require('./package.json').devDependencies||{})).join(' ')") workerd @emdash-cms/sandbox-workerd; do
    printf '%s %s\n' "$pkg" "$(node -p "try{require('./node_modules/$pkg/package.json').license}catch(e){'MISSING'}")"
  done | tee "$WORK/licences.txt"
  curl -sS https://raw.githubusercontent.com/emdash-cms/emdash/main/LICENSE | head -3 | tee -a "$WORK/licences.txt"
  ```

  Expected: one line per direct dependency, plus the upstream LICENSE's first lines.
  Pass H2: every listed licence is MIT or another permissive licence and the upstream LICENSE
  is MIT. Any `MISSING`, any ambiguous metadata, or any copyleft or source-available licence
  blocks H2 — it is not waved through.
  The note states plainly that transitive dependencies and the base image's contents were not
  inventoried, so H2's conclusion is scoped to this list.

- [ ] **Step 16. Determinism, for S4.** Set the migration mode to `manual` per
      `https://docs.emdashcms.com/deployment/core-migrations/`, run the documented migrate command
      against the volume's database, rebuild if the option is build-time, start a container, and
      make the first request.
      Expected: the first request applies no migration, and the server log says so or says
      nothing about migrations.
      Pass S4: no migration on first request. Fail: record that migration mode could not be
      forced; that becomes a named condition about deploys, not a reject.
      [Superseded by the dispatch amendment: silence on an already-migrated database proves
      neither migration policy nor deterministic rebuilding. Use a disposable database with
      pending migrations, observe unchanged migration state in manual mode, then run an explicit
      migration and a successful migration check against the matching build manifest.]

- [ ] **Step 17. Update cost, for S6.** Count the `emdash@` release entries published after the
      pinned version and how many carry a **Breaking** marker:
      `gh api repos/emdash-cms/emdash/releases --paginate --jq '.[] | select(.tag_name|startswith("emdash@")) | "\(.tag_name) \(.published_at[0:10])"'`,
      then read the entries in that range.
      Expected: a count of releases and a count of Breaking entries.
      Pass: both numbers recorded. If `gh` is unavailable, record S6 as not measured.

### 7.7 Write and finish

- [ ] **Step 18. Write the note.** Create `docs/research/2026-09-DD-emdash-self-hosting.md`
      following 6.1's outline exactly, filling 6.2 and 6.3 with the observed verdicts, the command
      that produced each, and the observed negative for each hard requirement. Put every
      unresolved item from section 4 into "Evidence limits". Use the full names Prosperous
      Unification and, only where the note names the product, Vesper Shipyards. Every external
      claim carries its URL and the retrieval date. **Sanitize:** the note is published in a
      public repository, so it contains no hostname, username, absolute home path, process list,
      socket table, token or any detail of unrelated workloads on the host; observations are
      quoted only for this run's own processes and containers, with `$RUN_ID` redacted to
      `<run-id>`.

- [ ] **Step 19. Verify and finish.** Run section 10's commands, then let the `trap` from step 1
      run cleanup, or run `"$WORK/cleanup.sh"` explicitly. Confirm afterwards that
      `docker ps -a --filter "label=puni.eval=$RUN_ID" -q` and the matching volume, network and
      image filters all print nothing, and that `$WORK` is gone.
      Expected: no resource carrying this run's label remains, and no other resource was touched.
      Pass: all four filters are empty. The repository is left with exactly one added file
      relative to step 2's baseline.
      [Superseded by the dispatch amendment: container cleanup in this step belongs to the
      planner, and preparation artifacts under `$WORK` are preserved for handoff, not deleted.]

## 8. Negative proofs

This task changes no production code, so R5's "production-path negative" has no code path to
break. Adapted, and binding: **no hard requirement may be marked passed until its paired negative
below has been observed to fail.** Each negative tests the property its row names, not a
neighbouring one.

| Row | Property                                    | Fault to inject                                                                                                                     | What must be observed                                                                                                                                                                                |
| --- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | H5, the backup really restores              | Restore, into the clean instance of step 13c, a backup taken **before** `$ENTRY_MARKER` existed, keeping everything else identical. | The entry assertion fails: the restored instance does not serve `$ENTRY_MARKER`. This is deterministic. The concurrent plain-copy experiment in 13a stays descriptive and proves nothing on its own. |
| 2   | H1 and H4, persistence is the volume's      | Step 14d: same image, no volume.                                                                                                    | The entry, the media file and the stored submission are all absent after readiness.                                                                                                                  |
| 3   | The sandbox is doing something              | Step 10c: `sandboxRunner` removed while the plugin is listed under `sandboxed: []`.                                                 | The plugin route does not return the response recorded in 10a, and `SANDBOX_NOT_AVAILABLE` appears on an install attempt.                                                                            |
| 4   | H3's egress denial is enforced              | Step 12a's control request to a host outside the site.                                                                              | The control fails. If it succeeds, the whole H3 experiment is void and H3 is blocked.                                                                                                                |
| 5   | The submission endpoint validates its input | Step 11's incomplete body.                                                                                                          | A 4xx refusal. This proves validation only; durability is proven by row 2 and step 14c, and the packet does not conflate them.                                                                       |

Record the injected fault and the observed failure beside the passing observation in the note's
"Evidence limits" section.

## 9. OpenSpec

No OpenSpec change. Per `AGENTS.md` R4, OpenSpec is required for observable behaviour,
contracts, migrations, deploy safety or architecture, and is skipped for documentation. This
task adds one research note and changes no behaviour.

The decision the note recommends is a different matter and is out of this task's scope: if the
recommendation is adopt, the adoption itself is architecture and needs its own OpenSpec change,
and both the choice of a beta third-party CMS as the website's runtime and the open Node-runtime
decision named in 3.3 are the kind of hard-to-reverse, surprising decisions with real
alternatives that earn an ADR under `docs/adr/`. The note's "Recommendation" section says which
of the two the next step is; it creates neither.

## 10. Verification

Run from the repository root after step 18, before cleanup:

| Command                                                                     | Expected and pass criterion                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git status --short`                                                        | Identical to `$WORK/git-baseline.txt` except for one added line, the new research note. Pass: `diff <(git status --short \| grep -v 'docs/research/2026-09-DD-emdash-self-hosting.md') "$WORK/git-baseline.txt"` is empty. Other lanes' modified files are present in both and are never staged, reverted or cleaned.                                                                                                                         |
| `bunx nx format:check --all`                                                | Exit 0. `--all` is required: `bin/h2puni-gate-steps.sh` line 25 runs exactly `bunx nx format:check --all`, and the base-ref default is empty on main. Pass: exit 0.                                                                                                                                                                                                                                                                           |
| Claim-to-source audit                                                       | Read the note line by line. Every sentence asserting an external fact either carries a URL with the retrieval date, or appears under "Evidence limits" as unverified. Pass: the executor records the count of asserted claims and the count carrying a source, and they are equal. Fail: any uncited external claim; fix it rather than lowering the count. A `grep -c 'http'` is not this check and must not be substituted.                 |
| Completion gate, per the batch README's "Standard blocks every packet uses" | On the shared build host, run `bin/h2puni-gate.sh <sha>` with the committed hash, do not check that commit out first, never clean a dirty gate tree, and record the printed line naming the running hash and the exit status. On any other machine — which is where this evaluation must run, per step 2 — say in the task report that the host gate was not run and why. An unavailable required check is reported, never treated as passed. |

What these commands do not prove: none of them checks that the observations in the note are
correct, that the evaluation covered the real website's needs, or that EmDash behaves on the k3s
cluster as it did in a container on the executor's host. The note's "Evidence limits" section is
where those gaps are named.

## 11. Stop conditions and exit outcomes

### 11.1 Four distinct outcomes

The evaluation never ends without one of these, and every one of them writes the note and runs
cleanup first:

- **Adopt** or **adopt with conditions**: every hard requirement passed with its negative
  observed.
- **Reject, alternative unevaluated**: a hard requirement failed on the product's own behaviour.
  The note names the failed requirement and the evidence. It does not recommend an alternative,
  because section 3.9's list is unresearched; recommending one requires a bounded, sourced
  comparison that is separate work.
- **Blocked**: something in the environment, not the product, prevented an observation — no
  Docker daemon, no browser for the passkey flow, egress denial not enforceable, `gh`
  unavailable. The note says which requirement is blocked and what would unblock it, and gives
  no adoption verdict.
- **Stopped**: a stop condition below fired. Same obligations: sanitized note, cleanup, report.

### 11.2 Stop and report rather than improvising

- The host is `h1claw`, the shared build or production box, or any machine where step 2's
  preflight fails. Never change a shared host to make the evaluation possible.
- Any step would install a package, a runtime or a tool into this repository, or modify any
  repository file other than the one new note.
- Any step would sign up for an account, accept terms, publish a package, provide a payment
  method, or supply a Cloudflare credential.
- Any command would bind a port to an address other than `127.0.0.1`, or would remove a Docker
  resource not carrying `label=puni.eval=$RUN_ID`.
- The scaffolder fails twice under Bun; no npm, pnpm or yarn fallback is authorized, and the
  evaluation cannot be done from memory.
- A dependency in step 15's inventory is missing licence metadata or is not permissive.
- An observation contradicts section 3 **behaviourally** — a documented mechanism behaves
  differently, an option does not exist, a quoted contract is wrong. Record both and report.
  Ordinary drift in mutable metadata (star counts, issue counts, a newer release, a bumped
  plugin version) is recorded in the note and is **not** a stop condition.

### 11.3 What must never appear in the note

The repository is public. Broad `ps`, `ss`, `docker stats` and environment dumps can disclose
unrelated workloads, usernames and credentials on a shared workstation. Observations are scoped
to this run's own processes and containers by name or label, `$RUN_ID` is redacted to
`<run-id>`, and no hostname, absolute home path, token or third-party workload detail is quoted.

## 12. Out of lane

- Every file owned by another packet in `docs/superpowers/plans/2026-09-19-batch-1/`, that
  directory's `README.md`, and the other lanes' already-modified files listed in step 2's
  baseline.
- Everything under `deploy/` and every infrastructure or deployment manifest. This task decides
  nothing about the cluster; it reports what a deployment would require.
- `docs/plans/2026-09-15-infra-evolution-plan.md`. If the findings contradict it, say so in the
  note and report; do not edit the plan.
- `docs/twilight-structure/names.md` and `docs/twilight-structure/CONTEXT.md`.
- `docs/adr/` and `openspec/`. Section 9 explains why.
- Anything under `apps/wbs/`, `libs/wbs/`, `tools/`, the root manifest and the lockfile.
- Website content, domain and privacy decisions: work item 060.4, which needs Dany.

## 13. Review disposition

Findings from the adversarial review of 2026-09-19 (Codex gpt-6-astra, high effort). Every one
was re-verified against primary sources before acting. Fixed findings changed the packet;
rejected findings are answered with evidence and the packet stands.

**Critical 1, H1 can pass while content is ephemeral — fixed.** Verified: the Starter's
`astro.config.mjs` really does use `file:./data.db` and `./uploads` as siblings
(`https://raw.githubusercontent.com/emdash-cms/templates/main/starter/astro.config.mjs`,
retrieved 2026-09-19), and a `docker restart` preserves the writable layer. Step 4 now relocates
both under `./data` before first start, step 14c proves persistence by destroying the container,
and step 14d is the no-volume negative over three markers including an uploaded media file.

**Critical 2, isolation and cleanup on a shared host — fixed.** Step 1 now creates `$RUN_ID`, a
`mktemp -d` working directory and an ephemeral port, writes a cleanup script that deletes only
resources labelled `puni.eval=$RUN_ID`, and installs a `trap` before the first resource exists.
Every publish is `-p 127.0.0.1:$PORT:4321`, the dev server never gets `--host`, and step 2
refuses to run on h1claw or the shared build box per `LLM_README.md`. Server PIDs are recorded
and killed; no step reuses a port another step holds.

**Critical 3, essential content left to invention — fixed.** Step 7 uses the Starter's existing
`posts` collection and its `/posts/<id>` route rather than inventing a collection; step 10 reads
the plugin id, route and response out of the file `emdash-plugin init` generates; step 11 gives
the exact form fields, the exact POST bodies and the complete source of the fallback Astro
endpoint. Failing assertions now precede every creation.

**Critical 4, the Cloudflare check did not establish its claim — fixed.** Verified the Turnstile
path in `packages/plugins/forms/src/handlers/submit.ts` (297 lines, retrieved 2026-09-19): it
branches on `settings.spamProtection === "turnstile"`, reads `cf-turnstile-response`, and there
is a `honeypot` alternative. Step 11 configures spam protection away from Turnstile and leaves
the webhook empty. Step 12 replaces log sampling with an `--internal` Docker network, a control
request that must fail, and an exercise covering cold start, public read, submission and admin
edit; if the control does not fail, or the admin leg cannot be driven, H3 is **blocked**, not
passed. Section 8's contradictory "Everything works" row is gone. `registry.emdashcms.com` is
now named explicitly and reasoned about as admin-initiated discovery rather than the serving
path.

**Critical 5, the packet invented an npm exemption — fixed, with a correction to the review's
remedy.** The old 3.3 inference that the rules already permit a Node runtime in an image is
deleted. The new 3.3 quotes the rule without interpretation and separates two questions: which
tool the evaluation uses, and whether a product here may ship a Node runtime — the latter now an
explicit open decision for Dany with its own heading in the note outline. Section 7 is rewritten
to use Bun for scaffolding, installs and scripts, with Node kept only as the explicitly selected
server runtime EmDash requires. Where the review says an npm fallback needs an exception
"obtained before dispatch", the packet instead records any fallback as a finding for Dany: the
evaluation runs outside the repository in a throwaway directory, so it changes nothing this
repository ships, and blocking the whole evaluation on a pre-dispatch exception would trade a
real observation for a formality. The packet claims no exemption and says so in 3.3.

**Important 1, undefined directories and process ownership — fixed.** Every step now names its
directory, uses `$WORK`-absolute paths, records PIDs, waits for readiness with a bounded loop,
states an exit expectation and a shutdown command, and frees its port. Step 2 preflights daemon
access with `docker info` rather than `docker --version`, and records browser/passkey capability
before installation.

**Important 2, the sandbox experiment tested the wrong path — fixed.** Verified in the sandbox
documentation that `astro dev` hands plugins to Miniflare and that the built entry uses
`workerd`. Step 10 now runs only against the built entry, and step 6 installs the sandbox
dependencies **before** the Bun copy in step 9, so step 9 can answer unknown 2.

**Important 3, encryption claims contradict upstream — rejected, with a new unknown.** Two
fetches on 2026-09-19 — the raw source
`https://raw.githubusercontent.com/emdash-cms/emdash/main/docs/src/content/docs/deployment/nodejs.mdx`
and the rendered page `https://docs.emdashcms.com/deployment/nodejs/` — both say
"`EMDASH_ENCRYPTION_KEY` encrypts plugin settings declared as secrets" and both carry the
rotation and "Restoring the database without a referenced key leaves the corresponding settings
unreadable" sentences. Neither says secrets remain plaintext or that the variable only validates
format. The packet's quotations stand. Because the review read something different, unknown 12
now requires the executor to record the docs shipped with the pinned release and forbids the
note from asserting confidentiality of stored plugin secrets on documentation alone.
[Superseded by the dispatch amendment: the third review found the currently retrieved deployment
guide describes format validation without stored-data encryption. This disposition's rejection
does not stand; treat the encryption and key-loss claims as disputed, not verified, per the
amendment's "Encryption claims are disputed" section.]

**Important 4, mutable sources undermine the baseline — partly fixed, one point rejected.**
Fixed: step 3 now pins and records the scaffolded `emdash`, `astro` and adapter versions plus the
lockfile, every claim in the note binds to that version, and section 11.2 separates ordinary
metadata drift from behavioural contradiction. Rejected: the packet's `@emdash-cms/plugin-forms`
version is correct. On 2026-09-19 both the manifest on `main` and
`https://registry.npmjs.org/@emdash-cms/plugin-forms` (`dist-tags.latest`) reported **0.2.6**;
the review's 0.2.5 came from a stale cache. Section 3.1 now cites both sources.

**Important 5, recovery narrower than the proof — fixed.** H5 and step 13 now restore into a
separate clean volume and container from the same image, and verify entry, media, fresh sign-in
and a new write. The deterministic negative is a backup taken before the marker existed
(section 8 row 1); the plain-copy experiment is explicitly descriptive.

**Important 6, licence conclusion exceeds the inventory — fixed.** H2 now declares its inventory:
the upstream LICENSE, every direct dependency of the scaffolded site, `workerd` and
`@emdash-cms/sandbox-workerd`. Step 15 enumerates them by reading `package.json` rather than by
name prefix, treats `MISSING` as blocking, and the note must disclose transitives and base-image
contents as unverified.

**Important 7, measurements and thresholds wrong or missing — fixed.** The 1.0 GB figure is now
labelled a threshold proposed by this packet, with the note that the infra plan's row is "Novel
prod or staging". Step 14b measures container memory and process RSS separately. S3 now checks
exit code and `OOMKilled` and then database integrity, because `docker stop` sends SIGKILL after
its timeout. S4 gets a real experiment (step 16) and S5 and S6 get stated thresholds and a
measurement (steps 8 and 17).

**Important 8, proofs that do not test their property — fixed.** Section 8 row 5 now says
plainly that input validation proves validation only, and durability is proven by row 2 and step
14c. The wrong-path 404 is gone. `grep -c 'http'` is replaced by a claim-to-source audit that
fails on any uncited external claim. The invented prose-glob verification is removed: verified
that the repository's actual refusal is in `apps/wiki/cli/src/indexes/check-indexes.ts`, where
`GlobPattern = /[*?[\]{}]/` is applied to **Markdown link destinations** and throws "Markdown
link contains a glob in ...", not to arbitrary prose. The packet still avoids glob roots as a
style matter, but no longer claims a check enforces it.

**Important 9, verification contradicts the gate policy — fixed.** Section 10 now reproduces the
batch README's "Completion gate" block verbatim in substance: the host gate is mandatory on the
shared build host, and on any other machine the task report says it was not run and why, never
that it passed. The formatting command is `bunx nx format:check --all`, matching
`bin/h2puni-gate-steps.sh` line 25, which I verified.

**Important 10, "nothing else changed" contradicts the workspace — fixed.** Verified: the tree
carries other lanes' modified documents. Step 2 captures the baseline, section 10's first row
diffs against it, and section 5 and section 12 forbid staging, reverting, cleaning or committing
another lane's files.

**Important 11, stopping is not a complete outcome — fixed.** Section 11 now defines four
outcomes and separates product failure from evaluation blockage; a reject may not name an
alternative, because 3.9 is explicitly unevaluated. Every exit writes a sanitized note and runs
cleanup via the step 1 `trap`, and 11.3 forbids publishing host details, broad process or socket
listings, or anything about unrelated workloads.

**Minor 1, misleading internal references — fixed.** Verified that
`apps/wbs/be-01/src/repository/db.ts` contains only `export * from '@wbs/store-sqlite/db';`;
section 2 now points at `libs/wbs/adapters/store-sqlite/src/db.ts` and says so. Unknown 5 now
cites section 8 row 1 instead of a non-existent numbered step.

**Minor 2, overstated Astro claim and an unreproducible probe — fixed.** Verified the recipe
source: the caution reads "Using Bun with Astro may reveal rough edges. Some integrations may not
work as expected." and contains no "not officially supported" sentence. Section 3.3 now quotes it
and labels the stronger reading as inference, and the `bun -e` probe is given in full.

**Minor 3, incomplete source coverage — fixed.** Exact URLs now appear for issues 154 and 3033
and pull requests 27 and 71, and the alternatives are relabelled "unevaluated names only" with
the statement that no source was retrieved for them, plus a rule in 11.1 that a reject verdict
may not recommend one until it has been researched.

**Review's "Verified" section.** Its note that shell DNS failed in the review environment does
not apply here: `https://registry.npmjs.org/@emdash-cms/plugin-forms` and
`raw.githubusercontent.com` both resolved and returned content from this shell on 2026-09-19,
which is how the forms version and the Turnstile handler were confirmed.

### Third review, 2026-09-20 (Codex gpt-6-astra, high effort): DISPATCH AFTER FIXES

The verdict is dispatch after fixes: only the preparation slice dispatches once the amendments
above are in place, and the packet as it stood still failed the immutable-image persistence
requirement while attributing every container observation to a single actor. The controlling
split is executor-prepares and planner-runs-containers: the executor produces refreshed desk
research, scripts, fixtures, Dockerfiles and configuration, and never touches Docker, servers or
browser flows, while the planner performs every serving, container and cleanup step from those
reviewed scripts. The second hold reason, persistence on one immutable image, was **not** met by
the packet's old text — steps 7–14 built the image before the application was finished and wrote
across separate volumes and databases — and is now specified by the "Experiment order and the
immutable image" section of the amendment above. Preparation completing is not the experiment
completing: the note the executor writes carries the recommendation "Blocked — pending planner
experiment" until the planner has actually run the container steps and supplied the observations.
