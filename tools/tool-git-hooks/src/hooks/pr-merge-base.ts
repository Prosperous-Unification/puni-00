type Environment = Readonly<Record<string, string | undefined>>;

// Proof: relaxing each identity guard failed the corresponding CLI missing/invalid
// cases; event 2, SHA 1, head SHA 1, number 3 and ref 1 failures (30-case suite).
function requireValue(environment: Environment, name: string, pattern: RegExp): string {
  const value = environment[name];
  if (value === undefined || !pattern.test(value)) throw new Error(`Invalid or missing ${name}`);
  return value;
}

function readGit(...args: string[]): string {
  // Proof: removing --no-replace-objects selected the replacement parent;
  // `reads original commit parents` failed (31 pass / 1 fail).
  const invocation = Bun.spawnSync(['git', '--no-replace-objects', ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  // Proof: suppressing Git failure accepted all four absent/corrupt parent
  // faults (28 pass / 4 fail in the 32-case suite).
  if (invocation.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${invocation.stderr.toString().trim()}`);
  }
  return invocation.stdout.toString().trim();
}

/**
 * Returns the actual base parent of a checked-out GitHub PR synthetic merge.
 *
 * The payload base can predate the merge's first parent. Neither that payload
 * value nor a mutable branch is a boundary. Reads local commit objects only;
 * throws before producing a base for missing identity, mismatched checkout/head,
 * invalid merge ref, unreadable parents or topology other than two parents.
 * Callers must propagate failure before scheduling affected work.
 */
export function resolvePrBase(environment: Environment): string {
  requireValue(environment, 'EVENT_NAME', /^pull_request$/);
  const sha = requireValue(environment, 'GITHUB_SHA', /^[0-9a-f]{40}$/);
  const head = requireValue(environment, 'PR_HEAD_SHA', /^[0-9a-f]{40}$/);
  const number = requireValue(environment, 'PR_NUMBER', /^[1-9][0-9]*$/);
  const ref = requireValue(environment, 'GITHUB_REF', /^refs\/pull\/[1-9][0-9]*\/merge$/);
  // Proof: removing the ref/number comparison failed the wrong-number case (29/1).
  if (ref !== `refs/pull/${number}/merge`) throw new Error('GITHUB_REF does not match PR_NUMBER');
  // Proof: removing checkout equality accepted a different HEAD (29 pass / 1 fail).
  if (readGit('rev-parse', '--verify', 'HEAD') !== sha) {
    throw new Error('Checked-out HEAD does not match GITHUB_SHA');
  }
  // Read raw headers: rev-list/show can hide parents at a shallow boundary.
  const commit = readGit('cat-file', 'commit', sha);
  const headers = commit.split('\n\n')[0];
  const parents = headers
    .split('\n')
    .filter((line) => line.startsWith('parent '))
    .map((line) => line.slice(7));
  const [base, parentHead] = parents;
  // Proof: removing the count guard accepted an octopus commit (29 pass / 1 fail).
  if (parents.length !== 2) {
    throw new Error('PR synthetic merge must have exactly two parents');
  }
  // Proof: removing head equality accepted a wrong payload head in the CLI, corpus
  // and both scope scripts (26 pass / 4 fail in the 30-case suite).
  if (parentHead !== head) throw new Error('Second merge parent does not match PR_HEAD_SHA');
  for (const parent of parents) {
    // Proof: removing this read accepted missing and corrupt objects for each
    // parent; the four real-history negatives failed (26 pass / 4 fail).
    readGit('cat-file', '-e', `${parent}^{commit}`);
  }
  return base;
}

if (import.meta.main) process.stdout.write(`${resolvePrBase(process.env)}\n`);
