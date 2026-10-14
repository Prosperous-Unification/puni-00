function requireRecord(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    throw new Error('first-start policy inventory is malformed');
  // Boundary: non-null non-array objects were checked before accessing unknown fields.
  return raw as Record<string, unknown>;
}
function canonical(raw: unknown): string {
  if (Array.isArray(raw)) return `[${raw.map(canonical).join(',')}]`;
  if (typeof raw === 'object' && raw !== null) {
    const fields = requireRecord(raw);
    return `{${Object.keys(fields)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(fields[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(raw);
}
/** All backend-namespace policies must match the trusted fenced inventory; no extra allowance is optional. */
export function assertFirstStartPolicies(
  raw: unknown,
  expected: readonly unknown[],
  labels: Record<string, unknown>,
  fenceName = 'wbs-backend-writers',
): void {
  const rows = requireRecord(raw)['items'];
  if (!Array.isArray(rows)) throw new Error('first-start policy list is malformed');
  const project = (raw: unknown) => {
    const policy = requireRecord(raw);
    const metadata = requireRecord(policy['metadata']);
    if (typeof metadata['name'] !== 'string' || typeof metadata['namespace'] !== 'string')
      throw new Error('first-start policy identity is absent');
    return {
      name: metadata['name'],
      namespace: metadata['namespace'],
      spec: requireRecord(policy['spec']),
    };
  };
  const order = (rows: readonly unknown[]) =>
    rows.map(project).sort((a, b) => a.name.localeCompare(b.name));
  const actual = order(rows);
  const pinned = order(expected);
  // Proof: full-inventory omission admits extra allow policy, opened writer selector and changed/absent default deny.
  if (
    new Set(actual.map((policy) => policy.name)).size !== actual.length ||
    canonical(actual) !== canonical(pinned)
  )
    throw new Error(
      'first-start complete NetworkPolicy inventory differs from trusted fenced render',
    );
  const deny = actual.find((policy) => policy.name === 'default-deny');
  const writer = actual.find((policy) => policy.name === fenceName);
  if (
    deny === undefined ||
    writer === undefined ||
    canonical(deny.spec['podSelector']) !== '{}' ||
    !Array.isArray(deny.spec['policyTypes']) ||
    !deny.spec['policyTypes'].includes('Ingress') ||
    (Object.hasOwn(deny.spec, 'ingress') && canonical(deny.spec['ingress']) !== '[]')
  )
    throw new Error('first-start backend default deny is absent or open');
  // Proof: selected-backend label negative fails if the selector disjointness check is omitted.
  if (
    canonical(writer.spec['podSelector']) !==
      canonical({ matchLabels: { 'puni.dev/writes': 'fenced' } }) ||
    labels['puni.dev/writes'] === 'fenced'
  )
    throw new Error('first-start writer fence selects the backend');
}
