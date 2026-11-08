import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'bun:test';

import {
  CONNECTED_SOLVER_REQUEST_KEYS,
  CONNECTED_SOLVER_RESPONSE_STATUSES,
  CONNECTED_SOLVER_SCOPE_KEYS,
  SOLVER_BOUNDARY_KEYS,
  SOLVER_EDGE_KEYS,
  SOLVER_HORIZON_UNITS_MAX,
  SOLVER_OBJECTIVE_TERM_KEYS,
  SOLVER_OBJECTIVE_TERMS,
  SOLVER_OBJECTIVES,
  SOLVER_RELATIONSHIP_TYPES,
  SOLVER_REQUEST_KEYS,
  SOLVER_RESPONSE_KEYS,
  SOLVER_RESPONSE_STATUSES,
  SOLVER_SLICE_KEYS,
  SOLVER_STAGE_COUNT,
  SOLVER_STAGE_STATUSES,
  SOLVER_WIRE_VERSION,
} from './wire-types';

/**
 * The drift guard for `wire-types.ts`.
 *
 * `solver-wire.v5.json` is the contract and Python reads the same file, so the
 * TypeScript binding is not allowed to be an independent second opinion. Each
 * case below reads the schema **at run time** — not through an `import`, which
 * TypeScript would resolve at build time and which would put the file inside
 * the emitted declarations — and pins one vocabulary to its branch.
 *
 * Vocabularies are compared as SORTED SETS with an explicit length check.
 * Neither a JSON Schema `enum` nor an object's property order carries meaning,
 * so an ordered comparison would fail on a reformat while catching nothing a
 * set comparison misses; the length check is what keeps "set" from silently
 * tolerating a duplicate.
 */

const SCHEMA_PATH = new URL('../solver-wire.v5.json', import.meta.url);

type Branch = Record<string, unknown>;

interface WireSchema {
  // Deliberately `| undefined`: a name this file asks for and the schema does
  // not carry must throw by name, not read as an empty object.
  readonly $defs: Record<string, Branch | undefined>;
}

const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as WireSchema;

const def = (name: string): Branch => {
  const branch = schema.$defs[name];
  if (branch === undefined) throw new Error(`solver-wire.v5.json has no $defs/${name}`);
  return branch;
};

const properties = (name: string): Branch => def(name)['properties'] as Branch;

const enumOf = (name: string, property: string): readonly string[] => {
  const prop = properties(name)[property] as { enum?: readonly string[] } | undefined;
  if (prop?.enum === undefined) {
    throw new Error(`solver-wire.v5.json $defs/${name}.properties.${property} has no enum`);
  }
  return prop.enum;
};

const sorted = (values: readonly string[]): string[] => [...values].sort();

