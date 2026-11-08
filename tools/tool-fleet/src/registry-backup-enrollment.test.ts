import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

test('ordinary production enrollment preserves existing effect state and refuses every established absence', async () => {
  const directory = await scratchAsync('backup-effects-enrollment-');
  const script = `import ast, json, os, pathlib, stat, sys, shutil
source = pathlib.Path(sys.argv[1]).read_text().split("<<'PY'", 1)[1].rsplit('\\nPY', 1)[0]
module = ast.parse(source)
functions = [node for node in module.body if isinstance(node, ast.FunctionDef) and node.name in ('require', 'ensure_backup_effects')]
assert len(functions) == 2, 'Missing production backup enrollment function'
exec(compile(ast.Module(body=functions, type_ignores=[]), sys.argv[1], 'exec'))
mount = pathlib.Path(sys.argv[2])
owner = os.getuid()
assert ensure_backup_effects(mount, owner, True) is True
state = mount / 'backup-effects' / 'state.json'
original = state.read_bytes()
state.write_text(original.decode().replace('"generation": 0', '"generation": 1'))
changed = state.read_bytes()
assert ensure_backup_effects(mount, owner, False) is False
assert state.read_bytes() == changed
for fault in ('state', 'lock', 'directory', 'mode', 'symlink', 'hardlink', 'corrupt', 'pending', 'public-directory', 'directory-symlink', 'oversized'):
    folder = mount / 'backup-effects'
    saved = mount / 'saved'
    shutil.copytree(folder, saved)
    if fault == 'state': state.unlink()
    if fault == 'lock': (folder / 'state.lock').unlink()
    if fault == 'directory': shutil.rmtree(folder)
    if fault == 'mode': state.chmod(0o000)
    if fault == 'symlink': state.rename(mount / 'alias'); state.symlink_to(mount / 'alias')
    if fault == 'hardlink': os.link(state, mount / 'alias')
    if fault == 'corrupt': state.write_text('{')
    if fault == 'pending': (folder / 'state.pending').write_text('{}')
    if fault == 'public-directory': folder.chmod(0o755)
    if fault == 'directory-symlink': folder.rename(mount / 'alias'); folder.symlink_to(mount / 'alias')
    if fault == 'oversized': state.write_bytes(changed + b' ' * (1024**2))
    try: ensure_backup_effects(mount, owner, False)
    except (RuntimeError, OSError, ValueError): pass
    else: raise AssertionError('Established absence/drift accepted: ' + fault)
    if folder.is_symlink(): folder.unlink()
    elif folder.exists(): shutil.rmtree(folder)
    alias = mount / 'alias'
    if alias.is_dir(): shutil.rmtree(alias)
    elif alias.exists() or alias.is_symlink(): alias.unlink()
    saved.rename(folder)
assert state.read_bytes() == changed
print('ordinary enrollment convergence and eleven established-loss negatives passed')
`;
  const child = Bun.spawn(
    [
      'python3',
      '-c',
      script,
      join(import.meta.dir, '../../../infra/ansible/roles/registry_storage/files/storage.sh'),
      directory,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(stderr).toBe('');
  expect(code).toBe(0);
  expect(stdout).toContain('eleven established-loss negatives passed');
});
