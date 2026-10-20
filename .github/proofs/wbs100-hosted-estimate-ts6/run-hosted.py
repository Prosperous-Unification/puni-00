import hashlib
import json
import math
from pathlib import Path
import shutil
import subprocess
import sys

SOURCE = 'd7f2129598af7a3cb7ed3c7161e06d504b586891'
SCOPE = '.estimate-recovery-scope.tsconfig.json'
EVIDENCE = 'openspec/changes/wbs-estimate-presentation-boundary/evidence/recovery-2026-10-19'
INPUTS = {
    'ts6-scope.json.txt': '124877f93f60b1d2585493fbfa6104c8b4e3b4efbc1d8f3d65dd33fd0ccc6fd1',
    'ts6-identity.json.txt': '1d3ef6d59bee8d6513f8c8ca5e91e61db22e467d60b107a5df1f770539d604c1',
    'mounted-ts6-guard.py.txt': '291398b1395dcdc5a342f7439f48c2f9f497ceaa83481176110cec1192df974c',
}
LOCK = 'e8d77926f9dac4ba4824486143872bdfb123cafd8bed45cca50c44b2e23298a4'
ROOTS = [
    'apps/wbs/fe-01/src/components/wbs/plan-columns/estimates.tsx',
    'apps/wbs/fe-01/src/components/wbs/plan-columns/estimate-presentation.tsx',
    'apps/wbs/fe-01/tsconfig.app.json',
    'tsconfig.base.json',
    'bun.lock',
]


def equal(actual, expected, label):
    """Refuse changed proof inputs; prove-adapter.py watches altered values fail."""
    if type(actual) is not type(expected) or actual != expected:
        raise RuntimeError(f'{label}: expected {expected!r}, observed {actual!r}')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path, content):
    path.write_text(json.dumps(content, indent=2) + '\n')


def output(command, cwd):
    return subprocess.check_output(command, cwd=cwd, text=True).strip()


def validate_receipt(receipt, command, cwd):
    """The retained guard allows child 1; this proof requires child 0 and no stop.

    Proof: prove-adapter.py rejects changed exit/stop/command/cwd/bounds and
    inconsistent measured memory/time, then passes after each restoration.
    """
    for key, expected in {
        'command': command, 'cwd': str(cwd), 'exitCode': 0, 'stopReason': None,
        'ceilingKiB': 2097152, 'timeoutSeconds': 360,
        'minimumAvailableKiB': 12582912,
    }.items():
        equal(receipt[key], expected, f'receipt {key}')
    for key, minimum, maximum in [
        ('availableBeforeKiB', 12582912, float('inf')),
        ('peakProcessTreeKiB', 0, 2097152), ('seconds', 0, 360),
    ]:
        value = receipt[key]
        numeric = type(value) in (int, float) if key == 'seconds' else type(value) is int
        if not numeric or not math.isfinite(value) or not minimum <= value <= maximum:
            raise RuntimeError(f'receipt {key} outside retained bounds')


def validate_compiler(compiler, expected):
    """Bind the actual entry/facade/resolved compiler bytes to the old TS6 receipt.

    Proof: prove-adapter.py rejects version and each compiler hash mutation.
    Absolute installation paths are recorded, not compared across hosts.
    """
    equal(compiler['version'], expected['version'], 'compiler version')
    equal(compiler['resolvedPackageVersion'], expected['resolvedPackageVersion'], 'resolved package version')
    for key in ['entrySha256', 'facadeShimSha256', 'resolvedCompilerFiles']:
        equal(compiler[key], expected[key], f'compiler {key}')


def validate_source(source_revision, inputs, lock_hash, bun_version):
    """Require exact reviewed source/toolchain; the adapter's negative proof alters each."""
    equal(source_revision, SOURCE, 'source revision')
    equal(inputs, INPUTS, 'retained inputs')
    equal(lock_hash, LOCK, 'lockfile')
    equal(bun_version, '1.4.2', 'Bun version')


def validate_checkout(status, installed):
    """Proof: actual helper rejects dirty source and an existing dependency tree."""
    equal(status, '', 'fresh source checkout')
    equal(installed, False, 'fresh dependency tree')


def validate_guard(exit_code, receipt, command, cwd):
    """Proof: actual helper refuses failed guard and guard-success/child-one receipts."""
    equal(exit_code, 0, 'guard exit')
    validate_receipt(receipt, command, cwd)


def validate_snapshot(observed, expected):
    """Proof: actual helper rejects scope/source/compiler drift and unexpected files."""
    validate_compiler(observed['compiler'], expected)
    validate_source(observed['sourceRevision'], observed['retainedInputs'],
                    observed['sourceFiles']['bun.lock'], observed['bunVersion'])
    equal(observed['scopeSha256'], INPUTS['ts6-scope.json.txt'], 'scope config')
    equal(observed['trackedDiff'], '', 'tracked source mutation')
    equal(observed['untrackedPaths'], SCOPE, 'unexpected source file')


def validate_after(after, before):
    """Proof: actual helper rejects a changed selected-source digest after compilation."""
    equal(after, before, 'source/config/compiler after')