describe('wire-types is pinned to solver-wire.v5.json', () => {
  it('SOLVER_WIRE_VERSION is the schema const', () => {
    expect(def('wireVersion')['const']).toBe(SOLVER_WIRE_VERSION);
  });

  it('SOLVER_RESPONSE_STATUSES is the response status enum', () => {
    const wire = enumOf('response-local', 'status');
    expect(wire.length).toBe(SOLVER_RESPONSE_STATUSES.length);
    expect(sorted(wire)).toEqual(sorted(SOLVER_RESPONSE_STATUSES));
  });

  it('SOLVER_STAGE_STATUSES is the objective-term status enum, and a different set', () => {
    const wire = enumOf('objective-term', 'status');
    expect(wire.length).toBe(SOLVER_STAGE_STATUSES.length);
    expect(sorted(wire)).toEqual(sorted(SOLVER_STAGE_STATUSES));
    // The two vocabularies answer different questions and must not collapse
    // into one another: `optimal` is a stage's proof strength and is never a
    // run outcome, `infeasible` is a run outcome and is never a stage status.
    expect(sorted(SOLVER_STAGE_STATUSES)).not.toEqual(sorted(SOLVER_RESPONSE_STATUSES));
  });

  it('SOLVER_OBJECTIVE_TERMS is the objectiveValues key set, and every term is required', () => {
    const wire = Object.keys(properties('objectiveValues'));
    expect(wire.length).toBe(SOLVER_OBJECTIVE_TERMS.length);
    expect(sorted(wire)).toEqual(sorted(SOLVER_OBJECTIVE_TERMS));
    expect(sorted(def('objectiveValues')['required'] as string[])).toEqual(
      sorted(SOLVER_OBJECTIVE_TERMS),
    );
  });

  it('SOLVER_RESPONSE_KEYS is the closed response property set', () => {
    // `additionalProperties: false` is what makes this set closed; without it
    // the constant would describe a subset and the unknown-key rejection 2.3
    // is written against would have nothing to reject.
    expect(def('response-local')['additionalProperties']).toBe(false);
    const wire = Object.keys(properties('response-local'));
    expect(wire.length).toBe(SOLVER_RESPONSE_KEYS.length);
    expect(sorted(wire)).toEqual(sorted(SOLVER_RESPONSE_KEYS));
  });

  it('SOLVER_OBJECTIVE_TERM_KEYS is the objective-term required set', () => {
    expect(def('objective-term')['additionalProperties']).toBe(false);
    const wire = def('objective-term')['required'] as string[];
    expect(wire.length).toBe(SOLVER_OBJECTIVE_TERM_KEYS.length);
    expect(sorted(wire)).toEqual(sorted(SOLVER_OBJECTIVE_TERM_KEYS));
    // Required and admitted are the same set here — every member is mandatory,
    // two of them nullable. A member that became optional would change the
    // interface, not just this list.
    expect(sorted(Object.keys(properties('objective-term')))).toEqual(
      sorted(SOLVER_OBJECTIVE_TERM_KEYS),
    );
  });

  it('only feasible carries offsets and objectiveValues', () => {
    // The discriminated union in wire-types.ts encodes the schema's `allOf`
    // conditional. This pins the branch it was read off, so opening the
    // conditional in the schema fails here rather than silently making the
    // union stricter than the wire.
    const allOf = def('response-local')['allOf'] as readonly Branch[];
    const conditional = allOf.at(0);
    if (conditional === undefined) throw new Error('$defs/response has no allOf conditional');

    const when = conditional['if'] as {
      properties: Record<string, { const: unknown } | undefined>;
    };
    expect(when.properties['status']?.const).toBe('feasible');

    const then = conditional['then'] as { required: readonly string[] };
    expect(sorted(then.required)).toEqual(['objectiveValues', 'offsets']);
  });
});

