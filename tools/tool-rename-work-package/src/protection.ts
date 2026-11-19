import ts from 'typescript';

import { protectionOf } from './allow-list';

/** One reviewed new-meaning occurrence; unrelated tokens on the same line remain renameable. */
export interface ProtectedSpan {
  readonly start: number;
  readonly end: number;
  readonly rule: string;
}

/** Exact current catalogue literals; each has a tracked witness, never a prefix wildcard. */
export const PROTECTED_LITERALS = [
  'organization.create_project',
  'project.read',
  'project.manage_settings',
  'project.manage_budgets',
  'project.manage_dependencies',
  'project.manage_packages',
  'project.grant',
  'project-manager',
  'project-contributor',
  'project-viewer',
  'work_package',
] as const;

/** True only when a complete occurrence lies inside one qualified interval. */
export function isProtectedSpan(
  spans: readonly ProtectedSpan[],
  start: number,
  end: number,
): boolean {
  return spans.some((span) => span.start <= start && span.end >= end);
}

type EnclosureKind = 'variable' | 'function' | 'type' | 'interface';

/** Counts actual named declarators and selects only that node, never unrelated statement siblings. */
function requireDeclaration(source: ts.SourceFile, name: string, kind: EnclosureKind): ts.Node {
  const declarations = source.statements.flatMap<ts.Node>((statement) => {
    if (ts.isVariableStatement(statement))
      return statement.declarationList.declarations.filter(
        (declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === name,
      );
    return (ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isFunctionDeclaration(statement)) &&
      statement.name?.text === name
      ? [statement]
      : [];
  });
  // Proof: span-variable-cardinality accepting duplicate named declarators failed "refuses duplicate named variable declarators even when they share one statement" (protection.test.ts); restored GREEN.
  const declaration = declarations.at(0);
  if (declarations.length !== 1 || declaration === undefined)
    throw new Error(
      'protected declaration must occur exactly once: ' + source.fileName + ':' + name,
    );
  const matchesKind =
    kind === 'variable'
      ? ts.isVariableDeclaration(declaration)
      : kind === 'function'
        ? ts.isFunctionDeclaration(declaration)
        : kind === 'type'
          ? ts.isTypeAliasDeclaration(declaration)
          : ts.isInterfaceDeclaration(declaration);
  // Proof: span-enclosure-kind bypassing the enclosure-kind refusal failed "refuses a variable enclosure replaced by a same-name function instead of widening its context" (protection.test.ts); restored GREEN. Named-diagnostic contract; a later guard still refused.
  if (!matchesKind)
    throw new Error('protected declaration kind changed: ' + source.fileName + ':' + name);
  return declaration;
}

/** Retains only comment tokens of explicitly reviewed new-meaning declarations. */
function protectCommentTokens(
  source: ts.SourceFile,
  declaration: ts.Node,
  spans: ProtectedSpan[],
): void {
  const visit = (node: ts.Node): void => {
    for (const comment of ts.getLeadingCommentRanges(source.text, node.getFullStart()) ?? []) {
      const text = source.text.slice(comment.pos, comment.end);
      for (const match of text.matchAll(/\bprojects?(?:Id)?\b/gi))
        spans.push({
          start: comment.pos + match.index,
          end: comment.pos + match.index + match[0].length,
          rule: 'permission-model-prose',
        });
    }
    ts.forEachChild(node, visit);
  };
  visit(declaration);
}

/**
 * E11/E12's shared interpretation for apply, check and collision evidence. Exact catalogue
 * literals and known parent-chain tokens are distinct from old planning tokens beside them.
 * Syntax is parsed only for reviewed named enclosures; no checker infers authority or meaning.
 * @throws on malformed syntax or a missing/ambiguous required owner/member witness.
 */
export function readProtectedSpans(text: string, path: string): readonly ProtectedSpan[] {
  const spans: ProtectedSpan[] = [];
  let offset = 0;
  for (const line of text.split('\n')) {
    if (protectionOf(line) !== undefined)
      spans.push({ start: offset, end: offset + line.length, rule: 'whole-line-prose' });
    offset += line.length + 1;
  }
  for (const match of text.matchAll(
    /(?<![A-Za-z0-9_-])\[PROJECT-ASSIGNMENT-READS-00[123]\](?![A-Za-z0-9_-])/g,
  ))
    spans.push({
      start: match.index,
      end: match.index + match[0].length,
      rule: 'allocated-assignment-scenario-id',
    });
  // Proof: span-catalogue removing closed catalogue literal spans failed "preserves a catalogue permission while renaming an old package argument on the same line" (allow-list.test.ts); restored GREEN.
  for (const literal of PROTECTED_LITERALS) {
    const escaped = literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const match of text.matchAll(new RegExp('([\'"`])(' + escaped + ')\\1', 'g')))
      spans.push({
        start: match.index,
        end: match.index + match[0].length,
        rule: 'catalogue-' + literal,
      });
  }
  // Proof: span-no-generic-parent protecting every projectId token globally failed "renames the actual unrelated captured planning chain field" (allow-list.test.ts); restored GREEN.
  // Proof: span-parent-identifier dropping ProjectChain identifier protection failed "the actual renamed ScopeChain compiles distinct parent and package identities" (allow-list.test.ts); restored GREEN.
  for (const match of text.matchAll(/\b(?:ProjectChain|workPackageId)\b/g))
    spans.push({
      start: match.index,
      end: match.index + match[0].length,
      rule: 'known-new-identifier',
    });

  if (path.endsWith('.md')) {
    for (const link of text.matchAll(/\]\([^)\n]+\)/g)) {
      const href = link[0].slice(2, -1);
      for (const token of href.matchAll(/\bwork-packages?\b/g))
        spans.push({
          start: link.index + 2 + token.index,
          end: link.index + 2 + token.index + token[0].length,
          rule: 'existing-window-link-token',
        });
    }
  }

  if (path === 'libs/wbs/domain/domain/src/access-role.ts') {
    const source = parseProtectedSource(text, path);
    for (const name of [
      'ACCESS_OBJECT_KINDS',
      'PERMISSIONS',
      'BREADTH',
      'BUILT_IN_ROLES',
      'GrantTarget',
      'READ_PERMISSION_OF',
    ]) {
      const declaration = requireDeclaration(
        source,
        name,
        name === 'GrantTarget' ? 'type' : 'variable',
      );
      if (ts.isVariableDeclaration(declaration)) {
        let initializer = declaration.initializer;
        while (
          initializer !== undefined &&
          (ts.isAsExpression(initializer) ||
            ts.isSatisfiesExpression(initializer) ||
            ts.isParenthesizedExpression(initializer))
        )
          initializer = initializer.expression;
        const matchesLiteral =
          initializer !== undefined &&
          (name === 'BREADTH' || name === 'READ_PERMISSION_OF'
            ? ts.isObjectLiteralExpression(initializer)
            : ts.isArrayLiteralExpression(initializer));
        // Proof: span-literal-root bypassing the literal-root refusal failed "refuses a named literal map replaced by a callable initializer" (protection.test.ts); restored GREEN. Named-diagnostic contract; a later guard still refused.
        if (!matchesLiteral)
          throw new Error('protected literal initializer kind changed: ' + path + ':' + name);
      }
      const visit = (node: ts.Node): void => {
        // Proof: span-literal-body allowing callable descendants in catalogue literals failed "refuses executable descendants in protected catalogue literals: callback: () => ({project: 'old'})," (protection.test.ts); restored GREEN.
        if (ts.isFunctionLike(node))
          throw new Error('protected literal contains executable descendant: ' + path + ':' + name);
        if (
          (ts.isStringLiteral(node) && node.text === 'project') ||
          (ts.isIdentifier(node) &&
            (node.text === 'project' || node.text === 'work_package') &&
            ts.isPropertyAssignment(node.parent) &&
            node.parent.name === node)
        )
          spans.push({
            start: node.getStart(source),
            end: node.getEnd(),
            rule: name + '-project-kind',
          });
        ts.forEachChild(node, visit);
      };
      visit(declaration);
    }
    for (const name of [
      'roleMayHold',
      'roleFitsScope',
      'permissionsOnTarget',
      'ScopeChain',
      'InterimPackageChain',
      'reachingGrantsOf',
      'effectiveRoleOn',
    ])
      protectCommentTokens(
        source,
        requireDeclaration(
          source,
          name,
          name === 'ScopeChain'
            ? 'type'
            : name === 'InterimPackageChain'
              ? 'interface'
              : 'function',
        ),
        spans,
      );
    for (const name of ['ProjectChain', 'WorkPackageChain']) {
      const declarations = source.statements.filter(
        (statement): statement is ts.InterfaceDeclaration =>
          ts.isInterfaceDeclaration(statement) && statement.name.text === name,
      );
      const declaration = declarations.at(0);
      // Proof: span-parent-enclosure accepting duplicate parent declarations failed "refuses two required parent declarations instead of selecting the first" (protection.test.ts); restored GREEN.
      if (declarations.length !== 1 || declaration === undefined)
        throw new Error('protected enclosure must occur exactly once: ' + path + ':' + name);
      protectCommentTokens(source, declaration, spans);
      const parents = declaration.members.filter(
        (member): member is ts.PropertySignature =>
          ts.isPropertySignature(member) &&
          ts.isIdentifier(member.name) &&
          member.name.text === 'projectId',
      );
      const parent = parents.at(0);
      // Proof: span-parent-cardinality accepting duplicate parent members failed "refuses duplicate parent members rather than silently widening their protection" (protection.test.ts); restored GREEN.
      if (parents.length !== 1 || parent === undefined)
        throw new Error('protected parent field must occur exactly once: ' + path + ':' + name);
      spans.push({
        start: parent.name.getStart(source),
        end: parent.name.getEnd(),
        rule: name + '-parent-id',
      });
      for (const member of declaration.members)
        if (
          ts.isPropertySignature(member) &&
          member.type !== undefined &&
          ts.isLiteralTypeNode(member.type) &&
          ts.isStringLiteral(member.type.literal) &&
          member.type.literal.text === 'project'
        )
          spans.push({
            start: member.type.literal.getStart(source),
            end: member.type.literal.getEnd(),
            rule: name + '-level',
          });
    }
  }
  // Proof: span-grant-scope dropping the qualified grant-scope protection failed "keeps the future GrantScope arm while renaming the old SQL row in its mixed documentation" (scope-conversions.test.ts); restored GREEN.
  if (path === 'libs/wbs/application/core/src/ports/access-grants.ts')
    protectProjectArm(parseProtectedSource(text, path), 'GrantScope', 'projectId', spans);
  // Proof: span-access-target dropping the qualified access-target protection failed "keeps the future AccessTarget arm and its structurally wider parent-field documentation" (scope-conversions.test.ts); restored GREEN.
  if (path === 'libs/wbs/application/core/src/ports/access-decisions.ts')
    protectProjectArm(parseProtectedSource(text, path), 'AccessTarget', 'chain', spans);
  // Proof: span-scope-rows dropping the qualified SQL scope protection failed "keeps only the new scopeRows SQL namespace and parent access while renaming real package-table reads" (scope-conversions.test.ts); restored GREEN.
  if (path === 'libs/wbs/adapters/store-sqlite/src/access-decisions.ts')
    protectScopeRows(parseProtectedSource(text, path), spans);
  // Proof: span-grant-conversions dropping the qualified grant conversion protection failed "keeps grant scope conversion fields without preserving old package-table ownership or SQL prose" (scope-conversions.test.ts); restored GREEN.
  if (path === 'libs/wbs/adapters/store-sqlite/src/access-grant.ts')
    protectGrantConversions(parseProtectedSource(text, path), spans);
  // Proof: span-schema-kinds dropping the qualified role/grant CHECK protection failed "keeps future role and grant CHECK kinds while renaming the old audit subject on the same schema" (scope-conversions.test.ts); restored GREEN.
  if (path === 'libs/wbs/adapters/store-sqlite/src/schema.ts')
    protectSchemaScopeKinds(parseProtectedSource(text, path), spans);
  // Proof: span-decision-fixture dropping new-target fixture protection failed "keeps actual future-scope fixture fields without retaining the old project table snapshot" (scope-conversions.test.ts); restored GREEN.
  if (path === 'libs/wbs/adapters/store-sqlite/src/access-decisions.db.test.ts')
    protectDecisionFixtures(parseProtectedSource(text, path), spans);
  // Proof: span-grant-fixture dropping new grant fixture protection failed "keeps actual future-scope fixture fields without retaining the old project table snapshot" (scope-conversions.test.ts); restored GREEN.
  if (path === 'libs/wbs/adapters/store-sqlite/src/access-grant-store.db.test.ts')
    protectGrantFixture(parseProtectedSource(text, path), spans);
  // Proof: span-role-fixture dropping new role-kind fixture protection failed "keeps current role-model kind fixtures without giving the fixture file a generic project-kind exemption" (scope-conversions.test.ts); restored GREEN.
  if (path === 'libs/wbs/domain/domain/src/access-role.test.ts')
    protectRoleKindFixtures(parseProtectedSource(text, path), spans);
  if (path === 'libs/wbs/adapters/store-sqlite/src/access-audit.ts')
    protectGrantAuditParent(parseProtectedSource(text, path), spans);
  if (path === 'libs/wbs/adapters/store-sqlite/src/initial-access.ts')
    protectInitialRoleKind(parseProtectedSource(text, path), spans);
  if (path === 'libs/wbs/domain/contracts/src/http/organization-shapes.ts')
    protectMemberScopeKind(parseProtectedSource(text, path), spans);
  if (
    [
      'wire-types.ts',
      'validate-connected-solver-request.ts',
      'parse-solver-response.ts',
      'revalidate-solver-result.ts',
      'connected-boundaries.ts',
      'build-connected-solver-request.ts',
      // Proof: span-wire-path admitting a same-basename neighboring file failed "does not assign frozen wire meaning to a same-basename file below an unreviewed directory" (solver-protection.test.ts); restored GREEN.
    ].some((file) => path === 'libs/wbs/domain/contracts/solver/src/' + file)
  )
    protectSolverWire(text, path, spans);
  return spans;
}

