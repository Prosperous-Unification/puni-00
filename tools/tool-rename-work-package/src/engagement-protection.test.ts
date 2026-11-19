import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { describe, expect, it } from 'bun:test';
import ts from 'typescript';

import { isProtectedSpan, readProtectedSpans } from './protection';
import { renameText } from './rename-text';
import { applyRename, git, residualsIn } from './tree';

const ROOT = new URL('../../../', import.meta.url);
const readSource = (path: string): string => readFileSync(new URL(path, ROOT), 'utf8');
const AUDIT = 'libs/wbs/adapters/store-sqlite/src/access-audit.ts';
const INITIAL = 'libs/wbs/adapters/store-sqlite/src/initial-access.ts';
const SHAPES = 'libs/wbs/domain/contracts/src/http/organization-shapes.ts';
const ASSIGNMENT = 'libs/wbs/application/core/src/module/work-item/work-item.resource.test.ts';

const WITNESSES = [
  {
    path: AUDIT,
    owner: 'appendGrantAudit',
    declaration: 'export function appendGrantAudit(',
    token: 'grant.scope.projectId',
    anchor: ': grant.scope.projectId;',
    mixed: ': grant.scope.projectId; const legacyProjectId = projectId; // old project',
    renamed:
      ': grant.scope.projectId; const legacyWorkPackageId = workPackageId; // old work package',
    missing: [': grant.scope.projectId;', ': grant.scope.missingOwner;'],
    duplicate: [
      '  let subjectId: string;',
      '  const scopeId = unrelated;\n  let subjectId: string;',
    ],
    wrongOwner: ['readonly grant: AccessGrantRecord;', 'readonly grant: LegacyRecord;'],
    wrongReceiver: [': grant.scope.projectId;', ': other.scope.projectId;'],
  },
  {
    path: INITIAL,
    owner: 'readInitialRolePermissionsIn',
    declaration: 'function readInitialRolePermissionsIn(',
    token: "? 'organization' : 'project'",
    anchor: "? 'organization' : 'project';",
    mixed: "? 'organization' : 'project'; const legacyProjectId = projectId; // old project",
    renamed:
      "? 'organization' : 'project'; const legacyWorkPackageId = workPackageId; // old work package",
    missing: ["? 'organization' : 'project';", "? 'organization' : 'missing';"],
    duplicate: [
      '  const permissions = new Set<Permission>();',
      "  const kind = 'project';\n  const permissions = new Set<Permission>();",
    ],
    wrongOwner: [
      'roleId: InitialAccessRole,\n): ReadonlySet<Permission>',
      'roleId: LegacyRole,\n): ReadonlySet<Permission>',
    ],
    wrongReceiver: [
      "roleId === 'org-admin' || roleId === 'org-viewer' ? 'organization' : 'project'",
      "legacyRoleId === 'org-admin' || roleId === 'org-viewer' ? 'organization' : 'project'",
    ],
  },
  {
    path: SHAPES,
    owner: 'listMembers',
    declaration: 'export const listMembers =',
    token: "scopeKind: \"'organization' | 'project' | 'work_package'\"",
    anchor: "scopeKind: \"'organization' | 'project' | 'work_package'\",",
    mixed:
      "scopeKind: \"'organization' | 'project' | 'work_package'\", legacyProjectId: 'string', legacyKind: \"'project'\", // old project",
    renamed:
      "scopeKind: \"'organization' | 'project' | 'work_package'\", legacyWorkPackageId: 'string', legacyKind: \"'workPackage'\", // old work package",
    missing: [
      "scopeKind: \"'organization' | 'project' | 'work_package'\",",
      "missingKind: \"'organization' | 'project' | 'work_package'\",",
    ],
    duplicate: [
      "scopeKind: \"'organization' | 'project' | 'work_package'\",",
      "scopeKind: \"'organization' | 'project' | 'work_package'\", scopeKind: \"'project'\",",
    ],
    wrongOwner: [
      'export const listMembers = defineEndpointShape({',
      'export const listMembers = legacyEndpointShape({',
    ],
    wrongReceiver: ['              via: type({', '              otherVia: type({'],
  },
] as const;

function replaceOnce(source: string, before: string, after: string): string {
  expect(source.split(before), 'actual owned source witness: ' + before).toHaveLength(2);
  return source.replace(before, after);
}

function observeRename(
  source: string,
  path: string,
): { readonly kind: 'accepted' } | { readonly kind: 'refused'; readonly message: string } {
  try {
    renameText(source, path);
    return { kind: 'accepted' };
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    return { kind: 'refused', message: cause.message };
  }
}

