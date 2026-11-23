import type { SettingsSnapshot } from '@wbs/domain';
import { describe, expect, it } from 'bun:test';

import { INACTIVE_EXTERNAL_DEPENDENCIES } from '../../ports/external-dependency-authoring';
import { LEGACY_ACCESS } from '../../ports/organization-access';
import type { SettingStore, SettingTarget } from '../../ports/setting-store';
import type { Scope } from '../../ports/unit-of-work';
import { ImportedPlanResource } from './imported-plan.resource';

const project: Extract<SettingTarget, { readonly kind: 'project' }> = {
  kind: 'project',
  chain: { level: 'project', organizationId: 'org', spaceId: null, projectId: 'destination' },
};
const snapshot: SettingsSnapshot = {
  values: [{ scope: { level: 'project', id: 'destination' }, key: 'budgetFactor', value: 2.5 }],
  markers: [],
};

/** Only the addressed borrowed settings port is available; unexpected ancestor writes throw. */
function openResource(capture: SettingStore['capture']) {
  let open = true;
  let writes = 0;
  const settings: SettingStore = {
    readTarget: (): Promise<never> =>
      Promise.reject(Error('factor check must retain its admitted target')),
    packageIds: () => Promise.reject(Error('factor check cannot enumerate descendants')),
    touchPackages: () => Promise.reject(Error('factor check cannot change descendant revisions')),
    capture,
    write: () => {
      writes++;
      return Promise.reject(Error('factor check cannot change inherited settings'));
    },
  };
  const scope = { stores: { settings } } as Scope;
  const resource = new ImportedPlanResource(scope, {
    actorId: 'actor',
    project,
    access: LEGACY_ACCESS,
    externalDependencies: INACTIVE_EXTERNAL_DEPENDENCIES,
    assertActive: () => {
      if (!open) throw Error('import observation is closed');
    },
    contextFor: () => {
      throw Error('factor check cannot open a dependency context');
    },
  });
  return {
    resource,
    close: () => {
      open = false;
    },
    writes: () => writes,
  };
}

/** Awaits the actual rejection before testing its synchronous diagnostic, including unknown causes. */
async function expectRejection(pending: Promise<unknown>, diagnostic: string): Promise<void> {
  const outcome = await pending.then(
    () => ({ rejected: false as const }),
    (cause: unknown) => ({ rejected: true as const, cause }),
  );
  expect(outcome.rejected).toBe(true);
  if (!outcome.rejected) throw Error('Import factor control unexpectedly resolved');
  expect(() => {
    throw outcome.cause;
  }).toThrow(diagnostic);
}

describe('admitted import factor compatibility', () => {
  it('accepts an equal inherited factor through the retained destination without writing its project', async () => {
    const targets: SettingTarget[] = [];
    const owner = openResource((target) => {
      targets.push(target);
      return Promise.resolve(snapshot);
    });
    expect(await owner.resource.checkBudgetFactor(2.5)).toBeNull();
    expect(targets).toEqual([project]);
    expect(targets[0]).toBe(project);
    expect(owner.writes()).toBe(0);
    owner.close();
  });

  it('refuses an unequal factor with only its key and leaves inherited settings untouched', async () => {
    const owner = openResource(() => Promise.resolve(snapshot));
    expect(await owner.resource.checkBudgetFactor(2)).toEqual({
      ok: false,
      code: 'import_settings_conflict',
      key: 'budgetFactor',
    });
    expect(owner.writes()).toBe(0);
    owner.close();
  });

  it('rejects malformed stored factor evidence instead of treating it as an inherited default', async () => {
    const owner = openResource(() =>
      Promise.resolve({
        values: [
          {
            scope: { level: 'project', id: 'destination' },
            key: 'budgetFactor',
            value: 'invalid-factor',
          },
        ],
        markers: [],
      }),
    );
    await expectRejection(
      owner.resource.checkBudgetFactor(1),
      'invalid stored setting budgetFactor',
    );
    expect(owner.writes()).toBe(0);
    owner.close();
  });

  it('propagates an exact unknown capture failure including undefined', async () => {
    const owner = openResource(() =>
      Promise.resolve().then(() => {
        // The captured dependency may reject with any external unknown, including undefined.
        const cause: unknown = undefined;
        throw cause;
      }),
    );
    let failure: { cause: unknown } | undefined;
    try {
      await owner.resource.checkBudgetFactor(2.5);
    } catch (cause: unknown) {
      failure = { cause };
    }
    expect(failure).toBeDefined();
    expect(failure?.cause).toBeUndefined();
    expect(owner.writes()).toBe(0);
    owner.close();
  });

  it('refuses a retained factor read before calling the captured settings dependency', async () => {
    let captures = 0;
    const owner = openResource(() => {
      captures++;
      return Promise.resolve(snapshot);
    });
    owner.close();
    await expectRejection(owner.resource.checkBudgetFactor(2.5), 'import observation is closed');
    expect(captures).toBe(0);
    expect(owner.writes()).toBe(0);
  });

  it('rechecks import lifetime after the awaited settings capture before accepting its value', async () => {
    const owner = openResource(() => {
      owner.close();
      return Promise.resolve(snapshot);
    });
    await expectRejection(owner.resource.checkBudgetFactor(2.5), 'import observation is closed');
    expect(owner.writes()).toBe(0);
  });
});