/** A required syntax witness is trusted source state, not an optional rename hint. */
function requireWitness(condition: boolean, path: string, owner: string): asserts condition {
  if (!condition) throw new Error('protected witness changed: ' + path + ':' + owner);
}

function retainNodeSpan(
  source: ts.SourceFile,
  node: ts.Node,
  rule: string,
  spans: ProtectedSpan[],
): void {
  spans.push({ start: node.getStart(source), end: node.getEnd(), rule });
}

/** Acquires syntax only; diagnostics must be available before any qualified interpretation. */
function parseProtectedSource(text: string, path: string): ts.SourceFile {
  const diagnostics = ts.transpileModule(text, {
    fileName: path,
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
  }).diagnostics;
  // Proof: span-parser-diagnostics-absence omitting the required parser diagnostics field failed "keeps exact permission-model bytes while still rewriting an injected old planning field" (allow-list.test.ts); restored GREEN. Required dependency absence, not admission bypass.
  if (diagnostics === undefined)
    throw new Error('protected source parser omitted required diagnostics: ' + path);
  // Proof: span-parser-syntax ignoring parser syntax diagnostics failed "refuses malformed syntax before selecting a required permission-model enclosure" (protection.test.ts); restored GREEN.
  if (diagnostics.length !== 0)
    throw new Error(
      'protected source syntax is malformed: ' +
        path +
        ': ' +
        diagnostics
          .map((entry) => ts.flattenDiagnosticMessageText(entry.messageText, '\n'))
          .join('; '),
    );
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
}

