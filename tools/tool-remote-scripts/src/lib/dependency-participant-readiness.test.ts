import { rejects } from 'node:assert/strict';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { participantActivationFixture } from '../fixtures/dependency-participant-restoration';
import { roots } from '../fixtures/source-startup';
import { prepareActivatedParticipantsUnderOwner } from './complete-dependency-exclusion';
import { assertParticipantImage } from './dependency-participant-images';
import { readParticipantSnapshot } from './dependency-participant-transition';
import { withDependencyOwner } from './edge-ownership';
import { readFields } from './managed-cohort';

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  delete process.env['WBS_EDGE_STATE'];
});
for (const role of ['backend', 'gateway'] as const)
  for (const fault of [
    'missing-label',
    'wrong-label',
    'wrong-image-id',
    'working-directory',
    'entrypoint',
    'shadow-mount',
  ] as const)
    test(`participant ${role} ${fault} refuses before ingress or irreversible activation`, async () => {
      const fixture = await participantActivationFixture();
      process.env['WBS_EDGE_STATE'] = fixture.root;
      const subject = fixture[role];
      const image = fixture.images.get(subject.Image);
      if (image === undefined) throw new Error('fixture immutable image missing');
      if (fault === 'missing-label') image.Config.Labels = {} as { WBS_SHA: string };
      if (fault === 'wrong-label') image.Config.Labels.WBS_SHA = 'f'.repeat(40);
      if (fault === 'wrong-image-id') image.Id = 'sha256:' + 'f'.repeat(64);
      if (fault === 'working-directory') readFields(subject.Config)['WorkingDir'] = '/foreign';
      if (fault === 'shadow-mount')
        subject.Mounts.push({
          Type: 'bind',
          Source: fixture.sourceRoot,
          Destination: '/app',
          RW: false,
        });
      if (fault === 'entrypoint') readFields(subject.Config)['Entrypoint'] = ['/foreign'];
      const docker: typeof fixture.ports.docker = async (args, signal) => {
        const response = await fixture.ports.docker(args, signal);
        if (args.includes('reload')) throw new Error('image fault reached ingress effects');
        return response;
      };
      await rejects(
        withDependencyOwner(
          fixture.request.owner,
          (owner) =>
            prepareActivatedParticipantsUnderOwner(
              owner,
              fixture.request,
              fixture.layouts,
              performance.now() + 300000,
              fixture.root,
              { ...fixture.ports, docker },
            ),
          fixture.root,
        ),
      );
      expect(
        fixture.commands.some(
          (args) => args.includes('reload') || ['start', 'rm', 'restart'].includes(args[0]),
        ),
      ).toBe(false);
      expect(
        (await readdir(fixture.root)).some((name) => name.startsWith('dependency-activation-')),
      ).toBe(false);
    }, 300000);

test('product image provenance and exact existing launch contracts accept actual positive fixture observations', async () => {
  const fixture = await participantActivationFixture();
  for (const role of ['backend', 'gateway'] as const) {
    const subject = fixture[role];
    assertParticipantImage(readParticipantSnapshot(subject), [fixture.images.get(subject.Image)], {
      role,
      imageId: subject.Image,
      reference: subject.Config.Image,
      sourceSha: fixture.request.owner.sha,
      backendColor: fixture.request.prod.backend.color,
      dataDirectory: join(fixture.layouts.prod.root, 'data'),
    });
  }
  expect(fixture.commands).toHaveLength(0);
});
