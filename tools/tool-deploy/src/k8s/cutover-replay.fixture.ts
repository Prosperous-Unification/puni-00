import { createCutoverIdentity } from './cutover-replay';
import type { ReleaseDescriptor } from './descriptor';
import { sha256Of } from './migration-capture';

export const fixtureBackend = `registry.test/be@sha256:${'1'.repeat(64)}`;
export const fixtureOldBackend = `localhost:5000/be@sha256:${'1'.repeat(64)}`;
export const fixtureDescriptor: ReleaseDescriptor = {
  schemaVersion: 1,
  sourceSha: 'a'.repeat(40),
  images: {
    backend: fixtureBackend,
    gateway: fixtureBackend,
    frontend: fixtureBackend,
    mcp: fixtureBackend,
  },
  evidence: { gate: { runId: 7, job: 'gate' }, browser: { runId: 7, job: 'pixels' } },
  admission: {
    package: {
      name: 'twilight-burokrat',
      version: '0.1.0',
      integrity: `sha512-${'c'.repeat(86)}==`,
      toolkitIdentity: 'd'.repeat(64),
    },
    activation: { version: 'e'.repeat(40), manifestIdentity: 'f'.repeat(64) },
  },
};
export const fixtureDescriptorBytes = JSON.stringify(fixtureDescriptor);
export function fixtureCutoverIdentity() {
  return createCutoverIdentity(
    fixtureDescriptorBytes,
    sha256Of(fixtureDescriptorBytes),
    fixtureOldBackend,
    fixtureBackend,
  );
}
