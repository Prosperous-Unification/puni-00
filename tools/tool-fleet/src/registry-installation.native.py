import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time


def hash_file(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def run_command(command, *, cwd=None, env=None, timeout=30):
    child = subprocess.Popen(command, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    try:
        stdout, stderr = child.communicate(timeout=timeout)
    except subprocess.TimeoutExpired as cause:
        os.killpg(child.pid, signal.SIGKILL)
        child.communicate(timeout=10)
        raise RuntimeError('Installer child exceeded its deadline') from cause
    if len(stdout) > 8 * 1024 ** 2 or len(stderr) > 8 * 1024 ** 2:
        raise RuntimeError('Installer observation exceeded read bounds')
    return child.returncode, stdout, stderr


def run_worker():
    scope = Path('/mnt')
    enrollment = json.loads((scope / 'case.json').read_text())
    if os.geteuid() != 0 or os.readlink('/proc/self/ns/user') == enrollment['parentUserNamespace']:
        raise RuntimeError('Installer rehearsal did not enter its private root user namespace')
    if not any(parts[4] == '/' and 'ro' in parts[5].split(',') for line in Path('/proc/self/mountinfo').read_text().splitlines() for parts in [line.split()]):
        raise RuntimeError('Installer rehearsal root is not read-only')
    for directory in ['/usr/local/libexec/puni-registry-authority', '/usr/local/sbin', '/etc/puni', '/etc/systemd/system', '/root', '/run']:
        Path(directory).mkdir(parents=True, exist_ok=True)
    Path('/etc/passwd').write_text('root:x:0:0:root:/root:/bin/sh\n')
    Path('/etc/group').write_text('root:x:0:\n')
    active = Path('/usr/local/libexec/puni-registry-authority')
    shutil.copyfile(enrollment['bun'], active / 'bun')
    (active / 'bun').chmod(0o755)
    (active / 'authority.js').write_text('console.log("previous-authority-ready");\n')
    (active / 'authority.js').chmod(0o644)
    configuration = Path('/etc/puni/registry-maintenance.json')
    configuration.write_text('{"previous":true}\n')
    configuration.chmod(0o644)
    maintenance = enrollment['case'].startswith('maintenance-')
    if maintenance:
        shutil.copyfile(enrollment['bundle'], active / 'authority.js')
        configuration.write_text(json.dumps(enrollment['configuration'], indent=4, sort_keys=True))
    previous_command = [str(active / 'bun'), str(active / 'authority.js')]
    expected_previous = b'previous-authority-ready\n'
    if maintenance:
        previous_command += ['--validate-installation', str(configuration)]
        expected_previous = b'verified\n'
    before = {str(path): hash_file(path) for path in [active / 'bun', active / 'authority.js', configuration]}
    previous = run_command(previous_command)
    if previous[0] != 0 or previous[1] != expected_previous:
        raise RuntimeError('Prior fixture authority is not usable')
    variables = {
        'puni_registry_authority_enrolled': True,
        'puni_registry_authority_bun_source': enrollment['bun'],
        'puni_registry_authority_bundle_source': enrollment['bundle'],
        'puni_registry_authority_bun_sha256': hash_file(enrollment['bun']),
        'puni_registry_authority_bundle_sha256': hash_file(enrollment['bundle']),
    }
    if enrollment['case'] == 'wrong-bundle':
        variables['puni_registry_authority_bundle_sha256'] = '0' * 64
    if maintenance:
        variables.update({
            'puni_registry_maintenance_enrolled': True,
            'puni_registry_storage_uid': 59001,
            'puni_registry_maintenance_distribution_source': enrollment['bundle'],
            'puni_registry_maintenance_artifacts': {name: {'source': enrollment['bundle'], 'sha256': 'a' * 64} for name in ['activate', 'backup', 'backup-worker', 'host', 'recover', 'retire', 'status']},
        })
    if enrollment['case'] != 'missing':
        variables['puni_registry_maintenance_configuration'] = {'schemaVersion': 1} if enrollment['case'] == 'malformed' else enrollment['configuration']
    if enrollment['case'] == 'maintenance-malformed':
        variables['puni_registry_maintenance_configuration'] = json.loads(json.dumps(enrollment['configuration']))
        variables['puni_registry_maintenance_configuration']['registryId'] = ''
    if enrollment['fault'] != 'none' or enrollment['omitCheck']:
        import yaml
        copied_role = scope / 'role'
        shutil.copytree(enrollment['role'], copied_role)
        if maintenance:
            path = copied_role / 'tasks/installed-authority.yml'
            declared = yaml.safe_load(path.read_text())
            guard = next(task['ansible.builtin.assert']['that'] for task in declared if task['name'] == 'Refuse differing authority configuration before staging maintenance')
            selected = [line for line in guard if '.stat.checksum' in line]
            if len(selected) != 1:
                raise RuntimeError('Installed configuration predicate mutation is not unique')
            guard.remove(selected[0])
            path.write_text(yaml.safe_dump(declared, sort_keys=False))
        else:
            path = copied_role / 'tasks/authority.yml'
            declared = yaml.safe_load(path.read_text())
            block = next(task['block'] for task in declared if task['name'] == 'Validate candidate before replacing working authority')
            if enrollment['fault'].startswith('stage-'):
                field = enrollment['fault'].removeprefix('stage-')
                values = {'isreg': False, 'uid': 42, 'gid': 42, 'nlink': 2, 'mode': '0777', 'checksum': 'a' * 64}
                changed = json.dumps({field: values[field]})
                expression = "{{ registry_authority_candidate_artifacts | combine({'results': [registry_authority_candidate_artifacts.results[0] | combine({'stat': registry_authority_candidate_artifacts.results[0].stat | combine(" + changed + ")}), registry_authority_candidate_artifacts.results[1]]}) }}"
                measure = next(index for index, task in enumerate(block) if task['name'] == 'Measure authority candidate artifacts before executing them')
                block.insert(measure + 1, {'name': 'Inject candidate stat dependency fault', 'ansible.builtin.set_fact': {'registry_authority_candidate_artifacts': expression}})
                if enrollment['omitCheck']:
                    guard = next(task['ansible.builtin.assert']['that'] for task in block if task['name'] == 'Refuse untrusted authority candidate artifacts')
                    selected = [line for line in guard if '.stat.' + field in line]
                    if len(selected) != 1:
                        raise RuntimeError('Candidate predicate mutation is not unique')
                    guard.remove(selected[0])
            elif enrollment['fault'] == 'acknowledgement':
                validated = next(index for index, task in enumerate(block) if task['name'] == 'Validate candidate enrollment with its verified authority')
                block.insert(validated + 1, {'name': 'Inject candidate validation acknowledgement fault', 'ansible.builtin.set_fact': {'registry_authority_validation': {'stdout': 'wrong'}}})
                if enrollment['omitCheck']:
                    block[:] = [task for task in block if task['name'] != 'Require candidate authority validation acknowledgement']
            elif enrollment['omitCheck'] and enrollment['case'] == 'wrong-bundle':
                declared[:] = [task for task in declared if task['name'] != 'Refuse mismatched controller artifacts before host writes']
            elif enrollment['omitCheck'] and enrollment['case'] == 'malformed':
                block[:] = [task for task in block if task['name'] not in ['Validate candidate enrollment with its verified authority', 'Require candidate authority validation acknowledgement']]
            else:
                raise RuntimeError('Unsupported installer fault/removal pair')
            path.write_text(yaml.safe_dump(declared, sort_keys=False))
        enrollment['role'] = str(copied_role)
    tasks = [{'name': 'Install candidate through real role', 'ansible.builtin.include_role': {'name': enrollment['role'], 'tasks_from': 'authority'}}]
    if maintenance:
        import yaml
        source = Path(enrollment['role']) / 'tasks/maintenance.yml'
        declared = yaml.safe_load(source.read_text())
        tasks = [next(task for task in declared if task['name'] == 'Require explicit reviewed maintenance enrollment')]
        preflight = Path(enrollment['role']) / 'tasks/installed-authority.yml'
        if preflight.exists():
            tasks.append({'name': 'Exercise actual maintenance authority preflight', 'ansible.builtin.include_role': {'name': enrollment['role'], 'tasks_from': 'installed-authority'}})
        else:
            tasks.extend(task for task in declared if task['name'] in ['Measure existing pinned authority runtime', 'Refuse unverified authority runtime', 'Install fixed nonsecret maintenance enrollment'])
    play = [{'name': 'Exercise actual registry authority installer', 'hosts': 'localhost', 'gather_facts': False, 'vars': variables,
             'tasks': tasks}]
    (scope / 'play.json').write_text(json.dumps(play))
    (scope / 'inventory').write_text('localhost ansible_connection=local ansible_python_interpreter=' + sys.executable + '\n')
    environment = {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'TMPDIR': '/mnt/scratch', 'ANSIBLE_LOCAL_TEMP': '/mnt/local', 'ANSIBLE_REMOTE_TEMP': '/mnt/remote', 'ANSIBLE_CONFIG': '/mnt/ansible.cfg', 'ANSIBLE_NOCOLOR': '1'}
    (scope / 'scratch').mkdir()
    (scope / 'ansible.cfg').write_text('[defaults]\nretry_files_enabled = False\ninterpreter_python = ' + sys.executable + '\n')
    code, stdout, stderr = run_command([enrollment['ansible'], '-i', '/mnt/inventory', '/mnt/play.json'], cwd=scope, env=environment, timeout=90)
    (scope / 'ansible.stdout.log').write_bytes(stdout)
    (scope / 'ansible.stderr.log').write_bytes(stderr)
    failed_tasks = []
    current_task = ''
    for line in stdout.decode().splitlines():
        if line.startswith('TASK ['):
            current_task = line
        if 'FAILED!' in line or line.startswith('failed: ['):
            failed_tasks.append(current_task)
    after = {path: hash_file(path) for path in before}
    validation = run_command(previous_command) if code else None
    observation = {'failedTasks': failed_tasks, 'ansibleExitCode': code, 'before': before, 'after': after, 'previousStillUsable': validation is not None and validation[0] == 0 and validation[1] == expected_previous,
                   'installedBundleMatches': hash_file(active / 'authority.js') == hash_file(enrollment['bundle']),
                   'configurationMatches': json.loads(configuration.read_text()) == enrollment['configuration'],
                   'stagingDirectories': [path.name for path in active.glob('.stage-*')], 'namespaceRoot': os.geteuid(), 'userNamespace': os.readlink('/proc/self/ns/user'), 'rootReadOnly': True}
    (scope / 'observation.json').write_text(json.dumps(observation, indent=2) + '\n')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', required=True, type=Path)
    parser.add_argument('--python', type=Path, default=Path(sys.executable))
    parser.add_argument('--ansible-playbook', required=True, type=Path)
    parser.add_argument('--bun', required=True, type=Path)
    parser.add_argument('--bundle', required=True, type=Path)
    parser.add_argument('--enrollment', dest='configuration', required=True, type=Path)
    parser.add_argument('--case', required=True, choices=['missing', 'malformed', 'valid', 'wrong-runtime', 'maintenance-malformed', 'maintenance-valid', 'wrong-bundle'])
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--fault', default='none', choices=['none', 'stage-isreg', 'stage-uid', 'stage-gid', 'stage-nlink', 'stage-mode', 'stage-checksum', 'acknowledgement'])
    parser.add_argument('--omit-check', action='store_true')
    options = parser.parse_args()
    if os.geteuid() == 0:
        raise RuntimeError('Run the rehearsal as an ordinary user; root is private to its namespace')
    for path in [options.root, options.ansible_playbook, options.bun, options.bundle, options.configuration]:
        if not path.is_absolute() or path.resolve() != path or not path.exists():
            raise RuntimeError('Rehearsal input must be an existing canonical absolute path: ' + str(path))
    if not options.python.is_absolute() or not options.python.is_file():
        raise RuntimeError('Required Ansible Python interpreter unavailable')
    if options.case.startswith('maintenance-') and (options.fault != 'none' or options.omit_check and options.case != 'maintenance-malformed'):
        raise RuntimeError('Candidate fault injection applies only to authority cases')
    if options.omit_check and options.fault == 'none' and options.case not in ['malformed', 'maintenance-malformed', 'wrong-bundle']:
        raise RuntimeError('A check removal requires a candidate fault or malformed enrollment')
    for path, maximum in [(options.bun, 128 * 1024 ** 2), (options.bundle, 16 * 1024 ** 2), (options.configuration, 65536)]:
        if not path.is_file() or path.stat().st_size > maximum:
            raise RuntimeError('Installer fixture input exceeds its regular-file envelope')
    source_inputs = [Path(__file__).resolve(), options.bun, options.bundle, options.configuration, options.root / 'infra/ansible/roles/registry_storage/tasks/authority.yml', options.root / 'infra/ansible/roles/registry_storage/tasks/maintenance.yml']
    installed_preflight = options.root / 'infra/ansible/roles/registry_storage/tasks/installed-authority.yml'
    if installed_preflight.exists():
        source_inputs.append(installed_preflight)
    source_pins = {str(path): hash_file(path) for path in source_inputs}
    bwrap = shutil.which('bwrap')
    if bwrap is None:
        raise RuntimeError('Required bubblewrap executable unavailable')
    if shutil.disk_usage(options.output.parent).free < 1024 ** 3:
        raise RuntimeError('Installer rehearsal requires 1GiB free scratch admission')
    options.output.mkdir(mode=0o700)
    enrollment = {'fault': options.fault, 'omitCheck': options.omit_check, 'case': options.case, 'bun': str(options.bun), 'bundle': str(options.bundle), 'ansible': str(options.ansible_playbook), 'configuration': json.loads(options.configuration.read_text()), 'role': str(options.root / 'infra/ansible/roles/registry_storage'), 'parentUserNamespace': os.readlink('/proc/self/ns/user')}
    (options.output / 'case.json').write_text(json.dumps(enrollment))
    script = Path(__file__).resolve()
    command = [bwrap, '--die-with-parent', '--new-session', '--unshare-user', '--uid', '0', '--gid', '0', '--unshare-net', '--unshare-pid', '--ro-bind', '/', '/', '--proc', '/proc', '--dev', '/dev', '--size', str(512 * 1024 ** 2), '--tmpfs', '/usr/local', '--size', str(16 * 1024 ** 2), '--tmpfs', '/etc', '--size', str(4 * 1024 ** 2), '--tmpfs', '/run', '--size', str(4 * 1024 ** 2), '--tmpfs', '/root', '--bind', str(options.output), '/mnt', str(options.python), str(script), '--worker']
    started = time.monotonic()
    code, stdout, stderr = run_command(command, cwd=options.root, env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'}, timeout=120)
    (options.output / 'namespace.stdout.log').write_bytes(stdout)
    (options.output / 'namespace.stderr.log').write_bytes(stderr)
    if code != 0:
        raise RuntimeError('Isolated installer harness failed: ' + stderr.decode())
    if any(hash_file(path) != digest for path, digest in source_pins.items()):
        raise RuntimeError('Installer rehearsal sources changed during execution')
    observed = json.loads((options.output / 'observation.json').read_text())
    passed = observed['ansibleExitCode'] == 0 and observed['installedBundleMatches'] and observed['configurationMatches'] if options.case in ['valid', 'maintenance-valid'] and options.fault == 'none' else observed['ansibleExitCode'] != 0 and observed['before'] == observed['after'] and observed['previousStillUsable']
    passed = passed and not observed['stagingDirectories']
    expected_failure = 'Refuse untrusted authority candidate artifacts' if options.fault.startswith('stage-') else 'Require candidate authority validation acknowledgement' if options.fault == 'acknowledgement' else 'Refuse mismatched controller artifacts before host writes' if options.case == 'wrong-bundle' else 'Require explicit authority artifact enrollment' if options.case in ['missing', 'wrong-runtime'] else 'Validate candidate enrollment with its verified authority' if options.case == 'malformed' else 'Refuse differing authority configuration before staging maintenance' if options.case == 'maintenance-malformed' else None
    if expected_failure is not None:
        passed = passed and any(expected_failure in task for task in observed['failedTasks'])
    receipt = {'passed': passed, 'case': options.case, 'fault': options.fault, 'omitCheck': options.omit_check, 'elapsedSeconds': time.monotonic() - started, 'observation': observed, 'inputs': source_pins, 'copiedRoleSha256': hash_file(options.output / 'role/tasks/authority.yml') if (options.output / 'role/tasks/authority.yml').exists() else None, 'limits': 'Actual authority role or maintenance configuration preflight component (not all maintenance prerequisites), root-owned namespace files and candidate parser; prior fixture command is synthetic. No live journal/pressure service/registry or actual root privilege is activated.'}
    (options.output / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps({'case': options.case, 'passed': passed, 'ansibleExitCode': observed['ansibleExitCode'], 'previousStillUsable': observed['previousStillUsable'], 'elapsedSeconds': receipt['elapsedSeconds']}), flush=True)
    if not passed:
        raise RuntimeError('Authority installer did not preserve its configuration-before-activation contract')


if __name__ == '__main__':
    if sys.argv[1:] == ['--worker']:
        run_worker()
    else:
        main()
