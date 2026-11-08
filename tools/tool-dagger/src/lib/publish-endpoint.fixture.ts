import { mock } from 'bun:test';

const effects: string[] = [];
const unexpected = () => {
  throw new Error('Unexpected publication effect');
};
await mock.module('@tools/registry-publication', () => ({
  admitExportScratch: () => {
    effects.push('admission');
    throw new Error('Observed matching admission');
  },
  checkExportScratch: unexpected,
  connectRegistryAuthority: unexpected,
  inspectOciArchive: unexpected,
  publishArtifacts: unexpected,
  uploadArtifact: unexpected,
}));
const { publishManagedRelease } = await import('./publish');
const enrolledUrl = 'https://registry.example';
const enrollment = {
  schemaVersion: 1 as const,
  registryUrl: enrolledUrl,
  registryId: 'proof',
  authorityMachineId: '0'.repeat(32),
  registryPath: '/registry',
  journalPath: '/journal',
  sshHost: 'unused',
  owner: 'proof',
  product: 'wbs',
  requiredRepositories: ['wbs-be-01'],
  builder: {
    uid: 59001,
    machineId: '0'.repeat(32),
    path: '/not-used',
    receiptPath: '/not-used',
    maximumBytes: 1024,
    maximumInodes: 1,
    excludedFilesystems: [],
  },
};
const exportTier = () => {
  effects.push('export');
  return Promise.reject(new Error('Unexpected export'));
};
async function refusal(registryUrl: string, url: string) {
  return publishManagedRelease(
    { ...enrollment, registryUrl },
    { url },
    ['be'],
    'proof',
    exportTier,
  ).then(
    () => 'ACCEPTED',
    (cause: unknown) => String(cause),
  );
}
for (const [name, registryUrl, endpoint] of [
  ['foreign', enrolledUrl, 'https://foreign.example'],
  ['scheme mismatch', enrolledUrl, 'http://registry.example'],
  ['path mismatch', enrolledUrl, 'https://registry.example/alternate'],
] as const) {
  const observed = await refusal(registryUrl, endpoint);
  if (
    !observed.includes('Managed publication endpoint differs from enrolled registry') ||
    effects.length !== 0
  )
    throw new Error(JSON.stringify({ name, observed, effects }));
}
const matching = await refusal(enrolledUrl, enrolledUrl);
if (
  !matching.includes('Observed matching admission') ||
  JSON.stringify(effects) !== '["admission"]'
)
  throw new Error(JSON.stringify({ matching, effects }));
console.log('3 endpoint refusals: zero effects; matching endpoint reaches admission');
