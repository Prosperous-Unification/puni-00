/** Both values come from fresh /proc namespace links. A different native UTS namespace is mandatory before sethostname; a hostname string alone proves no isolation. */
export function requireRegistryBackupNamespace(self: string, parent: string): void {
  // Proof: modeled missing/shared/wrong-kind namespace inputs all passed the RED predicate; native launcher removal proof remains in the isolated host fixture.
  if (
    !/^uts:\[[1-9][0-9]{0,19}\]$/.test(self) ||
    !/^uts:\[[1-9][0-9]{0,19}\]$/.test(parent) ||
    self === parent
  )
    throw new Error('Backup worker lacks its private UTS namespace');
}
