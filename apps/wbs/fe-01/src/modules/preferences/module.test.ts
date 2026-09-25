import { DiBag } from 'di-bag';
import { describe, expect, it } from 'vitest';

import { revocableStorage } from './browser-storage.repository';
import { PREFERENCES_LABEL, PREFERENCES_MODULE_ID } from './contract';
import { fakeBrowserStorage } from './fake-browser-storage';
import { preferencesModule } from './module';
import { GANTT_DETAIL_KEY } from './preference-keys';

/**
 * A host graph over the same requirement the page's runtime supplies.
 *
 * Written out here rather than imported from `runtime/application-runtime.ts`: this
 * suite is about the module's seal, and the installer has its own. Its assertions
 * are the ones no installer can make, because they reach the host graph the
 * installer keeps to itself.
 */
const hostOver = (store: ReturnType<typeof fakeBrowserStorage>) =>
  DiBag.createBuilder()
    .withInstalledModules([preferencesModule])
    .withServices({
      browserStore: DiBag.createProvider(() => store, { factoryReturnKind: 'sync-value' }),
    })
    .withServices({
      isLive: DiBag.createProvider((): (() => boolean) => () => true, {
        factoryReturnKind: 'sync-value',
      }),
    })
    .buildContainer();

describe('the preferences module', () => {
  it('publishes the answers delivery asks for, over the store its host supplied', () => {
    const store = fakeBrowserStorage({ [GANTT_DETAIL_KEY]: 'true' });
    const host = hostOver(store);

    expect(host.resolve('remembered').ganttDetail.read()).toBe(true);
    host.resolve('remembered').ganttDetail.write(false);
    expect(store.held()).toEqual({ [GANTT_DETAIL_KEY]: 'false' });
  });

  it('keeps its owned store out of a host graph', () => {
    const host = hostOver(fakeBrowserStorage());

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('preferencesStore'),
    ).toThrow('DI_BAG_UNKNOWN_SERVICE_KEY: Service "preferencesStore" is not registered.');
  });

  it('labels its owned store with the module name', () => {
    const host = hostOver(fakeBrowserStorage());

    expect(host.graphSnapshot().bindings.map((binding) => binding.bindingLabel)).toContain(
      `${PREFERENCES_LABEL}/preferencesStore`,
    );
  });

  /**
   * The label reaches a real DI failure of the kind a host can cause.
   *
   * Not the only kind that carries it — a cycle path names the module too, with no
   * host requirement at all — but the one a host's own mistake produces.
   *
   * A host that forgets the store is refused by the type checker, so the cast reaches
   * the runtime path an untyped or generated host reaches. The message has to say
   * which module asked, because `browserStore` alone would not.
   */
  it('names itself when a host omits the browser store', () => {
    const partial = DiBag.createBuilder().withInstalledModules([preferencesModule]) as unknown as {
      buildContainer: () => { resolve: (key: string) => unknown };
    };
    const host = partial.buildContainer();

    expect(() => host.resolve('preferences')).toThrow(
      `Cannot resolve "${PREFERENCES_LABEL}/preferencesStore": dependency "browserStore" is not registered. Resolution path: preferences -> ${PREFERENCES_LABEL}/preferencesStore -> browserStore.`,
    );
  });

  /**
   * The rule as it is, not as it would be convenient: a missing **registration** is
   * answered without a module label, for a private binding and for a name nothing ever
   * registered alike. A missing **dependency** of a labelled binding does carry it,
   * which is the case above.
   */
  it('says nothing about itself when a host names a service that is not registered', () => {
    const host = hostOver(fakeBrowserStorage());
    const naming = (key: string): string => {
      try {
        (host as unknown as { resolve: (named: string) => unknown }).resolve(key);
      } catch (refusal) {
        return refusal instanceof Error ? refusal.message : String(refusal);
      }
      throw new Error(`resolving ${key} was expected to throw`);
    };

    expect(naming('preferencesStore')).not.toContain(PREFERENCES_LABEL);
    expect(naming('nothing-of-the-kind')).not.toContain(PREFERENCES_LABEL);
    expect(naming('preferencesStore')).toContain('DI_BAG_UNKNOWN_SERVICE_KEY');
  });

  /**
   * The owned store, refusing on its own.
   *
   * Its own case as well as the module's, so that three different faults — the
   * module's disposal removed, this guard removed, and the installer's close replaced
   * by a no-op — are told apart by which tests fail rather than by inspection.
   */
  it('refuses every access once the store has been given back', () => {
    const store = revocableStorage(fakeBrowserStorage({ [GANTT_DETAIL_KEY]: 'true' }));

    expect(store.read(GANTT_DETAIL_KEY)).toBe('true');
    store.revoke();

    expect(() => store.read(GANTT_DETAIL_KEY)).toThrow(
      'the preferences store was revoked with its runtime',
    );
    expect(() => {
      store.write(GANTT_DETAIL_KEY, 'false');
    }).toThrow('was revoked with its runtime');
    expect(() => {
      store.forget(GANTT_DETAIL_KEY);
    }).toThrow('was revoked with its runtime');
  });

  /** The host graph's own close, which is the disposal the module registered. */
  it('gives the store back when its host graph closes', async () => {
    const host = hostOver(fakeBrowserStorage());
    const remembered = host.resolve('remembered');

    await host.close({ waitTimeoutMs: 50 });

    expect(() => {
      remembered.ganttDetail.write(true);
    }).toThrow('the preferences store was revoked with its runtime');
  });

  it('declares the identifier its module index will carry', () => {
    expect(PREFERENCES_MODULE_ID).toBe(`module.${PREFERENCES_LABEL}`);
  });
});
