#!/usr/bin/env python3
"""Compare retained, noncertifying all-rule surveys from one installed successor."""
import argparse
import difflib
import hashlib
import json
from pathlib import Path
import re
import sys

LABELS = ('base', 'reference', 'reference-fault', 'estimate', 'estimate-fault')
RULES = ['F1', 'F7', 'INV-CLASSIFY', 'K2', 'K3', 'K4', 'K5', 'K6',
         'MOD-DIRECT-ENTRIES', 'MOD-INDEX', 'MOD-LAYOUT', 'PERF-THRESHOLD',
         'REL-EXTRACT', 'SPEC-SCENARIOS']
SELECTED = {
    'reference': 'apps/wbs/fe-01/src/components/wbs/reference-set-field.tsx',
    'estimate': 'apps/wbs/fe-01/src/components/wbs/plan-columns/estimates.tsx',
}
ENVELOPE = {'schemaVersion', 'candidate', 'policy', 'allowed', 'ruleIds',
            'findings', 'unevaluated', 'certifies'}
SNAPSHOT = {'manifest', 'executableSha256', 'descriptor', 'descriptorSha256',
            'validatorSha256', 'bunVersion'}


class Refusal(Exception):
    pass


def require(condition, message):
    if not condition:
        raise Refusal(message)


def equal(actual, expected, label):
    if actual != expected:
        before = json.dumps(expected, indent=2, sort_keys=True).splitlines()
        after = json.dumps(actual, indent=2, sort_keys=True).splitlines()
        difference = '\n'.join(difflib.unified_diff(
            before, after, fromfile='expected', tofile='observed', lineterm=''))
        raise Refusal(f'{label}\n{difference}')


def unique_object(pairs):
    record = {}
    for key, value in pairs:
        require(key not in record, f'duplicate JSON key: {key}')
        record[key] = value
    return record


def refuse_constant(value):
    raise Refusal(f'nonfinite JSON constant: {value}')


def read_json(path):
    return json.loads(Path(path).read_text(), object_pairs_hook=unique_object,
                      parse_constant=refuse_constant)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def text(value):
    return isinstance(value, str) and bool(value.strip())


def sha256(value):
    return isinstance(value, str) and re.fullmatch('[0-9a-f]{64}', value) is not None


def resolved(path, cwd):
    return (Path(cwd) / path).resolve(strict=True)


def validate_snapshot(snapshot, label):
    require(isinstance(snapshot, dict), f'{label}: snapshot must be an object')
    equal(sorted(snapshot), sorted(SNAPSHOT), f'{label}: snapshot fields')
    for key in ('executableSha256', 'descriptorSha256', 'validatorSha256'):
        require(sha256(snapshot[key]), f'{label}: malformed {key}')
    require(text(snapshot['bunVersion']), f'{label}: absent observed Bun version')
    manifest, descriptor = snapshot['manifest'], snapshot['descriptor']
    require(isinstance(manifest, dict) and isinstance(descriptor, dict),
            f'{label}: manifest and descriptor must be objects')
    equal(manifest['toolkitIdentity'], snapshot['descriptorSha256'],
          f'{label}: package manifest does not bind raw descriptor bytes')
    equal(manifest['sourceRevision'], descriptor['sourceRevision'],
          f'{label}: manifest/descriptor source revision')
    equal(snapshot['validatorSha256'], descriptor['roles']['validator.mjs'],
          f'{label}: observed validator bytes differ from descriptor')
    equal(snapshot['bunVersion'], descriptor['bunVersion'],
          f'{label}: observed Bun differs from toolkit build runtime')


