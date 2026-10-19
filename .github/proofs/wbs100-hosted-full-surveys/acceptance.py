import importlib.util
import sys
from pathlib import Path

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('survey_oracle', ROOT / 'compare-surveys.py')
survey = importlib.util.module_from_spec(spec)
spec.loader.exec_module(survey)


def validate_guard(receipt, command, cwd, expected_exit):
    # Proof: prove-adapter.py changes each receipt binding/resource field and observes refusal.
    survey.equal(receipt['command'], command, 'guard command')
    survey.equal(receipt['cwd'], str(cwd), 'guard cwd')
    survey.require(receipt['stopReason'] is None, 'guard resource termination')
    survey.require(type(receipt['exitCode']) is int, 'guard exit type')
    survey.equal(receipt['exitCode'], expected_exit, 'guard child exit')
    for field, expected in [('ceilingKiB', 4194304), ('timeoutSeconds', 900),
                            ('minimumAvailableKiB', 12582912)]:
        survey.require(type(receipt[field]) is int, 'guard integer field: ' + field)
        survey.equal(receipt[field], expected, 'guard ' + field)
    survey.require(type(receipt['peakProcessTreeKiB']) is int and
                   0 < receipt['peakProcessTreeKiB'] <= 4194304, 'guard peak RSS')
    survey.require(type(receipt['availableBeforeKiB']) is int and
                   receipt['availableBeforeKiB'] >= 12582912, 'guard available memory')
    survey.require(type(receipt['seconds']) in (int, float) and
                   0 <= receipt['seconds'] <= 901, 'guard duration')


def check_f7(directory, bindings, policy, executable, repository, identity):
    reports = {}
    for label in survey.LABELS:
        prefix = directory / ('f7-' + label)
        report = survey.read_json(str(prefix) + '.stdout')
        full = survey.read_json(directory / ('full-' + label + '.stdout'))
        binding = bindings['bindings'][label]
        survey.validate_report(full, binding, policy, 'full/' + label)
        survey.require(isinstance(report, dict) and set(report) == survey.ENVELOPE,
                       label + ': F7 report fields')
        survey.require(type(report['schemaVersion']) is int, label + ': F7 schema type')
        survey.require(type(report['allowed']) is bool and report['certifies'] is False,
                       label + ': F7 boolean/certification fields')
        expected = {
            'schemaVersion': 1, 'candidate': binding['identity']['candidate'],
            'policy': policy['policyId'], 'allowed': True, 'ruleIds': ['F7'],
            'findings': [finding for finding in full['findings'] if finding['ruleId'] == 'F7'],
            'unevaluated': [], 'certifies': False,
        }
        # Proof: actual adapter rejects changed candidate/policy/rules/effect/outcome/fields
        # and every selected/unrelated finding mutation in prove-adapter.py.
        survey.equal(report, expected, label + ': standalone F7 differs from full-survey subset')
        survey.equal(len(report['findings']), 28 if label in survey.SELECTED else 29,
                     label + ': F7 finding count')
        command = [str(executable), 'check', 'committed', str(repository),
                   binding['commit'], str(ROOT / 'inputs/policy.json.txt'), '--rule', 'F7']
        receipt = survey.read_json(str(prefix) + '.receipt.json')
        validate_guard(receipt, command, executable.parent.parent.parent, 0)
        Path(str(prefix) + '.stderr').read_bytes()
        for phase in ('before', 'after'):
            snapshot = survey.read_json(str(prefix) + '.' + phase + '.json')
            survey.validate_snapshot(snapshot, label + '/' + phase)
            # Proof: a real copied snapshot with executable drift is refused by this adapter.
            survey.equal(snapshot, identity, label + ': F7 evaluator identity changed')
        reports[label] = report
    for label, path in survey.SELECTED.items():
        selected = [finding for finding in reports['base']['findings'] if finding['path'] == path]
        survey.require(len(selected) == 1, label + ': missing or duplicate selected F7 finding')
        survey.equal(reports[label]['findings'],
                     [finding for finding in reports['base']['findings'] if finding['path'] != path],
                     label + ': standalone F7 removed unrelated findings')
        survey.equal(reports[label + '-fault']['findings'], reports['base']['findings'],
                     label + ': standalone fault did not restore baseline')
    return {'comparison': 'passed', 'certifies': False, 'reports': reports}
