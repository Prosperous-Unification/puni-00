import { BUILT_IN_ROLES, type BuiltInRoleId, isPermission, type Permission } from './access-role';

const ROLES_HEADING = '## Roles and the permissions they imply';

/** One built-in role's column of the matrix: the permissions its "yes" cells name. */
export interface PermissionMatrix {
  /** Every permission row of the table, in table order. */
  readonly permissions: readonly Permission[];
  readonly roles: ReadonlyMap<BuiltInRoleId, ReadonlySet<Permission>>;
}

const BUILT_IN_ROLE_IDS: ReadonlySet<string> = new Set(BUILT_IN_ROLES.map(({ id }) => id));

function isBuiltInRoleId(candidate: string): candidate is BuiltInRoleId {
  return BUILT_IN_ROLE_IDS.has(candidate);
}

function cellsOf(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|'))
    throw new Error(`permission matrix row is not a table row: ${line}`);
  return trimmed
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
}

/**
 * Reads the role table of `wbs-permissions/permission-matrix.md`, the source of
 * truth of the built-in seed (`wbs-custom-permissions` CP7): a "yes" cell is a
 * row, a blank cell is absent, and "shell only (P3)" is `organization.navigate`
 * reaching the project shell, never `project.read`. Published beside the
 * catalogue because both `@wbs/domain` and be-01's migration test hold their
 * seed to it, as `fast-golden-corpus` is published for the contracts' test.
 *
 * @throws when the table is missing, a column names no built-in role, a row
 * names no permission of the vocabulary, a row or a column repeats, or a cell
 * is anything but "yes", blank or "shell only (P3)": the seed is never read
 * by skipping what it does not recognise.
 */
export function parsePermissionMatrix(markdown: string): PermissionMatrix {
  const lines = markdown.split('\n');
  const heading = lines.indexOf(ROLES_HEADING);
  if (heading === -1) throw new Error(`permission matrix has no "${ROLES_HEADING}" section`);
  const start = lines.findIndex((line, index) => index > heading && line.startsWith('|'));
  if (start === -1) throw new Error('permission matrix role section has no table');
  const end = lines.findIndex((line, index) => index > start && !line.startsWith('|'));
  const table = lines.slice(start, end === -1 ? lines.length : end);
  const header = table.at(0);
  const rows = table.slice(2);
  if (header === undefined || rows.length === 0)
    throw new Error('permission matrix role table has no rows');
  const [first, ...roleCells] = cellsOf(header);
  if (first !== 'Permission') throw new Error(`permission matrix first column is ${first}`);
  const columns = roleCells.map((cell) => {
    if (!isBuiltInRoleId(cell)) throw new Error(`permission matrix names unknown role ${cell}`);
    return cell;
  });
  if (new Set(columns).size !== columns.length)
    throw new Error('permission matrix repeats a role column');
  const roles = new Map<BuiltInRoleId, Set<Permission>>(columns.map((role) => [role, new Set()]));
  const permissions: Permission[] = [];
  for (const row of rows) {
    const [label, ...cells] = cellsOf(row);
    // Proof: `continue` here instead of the throw failed `refuses an unknown
    // permission, an unknown role and an unknown cell rather than skip it` in
    // `access-role.test.ts`; watched 2026-10-25.
    const id = /^`([^`]+)`(?: \([^)]+\))?$/.exec(label)?.[1];
    if (id === undefined || !isPermission(id))
      throw new Error(`permission matrix names unknown permission ${label}`);
    if (permissions.includes(id)) throw new Error(`permission matrix repeats ${id}`);
    if (cells.length !== columns.length)
      throw new Error(`permission matrix row ${id} has ${String(cells.length)} cells`);
    permissions.push(id);
    cells.forEach((cell, index) => {
      const role = columns.at(index);
      const held = role === undefined ? undefined : roles.get(role);
      if (role === undefined || held === undefined)
        throw new Error(`permission matrix row ${id} overruns its header`);
      if (cell === 'yes') held.add(id);
      else if (cell !== '' && cell !== 'shell only (P3)')
        throw new Error(`permission matrix cell ${id} × ${role} reads "${cell}"`);
    });
  }
  return { permissions, roles };
}
