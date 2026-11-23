import { isArray, type Json, type JsonObject, readField, requireObject } from './configuration';
import type { Consumer } from './model';

/** A captured service execution field; image/mount/merge interpretation remains unresolved. */
export interface ComposeSite {
  readonly path: readonly (string | number)[];
  readonly kind: 'command' | 'reference';
  readonly body: Exclude<Consumer['body'], { readonly kind: 'file' }>;
  readonly invocation: Consumer['invocation'];
}

/** Retains override inheritance and exact argv; rejects malformed external command shapes once. */
function readCommand(value: Json, path: readonly (string | number)[], source: string): ComposeSite {
  const body: ComposeSite['body'] = {
    kind: 'command',
    text: typeof value === 'string' ? value : JSON.stringify(value),
  };
  if (value === null || typeof value === 'string')
    return {
      path,
      kind: 'command',
      body,
      invocation: {
        kind: 'unresolved',
        reason:
          value === null
            ? 'container command inherits its image'
            : 'container command string requires Compose parsing',
      },
    };
  const diagnostic =
    'Compose command must be null, a string or an array of strings: ' +
    source +
    ' ' +
    JSON.stringify(path);
  // Proof: scalar omission loses the explicit malformed-command diagnostic; the map call still throws (compose-inventory-fault-scalar-v1).
  if (!isArray(value)) throw new Error(diagnostic);
  const argv = value.map((word) => {
    // Proof: word omission admits a numeric argv operand; the required rejection fails (compose-inventory-fault-word-v1).
    if (typeof word !== 'string') throw new Error(diagnostic);
    return word;
  });
  return { path, kind: 'command', body, invocation: { kind: 'argv', argv } };
}

/**
 * Captures service command/entrypoint overrides and lifecycle hook bodies without evaluating
 * interpolation or looking up container operands in the host workspace. Null, empty vectors and
 * empty strings retain distinct bodies. The whole configuration accompanies every site upstream;
 * root and service references keep inherited/unknown execution explicit, including include-only files.
 * @throws On malformed service/hook structure or a command other than null/string/string-vector.
 */
export function readComposeSites(
  configuration: JsonObject,
  source: string,
): readonly ComposeSite[] {
  // Proof: root-reference omission hides the include-only execution graph (compose-inventory-fault-root-reference-v1).
  const sites: ComposeSite[] = [
    {
      path: [],
      kind: 'reference',
      body: { kind: 'reference', text: 'Compose execution graph' },
      invocation: {
        kind: 'unresolved',
        reason: 'container image, includes and mounts require qualification',
      },
    },
  ];
  const services = readField(configuration, 'services');
  if (services === undefined) return sites;
  // Proof: services-object omission accepts an array as an empty service graph; service-object omission accepts an array service (compose-inventory-fault-services-object/service-object-v1).
  for (const [name, raw] of Object.entries(requireObject(services, source + ' Compose services'))) {
    const service = requireObject(raw, source + ' Compose service ' + name),
      path = ['services', name];
    // Proof: inheritance omission removes the actual image-only service reference (compose-inventory-fault-inheritance-v1).
    sites.push({
      path,
      kind: 'reference',
      body: { kind: 'reference', text: 'Compose service startup' },
      invocation: {
        kind: 'unresolved',
        reason: 'container image startup and overrides require qualification',
      },
    });
    // Proof: commands omission hides the current startup body; null-field's falsy filter hides an explicit inherited override (compose-inventory-fault-commands/null-field-v1).
    for (const key of ['command', 'entrypoint']) {
      const value = readField(service, key);
      if (value !== undefined) sites.push(readCommand(value, [...path, key], source));
    }
    // Proof: hooks omission hides the actual post_start argv (compose-inventory-fault-hooks-v1).
    for (const key of ['post_start', 'pre_stop']) {
      const hooks = readField(service, key);
      if (hooks === undefined) continue;
      // Proof: hook-array omission loses the contextual diagnostic; forEach still throws (compose-inventory-fault-hook-array-v1).
      if (!isArray(hooks)) throw new Error('Compose hooks must be an array: ' + source + ' ' + key);
      hooks.forEach((raw, index) => {
        // Proof: hook-object omission loses the object-boundary diagnostic; required-command rejection remains (compose-inventory-fault-hook-object-v1).
        const hook = requireObject(raw, source + ' Compose hook ' + key),
          command = readField(hook, 'command');
        // Proof: hook-missing loses its contextual diagnostic; hook-null admits invalid image inheritance and fails the required rejection (compose-inventory-fault-hook-missing/hook-null-v1).
        if (command === undefined || command === null)
          throw new Error('Compose hook command is absent: ' + source + ' ' + key);
        sites.push(readCommand(command, [...path, key, index, 'command'], source));
      });
    }
  }
  return sites;
}
