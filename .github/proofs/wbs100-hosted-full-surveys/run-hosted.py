import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.request
import zipfile

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import acceptance

survey = acceptance.survey
CONFIG = survey.read_json(ROOT / 'bindings.json')
spec = importlib.util.spec_from_file_location('parity_support', ROOT / 'parity-support.py')
support = importlib.util.module_from_spec(spec)
spec.loader.exec_module(support)


def sha(content):
    return hashlib.sha256(content).hexdigest()


def save(path, value):
    with path.open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')


def extract_successor(archive, destination):
    # Proof: tiny ZIP byte/size/member/package mutations fail this exact function.
    survey.equal(archive.stat().st_size, CONFIG['artifact']['bytes'], 'artifact ZIP size')
    survey.equal(sha(archive.read_bytes()), CONFIG['artifact']['zipSha256'], 'artifact ZIP digest')
    with zipfile.ZipFile(archive) as packed:
        members = [member for member in packed.infolist() if member.filename == CONFIG['artifactMember']]
        survey.require(len(members) == 1 and not members[0].is_dir(), 'successor member absent or ambiguous')
        content = packed.read(members[0])
    survey.equal(sha(content), CONFIG['successorArchiveSha256'], 'successor package digest')
    with destination.open('xb') as stream:
        stream.write(content)


def validate_candidate_bindings(repository, bindings):
    # Proof: copied bindings with wrong tree/commit and wrong restored blob fail real Git queries.
    for label, binding in bindings['bindings'].items():
        tree = support.query(['git', 'rev-parse', binding['commit'] + '^{tree}'], repository)
        survey.equal(tree, binding['tree'], label + ': candidate tree')
        survey.equal(binding['identity']['selection'],
                     {'kind': 'committed', 'revision': binding['commit'], 'tree': tree},
                     label + ': candidate selection')
    for label, path in survey.SELECTED.items():
        fault = bindings['bindings'][label + '-fault']['commit']
        good = bindings['bindings'][label]['commit']
        survey.equal(support.query(['git', 'rev-parse', fault + '^'], repository), good,
                     label + ': fault parent')
        survey.equal(support.query(['git', 'diff', '--name-only', good, fault], repository), path,
                     label + ': fault changed unrelated path')
        survey.equal(support.query(['git', 'rev-parse', fault + ':' + path], repository),
                     support.query(['git', 'rev-parse', CONFIG['faultPrerequisite'] + ':' + path], repository),
                     label + ': fault did not restore original blob')


def validate_helpers():
    # Proof: changing any copied helper or guard byte refuses before command launch.
    for name, expected in CONFIG['reviewedHelpers'].items():
        survey.equal(sha((ROOT / name).read_bytes()), expected, 'reviewed helper digest: ' + name)
    for binding in CONFIG['guards'].values():
        content = (ROOT / binding['path']).read_bytes()
        survey.equal(len(content), binding['bytes'], 'guard byte length')
        survey.equal(sha(content), binding['sha256'], 'guard byte digest')


def run_survey(output, prefix, command, consumer):
    validate_helpers()
    # Proof: an existing report/receipt/snapshot prefix is rejected by prove-adapter.py.
    for suffix in ('.stdout', '.stderr', '.receipt.json', '.guard.stdout', '.guard.stderr', '.guard-exit.json'):
        survey.require(not (output / (prefix + suffix)).exists(), 'stale survey output: ' + prefix + suffix)
    guard = ROOT / CONFIG['guards']['900']['path']
    invocation = ['python3', str(guard), str(output / prefix), *command]
    run = subprocess.run(invocation, cwd=consumer, capture_output=True)
    (output / (prefix + '.guard.stdout')).write_bytes(run.stdout)
    (output / (prefix + '.guard.stderr')).write_bytes(run.stderr)
    save(output / (prefix + '.guard-exit.json'), {'command': invocation, 'exitCode': run.returncode})
    # Proof: a real tiny child exit 7 fails the retained guard and this wrapper refuses it.
    survey.equal(run.returncode, 0, 'survey guard process failed')
    receipt = survey.read_json(output / (prefix + '.receipt.json'))
    report = survey.read_json(output / (prefix + '.stdout'))
    survey.require(type(report.get('allowed')) is bool, 'report allowed must be boolean')
    acceptance.validate_guard(receipt, command, consumer, 0 if report['allowed'] else 1)
    return report


def validate_baseline(report):
    # Proof: compiler refusal and changed compiler finding fail the exact baseline comparison.
    expected = survey.read_json(ROOT / 'inputs/expected-base.json.txt')
    survey.equal(report, expected, 'hosted baseline differs from published final-source baseline')


def snapshot(output, name, consumer, expected):
    identity = support.snapshot(name, consumer, CONFIG['finalSourceRevision'])
    # Proof: changing captured expected identity refuses the real capture-helper output.
    survey.equal(identity, expected, name + ': installed identity differs from proven hosted archive')
    return identity


