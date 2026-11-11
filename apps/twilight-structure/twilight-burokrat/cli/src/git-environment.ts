/**
 * Create the provider's explicit Git environment from its trusted executable lookup path.
 * Every Git-reading child adds only its operation's verified closure/binding fields; callers
 * must not merge inherited environment. Stable operator-owned candidate metadata remains a premise.
 */
export function createGitEnvironment(path: string): Readonly<Record<string, string>> {
  // Proof: inheriting ambient state or altering each declared Git setting failed the observed ordinary-child environment contract. Reachable hook/fsmonitor/lazy-fetch controls execute their sentinels when broken.
  return {
    // Proof: git-inherit-ambient; `Burokrat verified parent runtime > gives every ordinary Git process only the declared runtime environment` fails with this injected fault and passes after restoration.
    // Proof: git-inherit-ambient; `Burokrat verified parent runtime > gives every ordinary Git process only the declared runtime environment` fails with this injected fault and passes after restoration.
    PATH: path,
    // Proof: git-global-config; `Burokrat verified parent runtime > gives every ordinary Git process only the declared runtime environment` fails with this injected fault and passes after restoration.
    GIT_CONFIG_GLOBAL: '/dev/null',
    // Proof: git-system-config; `Burokrat verified parent runtime > gives every ordinary Git process only the declared runtime environment` fails with this injected fault and passes after restoration.
    GIT_CONFIG_SYSTEM: '/dev/null',
    // Proof: git-config-count; `Burokrat verified parent runtime > gives every ordinary Git process only the declared runtime environment` fails with this injected fault and passes after restoration.
    GIT_CONFIG_COUNT: '2',
    // Proof: git-hook-key; `Burokrat verified parent runtime > disables an actually reachable candidate post-index-change program` fails with this injected fault and passes after restoration.
    GIT_CONFIG_KEY_0: 'core.hooksPath',
    // Proof: git-hook-value; `Burokrat verified parent runtime > gives every ordinary Git process only the declared runtime environment` fails with this injected fault and passes after restoration.
    GIT_CONFIG_VALUE_0: '/dev/null',
    // Proof: git-fsmonitor-key; `Burokrat verified parent runtime > disables an actually reachable candidate fsmonitor program` fails with this injected fault and passes after restoration.
    GIT_CONFIG_KEY_1: 'core.fsmonitor',
    // Proof: git-fsmonitor-value; `Burokrat verified parent runtime > gives every ordinary Git process only the declared runtime environment` fails with this injected fault and passes after restoration.
    GIT_CONFIG_VALUE_1: 'false',
    // Proof: git-replacements; `Burokrat verified parent runtime > gives every ordinary Git process only the declared runtime environment` fails with this injected fault and passes after restoration.
    GIT_NO_REPLACE_OBJECTS: '1',
    // Proof: git-protocols; `Burokrat verified parent runtime > denies a reachable lazy-fetch remote helper for a missing promised object` fails with this injected fault and passes after restoration.
    GIT_ALLOW_PROTOCOL: '',
    // Proof: git-prompts; `Burokrat verified parent runtime > gives every ordinary Git process only the declared runtime environment` fails with this injected fault and passes after restoration.
    GIT_TERMINAL_PROMPT: '0',
  };
}

/**
 * Require a supported released Git before reading candidate metadata. Git before 2.36 can
 * interpret false as a filesystem-monitor hook pathname.
 * @throws when the required executable/query fails, the version is unrecognized, or Git is too old.
 */
export function assertGitVersion(
  directory: string,
  environment: Readonly<Record<string, string>>,
): void {
  let child: Bun.ReadableSyncSubprocess;
  try {
    child = Bun.spawnSync(['git', '--version'], {
      cwd: directory,
      env: environment,
      stdout: 'pipe',
      stderr: 'pipe',
    });
  } catch (cause) {
    throw new Error('cannot inspect required Git version', { cause });
  }
  assertGitVersionResponse(child.exitCode, child.stdout.toString());
}

/** Validate the exact response of an already-settled version probe without owning a process. */
export function assertGitVersionResponse(exitCode: number | null, output: string): void {
  // Proof: ignoring the failed version query admitted exit42 with successful-looking stdout; the named failed-query parent test failed.
  // Proof: git-query-status; `Burokrat verified parent runtime > refuses a failed Git version query without parsing its successful-looking stdout` fails with this injected fault and passes after restoration.
  if (exitCode !== 0)
    throw new Error('cannot inspect required Git version (exit ' + String(exitCode) + ')');
  // Proof: admitting arbitrary vendor parentheses failed three malformed-version cases; removing the response guard lost the fixed diagnostic.
  const version =
    // Proof: git-vendor-grammar; `Burokrat verified parent runtime > refuses malformed version response "git version 2.43.0 (Unknown Vendor)"` fails with this injected fault and passes after restoration.
    /^git version (0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})(?:\.windows\.[0-9]+| \(Apple Git-[0-9]+(?:\.[0-9]+)*\))?\n?$/u.exec(
      output,
    );
  // Proof: git-response-grammar; `Burokrat verified parent runtime > refuses malformed version response "not Git"` fails with this injected fault and passes after restoration.
  if (version === null) throw new Error('Git version response is malformed or unsupported');
  const major = Number(version[1]);
  const minor = Number(version[2]);
  // Proof: removing each numeric-floor arm separately admitted 1.99.0 or 2.35.x in the unsupported-version parent cases.
  // Proof: git-major-floor; `Burokrat verified parent runtime > refuses unsupported git version 1.99.0 before querying the repository or launching a validator` fails with this injected fault and passes after restoration.
  // Proof: git-major-floor; `Burokrat verified parent runtime > refuses unsupported git version 1.99.0 before querying the repository or launching a validator` fails with this injected fault and passes after restoration.
  // Proof: git-minor-floor; `Burokrat verified parent runtime > refuses unsupported git version 2.35.1 before querying the repository or launching a validator` fails with this injected fault and passes after restoration.
  if (major < 2 || (major === 2 && minor < 36)) throw new Error('Git 2.36.0 or newer is required');
}