function removeFunctionBody(source: string, path: string, name: string): string {
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const declarations = parsed.statements.filter(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  );
  expect(declarations).toHaveLength(1);
  const declaration = declarations.at(0);
  if (declaration?.body === undefined) throw new Error('actual diagnostic fixture body is absent');
  const signature = source
    .slice(declaration.getStart(parsed), declaration.body.getStart(parsed))
    .trimEnd();
  return replaceOnce(source, declaration.getText(parsed), signature + ';');
}

const OWNED_DIAGNOSTICS: Partial<Record<string, string>> = {
  'appendGrantAudit:wrong declaration owner': 'appendGrantAudit-grant-type',
  'appendGrantAudit:wrong member receiver': 'appendGrantAudit-scope-parent',
  'readInitialRolePermissionsIn:wrong declaration owner': 'readInitialRolePermissionsIn-role',
  'readInitialRolePermissionsIn:wrong member receiver': 'readInitialRolePermissionsIn-kind',
  'listMembers:wrong declaration owner': 'listMembers-endpoint',
};

describe('three qualified engagement ownership witnesses', () => {
  for (const witness of WITNESSES) {
    it(
      'keeps only the actual owned token and renames a mixed-line neighbor: ' + witness.owner,
      () => {
        const source = readSource(witness.path);
        expect(source).toContain(witness.token);
        const mixed = replaceOnce(source, witness.anchor, witness.mixed);
        expect(renameText(mixed, witness.path)).toContain(witness.renamed);
        expect(renameText(source, witness.path)).toBe(source);
        const unowned = renameText(
          source,
          'unreviewed/' + witness.path.slice(witness.path.lastIndexOf('/') + 1),
        );
        expect(unowned).not.toContain(witness.token);
      },
    );

    for (const [label, transform] of [
      [
        'missing declaration',
        (source: string) =>
          replaceOnce(
            source,
            witness.declaration,
            witness.declaration.replace(witness.owner, 'otherOwner'),
          ),
      ],
      [
        'duplicate declaration',
        (source: string) =>
          source +
          '\n' +
          (witness.path === SHAPES
            ? 'const listMembers = {};'
            : 'function ' + witness.owner + '() {}'),
      ],
      ['malformed syntax', (source: string) => source + '\nconst = ;\n'],
      [
        'missing ownership member',
        (source: string) => replaceOnce(source, witness.missing[0], witness.missing[1]),
      ],
      [
        'duplicate ownership member',
        (source: string) => replaceOnce(source, witness.duplicate[0], witness.duplicate[1]),
      ],
      [
        'wrong declaration owner',
        (source: string) => replaceOnce(source, witness.wrongOwner[0], witness.wrongOwner[1]),
      ],
      [
        'wrong member receiver',
        (source: string) => replaceOnce(source, witness.wrongReceiver[0], witness.wrongReceiver[1]),
      ],
    ] as const) {
      it('refuses ' + label + ': ' + witness.owner, () => {
        const source = readSource(witness.path);
        const diagnostic = OWNED_DIAGNOSTICS[witness.owner + ':' + label];
        if (diagnostic !== undefined) expect(renameText(source, witness.path)).toBe(source);
        const changed = transform(source);
        if (diagnostic === undefined) {
          expect(() => renameText(changed, witness.path)).toThrow(
            /protected (?:source|witness|declaration)/,
          );
        } else {
          expect(changed).not.toBe(source);
          expect(observeRename(changed, witness.path)).toEqual({
            kind: 'refused',
            message: 'protected witness changed: ' + witness.path + ':' + diagnostic,
          });
        }
      });
    }
  }
});

for (const [before, after] of [
  [
    'const { grant, action, auditId, actorId, at, origin } = evidence;',
    'const { grant, action, auditId, actorId, at, origin } = legacy;',
  ],
  ['  let subjectId: string;', '  const grant = legacy;\n  let subjectId: string;'],
] as const) {
  it('refuses an audit receiver detached from the typed evidence binding: ' + after, () => {
    const source = readSource(AUDIT);
    expect(renameText(source, AUDIT)).toBe(source);
    const changed = replaceOnce(source, before, after);
    expect(changed).not.toBe(source);
    expect(observeRename(changed, AUDIT)).toEqual({
      kind: 'refused',
      message: 'protected witness changed: ' + AUDIT + ':appendGrantAudit-grant-binding',
    });
  });
}

