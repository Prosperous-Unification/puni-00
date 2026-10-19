import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent
BINDINGS = json.loads((ROOT / 'bindings.json').read_text())
SOURCE = None
OUT = None


def digest(content):
    return hashlib.sha256(content).hexdigest()


def save(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2) + '\n')


def query(command, cwd=None):
    return subprocess.check_output(command, cwd=cwd, text=True).strip()


def check_inputs():
    # Proof: prove-checks.py appends one policy byte; this production check rejects its digest.
    for name, expected in BINDINGS['inputs'].items():
        content = (ROOT / 'inputs' / name).read_bytes()
        if len(content) != expected['bytes'] or digest(content) != expected['sha256']:
            raise ValueError('input digest mismatch: ' + name)


def check_source_checkout(source, expected):
    # Proof: prove-checks.py rejects a wrong SHA and an actual untracked file in its fixture clone.
    if query(['git', 'rev-parse', 'HEAD'], source) != expected or query(['git', 'status', '--porcelain'], source):
        raise ValueError('source checkout is not clean exact final SHA')


def require_same_identity(before, after, phase):
    # Proof: real captures before/after changing synthetic executable bytes reject both phases.
    if before != after:
        raise ValueError('installed identity changed ' + phase)


def validate_report(label, variant):
    # Proof: prove-checks.py mutates seven report fields separately; each is refused, then restored.
    report = json.loads((OUT / (label + '.stdout')).read_bytes())
    expected = json.loads((ROOT / ('inputs/historical-' + variant + '.json')).read_text())
    if report != expected:
        raise ValueError('complete fixture report mismatch: ' + label)
    return report


def guarded(label, command, cwd, seconds=360, expected_exit=0):
    binding = BINDINGS['guards'][str(seconds)]
    guard = ROOT / binding['path']
    content = guard.read_bytes()
    if len(content) != binding['bytes'] or digest(content) != binding['sha256']:
        raise ValueError('reviewed guard digest mismatch: ' + binding['path'])
    for suffix in ['.stdout', '.stderr', '.receipt.json', '.guard.stdout', '.guard.stderr', '.guard-exit.json']:
        if (OUT / (label + suffix)).exists():
            raise ValueError('guard output already exists: ' + label + suffix)
    invocation = ['python3', str(guard), str(OUT / label), *command]
    completed = subprocess.run(invocation, cwd=cwd, capture_output=True)
    (OUT / (label + '.guard.stdout')).write_bytes(completed.stdout)
    (OUT / (label + '.guard.stderr')).write_bytes(completed.stderr)
    save(label + '.guard-exit.json', {'command': invocation, 'exitCode': completed.returncode})
    if completed.returncode != 0:
        # Proof: a real tiny child exit 7 makes the exact retained guard fail and this raises.
        raise ValueError('guard process failed: ' + label)
    receipt = json.loads((OUT / (label + '.receipt.json')).read_text())
    validate_guard_receipt(label, receipt, command, cwd, seconds, expected_exit)
    return receipt


def validate_guard_receipt(label, receipt, command, cwd, seconds, expected_exit):
    # Proof: prove-checks.py changes stop/exit and each command/resource binding on a real receipt.
    if receipt['stopReason'] is not None or receipt['exitCode'] != expected_exit:
        # Proof: retained guard accepts child exit 1; expected_exit=0 still refuses that receipt.
        raise ValueError('guarded command failed: ' + label)
    if receipt['command'] != command or receipt['cwd'] != str(cwd) or receipt['ceilingKiB'] != 2097152 or receipt['timeoutSeconds'] != seconds or receipt['minimumAvailableKiB'] != 12582912 or receipt['availableBeforeKiB'] < 12582912:
        raise ValueError('guard receipt binding mismatch: ' + label)


def snapshot(label, consumer, source_sha):
    package = consumer / 'node_modules/twilight-burokrat'
    executable = consumer / 'node_modules/.bin/twib'
    destination = OUT / (label + '.json')
    subprocess.run(['python3', str(ROOT / 'capture-installed.py'), str(executable), str(package / 'dist/package-manifest.json'), str(package / 'dist/toolkit/toolkit.json'), str(destination)], check=True)
    identity = json.loads(destination.read_text())
    validate_identity(identity, package, source_sha)
    return identity


