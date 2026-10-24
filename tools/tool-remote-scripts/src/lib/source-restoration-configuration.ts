import { envLayout } from './env';
import type { SourceConfigSlot } from './source-startup-manifest';

export interface SourceRestorationConfiguration {
  readonly ports: Readonly<Record<SourceConfigSlot, number>>;
  readonly gatewayBackend: string;
  readonly mcpBackend: string;
  readonly frontendBackend: string;
  readonly frontendGateway: string;
}
const SELECTED = new Set([
  'PORT',
  'BE_URL',
  'WBS_API_URL',
  'VITE_BE_URL',
  'VITE_GW_URL',
  'MIGRATE_ON_STARTUP',
]);
function literal(encoded: string): string {
  let value = encoded;
  if (value.startsWith('"') || value.startsWith("'")) {
    if (value.at(-1) !== value[0] || value.length < 2)
      throw new Error('source role literal is unterminated');
    value = value.slice(1, -1);
  }
  if (/[\s\\$`'"\0]/.test(value)) throw new Error('source role literal is dynamic or ambiguous');
  return value;
}
/** Reads only the fixed route/port controls, never evaluating dotenv or exposing private credentials. Bun's inherited environment takes precedence; Vite's inherited VITE controls take the same precedence. */
export function decodeSourceRestorationConfiguration(
  files: Readonly<Record<SourceConfigSlot, string>>,
  inherited: readonly string[],
): SourceRestorationConfiguration {
  try {
    if (inherited.length > 4096) throw new Error('source environment exceeds bound');
    const environment = new Map<string, string>();
    for (const assignment of inherited) {
      if (Buffer.byteLength(assignment) > 65536) throw new Error('source assignment exceeds bound');
      const split = assignment.indexOf('=');
      const name = assignment.slice(0, split);
      if (split < 1 || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || environment.has(name))
        throw new Error('source inherited environment ambiguous');
      environment.set(name, assignment.slice(split + 1));
    }
    function read(slot: SourceConfigSlot) {
      const contents = files[slot];
      if (Buffer.byteLength(contents) > 1024 * 1024 || contents.includes('\0'))
        throw new Error('source role file exceeds bound');
      const names = new Set<string>();
      const values = new Map<string, string>();
      for (const line of contents.split(/\r?\n/)) {
        if (/^\s*(?:#.*)?$/.test(line)) continue;
        const assignment = /^(?:export )?([A-Za-z_][A-Za-z0-9_]*)=([^\r\n]*)$/.exec(line);
        const name = assignment?.at(1);
        const encoded = assignment?.at(2);
        if (name === undefined || encoded === undefined || names.has(name))
          throw new Error('source role configuration ambiguous');
        names.add(name);
        if (SELECTED.has(name)) values.set(name, literal(encoded));
      }
      for (const name of SELECTED) {
        const value = environment.get(name);
        if (value !== undefined) {
          // Proof: unquoting actual inherited text admitted the quoted inherited BE_URL negative; it failed with Missing expected exception.
          if (/[\s\\$`'"\0]/.test(value))
            throw new Error('source inherited role value is not literal');
          values.set(name, value);
        }
      }
      return values;
    }
    const backend = read('backend');
    const gateway = read('gateway');
    const mcp = read('mcp');
    const frontend = read('frontend');
    // MCP and Vite have explicit pinned application defaults; BE/GW require PORT in their actual schemas.
    if (
      backend.get('PORT') !== '3100' ||
      gateway.get('PORT') !== '3200' ||
      (mcp.has('PORT') && mcp.get('PORT') !== '3300') ||
      (frontend.has('PORT') && frontend.get('PORT') !== '4200') ||
      backend.get('MIGRATE_ON_STARTUP') !== 'false'
    )
      throw new Error('source fixed port or migration control differs');
    const backendOrigins = ['http://localhost:3100', 'http://127.0.0.1:3100'];
    const gatewayOrigins = ['http://localhost:3200', 'http://127.0.0.1:3200'];
    const gatewayBackend = gateway.get('BE_URL');
    const mcpBackend = mcp.get('WBS_API_URL');
    const frontendBackend = frontend.get('VITE_BE_URL');
    const frontendGateway = frontend.get('VITE_GW_URL');
    // Proof: omitting the gateway target guard reached the actual SQLite activation shell with a pinned prod target; source preflight test failed Expected 0 calls / Received 1.
    if (
      gatewayBackend === undefined ||
      !backendOrigins.includes(gatewayBackend) ||
      mcpBackend === undefined ||
      ![...backendOrigins, `https://${envLayout('dev').siteAddress}`].includes(mcpBackend) ||
      frontendBackend === undefined ||
      !backendOrigins.includes(frontendBackend) ||
      frontendGateway === undefined ||
      !gatewayOrigins.includes(frontendGateway)
    )
      throw new Error('source role targets a different deployment');
    return Object.freeze({
      ports: Object.freeze({ backend: 3100, gateway: 3200, mcp: 3300, frontend: 4200 }),
      gatewayBackend,
      mcpBackend,
      frontendBackend,
      frontendGateway,
    });
  } catch {
    throw new Error('source restoration configuration refused');
  }
}
