/**
 * Require the privilege profile that preserves an empty mount view's filesystem confinement.
 * The caller supplies one kernel status sample and separately proves one task and path identity.
 * All real/effective/saved/filesystem UIDs must be nonzero uint32 values excluding Linux's
 * invalid-UID sentinel. Effective, permitted and ambient capabilities must be empty;
 * NoNewPrivs must prevent exec from regaining setuid/file capabilities. Inheritable and
 * bounding masks are validated but may retain bits because they grant no active capability
 * under that profile. Missing, duplicate, multiline or malformed required fields throw.
 * The 1 MiB text-validation limit accommodates a kernel NGROUPS_MAX Groups line;
 * it bounds parsing, not the caller's status read allocation.
 * @see https://docs.kernel.org/userspace-api/no_new_privs.html
 * @see https://man7.org/linux/man-pages/man7/capabilities.7.html
 * @see https://man7.org/linux/man-pages/man5/proc_pid_status.5.html
 */
export function assertUnprivilegedProcess(status: string): void {
  // Proof: raising this cap certifies the oversized status in registry-process-privileges.test.ts.
  if (Buffer.byteLength(status, 'utf8') > 1024 * 1024)
    throw new Error('Empty-view process status exceeds bound');
  const lines = status.split('\n');
  const readField = (name: string, syntax: RegExp): string => {
    // Proof: safe-default and first-occurrence mutations certify missing/duplicate fields;
    // dropping syntax validation certifies malformed CapBnd in the production-caller tests.
    const observations = lines.filter((line) => line.startsWith(`${name}:`));
    const value = observations.length === 1 ? observations[0]?.slice(name.length + 1) : undefined;
    if (value === undefined || !syntax.test(value))
      throw new Error(`Incomplete empty-view process privilege observation: ${name}`);
    return value.trim();
  };
  const uids = readField('Uid', /^[ \t]+[0-9]+(?:[ \t]+[0-9]+){3}$/)
    .split(/[ \t]+/)
    .map(Number);
  // Proof: removing each bound certifies UID0 in all four slots or invalid/overflow UIDs
  // through readRegistryWriters in registry-process-privileges.test.ts.
  if (uids.some((uid) => uid <= 0 || uid >= 4294967295))
    throw new Error('Empty process mount visibility requires nonzero UIDs');
  for (const name of ['CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb']) {
    const mask = readField(name, /^[ \t]+[0-9a-fA-F]{16}$/);
    // Proof: independently excluding each active set certifies its retained-capability caller case.
    if (
      (name === 'CapPrm' || name === 'CapEff' || name === 'CapAmb') &&
      mask !== '0000000000000000'
    )
      throw new Error(`Empty process mount visibility requires zero ${name}`);
  }
  // Proof: accepting zero certifies the NoNewPrivs0 caller case despite otherwise empty capabilities.
  if (readField('NoNewPrivs', /^[ \t]+[01]$/) !== '1')
    throw new Error('Empty process mount visibility requires NoNewPrivs');
}