/** New scope/entity prose is distinct from the same declaration's old quoted SQL row names. */
function protectScopeProse(source: ts.SourceFile, node: ts.Node, spans: ProtectedSpan[]): void {
  const start = node.getFullStart();
  const prose = source.text.slice(start, node.getStart(source));
  for (const match of prose.matchAll(/\bproject\b(?=`?\s+(?:scope|entity)\b)/g))
    spans.push({
      start: start + match.index,
      end: start + match.index + match[0].length,
      rule: 'new-scope-prose',
    });
}

/** Owns only the named union's explicit project arm, including its one required parent member. */
function protectProjectArm(
  source: ts.SourceFile,
  name: string,
  parent: 'projectId' | 'chain',
  spans: ProtectedSpan[],
): void {
  const declaration = requireDeclaration(source, name, 'type');
  requireWitness(
    ts.isTypeAliasDeclaration(declaration) && ts.isUnionTypeNode(declaration.type),
    source.fileName,
    name,
  );
  const arms: { shape: ts.TypeLiteralNode; kind: ts.StringLiteral }[] = [];
  for (const shape of declaration.type.types) {
    if (!ts.isTypeLiteralNode(shape)) continue;
    for (const member of shape.members)
      if (
        ts.isPropertySignature(member) &&
        ts.isIdentifier(member.name) &&
        member.name.text === 'kind' &&
        member.type !== undefined &&
        ts.isLiteralTypeNode(member.type) &&
        ts.isStringLiteral(member.type.literal) &&
        member.type.literal.text === 'project'
      )
        arms.push({ shape, kind: member.type.literal });
  }
  const arm = arms.at(0);
  requireWitness(arms.length === 1 && arm !== undefined, source.fileName, name + '-project-arm');
  const members = arm.shape.members.filter(
    (member): member is ts.PropertySignature =>
      ts.isPropertySignature(member) && ts.isIdentifier(member.name) && member.name.text === parent,
  );
  const member = members.at(0);
  requireWitness(members.length === 1 && member !== undefined, source.fileName, name + '-parent');
  requireWitness(
    parent === 'projectId'
      ? member.type?.kind === ts.SyntaxKind.StringKeyword
      : member.type !== undefined &&
          ts.isTypeReferenceNode(member.type) &&
          ts.isIdentifier(member.type.typeName) &&
          member.type.typeName.text === 'ProjectChain',
    source.fileName,
    name + '-parent-type',
  );
  retainNodeSpan(source, arm.kind, name + '-kind', spans);
  if (parent === 'projectId') retainNodeSpan(source, member.name, name + '-parent', spans);
  if (name === 'GrantScope') protectScopeProse(source, declaration, spans);
  else protectCommentTokens(source, declaration, spans);
}

function retainQuotedProject(
  source: ts.SourceFile,
  node: ts.Node,
  rule: string,
  spans: ProtectedSpan[],
): void {
  const matches = [...node.getText(source).matchAll(/'project'/g)];
  const match = matches.at(0);
  requireWitness(matches.length === 1 && match !== undefined, source.fileName, rule + '-SQL-token');
  spans.push({
    start: node.getStart(source) + match.index,
    end: node.getStart(source) + match.index + match[0].length,
    rule,
  });
}

/** The namespace VALUES tuple is not a planning-table query elsewhere in this adapter. */
function protectScopeRows(source: ts.SourceFile, spans: ProtectedSpan[]): void {
  const declaration = requireDeclaration(source, 'scopeRows', 'function');
  requireWitness(
    ts.isFunctionDeclaration(declaration) && declaration.body !== undefined,
    source.fileName,
    'scopeRows',
  );
  const returns = declaration.body.statements.filter(ts.isReturnStatement);
  const returned = returns.at(0);
  requireWitness(
    returns.length === 1 &&
      returned?.expression !== undefined &&
      ts.isConditionalExpression(returned.expression),
    source.fileName,
    'scopeRows-return',
  );
  const branch = returned.expression;
  requireWitness(
    ts.isBinaryExpression(branch.condition) &&
      branch.condition.left.getText(source) === 'target.kind' &&
      branch.condition.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
      ts.isStringLiteral(branch.condition.right) &&
      branch.condition.right.text === 'project',
    source.fileName,
    'scopeRows-condition',
  );
  requireWitness(
    ts.isTaggedTemplateExpression(branch.whenTrue) &&
      branch.whenTrue.tag.getText(source) === 'sql' &&
      ts.isTemplateExpression(branch.whenTrue.template),
    source.fileName,
    'scopeRows-SQL',
  );
  const template = branch.whenTrue.template;
  const organization = template.templateSpans.at(0);
  const project = template.templateSpans.at(1);
  requireWitness(
    template.templateSpans.length === 2 &&
      organization !== undefined &&
      project !== undefined &&
      template.head.text === "VALUES ('organization', " &&
      organization.expression.getText(source) === 'target.chain.organizationId' &&
      organization.literal.text === "), ('project', " &&
      project.literal.text === ')' &&
      ts.isPropertyAccessExpression(project.expression) &&
      project.expression.expression.getText(source) === 'target.chain' &&
      project.expression.name.text === 'projectId',
    source.fileName,
    'scopeRows-values',
  );
  retainNodeSpan(source, branch.condition.right, 'scopeRows-kind', spans);
  retainQuotedProject(source, organization.literal, 'scopeRows-SQL-kind', spans);
  retainNodeSpan(source, project.expression.name, 'scopeRows-parent', spans);
  protectCommentTokens(source, declaration, spans);
}

function readGrantProjectCase(
  source: ts.SourceFile,
  name: string,
  discriminant: string,
): ts.CaseClause {
  const declaration = requireDeclaration(source, name, 'function');
  requireWitness(
    ts.isFunctionDeclaration(declaration) && declaration.body !== undefined,
    source.fileName,
    name,
  );
  const switches = declaration.body.statements.filter(
    (statement): statement is ts.SwitchStatement =>
      ts.isSwitchStatement(statement) && statement.expression.getText(source) === discriminant,
  );
  const selected = switches.at(0);
  requireWitness(
    switches.length === 1 && selected !== undefined,
    source.fileName,
    name + '-switch',
  );
  const cases = selected.caseBlock.clauses.filter(
    (clause): clause is ts.CaseClause =>
      ts.isCaseClause(clause) &&
      ts.isStringLiteral(clause.expression) &&
      clause.expression.text === 'project',
  );
  const branch = cases.at(0);
  requireWitness(
    cases.length === 1 && branch !== undefined,
    source.fileName,
    name + '-project-case',
  );
  return branch;
}

/** Scope rows/records retain their new project namespace; package-table access still renames. */
function protectGrantConversions(source: ts.SourceFile, spans: ProtectedSpan[]): void {
  for (const name of ['isScopeOf', 'scopeColumns', 'scopeOf']) {
    const branch = readGrantProjectCase(
      source,
      name,
      name === 'scopeOf' ? 'row.scopeKind' : 'scope.kind',
    );
    retainNodeSpan(source, branch.expression, name + '-kind', spans);
    if (name === 'isScopeOf') {
      protectScopeProse(source, requireDeclaration(source, name, 'function'), spans);
      continue;
    }
    const returns = branch.statements.filter(ts.isReturnStatement);
    const returned = returns.at(0);
    requireWitness(
      returns.length === 1 &&
        returned?.expression !== undefined &&
        ts.isObjectLiteralExpression(returned.expression),
      source.fileName,
      name + '-return',
    );
    const kind = name === 'scopeColumns' ? 'scopeKind' : 'kind';
    const kinds = returned.expression.properties.filter(
      (property): property is ts.PropertyAssignment =>
        ts.isPropertyAssignment(property) &&
        ts.isIdentifier(property.name) &&
        property.name.text === kind,
    );
    const named = kinds.at(0);
    requireWitness(
      kinds.length === 1 &&
        named !== undefined &&
        ts.isStringLiteral(named.initializer) &&
        named.initializer.text === 'project',
      source.fileName,
      name + '-returned-kind',
    );
    retainNodeSpan(source, named.initializer, name + '-returned-kind', spans);
    const field = name === 'scopeColumns' ? 'scopeId' : 'projectId';
    const parents = returned.expression.properties.filter(
      (property): property is ts.PropertyAssignment =>
        ts.isPropertyAssignment(property) &&
        ts.isIdentifier(property.name) &&
        property.name.text === field,
    );
    const parent = parents.at(0);
    requireWitness(
      parents.length === 1 &&
        parent !== undefined &&
        ts.isPropertyAccessExpression(parent.initializer) &&
        parent.initializer.getText(source) ===
          (name === 'scopeColumns' ? 'scope.projectId' : 'row.scopeId'),
      source.fileName,
      name + '-parent',
    );
    retainNodeSpan(
      source,
      name === 'scopeColumns' ? parent.initializer.name : parent.name,
      name + '-parent',
      spans,
    );
  }
}

/** Only the two named access-kind CHECKs own these project literals, never the audit/table kind. */
function protectSchemaScopeKinds(source: ts.SourceFile, spans: ProtectedSpan[]): void {
  for (const [name, table, check, receiver] of [
    ['accessRole', 'access_role', 'access_role_object_kind', 'objectKind'],
    ['accessGrant', 'access_grant', 'access_grant_scope_kind', 'scopeKind'],
  ] as const) {
    const declaration = requireDeclaration(source, name, 'variable');
    requireWitness(
      ts.isVariableDeclaration(declaration) &&
        declaration.initializer !== undefined &&
        ts.isCallExpression(declaration.initializer) &&
        declaration.initializer.expression.getText(source) === 'sqliteTable',
      source.fileName,
      name + '-table',
    );
    const tableName = declaration.initializer.arguments.at(0);
    requireWitness(
      tableName !== undefined && ts.isStringLiteral(tableName) && tableName.text === table,
      source.fileName,
      name + '-table-name',
    );
    const checks: ts.CallExpression[] = [];
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(source) === 'check' &&
        node.arguments.length > 0 &&
        ts.isStringLiteral(node.arguments[0]) &&
        node.arguments[0].text === check
      )
        checks.push(node);
      ts.forEachChild(node, visit);
    };
    visit(declaration.initializer);
    const selected = checks.at(0);
    const sql = selected?.arguments.at(1);
    requireWitness(
      checks.length === 1 &&
        sql !== undefined &&
        ts.isTaggedTemplateExpression(sql) &&
        sql.tag.getText(source) === 'sql' &&
        ts.isTemplateExpression(sql.template),
      source.fileName,
      check,
    );
    const slot = sql.template.templateSpans.at(0);
    requireWitness(
      sql.template.head.text === '' &&
        sql.template.templateSpans.length === 1 &&
        slot?.expression.getText(source) === 't.' + receiver &&
        slot.literal.text === " IN ('organization', 'project', 'work_package')",
      source.fileName,
      check + '-body',
    );
    retainQuotedProject(source, slot.literal, check, spans);
  }
}

function readNamedTest(
  source: ts.SourceFile,
  title: string,
  mode: 'exact' | 'prefix',
): ts.CallExpression {
  const calls: ts.CallExpression[] = [];
  const leadingText = (expression: ts.Expression): string | undefined => {
    while (
      ts.isBinaryExpression(expression) &&
      expression.operatorToken.kind === ts.SyntaxKind.PlusToken
    )
      expression = expression.left;
    return ts.isStringLiteral(expression) ? expression.text : undefined;
  };
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'it'
    ) {
      const first = node.arguments.at(0);
      if (
        first !== undefined &&
        (mode === 'exact'
          ? ts.isStringLiteral(first) && first.text === title
          : leadingText(first) === title)
      )
        calls.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  const selected = calls.at(0);
  requireWitness(calls.length === 1 && selected !== undefined, source.fileName, 'test:' + title);
  return selected;
}

function protectFixtureTitle(
  source: ts.SourceFile,
  call: ts.CallExpression,
  spans: ProtectedSpan[],
): void {
  const title = call.arguments.at(0);
  requireWitness(title !== undefined, source.fileName, 'fixture-title');
  for (const match of title.getText(source).matchAll(/\bprojects?\b/g))
    spans.push({
      start: title.getStart(source) + match.index,
      end: title.getStart(source) + match.index + match[0].length,
      rule: 'new-scope-fixture-title',
    });
}

function protectCallArgument(
  source: ts.SourceFile,
  within: ts.Node,
  callee: string,
  ordinal: number,
  spans: ProtectedSpan[],
): void {
  const arguments_: ts.StringLiteral[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.expression.getText(source) === callee) {
      const argument = node.arguments.at(ordinal);
      if (argument !== undefined && ts.isStringLiteral(argument) && argument.text === 'project')
        arguments_.push(argument);
    }
    ts.forEachChild(node, visit);
  };
  visit(within);
  const argument = arguments_.at(0);
  requireWitness(
    arguments_.length === 1 && argument !== undefined,
    source.fileName,
    callee + '-project-argument',
  );
  retainNodeSpan(source, argument, callee + '-project-argument', spans);
}

function readObjectProperty(
  source: ts.SourceFile,
  object: ts.ObjectLiteralExpression,
  name: string,
): ts.PropertyAssignment {
  const properties = object.properties.filter(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) &&
      ts.isIdentifier(property.name) &&
      property.name.text === name,
  );
  const property = properties.at(0);
  requireWitness(
    properties.length === 1 && property !== undefined,
    source.fileName,
    'fixture-property:' + name,
  );
  return property;
}

function protectFixtureProjectObject(
  source: ts.SourceFile,
  object: ts.ObjectLiteralExpression,
  shape: 'target' | 'grant',
  spans: ProtectedSpan[],
): void {
  const kind = readObjectProperty(source, object, 'kind');
  requireWitness(
    ts.isStringLiteral(kind.initializer) && kind.initializer.text === 'project',
    source.fileName,
    'fixture-project-kind',
  );
  retainNodeSpan(source, kind.initializer, 'fixture-project-kind', spans);
  if (shape === 'grant') {
    retainNodeSpan(
      source,
      readObjectProperty(source, object, 'projectId').name,
      'fixture-parent',
      spans,
    );
  } else {
    const chain = readObjectProperty(source, object, 'chain');
    requireWitness(
      ts.isObjectLiteralExpression(chain.initializer),
      source.fileName,
      'fixture-project-chain',
    );
    const level = readObjectProperty(source, chain.initializer, 'level');
    requireWitness(
      ts.isStringLiteral(level.initializer) && level.initializer.text === 'project',
      source.fileName,
      'fixture-project-level',
    );
    retainNodeSpan(source, level.initializer, 'fixture-project-level', spans);
    retainNodeSpan(
      source,
      readObjectProperty(source, chain.initializer, 'projectId').name,
      'fixture-parent',
      spans,
    );
  }
}

function readTypedFixture(
  source: ts.SourceFile,
  within: ts.Node,
  name: string,
  type: string,
): ts.VariableDeclaration {
  const declarations: ts.VariableDeclaration[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.type !== undefined &&
      ts.isTypeReferenceNode(node.type) &&
      ts.isIdentifier(node.type.typeName) &&
      node.type.typeName.text === type
    )
      declarations.push(node);
    ts.forEachChild(node, visit);
  };
  visit(within);
  const declaration = declarations.at(0);
  requireWitness(
    declarations.length === 1 && declaration !== undefined,
    source.fileName,
    'typed-fixture:' + name,
  );
  return declaration;
}

/** These two local target bindings are new entities; property keys on other objects are not. */
function protectFixtureReferences(
  source: ts.SourceFile,
  within: ts.Node,
  spans: ProtectedSpan[],
): void {
  const bindings = new Map<string, number>();
  const countBinding = (name: ts.BindingName): void => {
    if (ts.isIdentifier(name)) bindings.set(name.text, (bindings.get(name.text) ?? 0) + 1);
    else
      for (const element of name.elements)
        if (ts.isBindingElement(element)) countBinding(element.name);
  };
  const inspectBindings = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) || ts.isParameter(node)) countBinding(node.name);
    else if (
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isClassDeclaration(node) ||
        ts.isClassExpression(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isEnumDeclaration(node)) &&
      node.name !== undefined
    )
      countBinding(node.name);
    ts.forEachChild(node, inspectBindings);
  };
  inspectBindings(within);
  for (const name of ['project', 'atProject'])
    // Proof: span-shadow-binding ignoring fixture shadow bindings failed "refuses shadowed new-target fixture bindings: { const project = oldPlanning; use(project); }" (scope-conversions.test.ts); restored GREEN.
    if (bindings.get(name) !== 1)
      throw new Error('fixture binding must occur exactly once: ' + source.fileName + ':' + name);
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && (node.text === 'project' || node.text === 'atProject')) {
      const parent = node.parent;
      const isPropertyName =
        (ts.isPropertyAccessExpression(parent) ||
          ts.isPropertyAssignment(parent) ||
          ts.isPropertySignature(parent)) &&
        parent.name === node;
      if (!isPropertyName) retainNodeSpan(source, node, 'fixture-project-binding', spans);
    }
    ts.forEachChild(node, visit);
  };
  visit(within);
}

function protectKindParameter(
  source: ts.SourceFile,
  name: string,
  parameter: string,
  spans: ProtectedSpan[],
): void {
  const declaration = requireDeclaration(source, name, 'function');
  requireWitness(ts.isFunctionDeclaration(declaration), source.fileName, name);
  const parameters = declaration.parameters.filter(
    (entry) => ts.isIdentifier(entry.name) && entry.name.text === parameter,
  );
  const selected = parameters.at(0);
  requireWitness(
    parameters.length === 1 && selected?.type !== undefined && ts.isUnionTypeNode(selected.type),
    source.fileName,
    name + '-kind-parameter',
  );
  const kinds = selected.type.types.filter(
    (type): type is ts.LiteralTypeNode =>
      ts.isLiteralTypeNode(type) &&
      ts.isStringLiteral(type.literal) &&
      type.literal.text === 'project',
  );
  const kind = kinds.at(0);
  requireWitness(
    kinds.length === 1 && kind !== undefined,
    source.fileName,
    name + '-project-parameter',
  );
  retainNodeSpan(source, kind, name + '-project-parameter', spans);
}

function protectDecisionFixtures(source: ts.SourceFile, spans: ProtectedSpan[]): void {
  protectKindParameter(source, 'grant', 'scopeKind', spans);
  protectKindParameter(source, 'customRole', 'objectKind', spans);
  const wider = readNamedTest(
    source,
    'a project grant reaches no package, in detail or in the listing, until task 3.2',
    'exact',
  );
  protectFixtureTitle(source, wider, spans);
  protectCallArgument(source, wider, 'grant', 0, spans);
  const chain = readTypedFixture(source, wider, 'chain', 'WorkPackageChain');
  requireWitness(
    chain.initializer !== undefined && ts.isObjectLiteralExpression(chain.initializer),
    source.fileName,
    'wider-chain-object',
  );
  retainNodeSpan(
    source,
    readObjectProperty(source, chain.initializer, 'projectId').name,
    'wider-parent',
    spans,
  );
  const target = readNamedTest(
    source,
    'a package role at organization scope satisfies no project permission',
    'exact',
  );
  protectFixtureTitle(source, target, spans);
  const declaration = readTypedFixture(source, target, 'project', 'AccessTarget');
  requireWitness(
    declaration.initializer !== undefined && ts.isObjectLiteralExpression(declaration.initializer),
    source.fileName,
    'project-target-object',
  );
  protectFixtureProjectObject(source, declaration.initializer, 'target', spans);
  protectFixtureReferences(source, target, spans);
  const corrupt = readNamedTest(source, 'throws for an incompatible role scope through ', 'prefix');
  protectCallArgument(source, corrupt, 'customRole', 1, spans);
  protectCallArgument(source, corrupt, 'expect(failure.message).toContain', 0, spans);
  // Only this reviewed role label denotes the future project kind; the old table snapshot is outside it.
  const visitLabel = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) && node.text === 'nonreading project role')
      retainNodeSpan(source, node, 'project-role-fixture-label', spans);
    ts.forEachChild(node, visitLabel);
  };
  const statement = corrupt.parent;
  requireWitness(
    ts.isExpressionStatement(statement) &&
      ts.isBlock(statement.parent) &&
      ts.isForOfStatement(statement.parent.parent),
    source.fileName,
    'corrupt-role-loop',
  );
  visitLabel(statement.parent.parent);
}

function protectGrantFixture(source: ts.SourceFile, spans: ProtectedSpan[]): void {
  const test = readNamedTest(
    source,
    'refuses another organization’s work package, an absent one and a project scope as not_found',
    'exact',
  );
  protectFixtureTitle(source, test, spans);
  const objects: ts.ObjectLiteralExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'draft') {
      const first = node.arguments.at(0);
      if (
        first !== undefined &&
        ts.isObjectLiteralExpression(first) &&
        first.properties.some(
          (property) =>
            ts.isPropertyAssignment(property) &&
            ts.isIdentifier(property.name) &&
            property.name.text === 'kind' &&
            ts.isStringLiteral(property.initializer) &&
            property.initializer.text === 'project',
        )
      )
        objects.push(first);
    }
    ts.forEachChild(node, visit);
  };
  visit(test);
  const object = objects.at(0);
  requireWitness(
    objects.length === 1 && object !== undefined,
    source.fileName,
    'project-grant-fixture',
  );
  protectFixtureProjectObject(source, object, 'grant', spans);
}

function protectRoleKindFixtures(source: ts.SourceFile, spans: ProtectedSpan[]): void {
  for (const title of [
    'never lets a project role hold an organization permission, nor a package role a project one',
    'leaves every grant unchanged on an unrestricted package, a project and the organization',
    'leaves a grant naming the package or its project unchanged on a restricted package',
    'rejects recognized raw role/scope pairs that the grant writer prohibits',
    'preserves project and package contributor roles at organization scope in the raw decoder',
  ]) {
    const test = readNamedTest(source, title, 'exact');
    protectFixtureTitle(source, test, spans);
    const visit = (node: ts.Node): void => {
      if (ts.isStringLiteral(node) && (node.text === 'project' || node.text === 'project-at-org'))
        retainNodeSpan(source, node, 'project-role-kind-fixture', spans);
      ts.forEachChild(node, visit);
    };
    visit(test);
  }
}

/** Frozen wire keys belong to exact reviewed declarations/receiver expressions, never their host inputs. */
function protectSolverWire(text: string, path: string, spans: ProtectedSpan[]): void {
  const file = path.slice(path.lastIndexOf('/') + 1);
  const source = parseProtectedSource(text, path);
  const requireWire = (condition: boolean, owner: string): void => {
    if (!condition) throw new Error('protected wire witness changed: ' + path + ':' + owner);
  };
  const protectMembers = (
    owner: string,
    kind: EnclosureKind,
    counts: Readonly<Record<string, number>>,
  ): void => {
    const declaration = requireDeclaration(source, owner, kind);
    for (const [name, count] of Object.entries(counts)) {
      const matches: ts.PropertySignature[] = [];
      const visit = (node: ts.Node): void => {
        if (ts.isPropertySignature(node) && ts.isIdentifier(node.name) && node.name.text === name)
          matches.push(node);
        ts.forEachChild(node, visit);
      };
      visit(declaration);
      // Proof: span-wire-member ignoring required wire-member cardinality failed "refuses a missing connected wire identity member rather than silently changing its interpretation" (solver-protection.test.ts); restored GREEN.
      requireWire(matches.length === count, owner + '.' + name);
      for (const match of matches)
        retainNodeSpan(source, match.name, 'solver-wire-' + owner, spans);
    }
  };
  const protectExpressions = (
    owner: string,
    kind: EnclosureKind,
    counts: Readonly<Record<string, number>>,
  ): void => {
    const declaration = requireDeclaration(source, owner, kind);
    for (const [expression, count] of Object.entries(counts)) {
      const matches: ts.Node[] = [];
      const visit = (node: ts.Node): void => {
        if (
          (expression === 'project.projectId'
            ? ['project.projectId', 'workPackage.projectId']
            : [expression]
          ).includes(node.getText(source))
        ) {
          if (ts.isPropertyAccessExpression(node)) matches.push(node.name);
          else if (ts.isElementAccessExpression(node)) matches.push(node.argumentExpression);
          else if (ts.isPropertyAssignment(node)) matches.push(node.name);
        }
        ts.forEachChild(node, visit);
      };
      visit(declaration);
      // Proof: span-wire-expression ignoring a changed exact wire receiver failed "refuses a changed exact wire receiver witness before treating another old package field as wire" (solver-protection.test.ts); restored GREEN.
      requireWire(matches.length === count, owner + ':' + expression);
      for (const match of matches) retainNodeSpan(source, match, 'solver-wire-' + owner, spans);
    }
  };
  if (file === 'wire-types.ts') {
    protectMembers('SolverConnectedScopeIdentity', 'interface', { projectId: 1 });
    protectMembers('SolverConnectedScope', 'interface', { projects: 1, projectId: 3 });
    protectMembers('SolverBoundary', 'type', { foreignProjectId: 1 });
    for (const [owner, keys] of [
      ['CONNECTED_SOLVER_SCOPE_KEYS', ['projectId', 'projects']],
      ['SOLVER_BOUNDARY_KEYS', ['foreignProjectId']],
    ] as const) {
      const declaration = requireDeclaration(source, owner, 'variable');
      requireWitness(ts.isVariableDeclaration(declaration), path, owner);
      let initializer = declaration.initializer;
      while (
        initializer !== undefined &&
        (ts.isAsExpression(initializer) || ts.isParenthesizedExpression(initializer))
      )
        initializer = initializer.expression;
      if (
        initializer === undefined ||
        // Proof: span-wire-array-root bypassing the array-root predicate failed "refuses unsupported wire key-array ownership: CONNECTED_SOLVER_SCOPE_KEYS:callable" (solver-protection.test.ts); restored GREEN. Named-diagnostic contract; a later typed read still threw.
        !ts.isArrayLiteralExpression(initializer) ||
        // Proof: span-wire-string-elements allowing executable key-array elements failed "refuses unsupported wire key-array ownership: CONNECTED_SOLVER_SCOPE_KEYS:nested-callable" (solver-protection.test.ts); restored GREEN.
        !initializer.elements.every(ts.isStringLiteral)
      )
        throw new Error(
          'protected wire key array is not literal string data: ' + path + ':' + owner,
        );
      // Proof: span-wire-direct-elements removing a required direct key dependency failed "retains actual frozen wire declarations but rewrites unrelated old host declarations in that file" (solver-protection.test.ts); restored GREEN. Required selector dependency failure, not admission bypass.
      const strings = initializer.elements.filter(ts.isStringLiteral);
      for (const key of keys) {
        const matches = strings.filter((element) => element.text === key);
        requireWire(matches.length === 1, owner + ':' + key);
        for (const match of matches) retainNodeSpan(source, match, 'solver-wire-' + owner, spans);
      }
    }
  } else if (file === 'validate-connected-solver-request.ts') {
    protectExpressions('validateConnectedSolverRequest', 'function', {
      'request.scope.projects': 2,
      'project.projectId': 1,
      'request.scope.projectId': 2,
      'entry.projectId': 2,
      'foreign.projectId': 2,
      'boundary.foreignProjectId': 1,
      'holder.projectId': 1,
    });
  } else if (file === 'parse-solver-response.ts') {
    protectExpressions('violation', 'variable', {
      "scope['projectId']": 1,
      'expectedScope.projectId': 1,
    });
  } else if (file === 'revalidate-solver-result.ts') {
    protectExpressions('revalidateWireSolverResult', 'variable', {
      'response.scope.projectId': 1,
      'request.scope.projectId': 1,
    });
  } else if (file === 'build-connected-solver-request.ts') {
    protectWireProducer(source, spans);
    protectExpressions('buildConnectedSolverRequest', 'function', {
      'left.projectId': 1,
      'right.projectId': 1,
    });
  } else {
    protectExpressions('buildConnectedSolverBoundaries', 'function', {
      'foreignProjectId: incoming ? predecessorOwner : successorOwner': 1,
    });
  }
}

/** Shorthand cannot retain a wire key while its implicit host value changes spelling. */
function protectWireProducer(source: ts.SourceFile, spans: ProtectedSpan[]): void {
  const declaration = requireDeclaration(source, 'buildConnectedSolverRequest', 'function');
  for (const receiver of ['fixed', 'occupancy']) {
    const calls: ts.CallExpression[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && node.expression.getText(source) === receiver + '.push')
        calls.push(node);
      ts.forEachChild(node, visit);
    };
    visit(declaration);
    const call = calls.at(0);
    const argument = call?.arguments.at(0);
    requireWitness(
      calls.length === 1 && argument !== undefined && ts.isObjectLiteralExpression(argument),
      source.fileName,
      'wire-producer-' + receiver,
    );
    const member = argument.properties.filter(
      (property) =>
        (ts.isShorthandPropertyAssignment(property) || ts.isPropertyAssignment(property)) &&
        property.name.getText(source) === 'projectId',
    );
    const property = member.at(0);
    // Proof: span-wire-shorthand-refusal bypassing the explicit shorthand refusal failed "refuses an ambiguous shorthand at a mixed wire producer rather than preserving its host value" (solver-protection.test.ts); restored GREEN. Named-diagnostic contract; a later typed read still threw.
    if (member.length !== 1 || property === undefined || !ts.isPropertyAssignment(property))
      throw new Error(
        'wire producer requires explicit property mapping: ' + source.fileName + ':' + receiver,
      );
    requireWitness(
      ['projectId', 'workPackageId'].includes(property.initializer.getText(source)),
      source.fileName,
      'wire-producer-value-' + receiver,
    );
    // Proof: span-wire-value protecting the host value beside its wire key failed "separates explicit connected producer wire keys from local package ownership values" (solver-protection.test.ts); restored GREEN.
    retainNodeSpan(source, property.name, 'solver-wire-producer-key', spans);
  }
  const common = readLocalDeclaration(source, declaration, 'common');
  requireWitness(
    common.initializer !== undefined && ts.isObjectLiteralExpression(common.initializer),
    source.fileName,
    'wire-producer-common',
  );
  const scope = readObjectProperty(source, common.initializer, 'scope');
  requireWitness(
    ts.isObjectLiteralExpression(scope.initializer),
    source.fileName,
    'wire-producer-scope',
  );
  for (const name of ['projectId', 'projects'])
    retainNodeSpan(
      source,
      readObjectProperty(source, scope.initializer, name).name,
      'solver-wire-scope-key',
      spans,
    );
  const projects = readObjectProperty(source, scope.initializer, 'projects');
  requireWitness(
    ts.isCallExpression(projects.initializer) &&
      ['stage.projects.map', 'stage.workPackages.map'].includes(
        projects.initializer.expression.getText(source),
      ),
    source.fileName,
    'wire-producer-project-map',
  );
  const mapping = projects.initializer.arguments.at(0);
  requireWitness(
    mapping !== undefined &&
      ts.isArrowFunction(mapping) &&
      ts.isParenthesizedExpression(mapping.body) &&
      ts.isObjectLiteralExpression(mapping.body.expression),
    source.fileName,
    'wire-producer-project-member',
  );
  const owner = readObjectProperty(source, mapping.body.expression, 'projectId');
  requireWitness(
    ['entry.projectId', 'entry.workPackageId'].includes(owner.initializer.getText(source)),
    source.fileName,
    'wire-producer-project-owner',
  );
  retainNodeSpan(source, owner.name, 'solver-wire-project-member', spans);
}

/** Exactly one local syntax declaration owns a reviewed producer mapping. */
function readLocalDeclaration(
  source: ts.SourceFile,
  within: ts.Node,
  name: string,
): ts.VariableDeclaration {
  const matches: ts.VariableDeclaration[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name)
      matches.push(node);
    ts.forEachChild(node, visit);
  };
  visit(within);
  const declaration = matches.at(0);
  requireWitness(
    matches.length === 1 && declaration !== undefined,
    source.fileName,
    'producer-declaration-' + name,
  );
  return declaration;
}

/** The typed grant evidence owns only its scopeId ternary's engagement parent read. */
function protectGrantAuditParent(source: ts.SourceFile, spans: ProtectedSpan[]): void {
  const owner = requireDeclaration(source, 'appendGrantAudit', 'function');
  requireWitness(
    ts.isFunctionDeclaration(owner) && owner.body !== undefined,
    source.fileName,
    'appendGrantAudit',
  );
  const evidence = owner.parameters.at(1);
  requireWitness(
    owner.parameters.length === 2 &&
      evidence !== undefined &&
      ts.isIdentifier(evidence.name) &&
      evidence.name.text === 'evidence' &&
      evidence.type !== undefined &&
      ts.isTypeLiteralNode(evidence.type),
    source.fileName,
    'appendGrantAudit-evidence',
  );
  const grants = evidence.type.members.filter(
    (member): member is ts.PropertySignature =>
      ts.isPropertySignature(member) &&
      ts.isIdentifier(member.name) &&
      member.name.text === 'grant',
  );
  const grant = grants.at(0);
  requireWitness(
    grants.length === 1 &&
      grant?.type !== undefined &&
      ts.isTypeReferenceNode(grant.type) &&
      ts.isIdentifier(grant.type.typeName) &&
      grant.type.typeName.text === 'AccessGrantRecord',
    source.fileName,
    'appendGrantAudit-grant-type',
  );
  const locals = owner.body.statements.flatMap((statement) =>
    ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : [],
  );
  const bindings = locals
    .flatMap<ts.BindingName>((local) => {
      if (ts.isIdentifier(local.name)) return [local.name];
      const names: ts.BindingName[] = [];
      for (const element of local.name.elements)
        if (ts.isBindingElement(element)) names.push(element.name);
      return names;
    })
    .filter((name) => ts.isIdentifier(name) && name.text === 'grant');
  const receivers = locals.filter(
    (local) =>
      ts.isObjectBindingPattern(local.name) &&
      local.initializer?.getText(source) === 'evidence' &&
      local.name.elements.some(
        (element) =>
          ts.isIdentifier(element.name) &&
          element.name.text === 'grant' &&
          element.propertyName === undefined &&
          element.dotDotDotToken === undefined,
      ),
  );
  requireWitness(
    bindings.length === 1 && receivers.length === 1,
    source.fileName,
    'appendGrantAudit-grant-binding',
  );
  const scope = readLocalDeclaration(source, owner, 'scopeId');
  const branch = scope.initializer;
  requireWitness(
    scope.parent.parent.parent === owner.body &&
      branch !== undefined &&
      ts.isConditionalExpression(branch) &&
      branch.condition.getText(source) === "grant.scope.kind === 'organization'" &&
      branch.whenTrue.getText(source) === 'grant.organizationId' &&
      ts.isConditionalExpression(branch.whenFalse) &&
      branch.whenFalse.condition.getText(source) === "grant.scope.kind === 'work_package'" &&
      branch.whenFalse.whenTrue.getText(source) === 'grant.scope.workPackageId' &&
      ts.isPropertyAccessExpression(branch.whenFalse.whenFalse) &&
      branch.whenFalse.whenFalse.expression.getText(source) === 'grant.scope' &&
      branch.whenFalse.whenFalse.name.text === 'projectId',
    source.fileName,
    'appendGrantAudit-scope-parent',
  );
  retainNodeSpan(source, branch.whenFalse.whenFalse.name, 'grant-audit-engagement-parent', spans);
}

/** The named initial-role catalogue comparison owns only its project-kind fallback literal. */
function protectInitialRoleKind(source: ts.SourceFile, spans: ProtectedSpan[]): void {
  const owner = requireDeclaration(source, 'readInitialRolePermissionsIn', 'function');
  requireWitness(
    ts.isFunctionDeclaration(owner) && owner.body !== undefined,
    source.fileName,
    'readInitialRolePermissionsIn',
  );
  const role = owner.parameters.at(1);
  requireWitness(
    role !== undefined &&
      ts.isIdentifier(role.name) &&
      role.name.text === 'roleId' &&
      role.type !== undefined &&
      ts.isTypeReferenceNode(role.type) &&
      ts.isIdentifier(role.type.typeName) &&
      role.type.typeName.text === 'InitialAccessRole',
    source.fileName,
    'readInitialRolePermissionsIn-role',
  );
  const kind = readLocalDeclaration(source, owner, 'kind');
  const branch = kind.initializer;
  requireWitness(
    kind.parent.parent.parent === owner.body &&
      branch !== undefined &&
      ts.isConditionalExpression(branch) &&
      branch.condition.getText(source) === "roleId === 'org-admin' || roleId === 'org-viewer'" &&
      ts.isStringLiteral(branch.whenTrue) &&
      branch.whenTrue.text === 'organization' &&
      ts.isStringLiteral(branch.whenFalse) &&
      branch.whenFalse.text === 'project',
    source.fileName,
    'readInitialRolePermissionsIn-kind',
  );
  retainNodeSpan(source, branch.whenFalse, 'initial-role-engagement-kind', spans);
}

/** Only listMembers' JSON members/effectiveRole/via/scopeKind owns this union token. */
function protectMemberScopeKind(source: ts.SourceFile, spans: ProtectedSpan[]): void {
  const owner = requireDeclaration(source, 'listMembers', 'variable');
  requireWitness(
    ts.isVariableDeclaration(owner) &&
      owner.initializer !== undefined &&
      ts.isCallExpression(owner.initializer) &&
      owner.initializer.expression.getText(source) === 'defineEndpointShape' &&
      owner.initializer.arguments.length === 1,
    source.fileName,
    'listMembers-endpoint',
  );
  const endpoint = owner.initializer.arguments.at(0);
  requireWitness(
    endpoint !== undefined && ts.isObjectLiteralExpression(endpoint),
    source.fileName,
    'listMembers-shape',
  );
  const responses = readObjectProperty(source, endpoint, 'responses').initializer;
  requireWitness(
    ts.isArrayLiteralExpression(responses) && responses.elements.length === 1,
    source.fileName,
    'listMembers-responses',
  );
  const response = responses.elements.at(0);
  requireWitness(
    response !== undefined && ts.isObjectLiteralExpression(response),
    source.fileName,
    'listMembers-response',
  );
  const schema = readObjectProperty(source, response, 'schema').initializer;
  requireWitness(
    ts.isCallExpression(schema) &&
      schema.expression.getText(source) === 'responseSchema' &&
      schema.arguments.length === 1,
    source.fileName,
    'listMembers-schema',
  );
  // Boundary: the parsed schema call above has exactly one argument.
  const payload = schema.arguments[0];
  const readTypeObject = (
    expression: ts.Expression,
    suffix: 'plain' | 'array' | 'or',
    name: string,
  ): ts.ObjectLiteralExpression => {
    let factory = expression;
    if (suffix !== 'plain') {
      requireWitness(
        ts.isCallExpression(factory) &&
          ts.isPropertyAccessExpression(factory.expression) &&
          factory.expression.name.text === suffix,
        source.fileName,
        name + '-wrapper',
      );
      const argument = factory.arguments.at(0);
      requireWitness(
        suffix === 'array'
          ? factory.arguments.length === 0
          : factory.arguments.length === 1 &&
              argument !== undefined &&
              ts.isStringLiteral(argument) &&
              argument.text === 'null',
        source.fileName,
        name + '-arguments',
      );
      factory = factory.expression.expression;
    }
    requireWitness(
      ts.isCallExpression(factory) &&
        factory.expression.getText(source) === 'type' &&
        factory.arguments.length === 1,
      source.fileName,
      name + '-type',
    );
    const object = factory.arguments.at(0);
    requireWitness(
      object !== undefined && ts.isObjectLiteralExpression(object),
      source.fileName,
      name + '-object',
    );
    return object;
  };
  const members = readObjectProperty(
    source,
    readTypeObject(payload, 'plain', 'listMembers-payload'),
    'members',
  );
  const role = readObjectProperty(
    source,
    readTypeObject(members.initializer, 'array', 'listMembers-members'),
    'effectiveRole',
  );
  const via = readObjectProperty(
    source,
    readTypeObject(role.initializer, 'or', 'listMembers-role'),
    'via',
  );
  const kind = readObjectProperty(
    source,
    readTypeObject(via.initializer, 'array', 'listMembers-via'),
    'scopeKind',
  ).initializer;
  requireWitness(
    ts.isStringLiteral(kind) && kind.text === "'organization' | 'project' | 'work_package'",
    source.fileName,
    'listMembers-scope-kind',
  );
  const token = kind.getText(source).indexOf("'project'");
  requireWitness(token >= 0, source.fileName, 'listMembers-scope-token');
  spans.push({
    start: kind.getStart(source) + token,
    end: kind.getStart(source) + token + 9,
    rule: 'member-response-engagement-kind',
  });
}
