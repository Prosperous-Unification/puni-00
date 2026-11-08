import { isAbsolute } from 'node:path';

import {
  managedImageReferences,
  parseRegistryHistory,
  readRegistrySource,
  type RegistryHistory,
  registryHistorySha256,
  serveRegistryReader,
} from '@tools/registry-publication';
import { type } from 'arktype';

import { parseFirstStartRequest } from './first-start';
import { sha256Of } from './migration-capture';
import { parseFirstStartGenesis, parseRegistryFirstStartState } from './registry-first-start';
import { parseRegistryJournal, parseReleaseInheritance } from './registry-journal';

const Input = type({
  firstStartPath: type('string > 0').narrow(isAbsolute),
  releasePath: type('string > 0').narrow(isAbsolute),
  registryUrl: 'string > 0',
  registryId: 'string > 0',
  product: 'string > 0',
  environment: 'string > 0',
  target: 'string > 0',
  '+': 'reject',
});

/** Read the owning first-start→release chain; a transfer marker makes the destination mandatory forever. */
export async function readReleaseHistory(input: unknown) {
  const configuration = Input(input);
  if (configuration instanceof type.errors)
    throw new Error('Malformed recovery history reader configuration');
  const source = await readRegistrySource(configuration.firstStartPath);
  const raw: unknown = JSON.parse(source.text);
  let history = parseFirstStartGenesis(raw, configuration.firstStartPath);
  const revisions = [source.sourceRevision];
  const references: { repository: string; digest: string }[] = [];
  if (history === undefined) {
    const envelope = type({ requestBytes: 'string > 0' })(raw);
    if (envelope instanceof type.errors) throw new Error('First-start history has no request');
    const request = parseFirstStartRequest(JSON.parse(envelope.requestBytes) as unknown);
    const first = parseRegistryFirstStartState(raw, request, configuration.firstStartPath);
    history = parseRegistryHistory(first.registryHistory, configuration.firstStartPath);
    if (first.registry === null || first.registry === undefined)
      throw new Error('Managed history has no operation binding');
    if (first.phase !== 'complete') references.push(...first.registry.references);
    // Proof: bypassing this branch accepted a deleted destination in `transfers completed first-start history`.
    if (first.registryTransfer !== undefined) {
      if (first.registryTransfer.destination !== configuration.releasePath)
        throw new Error('History transfer points outside the configured release source');
      const destination = await readRegistrySource(first.registryTransfer.destination);
      revisions.push(destination.sourceRevision);
      const inherited = parseReleaseInheritance(
        JSON.parse(destination.text) as unknown,
        first.registryTransfer.destination,
      );
      let current: RegistryHistory;
      if (inherited !== undefined) current = inherited;
      else {
        const release = parseRegistryJournal(first.registryTransfer.destination, destination.text);
        current = parseRegistryHistory(release.registryHistory, first.registryTransfer.destination);
        if (release.registry === null || release.registry === undefined)
          throw new Error('Transferred managed release has no binding');
        if (release.state.phase !== 'lease-released' && release.state.phase !== 'rolled-back')
          references.push(
            ...release.registry.references,
            ...managedImageReferences(
              [
                ...Object.values(release.request.release.images),
                ...Object.values(release.request.expectedCurrent.images),
              ],
              configuration.registryUrl,
            ),
          );
      }
      if (
        current.inheritance?.source !== configuration.firstStartPath ||
        current.inheritance.sha256 !== first.registryTransfer.sha256 ||
        current.inheritance.operationId !== first.transaction ||
        JSON.stringify(current.genesis) !== JSON.stringify(history.genesis)
      )
        throw new Error('Release history lost its immutable first-start linkage');
      for (const bundle of history.releases) {
        if (
          JSON.stringify(
            current.releases.find((candidate) => candidate.operationId === bundle.operationId),
          ) !== JSON.stringify(bundle)
        )
          throw new Error('Release history lost first-start promoted evidence');
      }
      history = current;
    }
  }
  if (
    history.registryId !== configuration.registryId ||
    history.product !== configuration.product ||
    history.environment !== configuration.environment ||
    history.target !== configuration.target
  )
    throw new Error('Recovery history belongs to another enrollment');

  const unique = [
    ...new Map(references.map((reference) => [JSON.stringify(reference), reference])).values(),
  ];
  return {
    sourceRevision: `sha256:${sha256Of(JSON.stringify(revisions))}`,
    references: unique,
    currentReferences: history.releases[0]?.references ?? [],
    historySha256: registryHistorySha256(history.releases),
    history:
      history.releases.length === 0
        ? { state: 'first-install' as const, at: history.genesis.at }
        : {
            state: 'successful' as const,
            complete: true as const,
            releases: history.releases.map((bundle) => bundle.operationId),
          },
  };
}

if (import.meta.main) await serveRegistryReader(readReleaseHistory, 'history');
