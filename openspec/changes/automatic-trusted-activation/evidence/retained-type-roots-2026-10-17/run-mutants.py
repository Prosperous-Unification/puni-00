import json
import pathlib
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[5]
compiler = root / 'apps/twilight-structure/twilight-burokrat/cli/src/relationships/typescript-compiler.ts'
core = compiler.with_name('typescript-core.ts')
activation = root / 'apps/twilight-structure/twilight-dash/cli/src/activation/review-typescript.ts'
source = activation.with_name('review-typescript-source.ts')
roots_test = str(activation.with_name('review-typescript-roots.test.ts').relative_to(root))
compiler_test = str(compiler.with_name('typescript-compiler.test.ts').relative_to(root))
core_test = str(core.with_name('typescript-core.test.ts').relative_to(root))
loop = "for (const path of parsed.options.typeRoots ?? []) system.admitTypeRoot(path);"
admission = "      probe();\n      source.pathKind(path);"
guard = root / 'openspec/changes/automatic-trusted-activation/evidence/retained-typescript-aggregate-2026-10-17/rss-guard.py'
faults = [
    ('omit-loop', compiler, loop, '', roots_test, 'refuses absolute outside'),
    ('masked-path-kind', compiler, 'source.pathKind(path);', 'pathKind(path);', roots_test, 'refuses absolute outside'),
    ('wrong-declaring-base', compiler, 'system.admitTypeRoot(path);', "system.admitTypeRoot(path.replace('/configs/', '/'));", compiler_test, 'observes only parser effective roots'),
    ('raw-only', compiler, 'parsed.options.typeRoots ?? []', 'config.config.compilerOptions?.typeRoots ?? []', roots_test, 'refuses inherited outside'),
    ('discarded-inherited', compiler, loop, "const extended = resolve(dirname(absoluteConfig), config.config.extends);\n    const inherited = ts.readConfigFile(extended, system.readFile).config.compilerOptions?.typeRoots ?? [];\n    for (const path of inherited) system.admitTypeRoot(resolve(dirname(extended), path));\n    " + loop, roots_test, 'admits override discarded outside'),
    ('auto-discovery-condition', compiler, "if (mode === 'retained-type-roots')", "if (mode === 'retained-type-roots' && parsed.options.types?.length !== 0)", roots_test, 'refuses absolute outside'),
    ('requires-existence', compiler, 'source.pathKind(path);', "if (source.pathKind(path) === 'absent') throw new Error('type root absent');", roots_test, 'admits missing'),
    ('lexical-only', compiler, 'source.pathKind(path);', "if (workspacePath(workspace, path) === undefined) throw new Error('outside root');", roots_test, 'refuses absent escape descendant'),
    ('generic-outside-throw', compiler, "return admits(path) ? source.pathKind(path) : 'absent';", "if (!admits(path)) throw new Error('outside generic probe');\n    return source.pathKind(path);", roots_test, 'omitted typeRoots wildcard types discover'),
    ('global-retained-mode', core, "mode: TypeScriptConfigurationMode = 'compatible'", "mode: TypeScriptConfigurationMode = 'retained-type-roots'", core_test, 'compatible source mode'),
    ('omit-compiler-charge', compiler, admission, '      source.pathKind(path);', compiler_test, 'explicit type root admission'),
    ('omit-source-delegation', compiler, admission, '      probe();', compiler_test, 'explicit type root admission'),
    ('omit-mode-validation', core, "  if (!['compatible', 'retained-type-roots'].includes(mode))\n    throw new Error('TypeScript configuration mode invalid');", '', core_test, 'configuration mode rejects unknown'),
    ('omit-long-preencoding', source, 'text.length > ceiling || ', '', roots_test, 'bounds long roots'),
    ('physical-root-lookup', compiler, 'source.pathKind(path);', 'ts.sys.directoryExists(path);\n      source.pathKind(path);', roots_test, 'sha1 replays'),
    ('program-before-admission', compiler, "  if (mode === 'retained-type-roots') {\n    " + loop + "\n  }\n", '', roots_test, 'refuses absolute outside'),
    ('premature-owner-publication', activation, '  const extracted = extractTypeScriptRelationshipsFromSource(', '  Extractions.set({}, freezeExtraction({ request: capturedRequest, provenance: { ...provenance } }));\n  const extracted = extractTypeScriptRelationshipsFromSource(', roots_test, 'refuses absolute outside'),
    ('runtime-trust-substitution', activation, 'runtimeTrust: provenance.runtimeTrust', "runtimeTrust: 'verified'", roots_test, 'admits existing'),
    ('census-substitution', activation, 'byteReads, ...extracted', 'byteReads: { ...byteReads, entries: [] }, ...extracted', roots_test, 'admits existing'),
    ('retained-mount-compatible', activation, "    'retained-type-roots',", "    'compatible',", roots_test, 'refuses absolute outside'),
]
log_root = pathlib.Path(sys.argv[1])
log_root.mkdir(parents=True, exist_ok=True)
receipts = []
selected_faults = set(sys.argv[2:])
for name, path, before, after, test_path, selection in faults:
    if selected_faults and name not in selected_faults:
        continue
    original = path.read_text()
    if before not in original:
        raise RuntimeError(f'{name}: substitution absent')
    mutated = original.replace(before, after)
    if name == 'program-before-admission':
        # Preserve the real program construction, then admit roots before source census checks.
        insertion = "  if (mode === 'retained-type-roots') {\n    " + loop + "\n  }\n"
        boundary = '  for (const sourceFile of program.getSourceFiles()) {'
        mutated = mutated.replace(boundary, insertion + boundary, 1)
    log = log_root / f'fault-{name}.log'
    try:
        path.write_text(mutated)
        invocation = subprocess.run(['python3', str(guard), str(log), 'bun', 'test', test_path, '--test-name-pattern', selection], cwd=root, check=False)
        receipt = json.loads(pathlib.Path(str(log) + '.json').read_text())
        if invocation.returncode == 0 or receipt['exitCode'] != 1 or '(fail)' not in log.read_text():
            raise RuntimeError(f'{name}: expected a watched assertion failure, got {receipt}')
        receipts.append({'fault': name, 'selection': selection, **receipt})
    finally:
        path.write_text(original)
(log_root / 'fault-ledger.json').write_text(json.dumps(receipts, indent=2) + '\n')