it('uses the same exact spans for real disposable apply/check and collision interpretation', () => {
  const root = scratchSync('engagement-protection-');
  git(root, ['init', '-q']);
  for (const witness of WITNESSES) {
    const source = replaceOnce(readSource(witness.path), witness.anchor, witness.mixed);
    mkdirSync(dirname(join(root, witness.path)), { recursive: true });
    writeFileSync(join(root, witness.path), source);
    const spans = readProtectedSpans(source, witness.path);
    const owned = source.indexOf(witness.token);
    const offset =
      witness.path === AUDIT
        ? owned + 'grant.scope.'.length
        : owned + witness.token.indexOf('project');
    expect(isProtectedSpan(spans, offset, offset + (witness.path === AUDIT ? 9 : 7))).toBe(true);
    const old = source.indexOf('legacyProjectId');
    expect(isProtectedSpan(spans, old, old + 'legacyProjectId'.length)).toBe(false);
  }
  git(root, ['add', '-A']);
  expect(residualsIn(root).filter((entry) => entry.line > 0)).toHaveLength(3);
  expect(applyRename(root, ['libs'])).toEqual({ moved: 0, rewritten: 3 });
  for (const witness of WITNESSES)
    expect(readFileSync(join(root, witness.path), 'utf8')).toContain(witness.renamed);
  expect(residualsIn(root)).toEqual([]);
  expect(applyRename(root, ['libs'])).toEqual({ moved: 0, rewritten: 0 });
});

describe('closed assignment scenario identity tokens', () => {
  for (const id of ['001', '002', '003']) {
    it('retains allocated ID ' + id + ' while renaming adjacent old prose and code', () => {
      const source =
        "it('[PROJECT-ASSIGNMENT-READS-" + id + "] reads project rows', () => use(projectId));";
      const token = '[PROJECT-ASSIGNMENT-READS-' + id + ']';
      const spans = readProtectedSpans(source, 'src/read.test.ts');
      const start = source.indexOf(token);
      expect(isProtectedSpan(spans, start, start + token.length)).toBe(true);
      const neighbor = source.indexOf('project rows');
      expect(isProtectedSpan(spans, neighbor, neighbor + 7)).toBe(false);
      expect(renameText(source, 'src/read.test.ts')).toBe(
        "it('[PROJECT-ASSIGNMENT-READS-" +
          id +
          "] reads work package rows', () => use(workPackageId));",
      );
    });
  }
  for (const token of [
    '[PROJECT-ASSIGNMENT-READS-004]',
    '[PROJECT-ASSIGNMENT-READS-01]',
    '[PROJECT-ASSIGNMENT-READS-001-extra]',
    'x[PROJECT-ASSIGNMENT-READS-001]y',
  ]) {
    it('does not protect an unallocated or malformed/lookalike identity: ' + token, () => {
      const source = "it('" + token + " project rows', () => use(projectId));";
      const renamed = renameText(source, 'src/read.test.ts');
      const start = source.indexOf(token);
      expect(
        isProtectedSpan(
          readProtectedSpans(source, 'src/read.test.ts'),
          start,
          start + token.length,
        ),
      ).toBe(false);
      expect(renamed).toContain('work package rows');
      expect(renamed).toContain('use(workPackageId)');
    });
  }
  it('keeps the actual scenario ID while correcting its current old-WBS title', () => {
    const line = readSource(ASSIGNMENT)
      .split('\n')
      .filter((entry) => entry.includes("it('[PROJECT-ASSIGNMENT-READS-003]"));
    expect(line).toHaveLength(1);
    const current = line.at(0);
    if (current === undefined) throw new Error('actual scenario title missing');
    expect(renameText(current, ASSIGNMENT)).toBe(
      "  it('[PROJECT-ASSIGNMENT-READS-003] names only the people assigned in the requested work package', async () => {",
    );
  });
  it('applies/checks a mixed ID line without hiding neighboring current rename work', () => {
    const root = scratchSync('assignment-token-protection-');
    git(root, ['init', '-q']);
    writeFileSync(
      join(root, 'read.test.ts'),
      "it('[PROJECT-ASSIGNMENT-READS-001] project rows', () => use(projectId));\n",
    );
    git(root, ['add', '-A']);
    expect(residualsIn(root)).toHaveLength(1);
    expect(applyRename(root, ['read.test.ts'])).toEqual({ moved: 0, rewritten: 1 });
    expect(readFileSync(join(root, 'read.test.ts'), 'utf8')).toBe(
      "it('[PROJECT-ASSIGNMENT-READS-001] work package rows', () => use(workPackageId));\n",
    );
    expect(residualsIn(root)).toEqual([]);
  });
});

