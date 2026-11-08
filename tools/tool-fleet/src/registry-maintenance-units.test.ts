import { readFile } from 'node:fs/promises';

import { expect, test } from 'bun:test';

for (const name of ['backup', 'retire']) {
  test(`${name} unit uses only UID59001 shared-authority entrypoint and leaves provider credentials to root helper`, async () => {
    const unit = await readFile(
      new URL(
        `../../../infra/systemd/registry-backup/puni-registry-${name}.service`,
        import.meta.url,
      ),
      'utf8',
    );
    expect(unit).toContain('User=puni-registry-authority');
    expect(unit).toContain('Group=puni-registry-authority');
    expect(unit).toContain(
      `ExecStart=/usr/local/libexec/puni-registry-authority/bun /usr/local/libexec/puni-registry-maintenance/${name}.js`,
    );
    expect(unit).not.toContain('EnvironmentFile=');
    expect(unit).not.toContain('RESTIC_');
    expect(unit).not.toContain('flock');
    expect(unit).toContain('NoNewPrivileges=no');
    expect(unit).toContain('KillMode=mixed');
  });
}

test('fixed sudo rule uses compatible basic policy and grants no command arguments', async () => {
  const policy = await readFile(
    new URL(
      '../../../infra/ansible/roles/registry_storage/files/maintenance.sudoers',
      import.meta.url,
    ),
    'utf8',
  );
  expect(policy).toContain('!use_pty');
  expect(policy).not.toContain('closefrom');
  expect(policy).not.toContain('log_input');
  expect(policy).not.toContain('NOLOG_');
  expect(policy).toContain('/usr/local/libexec/puni-registry-maintenance-host ""');
});

