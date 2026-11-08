import { mock } from 'bun:test';

const digest = `sha256:${'a'.repeat(64)}`;
const image = {
  withLabel: () => image,
  withRegistryAuth: () => image,
  publish: (reference: string) => Promise.resolve(`${reference}@${digest}`),
};
const source = { dockerBuild: () => image };
const client = {
  setSecret: () => 'fixture-secret-id',
  host: () => ({ directory: () => source }),
};
await mock.module('@dagger.io/dagger', () => ({
  connect: (work: (connection: typeof client) => Promise<void>) => work(client),
  ImageLayerCompression: { Gzip: 'Gzip' },
  ImageMediaTypes: { Oci: 'Oci' },
}));
const { publishAll } = await import('./main');
const { renderRelease } = await import('./lib/publish');
const record = await publishAll(['be'], 'legacy');
process.stdout.write(renderRelease(record));