def validate_report(report, binding, policy, label):
    require(isinstance(report, dict), f'{label}: report must be an object')
    require(set(report) in (ENVELOPE, ENVELOPE | {'scenarios'}),
            f'{label}: unexpected report fields: {sorted(report)}')
    require(type(report['schemaVersion']) is int and report['schemaVersion'] == 1,
            f'{label}: schemaVersion must be integer 1')
    equal(report['candidate'], binding['identity']['candidate'], f'{label}: candidate identity')
    equal(report['policy'], policy['policyId'], f'{label}: policy identity')
    equal(report['ruleIds'], RULES, f'{label}: incomplete or changed rule selection')
    require(report['certifies'] is False, f'{label}: unexpected certification')
    require(isinstance(report['findings'], list) and isinstance(report['unevaluated'], list),
            f'{label}: findings and unevaluated must be explicit arrays')
    for finding in report['findings']:
        require(isinstance(finding, dict), f'{label}: finding must be an object')
        require(set(finding) in ({'ruleId', 'path', 'message', 'effect'},
                                {'ruleId', 'path', 'message', 'effect', 'subject'}),
                f'{label}: unexpected finding fields: {finding}')
        require(finding['ruleId'] in RULES and text(finding['path']) and text(finding['message']),
                f'{label}: malformed finding: {finding}')
        require('subject' not in finding or text(finding['subject']),
                f'{label}: malformed subject: {finding}')
        require(finding['effect'] == 'debt', f'{label}: non-debt finding under all-observe policy')
    unjudged = []
    for entry in report['unevaluated']:
        require(isinstance(entry, dict) and set(entry) == {'ruleId', 'reason'},
                f'{label}: malformed unevaluated entry: {entry}')
        require(entry['ruleId'] in RULES and text(entry['reason']),
                f'{label}: invalid unevaluated rule/reason: {entry}')
        unjudged.append(entry['ruleId'])
    require(len(set(unjudged)) == len(unjudged), f'{label}: duplicate unevaluated rule')
    require(not set(unjudged).intersection(f['ruleId'] for f in report['findings']),
            f'{label}: rule has findings and is also unevaluated')
    require(type(report['allowed']) is bool, f'{label}: allowed must be boolean')
    equal(report['allowed'], not unjudged, f'{label}: allowed disagrees with outcomes')
    if 'scenarios' in report:
        require(isinstance(report['scenarios'], dict), f'{label}: scenarios must be an object')
        require('SPEC-SCENARIOS' not in unjudged,
                f'{label}: scenarios report accompanies unevaluated SPEC-SCENARIOS')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('bindings', 'policy', 'executable', 'package-manifest', 'toolkit-descriptor'):
        parser.add_argument('--' + name, required=True, type=Path)
    parser.add_argument('--run', nargs=5, action='append', required=True,
                        metavar=('LABEL', 'REPORT', 'RECEIPT', 'BEFORE', 'AFTER'))
    args = parser.parse_args()
    equal(sorted(run[0] for run in args.run), sorted(LABELS), 'exactly five named runs required')
    snapshots = [Path(path).resolve(strict=True) for run in args.run for path in run[3:]]
    require(len(set(snapshots)) == 10, 'ten distinct before/after snapshot files required')
    bindings, policy = read_json(args.bindings), read_json(args.policy)
    equal(digest(args.policy), bindings['policySha256'], 'policy byte digest')
    equal(policy['policyId'], 'wbs.plan-export.recovery.full.v1', 'policy ID')
    equal(policy['ruleModes'], [{'ruleId': rule, 'mode': 'observe'} for rule in RULES],
          'policy must retain all fourteen observe modes')
    manifest, descriptor = read_json(args.package_manifest), read_json(args.toolkit_descriptor)
    installed = {'manifest': manifest, 'executableSha256': digest(args.executable),
                 'descriptor': descriptor, 'descriptorSha256': digest(args.toolkit_descriptor),
                 'validatorSha256': digest(args.toolkit_descriptor.parent / 'validator.mjs')}
    for role, expected in descriptor['roles'].items():
        require(Path(role).name == role, f'unsupported toolkit role path: {role}')
        equal(digest(args.toolkit_descriptor.parent / role), expected,
              f'installed toolkit role {role} digest')
    reports, summaries = {}, {}
    anchor = None
    common_repository = None
    for label, report_path, receipt_path, before_path, after_path in args.run:
        binding = bindings['bindings'][label]
        equal(binding['identity']['selection'],
              {'kind': 'committed', 'revision': binding['commit'], 'tree': binding['tree']},
              f'{label}: inconsistent trusted binding')
        for phase, snapshot_path in [('before', before_path), ('after', after_path)]:
            snapshot = read_json(snapshot_path)
            validate_snapshot(snapshot, f'{label}/{phase}')
            if anchor is None:
                anchor = snapshot
            equal(snapshot, anchor, f'{label}/{phase}: evaluator or runtime identity changed')
            equal({key: snapshot[key] for key in installed}, installed,
                  f'{label}/{phase}: retained identity differs from installed bytes')
        receipt = read_json(receipt_path)
        require(receipt['stopReason'] is None, f'{label}: resource guard stopped invocation')
        equal(receipt['ceilingKiB'], 4 * 1024 * 1024, f'{label}: guard ceiling')
        equal(receipt['timeoutSeconds'], 900, f'{label}: guard deadline')
        equal(receipt['minimumAvailableKiB'], 12 * 1024 * 1024, f'{label}: guard memory floor')
        for field in ('peakProcessTreeKiB', 'availableBeforeKiB'):
            require(type(receipt[field]) is int and receipt[field] > 0,
                    f'{label}: invalid {field}')
        require(receipt['peakProcessTreeKiB'] <= receipt['ceilingKiB'] and
                receipt['availableBeforeKiB'] >= receipt['minimumAvailableKiB'],
                f'{label}: guard resource limits violated')
        require(type(receipt['seconds']) in (int, float) and 0 <= receipt['seconds'] <= 901,
                f'{label}: invalid or exceeded duration')
        command = receipt['command']
        require(isinstance(command, list) and len(command) == 6 and all(text(x) for x in command),
                f'{label}: expected direct installed executable plus five check arguments; got {command}')
        equal(resolved(command[0], receipt['cwd']).as_posix(), args.executable.resolve(strict=True).as_posix(),
              f'{label}: executable path')
        equal(command[1:3], ['check', 'committed'], f'{label}: invocation mode')
        equal(command[4], binding['commit'], f'{label}: invocation revision')
        equal(resolved(command[5], receipt['cwd']).as_posix(), args.policy.resolve(strict=True).as_posix(),
              f'{label}: invocation policy path')
        repository = resolved(command[3], receipt['cwd']).as_posix()
        if common_repository is None:
            common_repository = repository
        equal(repository, common_repository, f'{label}: repository path changed')
        require(str(receipt_path).endswith('.receipt.json'), f'{label}: unsupported guard receipt filename')
        prefix = str(receipt_path)[:-len('.receipt.json')]
        require(Path(report_path).read_bytes() == Path(prefix + '.stdout').read_bytes(),
                f'{label}: report {report_path} differs from guard stdout {prefix}.stdout')
        Path(prefix + '.stderr').read_bytes()  # Required retained, readable stderr; it may be empty.
        report = read_json(report_path)
        validate_report(report, binding, policy, label)
        require(type(receipt['exitCode']) is int, f'{label}: malformed exit code')
        equal(receipt['exitCode'], 0 if report['allowed'] else 1, f'{label}: CLI status disagrees with report')
        reports[label] = report
        summaries[label] = {'candidate': report['candidate'], 'findings': len(report['findings']),
                            'byRule': {rule: sum(f['ruleId'] == rule for f in report['findings']) for rule in RULES},
                            'reportSha256': digest(report_path), 'receiptSha256': digest(receipt_path)}
    baseline = reports['base']
    for label, report in reports.items():
        equal(report['unevaluated'], baseline['unevaluated'], f'{label}: unevaluated outcomes changed')
        equal(report['allowed'], baseline['allowed'], f'{label}: allowed changed')
        equal({k: report[k] for k in ('scenarios',) if k in report},
              {k: baseline[k] for k in ('scenarios',) if k in baseline},
              f'{label}: unexplained optional scenarios mismatch; inspect before changing oracle')
    for label, path in SELECTED.items():
        selected = [f for f in baseline['findings'] if f['ruleId'] == 'F7' and f['path'] == path]
        require(len(selected) == 1, f'base: expected exactly one F7 finding at {path}; observed {selected}')
        expected = [f for f in baseline['findings'] if not (f['ruleId'] == 'F7' and f['path'] == path)]
        equal(reports[label]['findings'], expected,
              f'{label}: findings must remove only the selected F7 record')
        equal(reports[label + '-fault']['findings'], baseline['findings'],
              f'{label}-fault: must restore exact baseline F7 record with no unrelated changes')
    print(json.dumps({'comparison': 'passed', 'certifies': False, 'rules': RULES,
                      'unevaluated': baseline['unevaluated'], 'allowed': baseline['allowed'],
                      'installedIdentity': anchor, 'runs': summaries}, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (Refusal, OSError, ValueError, KeyError, TypeError) as error:
        print(f'SURVEY COMPARISON REFUSED: {error}', file=sys.stderr)
        sys.exit(1)
