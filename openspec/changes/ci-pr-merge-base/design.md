## Boundary

`resolvePrBase` accepts the run environment and reads local Git objects. It validates `EVENT_NAME=pull_request`, full lowercase `GITHUB_SHA` and `PR_HEAD_SHA`, positive decimal `PR_NUMBER`, and exactly `refs/pull/<number>/merge`. It requires local HEAD to equal the run SHA. Raw commit headers avoid shallow-boundary parent hiding; Git replacement objects are disabled. Exactly two parent identities must exist, both must be readable commits, and the second must equal the payload head. Only then does the callable return the first parent and the CLI write it to stdout.

The payload base is deliberately irrelevant: it may predate the base actually incorporated in this immutable synthetic merge. No remote or mutable branch participates in resolution, including reruns after main advances.

## Consumers

1. Gate mode resolves before writing affected scope or base outputs and before querying Nx. The workspace job resolves again in its own checkout and requires its received `GATE_BASE` to equal that base before entering the existing status-capturing Nx/annotation block.
2. Pixels mode resolves before asking Nx for the browser boot-set membership. Scope failure remains a failure of the required `pixels` aggregate.
3. Corpus PR selection calls the same function; push-before, merge-group merge-base and dispatch merge-base behavior remains as before.

GitHub supplies `GITHUB_SHA` and `GITHUB_REF` to every runner. Payload head and number enter shell steps through environment fields. Resolver command substitution runs with `set -euo pipefail`; workspace validation occurs before its intentional `set +e` target-status capture.

## Proof strategy

Create real divergent Git histories with stale payload bases and actual two-parent merges. Exercise the CLI, callable via corpus and extracted production YAML shell steps. Stub Nx only to record its received boundary and exercise membership; stub annotations only for the workspace test. Inject wrong identities, wrong checkout/head/ref/topology, absent/corrupt objects, consumer regressions and swallowed failures into production sources. Required aggregate pins and non-PR selector tests remain in the focused suite.