const SCOPE_KIND = "scopeKind: \"'organization' | 'project' | 'work_package'\",";
const MEMBER_ARRAY =
  "            createdAt: 'number',\n          }).array(),\n        }),\n      ),";
const MEMBER_SCHEMA = '      schema: responseSchema(\n        type({\n          members: type({';

interface OwnershipInput {
  readonly name: string;
  readonly path: string;
  readonly diagnostic: string;
  readonly classification: 'ownership' | 'diagnostic' | 'raw-interval';
  readonly replaceSource: (source: string) => string;
  readonly inspectSource?: (source: string) => void;
}

const OWNERSHIP_INPUTS: readonly OwnershipInput[] = [
  {
    name: 'refuses the actual member schema zero arguments',
    path: SHAPES,
    diagnostic: 'listMembers-schema',
    classification: 'ownership',
    replaceSource: (source) =>
      replaceOnce(
        source,
        MEMBER_SCHEMA,
        '      schema: responseSchema(),\n      detachedSchema: responseSchema(\n        type({\n          members: type({',
      ),
  },
  {
    name: 'refuses the actual member schema two arguments with the first unchanged',
    path: SHAPES,
    diagnostic: 'listMembers-schema',
    classification: 'ownership',
    replaceSource: (source) =>
      replaceOnce(
        source,
        MEMBER_ARRAY,
        MEMBER_ARRAY.replace(
          '        }),\n      ),',
          '        }),\n        extraSchema,\n      ),',
        ),
      ),
  },
  {
    name: 'refuses actual audit evidence with an unused third parameter',
    path: AUDIT,
    diagnostic: 'appendGrantAudit-evidence',
    classification: 'ownership',
    replaceSource: (source) =>
      replaceOnce(source, '  },\n): void {', '  },\n  unused?: unknown,\n): void {'),
  },
  {
    name: 'refuses a second actual member response while preserving the first valid response',
    path: SHAPES,
    diagnostic: 'listMembers-responses',
    classification: 'ownership',
    replaceSource: (source) =>
      replaceOnce(
        source,
        MEMBER_ARRAY + '\n    },\n  ],',
        MEMBER_ARRAY +
          "\n    },\n    { kind: 'json', status: 201, schema: responseSchema(type({ marker: 'string' })) },\n  ],",
      ),
  },
  {
    name: 'refuses the actual member schema factory with its valid argument unchanged',
    path: SHAPES,
    diagnostic: 'listMembers-schema',
    classification: 'ownership',
    replaceSource: (source) =>
      replaceOnce(source, MEMBER_SCHEMA, MEMBER_SCHEMA.replace('responseSchema(', 'legacySchema(')),
  },
  {
    name: 'refuses the actual member wrapper with its call and object unchanged',
    path: SHAPES,
    diagnostic: 'listMembers-members-wrapper',
    classification: 'ownership',
    replaceSource: (source) =>
      replaceOnce(source, MEMBER_ARRAY, MEMBER_ARRAY.replace('.array()', '.legacyArray()')),
  },
  {
    name: 'refuses the actual member array wrapper extra argument',
    path: SHAPES,
    diagnostic: 'listMembers-members-arguments',
    classification: 'ownership',
    replaceSource: (source) =>
      replaceOnce(source, MEMBER_ARRAY, MEMBER_ARRAY.replace('.array()', ".array('extra')")),
  },
  {
    name: 'refuses the actual role wrapper wrong null literal',
    path: SHAPES,
    diagnostic: 'listMembers-role-arguments',
    classification: 'ownership',
    replaceSource: (source) =>
      replaceOnce(
        source,
        "            }).or('null'),\n            grantCount: 'number',",
        "            }).or('undefined'),\n            grantCount: 'number',",
      ),
  },
  {
    name: 'refuses the actual nested via type factory with its valid object unchanged',
    path: SHAPES,
    diagnostic: 'listMembers-via-type',
    classification: 'ownership',
    replaceSource: (source) =>
      replaceOnce(source, '              via: type({', '              via: legacyType({'),
  },
  {
    name: 'refuses a changed decoded member union while its raw project token remains',
    path: SHAPES,
    diagnostic: 'listMembers-scope-kind',
    classification: 'ownership',
    replaceSource: (source) =>
      replaceOnce(
        source,
        SCOPE_KIND,
        "scopeKind: \"'legacy_organization' | 'project' | 'work_package'\",",
      ),
    inspectSource: (source) => {
      expect(source).toContain(
        "scopeKind: \"'legacy_organization' | 'project' | 'work_package'\",",
      );
    },
  },
  {
    name: 'refuses the actual escaped project spelling at the raw scope-token boundary',
    path: SHAPES,
    diagnostic: 'listMembers-scope-token',
    classification: 'raw-interval',
    replaceSource: (source) =>
      replaceOnce(
        source,
        SCOPE_KIND,
        "scopeKind: \"'organization' | '\\x70roject' | 'work_package'\",",
      ),
    inspectSource: (source) => {
      const parsed = ts.createSourceFile(SHAPES, source, ts.ScriptTarget.Latest, true);
      const literals: ts.StringLiteral[] = [];
      const visit = (node: ts.Node): void => {
        if (ts.isStringLiteral(node) && node.getText(parsed).includes('\\x70roject'))
          literals.push(node);
        ts.forEachChild(node, visit);
      };
      visit(parsed);
      expect(literals).toHaveLength(1);
      const literal = literals.at(0);
      if (literal === undefined) throw new Error('escaped actual scope token fixture is absent');
      expect(literal.text).toBe("'organization' | 'project' | 'work_package'");
      expect(literal.getText(parsed)).not.toContain("'project'");
    },
  },
  {
    name: 'reports the actual audit bodyless-owner diagnostic',
    path: AUDIT,
    diagnostic: 'appendGrantAudit',
    classification: 'diagnostic',
    replaceSource: (source) => removeFunctionBody(source, AUDIT, 'appendGrantAudit'),
  },
  {
    name: 'reports the actual initial-role bodyless-owner diagnostic',
    path: INITIAL,
    diagnostic: 'readInitialRolePermissionsIn',
    classification: 'diagnostic',
    replaceSource: (source) => removeFunctionBody(source, INITIAL, 'readInitialRolePermissionsIn'),
  },
  {
    name: 'reports the actual member nonobject endpoint argument diagnostic',
    path: SHAPES,
    diagnostic: 'listMembers-shape',
    classification: 'diagnostic',
    replaceSource: (source) =>
      replaceOnce(
        source,
        'export const listMembers = defineEndpointShape({',
        'const memberShape = {};\nexport const listMembers = defineEndpointShape(memberShape);\nconst detachedMemberShape = ({',
      ),
  },
  {
    name: 'reports the actual member nonobject sole response diagnostic',
    path: SHAPES,
    diagnostic: 'listMembers-response',
    classification: 'diagnostic',
    replaceSource: (source) =>
      replaceOnce(
        source,
        "  responses: [\n    {\n      kind: 'json',\n      status: 200,\n" + MEMBER_SCHEMA,
        "  responses: [null],\n  detachedResponses: [\n    {\n      kind: 'json',\n      status: 200,\n" +
          MEMBER_SCHEMA,
      ),
  },
  {
    name: 'reports the actual member nonobject payload type argument diagnostic',
    path: SHAPES,
    diagnostic: 'listMembers-payload-object',
    classification: 'diagnostic',
    replaceSource: (source) =>
      replaceOnce(
        source,
        MEMBER_SCHEMA,
        '      schema: responseSchema(type(payloadShape)),\n      detachedSchema: responseSchema(\n        type({\n          members: type({',
      ),
  },
];

describe('finite actual-source ownership prerequisites', () => {
  for (const scenario of OWNERSHIP_INPUTS)
    it(scenario.name, () => {
      const source = readSource(scenario.path);
      expect(renameText(source, scenario.path)).toBe(source);
      const changed = scenario.replaceSource(source);
      expect(changed).not.toBe(source);
      scenario.inspectSource?.(changed);
      expect(observeRename(changed, scenario.path)).toEqual({
        kind: 'refused',
        message: 'protected witness changed: ' + scenario.path + ':' + scenario.diagnostic,
      });
    });

  it('keeps the actual raw project token exact bounds and text', () => {
    const source = readSource(SHAPES);
    expect(renameText(source, SHAPES)).toBe(source);
    expect(source.split(SCOPE_KIND)).toHaveLength(2);
    const start = source.indexOf(SCOPE_KIND);
    const owned = readProtectedSpans(source, SHAPES).filter(
      (span) => span.rule === 'member-response-engagement-kind',
    );
    expect(owned).toEqual([
      { start: start + 29, end: start + 38, rule: 'member-response-engagement-kind' },
    ]);
    expect(source.slice(start + 29, start + 38)).toBe("'project'");
  });
});
