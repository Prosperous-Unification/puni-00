/** An observation belongs only to the exact backend image that executed its own CLI. */
export interface ReplayCapabilities {
  image: string;
  capabilities: readonly string[];
}

/** Executes argv inside the specified immutable image; transport failures must throw. */
export type ReplayImageRunner = (
  image: string,
  command: readonly string[],
) => Promise<{ code: number; stdout: string; stderr: string }>;

/**
 * Reads the image vocabulary. Only a genuinely absent CLI in a readable/searchable source
 * directory is a prior image. Bad paths and failed execution refuse observation.
 */
export function buildReplayCapabilitiesCommand(): readonly string[] {
  // Proof: removing path/source permission checks or replacing CLI execution with [] failed
  // `refuses absent source, unreadable source/CLI, dangling and nonregular CLI...`.
  const cli = 'src/step-blockage-replay-kinds-cli.ts';
  return [
    'sh',
    '-c',
    `if ! test -d src || ! test -r src || ! test -x src; then exit 74; elif test -f ${cli}; then bun run ${cli}; elif test -e ${cli} || test -L ${cli}; then exit 73; else printf '[]\\n'; fi`,
  ];
}

/** Observe each image independently; no coordinator vocabulary substitutes for image code. */
export async function observeReplayCapabilities(
  image: string,
  run: ReplayImageRunner,
): Promise<ReplayCapabilities> {
  // Proof: removing digest validation failed `executes each pinned image own CLI...`.
  if (!/^[^\s@]+@sha256:[0-9a-f]{64}$/.test(image)) {
    throw new Error('replay capability image must be pinned to an exact SHA-256 digest');
  }
  const observation = await run(image, buildReplayCapabilitiesCommand());
  // Proof: ignoring exit status admitted a CLI printing [] then exiting 1 in the refusal fixture.
  if (observation.code !== 0)
    throw new Error(
      `image replay capability command failed (${String(observation.code)}): ${observation.stderr}`,
    );
  const capabilities: unknown = JSON.parse(observation.stdout);
  // Proof: removing shape validation admitted object/numeric/duplicate output in the refusal fixture.
  if (
    !Array.isArray(capabilities) ||
    capabilities.some((kind: unknown) => typeof kind !== 'string' || kind.length === 0) ||
    new Set(capabilities).size !== capabilities.length
  ) {
    throw new Error('image replay capability output is malformed');
  }
  return { image, capabilities };
}

/**
 * Coordinator-owned read-only SQLite traversal, independent of image application code and
 * live blockage facts. Requires DB_PATH and an existing readable command journal. Commands
 * count replacements individually and guarded moves once per row across both directions.
 * The caller must run this against the fenced database before making compatibility decisions.
 */
export function buildReplayInventoryCommand(): readonly string[] {
  return [
    'bun',
    '-e',
    `import { Database } from 'bun:sqlite';
const path=process.env.DB_PATH;
// Proof: returning [] for absent DB_PATH failed trusted-database refusal fixture.
if (!path) throw new Error('DB_PATH must be set');
// Proof: absent file and chmod 000 on the fixture database both refused in the trusted-state test.
const db=new Database(path,{readonly:true,create:false});
try {
  const exists=db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='command_journal'").get();
  // Proof: treating a missing journal as empty failed the trusted-database refusal fixture.
  if (exists===null) throw new Error('command journal table is missing');
  let count=0;
  let moves=0;
  let hasGuardedMove=false;
  const legacy=new Set('patch set_estimate clear_estimate set_actual clear_actual set_measure clear_measure set_progress clear_progress assign restore_attempt remove_attempt add_dependency remove_dependency add_typed_dependency remove_typed_dependency update_typed_dependency move set_frozen set_step_allowance set_positions delete_subtree restore_subtree'.split(' '));
  function visit(command) {
    // Proof: removing command shape validation lost the named diagnostic for null/numeric-do fixtures.
    if (typeof command!=='object'||command===null||Array.isArray(command)||typeof command.do!=='string') throw new Error('journal command is malformed');
    // Proof: skipping replacement counts failed both-direction replacement fixture.
    if (command.do==='replace_blockage') { count++; return; }
    // Proof: removing this marker failed the nested forward/inverse inventory fixtures.
    if (command.do==='move'&&Object.hasOwn(command,'expectedProgress')) hasGuardedMove=true;
    if (command.do==='batch') {
      // Proof: removing batch validation lost the named diagnostic for object-valued steps.
      if (!Array.isArray(command.steps)) throw new Error('journal batch is malformed');
      for (const step of command.steps) visit(step);
      return;
    }
    // Proof: ignoring unknown kinds admitted future commands in the trusted-database refusal fixture.
    if (!legacy.has(command.do)) throw new Error('journal command kind is unknown');
  }
  for (const row of db.query('SELECT payload,inverse,preconditions FROM command_journal').all()) {
    const payload=JSON.parse(row.payload);
    // Proof: removing payload validation lost the named diagnostic for null/missing-forward fixtures.
    if (typeof payload!=='object'||payload===null||Array.isArray(payload)||!Object.hasOwn(payload,'forward')) throw new Error('journal payload is malformed');
    const preconditions=JSON.parse(row.preconditions);
    // Proof: bypassing this boundary admitted arrays/strings in the trusted-database refusal fixture.
    if (typeof preconditions!=='object'||preconditions===null||Array.isArray(preconditions)) throw new Error('journal preconditions are malformed');
    // Proof: removing this marker failed precondition/empty-map fixtures; retaining it across rows
    // failed their added plain-row controls.
    hasGuardedMove=Object.hasOwn(preconditions,'moveProgress');
    // Proof: omitting either direction failed its nested marker fixture.
    visit(payload.forward);
    visit(JSON.parse(row.inverse));
    if (hasGuardedMove) moves++;
  }
  console.log(JSON.stringify([...(count===0?[]:[{kind:'replace_blockage',count}]),...(moves===0?[]:[{kind:'move_progress_v1',count:moves}])]));
} finally {db.close();}`,
  ];
}