def validate_identity(identity, package, source_sha):
    if identity['manifest']['sourceRevision'] != source_sha or identity['descriptor']['sourceRevision'] != source_sha:
        # Proof: actual capture helper on a small synthetic package rejects a wrong expected SHA.
        raise ValueError('source identity mismatch')
    if identity['bunVersion'] != '1.4.2' or identity['descriptor']['bunVersion'] != '1.4.2':
        # Proof: captured runtime version and descriptor runtime version mutations both fail.
        raise ValueError('runtime identity mismatch')
    if identity['manifest']['toolkitIdentity'] != identity['descriptorSha256']:
        # Proof: mutated manifest toolkit identity is refused by prove-checks.py.
        raise ValueError('toolkit descriptor identity mismatch')
    for name, expected in identity['descriptor']['roles'].items():
        if digest((package / 'dist/toolkit' / name).read_bytes()) != expected:
            # Proof: changing the synthetic validator bytes rejects this role after real capture.
            raise ValueError('toolkit role mismatch: ' + name)
    if source_sha == BINDINGS['historicalSource']:
        if identity['executableSha256'] != BINDINGS['historicalExecutableSha256'] or identity['descriptorSha256'] != BINDINGS['historicalToolkitIdentity']:
            # Proof: synthetic historical identity mutations exercise executable and toolkit branches.
            raise ValueError('historical installed identity changed')


def require_hosted():
    # Proof: prove-checks.py removes GITHUB_ACTIONS and observes this refusal.
    if os.environ.get('GITHUB_ACTIONS') != 'true':
        raise ValueError('hosted execution required')


def validate_artifact_metadata(metadata, artifact):
    # Proof: prove-checks.py mutates ID, expiry, run identity and ZIP digest independently.
    if metadata['id'] != artifact['id'] or metadata['expired'] or metadata['workflow_run']['id'] != artifact['runId'] or metadata['digest'] != 'sha256:' + artifact['zipSha256']:
        raise ValueError('immutable artifact metadata differs')


def extract_historical_archive(archive_zip, historical, artifact, package_sha):
    # Proof: tiny local ZIP byte/size mutations fail here; restored bytes pass.
    if archive_zip.stat().st_size != artifact['bytes'] or digest(archive_zip.read_bytes()) != artifact['zipSha256']:
        raise ValueError('historical artifact ZIP digest differs')
    with zipfile.ZipFile(archive_zip) as packed:
        matches = [name for name in packed.namelist() if name == 'twilight-burokrat-0.1.0.tgz']
        # Proof: hash-bound tiny ZIPs with missing/duplicate member names are each refused.
        if len(matches) != 1:
            raise ValueError('historical package member absent or ambiguous')
        historical.write_bytes(packed.read(matches[0]))
    # Proof: a wrong expected package hash is refused despite a valid ZIP/member.
    if digest(historical.read_bytes()) != package_sha:
        raise ValueError('historical package digest differs')


