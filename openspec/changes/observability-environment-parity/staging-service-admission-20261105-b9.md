# Task 110 frozen request and component admission review

**Verdict: approve one staging-channel component attempt for nonce `b9e947f9160280e3160eb81fc3934d00`, using the exact frozen request and reviewed cached operator command.** The operator and source must still pass their fresh guarded preflights at launch. Stop on any refusal; no replay or replacement nonce is authorized by this review. This is not full-platform acceptance, debt settlement, raw/ISO work, inode drain, guest or deployment authority.

## Exact binding

Fresh read-only hashes match:

| Artifact                     | SHA256                                                             |
| ---------------------------- | ------------------------------------------------------------------ |
| Launch plan, 6210 bytes      | `d82c5ca9a47fdbcd1c92b21d1a11c108df9178506d47560fadc485958dc279df` |
| Preparation, 5683 bytes      | `35cfd81a4313fb1732a9cc9a15fb2b768ec0fb411945eda44c8c29f5c17a4175` |
| Technical review, 2038 bytes | `d2ba97819c42a300c6e5c4ea23f444bbb44ffcdaf78930b68a83e45b2575cb00` |
| Canonical request            | `185431eac16f2aee6812526106c872cd5166001255d165761f975931e01bdcd5` |
| Private filled builder       | `780c6926913173b5a2708826bf0aae94e5d9d46598d16fda581d20b1b9f6ee76` |
| Cached command body          | `277640069046a91f6fc7ec7bd93686528778aa2183041fb553f034213d7b8b06` |

The request is `/home/df/.codex/worktrees/aa39/puni-00/.superpowers/sdd/observability-environment-parity/repair-native-controls/request-b9e947f9160280e3160eb81fc3934d00.json`. It is exactly canonical JSON plus space padding to65536 bytes, with65536 allocated bytes, device66307/inode18897976, UID1000/mode0600/single-link. Current metadata exactly matches the original identity recorded by preparation and the launch plan. Its SHA was rechecked unchanged after the independent metadata audit.

Preparation, technical review, plan and request agree on nonce, source commit, builder SHA, inventory and ledger. Preparation and technical review agree on source digest `5344e93ebe19171bb46e35cb94ec5ed5b65e8d3bb05d5ee70a3ae4db34f111f6`; independent hashing of the86 canonical pins reproduces that digest. Plan freshReview exactly equals the actual technical preflight record.

Fresh Git HEAD is `9c4f86db239974ffddc94f35120af0c90995d254`, status is clean, and independently hashed Git blobs for all8 production sources match that commit's tree. The filled builder and command remain the exact bytes approved in the initial review: only the3 approved template substitutions, followed by the reviewed single-buffer bootstrap with its original deadline prefix. This approval changes only the action argument from `prepare` to **`launch`**. It binds the same cached `-c` body and private builder SHA, exact cwd, Python3.12/-I/-B, C locale and existing operator-owned manager environment. No bootstrap-path reread is approved.

## Independent proper-host checks

A read-only audit running as effective UID1000 on the proper host independently opened and hashed every pin with original-FD/path stability checks. All86 matched declared bytes, SHA, mode and owner:8 fixed sources,7 fixed tools and71 runtime files. Source order and tool paths are exact. Source files belong to UID1000; installed tools/runtime belong to root. Current kernel release/version/machine equal the request and actual technical review. This confirms pinned file identity; the actual producer-used imported/map closure was established by the approved preparation/review code and will be checked again at launch.

Both fixtures remain empty, private0700 directories on device66307, UID1000, with4096 allocated bytes each:

- Live: inode18897972, `staging-b9e947f9160280e3160eb81fc3934d00-live`.
- Dead: inode18897974, `staging-b9e947f9160280e3160eb81fc3934d00-dead`.

Each request identity matches its actual directory and the preparation record's exclusive-mkdir lineage. No creator-PID assertion is used.

Independent bounded reservation-metadata enumeration found exactly the original pending a2f record, with matching canonical request/source provenance and no `release.json`. Its G is141754548224; the whole ledger digest is `aacf447c85e7d99f92a2276621618e452d6be8935e9c273f008e4cd135250e10`, matching request and technical review. No additional pending debt was omitted and no release credit was taken.

The full two-root inventory was produced and freshly matched by the actual approved prepare/review paths: digest `cd54cde69b57acdd5ac004c60965ad4790889690f2f9f1d77c4489bb52c6ec05`,6401 entries, retained9496350720 bytes and outside110194688 bytes. I joined these actual records rather than rerunning the full helper preflight or6401-entry inventory. Launch must freshly re-establish this exact inventory under its original state lock.

## Allocation and capacity

Independent packet metadata traversal reproduced56 entries and577536 metadata bytes. The only fixture exemption is the12 exact old terminal-receipt-bound file inodes totaling1544192 bytes, within2097152; all directory and other allocations stay charged. The old terminal receipt SHA and each exempt inode/device/size/allocation/owner/mode were checked without reading fixture/raw payloads.

The complete future charge is331776 bytes, so577536+331776=909312≤1048576, leaving139264 bytes. The actual recorded precreation calculation is503808+331776+90112=925696. The final calculation includes the actual65536-byte request and two4096-byte fixture directories. Additional uncharged retained artifacts remain forbidden.

Independent current proper-host readings and arithmetic passed:

| Quantity                      | Observed/projected |       Required limit |
| ----------------------------- | -----------------: | -------------------: |
| Free backing                  |       212007735296 | at least195478405120 |
| MemAvailable                  |        12910821376 |   at least2818572288 |
| Outside plus future           |          146960384 |     at most167772160 |
| Retained plus staging reserve |         9664122880 |   at most10737418240 |

The backing floor includes50GiB + the full ledger G +36765696 future bytes. Memory is the2.625GiB component initial floor. The measured memory does **not** satisfy the separate16GiB full-platform floor, and no full-platform acceptance is claimed. Both roots were observed on device66307. These readings are time-specific; the mandatory fresh launch checks remain authoritative for proceeding.

## One-attempt scope and limits

Approval is solely for these two sequential fresh units:

- `puni-staging-live-b9e947f9160280e3160eb81fc3934d00.service`
- `puni-staging-dead-b9e947f9160280e3160eb81fc3934d00.service`

Use the plan's exact six-field approval object: schemaVersion1, sourceCommit, builderSha256, nonce, requestSha256 and approved=true, with the values bound above. During this review, approval/attempt/capture markers were absent. The exclusive one-use marker and all source refusal checks remain required. The operator releases only its original preflight FD; the source independently acquires and retains its own actual state lock.

Planned limits remain coordinator/client128MiB, service256MiB,1CPU,32pids, service10s, source work12s/hard20s and operator45s including reserved cleanup/publication. Source joint output stays65536 bytes; outer output4096; metadata1MiB; fixtures2MiB. Effective native limits, actual socket forwarding, live adoption/dead refusal, authentic pre-exit counters, four durable/terminal projections and repeated original-owned cleanup must be established by this attempt and its terminal audit. They are not certified before execution.

Keep state/plan roots frozen until the source CLI is terminal. No native operation was performed in this review. No source/helper entry, test, preflight rerun, manager command, raw payload read or watched-root write occurred. Only independent read/hash/stat/metadata arithmetic and this bounded `/tmp` report were performed. Root retains the sole launch and terminal audit; any refusal ends this attempt without retry or debt credit.