describe('the request side is pinned to solver-wire.v5.json', () => {
  it('the connected request and scope arms require every provenance and witness member', () => {
    // Proof: removing `occupancy` from the normative connected scope's required
    // list made this drift guard fail (16 pass / 1 fail).
    for (const [branch, keys] of [
      ['request-connected', CONNECTED_SOLVER_REQUEST_KEYS],
      ['scope-connected', CONNECTED_SOLVER_SCOPE_KEYS],
    ] as const) {
      expect(def(branch)['additionalProperties']).toBe(false);
      expect(sorted(Object.keys(properties(branch)))).toEqual(sorted(keys));
      expect(sorted(def(branch)['required'] as string[])).toEqual(sorted(keys));
    }
  });

  it('a boundary requires exactly its directional signed start bound', () => {
    expect(def('boundary')['additionalProperties']).toBe(false);
    expect(sorted(Object.keys(properties('boundary')))).toEqual(sorted(SOLVER_BOUNDARY_KEYS));
    const clause = (def('boundary')['allOf'] as readonly Branch[])[0];
    expect((clause['then'] as Branch)['required']).toEqual(['minimumStartUnits']);
    expect((clause['then'] as Branch)['not']).toEqual({ required: ['maximumStartUnits'] });
    expect((clause['else'] as Branch)['required']).toEqual(['maximumStartUnits']);
    expect((clause['else'] as Branch)['not']).toEqual({ required: ['minimumStartUnits'] });
  });

  it('the connected response admits boundary-infeasible and remains a closed scoped arm', () => {
    expect(sorted(enumOf('response-connected', 'status'))).toEqual(
      sorted(CONNECTED_SOLVER_RESPONSE_STATUSES),
    );
    expect(def('response-connected')['additionalProperties']).toBe(false);
    expect(sorted(Object.keys(properties('response-connected')))).toEqual(
      sorted(SOLVER_RESPONSE_KEYS),
    );
    expect(sorted(def('response-connected')['required'] as string[])).toEqual([
      'scope',
      'status',
      'wireVersion',
    ]);
  });
  it('SOLVER_OBJECTIVES is the objective enum', () => {
    const wire = enumOf('request-local', 'objective');
    expect(wire.length).toBe(SOLVER_OBJECTIVES.length);
    expect(sorted(wire)).toEqual(sorted(SOLVER_OBJECTIVES));
  });

  // Each of the three closed branches gets the same pair of assertions:
  // `additionalProperties: false` is what makes the key list a closed set
  // rather than a subset, and `required` covering the whole property set is
  // what makes the TypeScript interface's lack of optional members correct.
  for (const [branch, keys] of [
    ['request-local', SOLVER_REQUEST_KEYS],
    ['slice', SOLVER_SLICE_KEYS],
  ] as const) {
    it(`${branch} is closed, fully required, and matches its key constant`, () => {
      expect(def(branch)['additionalProperties']).toBe(false);
      const wire = Object.keys(properties(branch));
      expect(wire.length).toBe(keys.length);
      expect(sorted(wire)).toEqual(sorted(keys));
      expect(sorted(def(branch)['required'] as string[])).toEqual(sorted(keys));
    });
  }

  it('edge type and conditional FF weight match the binding', () => {
    const edge = def('edge');
    expect(edge['additionalProperties']).toBe(false);
    expect(sorted(edge['required'] as string[])).toEqual(sorted(SOLVER_EDGE_KEYS));
    expect(sorted(Object.keys(properties('edge')))).toEqual(
      [...SOLVER_EDGE_KEYS, 'startWeightUnits'].sort(),
    );
    expect(sorted(enumOf('edge', 'type'))).toEqual(sorted(SOLVER_RELATIONSHIP_TYPES));
    const conditional = (edge['allOf'] as readonly Branch[])[0];
    expect((conditional['then'] as Branch)['required']).toEqual(['startWeightUnits']);
    expect((conditional['else'] as Branch)['not']).toEqual({ required: ['startWeightUnits'] });
  });

  it('SOLVER_HORIZON_UNITS_MAX is the schema bound checked before spawn', () => {
    const horizon = properties('request-local')['horizonUnits'] as { maximum: number };
    expect(horizon.maximum).toBe(SOLVER_HORIZON_UNITS_MAX);
    // Narrower than safeInteger on purpose: it is a CP-SAT variable domain.
    expect(horizon.maximum).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });

  it('the stage budget split is a fixed-length tuple, not a list', () => {
    const split = properties('request-local')['stageBudgetSplit'] as {
      minItems: number;
      maxItems: number;
    };
    expect(split.minItems).toBe(SOLVER_STAGE_COUNT);
    expect(split.maxItems).toBe(SOLVER_STAGE_COUNT);
  });

  it('a slice width and a pool capacity both floor at 1', () => {
    // Both are the same boundary stated twice: duration is effort divided by
    // width, and a pool of 0 slots is a plan of Infinity dates.
    expect((properties('slice')['width'] as { minimum: number }).minimum).toBe(1);
    const pools = properties('request-local')['pools'] as {
      additionalProperties: { minimum: number };
    };
    expect(pools.additionalProperties.minimum).toBe(1);
  });
});