def main(repository, output):
    support.require_hosted()
    output.mkdir(exist_ok=False)
    support.OUT = output
    support.check_inputs()
    validate_helpers()
    support.check_source_checkout(repository, CONFIG['finalSourceRevision'])
    bindings = survey.read_json(ROOT / 'inputs/candidate-bindings.json.txt')
    policy = survey.read_json(ROOT / 'inputs/policy.json.txt')
    expected_identity = survey.read_json(ROOT / 'inputs/installed-identity.json.txt')
    survey.equal(support.query(['bun', '--version']), '1.4.2', 'hosted Bun version')
    save(output / 'host.json', {'runId': os.environ['GITHUB_RUN_ID'], 'runAttempt': os.environ['GITHUB_RUN_ATTEMPT'],
                              'proofCommit': os.environ['GITHUB_SHA'], 'sourceCommit': CONFIG['finalSourceRevision'],
                              'sourceTree': support.query(['git', 'rev-parse', 'HEAD^{tree}'], repository),
                              'bunVersion': support.query(['bun', '--version'])})
    artifact = CONFIG['artifact']
    endpoint = 'repos/Prosperous-Unification/puni-00/actions/artifacts/' + str(artifact['id'])
    request = urllib.request.Request('https://api.github.com/' + endpoint,
                                     headers={'Authorization': 'Bearer ' + os.environ['GH_TOKEN']})
    with urllib.request.urlopen(request) as response:
        metadata = json.load(response)
    save(output / 'artifact-metadata.json', metadata)
    support.validate_artifact_metadata(metadata, artifact)
    archive = output / 'source-artifact.zip'
    with archive.open('xb') as stream:
        subprocess.run(['gh', 'api', endpoint + '/zip'], stdout=stream, check=True)
    package = output / 'successor.tgz'
    extract_successor(archive, package)
    bundle = ROOT / 'inputs/faults.bundle'
    subprocess.run(['git', 'bundle', 'verify', str(bundle)], cwd=repository, check=True)
    for ref, commit in CONFIG['faultRefs'].items():
        subprocess.run(['git', '-c', 'maintenance.auto=false', '-c', 'gc.auto=0', 'fetch', '--no-tags',
                        str(bundle), 'refs/heads/' + ref + ':refs/heads/' + ref], cwd=repository, check=True)
        survey.equal(support.query(['git', 'rev-parse', 'refs/heads/' + ref], repository), commit,
                     'imported fault ref identity')
    support.check_source_checkout(repository, CONFIG['finalSourceRevision'])
    validate_candidate_bindings(repository, bindings)
    save(output / 'candidate-bindings-verified.json', bindings)
    consumer = output.parent / 'full-survey-consumer'
    consumer.mkdir(exist_ok=False)
    (consumer / 'package.json').write_text('{"name":"hosted-full-survey-consumer","private":true}\n')
    support.guarded('consumer-install', ['bun', 'add', '--exact', '--ignore-scripts', str(package)], consumer)
    support.guarded('consumer-frozen', ['bun', 'install', '--frozen-lockfile', '--ignore-scripts'], consumer)
    executable = consumer / 'node_modules/.bin/twib'
    installed = consumer / 'node_modules/twilight-burokrat/dist'
    for mode in ('full', 'f7'):
        for label in survey.LABELS:
            support.check_inputs()
            prefix = mode + '-' + label
            command = [str(executable), 'check', 'committed', str(repository),
                       bindings['bindings'][label]['commit'], str(ROOT / 'inputs/policy.json.txt')]
            if mode == 'f7':
                command += ['--rule', 'F7']
            before = snapshot(output, prefix + '.before', consumer, expected_identity)
            try:
                report = run_survey(output, prefix, command, consumer)
                if mode == 'full' and label == 'base':
                    validate_baseline(report)
            finally:
                after = snapshot(output, prefix + '.after', consumer, expected_identity)
                support.require_same_identity(before, after, prefix)
        if mode == 'full':
            command = ['python3', str(ROOT / 'compare-surveys.py'), '--bindings', str(ROOT / 'inputs/candidate-bindings.json.txt'),
                       '--policy', str(ROOT / 'inputs/policy.json.txt'), '--executable', str(executable),
                       '--package-manifest', str(installed / 'package-manifest.json'),
                       '--toolkit-descriptor', str(installed / 'toolkit/toolkit.json')]
            for label in survey.LABELS:
                prefix = str(output / ('full-' + label))
                command += ['--run', label, prefix + '.stdout', prefix + '.receipt.json', prefix + '.before.json', prefix + '.after.json']
            run = subprocess.run(command, capture_output=True)
            (output / 'full-comparison.stdout').write_bytes(run.stdout)
            (output / 'full-comparison.stderr').write_bytes(run.stderr)
            save(output / 'full-comparison.receipt.json', {'command': command, 'exitCode': run.returncode})
            survey.equal(run.returncode, 0, 'strict full-survey comparison failed')
    save(output / 'f7-comparison.json', acceptance.check_f7(output, bindings, policy, executable, repository, expected_identity))
    support.check_inputs()
    support.check_source_checkout(repository, CONFIG['finalSourceRevision'])
    survey.equal(sha(package.read_bytes()), CONFIG['successorArchiveSha256'], 'installed archive changed')
    save(output / 'completion.json', {'status': 'pass', 'certifies': False,
                                    'scope': 'Hosted five full surveys plus five standalone F7 comparisons; preserve every explicit unevaluated outcome.'})


if __name__ == '__main__':
    main(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve())
