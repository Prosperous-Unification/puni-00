import json
import os
from pathlib import Path
import re
import subprocess
import sys

root = Path.cwd()
evidence = root / 'openspec/changes/set-step-node-parallelism/evidence/removal-2026-10-17'
guard = 'openspec/changes/set-step-node-parallelism/evidence/resolver-2026-10-17/rss-guard.py'
sqlite = 'libs/wbs/adapters/store-sqlite/src/step.ts'
memory = 'libs/wbs/adapters/store-memory/src/step-fixture.ts'
service = 'libs/wbs/application/core/src/module/step/step.resource.ts'
route = 'libs/wbs/application/core/src/http/step.routes.ts'
sql_test = 'libs/wbs/adapters/store-sqlite/src/step-parallel.db.test.ts'
mem_test = 'libs/wbs/adapters/store-memory/src/step-parallel-fixture.test.ts'
service_test = 'apps/wbs/be-01/src/service/step.service.db.test.ts'
http_test = 'apps/wbs/be-01/src/controller/step.controller.db.test.ts'
faults = []
def add(name, path, before, after, test, pattern):
    faults.append((name, path, before, after, test, pattern))
add('sqlite-guard', sqlite, 'if (parallels.length > 0)', 'if (false)', service_test, 'refuses retained sparse')
add('sqlite-late', sqlite, 'if (parallels.length > 0)', 'if (false)', service_test, 'refuses sparse parallelism inserted')
add('sqlite-cascade', sqlite, 'if (parallels.length > 0)', 'if (!cascade && parallels.length > 0)', service_test, 'refuses retained sparse')
add('sqlite-targetless', sqlite, '.where(inArray(stepParallel.stepId, stepInProject))', '', service_test, 'refuses retained sparse')
add('sqlite-project-scope', sqlite, '.where(inArray(stepParallel.stepId, stepInProject))', '.where(eq(stepParallel.stepId, stepId))', service_test, 'refuses retained sparse')
add('sqlite-inner-join', sqlite, '.leftJoin(workItem, eq(workItem.id, stepParallel.workItemId))', '.innerJoin(workItem, eq(workItem.id, stepParallel.workItemId))', sql_test, 'removal throws on corrupt retained SQLite owner')
add('sqlite-owner', sqlite, 'if (parallel.ownerProject === null)', 'if (false)', sql_test, 'removal throws on corrupt retained SQLite owner')
add('sqlite-project', sqlite, 'if (parallel.ownerProject !== projectId)', 'if (false)', sql_test, 'removal throws on corrupt retained SQLite project')
add('sqlite-leaf', sqlite, 'if (parallel.hasChildren !== 0)', 'if (false)', sql_test, 'removal throws on corrupt retained SQLite leaf')
add('sqlite-range', sqlite, 'assertStepParallel(parallel.maxParallel);', '', sql_test, 'removal throws on corrupt retained SQLite range')
add('sqlite-order', sqlite, '.orderBy(stepParallel.workItemId, stepParallel.stepId)', '.orderBy(sql`${stepParallel.workItemId} DESC`, stepParallel.stepId)', service_test, 'refuses retained sparse')
add('sqlite-copy', sqlite, 'parallels.map(({ workItemId, stepId }) => ({ workItemId, stepId }))', 'parallels', service_test, 'refuses retained sparse')
add('memory-guard', memory, 'if (nodes.length > 0)', 'if (false)', mem_test, 'refuses removing a memory')
add('memory-cascade', memory, 'if (nodes.length > 0)', 'if (!_cascade && nodes.length > 0)', mem_test, 'refuses removing a memory')
add('memory-targetless', memory, 'parallelism.table.rows.filter((row) => row.stepId === stepId)', 'parallelism.table.rows', mem_test, 'returns sorted detached memory references')
add('memory-owner', memory, 'if (owner === null)', 'if (false)', mem_test, 'removal throws on corrupt retained memory owner')
add('memory-project', memory, 'if (owner.projectId !== projectId)', 'if (false)', mem_test, 'removal throws on corrupt retained memory project')
add('memory-leaf', memory, 'if (owners.some((row) => row.parentId === owner.id))', 'if (false)', mem_test, 'removal throws on corrupt retained memory leaf')
add('memory-range', memory, 'assertStepParallel(parallel.maxParallel);', '', mem_test, 'removal throws on corrupt retained memory range')
add('memory-duplicate', memory, 'if (seen.has(owner.id))', 'if (false)', mem_test, 'removal throws on corrupt retained memory duplicate')
add('memory-copy', memory, 'nodes.push({ workItemId: parallel.workItemId, stepId: parallel.stepId });', 'nodes.push(parallel);', mem_test, 'returns sorted detached memory references')
add('memory-order', memory, 'left.workItemId < right.workItemId ? -1 : left.workItemId > right.workItemId ? 1 : 0', 'left.workItemId < right.workItemId ? 1 : left.workItemId > right.workItemId ? -1 : 0', mem_test, 'returns sorted detached memory references')
add('legacy-wiring', 'libs/wbs/adapters/store-memory/src/in-memory-source.ts', 'table: parallelTable,', 'table: memoryStepParallelTable(),', mem_test, 'refuses removing a memory')
add('source-wiring', 'libs/wbs/adapters/store-memory/src/source.ts', 'table: state.tables.stepParallels,', 'table: memoryStepParallelTable(),', 'libs/wbs/adapters/store-memory/src/memory-source.test.ts', 'source removal retains sparse')
add('service-mapping', service, "      if (removed.reason === 'referenced_by_step_parallel') return removed;", '', service_test, 'refuses retained sparse')
add('route-mapping', route, "body: { error: outcome.reason, nodes: [...outcome.nodes] },", "body: { error: outcome.reason, nodes: [] },", http_test, 'returns 409 for retained sparse')
# Restrict the auth mutation to removeWithin rather than unrelated service gates.
contents = (root / service).read_text()
auth_start = contents.index('  async removeWithin(')
auth_end = contents.index('    // Proof:', auth_start)
auth_before = contents[auth_start:auth_end]
add('authorization', service, auth_before, auth_before.replace('if (!gate.ok)', 'if (false)'), service_test, 'authorizes before consulting sparse')
add('shape-mapping', 'libs/wbs/domain/contracts/src/http/step-shapes.ts', 'error: "\'referenced_by_step_parallel\'",', 'error: "\'unsupported\'",', http_test, 'returns 409 for retained sparse')
add('memory-stale-index', memory, "const current = rows.findIndex((row) => row.id === stepId && row.projectId === projectId);", "const current = found;", mem_test, 'rechecks the target after concurrent')
sql_contents = (root / sqlite).read_text()
guard_start = sql_contents.index('        // Proof: omitted guard and cascade-only guard')
guard_end = sql_contents.index('        const estimated = tx', guard_start)
refusal_block = sql_contents[guard_start:guard_end]
without_refusal = sql_contents[:guard_start] + sql_contents[guard_end:]
estimate_delete = '        tx.delete(estimate).where(inArray(estimate.stepId, stepInProject)).run();'
relocated = without_refusal.replace(estimate_delete, estimate_delete + '\n' + refusal_block, 1)
add('sqlite-mutation-order', sqlite, sql_contents, relocated, sql_test, 'preserves retained cascade families')
add('memory-recheck-notfound', memory, "      if (current < 0) return { ok: false, reason: 'not_found' };", '', mem_test, 'rechecks the target after concurrent')
selected = set(sys.argv[1:])
receipts = []
for name, path, before, after, test, pattern in faults:
    if selected and name not in selected:
        continue
    source = root / path
    original = source.read_bytes()
    decoded = original.decode()
    if decoded.count(before) != 1:
        raise RuntimeError(f'{name}: expected one mutation target, found {decoded.count(before)}')
    try:
        source.write_text(decoded.replace(before, after, 1))
        command = ['python3', guard, 'bun', 'test', test, '--test-name-pattern', pattern]
        env = dict(os.environ, RUNTIME_CLOSURE_RSS_MIB='900')
        observed = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env)
        (evidence / f'{name}.txt').write_text(observed.stdout)
        failures = re.search(r'\b([1-9][0-9]*) fail\b', observed.stdout)
        if observed.returncode != 1 or failures is None or '"killed": true' in observed.stdout:
            raise RuntimeError(f'{name}: expected real failing test, got {observed.returncode}; see receipt')
        receipts.append({'fault': name, 'failedTests': int(failures.group(1)), 'exitCode': observed.returncode})
        print(json.dumps(receipts[-1]), flush=True)
    finally:
        source.write_bytes(original)
        if source.read_bytes() != original:
            raise RuntimeError(f'{name}: restoration failed')
(evidence / ('mutation-receipts-' + (sys.argv[1] if selected else 'all') + '.json')).write_text(json.dumps(receipts, indent=2) + '\n')
