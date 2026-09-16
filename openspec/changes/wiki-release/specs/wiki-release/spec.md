## ADDED Requirements

### Requirement: The release target packs a toolkit from a tagged clean checkout

The release target SHALL pack, from a clean checkout whose HEAD the tag `wiki-vMAJOR.MINOR.PATCH`
names, exactly `toolkit.json`, `SHA256SUMS`, `launcher.sh`, `snapshotter.ts`, `validator.mjs`,
`prepare-activation.mjs` and `trusted-node-modules/` into `wiki-<tag>.tar`, and SHALL print that
archive's SHA-256. `toolkit.json` SHALL carry the tag, the tag's commit, the pinned Bun version, a
SHA-256 for every role member and the trusted module names.

#### Scenario: A tag at HEAD of a clean checkout

- **WHEN** the target runs against a checkout with no uncommitted or untracked paths whose HEAD the named tag resolves to
- **THEN** it writes `wiki-<tag>.tar` holding exactly those members and prints the tag, the commit and the archive digest
- **AND** the printed digest equals the archive file's SHA-256, and every `toolkit.json` role digest equals its member's bytes

#### Scenario: The toolkit carries nothing that certifies a commit

- **WHEN** the archive is listed
- **THEN** it contains no policy, mapping, authority, binding, evidence, review receipt, manifest or `selected.json`

### Requirement: The release target refuses anything it cannot honestly pack

The release target SHALL refuse, naming the cause, a malformed tag, a tag no commit resolves, a tag
that is not at HEAD, a dirty checkout, an operator Bun other than `.bun-version`, a bundle that is
not standalone and a destination that already holds a toolkit. On any refusal it SHALL write no
archive.

#### Scenario: The checkout is dirty

- **WHEN** a tracked file is modified or an untracked file is present
- **THEN** the target refuses naming the offending paths and writes no archive

#### Scenario: The tag is not at HEAD

- **WHEN** the named tag resolves to a commit other than HEAD
- **THEN** the target refuses naming both commits and writes no archive

#### Scenario: The tag is malformed or unknown

- **WHEN** the tag is `wiki-v1`, or is well-formed but resolves to no commit
- **THEN** the target refuses naming the tag and writes no archive

#### Scenario: The operator runtime is not the pinned one

- **WHEN** the running Bun differs from `.bun-version`
- **THEN** the target refuses naming both versions and writes no archive

### Requirement: A consumer prepares its own activation from the toolkit

The preparer in toolkit mode SHALL prepare an activation from the consumer's committed SHA, that
commit's policy and mapping, the toolkit's launcher, snapshotter, validator and trusted modules, an
operator review record and an operator audit strata file. Before writing the archive it SHALL prove
the result by running the toolkit's launcher against the candidate to `certified: true`.

#### Scenario: A first activation of a consumer commit

- **WHEN** the preparer runs with a toolkit, a clean consumer checkout at a reviewed SHA, that commit's policy and mapping, a review record binding it, and a strata file naming every policy review
- **THEN** it writes an activation root whose manifest `sourceRevision` is that SHA and whose roles come from the toolkit and the commit
- **AND** the toolkit's launcher run against that root and that candidate reports `certified: true`

#### Scenario: The toolkit's provenance is recorded, not trusted

- **WHEN** the preparer writes the activation root
- **THEN** the root carries a `toolkit-release` descriptor naming the toolkit tag and its archive digest
- **AND** no admission decision reads that descriptor

### Requirement: The preparer refuses every attestation it cannot join

The preparer SHALL refuse, naming the cause, a review record that does not bind the candidate, a
strata file that names no stratum for a policy review, a toolkit role whose bytes differ from
`toolkit.json`, and every candidate refusal the relocation mode raises — an unknown or dirty SHA, a
selector that selects nothing, a membership mismatch, and a failed or skipped check.

#### Scenario: The review record binds another candidate

- **WHEN** the supplied review record's candidate identity is not the candidate's
- **THEN** the preparer refuses naming the record and writes no activation

#### Scenario: The strata file omits a policy review

- **WHEN** the audit strata file names no stratum for a review the policy requires
- **THEN** the preparer refuses naming that review id and writes no activation

#### Scenario: A toolkit role was altered after packing

- **WHEN** a toolkit member's bytes differ from its `toolkit.json` digest
- **THEN** the preparer refuses naming that role and writes no activation

