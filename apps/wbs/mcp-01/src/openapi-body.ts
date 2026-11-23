type Composition = 'anyOf' | 'oneOf' | 'allOf';

interface BodyNode {
  readonly source: Readonly<Record<string, unknown>>;
  readonly properties: Readonly<Record<string, unknown>>;
  readonly required: readonly string[];
  readonly branches: Readonly<Record<Composition, readonly BodyNode[]>>;
  readonly isObject: boolean;
}

export interface BodyInputs {
  readonly properties: ReadonlyMap<string, unknown>;
  readonly required: readonly string[];
  readonly constraints: Readonly<Record<string, unknown>>;
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readObject(value: unknown, where: string): Readonly<Record<string, unknown>> {
  if (!isObject(value)) throw new Error(`${where} has a non-object body schema fragment.`);
  return value;
}

function readRequired(value: unknown, where: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`${where} has malformed body required names.`);
  const names: string[] = [];
  for (const name of value) {
    if (typeof name !== 'string') throw new Error(`${where} has malformed body required names.`);
    names.push(name);
  }
  return names;
}

function readNode(value: unknown, where: string): BodyNode {
  const source = readObject(value, where);
  const properties = Object.hasOwn(source, 'properties')
    ? readObject(source['properties'], where)
    : {};
  const required = Object.hasOwn(source, 'required') ? readRequired(source['required'], where) : [];
  const branches: Record<Composition, readonly BodyNode[]> = { anyOf: [], oneOf: [], allOf: [] };
  for (const keyword of ['anyOf', 'oneOf', 'allOf'] as const) {
    if (!Object.hasOwn(source, keyword)) continue;
    const supplied = source[keyword];
    if (!Array.isArray(supplied))
      throw new Error(`${where} has malformed ${keyword} body alternatives.`);
    if (supplied.length === 0) throw new Error(`${where} has empty ${keyword} body alternatives.`);
    branches[keyword] = supplied.map((branch: unknown) => readNode(branch, where));
  }
  const isObject =
    source['type'] === 'object' ||
    (!Object.hasOwn(source, 'type') &&
      ((branches.anyOf.length > 0 && branches.anyOf.every((branch) => branch.isObject)) ||
        (branches.oneOf.length > 0 && branches.oneOf.every((branch) => branch.isObject)) ||
        branches.allOf.some((branch) => branch.isObject)));
  return { source, properties, required, branches, isObject };
}

function mergeProperties(node: BodyNode): Map<string, unknown> {
  const properties = new Map<string, unknown>();
  for (const branches of Object.values(node.branches)) {
    for (const branch of branches) {
      for (const [name, schema] of mergeProperties(branch)) {
        if (!properties.has(name)) properties.set(name, schema);
        else {
          const previous = properties.get(name);
          if (JSON.stringify(previous) !== JSON.stringify(schema))
            properties.set(name, { anyOf: [previous, schema] });
        }
      }
    }
  }
  // Root property constraints always apply, even when alternatives mention the same name.
  for (const [name, schema] of Object.entries(node.properties)) properties.set(name, schema);
  return properties;
}

function checkRequired(
  node: BodyNode,
  properties: ReadonlyMap<string, unknown>,
  where: string,
): void {
  for (const name of node.required)
    if (!properties.has(name))
      throw new Error(
        `${where} lists "${name}" as required in its body but does not declare it as a body property.`,
      );
  for (const branches of Object.values(node.branches))
    for (const branch of branches) checkRequired(branch, properties, where);
}

const INPUT_FIELDS = new Set([
  '$schema',
  'type',
  'properties',
  'required',
  'additionalProperties',
  'title',
  'description',
  '$comment',
  'examples',
  'default',
  'deprecated',
  'readOnly',
  'writeOnly',
]);

/**
 * Read positive object alternatives from an already-parsed OpenAPI request body.
 * Negative schemas never grant input names. Root validation constraints remain verbatim;
 * branch constraints remain inside their original composition. Root property constraints
 * override the descriptive union of branch properties. No HTTP validator is imported.
 * @throws for malformed fragments, non-object request bodies or undeclared required names.
 */
export function readBodyInputs(value: unknown, where: string): BodyInputs {
  if (value === undefined)
    throw new Error(
      `${where} carries a request body with no application/json object schema, so its inputs cannot be derived.`,
    );
  const node = readNode(value, where);
  if (!node.isObject)
    throw new Error(
      `${where} carries a request body with no application/json object schema, so its inputs cannot be derived.`,
    );
  const properties = mergeProperties(node);
  for (const branches of Object.values(node.branches))
    for (const branch of branches) checkRequired(branch, properties, where);
  const constraints = Object.fromEntries(
    Object.entries(node.source).filter(([name]) => !INPUT_FIELDS.has(name)),
  );
  return { properties, required: node.required, constraints };
}
