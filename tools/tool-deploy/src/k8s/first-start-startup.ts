function requireRecord(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    throw new Error('first-start startup template is malformed');
  // Boundary: non-null non-array object checked before startup field inspection.
  return raw as Record<string, unknown>;
}
function renderCanonical(raw: unknown): string {
  if (Array.isArray(raw)) return `[${raw.map(renderCanonical).join(',')}]`;
  if (typeof raw === 'object' && raw !== null) {
    const fields = requireRecord(raw);
    return `{${Object.keys(fields)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${renderCanonical(fields[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(raw);
}
function applyDefaults(raw: unknown, values: Record<string, unknown>): Record<string, unknown> {
  return { ...values, ...requireRecord(raw) };
}
function normalizeProbe(raw: unknown): Record<string, unknown> {
  const probe = applyDefaults(raw, {
    initialDelaySeconds: 0,
    timeoutSeconds: 1,
    periodSeconds: 10,
    successThreshold: 1,
    failureThreshold: 3,
  });
  if (Object.hasOwn(probe, 'httpGet'))
    probe['httpGet'] = applyDefaults(probe['httpGet'], { scheme: 'HTTP' });
  return probe;
}
function normalizeContainer(raw: unknown): Record<string, unknown> {
  const container = applyDefaults(raw, {
    imagePullPolicy: 'IfNotPresent',
    terminationMessagePath: '/dev/termination-log',
    terminationMessagePolicy: 'File',
    resources: {},
  });
  for (const field of ['readinessProbe', 'livenessProbe', 'startupProbe'])
    if (Object.hasOwn(container, field)) container[field] = normalizeProbe(container[field]);
  const ports = container['ports'];
  if (Array.isArray(ports))
    container['ports'] = ports.map((raw) => applyDefaults(raw, { protocol: 'TCP' }));
  return container;
}
function normalizeSpec(raw: unknown, isPod: boolean): Record<string, unknown> {
  const spec = applyDefaults(raw, {
    restartPolicy: 'Always',
    dnsPolicy: 'ClusterFirst',
    schedulerName: 'default-scheduler',
    terminationGracePeriodSeconds: 30,
    serviceAccountName: 'default',
    enableServiceLinks: true,
    securityContext: {},
  });
  // Pod serviceAccount is the API's deprecated alias, not a second startup authority.
  if (Object.hasOwn(spec, 'serviceAccount')) {
    if (spec['serviceAccount'] !== spec['serviceAccountName'])
      throw new Error('first-start service account alias differs');
    delete spec['serviceAccount'];
  }
  const containers = spec['containers'];
  if (!Array.isArray(containers)) throw new Error('first-start startup containers are absent');
  spec['containers'] = containers.map(normalizeContainer);
  const volumes = spec['volumes'];
  if (Array.isArray(volumes))
    spec['volumes'] = volumes.map((raw) => {
      const volume = { ...requireRecord(raw) };
      for (const field of ['configMap', 'secret'])
        if (Object.hasOwn(volume, field))
          volume[field] = applyDefaults(volume[field], { defaultMode: 420 });
      return volume;
    });
  if (isPod) {
    delete spec['nodeName'];
    if (spec['priority'] === 0) delete spec['priority'];
    if (spec['preemptionPolicy'] === 'PreemptLowerPriority') delete spec['preemptionPolicy'];
    const tolerations = spec['tolerations'];
    if (Array.isArray(tolerations)) {
      const remaining = tolerations.filter((raw) => {
        const toleration = requireRecord(raw);
        return !(
          ['node.kubernetes.io/not-ready', 'node.kubernetes.io/unreachable'].includes(
            String(toleration['key']),
          ) &&
          renderCanonical(toleration) ===
            renderCanonical({
              key: toleration['key'],
              operator: 'Exists',
              effect: 'NoExecute',
              tolerationSeconds: 300,
            })
        );
      });
      if (remaining.length === 0) delete spec['tolerations'];
      else spec['tolerations'] = remaining;
    }
  }
  return spec;
}
/** Compare all effective startup fields with the trusted digest-bound render; only explicit API defaults and Pod scheduling fields normalize. */
export function assertFirstStartStartup(raw: unknown, trusted: unknown, isPod = false): void {
  const actual = requireRecord(raw);
  const expected = requireRecord(trusted);
  const actualMetadata = requireRecord(actual['metadata']);
  const expectedMetadata = requireRecord(expected['metadata']);
  const labels = { ...requireRecord(actualMetadata['labels']) };
  if (isPod) delete labels['pod-template-hash'];
  // Proof: per-tier init/command/hook/mount/env/probe and actual Pod negatives fail when this comparison is omitted.
  if (
    renderCanonical(labels) !== renderCanonical(expectedMetadata['labels']) ||
    renderCanonical(actualMetadata['annotations'] ?? {}) !==
      renderCanonical(expectedMetadata['annotations'] ?? {}) ||
    renderCanonical(normalizeSpec(actual['spec'], isPod)) !==
      renderCanonical(normalizeSpec(expected['spec'], false))
  )
    throw new Error('first-start effective startup differs from trusted tier render');
}
