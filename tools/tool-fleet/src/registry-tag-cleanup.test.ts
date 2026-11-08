import { expect, test } from 'bun:test';

import { observeRegistryTag, registryTagFaults } from './registry-tag-observation.fixture';

for (const fault of registryTagFaults)
  test('tag cleanup fault exact ready/terminal boundary ' + fault, async () => {
    const proof = await observeRegistryTag({ fault });
    const originalMode = ['private-mode', 'mode-drift', 'restore-noop', 'restore-widen'].includes(
      fault,
    )
      ? 0o600
      : fault === 'unsupported-mode'
        ? 0o666
        : 0o644;
    const digest = 'sha256:' + 'a'.repeat(64);
    expect(proof.originalMode).toBe(originalMode);
    expect(proof.readyModes.every((mode) => mode === 0)).toBe(true);
    if (
      [
        'caller',
        'caller-action',
        'caller-namespace',
        'open',
        'backup',
        'plan',
        'pending-state',
        'unsupported-mode',
        'owner',
        'bytes',
        'mode-drift',
        'changed-before',
        'server-uid',
        'ready-missing',
        'reporter',
        'close',
      ].includes(fault)
    )
      expect(proof.ready).toBe(false);
    expect(proof.restoreStates.every(Boolean)).toBe(true);
    if (
      fault === 'normal' ||
      fault === 'recovery-mode' ||
      fault === 'restore-kill-mode' ||
      fault === 'server-signaled' ||
      fault === 'private-mode'
    ) {
      expect(proof.state).toBe('fulfilled');
      expect(proof.value).toBe('verified');
      expect(proof.ready).toBe(true);
      expect(proof.records).toEqual([
        {
          tagCleanup: {
            injected: true,
            revisionAbsent: true,
            tagUnchanged: true,
            modeRestored: true,
            originalMode,
            restoredMode: originalMode,
            serverPid: 123,
            serverTerminal: true,
            serverExitCode: fault === 'server-signaled' ? 137 : 0,
            serverSignal: fault === 'server-signaled' ? 'SIGKILL' : null,
            groupAbsent: true,
          },
        },
      ]);
    } else {
      const messages = {
        'mode-drift': 'changed before ready',
        'unsupported-mode': 'owned link metadata',
        'restore-noop': 'mode restoration is unconfirmed',
        'restore-widen': 'mode restoration is unconfirmed',
        caller: 'exact private fixture',
        'caller-action': 'exact private fixture',
        'caller-namespace': 'exact private fixture',
        'close-only': 'fixed close failure',
        'report-only': 'fixed reporter failure',
        'restore-only': 'fixed restore failure',
        open: 'private injected dispatch failure',
        backup: 'matching durable backup',
        plan: 'durable plan',
        owner: 'owned link metadata',
        bytes: 'original revision and tag bytes',
        'not-unlinked': 'actual partial unlink',
        dispatch: 'private injected dispatch failure',
        reporter: 'Tag dispatch and observation failed',
        close: 'Tag observation and descriptor cleanup failed',
        'server-unconfirmed': 'server cleanup is unconfirmed',
        'group-alive': 'server cleanup is unconfirmed',
        'group-access': 'fixed group observation',
        'server-uid': 'actual UID59001',
        'pending-state': 'exact pending deletion',
        'changed-before': 'changed before ready',
        'changed-after': 'actual partial unlink',
        'ready-missing': 'actual partial unlink',
        'ready-failure': 'private injected dispatch failure',
        'revision-access': 'fixed revision access',
        'reporter-after': 'Tag dispatch and observation failed',
        'restore-failure': 'Tag dispatch and observation failed',
      };
      expect(proof.state).toBe('rejected');
      expect(proof.message).toContain(messages[fault]);
      const stages = {
        'mode-drift': 'ready-link',
        'unsupported-mode': 'metadata',
        'restore-noop': 'restore',
        'restore-widen': 'restore',
        caller: 'caller',
        'caller-action': 'caller',
        'caller-namespace': 'caller',
        'close-only': 'close',
        'report-only': 'report',
        'restore-only': 'restore',
        open: 'open',
        backup: 'backup',
        plan: 'plan',
        owner: 'metadata',
        bytes: 'bytes',
        'not-unlinked': 'postconditions',
        dispatch: 'dispatch',
        reporter: 'dispatch',
        close: 'dispatch',
        'server-unconfirmed': 'post-observation',
        'group-alive': 'post-observation',
        'group-access': 'post-observation',
        'server-uid': 'ready-owner',
        'pending-state': 'pending',
        'changed-before': 'ready-link',
        'changed-after': 'postconditions',
        'ready-missing': 'postconditions',
        'ready-failure': 'ready-publish',
        'revision-access': 'post-observation',
        'reporter-after': 'dispatch',
        'restore-failure': 'dispatch',
      };
      expect(proof.diagnostic).toMatchObject({ stage: stages[fault] });
      expect(JSON.stringify(proof.diagnostic)).not.toContain('private');
      expect(JSON.stringify(proof.diagnostic)).not.toContain(proof.directory);
      expect(JSON.stringify(proof.diagnostic)).not.toContain(digest);
      if (
        [
          'caller',
          'caller-action',
          'caller-namespace',
          'open',
          'backup',
          'plan',
          'pending-state',
        ].includes(fault)
      )
        expect(proof.diagnostic).toMatchObject({ metadata: null });
      else
        expect(proof.diagnostic).toMatchObject({
          metadata: {
            regular: true,
            uid59001: fault !== 'owner',
            gid59001: true,
            singleLink: true,
            digestSize: true,
            mode: originalMode,
          },
        });
      if (['caller', 'caller-action', 'caller-namespace'].includes(fault)) {
        expect(proof.records).toEqual([]);
        expect(proof.opened).toBe(false);
        expect(proof.spawned).toBe(false);
      }
      if (fault === 'open' || fault === 'dispatch' || fault === 'ready-failure')
        expect(proof.isOriginalFailure).toBe(true);
      if (fault === 'dispatch') expect(proof.ready).toBe(false);
      if (['reporter', 'close', 'reporter-after', 'restore-failure'].includes(fault)) {
        expect(proof.isAggregateError).toBe(true);
        expect(proof.hasOriginalFirst).toBe(true);
      }
    }
    expect(proof.finalMode).toBe(
      [
        'server-unconfirmed',
        'group-alive',
        'group-access',
        'restore-failure',
        'restore-only',
        'restore-noop',
      ].includes(fault)
        ? 0
        : ['mode-drift', 'restore-widen'].includes(fault)
          ? 0o644
          : originalMode,
    );
    if (['backup', 'plan'].includes(fault)) expect(proof.opened).toBe(false);
    expect(proof.probes.every((probe) => JSON.stringify(probe) === '[-123,0]')).toBe(true);
    expect(proof.hasRestoredSpawn).toBe(true);
    expect(proof.hasClosedDescriptor).toBe(true);
  });
