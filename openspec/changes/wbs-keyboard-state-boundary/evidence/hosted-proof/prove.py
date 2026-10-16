import copy
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import zipfile

BASE = '8ab865f3f36052f4caac846aee7e5206f681d056'
BASE_TREE = '447a6425bec1d9c758981c1722fe50fdc17651d4'
SOURCE = '9bc809727d88977c1757dfeda1219df2417fdc17'
SOURCE_TREE = 'a6c63ca3da56b3eadee70df5832d1ef9e827166f'
SELECTED = 'apps/wbs/fe-01/src/components/wbs/use-plan-keyboard.ts'
POLICY_SHA = '3cff7523646c98f4b405c7aea21df6b913ce90f0c1f6545157007fc31f73a00c'
ARCHIVE_SHA = '67f6050bcfe58f563a86a3eeb82d560ffc7a1244e5138076d6fe739064e0b7c5'
TARBALL_SHA = 'f287bc11f43f628b70ecd01e11eb6784c55fd4b2fb8cbb9e439dee8e685297fd'
WORKSPACE = Path(os.environ['GITHUB_WORKSPACE'])
CANDIDATE = WORKSPACE / 'candidate'
RECEIPTS = WORKSPACE / 'receipts'
POLICY = RECEIPTS / 'recovery-full-policy.json'
CONSUMER = WORKSPACE / 'consumer'


def require(condition, message):
    """Raise on an unmet proof obligation even when Python optimization is enabled."""
    if not condition:
        raise AssertionError(message)


def digest(path):
    """Hash the exact bytes used by the hosted proof."""
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(name, value):
    """Retain a structured proof receipt outside the candidate checkout."""
    (RECEIPTS / name).write_text(json.dumps(value, indent=2) + '\n')


def git(repository, *arguments):
    """Read immutable Git identities without shell expansion."""
    return subprocess.check_output(['git', '-C', str(repository), *arguments], text=True).strip()


def assert_source():
    """Refuse a source or tracked-state change before accepting evidence."""
    require(git(CANDIDATE, 'rev-parse', 'HEAD') == SOURCE, 'candidate SHA changed')
    require(git(CANDIDATE, 'rev-parse', 'HEAD^{tree}') == SOURCE_TREE, 'candidate tree changed')
    require(git(CANDIDATE, 'rev-parse', BASE + '^{tree}') == BASE_TREE, 'base tree changed')
    require(git(CANDIDATE, 'status', '--porcelain', '--untracked-files=no') == '', 'candidate tracked state changed')


def prepare():
    """Pin both source trees and the workflow revision before hosted work begins."""
    RECEIPTS.mkdir()
    assert_source()
    proof = WORKSPACE / 'proof'
    require(git(proof, 'rev-parse', 'HEAD') == os.environ['GITHUB_SHA'], 'proof checkout differs from workflow SHA')
    save('source-identities.json', {
        'base': BASE, 'baseTree': BASE_TREE, 'candidate': SOURCE,
        'candidateTree': SOURCE_TREE, 'proof': git(proof, 'rev-parse', 'HEAD'),
        'proofTree': git(proof, 'rev-parse', 'HEAD^{tree}'),
    })
    (RECEIPTS / 'bun-version.txt').write_text(subprocess.check_output(['bun', '--version'], text=True))
    shutil.copyfile('/proc/meminfo', RECEIPTS / 'memory-before.txt')


def recover():
    """Recover only the immutable retained evaluator tarball and unchanged policy."""
    archive = WORKSPACE / 'evaluator-artifact.zip'
    require(digest(archive) == ARCHIVE_SHA, 'retained artifact archive digest differs')
    with zipfile.ZipFile(archive) as bundle:
        matches = [entry for entry in bundle.namelist() if entry == 'twilight-burokrat-0.1.0.tgz']
        require(len(matches) == 1, 'retained archive must contain exactly the named evaluator tarball')
        tarball = RECEIPTS / 'twilight-burokrat-0.1.0.tgz'
        tarball.write_bytes(bundle.read(matches[0]))
    require(digest(tarball) == TARBALL_SHA, 'retained evaluator tarball digest differs')
    retained = CANDIDATE / 'openspec/changes/wbs-plan-export-size-boundary/evidence/hosted-full-survey'
    shutil.copyfile(retained / 'recovery-full-policy.json.txt', POLICY)
    shutil.copyfile(retained / 'policy-provenance.json.txt', RECEIPTS / 'policy-provenance.json')
    require(digest(POLICY) == POLICY_SHA, 'unchanged policy digest differs')
    save('artifact-identities.json', {'artifactId': 12029728928, 'runId': 38863439207,
         'archiveSha256': digest(archive), 'tarballSha256': digest(tarball), 'policySha256': digest(POLICY)})
    CONSUMER.mkdir()
    (CONSUMER / 'package.json').write_text('{"name":"keyboard-state-proof-consumer","private":true}\n')


