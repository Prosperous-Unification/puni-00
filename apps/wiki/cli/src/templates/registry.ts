import type { Template } from './template';

const PortContract = `/**
 * Raw access to <the one external thing>, as the port its owner declares.
 *
 * The port belongs to the framework-free core, as ADR 0014 defines; the adapter beside it
 * satisfies this type and adds nothing to it.
 */
export interface <Name>Port {
  readonly <member>: <Type>;
}
`;

const FeatureFile = `import type { <Name> } from './contract';

/**
 * <One piece of user-facing value, in one sentence.>
 *
 * A feature-service: it coordinates resource-services, owns the transaction (K7), imports no
 * repository (K3) and, on the frontend, no React (F1).
 */
// @capability <capability-id>
export function create<Name>(<requirements>): <Name> {
  return { <member>: <value> };
}
`;

const ResourceFile = `import type { <Name> } from './contract';

/**
 * <The quirks and invariants of one resource, in one sentence.>
 *
 * A resource-service: it holds the constraints of one aggregate over repository ports, opens no
 * transaction (K7) and imports no feature-service (K4).
 */
// @term <glossary-term>
export function create<Name>(<requirements>): <Name> {
  return { <member>: <value> };
}
`;

const RepositoryFile = `import type { <Name>Port } from './contract';

/**
 * Raw access to <the one external thing this adapter reaches>. It holds no decisions.
 *
 * A repository adapter: it imports nothing above it (K5) and satisfies the port the core owns.
 */
// @port ./contract#<Name>Port
export function <name>(): <Name>Port {
  return { <member>: <value> };
}
`;

const KindTest = `import { describe, expect, test } from 'bun:test';

/** The level this kind requires; for a repository adapter, conformance against its port. */
describe('<name>', () => {
  test('<what the behaviour is>', () => {
    expect(<observed>).toEqual(<expected>);
  });
});
`;

const featureTemplate: Template = {
  id: 'feature-service',
  version: '1.0.0',
  subject: 'file',
  generates: 'One feature-service file with the capability it serves.',
  files: [{ path: '<name>.feature.ts', required: true, content: FeatureFile }],
  requirements: [
    {
      id: 'feature.suffix',
      statement: 'A feature-service file name ends in `.feature.ts`.',
      rules: ['K1'],
      constraint: { kind: 'name-suffix', suffix: '.feature.ts' },
    },
    {
      id: 'feature.one-kind',
      statement: 'A feature-service file name declares no second kind.',
      rules: ['K1'],
      constraint: { kind: 'one-kind-per-file' },
    },
    {
      id: 'feature.capability',
      statement: 'A feature-service names exactly one capability, in a `@capability` line comment.',
      rules: ['K9'],
      constraint: { kind: 'declares-one', tag: 'capability' },
    },
    {
      id: 'feature.no-repository-import',
      statement:
        'A feature-service states no import of a file whose name declares the repository kind.',
      rules: ['K3'],
      constraint: { kind: 'imports-no-kind', kinds: ['repository'] },
    },
  ],
};

const resourceTemplate: Template = {
  id: 'resource-service',
  version: '1.0.0',
  subject: 'file',
  generates: 'One resource-service file with the glossary term it is named after.',
  files: [{ path: '<name>.resource.ts', required: true, content: ResourceFile }],
  requirements: [
    {
      id: 'resource.suffix',
      statement: 'A resource-service file name ends in `.resource.ts`.',
      rules: ['K1'],
      constraint: { kind: 'name-suffix', suffix: '.resource.ts' },
    },
    {
      id: 'resource.one-kind',
      statement: 'A resource-service file name declares no second kind.',
      rules: ['K1'],
      constraint: { kind: 'one-kind-per-file' },
    },
    {
      id: 'resource.term',
      statement: 'A resource-service names exactly one glossary term, in a `@term` line comment.',
      rules: ['K9'],
      constraint: { kind: 'declares-one', tag: 'term' },
    },
    {
      id: 'resource.no-feature-import',
      statement:
        'A resource-service states no import of a file whose name declares the feature kind.',
      rules: ['K4'],
      constraint: { kind: 'imports-no-kind', kinds: ['feature'] },
    },
  ],
};

const repositoryTemplate: Template = {
  id: 'repository',
  version: '1.0.0',
  subject: 'file',
  generates: 'One repository adapter with the port it satisfies and its conformance test.',
  files: [
    { path: 'contract.ts', required: true, content: PortContract },
    { path: '<name>.repository.ts', required: true, content: RepositoryFile },
    { path: '<name>.repository.test.ts', required: true, content: KindTest },
  ],
  requirements: [
    {
      id: 'repository.suffix',
      statement: 'A repository adapter file name ends in `.repository.ts`.',
      rules: ['K1'],
      constraint: { kind: 'name-suffix', suffix: '.repository.ts' },
    },
    {
      id: 'repository.one-kind',
      statement: 'A repository adapter file name declares no second kind.',
      rules: ['K1'],
      constraint: { kind: 'one-kind-per-file' },
    },
    {
      id: 'repository.port',
      statement: 'A repository adapter names exactly one port, in a `@port` line comment.',
      rules: ['K5'],
      constraint: { kind: 'declares-one', tag: 'port' },
    },
    {
      id: 'repository.conformance-test',
      statement: 'A repository adapter has a sibling test file beside it.',
      rules: ['required test levels'],
      constraint: { kind: 'sibling-test' },
    },
    {
      id: 'repository.no-service-import',
      statement:
        'A repository adapter states no import of a file whose name declares the feature or resource kind.',
      rules: ['K5'],
      constraint: { kind: 'imports-no-kind', kinds: ['feature', 'resource'] },
    },
  ],
};

const templates: readonly Template[] = [featureTemplate, repositoryTemplate, resourceTemplate];

/** The registry, sorted by identifier so a listing is stable. */
export function registeredTemplates(): readonly Template[] {
  return [...templates].sort((left, right) => (left.id < right.id ? -1 : 1));
}

export function findTemplate(templateId: string): Template | undefined {
  return templates.find((template) => template.id === templateId);
}

/** Every registered identifier, for a refusal that has to name the alternatives. */
export function registeredTemplateIds(): string {
  return registeredTemplates()
    .map((template) => template.id)
    .join(', ');
}

/** @throws Error naming every registered template when the identifier is not one of them. */
export function selectTemplate(templateId: string): Template {
  const template = findTemplate(templateId);
  // Proof: on 2026-09-20, returning the first registered template here made the production CLI
  // test observe `Expected: 1`, `Received: 0` for an unregistered identifier.
  if (template === undefined) {
    throw new Error(`unknown template: ${templateId} (registered: ${registeredTemplateIds()})`);
  }
  return template;
}