### Requirement: The trusted workflow runs the archived launcher and runtime

The trusted workflow SHALL install the launcher the archive root's `launcher-path` names and run
that copy. It SHALL NOT check out the activation version, and SHALL NOT install validator runtime
modules from any source checkout. It SHALL be byte-identical to `apps/wiki/consumer/trusted-wiki.yml`,
and its pinned Bun version SHALL equal `.bun-version`.

#### Scenario: The workflow provisions its launcher from the archive

- **WHEN** the workflow text is read
- **THEN** it reads `launcher-path`, installs that file under the runner temporary directory, and checks out only the candidate
- **AND** it contains no `bun install` and no checkout ref naming `TOOL_WIKI_ACTIVATION_VERSION`

#### Scenario: A consumer copies the workflow unchanged

- **WHEN** `apps/wiki/consumer/trusted-wiki.yml` is compared with `.github/workflows/trusted-wiki.yml`
- **THEN** the bytes are identical, so a consumer needs no edit beyond its three repository variables

### Requirement: The launcher defaults its trusted runtime to the archive root

When an activation root is configured and no runtime override is given, the launcher SHALL resolve
its trusted TypeScript runtime modules to that root's `trusted-node-modules`. It SHALL refuse,
naming the directory, when neither an override nor that directory resolves to a TypeScript install,
and SHALL keep refusing an override that resolves inside the candidate.

#### Scenario: The archive carries the runtime and nothing overrides it

- **WHEN** the activation root holds `trusted-node-modules/typescript` and `TOOL_WIKI_TRUSTED_NODE_MODULES` is unset
- **THEN** the launcher runs its route with those modules

#### Scenario: Neither an override nor an archived runtime exists

- **WHEN** the activation root holds no `trusted-node-modules` and `TOOL_WIKI_TRUSTED_NODE_MODULES` is unset
- **THEN** the launcher refuses non-zero naming `trusted-node-modules` before running any route

#### Scenario: The override points inside the candidate

- **WHEN** `TOOL_WIKI_TRUSTED_NODE_MODULES` resolves under the candidate checkout
- **THEN** the launcher refuses, because candidate bytes are never validator authority

### Requirement: Provisioning refuses an archive the activation version does not name

Both provisioning steps SHALL read the extracted archive's `selected.json`, then that version
directory's `manifest.json`, and SHALL refuse with exit 78 — naming the manifest's source revision
and the configured version — when they differ. They SHALL keep refusing a version that is not
40 hexadecimal characters, and SHALL export the activation root only when both hold.

#### Scenario: The archive certifies another commit

- **WHEN** the extracted archive's selected manifest names a source revision other than `TOOL_WIKI_ACTIVATION_VERSION`
- **THEN** provisioning exits 78 naming both revisions and exports no activation root

#### Scenario: The archive certifies the configured commit

- **WHEN** the extracted archive's selected manifest names exactly the configured version
- **THEN** provisioning exits 0 and exports `TOOL_WIKI_ACTIVATION_ROOT`

#### Scenario: The version is a mutable ref

- **WHEN** `TOOL_WIKI_ACTIVATION_VERSION` is `main`
- **THEN** provisioning exits 78 before downloading or extracting anything

### Requirement: The tag-push workflow is the only writer of releases

The release workflow SHALL run the three uncached bootstrap checks before the release target, SHALL
be the only workflow granted `contents: write`, and SHALL pin every action by 40-hexadecimal SHA.

#### Scenario: A release tag is pushed

- **WHEN** a `wiki-v*` tag is pushed
- **THEN** the workflow runs `wiki-cli` test, source lint and typecheck uncached, then the release target, then uploads the tar and its digest list

#### Scenario: The other workflows stay read-only

- **WHEN** `ci.yml` and `trusted-wiki.yml` permissions are read
- **THEN** both remain `contents: read`

### Requirement: The consumer README states everything a consumer must author

The consumer README SHALL state the three repository variables and their meaning, where
`policy.json`, the module mapping and the relationship facts live, the first-activation recipe, the
`module-index` marker with one minimal example, a link to the runbook's relocation section, and that
the review record and audit strata are operator attestation the preparer validates and never writes.

#### Scenario: A consumer follows the README only

- **WHEN** an operator reads `apps/wiki/consumer/README.md`
- **THEN** it names the three variables, the authored files, the marker shape, the runbook link and the operator-attestation rule