def verify_installed():
    """Join installed executable bytes and declared toolkit closure to the approved pins."""
    package = CONSUMER / 'node_modules/twilight-burokrat'
    manifest = json.loads((package / 'dist/package-manifest.json').read_text())
    descriptor = json.loads((package / 'dist/toolkit/toolkit.json').read_text())
    executable_sha = digest(package / 'dist/bin.mjs')
    save('installed-identity.json', {'manifest': manifest, 'descriptor': descriptor, 'executableSha256': executable_sha})
    require(manifest['sourceRevision'] == 'ac774f0c358db369c2048e537151e263cc29361e', 'evaluator source revision differs')
    require(manifest['toolkitIdentity'] == '2417f876901efadcc817e7518a8f796985c9e62409ab6f68458b55ea21d2b69a', 'installed toolkit identity differs')
    require(executable_sha == '92ca1424826b325dad64a160090fb8c83521a5e581a48f6bed510a1d7d00ef4c', 'installed executable digest differs')
    require(descriptor['trustedNodeModulesIdentity'] == 'efe812480b995ccef8634e9c17adf9a51d8f3e016c771232ec49ea71aaba94ac', 'trusted dependency closure differs')
    require(descriptor['bunVersion'] == '1.4.2', 'evaluator Bun descriptor differs')
    require(subprocess.check_output(['bun', '--version'], text=True).strip() == '1.4.2', 'runner Bun version differs')
    require(digest(POLICY) == POLICY_SHA, 'policy changed during evaluator install')


def memory_sample():
    """Capture host memory and pressure while one evaluator process runs."""
    return {'at': time.time(), 'meminfo': Path('/proc/meminfo').read_text(),
            'pressure': Path('/proc/pressure/memory').read_text()}


def survey(repository, revision, label, selected=False):
    """Retain raw verdicts and require their JSON outcome to agree with process termination."""
    assert_source()
    require(digest(POLICY) == POLICY_SHA, 'policy changed before invocation')
    command = [str(CONSUMER / 'node_modules/.bin/twib'), 'check', 'committed', str(repository), revision, str(POLICY)]
    if selected:
        command += ['--rule', 'F7']
    samples = [memory_sample()]
    started = time.time()
    with (RECEIPTS / (label + '.json')).open('w') as stdout, (RECEIPTS / (label + '.stderr')).open('w') as stderr:
        child = subprocess.Popen(command, cwd=CONSUMER, stdout=stdout, stderr=stderr)
        timed_out = False
        while True:
            try:
                exit_code = child.wait(timeout=15)
                break
            except subprocess.TimeoutExpired:
                samples.append(memory_sample())
                if time.time() - started > 900:
                    timed_out = True
                    child.kill()
                    exit_code = child.wait()
                    break
    samples.append(memory_sample())
    save(label + '.memory.json', samples)
    save(label + '.command.json', {'command': command, 'revision': revision, 'policySha256': digest(POLICY),
         'startedAt': started, 'endedAt': time.time(), 'exitCode': exit_code, 'timedOut': timed_out})
    require(not timed_out and exit_code >= 0, label + ': evaluator timeout or signal')
    verdict = json.loads((RECEIPTS / (label + '.json')).read_text())
    require(type(verdict['allowed']) is bool, label + ': missing boolean allowed')
    require(exit_code == (0 if verdict['allowed'] else 1), label + ': exit does not match JSON verdict')
    require(digest(POLICY) == POLICY_SHA, 'policy changed after invocation')
    assert_source()
    print(json.dumps({'phase': label, 'exitCode': exit_code, 'seconds': time.time() - started}), flush=True)
    return verdict


def compare(baseline, candidate, full):
    """Accept exactly the selected F7 removal while preserving every unrelated outcome."""
    policy = json.loads(POLICY.read_text())
    rules = sorted(entry['ruleId'] for entry in policy['ruleModes']) if full else ['F7']
    if full:
        require(len(rules) == 14 and len(set(rules)) == 14, 'policy does not contain exactly 14 rules')
    require(sorted(baseline['ruleIds']) == rules, 'baseline rule selection differs')
    require(sorted(candidate['ruleIds']) == rules, 'candidate rule selection differs')
    require(baseline['policy'] == candidate['policy'] == policy['policyId'], 'policy identity differs')
    selected = [finding for finding in baseline['findings'] if finding['ruleId'] == 'F7' and finding['path'] == SELECTED]
    require(selected == [{'ruleId': 'F7', 'path': SELECTED, 'message': '1046 lines exceeds the ceiling 800', 'effect': 'debt'}], 'baseline selected finding differs')
    require(not any(finding['ruleId'] == 'F7' and finding['path'] == SELECTED for finding in candidate['findings']), 'selected keyboard finding remains')
    require(candidate['findings'] == [finding for finding in baseline['findings'] if not (finding['ruleId'] == 'F7' and finding['path'] == SELECTED)], 'unrelated findings changed')
    require(candidate['unevaluated'] == baseline['unevaluated'], 'unevaluated entries changed')
    require(candidate['allowed'] == baseline['allowed'], 'allowed changed')
    require(candidate['certifies'] is False and baseline['certifies'] is False, 'certification was claimed')
    return {'rules': rules, 'baselineCandidate': baseline['candidate'], 'candidate': candidate['candidate'],
            'baselineFindings': len(baseline['findings']), 'candidateFindings': len(candidate['findings']),
            'unrelatedFindingsUnchanged': True, 'unevaluatedUnchanged': True, 'allowed': candidate['allowed'], 'certifies': False}