def main():
    final_sha = BINDINGS.get('finalSourceRevision')
    if not isinstance(final_sha, str) or not re.fullmatch('[0-9a-f]{40}', final_sha):
        raise ValueError('finalSourceRevision must be filled with reviewed committed SHA before launch')
    require_hosted()
    OUT.mkdir(exist_ok=False)
    check_inputs()
    check_source_checkout(SOURCE, final_sha)
    if query(['bun', '--version']) != '1.4.2':
        raise ValueError('Bun 1.4.2 required')
    save('host.json', {'runId': os.environ['GITHUB_RUN_ID'], 'runAttempt': os.environ['GITHUB_RUN_ATTEMPT'], 'workflowCommit': os.environ['GITHUB_SHA'], 'sourceCommit': final_sha, 'sourceTree': query(['git', 'rev-parse', 'HEAD^{tree}'], SOURCE), 'runnerName': os.environ.get('RUNNER_NAME'), 'runnerOS': os.environ.get('RUNNER_OS'), 'bunVersion': query(['bun', '--version'])})
    shutil.copyfile(ROOT / 'bindings.json', OUT / 'bindings.json')
    artifact = BINDINGS['artifact']
    api = 'https://api.github.com/repos/Prosperous-Unification/puni-00/actions/artifacts/' + str(artifact['id'])
    request = urllib.request.Request(api, headers={'Authorization': 'Bearer ' + os.environ['GH_TOKEN']})
    with urllib.request.urlopen(request) as response:
        metadata = json.load(response)
    save('historical-artifact.json', metadata)
    validate_artifact_metadata(metadata, artifact)
    # gh follows the authenticated redirect without exposing the signed URL in receipts.
    archive_zip = OUT / 'historical-artifact.zip'
    with archive_zip.open('xb') as stream:
        subprocess.run(['gh', 'api', 'repos/Prosperous-Unification/puni-00/actions/artifacts/' + str(artifact['id']) + '/zip'], stdout=stream, check=True)
    historical = OUT / 'historical.tgz'
    extract_historical_archive(archive_zip, historical, artifact, BINDINGS['historicalArchiveSha256'])
    guarded('source-install', ['bun', 'install', '--frozen-lockfile'], SOURCE)
    guarded('successor-pack', ['bunx', 'nx', 'run', 'twilight-burokrat:pack', '--skip-nx-cache', '--output-style=stream'], SOURCE)
    successor = OUT / 'successor.tgz'
    shutil.copyfile(SOURCE / 'dist/twilight-burokrat-pack/twilight-burokrat-0.1.0.tgz', successor)
    save('archive-identities.json', {'historicalSha256': digest(historical.read_bytes()), 'successorSha256': digest(successor.read_bytes()), 'successorSource': final_sha})
    work = OUT.parent / 'parity-work'
    work.mkdir(exist_ok=False)
    fixture = work / 'fixture'
    subprocess.run(['git', 'clone', str(ROOT / 'inputs/fixture.bundle'), str(fixture)], check=True)
    subprocess.run(['git', 'checkout', '--detach', BINDINGS['fixtureCommit']], cwd=fixture, check=True)
    if query(['git', 'rev-parse', 'HEAD^{tree}'], fixture) != BINDINGS['fixtureTree']:
        raise ValueError('fixture tree differs')
    reports = {}
    for tool, archive, revision in [('historical', historical, BINDINGS['historicalSource']), ('successor', successor, final_sha)]:
        consumer = work / tool
        consumer.mkdir()
        (consumer / 'package.json').write_text(json.dumps({'name': 'hosted-' + tool, 'private': True}) + '\n')
        guarded(tool + '-install', ['bun', 'add', '--exact', '--ignore-scripts', str(archive)], consumer)
        guarded(tool + '-frozen', ['bun', 'install', '--frozen-lockfile', '--ignore-scripts'], consumer)
        stable = None
        for variant, expected_exit in [('positive', 0), ('negative', 1)]:
            check_inputs()
            label = tool + '-' + variant
            before = snapshot(label + '.before', consumer, revision)
            if stable is not None:
                require_same_identity(stable, before, 'between invocations')
            stable = before
            try:
                guarded(label, [str(consumer / 'node_modules/.bin/twib'), 'check', 'committed', str(fixture), BINDINGS['fixtureCommit'], str(ROOT / ('inputs/' + variant + '-policy.json')), '--rule', 'REL-EXTRACT'], consumer, seconds=60, expected_exit=expected_exit)
            finally:
                after = snapshot(label + '.after', consumer, revision)
                require_same_identity(before, after, 'during invocation')
            reports[label] = validate_report(label, variant)
    check_inputs()
    if query(['git', 'status', '--porcelain'], fixture) or query(['git', 'diff', '--name-only', 'HEAD'], SOURCE):
        raise ValueError('fixture or tracked source changed')
    if digest(historical.read_bytes()) != BINDINGS['historicalArchiveSha256']:
        raise ValueError('historical archive changed')
    save('comparison.json', {'status': 'pass', 'scope': 'Hosted installed bounded REL-EXTRACT positive/refusal parity only; no all-rule acceptance or certification.', 'reports': reports})


if __name__ == '__main__':
    SOURCE = Path(sys.argv[1]).resolve()
    OUT = Path(sys.argv[2]).resolve()
    main()
