"""Light fixtures exercise actual acceptance paths; these are not hosted survey results."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import zipfile

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import acceptance

spec = importlib.util.spec_from_file_location('hosted_driver', ROOT / 'run-hosted.py')
driver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(driver)
survey = acceptance.survey


def write(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')


def main(retained, repository, evidence):
    evidence.mkdir(exist_ok=False)
    observations = []
    bindings = survey.read_json(ROOT / 'inputs/candidate-bindings.json.txt')
    policy = survey.read_json(ROOT / 'inputs/policy.json.txt')
    identity = survey.read_json(retained / 'base.before.json')
    with tempfile.TemporaryDirectory(prefix='wbs100-hosted-adapter-') as scratch:
        scratch = Path(scratch)
        consumer = scratch / 'consumer'
        executable = consumer / 'node_modules/.bin/twib'
        executable.parent.mkdir(parents=True)
        executable.write_text('unused; adapter only validates captured command identity\n')
        fixture = scratch / 'reports'
        fixture.mkdir()
        originals = {}
        for label in survey.LABELS:
            full = survey.read_json(retained / ('full-' + label + '.stdout'))
            originals['full-' + label + '.stdout'] = full
            # Projected from retained actual surveys solely as a light adapter test fixture.
            originals['f7-' + label + '.stdout'] = {
                **full, 'ruleIds': ['F7'], 'allowed': True, 'unevaluated': [],
                'findings': [finding for finding in full['findings'] if finding['ruleId'] == 'F7'],
            }
            command = [str(executable), 'check', 'committed', str(repository),
                       bindings['bindings'][label]['commit'], str(ROOT / 'inputs/policy.json.txt'), '--rule', 'F7']
            originals['f7-' + label + '.receipt.json'] = {
                'command': command, 'cwd': str(consumer), 'exitCode': 0, 'stopReason': None,
                'ceilingKiB': 4194304, 'timeoutSeconds': 900, 'minimumAvailableKiB': 12582912,
                'availableBeforeKiB': 14000000, 'peakProcessTreeKiB': 1000, 'seconds': 0.1,
            }
            for phase in ('before', 'after'):
                originals['f7-' + label + '.' + phase + '.json'] = identity
            (fixture / ('f7-' + label + '.stderr')).write_bytes(b'')

        def restore():
            for name, value in originals.items():
                write(fixture / name, value)

        def check():
            return acceptance.check_f7(fixture, bindings, policy, executable, repository, identity)

        def mutate(name, change):
            path = fixture / name
            value = survey.read_json(path)
            change(value)
            write(path, value)

        def reject(name, expected, operation):
            try:
                operation()
            except Exception as error:
                diagnostic = str(error)
                if expected not in diagnostic:
                    raise RuntimeError(name + ': wrong refusal: ' + diagnostic) from error
                observations.append({'fault': name, 'expected': expected, 'observed': diagnostic})
            else:
                raise RuntimeError(name + ': accepted injected fault')

        restore()
        check()
        baseline = survey.read_json(ROOT / 'inputs/expected-base.json.txt')
        driver.validate_baseline(baseline)
        refused = copy.deepcopy(baseline)
        refused['unevaluated'].append({'ruleId': 'REL-EXTRACT', 'reason': 'injected compiler refusal'})
        reject('baseline-compiler-refusal', 'hosted baseline differs from published final-source baseline',
               lambda: driver.validate_baseline(refused))
        changed = copy.deepcopy(baseline)
        next(finding for finding in changed['findings'] if finding['ruleId'] != 'F7')['message'] = 'injected compiler finding drift'
        reject('baseline-compiler-finding', 'hosted baseline differs from published final-source baseline',
               lambda: driver.validate_baseline(changed))
        driver.validate_baseline(baseline)
        faults = [
            ('candidate', lambda r: r.update(candidate='0' * 64)),
            ('policy', lambda r: r.update(policy='wrong')),
            ('rule-selection', lambda r: r.update(ruleIds=['F1', 'F7'])),
            ('allowed', lambda r: r.update(allowed=False)),
            ('unevaluated', lambda r: r.update(unevaluated=[{'ruleId': 'F7', 'reason': 'fault'}])),
            ('finding-effect', lambda r: r['findings'][0].update(effect='block')),
            ('finding-message', lambda r: r['findings'][0].update(message='changed')),
            ('missing-finding', lambda r: r['findings'].pop()),
            ('unexpected-field', lambda r: r.update(scenarios={})),
            ('certification', lambda r: r.update(certifies=True)),
            ('boolean-schema', lambda r: r.update(schemaVersion=True)),
        ]
        for name, change in faults:
            restore()
            mutate('f7-reference.stdout', change)
            expected = 'F7 report fields' if name == 'unexpected-field' else (
                'F7 boolean/certification fields' if name == 'certification' else (
                    'F7 schema type' if name == 'boolean-schema' else 'standalone F7 differs'))
            reject(name, expected, check)
        for name, suffix in [('duplicate-key', ',"allowed":true}'), ('nonfinite', ',"injected":NaN}')]:
            restore()
            path = fixture / 'f7-reference.stdout'
            path.write_text(path.read_text().rstrip()[:-1] + suffix)
            reject(name, 'duplicate JSON key' if name == 'duplicate-key' else 'nonfinite JSON constant', check)
        for name, change, expected in [
            ('invocation-rule', lambda r: r['command'].__setitem__(-1, 'F1'), 'guard command'),
            ('invocation-revision', lambda r: r['command'].__setitem__(4, '0' * 40), 'guard command'),
            ('invocation-policy', lambda r: r['command'].__setitem__(5, '/wrong'), 'guard command'),
            ('invocation-executable', lambda r: r['command'].__setitem__(0, '/wrong'), 'guard command'),
            ('invocation-cwd', lambda r: r.update(cwd='/wrong'), 'guard cwd'),
            ('resource-stop', lambda r: r.update(stopReason='rss_limit'), 'guard resource termination'),
            ('child-exit', lambda r: r.update(exitCode=1), 'guard child exit'),
            ('cap', lambda r: r.update(ceilingKiB=8388608), 'guard ceilingKiB'),
            ('deadline', lambda r: r.update(timeoutSeconds=1800), 'guard timeoutSeconds'),
            ('memory-floor', lambda r: r.update(minimumAvailableKiB=1), 'guard minimumAvailableKiB'),
            ('rss', lambda r: r.update(peakProcessTreeKiB=4194305), 'guard peak RSS'),
            ('available', lambda r: r.update(availableBeforeKiB=1), 'guard available memory'),
            ('duration', lambda r: r.update(seconds=902), 'guard duration'),
        ]:
            restore()
            mutate('f7-reference.receipt.json', change)
            reject(name, expected, check)
        for phase in ('before', 'after'):
            restore()
            mutate('f7-reference.' + phase + '.json', lambda r: r.update(executableSha256='a' * 64))
            reject('snapshot-' + phase, 'F7 evaluator identity changed', check)
        restore()
        for name in ('f7-base.stdout', 'full-base.stdout'):
            mutate(name, lambda r: r['findings'].append(copy.deepcopy(r['findings'][0])))
        reject('coherent-wrong-count', 'F7 finding count', check)
        restore()
        for name in ('f7-reference.stdout', 'full-reference.stdout'):
            mutate(name, lambda r: next(f for f in r['findings'] if f['ruleId'] == 'F7').update(message='coherent drift'))
        reject('coherent-unrelated-drift', 'standalone F7 removed unrelated findings', check)
        restore()
        for name in ('f7-reference-fault.stdout', 'full-reference-fault.stdout'):
            mutate(name, lambda r: next(f for f in r['findings'] if f['ruleId'] == 'F7').update(message='coherent fault drift'))
        reject('coherent-fault-drift', 'standalone fault did not restore baseline', check)
        restore()
        check()

        driver.validate_candidate_bindings(repository, bindings)
        for name, change, expected in [
            ('candidate-tree', lambda b: b['bindings']['reference'].update(tree='0' * 40), 'candidate tree'),
            ('candidate-commit', lambda b: b['bindings']['reference'].update(commit='0' * 40), 'returned non-zero'),
            ('candidate-selection', lambda b: b['bindings']['reference']['identity']['selection'].update(revision='0' * 40), 'candidate selection'),
            ('fault-parent', lambda b: b['bindings']['reference-fault'].update(commit=b['bindings']['base']['commit'], tree=b['bindings']['base']['tree'], identity=b['bindings']['base']['identity']), 'fault parent'),
        ]:
            altered = copy.deepcopy(bindings)
            change(altered)
            reject(name, expected, lambda: driver.validate_candidate_bindings(repository, altered))
        git_fixture = scratch / 'candidate-history'
        git_fixture.mkdir()

        def git(*arguments):
            return subprocess.check_output(['git', *arguments], cwd=git_fixture,
                                           text=True, stderr=subprocess.PIPE).strip()

        git('init', '--quiet')
        git('config', 'user.name', 'Hosted Adapter Fixture')
        git('config', 'user.email', 'fixture@example.test')
        selected_paths = list(survey.SELECTED.values())
        for relative in selected_paths:
            path = git_fixture / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('original oversized fixture\n')

        def commit(message):
            git('add', '--all')
            git('commit', '--quiet', '-m', message)
            return git('rev-parse', 'HEAD')

        tiny_base = commit('tiny base')
        tiny_bindings = {'bindings': {}}

        def bind(label, revision):
            tree = git('rev-parse', revision + '^{tree}')
            tiny_bindings['bindings'][label] = {'commit': revision, 'tree': tree,
                'identity': {'selection': {'kind': 'committed', 'revision': revision, 'tree': tree}}}

        bind('base', tiny_base)
        for label, relative in survey.SELECTED.items():
            git('checkout', '--quiet', '--detach', tiny_base)
            path = git_fixture / relative
            path.write_text('small candidate fixture\n')
            bind(label, commit('tiny ' + label))
            path.write_text('original oversized fixture\n')
            bind(label + '-fault', commit('tiny ' + label + ' restored'))
        original_prerequisite = driver.CONFIG['faultPrerequisite']
        driver.CONFIG['faultPrerequisite'] = tiny_base
        driver.validate_candidate_bindings(git_fixture, tiny_bindings)
        for name, relative, expected in [
            ('fault-unrelated-path', 'unrelated.txt', 'fault changed unrelated path'),
            ('fault-original-blob', survey.SELECTED['reference'], 'fault did not restore original blob'),
        ]:
            git('checkout', '--quiet', '--detach', tiny_bindings['bindings']['reference']['commit'])
            (git_fixture / relative).write_text('injected wrong content\n')
            altered = copy.deepcopy(tiny_bindings)
            revision = commit(name)
            tree = git('rev-parse', revision + '^{tree}')
            altered['bindings']['reference-fault'] = {'commit': revision, 'tree': tree,
                'identity': {'selection': {'kind': 'committed', 'revision': revision, 'tree': tree}}}
            reject(name, expected, lambda: driver.validate_candidate_bindings(git_fixture, altered))
        driver.validate_candidate_bindings(git_fixture, tiny_bindings)
        driver.CONFIG['faultPrerequisite'] = original_prerequisite
        original_config = copy.deepcopy(driver.CONFIG)
        tiny_zip = scratch / 'tiny.zip'
        with zipfile.ZipFile(tiny_zip, 'w') as packed:
            packed.writestr('successor.tgz', b'synthetic archive bytes; not executed')
        driver.CONFIG = copy.deepcopy(original_config)
        driver.CONFIG['artifact'].update(bytes=tiny_zip.stat().st_size, zipSha256=driver.sha(tiny_zip.read_bytes()))
        driver.CONFIG['successorArchiveSha256'] = driver.sha(b'synthetic archive bytes; not executed')
        driver.extract_successor(tiny_zip, scratch / 'clean-package')
        for name, change, expected in [
            ('zip-size', lambda c: c['artifact'].update(bytes=1), 'artifact ZIP size'),
            ('zip-digest', lambda c: c['artifact'].update(zipSha256='0' * 64), 'artifact ZIP digest'),
            ('zip-member', lambda c: c.update(artifactMember='absent'), 'successor member absent'),
            ('package-digest', lambda c: c.update(successorArchiveSha256='0' * 64), 'successor package digest'),
        ]:
            pristine = copy.deepcopy(driver.CONFIG)
            change(driver.CONFIG)
            reject(name, expected, lambda: driver.extract_successor(tiny_zip, scratch / name))
            driver.CONFIG = pristine
        duplicate_zip = scratch / 'duplicate.zip'
        with zipfile.ZipFile(duplicate_zip, 'w') as packed:
            packed.writestr('successor.tgz', b'first')
            packed.writestr('successor.tgz', b'second')
        driver.CONFIG['artifact'].update(bytes=duplicate_zip.stat().st_size,
                                         zipSha256=driver.sha(duplicate_zip.read_bytes()))
        reject('duplicate-package-member', 'successor member absent or ambiguous',
               lambda: driver.extract_successor(duplicate_zip, scratch / 'duplicate-package'))
        driver.CONFIG = original_config
        driver.validate_helpers()
        pristine_root = driver.ROOT
        altered_root = scratch / 'altered-proof'
        shutil.copytree(ROOT, altered_root)
        driver.ROOT = altered_root
        for relative in ['compare-surveys.py', 'guards/survey-guard.py']:
            path = altered_root / relative
            original = path.read_bytes()
            path.write_bytes(original + b'\n')
            reject('altered-' + relative, 'digest' if relative.endswith('compare-surveys.py') else 'guard byte length', driver.validate_helpers)
            path.write_bytes(original)
        guard_path = altered_root / 'guards/survey-guard.py'
        original_guard = guard_path.read_bytes()
        guard_path.write_bytes(b'#' + original_guard[1:])
        reject('same-length-guard-drift', 'guard byte digest', driver.validate_helpers)
        guard_path.write_bytes(original_guard)
        driver.ROOT = pristine_root
        driver.validate_helpers()
        output = scratch / 'guarded'
        output.mkdir()
        (output / 'stale.stdout').write_bytes(b'existing')
        reject('stale-output', 'stale survey output', lambda: driver.run_survey(output, 'stale', ['unused'], consumer))
        # Actual retained 4GiB guard with tiny children only; never an evaluator or heavy test.
        reject('guard-child-exit7', 'survey guard process failed',
               lambda: driver.run_survey(output, 'exit7', ['python3', '-c', 'raise SystemExit(7)'], consumer))
        survey.equal(survey.read_json(output / 'exit7.receipt.json')['exitCode'], 7,
                     'tiny exit7 must actually launch; pre-launch resource refusal is not this proof')
        reject('guard-exit-report-mismatch', 'guard child exit',
               lambda: driver.run_survey(output, 'exit1', ['python3', '-c', 'print(\'{"allowed":true}\');raise SystemExit(1)'], consumer))
        reject('non-json-guard-output', 'Expecting value',
               lambda: driver.run_survey(output, 'nonjson', ['python3', '-c', 'print("not JSON")'], consumer))
        reject('non-boolean-allowed', 'report allowed must be boolean',
               lambda: driver.run_survey(output, 'badallowed', ['python3', '-c', 'print(\'{"allowed":1}\')'], consumer))
        driver.run_survey(output, 'tiny-clean', ['python3', '-c', 'print(\'{"allowed":true}\')'], consumer)
        package = consumer / 'node_modules/twilight-burokrat'
        toolkit = package / 'dist/toolkit'
        toolkit.mkdir(parents=True)
        (toolkit / 'validator.mjs').write_bytes(b'// tiny identity fixture, never executed\n')
        descriptor = {'sourceRevision': driver.CONFIG['finalSourceRevision'], 'bunVersion': '1.4.2',
                      'roles': {'validator.mjs': driver.sha((toolkit / 'validator.mjs').read_bytes())}}
        write(toolkit / 'toolkit.json', descriptor)
        manifest = {'sourceRevision': driver.CONFIG['finalSourceRevision'],
                    'toolkitIdentity': driver.sha((toolkit / 'toolkit.json').read_bytes())}
        write(package / 'dist/package-manifest.json', manifest)
        observed = {'manifest': manifest, 'descriptor': descriptor,
                    'descriptorSha256': manifest['toolkitIdentity'],
                    'validatorSha256': descriptor['roles']['validator.mjs'],
                    'executableSha256': driver.sha(executable.read_bytes()), 'bunVersion': '1.4.2'}
        driver.support.OUT = output
        driver.snapshot(output, 'tiny-identity-clean', consumer, observed)
        expected_drift = copy.deepcopy(observed)
        expected_drift['executableSha256'] = 'a' * 64
        reject('fixed-hosted-identity-drift', 'installed identity differs from proven hosted archive',
               lambda: driver.snapshot(output, 'tiny-identity-fault', consumer, expected_drift))
        driver.snapshot(output, 'tiny-identity-restored', consumer, observed)
        for path in output.iterdir():
            shutil.copyfile(path, evidence / path.name)
        restore()
        check()
    write(evidence / 'summary.json', {
        'scope': 'Actual adapter and new driver paths on tiny local fixtures; projected F7 fixtures are not observed standalone outputs. No evaluator, build, hosted or heavy test run.',
        'driverSha256': hashlib.sha256((ROOT / 'run-hosted.py').read_bytes()).hexdigest(),
        'adapterSha256': hashlib.sha256((ROOT / 'acceptance.py').read_bytes()).hexdigest(),
        'negativeCount': len(observations), 'allNamedFailuresObserved': True,
        'restoredAdapterPassed': True, 'observations': observations,
        'notRun': ['RSS/timeout kill', 'network errors', 'actual hosted imports/install/reports'],
    })
    print(json.dumps({'negativeCount': len(observations), 'restoredAdapterPassed': True}))


if __name__ == '__main__':
    main(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]))
