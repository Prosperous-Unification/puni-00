import datetime
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import time

workspace = Path('/tmp/puni-wbs120-yaml-closure-sol-20261016')
evidence = workspace / 'openspec/changes/wbs120-yaml-trusted-declarations/evidence'
record_path = evidence / 'installed-proof.json'
source_path = workspace / 'apps/twilight-structure/twilight-burokrat/cli/src/policy/trusted-modules.ts'
expected_sha = 'acb0a68a86848bea0ad00fe5e3a7f3b7eed0ddac'
expected_tree = '8aa11026f2a6d4fd7b84c2a2de996e4e2f013beb'
minimum_available = 12 * 1024 * 1024
maximum_rss = 5 * 1024 * 1024

def git(*arguments):
    return subprocess.check_output(['git', *arguments], cwd=workspace, text=True).strip()

def blob(content):
    return hashlib.sha1(b'blob ' + str(len(content)).encode() + b'\0' + content).hexdigest()

def memory():
    for line in Path('/proc/meminfo').read_text().splitlines():
        if line.startswith('MemAvailable:'):
            return int(line.split()[1])
    raise RuntimeError('MemAvailable unavailable')

def processes(root):
    entries = {}
    for directory in Path('/proc').iterdir():
        if not directory.name.isdigit():
            continue
        try:
            fields = {}
            for line in (directory / 'status').read_text().splitlines():
                if line.startswith(('PPid:', 'VmRSS:')):
                    fields[line.split(':', 1)[0]] = int(line.split()[1])
            entries[int(directory.name)] = fields
        except (FileNotFoundError, ProcessLookupError):
            continue
    selected = {root}
    while True:
        expanded = selected | {pid for pid, fields in entries.items() if fields.get('PPid') in selected}
        if expanded == selected:
            break
        selected = expanded
    return {pid: entries[pid].get('VmRSS', 0) for pid in selected if pid in entries}

record = {
    'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'cwd': str(workspace),
    'sourceSha': git('rev-parse', 'HEAD'),
    'sourceTree': git('rev-parse', 'HEAD^{tree}'),
    'initialStatus': git('status', '--porcelain'),
    'runner': '/tmp/wbs120-yaml-proof-runner.py',
    'limitsKiB': {'minimumMemAvailable': minimum_available, 'maximumProcessRss': maximum_rss},
    'stages': [],
}
if record['sourceSha'] != expected_sha or record['sourceTree'] != expected_tree or record['initialStatus']:
    raise RuntimeError('proof requires the clean exact source successor')
original = source_path.read_bytes()
record['originalProductionBlob'] = blob(original)
needle = b"  'yaml',\n"
if original.count(needle) != 1:
    raise RuntimeError('YAML enrollment must occur exactly once')
fault = original.replace(needle, b'')
record['fault'] = {'change': "Remove exactly the yaml entry from trustedDeclarationRoots", 'productionBlob': blob(fault)}
evidence.mkdir(parents=True, exist_ok=True)
(evidence / 'installed-proof-runner.py').write_bytes(Path(__file__).read_bytes())

def persist():
    record_path.write_text(json.dumps(record, indent=2) + '\n')

def run_stage(name, command, expected_exit):
    stage = {'name': name, 'command': command, 'expectedExit': expected_exit,
             'sourceProductionBlob': blob(source_path.read_bytes()),
             'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
             'minMemAvailableKiB': memory(), 'peakProcessRssKiB': 0,
             'log': name + '.log', 'monitor': name + '-memory.jsonl'}
    record['stages'].append(stage)
    persist()
    if stage['minMemAvailableKiB'] < minimum_available:
        raise RuntimeError('insufficient available memory before ' + name)
    print('Starting ' + name + ': ' + ' '.join(command), flush=True)
    with (evidence / stage['log']).open('w') as output, (evidence / stage['monitor']).open('w') as samples:
        output.write('Command: ' + json.dumps(command) + '\nCWD: ' + str(workspace) + '\nSource HEAD: ' + expected_sha + '\nSource tree: ' + expected_tree + '\nProduction blob: ' + stage['sourceProductionBlob'] + '\n')
        output.flush()
        child = subprocess.Popen(command, cwd=workspace, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
        stage['pid'] = child.pid
        while child.poll() is None:
            available = memory()
            descendants = processes(child.pid)
            largest = max(descendants.values(), default=0)
            stage['minMemAvailableKiB'] = min(stage['minMemAvailableKiB'], available)
            stage['peakProcessRssKiB'] = max(stage['peakProcessRssKiB'], largest)
            samples.write(json.dumps({'at': time.time(), 'memAvailableKiB': available, 'processRssKiB': descendants}) + '\n')
            samples.flush()
            if available < minimum_available or largest > maximum_rss:
                stage['aborted'] = 'memory limit crossed'
                for pid in descendants:
                    try:
                        os.kill(pid, signal.SIGTERM)
                    except ProcessLookupError:
                        pass
                try:
                    os.killpg(child.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
                try:
                    child.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    for pid in descendants:
                        try:
                            os.kill(pid, signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                    os.killpg(child.pid, signal.SIGKILL)
                    child.wait()
                break
            time.sleep(0.2)
        stage['exitCode'] = child.wait()
        stage['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        output.write('\nExit: ' + str(stage['exitCode']) + '\n')
    persist()
    print(name + ': exit ' + str(stage['exitCode']) + ', peak process RSS KiB ' + str(stage['peakProcessRssKiB']) + ', minimum available KiB ' + str(stage['minMemAvailableKiB']), flush=True)
    if 'aborted' in stage or stage['exitCode'] != expected_exit:
        raise RuntimeError('unexpected or aborted outcome: ' + name)

prefix = 'apps/twilight-structure/twilight-burokrat/cli/src/packaging/'
try:
    source_path.write_bytes(fault)
    run_stage('installed-red-build', ['bun', prefix + 'build.ts'], 0)
    run_stage('installed-red-pack', ['bun', prefix + 'pack.ts'], 0)
    run_stage('installed-red', ['bun', 'test', prefix + 'install.test.ts', '--test-name-pattern', 'extracts supported vendor relationships and public declarations outside the checkout'], 1)
    red_output = (evidence / 'installed-red.log').read_text()
    if 'yaml' not in red_output or 'Expected: 0' not in red_output:
        raise RuntimeError('RED did not reach the YAML extraction assertion')
finally:
    source_path.write_bytes(original)
    record['restoredProductionBlob'] = blob(source_path.read_bytes())
    persist()
run_stage('installed-green-build', ['bun', prefix + 'build.ts'], 0)
run_stage('installed-green-pack', ['bun', prefix + 'pack.ts'], 0)
run_stage('installed-green', ['bun', 'test', prefix + 'install.test.ts', '--test-name-pattern', 'extracts supported vendor relationships and public declarations outside the checkout'], 0)
record['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
record['sourceRestored'] = source_path.read_bytes() == original
persist()
print('Focused installed proof complete; original production source restored.', flush=True)
