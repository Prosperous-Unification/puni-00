import { assertSame, readClosed, readString } from './managed-cohort';
import { decodeSourcePuniSelection, type SourcePuniSelection } from './source-puni-installation';
import {
  assertCurrentSourceEnvironment,
  captureCurrentSourceRestartTree,
  captureCurrentSourceRestorationConfiguration,
  captureCurrentSourceStartupTree,
  type CurrentSourceDevPins,
  type CurrentSourceStartupManifest,
  decodeCurrentSourceDevPins,
  decodeCurrentSourceStartupManifest,
} from './source-startup-current';
import {
  assertSourceEnvironment,
  captureSourceRestartTree,
  captureSourceRestorationConfiguration,
  captureSourceStartupTree,
  decodeSourceDevPins,
  decodeSourceStartupManifest,
  type SourceDevPins,
  type SourceStartupManifest as HistoricalSourceStartupManifest,
} from './source-startup-manifest';

export interface HistoricalSourceStartupRequest {
  readonly pins: SourceDevPins;
  readonly manifestContents: string;
  readonly runtimeReference: string;
}
export interface CurrentSourceStartupRequest {
  readonly expectedProfile: 'wbs-source-cold-v2';
  readonly pins: CurrentSourceDevPins;
  readonly manifestContents: string;
  readonly puniSelectionContents: string;
  readonly runtimeReference: string;
}
export type SourceStartupRequest = HistoricalSourceStartupRequest | CurrentSourceStartupRequest;
export type SourceStartupPins = SourceDevPins | CurrentSourceDevPins;
export type ProfiledSourceStartupManifest =
  HistoricalSourceStartupManifest | CurrentSourceStartupManifest;
function readRuntime(value: unknown): string {
  const runtime = readString(value);
  if (!/^(?:[a-z0-9][a-z0-9._:-]*\/)*[a-z0-9][a-z0-9._-]*@sha256:[a-f0-9]{64}$/.test(runtime))
    throw new Error('source startup runtime reference differs');
  return runtime;
}
/** Explicit current tag selects one closed new branch; missing tag accepts only the unchanged historical schema. */
export function decodeSourceStartupRequest(value: unknown): SourceStartupRequest {
  if (typeof value === 'object' && value !== null && Object.hasOwn(value, 'expectedProfile')) {
    const fields = readClosed(value, [
      'expectedProfile',
      'pins',
      'manifestContents',
      'puniSelectionContents',
      'runtimeReference',
    ]);
    if (fields['expectedProfile'] !== 'wbs-source-cold-v2')
      throw new Error('source startup expected profile differs');
    const pins = decodeCurrentSourceDevPins(fields['pins']);
    const manifestContents = readString(fields['manifestContents']);
    const puniSelectionContents = readString(fields['puniSelectionContents']);
    const selected = decodeSourcePuniSelection({
      contents: puniSelectionContents,
      sha256: pins.puniSelectionSha256,
    });
    const manifest = decodeCurrentSourceStartupManifest(manifestContents, pins);
    if (manifest.puniInstallation.entrypoint !== selected.record.entrypoint)
      throw new Error('source startup entrypoint declaration differs from independent selection');
    return {
      expectedProfile: 'wbs-source-cold-v2',
      pins,
      manifestContents,
      puniSelectionContents,
      runtimeReference: readRuntime(fields['runtimeReference']),
    };
  }
  const fields = readClosed(value, ['pins', 'manifestContents', 'runtimeReference']);
  const pins = decodeSourceDevPins(fields['pins']),
    manifestContents = readString(fields['manifestContents']);
  if (Buffer.byteLength(manifestContents) > 64 * 1024 * 1024)
    throw new Error('source startup manifest exceeds bound');
  return { pins, manifestContents, runtimeReference: readRuntime(fields['runtimeReference']) };
}
/** Require a complete retained current request with version2 pins, never infer it from a container or manifest label. */
export function selectSourceStartup(
  pins: SourceStartupPins,
  manifestContents: string,
  current?: CurrentSourceStartupRequest,
) {
  if (current !== undefined) {
    const selected = decodeSourceStartupRequest(current);
    if (!('expectedProfile' in selected))
      throw new Error('source current request lost its explicit profile');
    assertSame(selected.pins, pins, 'current source retained pins');
    assertSame(selected.manifestContents, manifestContents, 'current source retained manifest');
    const manifest = decodeCurrentSourceStartupManifest(selected.manifestContents, selected.pins);
    const selection: SourcePuniSelection = {
      contents: selected.puniSelectionContents,
      sha256: selected.pins.puniSelectionSha256,
    };
    return {
      kind: 'current' as const,
      profile: 'wbs-source-cold-v2' as const,
      pins: selected.pins,
      manifest,
      current: selected,
      assertEnvironment: (value: unknown, image: unknown) => {
        assertCurrentSourceEnvironment(
          value,
          image,
          selected.pins.environmentSha256,
          manifest.puniInstallation,
        );
      },
      captureTree: (root: string, deadline: number) =>
        captureCurrentSourceStartupTree(root, manifest, deadline, selection),
      captureRestart: (root: string, deadline: number, openapi: string) =>
        captureCurrentSourceRestartTree(root, manifest, deadline, openapi, selection),
      captureConfiguration: (root: string, inherited: readonly string[], deadline: number) =>
        captureCurrentSourceRestorationConfiguration(root, manifest, inherited, deadline),
    };
  }
  const historical = decodeSourceDevPins(pins),
    manifest = decodeSourceStartupManifest(manifestContents, historical);
  return {
    kind: 'historical' as const,
    profile: 'wbs-source-cold-v1' as const,
    pins: historical,
    manifest,
    current: undefined,
    assertEnvironment: (value: unknown, image: unknown) => {
      assertSourceEnvironment(value, image, historical.environmentSha256);
    },
    captureTree: (root: string, deadline: number) =>
      captureSourceStartupTree(root, manifest, deadline),
    captureRestart: (root: string, deadline: number, openapi: string) =>
      captureSourceRestartTree(root, manifest, deadline, openapi),
    captureConfiguration: (root: string, inherited: readonly string[], deadline: number) =>
      captureSourceRestorationConfiguration(root, manifest, inherited, deadline),
  };
}
