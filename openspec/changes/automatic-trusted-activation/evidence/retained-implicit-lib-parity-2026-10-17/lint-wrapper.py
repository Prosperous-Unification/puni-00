import hashlib, json, os, pathlib, shlex, subprocess, tempfile
folder = pathlib.Path(__file__).parent
configuration = pathlib.Path('lefthook-local.yml').read_bytes()
template = configuration.decode().split('      run: ', 1)[1].strip()
if template.count('{staged_files}') != 1:
    raise RuntimeError('serial lint template differs')
paths = subprocess.check_output(['git', 'diff', '--name-only', 'e43ecad594f7932fa11b55971bbb26af9820f530', '--', '*.ts'], text=True).splitlines()
if len(paths) != 2:
    raise RuntimeError('expected exactly two changed TypeScript paths')
expanded = template.replace('{staged_files}', ' '.join(shlex.quote(path) for path in paths))
receipts = []
with tempfile.TemporaryDirectory(prefix='implicit-lint-wrapper-') as directory:
    executable = pathlib.Path(directory) / 'bunx'
    executable.write_text("#!/usr/bin/python3\nimport json,os,sys\nwith open(os.environ['LINT_ARGV_LOG'],'a') as stream:\n stream.write(json.dumps(sys.argv[1:])+chr(10))\nif sys.argv[-1] == os.environ['LINT_FAIL_PATH']:\n sys.exit(23)\n")
    executable.chmod(0o700)
    for name, command, failure, expected_exit, expected_paths in [
        ('all-files', expanded, '', 0, paths),
        ('injected-nonzero', expanded, paths[0], 23, paths[:1]),
        ('omitted-exit-negative', expanded.replace(' || exit $?', ''), paths[0], 0, paths),
    ]:
        log = pathlib.Path(directory) / (name + '.jsonl')
        invocation = subprocess.run(['bash', '-c', command], env=dict(os.environ, PATH=directory + ':' + os.environ['PATH'], LINT_ARGV_LOG=str(log), LINT_FAIL_PATH=failure))
        argv = [json.loads(line) for line in log.read_text().splitlines()]
        if invocation.returncode != expected_exit or argv != [['--no-install', 'eslint', path] for path in expected_paths]:
            raise RuntimeError('serial wrapper observation differs: ' + name)
        receipts.append({'name': name, 'shellCommand': command, 'injectedFailurePath': failure, 'observedExitCode': invocation.returncode, 'observedArgv': argv})
(folder / 'lint-wrapper.json').write_text(json.dumps({'configurationSha256': hashlib.sha256(configuration).hexdigest(), 'template': template, 'coveredTypeScriptPaths': paths, 'receipts': receipts}, indent=2) + '\n')
