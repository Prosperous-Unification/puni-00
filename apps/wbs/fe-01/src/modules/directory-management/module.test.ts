import { DiBag } from 'di-bag';
import { describe, expect, it } from 'vitest';

import { fakeDirectoryApi, KAT } from '@/modules/directory/fake-directory-api';

import { DIRECTORY_MANAGEMENT_LABEL, DIRECTORY_MANAGEMENT_MODULE_ID } from './contract';
import { directoryManagementModule } from './module';

/**
 * A host graph over the two requirements the session runtime supplies.
 *
 * Written out here rather than taken from `runtime/session-runtime.ts`: this
 * suite is about the module's seal, and the installer has its own.
 */
const hostOver = (api: ReturnType<typeof fakeDirectoryApi>, isActiveReader = () => true) =>
  DiBag.createBuilder()
    .installModule(directoryManagementModule)
    .register({
      directoryApi: DiBag.fromSyncFactory(() => api),
      isActiveReader: DiBag.fromSyncFactory((): (() => boolean) => isActiveReader),
    })
    .build();

describe('the directory-management module', () => {
  it('publishes the directory’s gestures over the client its host supplied', async () => {
    const api = fakeDirectoryApi();
    const management = hostOver(api).resolve('directoryManagement');

    await management.read();

    expect(management.snapshot().people).toEqual([KAT]);
    expect(api.readCount()).toBe(1);
  });

  it('keeps its directory resource out of a host graph', () => {
    const host = hostOver(fakeDirectoryApi());

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('directory'),
    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "directory" is not registered.');
  });

  it('names itself when a host omits the client', () => {
    const partial = DiBag.createBuilder()
      .installModule(directoryManagementModule)
      .register({
        isActiveReader: DiBag.fromSyncFactory((): (() => boolean) => () => true),
      }) as unknown as { build: () => { resolve: (key: string) => unknown } };
    const host = partial.build();

    expect(() => host.resolve('directoryManagement')).toThrow(
      `Cannot resolve "${DIRECTORY_MANAGEMENT_LABEL}/directory": dependency "directoryApi" is not registered.`,
    );
  });

  it('withdraws the directory with its host’s reader', async () => {
    const api = fakeDirectoryApi();
    let active = true;
    const management = hostOver(api, () => active).resolve('directoryManagement');
    await management.read();
    const shown = management.snapshot();

    active = false;
    await management.read();
    management.addTag('legal', () => undefined);
    await management.settled();

    expect(api.readCount()).toBe(1);
    expect(api.creates).toEqual([]);
    expect(management.snapshot()).toBe(shown);
  });

  it('declares the identifier its module index will carry', () => {
    expect(DIRECTORY_MANAGEMENT_MODULE_ID).toBe(`module.${DIRECTORY_MANAGEMENT_LABEL}`);
  });
});
