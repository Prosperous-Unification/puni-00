import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import {
  planCertificateRotation,
  planControlPlaneExpansion,
  planForgeReplacement,
  planMaintenance,
  planRegistryRecovery,
  planSopsKeyRotation,
  planTokenRotation,
  type ServerHealth,
} from './maintenance';

const healthy: ServerHealth[] = [{ nodeName: 'server-a', ready: true, etcdVoter: true }];
const degraded: ServerHealth[] = [
  ...healthy,
  { nodeName: 'server-b', ready: true, etcdVoter: false },
];
const sha = 'a'.repeat(64);

describe('planControlPlaneExpansion', () => {
  const request = {
    servers: healthy,
    candidate: 'server-b',
    targetServers: 3,
    snapshotReceipt: 'snap-1',
  };

  it('adds one server and names the even-membership transition', () => {
    const plan = planControlPlaneExpansion(request);
    expect(plan.steps[0]).toContain('server-b');
    expect(plan.preconditions.join(' ')).toContain('2 members tolerate no more failures');
  });

  it('refuses an unhealthy member, an even target, a known candidate and no snapshot', () => {
    expect(() =>
      planControlPlaneExpansion({ ...request, servers: degraded, candidate: 'server-c' }),
    ).toThrow(/server-b/);
    expect(() => planControlPlaneExpansion({ ...request, targetServers: 4 })).toThrow(/odd/);
    expect(() => planControlPlaneExpansion({ ...request, candidate: 'server-a' })).toThrow(
      /already/,
    );
    expect(() => planControlPlaneExpansion({ ...request, snapshotReceipt: '' })).toThrow(
      /snapshot/,
    );
  });
});

describe('certificate and key rotation', () => {
  it('rotates certificates serially and requires accepting a single-server outage', () => {
    expect(() =>
      planCertificateRotation({ servers: healthy, snapshotReceipt: 's', acceptApiOutage: false }),
    ).toThrow(/API outage/);
    const plan = planCertificateRotation({
      servers: healthy,
      snapshotReceipt: 's',
      acceptApiOutage: true,
    });
    expect(plan.steps).toContain('server-a: k3s certificate rotate');
    expect(() =>
      planCertificateRotation({ servers: degraded, snapshotReceipt: 's', acceptApiOutage: true }),
    ).toThrow(/not etcd voters/);
  });

  it('rotates the token only after escrow and keeps the old one for older snapshots', () => {
    const request = {
      servers: healthy,
      snapshotReceipt: 's',
      newTokenEscrowSha256: sha,
      oldTokenSha256: 'b'.repeat(64),
    };
    expect(planTokenRotation(request).steps.at(-1)).toContain('keep token');
    expect(() => planTokenRotation({ ...request, newTokenEscrowSha256: '' })).toThrow(/escrow/);
    expect(() => planTokenRotation({ ...request, oldTokenSha256: sha })).toThrow(/equals/);
  });

  it('rotates the SOPS recipient through a two-identity window after escrow', () => {
    const request = {
      cluster: 'platform-local',
      currentRecipients: ['age1old'],
      oldRecipient: 'age1old',
      newRecipient: 'age1new',
      newIdentityEscrowSha256: sha,
    };
    expect(planSopsKeyRotation(request).steps[0]).toContain('both identities');
    expect(() => planSopsKeyRotation({ ...request, newIdentityEscrowSha256: 'later' })).toThrow(
      /escrow/,
    );
    expect(() => planSopsKeyRotation({ ...request, oldRecipient: 'age1other' })).toThrow(
      /does not encrypt/,
    );
  });
});

describe('registry recovery and forge replacement', () => {
  it('requires digest references to prove the registry came back', () => {
    const image = `registry.puni.test/drill@sha256:${sha}`;
    expect(planRegistryRecovery({ backup: 'b', images: [image] }).steps[1]).toContain(image);
    expect(() =>
      planRegistryRecovery({ backup: 'b', images: ['registry.puni.test/drill:1'] }),
    ).toThrow(/digest references/);
    expect(() => planRegistryRecovery({ backup: 'b', images: [] })).toThrow(/digest references/);
  });

  it('requires a fence and pushed worktrees before replacing the forge', () => {
    const request = {
      oldForge: 'forge-a',
      newForge: 'forge-b',
      fence: { state: 'powered-off' as const, fenceId: 'hcloud-poweroff-1' },
      worktrees: [{ slug: 'x', head: 'c1', pushed: 'c1' }],
    };
    expect(planForgeReplacement(request).steps.at(-1)).toContain('retire forge-a');
    expect(() =>
      planForgeReplacement({ ...request, fence: { state: 'running', fenceId: 'f' } }),
    ).toThrow(/not fenced/);
    expect(() =>
      planForgeReplacement({ ...request, worktrees: [{ slug: 'x', head: 'c2', pushed: 'c1' }] }),
    ).toThrow(/unpushed worktrees x/);
  });
});

describe('planMaintenance', () => {
  it('decodes evidence at the file boundary and refuses unknown operations', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'puni-maintenance-'));
    const path = join(directory, 'input.json');
    await writeFile(
      path,
      JSON.stringify({
        operation: 'registry-recovery',
        backup: 'b',
        images: [`r/x@sha256:${sha}`],
      }),
    );
    expect((await planMaintenance(path)).operation).toBe('registry-recovery');
    await writeFile(path, JSON.stringify({ operation: 'registry-recovery', backup: 'b' }));
    expect(planMaintenance(path)).rejects.toThrow(/input is invalid/);
    await writeFile(path, JSON.stringify({ operation: 'reboot-everything' }));
    expect(planMaintenance(path)).rejects.toThrow(/Unknown maintenance operation/);
  });
});
