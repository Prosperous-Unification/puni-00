import { readFile } from 'node:fs/promises';

import {
  FRONTEND_LEVEL_TARGETS,
  LEVEL_TARGETS,
  type ProjectManifest,
  verifyDeclaredCollections,
} from './test-levels';

const args = process.argv.slice(2);
const overrides = new Map<string, ProjectManifest>();
let nodeManifestPath: string | undefined;
if (args.length > 0) {
  // Proof: disabling this guard made the one-argument CLI fault miss its
  // named usage refusal.
  if (args.length === 2 && args[0] === '--node-manifest') {
    nodeManifestPath = args[1];
  } else {
    if (args.length !== 3 || args[0] !== '--manifest')
      throw new Error(
        'usage: verify-test-levels-cli.ts [--manifest <project-root> <json-path> | --node-manifest <json-path>]',
      );
    const root = args[1];
    const path = args[2];
    const project = [...LEVEL_TARGETS, ...FRONTEND_LEVEL_TARGETS].find(
      (target) => target.root === root,
    )?.project;
    // Proof: removing this guard made --manifest wrong/root pass the named
    // production CLI audit negative without inspecting the supplied manifest.
    if (project === undefined) throw new Error(`unknown manifest override project ${root}`);
    const source: unknown = JSON.parse(await readFile(path, 'utf8'));
    // Proof: disabling this guard made an empty JSON object report an identity
    // mismatch instead of the named malformed-manifest refusal.
    if (
      typeof source !== 'object' ||
      source === null ||
      !('name' in source) ||
      typeof source.name !== 'string' ||
      !('targets' in source) ||
      typeof source.targets !== 'object' ||
      source.targets === null
    )
      throw new Error(`${path} is not a project manifest`);
    // Proof: removing this guard made a wbs-store-memory override named
    // wrong-project miss the named production CLI identity refusal.
    if (source.name !== project)
      throw new Error(`manifest identity ${source.name} differs from ${project}`);
    // Nx owns the nested project schema; the CLI checks the root fields before
    // passing the same manifest shape used by the workspace reader.
    overrides.set(root, source as ProjectManifest);
  }
}
await verifyDeclaredCollections(overrides, nodeManifestPath);
process.stdout.write('Verified declared test collections\n');
