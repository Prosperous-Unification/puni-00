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

const ModuleReadme = `# <Name>

One sentence on the value this module delivers.

## What it owns

- The decisions, state and invariants that live here.

## What it does not own

- The neighbouring decisions a reader would expect here and will not find.

## Relationships

The exported types are in \`contract.ts\`; <the kind files, and what each one holds>.

## Checks

<The Nx target that runs this module's tests, and the files that prove it.>
`;

const ModuleContract = `/**
 * What this module exports, and what its host must supply.
 *
 * Every member carries the JSDoc that states its behaviour, its throws and its invariants, because
 * a work packet reads this file and the README, not the module.
 */
export interface <Name> {
  readonly <member>: <Type>;
}
`;

const IndexSections = [
  '## What it owns',
  '## What it does not own',
  '## Relationships',
  '## Checks',
] as const;

const moduleTemplate: Template = {
  id: 'module',
  version: '1.0.0',
  subject: 'directory',
  generates: 'One module directory: its index, its contract, its kind files and its tests.',
  files: [
    { path: 'README.md', required: true, content: ModuleReadme },
    { path: 'contract.ts', required: true, content: ModuleContract },
    { path: '<name>.feature.ts', required: false, content: FeatureFile },
    { path: '<name>.resource.ts', required: false, content: ResourceFile },
    { path: '<name>.repository.ts', required: false, content: RepositoryFile },
    { path: '<name>.feature.test.ts', required: false, content: KindTest },
  ],
  requirements: [
    {
      id: 'module.readme',
      statement: 'A module carries a README index at its root.',
      rules: ['module layout'],
      constraint: { kind: 'required-file', path: 'README.md' },
    },
    {
      id: 'module.readme-sections',
      statement:
        'The README states a title and the sections "What it owns", "What it does not own", "Relationships" and "Checks".',
      rules: ['module layout'],
      constraint: { kind: 'index-sections', path: 'README.md', sections: IndexSections },
    },
    {
      id: 'module.contract',
      statement: 'A module carries a contract file that states its exported types.',
      rules: ['module layout'],
      constraint: { kind: 'required-file', path: 'contract.ts' },
    },
    {
      id: 'module.kind-file',
      statement: 'A module carries at least one file that declares a kind by its suffix.',
      rules: ['K1'],
      constraint: { kind: 'kind-file-present' },
    },
    {
      id: 'module.one-kind',
      statement: 'No file declares more than one kind.',
      rules: ['K1'],
      constraint: { kind: 'one-kind-per-file' },
    },
    {
      id: 'module.test',
      statement: 'A module carries at least one test file.',
      rules: ['required test levels'],
      constraint: { kind: 'test-present' },
    },
    {
      id: 'module.layout',
      statement: 'Every file sits in the module directory or in its `view` directory.',
      rules: ['module layout'],
      constraint: { kind: 'files-stay-in-module', allowedDirectories: ['view'] },
    },
    {
      id: 'module.kind-files',
      statement: 'Every kind file in the module satisfies the template of its own kind.',
      rules: ['K1', 'K3', 'K4', 'K5', 'K9'],
      constraint: { kind: 'kind-files-follow-their-template' },
    },
  ],
};

const templates: readonly Template[] = [
  featureTemplate,
  moduleTemplate,
  repositoryTemplate,
  resourceTemplate,
];

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