def verify_typecheck(receipts, observe, invoke, expected, command, cwd):
    """Publish acceptance only after the real command and unchanged authenticated snapshots.

    Proof: prove-adapter.py runs this orchestration with injected source/compiler,
    child-one/guard failure and after-drift observations; every fault refuses
    without acceptance.json, and each restored invocation publishes acceptance.
    Only external observations/invocation are substituted, never validators.
    """
    before = observe()
    write_json(receipts / 'before.json', before)
    validate_snapshot(before, expected)
    try:
        exit_code, receipt, _ = invoke('typecheck', command)
        validate_guard(exit_code, receipt, command, cwd)
    finally:
        after = observe()
        write_json(receipts / 'after.json', after)
        validate_snapshot(after, expected)
        validate_after(after, before)
    acceptance = {
        'status': 'passed', 'sourceRevision': SOURCE, 'version': before['compiler']['version'],
        'beforeSha256': digest(receipts / 'before.json'),
        'afterSha256': digest(receipts / 'after.json'),
        'typecheckReceiptSha256': digest(receipts / 'typecheck.receipt.json'),
    }
    write_json(receipts / 'acceptance.json', acceptance)
    return acceptance


def run(source, receipts):
    receipts.mkdir(parents=True, exist_ok=True)
    proof = Path(__file__).resolve().parents[3]
    write_json(receipts / 'provenance.json', {
        'sourceRevision': output(['git', 'rev-parse', 'HEAD'], source),
        'proofRevision': output(['git', 'rev-parse', 'HEAD'], proof),
        'sourcePath': str(source), 'proofPath': str(proof),
        'scope': 'Explicit estimate TS6 proof; helper negatives are adapter integrity only',
    })
    validate_checkout(output(['git', 'status', '--porcelain', '--untracked-files=all'], source),
                      (source / 'node_modules').exists())
    observed = {name: digest(source / EVIDENCE / name) for name in INPUTS}
    validate_source(output(['git', 'rev-parse', 'HEAD'], source), observed,
                    digest(source / 'bun.lock'), output(['bun', '--version'], source))
    for name in INPUTS:
        shutil.copyfile(source / EVIDENCE / name, receipts / name)
    guard = receipts / 'mounted-ts6-guard.py.txt'

    def invoke(label, command):
        prefix = receipts / label
        with prefix.with_suffix('.guard.stdout').open('w') as stdout, prefix.with_suffix('.guard.stderr').open('w') as stderr:
            invocation = ['python3', str(guard), str(prefix), *command]
            write_json(prefix.with_suffix('.command.json'), {'command': invocation, 'cwd': str(source)})
            completed = subprocess.run(invocation, cwd=source, stdout=stdout, stderr=stderr)
        write_json(prefix.with_suffix('.guard-exit.json'), {'exitCode': completed.returncode})
        receipt = json.loads(prefix.with_suffix('.receipt.json').read_text())
        return completed.returncode, receipt, prefix.with_suffix('.stdout').read_text()

    def guarded(label, command):
        exit_code, receipt, stdout = invoke(label, command)
        validate_guard(exit_code, receipt, command, source)
        return stdout

    guarded('install', ['bun', 'install', '--frozen-lockfile'])
    equal(digest(source / 'bun.lock'), LOCK, 'installed lockfile')
    config = source / SCOPE
    shutil.copyfile(receipts / 'ts6-scope.json.txt', config)
    version = guarded('version', ['bun', 'node_modules/typescript/bin/tsc6', '--version']).strip()
    # Resolve from the real facade, as its require does; do not assume a hoisted path.
    chain = json.loads(guarded('resolve', ['bun', '-e',
        'const {createRequire}=require("node:module");'
        'const path=require("node:path");'
        'const entry=path.resolve("node_modules/typescript/bin/tsc6");'
        'const facade=createRequire(entry).resolve("../lib/tsc.js");'
        'const compiler=createRequire(facade).resolve("@typescript/old/lib/tsc.js");'
        'console.log(JSON.stringify({entry,facade,compiler}));']))
    expected = json.loads((receipts / 'ts6-identity.json.txt').read_text())

    def snapshot():
        compiler_path = Path(chain['compiler'])
        package = compiler_path.parent.parent
        compiler = {
            'version': version,
            'resolvedPackage': str(package),
            'resolvedPackageVersion': json.loads((package / 'package.json').read_text())['version'],
            'entrySha256': digest(Path(chain['entry'])),
            'facadeShimSha256': digest(Path(chain['facade'])),
            'resolvedCompilerFiles': {
                name: {'sha256': digest(package / name), 'bytes': (package / name).stat().st_size}
                for name in ['lib/tsc.js', 'lib/_tsc.js']
            },
        }
        observed = {
            'sourceRevision': output(['git', 'rev-parse', 'HEAD'], source),
            'compiler': compiler, 'chain': chain, 'scopeSha256': digest(config),
            'sourceFiles': {name: digest(source / name) for name in ROOTS},
            'retainedInputs': {name: digest(source / EVIDENCE / name) for name in INPUTS},
            'bunVersion': output(['bun', '--version'], source),
            'trackedDiff': output(['git', 'diff', 'HEAD', '--'], source),
            'untrackedPaths': output(['git', 'ls-files', '--others', '--exclude-standard'], source),
        }
        return observed

    return verify_typecheck(receipts, snapshot, invoke, expected,
                            ['bun', 'node_modules/typescript/bin/tsc6', '-p', SCOPE, '--noEmit'], source)


if __name__ == '__main__':
    run(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve())
