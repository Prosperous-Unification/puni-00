import { describe, expect, test } from 'bun:test';

import { assessWorkerCapability } from './capability';

describe('required worker capability', () => {
  const controlledHost = {
    namespaceProbe: { kind: 'available' } as const,
    cgroupDelegation: { kind: 'available' } as const,
    appArmorProfile: { kind: 'available' } as const,
    fdMountSupport: { kind: 'available' } as const,
  };

  test('does not promote namespace success when cgroup delegation is missing', () => {
    expect(
      assessWorkerCapability({
        ...controlledHost,
        cgroupDelegation: { kind: 'unavailable', reason: 'no delegated quota subtree' },
      }),
    ).toEqual({ kind: 'unavailable', reasons: ['cgroup-delegation: no delegated quota subtree'] });
  });

  test('does not promote namespace success when AppArmor is unconfined', () => {
    expect(
      assessWorkerCapability({
        ...controlledHost,
        appArmorProfile: { kind: 'unavailable', reason: 'unconfined' },
      }),
    ).toEqual({ kind: 'unavailable', reasons: ['apparmor-profile: unconfined'] });
  });

  test('does not promote namespace success when FD and mount isolation is unproven', () => {
    expect(
      assessWorkerCapability({
        ...controlledHost,
        fdMountSupport: { kind: 'unavailable', reason: 'no exact-profile sentinel proof' },
      }),
    ).toEqual({
      kind: 'unavailable',
      reasons: ['fd-mount-support: no exact-profile sentinel proof'],
    });
  });

  test('reports all missing controls without treating an unknown namespace as success', () => {
    expect(
      assessWorkerCapability({
        namespaceProbe: { kind: 'unavailable', reason: 'EPERM' },
        cgroupDelegation: { kind: 'unavailable', reason: 'not delegated' },
        appArmorProfile: { kind: 'unavailable', reason: 'unconfined' },
        fdMountSupport: { kind: 'unavailable', reason: 'not proven' },
      }),
    ).toEqual({
      kind: 'unavailable',
      reasons: [
        'namespace-probe: EPERM',
        'cgroup-delegation: not delegated',
        'apparmor-profile: unconfined',
        'fd-mount-support: not proven',
      ],
    });
  });
});
