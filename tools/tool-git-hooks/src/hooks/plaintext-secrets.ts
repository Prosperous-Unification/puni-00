import { readFile } from 'node:fs/promises';

const PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'AWS access key id', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'private RSA/EC key header', re: /-----BEGIN (RSA|OPENSSH|EC|DSA) PRIVATE KEY-----/ },
  { name: 'age secret key', re: /AGE-SECRET-KEY-1[0-9A-Z]{58}/ },
  { name: 'GitHub PAT (ghp_)', re: /\bghp_[A-Za-z0-9]{36}\b/ },
  { name: 'slack token', re: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
];

export interface ScanResult {
  file: string;
  finding: string;
}

export async function scan(file: string): Promise<ScanResult | null> {
  const raw = await readFile(file, 'utf8').catch(() => '');
  for (const p of PATTERNS) {
    if (p.re.test(raw)) return { file, finding: p.name };
  }
  return null;
}

async function main(): Promise<void> {
  const files = process.argv.slice(2);
  const findings: ScanResult[] = [];
  for (const f of files) {
    const hit = await scan(f);
    if (hit) findings.push(hit);
  }
  if (findings.length > 0) {
    console.error('[tool-git-hooks] plaintext secret detected — aborting commit:');
    for (const f of findings) console.error(`  ${f.file}: ${f.finding}`);
    process.exit(1);
  }
}

if (import.meta.main) {
  void main();
}
