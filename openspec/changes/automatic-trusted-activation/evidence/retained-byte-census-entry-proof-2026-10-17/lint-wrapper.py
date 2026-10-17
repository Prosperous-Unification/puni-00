import hashlib, json, os, pathlib, shlex, subprocess, tempfile
folder = pathlib.Path(__file__).parent
configuration = pathlib.Path('lefthook-local.yml').read_bytes()
template = configuration.decode().split('      run: ', 1)[1].strip()
if template.count('{staged_files}') != 1:
    raise RuntimeError('serial lint template differs')
paths = subprocess.check_output(['git', 'diff', '--name-only', 'fad025cc9052ef5b2d52e30bc1fc3736e015c9f3', '--', '*.ts'], text=True).splitlines()
staged_paths = subprocess.check_output(['git', 'diff', '--cached', '--name-only', '--', '*.ts'], text=True).splitlines()
if not staged_paths or not set(staged_paths).issubset(paths):
    raise RuntimeError('staged TypeScript coverage differs')
if not paths:
    raise RuntimeError('no touched TypeScript paths')
expanded = template.replace('{staged_files}', ' '.join(shlex.quote(path) for path in paths))
receipts = []
with tempfile.TemporaryDirectory(prefix='census-lint-wrapper-') as directory:
    executable = pathlib.Path(directory) / 'bunx'
    executable.write_text('''#!/usr/bin/python3
import json,os,sys
with open(os.environ['LINT_ARGV_LOG'],'a') as stream:
    stream.write(json.dumps(sys.argv[1:])+'\\n')
if sys.argv[-1] == os.environ['LINT_FAIL_PATH']:
    sys.exit(23)
''')
    executable.chmod(0o700)
    for name, command, failure, expected_exit, expected_paths in [
        ('all-files', expanded, '', 0, paths),
        ('injected-nonzero', expanded, paths[1], 23, paths[:2]),
        ('omitted-exit-negative', expanded.replace(' || exit $?', ''), paths[1], 0, paths),
    ]:
        log = pathlib.Path(directory) / (name + '.jsonl')
        invocation = subprocess.run(['bash', '-c', command], env=dict(os.environ, PATH=directory + ':' + os.environ['PATH'], LINT_ARGV_LOG=str(log), LINT_FAIL_PATH=failure))
        argv = [json.loads(line) for line in log.read_text().splitlines()]
        if invocation.returncode != expected_exit or argv != [['eslint', path] for path in expected_paths]:
            raise RuntimeError('serial wrapper observation differs: ' + name)
        receipts.append({'name': name, 'shellCommand': command, 'injectedFailurePath': failure, 'observedExitCode': invocation.returncode, 'observedArgv': argv})
(folder / 'lint-wrapper.json').write_text(json.dumps({'configurationSha256': hashlib.sha256(configuration).hexdigest(), 'template': template, 'coveredTypeScriptPaths': paths, 'stagedTypeScriptPaths': staged_paths, 'receipts': receipts}, indent=2) + '\n')