test('maintenance installer remeasures installed artifacts before declaring staging verified', async () => {
  const { parse } = await import('yaml');
  const tasks = parse(
    await readFile(
      new URL(
        '../../../infra/ansible/roles/registry_storage/tasks/maintenance.yml',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as Record<string, unknown>[];
  const measure = tasks.find((task) => task['name'] === 'Measure installed maintenance bundles');
  const guard = tasks.find(
    (task) => task['name'] === 'Refuse changed installed maintenance bundles',
  );
  expect(measure?.['ansible.builtin.stat']).toMatchObject({
    checksum_algorithm: 'sha256',
    follow: false,
  });
  expect(guard?.['ansible.builtin.assert']).toMatchObject({
    that: expect.arrayContaining([
      'registry_maintenance_installed.stat.uid == 0',
      "registry_maintenance_installed.stat.mode == '0644'",
      'registry_maintenance_installed.stat.checksum == registry_maintenance_installed.registry_maintenance_bundle.value.sha256',
    ]) as unknown,
  });
});

test('installer verifies exact classic sudo and policy validator before installing the grant', async () => {
  const { parse } = await import('yaml');
  const tasks = parse(
    await readFile(
      new URL(
        '../../../infra/ansible/roles/registry_storage/tasks/maintenance.yml',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as Record<string, unknown>[];
  const measure = tasks.find(
    (task) => task['name'] === 'Measure fixed privilege and namespace executables',
  );
  expect(measure?.['ansible.builtin.stat']).toMatchObject({
    checksum_algorithm: 'sha256',
    follow: false,
  });
  expect(measure?.['loop']).toEqual([
    {
      path: '/usr/bin/sudo.ws',
      mode: '4755',
      sha256: 'e53ac5247a956620a066ae8fcf5393138695fac109efb3ea15b6ae97e6d32442',
    },
    {
      path: '/usr/sbin/visudo.ws',
      mode: '0755',
      sha256: '72b677b54c9b95b6590f344986c31336c913027d7d9851b81073a08587590619',
    },
    {
      path: '/usr/bin/unshare',
      mode: '0755',
      sha256: '41c65e55107cbbb1a1f6994784a938dd7dbbe255d1fea6b7a58ec96eabe382ef',
    },
  ]);
  const guard = tasks.findIndex(
    (task) => task['name'] === 'Refuse unverified fixed privilege and namespace executables',
  );
  const grant = tasks.findIndex(
    (task) => task['name'] === 'Install narrowly scoped descriptor-transfer sudo rule',
  );
  expect(guard).toBeGreaterThan(-1);
  expect(guard).toBeLessThan(grant);
  expect(tasks[grant]?.['ansible.builtin.copy']).toMatchObject({
    validate: '/usr/sbin/visudo.ws -cf %s',
  });
});

test('both installed sudo parsers must accept the exact fragment before granting it', async () => {
  const { parse } = await import('yaml');
  const tasks = parse(
    await readFile(
      new URL(
        '../../../infra/ansible/roles/registry_storage/tasks/maintenance.yml',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as Record<string, unknown>[];
  const staged = tasks.findIndex(
    (task) =>
      task['name'] === 'Validate narrow policy with the default sudo parser before granting it',
  );
  const granted = tasks.findIndex(
    (task) => task['name'] === 'Install narrowly scoped descriptor-transfer sudo rule',
  );
  expect(staged).toBeGreaterThan(-1);
  expect(granted).toBeGreaterThan(staged);
  expect(tasks[staged]?.['ansible.builtin.copy']).toMatchObject({
    dest: '/etc/puni/registry-maintenance.sudoers',
    validate: '/usr/sbin/visudo -cf %s',
  });
  expect(tasks[granted]?.['ansible.builtin.copy']).toMatchObject({
    src: '/etc/puni/registry-maintenance.sudoers',
    remote_src: true,
    validate: '/usr/sbin/visudo.ws -cf %s',
  });
});

test('worker bundle enrollment binds the installed artifact before privilege grant', async () => {
  const role = await readFile(
    new URL('../../../infra/ansible/roles/registry_storage/tasks/maintenance.yml', import.meta.url),
    'utf8',
  );
  expect(role).toContain(
    "['activate', 'backup', 'backup-worker', 'host', 'recover', 'retire', 'status']",
  );
  expect(role).toContain(
    "puni_registry_maintenance_configuration.backupWorker.sha256 == puni_registry_maintenance_artifacts['backup-worker'].sha256",
  );
  expect(role).toContain(
    "puni_registry_maintenance_configuration.backupWorker.path == '/usr/local/libexec/puni-registry-maintenance/backup-worker.js'",
  );
});

test('pressure cache is staged volatile bounded runtime state while monitor keeps the ten-second authority path', async () => {
  const unit = await readFile(
    new URL(
      '../../../infra/ansible/roles/registry_storage/templates/puni-registry-pressure.service.j2',
      import.meta.url,
    ),
    'utf8',
  );
  expect(unit).toContain('RuntimeDirectory=puni-registry-pressure');
  expect(unit).toContain('RuntimeDirectoryMode=0700');
  expect(unit).toContain('UMask=0077');
  expect(unit).toContain(
    'ReadWritePaths=/var/lib/puni-registry/journal/contents /run/puni-registry-pressure',
  );
  expect(unit).toContain('authority.js /var/lib/puni-registry/journal/contents --monitor');
  const source = await readFile(
    new URL('./registry-managed-journal-cli.ts', import.meta.url),
    'utf8',
  );
  expect(source).toContain('await monitorRegistryPressure(');
  expect(source).toContain('await Bun.sleep(registryRenewalSeconds * 1000)');
});

test('staged source and sender units allow only the explicit alert store and fixed credential reference', async () => {
  const pressure = await readFile(
    new URL(
      '../../../infra/ansible/roles/registry_storage/templates/puni-registry-pressure.service.j2',
      import.meta.url,
    ),
    'utf8',
  );
  expect(pressure).toContain(
    'ReadWritePaths=/var/lib/puni-registry/journal/contents /run/puni-registry-pressure /var/lib/puni-registry-monitoring/source',
  );
  const sender = await readFile(
    new URL(
      '../../../infra/systemd/registry-maintenance/puni-registry-alert-send.service',
      import.meta.url,
    ),
    'utf8',
  );
  expect(sender).toContain('ReadWritePaths=/var/lib/puni-registry-monitoring/source');
  expect(sender).toContain('LoadCredential=webhook:/etc/puni/registry-monitoring-source.webhook');
  expect(sender).toContain('registry-alert-send-cli.js');
  expect(sender).toContain('TimeoutStartSec=20s');
  expect(sender).not.toContain('EnvironmentFile=');
  expect(sender).not.toContain('[Install]');
  const timer = await readFile(
    new URL(
      '../../../infra/systemd/registry-maintenance/puni-registry-alert-send.timer',
      import.meta.url,
    ),
    'utf8',
  );
  expect(timer).toContain('OnUnitInactiveSec=15s');
  const project = await readFile(new URL('../project.json', import.meta.url), 'utf8');
  expect(project).toContain('tools/tool-fleet/src/registry-alert-send-cli.ts --target=bun');
});
