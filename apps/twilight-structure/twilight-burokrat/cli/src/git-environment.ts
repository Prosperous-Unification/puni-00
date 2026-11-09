/**
 * Create the provider's explicit Git environment from its trusted executable lookup path.
 * Every Git-reading child adds only its operation's verified closure/binding fields; callers
 * must not merge inherited environment. Stable operator-owned candidate metadata remains a premise.
 */
export function createGitEnvironment(path: string): Readonly<Record<string, string>> {
  // Proof: inheriting ambient state or altering each declared Git setting failed the observed ordinary-child environment contract. Reachable hook/fsmonitor/lazy-fetch controls execute their sentinels when broken.
  return {
    PATH: path,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_CONFIG_COUNT: '2',
    GIT_CONFIG_KEY_0: 'core.hooksPath',
    GIT_CONFIG_VALUE_0: '/dev/null',
    GIT_CONFIG_KEY_1: 'core.fsmonitor',
    GIT_CONFIG_VALUE_1: 'false',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_ALLOW_PROTOCOL: '',
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
  // Proof: ignoring the failed version query admitted exit42 with successful-looking stdout; the named failed-query parent test failed.
  if (child.exitCode !== 0)
    throw new Error('cannot inspect required Git version (exit ' + String(child.exitCode) + ')');
  // Proof: admitting arbitrary vendor parentheses failed three malformed-version cases; removing the response guard lost the fixed diagnostic.
  const version =
    /^git version (0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})(?:\.windows\.[0-9]+| \(Apple Git-[0-9]+(?:\.[0-9]+)*\))?\n?$/u.exec(
      child.stdout.toString(),
    );
  if (version === null) throw new Error('Git version response is malformed or unsupported');
  const major = Number(version[1]);
  const minor = Number(version[2]);
  // Proof: removing each numeric-floor arm separately admitted 1.99.0 or 2.35.x in the unsupported-version parent cases.
  if (major < 2 || (major === 2 && minor < 36)) throw new Error('Git 2.36.0 or newer is required');
}
