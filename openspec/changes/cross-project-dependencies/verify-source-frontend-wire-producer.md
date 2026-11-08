# Pinned source frontend wire producer

This research captures the real installed Vite producer for `GET /` and
`GET /src/main.tsx`, using tracked source from
`be344d9afaca6bf6c065fb54dcfd5a37900e2f24`. It resolves the missing producer
observation identified by the deferred frontend decoder review; it does not
select or implement a decoder or establish source readiness. The source index,
entry module and Vite configuration were preserved byte for byte. Only this
findings file changes in the research worktree.

## Primary source and runtime pins

The frontend serve target runs `bunx vite` from `apps/wbs/fe-01`
([project.json](../../../apps/wbs/fe-01/project.json#L8)). The source image pins
Node **24.18.1** and Bun **1.4.4**
([Dockerfile](../../../deploy/dev-src/Dockerfile#L4), lines 4–15).
The actual local producer used Node **24.20.0**, Vite **8.2.2**, React plugin
**6.1.1**, Tailwind Vite plugin/Tailwind **4.3.3**, React/React DOM **19.2.8**,
and Rolldown **1.2.7**. Installed package manifests and their hashes are recorded
in the private observation; lock declarations agree for the named packages
(`bun.lock:946,1176,2488,2494,2562,2860`). This does not attest every installed package
against its archive integrity, or measure the source image's Node executable.

| Tracked producer input          | SHA256                                                             |
| ------------------------------- | ------------------------------------------------------------------ |
| `apps/wbs/fe-01/index.html`     | `12a941b6fbccfe6530b333b9e9c59bd77d6246001e72f90f76ce3fdfbdd62ae7` |
| `apps/wbs/fe-01/src/main.tsx`   | `9da12f96ac12958e268241fe0c8c6cdd6cbcb0f56db569830af1ced291a7200e` |
| `apps/wbs/fe-01/vite.config.ts` | `0cd1af512952d71c83929cbff1e6ead7e8c2a80edd69ce66bfeb619df189de1b` |
| `bun.lock`                      | `bf54a6c6202a5d8f54f9bb8fe7e76935a8f4c667c660da720db3fd5f16391383` |

Installed primary implementation pins, also retained in `analysis.json`:

| Installed source                                  | SHA256                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| `node_modules/vite/dist/node/chunks/node.js`      | `f64038f08022030b77efee87b6baa81933a7b77d820aaa64bc3262fda44d80b0` |
| `node_modules/@vitejs/plugin-react/dist/index.js` | `843c8567286d06945301c9c5568cad44b1a2f74cd00969152cbd210c2ff07117` |
| `node_modules/@tailwindcss/vite/dist/index.mjs`   | `f80662823db60a7d2060ae37bedb98ab3a5039a32f9ab88a2a0c9c39e79f4d28` |

## Isolated producer procedure

Private packet: `/tmp/puni-source-frontend-wire-20261029/`.
The exact preparation, supervisor and analysis commands were:

```sh
python3 /tmp/puni-source-frontend-wire-snapshot-20261029.py
python3 /tmp/puni-source-frontend-wire-supervise-20261029.py
python3 /tmp/puni-source-frontend-wire-analyze-20261029.py
```

The snapshot script enumerated only Git HEAD blobs through `git ls-tree` and
`git cat-file --batch`, copying 1,318 tracked regular files under the frontend,
its domain/shared alias libraries, and the four root package/configuration
files. It excluded every basename beginning `.env`, including tracked examples;
it neither enumerated nor copied ignored/private environment files. The snapshot
keeps the repository layout. All copied source hashes were rechecked unchanged
following capture (`source-manifest.json`, `analysis.json`).

Scratch has its own `node_modules` directory, with links to the installed
non-dot package entries. Configuration bundling therefore writes its temporary
file into scratch `.vite-temp`; the Vite cache is also inside the packet.
Dependencies were not installed, updated or built by a separate command.
The API harness loads the actual copied `vite.config.ts` with Vite's default
configuration loader; it adds no plugins or transform hooks. Its only inline
configuration values are the scratch `root`, `configFile`, `envDir`, `cacheDir`,
and `server: { host: '127.0.0.1', port: 0, strictPort: true }`.

The child receives a deliberately small environment: `PATH` for system tools,
`NODE_ENV=development`, `WBS_PUBLIC_DEV=true`, `DEBUG=vite:env`, `TZ=UTC`, and
`FORCE_COLOR=0`. No ambient Vite variables, proxy variables or user environment
are forwarded. Its only `.env` contains the synthetic unused targets
`VITE_BE_URL=http://127.0.0.1:9` and `VITE_GW_URL=ws://127.0.0.1:9`.
Both `process.cwd()` and `envDir` are the scratch frontend directory. Actual
`vite:env` logs show all `.env`, `.env.local`, `.env.development` and
`.env.development.local` lookups there, with only the synthetic values loaded.
Vite's primary loader enumerates those four files in
`node_modules/vite/dist/node/chunks/node.js:5889–5931`.

Before `listen()`, the harness asserted resolved loopback host, requested port
zero, strict port, expected environment, HMR false, browser opening false and
an unlistening HTTP server. After listen it asserted the actual numeric IPv4
loopback address and a positive ephemeral port outside the four fixed role
ports. Vite 8's port-zero branch obtains and binds an ephemeral loopback port
(`node_modules/vite/dist/node/chunks/node.js:11662–11670`). No public listener,
other host, backend, gateway, MCP, browser or upstream request was used.

The successful attempt sent exactly two direct Node HTTP GETs, in order, with
`accept-encoding: identity`, `connection: close`, no proxy agent, no `Accept`
header and no conditional cache header. Those headers match the existing
participant transport's request shape
([dependency-participant-http.ts](../../../tools/tool-remote-scripts/src/lib/dependency-participant-http.ts#L59)).
The attached server request audit records only `/` and `/src/main.tsx`. Each
request/response close event was joined. A 15-second per-request bound and
256 KiB incremental response cap were retained in this research harness.

## Actual resolved configuration

`observation.json` retains the complete selected resolved configuration, aliases
and plugin names. Observed values were command `serve`, mode `development`,
base `/`, app type `spa`, production false, development true, HMR false,
pre-transform requests true, client JavaScript source maps enabled, empty client
warmup list, and dependency discovery enabled. The React optimizer includes
`react`, `react-dom`, `react/jsx-dev-runtime`, and `react/jsx-runtime`.
Alias targets point into the scratch source layout; the optional scroll-probe
profiling alias was absent. Filesystem access remained strict, with Vite's
standard environment/key/Git deny patterns. The proxy retained the actual
`^/api/` and `/ws` matchers, using only synthetic targets; neither matcher was
requested. These derive from
[vite.config.ts](../../../apps/wbs/fe-01/vite.config.ts#L36), lines 36–66, 84–90,
and 293–325.

`WBS_PUBLIC_DEV=true` follows the source Compose declaration
([compose.yml](../../../deploy/dev-src/compose.yml#L47), lines 47–53), rather
than ordinary editor HMR. The React plugin's `calculateSkipFastRefresh` disables
refresh when `hmr === false`; its HTML preamble hook is conditional on refresh
remaining enabled (`node_modules/@vitejs/plugin-react/dist/index.js:69–70,181–186`).
The resolved plugin list still contains React plugin hooks, Vite's OXC/import
analysis, and Tailwind's `scan` and `generate:serve` plugins. Plugin registration
alone is not proof that every hook ran on these two responses. Tailwind's
published plugin source filters its serve transform to CSS-like module IDs
(`node_modules/@tailwindcss/vite/dist/index.mjs:1`); no stylesheet response was
requested. React's installed entry points select their development libraries
outside production (`node_modules/react/index.js:3–6`,
`node_modules/react-dom/client.js:31–37`); no React render was executed here.

The actual default config loader emitted Vite's warning that `__dirname` is
unsupported by a future native loader. The probe did not suppress or repair that
warning, or switch the configuration loader. The current loader's dispatch and
bundle path are primary code at
`node_modules/vite/dist/node/chunks/node.js:36958–36975,37013–37028,37151`.

## Two successful wire responses

| Request             | Status | Content-Type      | Bytes | Body SHA256                                                        |
| ------------------- | -----: | ----------------- | ----: | ------------------------------------------------------------------ |
| `GET /`             |    200 | `text/html`       |  2539 | `09ab3b528f1a147d34addea248fa08925801d66ee9f384bb634112b9abc30e2f` |
| `GET /src/main.tsx` |    200 | `text/javascript` |  1582 | `e990c7ae6b545d4177b27560878bd41d34843b32109a21af190794d73e45ee08` |

Both responses were complete, fatal UTF-8 decoding succeeded, and neither
reported a content encoding. Both used `Cache-Control: no-cache` and weak ETags.
The captured module ETag is not a digest of its entire served body: Vite passes
the transform ETag before `send` appends the inline map
(`node_modules/vite/dist/node/chunks/node.js:25205–25215,19688–19716`).
The body SHA256 above includes every served byte, including that map. Raw
headers and byte bodies remain private in `observation.json` and the two
`*.response.*` files.

The HTML diff has one observed change from pinned `index.html`: a module script
for `/@vite/client`, followed by a blank line, inserted immediately inside
`<head>`. Removing that exact observed insertion reproduces the entire pinned
index byte sequence; this is an offline characterization of this capture,
not an implemented normalization rule. The inline theme bootstrap, one root
mount and module entry remain intact
([index.html](../../../apps/wbs/fe-01/index.html#L32), lines 32–53).
Vite reads and transforms HTML before sending it, and its `devHtmlHook` injects
the client script unconditionally at `head-prepend`
(`node_modules/vite/dist/node/chunks/node.js:25674–25684,25728–25733`). Thus
HMR false does not mean the document equals raw source bytes.

The JavaScript response rewrites the stylesheet import to `/src/styles.css`
and the extensionless bootstrap import to
`/src/runtime/application-bootstrap.tsx`. It preserves the actual root lookup,
missing-root throw, explanatory comments and `void bootstrapApplication(el)`.
The original entry is
[main.tsx](../../../apps/wbs/fe-01/src/main.tsx#L1), lines 1–11.
The transformed code before its map delimiter is 535 bytes. Its only trailing
map is an inline base64 JSON source map: version 3, `sources: ["main.tsx"]`,
with `sourcesContent` exactly equal to the pinned original entry. The decoded
map is 746 bytes. Analysis parsed only that JSON and compared bytes; it did not
evaluate returned JavaScript. Vite's OXC transform requests source maps, its JS
middleware sends transformed code, and its sender emits the base64 map comment
(`node_modules/vite/dist/node/chunks/node.js:4078–4091,25205–25215,19634–19641`).

Static primary code also explains why successful response markers alone are
insufficient: the SPA fallback may rewrite another path to `/index.html`
(`node_modules/vite/dist/node/chunks/node.js:19303–19344`). The error middleware
can emit a 500 HTML document importing the client error overlay
(`node_modules/vite/dist/node/chunks/node.js:6030–6046`). Those are source facts;
this task did not request extra fallback or error responses. No malformed-body
or omission proof is claimed.

## Attempt history and owned cleanup

The first supervised attempt exited 1 at the post-cleanup assertion that
`server.watcher.closed` must already be true after `server.close()`. That
assertion ran before persisting the observation, so the first attempt has no
durable request census. Its program, stdout, stderr and supervisor receipt are
retained as `attempt1-*`; its direct child and both pipe readers were joined.
The original error inside the try block, if any, was also masked by that cleanup
assertion. Do not count this attempt as a successful producer observation, or
claim exactly two GETs across both attempts. This was a research-harness mistake.

The corrected scratch harness persists diagnostics before cleanup assertions
and explicitly awaits the owned watcher close after `server.close()`. It adds
no request or response transform. The second attempt, terminal `b72b72`, exited
0 in 0.782 seconds: two audited requests, both request/response pairs closed,
server close returned, HTTP no longer listening, explicit watcher close returned,
watcher closed true, and zero watched directories. Its supervisor joined the
original child and both pipe readers. No termination signal or outer timeout was
needed. The successful run reused the same scratch/cache location as the first
attempt; cold-cache equivalence is not established.

The observation specifically records watcher closed false immediately after
Vite server close, then true after the explicit watcher close. Vite's server
close implementation awaits a `Promise.allSettled` including watcher close;
the installed watcher `add` can reset its closed flag and `close` sets it true
(`node_modules/vite/dist/node/chunks/node.js:26431–26444,10420–10422,10484–10508`).
These facts do not establish the cause of the observed flag transition or a
universal Vite cleanup defect. The evidence is limited to this owned probe.
No further runtime probe followed the successful capture.

## Private receipts and remaining decision

| Private artifact within the packet | SHA256                                                             |
| ---------------------------------- | ------------------------------------------------------------------ |
| `source-manifest.json`             | `7217576725b0e942905c0fa72ef968da99b3055a90287100b6a2026773be2a1f` |
| `probe.mjs`                        | `00d8666ea4ce3423d270d598ea0048db818496aa8ac69e1affc6b1988339c33b` |
| `supervisor.json`                  | `0351d93de39571e06acadccc05f04c9b4ddaa50f09390f1ffc21f78c29552c46` |
| `observation.json`                 | `a588ec6fbbbf7b4cffb667079ebaa4986cc964821d0e295e21bfd019560406db` |
| `analysis.json`                    | `ca49f9a5396d913378374468c0db37146be7031e2f6b01f8b131c6b1bc8d7528` |
| `attempt1-supervisor.json`         | `6b1228451ac05115f2ba1c716ba88258b44248f0d1bdd9fa13df8504348014e2` |
| `attempt1-stderr.log`              | `efd7ebe151f2972615179584fff4a02370ca9952ceaa821c795317241e2000b7` |

`artifact-manifest.json` retains hashes for all programs, responses, logs, source
manifest, diff and decoded map. Exact resolved runtime paths, port, process
identity and raw headers remain there rather than in tracked findings.

This is one successful local Vite API producer observation under explicit scratch
and environment overrides, with a failed earlier harness attempt disclosed.
It does not establish response stability across paths, cache states, dependency
updates, absent HMR flags or the unobserved Node 24.18.1 source image. A future
contract decision must account for those boundaries and decide its positive and
negative response requirements; no byte hash or marker has been promoted to
production acceptance here. HTTP status alone, embedded original source and
matching source-map content do not establish that browser bootstrap succeeds.

No decoder, source observer, Node collector, framework, barrel, runtime file,
package, production configuration or controller changed. No browser, API,
upstream, native topology, source-image, performance, parity, installed-host,
full gate, CI, main adoption or deployment acceptance is claimed. Source/config
pins and all 1,318 snapshot files were rechecked unchanged; all research-owned
child and pipe lifecycles have joined. Only document formatting and whitespace
verification apply to this findings-only repository change; no new tests or
production R5 checks were introduced.