def expect_failure(baseline, candidate, full, expected, label):
    """Require an injected fault to reach its named comparator assertion."""
    try:
        compare(baseline, candidate, full)
    except AssertionError as fault:
        require(str(fault) == expected, label + ': failed outside expected assertion: ' + str(fault))
        save(label + '.json', {'observedFailure': str(fault), 'expectedFailure': expected})
        print(label + ': ' + str(fault), flush=True)
    else:
        raise AssertionError(label + ': comparator accepted injected fault')


def prove_surveys():
    """Evaluate committed sources serially and watch the production oversized-file fault fail."""
    baseline = survey(CANDIDATE, BASE, 'f7-base', selected=True)
    candidate = survey(CANDIDATE, SOURCE, 'f7-candidate', selected=True)
    save('f7-comparison.json', compare(baseline, candidate, False))
    fault = WORKSPACE / 'oversized-fault'
    subprocess.run(['git', 'clone', '--no-hardlinks', '--no-checkout', str(CANDIDATE), str(fault)], check=True)
    subprocess.run(['git', '-C', str(fault), 'checkout', '--detach', SOURCE], check=True)
    original = subprocess.check_output(['git', '-C', str(CANDIDATE), 'show', BASE + ':' + SELECTED])
    (fault / SELECTED).write_bytes(original)
    subprocess.run(['git', '-C', str(fault), 'add', SELECTED], check=True)
    subprocess.run(['git', '-C', str(fault), '-c', 'user.name=Hosted proof', '-c', 'user.email=hosted-proof@example.invalid', 'commit', '-m', 'proof: restore oversized keyboard production file'], check=True)
    fault_sha = git(fault, 'rev-parse', 'HEAD')
    require(git(fault, 'diff', '--name-only', SOURCE, fault_sha) == SELECTED, 'oversized fault changes other paths')
    require(subprocess.check_output(['git', '-C', str(fault), 'show', fault_sha + ':' + SELECTED]) == original, 'fault did not restore exact original bytes')
    save('fault-identity.json', {'sha': fault_sha, 'tree': git(fault, 'rev-parse', 'HEAD^{tree}'), 'path': SELECTED, 'restoredFrom': BASE})
    restored = survey(fault, fault_sha, 'f7-oversized-fault', selected=True)
    # Proof: the committed original 1046-line production file must fail the same selected-finding assertion.
    expect_failure(baseline, restored, False, 'selected keyboard finding remains', 'fault-selected-production')
    save('f7-restored-comparison.json', compare(baseline, candidate, False))
    full_base = survey(CANDIDATE, BASE, 'full-base')
    full_candidate = survey(CANDIDATE, SOURCE, 'full-candidate')
    save('full-comparison.json', compare(full_base, full_candidate, True))
    selected_fault = copy.deepcopy(full_candidate)
    selected_fault['findings'] += [finding for finding in full_base['findings'] if finding['ruleId'] == 'F7' and finding['path'] == SELECTED]
    expect_failure(full_base, selected_fault, True, 'selected keyboard finding remains', 'fault-full-selected')
    unrelated_fault = copy.deepcopy(full_candidate)
    unrelated_fault['findings'].append({'ruleId': 'F7', 'path': 'proof/unrelated.ts', 'message': 'injected comparator fault', 'effect': 'debt'})
    expect_failure(full_base, unrelated_fault, True, 'unrelated findings changed', 'fault-full-unrelated')
    unevaluated_fault = copy.deepcopy(full_candidate)
    unevaluated_fault['unevaluated'].append({'ruleId': 'PROOF', 'path': 'proof/unrelated.ts', 'reason': 'injected comparator fault'})
    expect_failure(full_base, unevaluated_fault, True, 'unevaluated entries changed', 'fault-full-unevaluated')
    save('full-restored-comparison.json', compare(full_base, full_candidate, True))
    assert_source()


if __name__ == '__main__':
    phase = sys.argv[1]
    phases = {'prepare': prepare, 'recover': recover, 'verify-installed': verify_installed, 'surveys': prove_surveys}
    require(phase in phases, 'unknown proof phase')
    phases[phase]()
