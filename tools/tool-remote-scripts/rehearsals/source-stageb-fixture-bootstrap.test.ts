import { rejects } from 'node:assert/strict';
import type { ChildProcess } from 'node:child_process';
import type { BigIntStats } from 'node:fs';
import type { Readable } from 'node:stream';

import type { PluginBuilder } from 'bun';
import { expect, test } from 'bun:test';
import type { Node as TypeScriptNode } from 'typescript';

import type { CompleteDependencyActivationRequest } from '../src/lib/dependency-complete-activation';
import type { SourceStartupManifest } from '../src/lib/source-startup-manifest';
import type {
  SourceFixtureAuthority,
  SourceFixtureRoster,
  SourceProducerEvidence,
} from './source-stageb-fixture';
import * as fixturePolicy from './source-stageb-fixture';
import { decodeSourceFixturePolicy } from './source-stageb-fixture';
const facilityText =
  '{"format":"source-stageb-fixture-authority","version":1,"evidenceClass":"synthetic-source-fixture","sourceSha":"1111111111111111111111111111111111111111","workflowSha":"2222222222222222222222222222222222222222","nonce":"33333333333333333333333333333333","custodyReference":"synthetic-only:exclusive-coordinator-model","machineIdSha256":"ea827565f5525c1e7f32ffa9a88d14a39dfaa3e6962814d9b8e21261c4293a85","bootId":"11111111-2222-4333-8444-555555555555","coordinator":{"directory":"/tmp/source-stageb-synthetic-coordinator","device":"103","inode":"301","uid":1000,"gid":1000,"mode":448},"anchors":[{"id":"home","path":"/home/puni1","device":"101","inode":"201","uid":1000,"gid":1000,"mode":493},{"id":"lib","path":"/home/puni1/.local/lib","device":"101","inode":"202","uid":1000,"gid":1000,"mode":493},{"id":"config","path":"/home/puni1/.config","device":"101","inode":"203","uid":1000,"gid":1000,"mode":448},{"id":"user-units","path":"/home/puni1/.config/systemd/user","device":"101","inode":"204","uid":1000,"gid":1000,"mode":493},{"id":"runtime","path":"/run/user/1000","device":"102","inode":"205","uid":1000,"gid":1000,"mode":448},{"id":"declared-parent-1","path":"/home/puni1/stageb-synthetic-declared-1","device":"101","inode":"206","uid":1000,"gid":1000,"mode":448},{"id":"declared-parent-2","path":"/home/puni1/stageb-synthetic-declared-2","device":"101","inode":"207","uid":1000,"gid":1000,"mode":448},{"id":"declared-parent-3","path":"/home/puni1/stageb-synthetic-declared-3","device":"101","inode":"208","uid":1000,"gid":1000,"mode":448},{"id":"declared-parent-4","path":"/home/puni1/stageb-synthetic-declared-4","device":"101","inode":"209","uid":1000,"gid":1000,"mode":448},{"id":"declared-parent-5","path":"/home/puni1/stageb-synthetic-declared-5","device":"101","inode":"210","uid":1000,"gid":1000,"mode":448}],"groups":[{"id":"prod","anchor":"home","child":"wbs","mode":493,"uid":1000,"gid":1000},{"id":"dev","anchor":"home","child":"wbs-dev","mode":493,"uid":1000,"gid":1000},{"id":"solver-lib","anchor":"lib","child":"wbs-solver","mode":493,"uid":1000,"gid":1000},{"id":"solver-config","anchor":"config","child":"wbs-solver","mode":448,"uid":1000,"gid":1000},{"id":"solver-runtime","anchor":"runtime","child":"wbs-solver","mode":488,"uid":1000,"gid":1000},{"id":"declared-1","anchor":"declared-parent-1","child":"owned","mode":448,"uid":1000,"gid":1000},{"id":"declared-2","anchor":"declared-parent-2","child":"owned","mode":448,"uid":1000,"gid":1000},{"id":"declared-3","anchor":"declared-parent-3","child":"owned","mode":448,"uid":1000,"gid":1000},{"id":"declared-4","anchor":"declared-parent-4","child":"owned","mode":448,"uid":1000,"gid":1000},{"id":"declared-5","anchor":"declared-parent-5","child":"owned","mode":448,"uid":1000,"gid":1000}],"unit":{"anchor":"user-units","leaf":"wbs-solver-supervisor.service"},"selectedColor":"blue","runtime":{"artifact":"solver-artifacts","member":"bun","bytes":37,"sha256":"98a9c7fed9c78e80fdf4ecae058e175ed351c9e7861ce86b262110dcd580fb9d"},"worker":{"source":"tools/tool-remote-scripts/rehearsals/source-stageb-migration-worker.ts","recipe":"fixed-bun-worker-v1","bytes":48,"sha256":"8d2641f0f09292675d1308e506d63172d076826b4eee4292a04b7366dd7196f6"},"migration":{"manifestSha256":"db7283474ac0fea5f7be8198aca9eff89699e37cbec2b61c633f16c9c1b1b068","envelope":"/home/puni1/wbs/state/dependency-artifacts/db7283474ac0fea5f7be8198aca9eff89699e37cbec2b61c633f16c9c1b1b068","databases":[{"environment":"prod","path":"/home/puni1/wbs/data/production.sqlite"},{"environment":"dev","path":"/home/puni1/wbs-dev/data/development.sqlite"}]},"images":[{"role":"backend","reference":"registry.invalid/stageb/backend@sha256:93e090578107cf3b8adb13d0f9ab716b38c993e785ab6a7a10b1be5ed5ff9c81","imageId":"sha256:620f2441571a443473455faccaf099693d6b09a2cb15515ac49c556329c465c1"},{"role":"gateway","reference":"registry.invalid/stageb/gateway@sha256:aad341328bdf19fb226cfde10adcd877823a1ad7c24ab3d032eef22c9fc5c740","imageId":"sha256:d389f3c83f3a006415ec402948e3c761b74a61745483605c07d5ab4a0a97c24f"},{"role":"source","reference":"registry.invalid/stageb/source@sha256:726274d3253cd2dc52f96234b6282e0c5672e743dba07c44cf1e37ccec311c42","imageId":"sha256:ca6d71cae63f39ba7831598124f44e832735abab84756fc688dddb01c3b772bf"},{"role":"caddy","reference":"registry.invalid/stageb/caddy@sha256:c4090aeca34830a0abbcc668b3c353ec92c95e944abf26fb2c1d7112559b5467","imageId":"sha256:d2aa99681b1ecb9d7e1b95bce1c4f9db45a1fd690e33b20f3a8ef71c16c9acf1"},{"role":"solver-prod","reference":"registry.invalid/stageb/solver-prod@sha256:5308eada1df42350f68a4204a5bbc9c0239c8e6c0dc402eef389ddc42700caca","imageId":"sha256:5255bb7c39e5565ee6388d2b70f780dd43ce43aae7fe62735f0c23f705e27f7e"},{"role":"solver-dev","reference":"registry.invalid/stageb/solver-dev@sha256:80a5537f1a97730dc056590edf877f0a4f33e5d93a36c672dd9e255c653b4c7d","imageId":"sha256:e4ff266702c4854ef8eb64daa76ebf561dabc06c83e7c089488eda03bb7c8d3d"}],"configurationSha256":"a479678ddf7b0979cff0979bf8dd68d6fca13cbae950de875923bfc25b53b16b","limits":{"groups":10,"declaredGroups":5,"helpers":177,"resources":178,"records":2318,"controlRecordBytes":1024,"outstanding":8},"enablement":{"parent":{"path":"/home/puni1/.config/systemd/user/default.target.wants","device":"101","inode":"211","uid":1000,"gid":1000,"mode":493},"leaf":"wbs-solver-supervisor.service","admission":"preexisting-parent-only"},"nativeCustody":{"qualificationReference":"synthetic-only:native-custody-raw-model-20261026","manager":{"pid":420001,"startTicks":"90001","uid":1000,"gid":1000,"supplementaryGroups":[1000],"executable":"/usr/lib/systemd/systemd","cgroup":{"path":"/user.slice/user-1000.slice/user@1000.service/init.scope","device":"503","inode":"1312"}},"programs":[{"role":"docker","path":"/usr/bin/docker","device":"501","inode":"1000","uid":0,"gid":0,"mode":493,"bytes":64,"sha256":"b70327bd5749154ac4fcb5bc91e3872a22fb8b1c1fa145c7089c4fd4491e4b71","mtimeNs":"1800000000000000000","ctimeNs":"1800000000000000000"},{"role":"setpriv","path":"/usr/bin/setpriv","device":"501","inode":"1001","uid":0,"gid":0,"mode":493,"bytes":66,"sha256":"f1f5eb9882fdb85dd0591633aa681f1e8528fb60be1ece3ce9e4c076f0d6eb4b","mtimeNs":"1800000000000000000","ctimeNs":"1800000000000000000"},{"role":"systemctl","path":"/usr/bin/systemctl","device":"501","inode":"1002","uid":0,"gid":0,"mode":493,"bytes":70,"sha256":"a6fac603064a2df6074d8d4ce42f605e35da71c3211ffaaeac23818746383f05","mtimeNs":"1800000000000000000","ctimeNs":"1800000000000000000"},{"role":"busctl","path":"/usr/bin/busctl","device":"501","inode":"1003","uid":0,"gid":0,"mode":493,"bytes":64,"sha256":"30d56c388a27b15b12fdc730547e7b287f04da4fbb8efba2d7a3627737c45b0a","mtimeNs":"1800000000000000000","ctimeNs":"1800000000000000000"},{"role":"manager","path":"/usr/lib/systemd/systemd","device":"501","inode":"1004","uid":0,"gid":0,"mode":493,"bytes":74,"sha256":"62ff566bb58f30c91406c50497747d5e6b49e413cd0fcd1fd04a6e2869b8b270","mtimeNs":"1800000000000000000","ctimeNs":"1800000000000000000"}],"loaderClosure":{"files":[{"role":"loader","path":"/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2","device":"501","inode":"1005","uid":0,"gid":0,"mode":493,"bytes":95,"sha256":"1e1db914f47a9ed4ac8728061421e4d30c04d8d7f79d3ef570253176cd12bdd4","mtimeNs":"1800000000000000000","ctimeNs":"1800000000000000000"},{"role":"library","path":"/usr/lib/x86_64-linux-gnu/libc.so.6","device":"501","inode":"1006","uid":0,"gid":0,"mode":493,"bytes":85,"sha256":"77e106aa1e38147b680f0beda265bd7f49d7d3317b29eabd5a6377498405bae8","mtimeNs":"1800000000000000000","ctimeNs":"1800000000000000000"},{"role":"loader-cache","path":"/etc/ld.so.cache","device":"501","inode":"1007","uid":0,"gid":0,"mode":420,"bytes":71,"sha256":"abfd425c847971bfd38c3bd8ef58a784be002eaeb30483f2778d5258f67a2b81","mtimeNs":"1800000000000000000","ctimeNs":"1800000000000000000"}],"links":[{"path":"/lib","target":"usr/lib","resolvedPath":"/usr/lib","device":"501","inode":"1100","uid":0,"gid":0,"mode":511,"mtimeNs":"1800000000000000000","ctimeNs":"1800000000000000000"},{"path":"/lib64","target":"usr/lib64","resolvedPath":"/usr/lib64","device":"501","inode":"1101","uid":0,"gid":0,"mode":511,"mtimeNs":"1800000000000000000","ctimeNs":"1800000000000000000"},{"path":"/usr/lib64/ld-linux-x86-64.so.2","target":"../lib/x86_64-linux-gnu/ld-linux-x86-64.so.2","resolvedPath":"/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2","device":"501","inode":"1102","uid":0,"gid":0,"mode":511,"mtimeNs":"1800000000000000000","ctimeNs":"1800000000000000000"}],"absentPaths":["/etc/ld.so.preload"]},"parents":[{"path":"/","device":"503","inode":"1300","uid":0,"gid":0,"mode":493},{"path":"/etc","device":"503","inode":"1301","uid":0,"gid":0,"mode":493},{"path":"/run","device":"503","inode":"1302","uid":0,"gid":0,"mode":493},{"path":"/run/user","device":"503","inode":"1303","uid":0,"gid":0,"mode":493},{"path":"/run/user/1000","device":"102","inode":"205","uid":1000,"gid":1000,"mode":448},{"path":"/run/user/1000/systemd","device":"503","inode":"1305","uid":1000,"gid":1000,"mode":448},{"path":"/sys","device":"503","inode":"1306","uid":0,"gid":0,"mode":493},{"path":"/sys/fs","device":"503","inode":"1307","uid":0,"gid":0,"mode":493},{"path":"/sys/fs/cgroup","device":"503","inode":"1308","uid":0,"gid":0,"mode":493},{"path":"/sys/fs/cgroup/user.slice","device":"503","inode":"1309","uid":0,"gid":0,"mode":493},{"path":"/sys/fs/cgroup/user.slice/user-1000.slice","device":"503","inode":"1310","uid":0,"gid":0,"mode":493},{"path":"/sys/fs/cgroup/user.slice/user-1000.slice/user@1000.service","device":"503","inode":"1311","uid":1000,"gid":1000,"mode":493},{"path":"/sys/fs/cgroup/user.slice/user-1000.slice/user@1000.service/init.scope","device":"503","inode":"1312","uid":1000,"gid":1000,"mode":493},{"path":"/usr","device":"503","inode":"1313","uid":0,"gid":0,"mode":493},{"path":"/usr/bin","device":"503","inode":"1314","uid":0,"gid":0,"mode":493},{"path":"/usr/lib","device":"503","inode":"1315","uid":0,"gid":0,"mode":493},{"path":"/usr/lib/systemd","device":"503","inode":"1316","uid":0,"gid":0,"mode":493},{"path":"/usr/lib/x86_64-linux-gnu","device":"503","inode":"1317","uid":0,"gid":0,"mode":493},{"path":"/usr/lib64","device":"503","inode":"1318","uid":0,"gid":0,"mode":493}],"endpoints":[{"role":"docker","path":"/run/docker.sock","device":"502","inode":"1200","uid":0,"gid":0,"mode":432,"mtimeNs":"1800000000000000000","ctimeNs":"1800000000000000000"},{"role":"user-bus","path":"/run/user/1000/bus","device":"502","inode":"1201","uid":1000,"gid":1000,"mode":432,"mtimeNs":"1800000000000000000","ctimeNs":"1800000000000000000"},{"role":"manager-private","path":"/run/user/1000/systemd/private","device":"502","inode":"1202","uid":1000,"gid":1000,"mode":432,"mtimeNs":"1800000000000000000","ctimeNs":"1800000000000000000"}]}}\n';
const rosterText =
  '{"format":"source-stageb-roster-policy","version":1,"evidenceClass":"synthetic-source-fixture","sourceSha":"1111111111111111111111111111111111111111","buildSha":"1111111111111111111111111111111111111111","buildId":"synthetic-b2-20261026","members":[{"member":"prod-swap","group":"prod","relative":"bin/swap.js","destination":"/home/puni1/wbs/bin/swap.js","mode":493,"origin":"build","producer":{"id":"prod-swap","bytes":1467,"sha256":"bd36aff7a3e6a2f63c8fcce73033f252f264c3d59e1dc3d2b4665c6d87d6eb45"}},{"member":"prod-smoke","group":"prod","relative":"bin/smoke.js","destination":"/home/puni1/wbs/bin/smoke.js","mode":493,"origin":"build","producer":{"id":"prod-smoke","bytes":1453,"sha256":"7e0bc6c0cdf69a76f6256c08ccf5f9b0c433c681850b8eed0b9b7b9b2234e38c"}},{"member":"dev-swap","group":"dev","relative":"bin/swap.js","destination":"/home/puni1/wbs-dev/bin/swap.js","mode":493,"origin":"build","producer":{"id":"dev-swap","bytes":1464,"sha256":"b64a277abaefb63bc9ebb27a0f663c37750828690faeacc3ad25f840c5534347"}},{"member":"dev-smoke","group":"dev","relative":"bin/smoke.js","destination":"/home/puni1/wbs-dev/bin/smoke.js","mode":493,"origin":"build","producer":{"id":"dev-smoke","bytes":1450,"sha256":"e230bae3091084b200ca3e22efd46552f01d750cacc77f5663d4e4b6a9662eb3"}},{"member":"dev-poller","group":"dev","relative":"bin/poll.sh","destination":"/home/puni1/wbs-dev/bin/poll.sh","mode":493,"origin":"source","producer":{"id":"dev-poller","bytes":1037,"sha256":"c5df75da5892880202b3a4933b8395e7a8b58cd4888ef6e805f9606e0ac76b2e"}},{"member":"dev-loader","group":"dev","relative":"bin/dev-poll-sync.sh","destination":"/home/puni1/wbs-dev/bin/dev-poll-sync.sh","mode":493,"origin":"source","producer":{"id":"dev-loader","bytes":1047,"sha256":"07b02e8decd1f1f060028250ee050ebc8adaf4300302c837c153a72803d42bdf"}},{"member":"dev-interpreter","group":"dev","relative":"bin/bun","destination":"/home/puni1/wbs-dev/bin/bun","mode":493,"origin":"build","producer":{"id":"dev-interpreter","bytes":1043,"sha256":"4071706eff670101540b08e9491fdd68195a62a442eef7ebdf2d420bf8242a72"}},{"member":"declared-manual-launcher","group":"declared-1","relative":"manual-launcher","destination":"/home/puni1/stageb-synthetic-declared-1/owned/manual-launcher","mode":493,"origin":"source","producer":{"id":"declared-manual-launcher","bytes":1117,"sha256":"22ec11a9df56f3c6d2bdcf1e521f08c679369785483f972987afa2bf053733de"}},{"member":"declared-bootstrap","group":"declared-2","relative":"bootstrap","destination":"/home/puni1/stageb-synthetic-declared-2/owned/bootstrap","mode":493,"origin":"source","producer":{"id":"declared-bootstrap","bytes":1087,"sha256":"2a7b8f6b7893a1cf010faa24367189c868699d101a9e38e23e42acd09451c245"}},{"member":"declared-configure","group":"declared-3","relative":"configure","destination":"/home/puni1/stageb-synthetic-declared-3/owned/configure","mode":493,"origin":"source","producer":{"id":"declared-configure","bytes":1087,"sha256":"76198df65567c765a7a451717fb8dc384a76354f06064cf1036ab63b82443e86"}},{"member":"shared-launch-authority","group":"declared-4","relative":"launch-authority","destination":"/home/puni1/stageb-synthetic-declared-4/owned/launch-authority","mode":384,"origin":"build","producer":{"id":"shared-launch-authority","bytes":1098,"sha256":"7b27924c1cf91a3d9d57ad9091dbc029f034ad002cbdef00d7401075da39fdc1"}},{"member":"shared-restart-authority","group":"declared-5","relative":"restart-authority","destination":"/home/puni1/stageb-synthetic-declared-5/owned/restart-authority","mode":384,"origin":"build","producer":{"id":"shared-restart-authority","bytes":1102,"sha256":"c418ad15e88fd587b003efc565e9d44ecc09a65ff15940c6a3865b90eb275203"}}]}\n';
const producerTexts = [
  '{"format":"source-stageb-producer-evidence","version":1,"evidenceClass":"synthetic-source-fixture","id":"prod-swap","sourceSha":"1111111111111111111111111111111111111111","buildSha":"1111111111111111111111111111111111111111","buildId":"synthetic-b2-20261026","recipe":"swap-bundle-v1","entry":"tools/tool-remote-scripts/src/swap.ts","inputs":[{"role":"source-tree","path":"tools/tool-remote-scripts/src/swap.ts","bytes":37,"sha256":"56f488c80faec09ff2038191041bc278b65aeaf67abc661da475bda9ec5a31fa"},{"role":"dependencies","path":"dependencies","bytes":38,"sha256":"e5a3915ccf9633730508adbb4e79c5b157735377155c3ecaba3aeb463f20ba9a"},{"role":"lockfile","path":"bun.lock","bytes":34,"sha256":"191fea9619366d584f9414cff0664541c2f59e47001ef502d9dcb9ea22e99cf7"},{"role":"bun-runtime","path":"bun-runtime","bytes":37,"sha256":"98a9c7fed9c78e80fdf4ecae058e175ed351c9e7861ce86b262110dcd580fb9d"}],"output":{"member":"prod-swap","bytes":32,"sha256":"9b197931b8214fc5d8aa7ef746935fb4eef43bf7fdfc1bff98b535a0b19c8e1f","mode":493},"execution":{"observationClass":"synthetic-model","attempt":"33333333333333333333333333333333","toolSha256":"98a9c7fed9c78e80fdf4ecae058e175ed351c9e7861ce86b262110dcd580fb9d","started":true,"exitCode":0,"inputClosureSha256":"d036b5e28f6044e7a6cebde0e59b17ef40f57f73a826ead2e4ce23b8627e9e86","outputReadbackSha256":"9b197931b8214fc5d8aa7ef746935fb4eef43bf7fdfc1bff98b535a0b19c8e1f","settled":true},"provenanceReference":"synthetic-only:prod-swap"}\n',
  '{"format":"source-stageb-producer-evidence","version":1,"evidenceClass":"synthetic-source-fixture","id":"prod-smoke","sourceSha":"1111111111111111111111111111111111111111","buildSha":"1111111111111111111111111111111111111111","buildId":"synthetic-b2-20261026","recipe":"smoke-bundle-v1","entry":"tools/tool-smoke/src/main.ts","inputs":[{"role":"source-tree","path":"tools/tool-smoke/src/main.ts","bytes":37,"sha256":"56f488c80faec09ff2038191041bc278b65aeaf67abc661da475bda9ec5a31fa"},{"role":"dependencies","path":"dependencies","bytes":38,"sha256":"e5a3915ccf9633730508adbb4e79c5b157735377155c3ecaba3aeb463f20ba9a"},{"role":"lockfile","path":"bun.lock","bytes":34,"sha256":"191fea9619366d584f9414cff0664541c2f59e47001ef502d9dcb9ea22e99cf7"},{"role":"bun-runtime","path":"bun-runtime","bytes":37,"sha256":"98a9c7fed9c78e80fdf4ecae058e175ed351c9e7861ce86b262110dcd580fb9d"}],"output":{"member":"prod-smoke","bytes":33,"sha256":"ae2460c8641311e6fe12d5f01e6a8be96b1b885a6e46561f3d28ab463926f7ac","mode":493},"execution":{"observationClass":"synthetic-model","attempt":"33333333333333333333333333333333","toolSha256":"98a9c7fed9c78e80fdf4ecae058e175ed351c9e7861ce86b262110dcd580fb9d","started":true,"exitCode":0,"inputClosureSha256":"ed20cd91c1bc998f8471c87171f27ff70a664213cfe61a6ae24742c128fd983a","outputReadbackSha256":"ae2460c8641311e6fe12d5f01e6a8be96b1b885a6e46561f3d28ab463926f7ac","settled":true},"provenanceReference":"synthetic-only:prod-smoke"}\n',
  '{"format":"source-stageb-producer-evidence","version":1,"evidenceClass":"synthetic-source-fixture","id":"dev-swap","sourceSha":"1111111111111111111111111111111111111111","buildSha":"1111111111111111111111111111111111111111","buildId":"synthetic-b2-20261026","recipe":"swap-bundle-v1","entry":"tools/tool-remote-scripts/src/swap.ts","inputs":[{"role":"source-tree","path":"tools/tool-remote-scripts/src/swap.ts","bytes":37,"sha256":"56f488c80faec09ff2038191041bc278b65aeaf67abc661da475bda9ec5a31fa"},{"role":"dependencies","path":"dependencies","bytes":38,"sha256":"e5a3915ccf9633730508adbb4e79c5b157735377155c3ecaba3aeb463f20ba9a"},{"role":"lockfile","path":"bun.lock","bytes":34,"sha256":"191fea9619366d584f9414cff0664541c2f59e47001ef502d9dcb9ea22e99cf7"},{"role":"bun-runtime","path":"bun-runtime","bytes":37,"sha256":"98a9c7fed9c78e80fdf4ecae058e175ed351c9e7861ce86b262110dcd580fb9d"}],"output":{"member":"dev-swap","bytes":32,"sha256":"9b197931b8214fc5d8aa7ef746935fb4eef43bf7fdfc1bff98b535a0b19c8e1f","mode":493},"execution":{"observationClass":"synthetic-model","attempt":"33333333333333333333333333333333","toolSha256":"98a9c7fed9c78e80fdf4ecae058e175ed351c9e7861ce86b262110dcd580fb9d","started":true,"exitCode":0,"inputClosureSha256":"d036b5e28f6044e7a6cebde0e59b17ef40f57f73a826ead2e4ce23b8627e9e86","outputReadbackSha256":"9b197931b8214fc5d8aa7ef746935fb4eef43bf7fdfc1bff98b535a0b19c8e1f","settled":true},"provenanceReference":"synthetic-only:dev-swap"}\n',
  '{"format":"source-stageb-producer-evidence","version":1,"evidenceClass":"synthetic-source-fixture","id":"dev-smoke","sourceSha":"1111111111111111111111111111111111111111","buildSha":"1111111111111111111111111111111111111111","buildId":"synthetic-b2-20261026","recipe":"smoke-bundle-v1","entry":"tools/tool-smoke/src/main.ts","inputs":[{"role":"source-tree","path":"tools/tool-smoke/src/main.ts","bytes":37,"sha256":"56f488c80faec09ff2038191041bc278b65aeaf67abc661da475bda9ec5a31fa"},{"role":"dependencies","path":"dependencies","bytes":38,"sha256":"e5a3915ccf9633730508adbb4e79c5b157735377155c3ecaba3aeb463f20ba9a"},{"role":"lockfile","path":"bun.lock","bytes":34,"sha256":"191fea9619366d584f9414cff0664541c2f59e47001ef502d9dcb9ea22e99cf7"},{"role":"bun-runtime","path":"bun-runtime","bytes":37,"sha256":"98a9c7fed9c78e80fdf4ecae058e175ed351c9e7861ce86b262110dcd580fb9d"}],"output":{"member":"dev-smoke","bytes":33,"sha256":"ae2460c8641311e6fe12d5f01e6a8be96b1b885a6e46561f3d28ab463926f7ac","mode":493},"execution":{"observationClass":"synthetic-model","attempt":"33333333333333333333333333333333","toolSha256":"98a9c7fed9c78e80fdf4ecae058e175ed351c9e7861ce86b262110dcd580fb9d","started":true,"exitCode":0,"inputClosureSha256":"ed20cd91c1bc998f8471c87171f27ff70a664213cfe61a6ae24742c128fd983a","outputReadbackSha256":"ae2460c8641311e6fe12d5f01e6a8be96b1b885a6e46561f3d28ab463926f7ac","settled":true},"provenanceReference":"synthetic-only:dev-smoke"}\n',
  '{"format":"source-stageb-producer-evidence","version":1,"evidenceClass":"synthetic-source-fixture","id":"dev-poller","sourceSha":"1111111111111111111111111111111111111111","buildSha":"1111111111111111111111111111111111111111","buildId":"synthetic-b2-20261026","recipe":"source-copy-v1","entry":"bin/dev-poll.sh","inputs":[{"role":"source-file","path":"bin/dev-poll.sh","bytes":29,"sha256":"436e5ab6b1b5f2a8e65dc408d1386c2c20f1c59a41c8056a6393d7972464ffda"}],"output":{"member":"dev-poller","bytes":29,"sha256":"436e5ab6b1b5f2a8e65dc408d1386c2c20f1c59a41c8056a6393d7972464ffda","mode":493},"execution":{"observationClass":"synthetic-model","attempt":"33333333333333333333333333333333","toolSha256":"98a9c7fed9c78e80fdf4ecae058e175ed351c9e7861ce86b262110dcd580fb9d","started":true,"exitCode":0,"inputClosureSha256":"279b29c262cccffd246b5bb2e250d095b2b60a0ffb0c109deead26d0d483e784","outputReadbackSha256":"436e5ab6b1b5f2a8e65dc408d1386c2c20f1c59a41c8056a6393d7972464ffda","settled":true},"provenanceReference":"synthetic-only:dev-poller"}\n',
  '{"format":"source-stageb-producer-evidence","version":1,"evidenceClass":"synthetic-source-fixture","id":"dev-loader","sourceSha":"1111111111111111111111111111111111111111","buildSha":"1111111111111111111111111111111111111111","buildId":"synthetic-b2-20261026","recipe":"source-copy-v1","entry":"bin/dev-poll-sync.sh","inputs":[{"role":"source-file","path":"bin/dev-poll-sync.sh","bytes":29,"sha256":"b5d3c6171f3f09aea6f667572873b695a0f4b90c42ebba61b127c86a6a61ec8d"}],"output":{"member":"dev-loader","bytes":29,"sha256":"b5d3c6171f3f09aea6f667572873b695a0f4b90c42ebba61b127c86a6a61ec8d","mode":493},"execution":{"observationClass":"synthetic-model","attempt":"33333333333333333333333333333333","toolSha256":"98a9c7fed9c78e80fdf4ecae058e175ed351c9e7861ce86b262110dcd580fb9d","started":true,"exitCode":0,"inputClosureSha256":"72ae86457fc6f4869a135b0f48167d6783b732ec06fe43b387f5ae46af226635","outputReadbackSha256":"b5d3c6171f3f09aea6f667572873b695a0f4b90c42ebba61b127c86a6a61ec8d","settled":true},"provenanceReference":"synthetic-only:dev-loader"}\n',
  '{"format":"source-stageb-producer-evidence","version":1,"evidenceClass":"synthetic-source-fixture","id":"dev-interpreter","sourceSha":"1111111111111111111111111111111111111111","buildSha":"1111111111111111111111111111111111111111","buildId":"synthetic-b2-20261026","recipe":"runtime-copy-v1","entry":null,"inputs":[{"role":"bun-runtime","path":"approved-input/bun","bytes":37,"sha256":"98a9c7fed9c78e80fdf4ecae058e175ed351c9e7861ce86b262110dcd580fb9d"}],"output":{"member":"dev-interpreter","bytes":37,"sha256":"98a9c7fed9c78e80fdf4ecae058e175ed351c9e7861ce86b262110dcd580fb9d","mode":493},"execution":{"observationClass":"synthetic-model","attempt":"33333333333333333333333333333333","toolSha256":"98a9c7fed9c78e80fdf4ecae058e175ed351c9e7861ce86b262110dcd580fb9d","started":true,"exitCode":0,"inputClosureSha256":"0a6b9d14866e5e32e6f52d224823b61b65535545394d52e3e2de18a1345fa473","outputReadbackSha256":"98a9c7fed9c78e80fdf4ecae058e175ed351c9e7861ce86b262110dcd580fb9d","settled":true},"provenanceReference":"synthetic-only:dev-interpreter"}\n',
  '{"format":"source-stageb-producer-evidence","version":1,"evidenceClass":"synthetic-source-fixture","id":"declared-manual-launcher","sourceSha":"1111111111111111111111111111111111111111","buildSha":"1111111111111111111111111111111111111111","buildId":"synthetic-b2-20261026","recipe":"source-copy-v1","entry":"fixture/source/manual-launcher.txt","inputs":[{"role":"source-file","path":"fixture/source/manual-launcher.txt","bytes":43,"sha256":"b42d03c16eb696e19ffec38edb8243a5b0cd6ab84c9cc8dad532107fe129ee57"}],"output":{"member":"declared-manual-launcher","bytes":43,"sha256":"b42d03c16eb696e19ffec38edb8243a5b0cd6ab84c9cc8dad532107fe129ee57","mode":493},"execution":{"observationClass":"synthetic-model","attempt":"33333333333333333333333333333333","toolSha256":"98a9c7fed9c78e80fdf4ecae058e175ed351c9e7861ce86b262110dcd580fb9d","started":true,"exitCode":0,"inputClosureSha256":"6863b05892932892f8495fb317c9d227038f9ecd245b88785c938af21851fb27","outputReadbackSha256":"b42d03c16eb696e19ffec38edb8243a5b0cd6ab84c9cc8dad532107fe129ee57","settled":true},"provenanceReference":"synthetic-only:declared-manual-launcher"}\n',
  '{"format":"source-stageb-producer-evidence","version":1,"evidenceClass":"synthetic-source-fixture","id":"declared-bootstrap","sourceSha":"1111111111111111111111111111111111111111","buildSha":"1111111111111111111111111111111111111111","buildId":"synthetic-b2-20261026","recipe":"source-copy-v1","entry":"fixture/source/bootstrap.txt","inputs":[{"role":"source-file","path":"fixture/source/bootstrap.txt","bytes":37,"sha256":"9c1a7971d5bc27252d5c44637440540e152e2b3cb83349ba697cd6ff25d2469f"}],"output":{"member":"declared-bootstrap","bytes":37,"sha256":"9c1a7971d5bc27252d5c44637440540e152e2b3cb83349ba697cd6ff25d2469f","mode":493},"execution":{"observationClass":"synthetic-model","attempt":"33333333333333333333333333333333","toolSha256":"98a9c7fed9c78e80fdf4ecae058e175ed351c9e7861ce86b262110dcd580fb9d","started":true,"exitCode":0,"inputClosureSha256":"cf2be93f465c6be06181a8104583433ffcbdd82c2300e6cee10ef62f90b8c539","outputReadbackSha256":"9c1a7971d5bc27252d5c44637440540e152e2b3cb83349ba697cd6ff25d2469f","settled":true},"provenanceReference":"synthetic-only:declared-bootstrap"}\n',
  '{"format":"source-stageb-producer-evidence","version":1,"evidenceClass":"synthetic-source-fixture","id":"declared-configure","sourceSha":"1111111111111111111111111111111111111111","buildSha":"1111111111111111111111111111111111111111","buildId":"synthetic-b2-20261026","recipe":"source-copy-v1","entry":"fixture/source/configure.txt","inputs":[{"role":"source-file","path":"fixture/source/configure.txt","bytes":37,"sha256":"7ab303020037cc7a6256ee924acac298fa94f31aa74e1d4b23726d33d0f8c95f"}],"output":{"member":"declared-configure","bytes":37,"sha256":"7ab303020037cc7a6256ee924acac298fa94f31aa74e1d4b23726d33d0f8c95f","mode":493},"execution":{"observationClass":"synthetic-model","attempt":"33333333333333333333333333333333","toolSha256":"98a9c7fed9c78e80fdf4ecae058e175ed351c9e7861ce86b262110dcd580fb9d","started":true,"exitCode":0,"inputClosureSha256":"da54ac0d71231ad10a3abcd7e39c7b34eb0755e57951b3dfb8d2e9876d67bfd3","outputReadbackSha256":"7ab303020037cc7a6256ee924acac298fa94f31aa74e1d4b23726d33d0f8c95f","settled":true},"provenanceReference":"synthetic-only:declared-configure"}\n',
  '{"format":"source-stageb-producer-evidence","version":1,"evidenceClass":"synthetic-source-fixture","id":"shared-launch-authority","sourceSha":"1111111111111111111111111111111111111111","buildSha":"1111111111111111111111111111111111111111","buildId":"synthetic-b2-20261026","recipe":"configuration-capture-v1","entry":null,"inputs":[{"role":"configuration","path":"fixture/config/shared-launch-authority","bytes":42,"sha256":"03f13626a1c7b8b2670157535c857804645a804b5f6051c735e673921ae7dacf"}],"output":{"member":"shared-launch-authority","bytes":42,"sha256":"03f13626a1c7b8b2670157535c857804645a804b5f6051c735e673921ae7dacf","mode":384},"execution":{"observationClass":"synthetic-model","attempt":"33333333333333333333333333333333","toolSha256":"98a9c7fed9c78e80fdf4ecae058e175ed351c9e7861ce86b262110dcd580fb9d","started":true,"exitCode":0,"inputClosureSha256":"0b0c729cbc11732a6fce8fff6f838e2b5491130e9af165162f1ac1bbc0bc3562","outputReadbackSha256":"03f13626a1c7b8b2670157535c857804645a804b5f6051c735e673921ae7dacf","settled":true},"provenanceReference":"synthetic-only:shared-launch-authority"}\n',
  '{"format":"source-stageb-producer-evidence","version":1,"evidenceClass":"synthetic-source-fixture","id":"shared-restart-authority","sourceSha":"1111111111111111111111111111111111111111","buildSha":"1111111111111111111111111111111111111111","buildId":"synthetic-b2-20261026","recipe":"configuration-capture-v1","entry":null,"inputs":[{"role":"configuration","path":"fixture/config/shared-restart-authority","bytes":43,"sha256":"50e7212f15553f261979f7aee1665a9b0054561611401855bef0dfe09baf5a03"}],"output":{"member":"shared-restart-authority","bytes":43,"sha256":"50e7212f15553f261979f7aee1665a9b0054561611401855bef0dfe09baf5a03","mode":384},"execution":{"observationClass":"synthetic-model","attempt":"33333333333333333333333333333333","toolSha256":"98a9c7fed9c78e80fdf4ecae058e175ed351c9e7861ce86b262110dcd580fb9d","started":true,"exitCode":0,"inputClosureSha256":"9a460e643c627b1f54073ba6c2f0f649c65c645c41fdec99fb8bb482b212a34e","outputReadbackSha256":"50e7212f15553f261979f7aee1665a9b0054561611401855bef0dfe09baf5a03","settled":true},"provenanceReference":"synthetic-only:shared-restart-authority"}\n',
];

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
interface VerifiedTool {
  name: string;
  path: string;
  device: string;
  inode: string;
  uid: number;
  gid: number;
  bytes: number;
  sha256: string;
}
function packet() {
  return {
    facility: Buffer.from(facilityText),
    roster: Buffer.from(rosterText),
    producers: producerTexts.map((body) => Buffer.from(body)),
  };
}
test('fixture policy decodes the complete closed twelve-producer source packet', () => {
  const proposed = packet();
  const policy = decodeSourceFixturePolicy(proposed.facility, proposed.roster, proposed.producers);
  expect(policy.roster.members.length).toBe(12);
  expect(policy.facility.limits.resources).toBe(178);
  expect(policy.producers.map((producer) => producer.output.member)).toEqual([
    'prod-swap',
    'prod-smoke',
    'dev-swap',
    'dev-smoke',
    'dev-poller',
    'dev-loader',
    'dev-interpreter',
    'declared-manual-launcher',
    'declared-bootstrap',
    'declared-configure',
    'shared-launch-authority',
    'shared-restart-authority',
  ]);
});
for (const fault of [
  'extra-field',
  'noncanonical',
  'unknown-producer',
  'missing-producer',
  'producer-byte',
  'duplicate-destination',
  'wrong-fixed-destination',
  'nested-group',
  'runtime-mode',
  'extra-runtime-input',
])
  test(`fixture policy refuses ${fault} before native use`, () => {
    const proposed = packet();
    const facility = JSON.parse(facilityText) as SourceFixtureAuthority;
    const roster = JSON.parse(rosterText) as SourceFixtureRoster;
    const producers = producerTexts.map((body) => JSON.parse(body) as SourceProducerEvidence);
    if (fault === 'extra-field') Object.assign(facility, { allowNative: true });
    if (fault === 'noncanonical') proposed.facility = Buffer.from(facilityText + ' ');
    if (fault === 'unknown-producer') roster.members[0].producer.id = 'unknown';
    if (fault === 'missing-producer') proposed.producers.pop();
    if (fault === 'producer-byte') proposed.producers[0][30] ^= 1;
    if (fault === 'duplicate-destination')
      roster.members[1].destination = roster.members[0].destination;
    if (fault === 'wrong-fixed-destination')
      roster.members[0].destination = '/home/puni1/wbs/bin/other.js';
    if (fault === 'nested-group') facility.groups[6].anchor = 'declared-parent-1';
    if (fault === 'runtime-mode') facility.groups[4].mode = 448;
    if (fault === 'extra-runtime-input')
      producers[6].inputs.push({ ...producers[6].inputs[0], role: 'configuration' });
    if (fault !== 'noncanonical') proposed.facility = Buffer.from(JSON.stringify(facility) + '\n');
    proposed.roster = Buffer.from(JSON.stringify(roster) + '\n');
    if (fault === 'extra-runtime-input')
      proposed.producers = producers.map((body) => Buffer.from(JSON.stringify(body) + '\n'));
    expect(() =>
      decodeSourceFixturePolicy(proposed.facility, proposed.roster, proposed.producers),
    ).toThrow();
  });

import {
  buildSourceFixtureBootstrap,
  buildSourceFixtureMigrationWorker,
} from './source-stageb-fixture-bootstrap';
test('fixed assembler builds the actual migration worker before any whole-package commitments', async () => {
  const facility = JSON.parse(facilityText) as SourceFixtureAuthority;
  const built = await buildSourceFixtureMigrationWorker({
    version: 1,
    sourceSha: facility.sourceSha,
    workflowSha: facility.workflowSha,
    nonce: facility.nonce,
    migrationManifestSha256: facility.migration.manifestSha256,
    envelope: facility.migration.envelope,
    databases: facility.migration.databases,
  });
  expect(built.bytes.byteLength).toBeGreaterThan(1000);
  expect(built.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(
    built.runtimeImports.every(
      (path) =>
        path.startsWith('node:') ||
        ['bun:sqlite', 'bun:ffi', 'fs', 'path', 'os', 'crypto'].includes(path),
    ),
  ).toBe(true);
  const scanned = new Bun.Transpiler({ loader: 'js', target: 'bun' }).scan(built.bytes);
  expect([...scanned.exports].sort()).toEqual([
    'decodeSourceMigrationFrames',
    'encodeSourceMigrationFrame',
  ]);
}, 20000);

import { spyOn } from 'bun:test';

import * as startupFixture from '../src/fixtures/source-startup';
import {
  fixture as createB1Fixture,
  hash as fixtureHash,
  json as fixtureJson,
  slots as fixtureSlots,
} from './source-stageb-artifacts.test';

/** Builds actual private source artifacts; synthetic writer outputs are inert, while the fixed worker/Bun are real. */
export async function createConstructionFixture() {
  const fs = await import('node:fs/promises');
  const originalGit = startupFixture.git;
  const mappings: Record<string, string | undefined> = {
    'dev-poller': 'bin/dev-poll.sh',
    'dev-loader': 'bin/dev-poll-sync.sh',
    'declared-manual-launcher': 'fixture/source/manual-launcher.txt',
    'declared-bootstrap': 'fixture/source/bootstrap.txt',
    'declared-configure': 'fixture/source/configure.txt',
  };
  const intercept = spyOn(startupFixture, 'git').mockImplementation(async (cwd, ...argv) => {
    if (argv[0] === 'init') {
      for (const [member, path] of Object.entries(mappings)) {
        if (path === undefined) throw Error('fixture source path absent');
        await fs.mkdir(cwd + '/' + path.slice(0, path.lastIndexOf('/')), {
          recursive: true,
          mode: 0o755,
        });
        await fs.writeFile(cwd + '/' + path, 'inert source ' + member + '\n', { mode: 0o755 });
      }
      await fs.writeFile(cwd + '/bun.lock', 'inert source lock\n');
    }
    if (argv[0] === 'init') {
      const first = cwd + '/apps/wbs/be-01/drizzle/20261022211000_add_external_dependencies';
      await fs.writeFile(
        first + '/migration.sql',
        '-- foreign-keys-off-rebuild\nCREATE TABLE external_dependency (id TEXT PRIMARY KEY);\n',
      );
      await fs.writeFile(first + '/down.sql', 'DROP TABLE external_dependency;\n');
      for (const member of ['migration.sql', 'down.sql'])
        await fs.copyFile(
          import.meta.dir +
            '/../../../apps/wbs/be-01/drizzle/20261022212000_add_cross_project_dependency_activation/' +
            member,
          cwd +
            '/apps/wbs/be-01/drizzle/20261022212000_add_cross_project_dependency_activation/' +
            member,
        );
    }
    return await originalGit(cwd, ...argv);
  });
  let owned: Awaited<ReturnType<typeof createB1Fixture>>;
  try {
    owned = await createB1Fixture();
  } finally {
    intercept.mockRestore();
  }
  const startup = JSON.parse(
    owned.artifacts['startup-manifest'].toString(),
  ) as Mutable<SourceStartupManifest>;
  for (const entry of startup.entries)
    if (
      entry.root === 'source' &&
      entry.kind !== 'symlink' &&
      Object.values(mappings).includes(entry.path)
    ) {
      entry.mode = 0o755;
      await fs.chmod(owned.source + '/' + entry.path, 0o755);
    }
  owned.artifacts['startup-manifest'] = fixtureJson(startup);
  const authority = JSON.parse(rosterText) as SourceFixtureRoster;
  const facility = JSON.parse(facilityText) as SourceFixtureAuthority;
  const producers = producerTexts.map((body) => JSON.parse(body) as SourceProducerEvidence);
  const runtime = await fs.readFile(process.execPath);
  const solverDelivery = owned.artifacts['solver-artifacts'];
  const solverHeaderLength = solverDelivery.readUInt32BE();
  const solverHeader = JSON.parse(
    solverDelivery.subarray(4, 4 + solverHeaderLength).toString(),
  ) as { members: { bytes: number }[] };
  let offset = 4 + solverHeaderLength;
  const solverBodies = solverHeader.members.map((member: { bytes: number }) => {
    const body = solverDelivery.subarray(offset, offset + member.bytes);
    offset += member.bytes;
    return body;
  });
  solverBodies[0] = runtime;
  solverBodies[3] = await fs.readFile(
    import.meta.dir + '/../../../deploy/solver-supervisor/wbs-solver-supervisor.service',
  );
  const pack = (header: unknown, bodies: Buffer[]) => {
    const prefix = fixtureJson(header);
    const size = Buffer.alloc(4);
    size.writeUInt32BE(prefix.length);
    return Buffer.concat([size, prefix, ...bodies]);
  };
  solverHeader.members.forEach((member: { bytes: number }, index: number) => {
    member.bytes = solverBodies[index].length;
  });
  owned.artifacts['solver-artifacts'] = pack(solverHeader, solverBodies);
  const prerequisites = JSON.parse(owned.artifacts.prerequisites.toString()) as {
    activation: Mutable<CompleteDependencyActivationRequest>;
  };
  const migrationManifest = JSON.parse(owned.artifacts['migration-manifest'].toString()) as {
    migrations: {
      name: string;
      migration: { size: number; sha256: string };
      down: { size: number; sha256: string };
      snapshot: unknown;
    }[];
  };
  for (const migration of migrationManifest.migrations) {
    for (const member of ['migration', 'down'] as const) {
      const bytes = await fs.readFile(
        owned.source +
          '/apps/wbs/be-01/drizzle/' +
          migration.name +
          '/' +
          (member === 'migration' ? 'migration.sql' : 'down.sql'),
      );
      migration[member] = { size: bytes.length, sha256: fixtureHash(bytes) };
    }
  }
  owned.artifacts['migration-manifest'] = fixtureJson(migrationManifest);
  prerequisites.activation.migrations.manifestSha256 = fixtureHash(
    owned.artifacts['migration-manifest'],
  );
  prerequisites.activation.solver.bunSha256 = fixtureHash(runtime);
  prerequisites.activation.solver.unitSha256 = fixtureHash(solverBodies[3]);
  prerequisites.activation.authorities.pins.solver = { ...prerequisites.activation.solver };
  // Expected inputs precede original I. The collector still obtains its own raw observations.
  const machine = 'a'.repeat(32);
  facility.machineIdSha256 = fixtureHash(machine);
  prerequisites.activation.authorities.pins.hostMachineIdSha256 = fixtureHash(machine + '\n');
  const canonicalLaunch = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalLaunch);
    if (value !== null && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
          .map(([key, field]) => [key, canonicalLaunch(field)]),
      );
    return value;
  };
  const cron = [
    { source: '/etc/anacrontab', state: 'absent' },
    { source: '/etc/crontab', state: 'present', sha256: fixtureHash('') },
    { source: 'crontab:puni1', state: 'absent' },
    { source: 'crontab:root', state: 'absent' },
  ];
  // Literal byte vector from the independent expected-hash ruling, never serializer output.
  const vector =
    '{"cron":[{"source":"/etc/anacrontab","state":"absent"},{"sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","source":"/etc/crontab","state":"present"},{"source":"crontab:puni1","state":"absent"},{"source":"crontab:root","state":"absent"}],"units":[],"version":1}';
  const encodedVector = JSON.stringify(canonicalLaunch({ version: 1, cron, units: [] }));
  expect(encodedVector).toBe(vector);
  expect(fixtureHash(encodedVector)).toBe(
    'f15d679e15a355cb8ec481e34d0d7099df810be36d2521a33720d101a541086c',
  );
  const launch = JSON.stringify(
    canonicalLaunch({
      version: 1,
      cron,
      units: [
        {
          manager: 'user',
          name: 'wbs-solver-supervisor.service',
          canonicalId: 'wbs-solver-supervisor.service',
          names: ['wbs-solver-supervisor.service'],
          unitFileState: 'enabled',
          loadState: 'loaded',
          fragment: {
            path: '/home/puni1/.config/systemd/user/wbs-solver-supervisor.service',
            sha256: fixtureHash(solverBodies[3]),
          },
          dropIns: [],
          transient: false,
          commands: [
            {
              property: 'ExecStart',
              path: '/home/puni1/.local/lib/wbs-solver/bun',
              argv: [
                '/home/puni1/.local/lib/wbs-solver/bun',
                '/home/puni1/.local/lib/wbs-solver/solver-supervisor.js',
                '--config=/home/puni1/.config/wbs-solver/solver-supervisor.json',
                '--admission=policy',
              ],
              ignoreFailure: false,
            },
            {
              property: 'ExecStopPost',
              path: '/bin/rm',
              argv: ['/bin/rm', '-f', '/run/user/1000/wbs-solver/supervisor.sock'],
              ignoreFailure: false,
            },
          ],
          triggers: [],
          triggeredBy: [],
        },
      ],
    }),
  );
  if (Array.from(launch).some((character) => character.charCodeAt(0) > 127))
    throw Error('expected launch fixture must remain ASCII');
  prerequisites.activation.authorities.pins.launchConfigurationSha256 = fixtureHash(launch);
  prerequisites.activation.source.pins.manifestSha256 = fixtureHash(
    owned.artifacts['startup-manifest'],
  );
  const writerBodies = await Promise.all(
    authority.members.map(async (row: { member: string }) => {
      const path = mappings[row.member];
      return path === undefined
        ? row.member === 'dev-interpreter'
          ? runtime
          : Buffer.from('inert output ' + row.member + '\n')
        : await fs.readFile(owned.source + '/' + path);
    }),
  );
  authority.sourceSha = owned.sha;
  authority.buildSha = owned.sha;
  authority.buildId = 'synthetic-b2-current';
  const sourcePin = {
    bytes: owned.artifacts['source-tree'].length,
    sha256: fixtureHash(owned.artifacts['source-tree']),
  };
  const dependenciesPin = {
    bytes: owned.artifacts.dependencies.length,
    sha256: fixtureHash(owned.artifacts.dependencies),
  };
  const lock = await fs.readFile(owned.source + '/bun.lock');
  for (const [index, producer] of producers.entries()) {
    const row = authority.members[index];
    const body = writerBodies[index];
    producer.sourceSha = owned.sha;
    producer.buildSha = owned.sha;
    producer.buildId = authority.buildId;
    producer.output = {
      member: row.member,
      bytes: body.length,
      sha256: fixtureHash(body),
      mode: row.mode,
    };
    for (const input of producer.inputs) {
      const pin =
        input.role === 'source-tree'
          ? sourcePin
          : input.role === 'dependencies'
            ? dependenciesPin
            : input.role === 'lockfile'
              ? { bytes: lock.length, sha256: fixtureHash(lock) }
              : input.role === 'bun-runtime'
                ? { bytes: runtime.length, sha256: fixtureHash(runtime) }
                : { bytes: body.length, sha256: fixtureHash(body) };
      input.bytes = pin.bytes;
      input.sha256 = pin.sha256;
    }
    producer.execution.inputClosureSha256 = fixtureHash(fixtureJson(producer.inputs));
    producer.execution.toolSha256 = fixtureHash(runtime);
    producer.execution.outputReadbackSha256 = fixtureHash(body);
    const bytes = fixtureJson(producer);
    row.producer = { id: producer.id, bytes: bytes.length, sha256: fixtureHash(bytes) };
  }
  const writer = {
    version: 1,
    sourceSha: owned.sha,
    buildSha: owned.sha,
    buildId: authority.buildId,
    members: authority.members.map(
      (row: { member: string; origin: string; destination: string }, index: number) => ({
        member: row.member,
        origin: row.origin,
        hostPath: row.destination,
        reviewed: '/synthetic-reviewed/' + row.member,
        installed: '/synthetic-installed/' + row.member,
        sha256: fixtureHash(writerBodies[index]),
      }),
    ),
  };
  const writerManifestContents = JSON.stringify(writer);
  prerequisites.activation.authorities.pins.writerManifestSha256 =
    fixtureHash(writerManifestContents);
  owned.artifacts['installed-authority-manifest'] = pack(
    {
      format: 'source-stageb-authority-files',
      version: 1,
      writerManifestContents,
      members: authority.members.map((row: { member: string; mode: number }, index: number) => ({
        member: row.member,
        bytes: writerBodies[index].length,
        mode: row.mode,
      })),
    },
    writerBodies,
  );
  owned.artifacts.prerequisites = fixtureJson(prerequisites);
  const originalImages = JSON.parse(owned.artifacts.prerequisites.toString()) as {
    images: {
      gatewayImageId: string;
      caddy: { reference: string; imageId: string };
      solver: { reference: string; imageId: string }[];
    };
  };
  const originalSolver = JSON.parse(solverBodies[2].toString()) as {
    images: { solverImage: string }[];
  };
  facility.configurationSha256 = fixtureHash(owned.artifacts.configuration);
  facility.images = [
    {
      role: 'backend',
      reference: prerequisites.activation.prod.backend.image,
      imageId: prerequisites.activation.migrations.candidateImageId,
    },
    {
      role: 'gateway',
      reference: prerequisites.activation.prod.gateway.image,
      imageId: originalImages.images.gatewayImageId,
    },
    {
      role: 'source',
      reference: prerequisites.activation.source.runtimeReference,
      imageId: prerequisites.activation.source.pins.runtimeImageId,
    },
    { role: 'caddy', ...originalImages.images.caddy },
    ...(['solver-prod', 'solver-dev'] as const).map((role, index) => {
      const reference = originalSolver.images[index].solverImage;
      const image = originalImages.images.solver.find((image) => image.reference === reference);
      if (image === undefined) throw Error('original proposed solver image absent');
      return { role, ...image };
    }),
  ];
  facility.sourceSha = owned.sha;
  facility.runtime.bytes = runtime.length;
  facility.runtime.sha256 = fixtureHash(runtime);
  const directory = await fs.mkdtemp(owned.root + '/constructor-');
  await fs.chmod(directory, 0o700);
  for (const leaf of ['coordinator', 'registry', 'journal-parent', 'scratch'])
    await fs.mkdir(directory + '/' + leaf, { mode: 0o700 });
  const coordinator = await fs.lstat(directory + '/coordinator', { bigint: true });
  facility.coordinator = {
    directory: directory + '/coordinator',
    device: String(coordinator.dev),
    inode: String(coordinator.ino),
    uid: Number(coordinator.uid),
    gid: Number(coordinator.gid),
    mode: 448,
  };
  facility.migration.manifestSha256 = prerequisites.activation.migrations.manifestSha256;
  facility.migration.envelope =
    '/home/puni1/wbs/state/dependency-artifacts/' + facility.migration.manifestSha256;
  const migrationPackage = {
    version: 1 as const,
    sourceSha: owned.sha,
    workflowSha: facility.workflowSha,
    nonce: facility.nonce,
    migrationManifestSha256: facility.migration.manifestSha256,
    envelope: facility.migration.envelope,
    databases: facility.migration.databases,
  };
  const worker = await buildSourceFixtureMigrationWorker(migrationPackage);
  facility.worker.bytes = worker.bytes.length;
  facility.worker.sha256 = worker.sha256;
  return {
    owned,
    directory,
    facilityBytes: fixtureJson(facility),
    rosterBytes: fixtureJson(authority),
    producerBytes: producers.map((body) => fixtureJson(body)),
    worker,
    migrationPackage,
    prerequisites,
  };
}

test('fixed construction fixture joins actual B1 source and retained runtime to all lexical producers', async () => {
  const proposed = await createConstructionFixture();
  const policy = decodeSourceFixturePolicy(
    proposed.facilityBytes,
    proposed.rosterBytes,
    proposed.producerBytes,
  );
  expect(policy.facility.runtime.bytes).toBeGreaterThan(1000000);
  expect(policy.facility.worker.sha256).toBe(proposed.worker.sha256);
  expect(policy.roster.members.filter((row) => row.origin === 'source').length).toBe(5);
}, 30000);

/**
 * Uses Linux CLOCK_MONOTONIC for comparable parent/child cutoffs, independent of Bun time origins.
 * Requires fixed root-owned mode0755 libc/parents, no loader overrides and exact ABI/bytes.
 * Initialization opens its validation FD read-only; sampling retains its library and owned 16-byte storage.
 * Acquisition/sample failures retain original causes/resources and remain sticky after repair.
 * Proof controls use source-derived metadata/inert-FFI facades (P1–P15, f0f2b1b1),
 * separately from protected historical provider fault pairs: six modes nativeCalls0,
 * pointer omission one safe native call; two-child actual sampling brackets are separate (d53cbca8).
 * Grouped predicate and identity-loop omissions prove those expressions, not every operand/key.
 */
const commonClockModuleSource = `
import {dlopen,ptr} from 'bun:ffi';
import {createHash} from 'node:crypto';
import {openSync,closeSync,constants,fstatSync,lstatSync,readSync,realpathSync} from 'node:fs';
import {endianness} from 'node:os';
const libraryPath='/usr/lib/x86_64-linux-gnu/libc.so.6';
const libraryHash='8db37cf3f2169f59a0f07ef1fea308c35656668c64c8ff294e1860f4121eb161';
const maximumNs=9223372036854775807n;
const storage=new BigInt64Array(2);
const backing=storage.buffer;
const retainedFailures=[];
let binding;
let pointer;
let failure;
let previous;
function refuse(message){throw Error('fixed monotonic clock '+message);}
/** Proof: P6 initial/before-load/after-load drift plus loop omission reached protected read/load/pointer boundaries (f0f2b1b1); facade expression coverage. */
function sameFile(before,after){
 for(const key of ['dev','ino','mode','uid','gid','nlink','size','mtimeNs','ctimeNs'])
  if(typeof before[key]!=='bigint'||typeof after[key]!=='bigint'||before[key]!==after[key])refuse('library identity drift');
}
/** Proof: P3 parent-uid facade fault refused; omitted grouped premise reached protected canonical observer (f0f2b1b1). */
function parents(){
 return ['/','/usr','/usr/lib','/usr/lib/x86_64-linux-gnu'].map(path=>{
  const identity=lstatSync(path,{bigint:true});
  if(!identity.isDirectory()||identity.uid!==0n||identity.gid!==0n||(identity.mode&4095n)!==493n||realpathSync(path)!==path)refuse('read-only parent premise');
  return {path,identity};
 });
}
/** Proof: P7 before-load/after-load facade drift refused; omitted continuity loop reached protected load/pointer observers (f0f2b1b1). */
function sameParents(original){
 for(const before of original){
  const after=lstatSync(before.path,{bigint:true});
  if(!after.isDirectory()||after.dev!==before.identity.dev||after.ino!==before.identity.ino||after.uid!==before.identity.uid||after.gid!==before.identity.gid||after.mode!==before.identity.mode||realpathSync(before.path)!==before.path)refuse('parent continuity');
 }
}
function initialize(){
 // Proof: P13 acquisition-sticky omission retried after dependency repair; ordinary rethrew the exact original error (f0f2b1b1).
 if(failure!==undefined)throw failure;
 // Proof: P13 single-cache omission acquired/loaded twice; ordinary used one acquisition for two inert samples (f0f2b1b1).
 if(binding!==undefined)return;
 const original={descriptor:undefined,identity:undefined,parents:undefined,library:undefined,storage,backing};
 const primary=[];
 try{
  // Proof: P1 platform facade fault plus grouped ABI omission reached the protected parent observer (f0f2b1b1).
  if(process.platform!=='linux'||process.arch!=='x64'||endianness()!=='LE'||BigInt64Array.BYTES_PER_ELEMENT!==8||storage.byteLength!==16||storage.byteOffset!==0||backing.byteLength!==16)refuse('unsupported ABI');
  // Proof: P2 LD-key existed only in facade; omitted loader check reached the protected parent observer (f0f2b1b1).
  if(Object.keys(process.env).some(key=>key.startsWith('LD_')))refuse('loader override');
  original.parents=parents();
  // Proof: P4 canonical-name facade fault plus omission reached the protected open observer (f0f2b1b1).
  if(realpathSync(libraryPath)!==libraryPath)refuse('library canonical path');
  const named=lstatSync(libraryPath,{bigint:true});
  // Proof: P5 named-size facade fault plus grouped metadata omission reached the protected open observer (f0f2b1b1).
  if(!named.isFile()||named.uid!==0n||named.gid!==0n||(named.mode&4095n)!==493n||named.size!==2125328n||named.nlink!==1n)refuse('library metadata');
  original.descriptor=openSync(libraryPath,constants.O_RDONLY|constants.O_NOFOLLOW);
  original.identity=fstatSync(original.descriptor,{bigint:true});sameFile(named,original.identity);
  const hash=createHash('sha256');let offset=0;const chunk=Buffer.alloc(65536);let header;
  while(offset<2125328){
   const count=readSync(original.descriptor,chunk,0,Math.min(chunk.length,2125328-offset),offset);
  // Proof: P8 zero count plus bounded-read omission reached the independently stopped second read; no loop (f0f2b1b1).
   if(!Number.isSafeInteger(count)||count<=0||count>Math.min(chunk.length,2125328-offset))refuse('bounded library read');
   if(offset===0)header=Buffer.from(chunk.subarray(0,Math.min(count,20)));
   hash.update(chunk.subarray(0,count));offset+=count;
  }
  // Proof: P9 trailing facade fault refused; whole bytes-expression omission reached protected load without a trailing read (f0f2b1b1).
  if(readSync(original.descriptor,chunk,0,1,2125328)!==0||hash.digest('hex')!==libraryHash)refuse('library bytes');
  // Proof: P10 ELF-class facade fault plus grouped header omission reached the protected load observer (f0f2b1b1).
  if(header===undefined||header.length<20||header[0]!==127||header[1]!==69||header[2]!==76||header[3]!==70||header[4]!==2||header[5]!==1||header[16]!==3||header[17]!==0||header[18]!==62||header[19]!==0)refuse('library ELF ABI');
  sameFile(original.identity,fstatSync(original.descriptor,{bigint:true}));sameFile(original.identity,lstatSync(libraryPath,{bigint:true}));sameParents(original.parents);
  original.library=dlopen('/usr/lib/x86_64-linux-gnu/libc.so.6',{clock_gettime:{args:['i32','ptr'],returns:'i32'}});
  sameFile(original.identity,fstatSync(original.descriptor,{bigint:true}));sameFile(original.identity,lstatSync(libraryPath,{bigint:true}));sameParents(original.parents);
  // Proof: P11 extra symbol facade fault plus grouped membership omission reached the protected pointer observer (f0f2b1b1).
  if(original.library===undefined||original.library===null||typeof original.library.symbols!=='object'||original.library.symbols===null||Object.keys(original.library.symbols).join(',')!=='clock_gettime'||typeof original.library.symbols.clock_gettime!=='function')refuse('symbol membership');
  pointer=ptr(storage);
  // Proof: pointer ordinary effects0/nativeCalls0; omission effects1/nativeCalls1 with fixed clock1/independent valid owned pointer, then named assertion (d53cbca8).
  if(!Number.isSafeInteger(pointer)||pointer<=0||pointer%8!==0)refuse('owned pointer alignment');
 }catch(cause){primary.push(cause);}
 const cleanup=[];
 // Proof: P12 after-open close omission retained one original FD before guardian; close-only omission sampled; primary-close omission lost the second exact cause (f0f2b1b1).
 if(original.descriptor!==undefined)try{closeSync(original.descriptor);original.descriptor=undefined;}catch(cause){cleanup.push(cause);}
 if(primary.length!==0||cleanup.length!==0){
  failure=new AggregateError([...primary,...cleanup],'fixed monotonic clock acquisition failed',{cause:primary[0]});
  // Proof: P14 ptr injected cause plus record omission kept the cause but records=0; ordinary retained exact original acquisition refs (f0f2b1b1).
  retainedFailures.push({failure,original});throw failure;
 }
 binding=original.library;
}
export function readMonotonicNs(){
 initialize();
 try{
  // Proof: P15 unwritten second output plus reset omission reused the stale valid sample and effects=1; ordinary refused fields (f0f2b1b1).
  storage[0]=-1n;storage[1]=-1n;
  const code=binding.symbols.clock_gettime(1,pointer);
  // Proof: protected return-failure provider pair injected status with nativeCalls0/libraries1; guard omission reached effects1 (d53cbca8).
  if(code!==0)refuse('return status');
  const seconds=storage[0],nanoseconds=storage[1];
  // Proof: protected negative-sec/invalid-nsec/unwritten provider pairs inject fields with nativeCalls0/libraries1; grouped-guard omissions reached effects1 (d53cbca8).
  if(typeof seconds!=='bigint'||typeof nanoseconds!=='bigint'||seconds<0n||nanoseconds<0n||nanoseconds>=1000000000n)refuse('timespec fields');
  // Proof: protected arithmetic provider pair injected overflow with nativeCalls0/libraries1; omission reached effects1, ordinary refused (d53cbca8).
  if(seconds>(maximumNs-nanoseconds)/1000000000n)refuse('timespec arithmetic');
  const sample=seconds*1000000000n+nanoseconds;
  // Proof: protected regression provider pair injected two samples with nativeCalls0/libraries1; omission reached effects1, ordinary refused (d53cbca8).
  if(previous!==undefined&&sample<previous)refuse('sample regression');
  previous=sample;return sample;
 // Proof: P13 sample-sticky omission retried; P14 sample record omission kept the exact cause but lost retained refs (f0f2b1b1).
 }catch(cause){failure=new AggregateError([cause],'fixed monotonic clock sample failed',{cause});retainedFailures.push({failure,binding,storage,backing,pointer});throw failure;}
}
`;
interface CommonClockProvider {
  readonly readMonotonicNs: () => bigint;
}
let ownedProbeClock: Promise<CommonClockProvider> | undefined;
/** Caches the fixed provider promise, including rejection; namespace use requires its sole callable export. */
function loadOwnedProbeClock(): Promise<CommonClockProvider> {
  // Proof: C1 promise-cache omission made two loads/unequal promises; ordinary shared the promise (f0f2b1b1).
  if (ownedProbeClock === undefined) {
    // Boundary: the URL contains only the exact fixed provider above, never caller source.
    const url =
      'data:text/javascript;base64,' + Buffer.from(commonClockModuleSource).toString('base64');
    ownedProbeClock = import(url).then((namespace: unknown) => {
      if (
        typeof namespace !== 'object' ||
        namespace === null ||
        Object.keys(namespace).join(',') !== 'readMonotonicNs' ||
        !('readMonotonicNs' in namespace) ||
        typeof namespace.readMonotonicNs !== 'function'
      )
        // Proof: C1 extra-export omission reached the protected namespace-use observer; ordinary refused at loads1/uses0 (f0f2b1b1).
        throw Error('fixed clock provider export refused');
      return namespace as CommonClockProvider;
    });
  }
  return ownedProbeClock;
}
/**
 * Binds the private specifier to these exact provider bytes in generated helpers.
 * Proof: C2 resolver-path/loader-source mutations failed their actual virtual-source binding oracles
 * (50f4c30c; ordinary resolver at f0f2b1b1). Build output was inspected, never imported.
 */
function provideCommonClockModule(build: PluginBuilder): void {
  build.onResolve({ filter: /^stageb:monotonic-clock$/ }, () => ({
    path: 'monotonic-clock',
    namespace: 'stageb-private-clock',
  }));
  build.onLoad({ filter: /^monotonic-clock$/, namespace: 'stageb-private-clock' }, () => ({
    contents: commonClockModuleSource,
    loader: 'js',
  }));
}

/** Shared exact bounded original graph source; generated consumers only forbid teardown. */
export function canonicalRetainedErrorSource() {
  return String.raw`
function inspectRawRetainedError(original){
 const pending=[{value:original,depth:0,ancestors:new Set()}];const visited=new Set();const references=[];const messages=[];
 function unknown(reason){return {retained:undefined,unsupported:reason,references,messages};}
 while(pending.length!==0){
  const {value,depth,ancestors}=pending.pop();
  if(value===undefined)continue;
  if((typeof value!=='object'&&typeof value!=='function')||value===null)return unknown('non-error record');
  if(modelIsProxy(value)){references.push(value);return unknown('proxy error record');}
  if(ancestors.has(value))return unknown('cyclic error record');
  if(visited.has(value))continue;
  if(visited.size>=256||depth>32)return unknown('error graph bound');
  visited.add(value);references.push(value);
  if(RetainedProbeLifetime.recognizes(value))return {retained:value,unsupported:undefined,references,messages};
  if(!(value instanceof Error))return unknown('non-error object');
  const descriptors=Object.getOwnPropertyDescriptors(value);const message=descriptors.message;
  if(message!==undefined&&(!Object.hasOwn(message,'value')||typeof message.value!=='string'))return unknown('unsupported error message');
  if(message!==undefined)messages.push(message.value);
  const nextAncestors=new Set(ancestors);nextAncestors.add(value);
  const cause=descriptors.cause;
  if(cause!==undefined){if(!Object.hasOwn(cause,'value'))return unknown('accessor error cause');if(pending.length>=256)return unknown('error graph bound');pending.push({value:cause.value,depth:depth+1,ancestors:nextAncestors});}
  if(value instanceof AggregateError){
   const errors=descriptors.errors;if(errors===undefined||!Object.hasOwn(errors,'value'))return unknown('unsupported aggregate errors');
   const values=errors.value;if(modelIsProxy(values)||!Array.isArray(values))return unknown('unsupported aggregate array');
   const fields=Object.getOwnPropertyDescriptors(values);const length=fields.length;
   if(length===undefined||!Object.hasOwn(length,'value')||!Number.isSafeInteger(length.value)||length.value<0||length.value>256)return unknown('aggregate array bound');
   if(pending.length+length.value>256)return unknown('error graph bound');
   for(let index=length.value-1;index>=0;index--){const entry=fields[String(index)];if(entry===undefined||!Object.hasOwn(entry,'value'))return unknown('accessor or sparse aggregate entry');pending.push({value:entry.value,depth:depth+1,ancestors:nextAncestors});}
  }
 }
 return {retained:undefined,unsupported:undefined,references,messages};
}
`;
}

/** Proof: the actual singleton's WeakMap omission falsely recognized Object.create lookalikes; exact nominal control restored GREEN (034e54ff receipt). */
const retainedLifetimeModuleSource = `
const records = new WeakMap();
const retained = new Set();
export class RetainedProbeLifetime extends AggregateError {
  constructor(message, failures, references) {
    super([...failures], message);
    records.set(this, [...references]);
    retained.add(this);
  }
  static recognizes(value) { return value instanceof RetainedProbeLifetime && records.has(value); }
  retain(references) {
    const original = records.get(this);
    if (original === undefined) throw Error('foreign retained lifetime refused');
    original.push(...references);
  }
}
`;
function provideRetainedLifetimeModule(build: PluginBuilder): void {
  build.onResolve({ filter: /^stageb:retained-lifetime$/ }, () => ({
    path: 'retained-lifetime',
    namespace: 'stageb-private-lifetime',
  }));
  build.onLoad({ filter: /^retained-lifetime$/, namespace: 'stageb-private-lifetime' }, () => ({
    contents: retainedLifetimeModuleSource,
    loader: 'js',
  }));
}
/** Preserves the original per-invocation work errors before a failed common-clock read; nominal retention stops later boundaries. */
const lowerLifetimeConsumerSource = `
async function runOwnedLowerScope(work, cleanup, references, cutoffNs) {
  // Proof: C6 undefined omission admitted protected work and two samples; ordinary retained original refs with work/cleanup/publication0 (50f4c30c).
  if (typeof cutoffNs !== 'bigint') return new RetainedProbeLifetime('original enclosing cutoff absent',[Error('original enclosing cutoff absent')],references());
  // Proof: C7 separate-invocations shared-array omission failed the second call exact [K] length; ordinary excluded prior W (50f4c30c).
  const failures = [];
  // Proof: C7 second/third-clock-work-error lost-primary mutations retained only [K]; ordinary preserved exact [W,K], including an unflattened AggregateError W (50f4c30c).
  const readNow=()=>{try{return readMonotonicNs();}catch(clockFailure){return new RetainedProbeLifetime('original common clock unproved',[...failures,clockFailure],references());}};
  // Proof: C7 first-clock nominal-stop omission entered protected work; ordinary [K] stopped work/cleanup/publication (50f4c30c).
  let now=readNow();if(RetainedProbeLifetime.recognizes(now))return now;
  // Proof: C7 current-expiry-1 omission crossed protected work; ordinary work0 (50f4c30c); earlier entry proof5da64829 preserved.
  if (now >= cutoffNs) return new RetainedProbeLifetime('enclosing cutoff expired before lower work', [Error('original enclosing cutoff expired')], references());
  let evidence;
  try { evidence = await work(); }
  catch (failure) {
    // Proof: omission reached the protected mock-restoration boundary before the held original reader settled; exact restore kept cleanup/restore zero (034e54ff).
    if (RetainedProbeLifetime.recognizes(failure)) {
      failure.retain(references());
      return failure;
    }
    failures.push(failure);
  }
  // Proof: C7 second-clock-nominal-stop omission entered protected cleanup; ordinary preserved [W,K] before cleanup (50f4c30c).
  now=readNow();if(RetainedProbeLifetime.recognizes(now))return now;
  // Proof: C7 current-expiry-2 omission crossed protected cleanup; ordinary cleanup0 (50f4c30c); earlier entry proof5da64829 preserved.
  if (now >= cutoffNs) return new RetainedProbeLifetime('enclosing cutoff expired before lower cleanup', [...failures, Error('original enclosing cutoff expired')], references());
  try { await cleanup(); }
  catch (failure) {
    return new RetainedProbeLifetime('original lower cleanup remains unproved',
      [...failures, failure], references());
  }
  // Proof: C7 third-clock-nominal-stop omission threw W instead of clock nominal; ordinary preserved [W,K] with publication0 (50f4c30c).
  now=readNow();if(RetainedProbeLifetime.recognizes(now))return now;
  // Proof: C7 current-expiry-3 omission published once; ordinary retained with publication0 (50f4c30c); earlier entry proof5da64829 preserved.
  if (now >= cutoffNs) return new RetainedProbeLifetime('enclosing cutoff expired after lower cleanup', [...failures, Error('original enclosing cutoff expired')], references());
  if (failures.length !== 0) throw failures[0];
  return evidence;
}
`;

const lowerLifetimeFinalizerSource = `
async function finalizeOwnedLowerScope(evidence, keeper, references) {
 if(RetainedProbeLifetime.recognizes(evidence)){
  evidence.retain(references());
  console.error('owned lower lifetime retained; original scopes unresolved');
  await new Promise(()=>{});
 }
 clearInterval(keeper);
 console.log(JSON.stringify(evidence));
}
`;

/** Fixed generated-only public consumer; tracked production bodies retain their signatures. */
async function adaptPublicReleaseSource(
  source: string,
  owner: 'builder' | 'archive',
): Promise<string> {
  const ts = await import('typescript');
  const parsed = ts.createSourceFile(
    owner + '.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  function replace(original: string, before: string, after: string): string {
    if (original.split(before).length !== 2)
      throw Error('public release adaptation anchor differs: ' + before);
    return original.replace(before, after);
  }
  function adapt(name: string, change: (body: string) => string): void {
    const declarations = parsed.statements.filter(
      (node) =>
        (ts.isFunctionDeclaration(node) || ts.isInterfaceDeclaration(node)) &&
        node.name?.text === name,
    );
    const declaration = declarations.at(0);
    if (declarations.length !== 1 || declaration === undefined)
      throw Error('public release adaptation declaration differs: ' + name);
    const original = declaration.getText(parsed);
    source = replace(source, original, change(original));
  }
  if (owner === 'builder') {
    adapt('ConstructionOwnership', (body) =>
      replace(
        body,
        '  construction?: SourceFixtureConstruction;',
        '  readonly refuseRelease: (originals: readonly unknown[], primary?: { cause: unknown }) => void;\n  construction?: SourceFixtureConstruction;',
      ),
    );
    adapt('buildSourcePrerequisites', (body) =>
      replace(
        replace(
          body,
          '  archivePreflight: SourceArchivePreflight,',
          '  archivePreflight: SourceArchivePreflight,\n  refuseRelease: (originals: readonly unknown[], primary?: { cause: unknown }) => void,',
        ),
        'const ownership: ConstructionOwnership = {};',
        'const ownership: ConstructionOwnership = { refuseRelease };',
      ),
    );
    adapt('disposeConstruction', (body) =>
      replace(
        replace(
          body,
          'releaseSourceArchivePreflight(ownership.borrow)',
          'releaseSourceArchivePreflight(ownership.borrow, ownership.refuseRelease, ownership)',
        ),
        'releaseOriginalStaging(ownership.retention)',
        'releaseOriginalStaging(ownership.retention, ownership.refuseRelease, ownership)',
      ),
    );
    adapt('releaseOriginalStaging', (body) =>
      replace(
        replace(
          body,
          'retention: OriginalStagingRetention',
          'retention: OriginalStagingRetention, refuseRelease: (originals: readonly unknown[], primary?: { cause: unknown }) => void, ownership: { primary?: { cause: unknown } }',
        ),
        '  retention.isActive = false;',
        '  refuseRelease([ownership, retention, retention.lifetime], ownership.primary);\n  retention.isActive = false;',
      ),
    );
  } else {
    adapt('releaseSourceArchivePreflight', (body) =>
      replace(
        replace(
          replace(
            body,
            'borrow: SourceArchivePreflightBorrow',
            'borrow: SourceArchivePreflightBorrow, refuseRelease: (originals: readonly unknown[], primary?: { cause: unknown }) => void, ownership: { primary?: { cause: unknown } }',
          ),
          '    const settled = await Promise.allSettled([...lifetime.pending]);',
          '    refuseRelease([ownership, borrow, lifetime, lifetime.pending], ownership.primary);\n    const settled = await Promise.allSettled([...lifetime.pending]);',
        ),
        '    borrows.delete(borrow);',
        '    refuseRelease([ownership, borrow, lifetime, lifetime.pending, settled], ownership.primary);\n    borrows.delete(borrow);',
      ),
    );
  }
  return source;
}

/** Finite public generated call chain: absent or extra adapters refuse before candidate import. */
async function inspectPublicReleaseBindings(source: string): Promise<void> {
  const ts = await import('typescript');
  const parsed = ts.createSourceFile(
    'public-adapted.mjs',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const expected = new Map([
    ['refuseRelease', 3],
    ['refuseRawRelease', 1],
    ['releaseSourceArchivePreflight', 2],
    ['releaseOriginalStaging', 1],
    ['closeRawOriginal', 2],
    ['buildSourcePrerequisites', 1],
    ['runOwnedLowerScope', 1],
    ['preserveHelperWork', 1],
    ['inspectRawRetainedError', 6],
    ['retainHelperFailure', 1],
  ]);
  const counts = new Map<string, number>();
  let classes = 0;
  function visit(node: TypeScriptNode): void {
    if (ts.isClassDeclaration(node) && node.name?.text === 'RetainedProbeLifetime') classes++;
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(parsed);
      if (expected.has(name)) counts.set(name, (counts.get(name) ?? 0) + 1);
      if (
        name === 'buildSourcePrerequisites' &&
        node.arguments.at(5)?.getText(parsed) !== 'refuseRawRelease'
      )
        throw Error('public raw release closure binding differs');
      if (
        name === 'releaseOriginalStaging' &&
        (node.arguments.at(1)?.getText(parsed) !== 'ownership.refuseRelease' ||
          node.arguments.at(2)?.getText(parsed) !== 'ownership')
      )
        throw Error('public B1 release ownership differs');
      if (name === 'releaseSourceArchivePreflight') {
        const closure = node.arguments.at(1)?.getText(parsed),
          ownership = node.arguments.at(2)?.getText(parsed);
        if (!(
          (closure === 'ownership.refuseRelease' && ownership === 'ownership') ||
          (closure === 'refuseHelperRelease' && ownership === 'helperOwnership')
        ))
          throw Error('public A2 release ownership differs');
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  for (const [name, count] of expected)
    if (counts.get(name) !== count) throw Error('public adapted call inventory differs: ' + name);
  if (classes !== 1) throw Error('public nominal singleton binding differs');
}

export async function runOwnedConstructionProbe(
  proposed: Awaited<ReturnType<typeof createConstructionFixture>>,
  extraBuilderSource: string,
  fault = '',
  consumerMode: 'lower' | 'public' = 'lower',
) {
  const fs = await import('node:fs/promises');
  const native = await import('node:fs');
  const { spawn } = await import('node:child_process');
  const { readMonotonicNs } = await loadOwnedProbeClock();
  const enclosingCutoffNs = readMonotonicNs() + 90_000_000_000n;
  // Proof: C3 signed64-addition bound omission reached effects1; exact maximum positive and next-sample refusal kept effects0 (50f4c30c).
  if (enclosingCutoffNs > 9223372036854775807n)
    throw Error('original common cutoff arithmetic refused');
  const tools = '/tmp/puni-age-tool-20261026/verified-v1.3.2';
  const manifestPath = '/tmp/puni-age-tool-20261026/verified-tool-manifest.json';
  const manifestFile = await fs.open(
    manifestPath,
    native.constants.O_RDONLY | native.constants.O_NOFOLLOW,
  );
  let manifest: { extractedOnly: VerifiedTool[] };
  try {
    const identity = await manifestFile.stat({ bigint: true });
    if (!identity.isFile() || identity.nlink !== 1n || (identity.mode & 0o7777n) !== 0o600n)
      throw Error('tool manifest custody');
    const bytes = await manifestFile.readFile();
    if (fixtureHash(bytes) !== 'c93bfa3b4c09acd562c200bf0081c95032ccabbdf906767619832ae05cf5a2da')
      throw Error('tool manifest pin');
    manifest = JSON.parse(bytes.toString()) as { extractedOnly: VerifiedTool[] };
  } finally {
    await manifestFile.close();
  }
  const toolParent = await fs.lstat(tools, { bigint: true });
  if (
    !toolParent.isDirectory() ||
    (await fs.realpath(tools)) !== tools ||
    (toolParent.mode & 0o7777n) !== 0o700n
  )
    throw Error('official tool parent custody');
  for (const expected of manifest.extractedOnly) {
    const file = await fs.open(
      expected.path,
      native.constants.O_RDONLY | native.constants.O_NOFOLLOW,
    );
    try {
      const identity = await file.stat({ bigint: true });
      const named = await fs.lstat(expected.path, { bigint: true });
      if (
        !identity.isFile() ||
        identity.nlink !== 1n ||
        identity.dev !== named.dev ||
        identity.ino !== named.ino ||
        String(identity.dev) !== expected.device ||
        String(identity.ino) !== expected.inode ||
        Number(identity.uid) !== expected.uid ||
        Number(identity.gid) !== expected.gid ||
        (identity.mode & 0o7777n) !== 0o500n ||
        Number(identity.size) !== expected.bytes ||
        fixtureHash(await file.readFile()) !== expected.sha256
      )
        throw Error('official tool identity');
    } finally {
      await file.close();
    }
  }
  const keyPath = proposed.directory + '/inert-identity';
  requireOwnedProbeTime(enclosingCutoffNs, readMonotonicNs);
  const keygen = spawn(tools + '/age-keygen', ['-o', keyPath], {
    cwd: proposed.directory,
    env: { LANG: 'C.UTF-8', TZ: 'UTC' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const keyLifetime = new OwnedProbeLifetime(
    keygen,
    enclosingCutoffNs,
    [proposed, keyPath],
    readMonotonicNs,
  );
  const keyObservation = await keyLifetime.wait();
  const keyStatus = keyObservation.status;
  const publicOutput = keyObservation.stderr;
  requireOwnedProbeTime(enclosingCutoffNs, readMonotonicNs);
  if (keyStatus[0] !== 0) throw Error('inert key generation failed');
  requireOwnedProbeTime(enclosingCutoffNs, readMonotonicNs);
  await fs.chmod(keyPath, 0o600);
  const recipient = /age1[a-z0-9]+/.exec(publicOutput.toString())?.[0];
  if (recipient === undefined) throw Error('inert recipient absent');
  requireOwnedProbeTime(enclosingCutoffNs, readMonotonicNs);
  await fs.unlink(keyPath);
  const age = manifest.extractedOnly.find((entry: { name: string }) => entry.name === 'age');
  if (age === undefined) throw Error('official age pin absent');
  const archivePolicy = {
    format: 'source-stageb-archive-policy',
    version: 1,
    container: {
      format: 'source-stageb-private-archive',
      version: 1,
      indexFormat: 'source-stageb-private-index',
      indexVersion: 1,
      maximumBytes: 134217728,
      membership: 'fixed-fifteen-slots-v1',
    },
    encryption: 'age-native-x25519',
    tool: {
      directory: tools,
      directoryIdentity: {
        device: String(toolParent.dev),
        inode: String(toolParent.ino),
        uid: Number(toolParent.uid),
        gid: Number(toolParent.gid),
        mode: 448,
      },
      file: {
        name: 'age',
        bytes: age.bytes,
        sha256: age.sha256,
        uid: age.uid,
        gid: age.gid,
        mode: 320,
      },
      release: 'v1.3.2',
    },
    preflight: {
      plaintext: 'source-stageb-age-preflight-v1\n',
      stdoutBytes: 65536,
      stderrBytes: 8192,
      maximumDurationMs: 30000,
    },
  };
  const archiveBytes = fixtureJson(archivePolicy);
  const facility = JSON.parse(proposed.facilityBytes.toString()) as SourceFixtureAuthority;
  const joins = {
    implementationSha: '1'.repeat(40),
    workflowSha: facility.workflowSha,
    nonce: facility.nonce,
    sourceSha: proposed.owned.sha,
    recipientFingerprint: fixtureHash(recipient),
    fixtureAuthoritySha256: fixtureHash(proposed.facilityBytes),
    rosterPolicySha256: fixtureHash(proposed.rosterBytes),
    archivePolicySha256: fixtureHash(archiveBytes),
  };
  const index = fixtureJson({
    format: 'source-stageb-inputs',
    version: 1,
    ...joins,
    artifacts: fixtureSlots.map((slot) => ({
      slot,
      bytes: proposed.owned.artifacts[slot].length,
      sha256: fixtureHash(proposed.owned.artifacts[slot]),
    })),
  });
  const registry = await fs.lstat(proposed.directory + '/registry', { bigint: true });
  requireOwnedProbeTime(enclosingCutoffNs, readMonotonicNs);
  const review = {
    format: 'source-stageb-review',
    version: 1,
    ...joins,
    inputManifestSha256: fixtureHash(index),
    recipient,
    registry: {
      scope: '8'.repeat(32),
      device: String(registry.dev),
      inode: String(registry.ino),
      uid: Number(registry.uid),
      gid: Number(registry.gid),
      mode: 448,
    },
    notBefore: Date.now() - 1000,
    notAfter: Date.now() + 120000,
    maximumDurationMs: 90000,
  };
  for (const slot of fixtureSlots) {
    requireOwnedProbeTime(enclosingCutoffNs, readMonotonicNs);
    await fs.writeFile(proposed.directory + '/' + slot, proposed.owned.artifacts[slot], {
      mode: 0o600,
    });
  }
  requireOwnedProbeTime(enclosingCutoffNs, readMonotonicNs);
  await fs.writeFile(proposed.directory + '/index', index, { mode: 0o600 });
  const runProbe = `import {readSourceInputs,inspectSourceInputs,closeSourceInputs} from '${import.meta.dir}/source-stageb-inputs.ts';
import {readSourceArtifacts,closeSourceArtifacts} from '${import.meta.dir}/source-stageb-artifacts.ts';
import {createSourceJournal,inspectSourceJournal,closeSourceJournal} from '${import.meta.dir}/source-stageb-journal.ts';
import {preflightSourceArchive,borrowSourceArchivePreflight,releaseSourceArchivePreflight,closeSourceArchivePreflight} from '${import.meta.dir}/source-stageb-archive-preflight.ts';
import {isProxy as modelIsProxy} from 'node:util/types';
import {stageSourceArtifacts,closeSourceStaging,runLowerConstructionProbe} from '${import.meta.dir}/source-stageb-builder.ts';
import {open,mkdir,readdir,readFile} from 'node:fs/promises';import {constants} from 'node:fs';
import {RetainedProbeLifetime} from 'stageb:retained-lifetime';
import {readMonotonicNs} from 'stageb:monotonic-clock';
${lowerLifetimeConsumerSource}
${lowerLifetimeFinalizerSource}
const directory=${JSON.stringify(proposed.directory)};const fault=${JSON.stringify(fault)};
const enclosingCutoffText=${JSON.stringify(String(enclosingCutoffNs))};
// Proof: C4 literal-01 grouped literal-check omission reached one protected lower entry; ordinary rejected six invalid forms before entry (50f4c30c).
if(!/^[1-9][0-9]{0,18}$/.test(enclosingCutoffText)||BigInt(enclosingCutoffText)>9223372036854775807n)throw Error('original common cutoff literal refused');
const enclosingCutoffNs=BigInt(enclosingCutoffText);
const files=[];const journalParents=[];let inputs,inspection,artifacts,journal,staging,archive,borrow,stagingParent;
const keeper=setInterval(()=>{},1000);
const references=()=>[inputs,inspection,artifacts,journal,staging,archive,borrow,stagingParent,files,journalParents,keeper,directory];
let evidence;

${canonicalRetainedErrorSource()}
let helperRetained;const helperOwnership={references};
function retainHelperFailure(cause){
 if(helperRetained!==undefined){helperRetained.retain([cause,...references()]);return helperRetained;}
 let graph;
 try{graph=inspectRawRetainedError(cause);}
 catch(inspectionFailure){
  if(helperRetained!==undefined){helperRetained.retain([cause,inspectionFailure,...references()]);return helperRetained;}
  helperRetained=new RetainedProbeLifetime('helper original graph inspection remains unproved',[cause,inspectionFailure],[cause,inspectionFailure,...references()]);
  return helperRetained;
 }
 if(graph.retained===undefined&&graph.unsupported===undefined)return;
 helperRetained=graph.retained??new RetainedProbeLifetime('helper original graph remains unproved',[cause,Error(graph.unsupported)],[...references(),...graph.references]);
 helperRetained.retain([cause,...references(),...graph.references]);return helperRetained;
}
async function preserveHelperWork(work){try{return await work();}catch(cause){throw retainHelperFailure(cause)??cause;}}
function refuseHelperRelease(originals){if(helperRetained!==undefined){helperRetained.retain([...references(),...originals]);throw helperRetained;}}

try {
 evidence=await runOwnedLowerScope(()=>preserveHelperWork(async()=>{
 // Proof: actual pre-I guard omission reached the independent inert I observer; ordinary entries0, both genuine-I effects0 (d53cbca8).
 if(readMonotonicNs()>=enclosingCutoffNs)throw Error('original enclosing cutoff expired before I');
 inputs=await readSourceInputs();inspection=inspectSourceInputs(inputs);
 const descriptors={};for(const slot of ${JSON.stringify(fixtureSlots)}){const file=await open(directory+'/'+slot,constants.O_RDONLY|constants.O_NOFOLLOW);files.push(file);descriptors[slot]=file.fd;}artifacts=await readSourceArtifacts(inputs,descriptors);
 await mkdir(directory+'/journal-parent/source-stageb-'+inspection.review.nonce,{mode:448});
 const journalParent=await open(directory+'/journal-parent',constants.O_RDONLY|constants.O_DIRECTORY);journalParents.push(journalParent);
 const journalDirectory=await open(directory+'/journal-parent/source-stageb-'+inspection.review.nonce,constants.O_RDONLY|constants.O_DIRECTORY);journalParents.push(journalDirectory);
 journal=await createSourceJournal({parent:journalParent,directory:journalDirectory,claim:{format:'source-stageb-journal',version:1,nonce:inspection.review.nonce,implementationSha:inspection.review.implementationSha,workflowSha:inspection.review.workflowSha,sourceSha:inspection.review.sourceSha,inputManifestSha256:inspection.review.inputManifestSha256},deadline:inspection.originalDeadline});
 archive=await preflightSourceArchive(inputs,journal);stagingParent=await open(directory+'/coordinator',constants.O_RDONLY|constants.O_DIRECTORY);
 staging=await stageSourceArtifacts(inputs,artifacts,journal,stagingParent.fd);await stagingParent.close();
 if(${JSON.stringify(consumerMode)}==='lower')borrow=await borrowSourceArchivePreflight(inputs,journal,archive);
 // Proof: C4 literal-and-deadline-forwarding +1 cutoff mutation refused at protected receiving pin, effects0, independent I deadline unchanged (50f4c30c).
 return await runLowerConstructionProbe(inputs,artifacts,staging,journal,borrow,directory,fault,archive,enclosingCutoffNs);
 }),async()=>{
 if(borrow)await releaseSourceArchivePreflight(borrow${consumerMode === 'public' ? ',refuseHelperRelease,helperOwnership' : ''});
 if(staging)await closeSourceStaging(staging);
 if(archive)await closeSourceArchivePreflight(archive);
 if(journal)await closeSourceJournal(journal);
 for(const parent of journalParents)if(parent.fd>=0)await parent.close();
 if(stagingParent&&stagingParent.fd>=0)await stagingParent.close();
 if(artifacts)await closeSourceArtifacts(artifacts);
 for(const file of files)await file.close();
 if(inputs)await closeSourceInputs(inputs);
 },references,enclosingCutoffNs);
 await finalizeOwnedLowerScope(evidence,keeper,references);
}catch(failure){clearInterval(keeper);throw failure;}`;

  requireOwnedProbeTime(enclosingCutoffNs, readMonotonicNs);
  const built = await Bun.build({
    entrypoints: ['lower-constructor:entry'],
    target: 'bun',
    format: 'esm',
    splitting: false,
    define: {
      SOURCE_STAGEB_REVIEW_LITERAL: JSON.stringify(JSON.stringify(review)),
      SOURCE_STAGEB_ARCHIVE_POLICY_LITERAL: JSON.stringify(archiveBytes.toString()),
      SOURCE_STAGEB_FIXTURE_AUTHORITY_LITERAL: JSON.stringify(proposed.facilityBytes.toString()),
      SOURCE_STAGEB_ROSTER_POLICY_LITERAL: JSON.stringify(proposed.rosterBytes.toString()),
      SOURCE_STAGEB_PRODUCER_EVIDENCE_LITERAL: JSON.stringify(
        proposed.producerBytes.map((body) => body.toString()),
      ),
      SOURCE_STAGEB_MIGRATION_WORKER_LITERAL: JSON.stringify(
        Buffer.from(proposed.worker.bytes).toString('base64'),
      ),
    },
    plugins: [
      {
        name: 'original-lower-construction',
        setup(build) {
          provideRetainedLifetimeModule(build);
          provideCommonClockModule(build);
          build.onResolve({ filter: /^lower-constructor:entry$/ }, () => ({
            path: 'entry',
            namespace: 'lower-constructor',
          }));
          build.onLoad({ filter: /.*/, namespace: 'lower-constructor' }, () => ({
            contents: runProbe,
            loader: 'ts',
          }));
          build.onLoad({ filter: /source-stageb-builder\.ts$/ }, async (args) => ({
            contents:
              (consumerMode === 'public'
                ? await adaptPublicReleaseSource(await fs.readFile(args.path, 'utf8'), 'builder')
                : await fs.readFile(args.path, 'utf8')) + extraBuilderSource,
            loader: 'ts',
          }));
          if (consumerMode === 'public')
            build.onLoad({ filter: /source-stageb-archive-preflight\.ts$/ }, async (args) => ({
              contents: await adaptPublicReleaseSource(
                await fs.readFile(args.path, 'utf8'),
                'archive',
              ),
              loader: 'ts',
            }));
        },
      },
    ],
  });
  if (!built.success) throw new AggregateError(built.logs, 'owned construction build failed');
  const executable = built.outputs.find((output) => output.kind === 'entry-point');
  if (executable === undefined) throw Error('owned construction entry absent');
  const candidate = Buffer.from(await executable.arrayBuffer());
  if (consumerMode === 'public') await inspectPublicReleaseBindings(candidate.toString());
  const pin = fixtureHash(candidate);
  requireOwnedProbeTime(enclosingCutoffNs, readMonotonicNs);
  await fs.writeFile(proposed.directory + '/lower.mjs', candidate, { mode: 0o600 });
  if (fixtureHash(await fs.readFile(proposed.directory + '/lower.mjs')) !== pin)
    throw Error('owned candidate changed');
  requireOwnedProbeTime(enclosingCutoffNs, readMonotonicNs);
  const descriptors: { descriptor: number; identity: BigIntStats | undefined }[] = [];
  let lowerLifetime: OwnedProbeLifetime | undefined;
  let primary: unknown;
  try {
    const indexFd = native.openSync(
      proposed.directory + '/index',
      native.constants.O_RDONLY | native.constants.O_NOFOLLOW,
    );
    const indexReference = { descriptor: indexFd, identity: undefined as BigIntStats | undefined };
    descriptors.push(indexReference);
    indexReference.identity = native.fstatSync(indexFd, { bigint: true });
    const registryFd = native.openSync(
      proposed.directory + '/registry',
      native.constants.O_RDONLY | native.constants.O_DIRECTORY | native.constants.O_NOFOLLOW,
    );
    const registryReference = {
      descriptor: registryFd,
      identity: undefined as BigIntStats | undefined,
    };
    descriptors.push(registryReference);
    registryReference.identity = native.fstatSync(registryFd, { bigint: true });
    requireOwnedProbeTime(enclosingCutoffNs, readMonotonicNs);
    const child = spawn(
      process.execPath,
      ['--no-env-file', 'run', proposed.directory + '/lower.mjs'],
      {
        cwd: proposed.directory,
        env: {
          WBS_ENV: 'dev',
          TMPDIR: proposed.directory + '/scratch',
          BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0',
          LANG: 'C.UTF-8',
          TZ: 'UTC',
        },
        stdio: [
          'ignore',
          'pipe',
          'pipe',
          'ignore',
          'ignore',
          'ignore',
          'ignore',
          indexFd,
          registryFd,
        ],
      },
    );
    lowerLifetime = new OwnedProbeLifetime(
      child,
      enclosingCutoffNs,
      [proposed, descriptors, proposed.directory],
      readMonotonicNs,
    );
    const observed = await concludeOwnedLowerParent(lowerLifetime, () => {
      const failures: unknown[] = [];
      for (const descriptor of descriptors)
        try {
          native.closeSync(descriptor.descriptor);
        } catch (failure) {
          failures.push(failure);
        }
      if (failures.length !== 0)
        throw new AggregateError(failures, 'original lower authority close failed');
    }, [proposed, descriptors, proposed.directory]);
    return {
      code: observed.status[0],
      stdout: observed.stdout.toString(),
      stderr: observed.stderr.toString(),
      directory: proposed.directory,
      pin,
    };
  } catch (failure) {
    primary = failure;
    if (failure instanceof RetainedLowerScopeFailure) throw failure;
    if (lowerLifetime !== undefined) {
      const retained = new RetainedLowerScopeFailure(
        lowerLifetime,
        [failure],
        [proposed, descriptors, proposed.directory],
      );
      retainedOwnedLowerScopes.add(retained);
      throw retained;
    }
    const failures: unknown[] = [primary];
    for (const descriptor of descriptors)
      try {
        native.closeSync(descriptor.descriptor);
      } catch (cleanup) {
        failures.push(cleanup);
      }
    if (failures.length !== 1) {
      const retained = new RetainedLowerScopeFailure(undefined, failures, [
        proposed,
        descriptors,
        proposed.directory,
      ]);
      retainedOwnedLowerScopes.add(retained);
      throw retained;
    }
    throw new AggregateError(failures, 'lower acquisition failed before child spawn', {
      cause: failure,
    });
  }
}
const lowerConstructionSource = `\nimport {SourceFixtureConstruction} from '${import.meta.dir}/source-stageb-fixture.ts';
export async function runLowerConstructionProbe(inputs,artifacts,staging,journal,archive,directory,fault){
const retention=retainOriginalStaging(inputs,artifacts,staging,journal);const construction=new SourceFixtureConstruction(inputs,artifacts,journal,retention,archive);let primary;let evidence;
try{const scope=await construction.acquireDirectory(directory+'/coordinator/lower-owned',448,process.geteuid(),process.getegid());const pin=inspectOriginalStaging(retention).members.find(member=>member.path==='source/multichunk');if(!pin)throw Error('actual staged pin absent');
let restore;
if(fault==='partial-write'){const file=await open(directory+'/probe-reference',constants.O_CREAT|constants.O_EXCL|constants.O_RDWR,384);const prototype=Object.getPrototypeOf(file);const original=prototype.write;prototype.write=async function(...args){const path=readlinkSync('/proc/self/fd/'+this.fd);if(path.endsWith('/lower-owned/payload'))throw Error('injected actual member write');return await original.apply(this,args);};restore=()=>{prototype.write=original;};await file.close();}
try{await construction.populateDirectory(scope,[{path:'payload',kind:'file',mode:420,bytes:pin.bytes,sha256:pin.sha256,staged:pin.path}]);}catch(cause){primary=cause;}finally{restore?.();}
const phase=(await inspectSourceJournal(journal)).phase;
let cleanupFailure;try{await construction.close();}catch(cause){cleanupFailure=cause;}
if(cleanupFailure)throw cleanupFailure;
const names=await readdir(directory+'/coordinator');evidence={phase,primary:primary instanceof Error?primary.message:null,removed:!names.includes('lower-owned'),retainedStaging:names.includes('source-stageb-staging')};
}finally{releaseOriginalStaging(retention);}return evidence;}`;
export async function runOwnedConstructionFS(fault = '') {
  return await runOwnedConstructionProbe(
    await createConstructionFixture(),
    lowerConstructionSource,
    fault,
  );
}
for (const fault of ['', 'partial-write'])
  test(`actual original constructor lower filesystem ${fault || 'complete'} preserves staging and disposes owned files`, async () => {
    const observed = await runOwnedConstructionFS(fault);
    expect(observed.stderr).toBe('');
    expect(observed.code).toBe(0);
    expect(JSON.parse(observed.stdout)).toEqual({
      phase: fault === '' ? 'open' : 'cleanup-only',
      primary: fault === '' ? null : 'injected actual member write',
      removed: true,
      retainedStaging: true,
    });
  }, 30000);

function migrationProposal() {
  const facility = JSON.parse(facilityText) as SourceFixtureAuthority;
  return {
    version: 1 as const,
    sourceSha: facility.sourceSha,
    workflowSha: facility.workflowSha,
    nonce: facility.nonce,
    migrationManifestSha256: facility.migration.manifestSha256,
    envelope: facility.migration.envelope,
    databases: facility.migration.databases,
  };
}
for (const fault of [
  'getter',
  'proxy',
  'nested-getter',
  'toJSON',
  'extra-field',
  'wrong-version',
  'wrong-source',
  'wrong-environment',
  'same-database',
  'relative-path',
] as const)
  test(`fixed worker assembler refuses ${fault} without evaluating supplied behavior`, async () => {
    let reads = 0;
    let proposed = migrationProposal();
    if (fault === 'getter')
      Object.defineProperty(proposed, 'sourceSha', {
        enumerable: true,
        get() {
          reads++;
          return '1'.repeat(40);
        },
      });
    if (fault === 'proxy')
      proposed = new Proxy(proposed, {
        get(target, key, receiver): unknown {
          reads++;
          return Reflect.get(target, key, receiver);
        },
      });
    if (fault === 'nested-getter')
      Object.defineProperty(proposed.databases[0], 'path', {
        enumerable: true,
        get() {
          reads++;
          return '/tmp/prod.sqlite';
        },
      });
    if (fault === 'toJSON')
      Object.defineProperty(proposed, 'toJSON', {
        value() {
          reads++;
          return migrationProposal();
        },
        enumerable: true,
      });
    if (fault === 'extra-field') Object.assign(proposed, { entry: '/tmp/arbitrary.ts' });
    if (fault === 'wrong-version') Object.assign(proposed, { version: 2 });
    if (fault === 'wrong-source') proposed.sourceSha = 'abc';
    if (fault === 'wrong-environment') Object.assign(proposed.databases[0], { environment: 'dev' });
    if (fault === 'same-database') proposed.databases[1].path = proposed.databases[0].path;
    if (fault === 'relative-path') proposed.envelope = 'relative/tree';
    await rejects(buildSourceFixtureMigrationWorker(proposed));
    expect(reads).toBe(0);
  });

test('fixed worker assembler rejects unresolved process runtime import from actual compiled output', async () => {
  const transpiler = new Bun.Transpiler({ loader: 'js', target: 'bun' });
  const injected = transpiler.scan("import 'node:child_process';").imports;
  const original = Bun.Transpiler.prototype.scan.bind(transpiler);
  const intercept = spyOn(Bun.Transpiler.prototype, 'scan').mockImplementation(function (
    this: Bun.Transpiler,
    ...args
  ) {
    const scanned = original(...args);
    return { ...scanned, imports: [...scanned.imports, ...injected] };
  });
  try {
    await rejects(buildSourceFixtureMigrationWorker(migrationProposal()));
  } finally {
    intercept.mockRestore();
  }
});

for (const fault of ['getter', 'proxy', 'extra', 'missing', 'oversized'] as const)
  test(`complete assembler refuses producer array ${fault} without evaluating caller behavior`, async () => {
    const proposed = await assemblyPacket();
    let reads = 0;
    let producers = proposed.producers;
    if (fault === 'getter')
      Object.defineProperty(producers, '0', {
        enumerable: true,
        get() {
          reads++;
          return proposed.producers[1];
        },
      });
    if (fault === 'proxy')
      producers = new Proxy(producers, {
        get(target, key, receiver): unknown {
          reads++;
          return Reflect.get(target, key, receiver);
        },
      });
    if (fault === 'extra') Object.assign(producers, { entry: 'foreign' });
    if (fault === 'missing') producers.pop();
    if (fault === 'oversized') producers[0] = Buffer.alloc(16385);
    let policyReads = 0;
    const decode = fixturePolicy.decodeSourceFixturePolicy;
    const observed = spyOn(fixturePolicy, 'decodeSourceFixturePolicy').mockImplementation(
      (...args) => {
        policyReads++;
        return decode(...args);
      },
    );
    const expected =
      fault === 'getter'
        ? /array accessors refused/
        : fault === 'proxy'
          ? /plain bounded array required/
          : fault === 'oversized'
            ? /source fixture policy byte custody refused/
            : /exact array membership required/;
    try {
      await rejects(
        buildSourceFixtureBootstrap(
          fixtureJson(proposed.review),
          proposed.archive,
          proposed.facility,
          proposed.roster,
          producers,
          proposed.fixed,
        ),
        expected,
      );
      expect(reads).toBe(0);
      expect(policyReads).toBe(0);
    } finally {
      observed.mockRestore();
    }
  });

async function assemblyPacket() {
  const proposed = packet();
  const fixed = migrationProposal();
  const worker = await buildSourceFixtureMigrationWorker(fixed);
  const facility = JSON.parse(facilityText) as SourceFixtureAuthority;
  facility.worker = { ...facility.worker, bytes: worker.bytes.length, sha256: worker.sha256 };
  proposed.facility = fixtureJson(facility);
  const archive = fixtureJson({
    format: 'source-stageb-archive-policy',
    version: 1,
    container: {
      format: 'source-stageb-private-archive',
      version: 1,
      indexFormat: 'source-stageb-private-index',
      indexVersion: 1,
      maximumBytes: 134217728,
      membership: 'fixed-fifteen-slots-v1',
    },
    encryption: 'age-native-x25519',
    tool: {
      directory: '/tmp/finite-proposed-tool',
      directoryIdentity: { device: '1', inode: '2', uid: 1000, gid: 1000, mode: 448 },
      file: { name: 'age', bytes: 10, sha256: 'a'.repeat(64), uid: 1000, gid: 1000, mode: 320 },
      release: 'v1.3.2',
    },
    preflight: {
      plaintext: 'source-stageb-age-preflight-v1\n',
      stdoutBytes: 65536,
      stderrBytes: 8192,
      maximumDurationMs: 30000,
    },
  });
  const recipient = 'age1' + 'q'.repeat(58);
  const review = {
    format: 'source-stageb-review',
    version: 1,
    implementationSha: 'a'.repeat(40),
    workflowSha: facility.workflowSha,
    nonce: facility.nonce,
    inputManifestSha256: 'b'.repeat(64),
    sourceSha: facility.sourceSha,
    recipient,
    recipientFingerprint: fixtureHash(recipient),
    fixtureAuthoritySha256: fixtureHash(proposed.facility),
    rosterPolicySha256: fixtureHash(proposed.roster),
    archivePolicySha256: fixtureHash(archive),
    registry: { scope: 'c'.repeat(32), device: '1', inode: '2', uid: 1000, gid: 1000, mode: 448 },
    notBefore: 1,
    notAfter: 2000000000000,
    maximumDurationMs: 120000,
  };
  return { ...proposed, fixed, archive, review };
}
for (const fault of [
  'review-facility',
  'review-roster',
  'review-archive',
  'review-attempt',
  'worker-package',
  'worker-bytes',
] as const)
  test(`complete assembler refuses ${fault} commitment at actual join`, async () => {
    const proposed = await assemblyPacket();
    let expected = /review commitments differ/;
    if (fault === 'review-facility') proposed.review.fixtureAuthoritySha256 = 'd'.repeat(64);
    if (fault === 'review-roster') proposed.review.rosterPolicySha256 = 'd'.repeat(64);
    if (fault === 'review-archive') proposed.review.archivePolicySha256 = 'd'.repeat(64);
    if (fault === 'review-attempt') {
      proposed.review.workflowSha = 'd'.repeat(40);
      expected = /review attempt differs/;
    }
    if (fault === 'worker-package') {
      proposed.fixed.workflowSha = 'd'.repeat(40);
      expected = /worker package differs/;
    }
    if (fault === 'worker-bytes') {
      const facility = JSON.parse(proposed.facility.toString()) as SourceFixtureAuthority;
      facility.worker.sha256 = 'd'.repeat(64);
      proposed.facility = fixtureJson(facility);
      proposed.review.fixtureAuthoritySha256 = fixtureHash(proposed.facility);
      expected = /built worker commitment differs/;
    }
    await rejects(
      buildSourceFixtureBootstrap(
        fixtureJson(proposed.review),
        proposed.archive,
        proposed.facility,
        proposed.roster,
        proposed.producers,
        proposed.fixed,
      ),
      expected,
    );
  });

test('complete assembler emits the actual closed same-closure constructor candidate with copied lexical commitments', async () => {
  const proposed = await assemblyPacket();
  const review = fixtureJson(proposed.review);
  const built = await buildSourceFixtureBootstrap(
    review,
    proposed.archive,
    proposed.facility,
    proposed.roster,
    proposed.producers,
    proposed.fixed,
  );
  expect(built.sha256).toBe(fixtureHash(built.bytes));
  expect(built.fixtureAuthoritySha256).toBe(fixtureHash(proposed.facility));
  expect(built.rosterPolicySha256).toBe(fixtureHash(proposed.roster));
  expect(built.reviewSha256).toBe(fixtureHash(review));
  expect(built.maps).toHaveLength(1);
  const scanned = new Bun.Transpiler({ loader: 'js', target: 'bun' }).scan(built.bytes);
  expect(scanned.exports).toContain('buildSourcePrerequisites');
  expect(scanned.exports).toContain('closeSourcePrerequisites');
  expect(scanned.exports).not.toContain('SourceFixtureConstruction');
  expect(scanned.exports).not.toContain('retainOriginalStaging');
  const before = fixtureHash(built.bytes);
  review.fill(0);
  proposed.facility.fill(0);
  proposed.roster.fill(0);
  for (const body of proposed.producers) body.fill(0);
  expect(fixtureHash(built.bytes)).toBe(before);
}, 30000);

for (const fault of ['producer-total', 'combined-total'] as const)
  test(`complete assembler bounds ${fault} when its byte-copy dependency is broken`, async () => {
    const proposed = packet();
    const original = fixturePolicy.copySourceFixtureBytes;
    const intercepted = spyOn(fixturePolicy, 'copySourceFixtureBytes').mockImplementation(
      (bytes, maximum) => {
        if (proposed.producers.some((body) => body === bytes))
          return new Uint8Array(fault === 'producer-total' ? 16385 : 16384);
        if (bytes === proposed.facility)
          return new Uint8Array(fault === 'combined-total' ? 32769 : 32768);
        if (bytes === proposed.roster) return new Uint8Array(16384);
        return original(bytes, maximum);
      },
    );
    try {
      await rejects(
        buildSourceFixtureBootstrap(
          Buffer.from('{}'),
          Buffer.from('{}'),
          proposed.facility,
          proposed.roster,
          proposed.producers,
          migrationProposal(),
        ),
        /combined policy bytes exceed bound/,
      );
    } finally {
      intercepted.mockRestore();
    }
  });

for (const target of ['worker', 'constructor'] as const)
  test(`fixed assembler rejects extra ${target} export observed in actual compiled surface`, async () => {
    const proposed = await assemblyPacket();
    const transpiler = new Bun.Transpiler({ loader: 'js', target: 'bun' });
    const original = Bun.Transpiler.prototype.scan.bind(transpiler);
    const intercepted = spyOn(Bun.Transpiler.prototype, 'scan').mockImplementation((...args) => {
      const scanned = original(...args);
      const selected = scanned.exports.includes(
        target === 'worker' ? 'encodeSourceMigrationFrame' : 'buildSourcePrerequisites',
      );
      return {
        ...scanned,
        exports: selected ? [...scanned.exports, 'privateAuthorityFactory'] : scanned.exports,
      };
    });
    try {
      if (target === 'worker')
        await rejects(
          buildSourceFixtureMigrationWorker(proposed.fixed),
          /fixed worker exports refused/,
        );
      else
        await rejects(
          buildSourceFixtureBootstrap(
            fixtureJson(proposed.review),
            proposed.archive,
            proposed.facility,
            proposed.roster,
            proposed.producers,
            proposed.fixed,
          ),
          /fixed public exports refused/,
        );
    } finally {
      intercepted.mockRestore();
    }
  });

for (const target of ['worker', 'constructor'] as const) {
  for (const fault of [
    'failed-with-valid-outputs',
    'duplicate-entry',
    'missing-map',
    'duplicate-map',
  ] as const)
    test(`actual ${target} assembler refuses compiler ${fault} at shared compilation boundary`, async () => {
      const proposed = await assemblyPacket();
      const build = Bun.build.bind(Bun);
      let injected = 0;
      const observed = spyOn(Bun, 'build').mockImplementation(async (options) => {
        const compiled = await build(options);
        const selected = options.entrypoints.includes(
          target === 'worker'
            ? import.meta.dir + '/source-stageb-migration-worker.ts'
            : 'source-stageb:fixture-entry',
        );
        if (!selected) return compiled;
        injected++;
        expect(compiled.success).toBe(true);
        expect(compiled.outputs.filter((output) => output.kind === 'entry-point')).toHaveLength(1);
        expect(compiled.outputs.filter((output) => output.kind === 'sourcemap')).toHaveLength(1);
        if (fault === 'failed-with-valid-outputs') return { ...compiled, success: false };
        if (fault === 'missing-map')
          return {
            ...compiled,
            outputs: compiled.outputs.filter((output) => output.kind !== 'sourcemap'),
          };
        const additions = compiled.outputs.filter(
          (output) => output.kind === (fault === 'duplicate-entry' ? 'entry-point' : 'sourcemap'),
        );
        return { ...compiled, outputs: [...compiled.outputs, ...additions] };
      });
      const expected =
        fault === 'failed-with-valid-outputs'
          ? /source fixture compilation failed/
          : fault === 'duplicate-entry'
            ? /single entry required/
            : /single source map required/;
      try {
        await rejects(
          target === 'worker'
            ? buildSourceFixtureMigrationWorker(proposed.fixed)
            : buildSourceFixtureBootstrap(
                fixtureJson(proposed.review),
                proposed.archive,
                proposed.facility,
                proposed.roster,
                proposed.producers,
                proposed.fixed,
              ),
          expected,
        );
        expect(injected).toBe(1);
      } finally {
        observed.mockRestore();
      }
    });
}
test('actual complete assembler refuses unresolved import at shared runtime scan boundary', async () => {
  const proposed = await assemblyPacket();
  const transpiler = new Bun.Transpiler({ loader: 'js', target: 'bun' });
  const scan = Bun.Transpiler.prototype.scan.bind(transpiler);
  const injected = scan("import 'stageb:unresolved-runtime';").imports;
  let captures = 0;
  const observed = spyOn(Bun.Transpiler.prototype, 'scan').mockImplementation((...args) => {
    const scanned = scan(...args);
    if (!scanned.exports.includes('buildSourcePrerequisites')) return scanned;
    captures++;
    return { ...scanned, imports: [...scanned.imports, ...injected] };
  });
  try {
    await rejects(
      buildSourceFixtureBootstrap(
        fixtureJson(proposed.review),
        proposed.archive,
        proposed.facility,
        proposed.roster,
        proposed.producers,
        proposed.fixed,
      ),
      /source fixture bootstrap runtime imports refused/,
    );
    expect(captures).toBe(1);
  } finally {
    observed.mockRestore();
  }
});

type ProbeChildStatus = readonly [number | null, NodeJS.Signals | null];
interface ProbeChildReader {
  readonly stream: Readable | null;
  readonly done: Promise<Buffer>;
  eof: boolean;
  complete: boolean;
  failure?: unknown;
}
const readProcessLocalNs = () => process.hrtime.bigint();
const retainedProbeChildren = new Set<OwnedProbeLifetime>();
const retainedOwnedLowerScopes = new Set<RetainedLowerScopeFailure>();
/** Direct-child close/EOF never proves descendant or original I/J cleanup; forced OS exit may close lower FDs mechanically while named resources remain unresolved. */
class RetainedLowerScopeFailure extends AggregateError {
  constructor(
    readonly lifetime: OwnedProbeLifetime | undefined,
    failures: readonly unknown[],
    readonly dependencies: readonly unknown[],
  ) {
    super([...failures], 'lower direct-child history retained; dependent scopes unresolved');
  }
}

async function concludeOwnedLowerParent(
  lifetime: OwnedProbeLifetime,
  release: () => void | Promise<void>,
  dependencies: readonly unknown[],
) {
  try {
    const observed = await lifetime.wait();
    // Proof: omission reached the protected parent authority-FD release observer on actual abnormal child close/EOF; exact restoration kept the original FD/root (034e54ff).
    if (observed.status[0] !== 0 || observed.status[1] !== null)
      throw Error('abnormal lower completion; dependent original scopes unproved');
    await release();
    return observed;
  } catch (failure) {
    const retained = new RetainedLowerScopeFailure(lifetime, [failure], dependencies);
    retainedOwnedLowerScopes.add(retained);
    throw retained;
  }
}
class RetainedProbeChildFailure extends AggregateError {
  constructor(readonly lifetime: OwnedProbeLifetime) {
    super([...lifetime.failures], 'owned child close or output EOF unproved');
  }
}
/**
 * Owns one original child and its readers; a clock failure retains this exact owner and causes.
 * A final failed clock read retains dependent-history uncertainty even after direct close/EOF.
 * It does not erase proved settlement or authorize dependency release/publication.
 */
class OwnedProbeLifetime {
  readonly failures: unknown[] = [];
  readonly closed: Promise<ProbeChildStatus>;
  readonly stdout: ProbeChildReader;
  readonly stderr: ProbeChildReader;
  status?: ProbeChildStatus;
  cancelRequested = false;
  private readonly expired: Promise<'cutoff' | 'clock-failed'>;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(
    readonly child: ChildProcess,
    readonly cutoffNs: bigint,
    readonly dependencies: readonly unknown[],
    readonly readClockNs: () => bigint,
  ) {
    const terminal = Promise.withResolvers<ProbeChildStatus>();
    this.closed = terminal.promise;
    // Proof: the legacy once(close) rejected on the actual child's error notification before close/EOF; error-before-close regression RED, original terminal listener GREEN.
    child.on('error', (failure: Error) => {
      this.failures.push(failure);
    });
    child.once('close', (code, signal) => {
      this.status = [code, signal];
      terminal.resolve(this.status);
    });
    this.stdout = this.read(child.stdout);
    this.stderr = this.read(child.stderr);
    this.expired = new Promise((resolve) => {
      const expire = () => {
        let remaining: number;
        try {
          remaining = Number(cutoffNs - this.readClockNs()) / 1e6;
        } catch (cause) {
          this.failures.push(cause);
          this.cancel();
          // Proof: C8 live-timer-clock append omission lost [K]; ordinary cancelled the original child once and independently joined close/both EOF (50f4c30c).
          resolve('clock-failed');
          return;
        }
        if (remaining > 0) {
          this.timer = setTimeout(expire, Math.ceil(remaining));
          return;
        }
        this.failures.push(Error('owned child enclosing cutoff expired'));
        this.cancel();
        resolve('cutoff');
      };
      expire();
    });
  }
  cancel(): void {
    if (this.cancelRequested || this.status !== undefined) return;
    this.cancelRequested = true;
    try {
      if (!this.child.kill('SIGTERM'))
        this.failures.push(Error('original child cancellation unproved'));
    } catch (failure) {
      this.failures.push(failure);
    }
  }
  private read(stream: Readable | null): ProbeChildReader {
    if (stream === null) {
      const failure = Error('owned child output pipe absent');
      this.failures.push(failure);
      this.cancel();
      return {
        stream,
        done: Promise.resolve(Buffer.alloc(0)),
        eof: false,
        complete: true,
        failure,
      };
    }
    const finished = Promise.withResolvers<Buffer>();
    const reader: ProbeChildReader = {
      stream,
      done: finished.promise,
      eof: false,
      complete: false,
    };
    stream.once('end', () => {
      reader.eof = true;
    });
    void (async () => {
      let bytes = Buffer.alloc(0);
      let overflow = false;
      try {
        for await (const chunk of stream) {
          const observed = Buffer.from(chunk);
          // Proof: omission admitted oversized inert output; original-child cutoff/guardian still joined actual close/EOF, exact cap restored GREEN (034e54ff).
          if (bytes.length + observed.length > 65536) {
            if (!overflow) {
              overflow = true;
              this.failures.push(Error('owned child stream bound'));
              this.cancel();
            }
          } else if (!overflow) bytes = Buffer.concat([bytes, observed]);
        }
      } catch (failure) {
        reader.failure = failure;
        this.failures.push(failure);
        this.cancel();
      } finally {
        reader.complete = true;
        finished.resolve(bytes);
      }
    })();
    return reader;
  }
  /** Proof: failed-reader guard omission downgraded typed retention; held native EOF observers independently keep authority FDs owned until their original callbacks arrive (034e54ff plus focused EOF controls). */
  isSettled(): boolean {
    return (
      this.status !== undefined &&
      this.stdout.complete &&
      this.stderr.complete &&
      this.stdout.eof &&
      this.stderr.eof &&
      this.stdout.failure === undefined &&
      this.stderr.failure === undefined
    );
  }
  async wait() {
    try {
      // Proof: deleting original close or reader waits returned earlier retained refusal while actual callbacks remained held; exact restoration stayed pending (034e54ff). This is ordering, not unsafe cleanup.
      const completion = Promise.all([this.closed, this.stdout.done, this.stderr.done]);
      const joined = await Promise.race([completion, this.expired]);
      let isExpired: boolean;
      try {
        isExpired = typeof joined === 'string' || this.readClockNs() >= this.cutoffNs;
      } catch (cause) {
        // Proof: C8 final-clock raw-read mutation lost typed retention; prior-error-final-clock append omission lost K from [W,K] (50f4c30c).
        // All compared fixed inert children independently joined original close/both EOF; no release/publication was admitted.
        this.failures.push(cause);
        // Proof: C8 strong-original-owner set omission alone lost membership while exact typed owner/[K] remained (50f4c30c).
        retainedProbeChildren.add(this);
        throw new RetainedProbeChildFailure(this);
      }
      if (isExpired || !this.isSettled()) {
        retainedProbeChildren.add(this);
        throw new RetainedProbeChildFailure(this);
      }
      if (this.failures.length !== 0)
        throw new AggregateError([...this.failures], 'owned child failed after proved settlement');
      return { status: joined[0], stdout: joined[1], stderr: joined[2] };
    } finally {
      if (this.timer !== undefined) clearTimeout(this.timer);
    }
  }
}
function observeOwnedProbeChild(
  child: ChildProcess,
  cutoffNs: bigint,
  dependencies: readonly unknown[],
) {
  return new OwnedProbeLifetime(child, cutoffNs, dependencies, readProcessLocalNs).wait();
}

test('owned probe lifetime retains error notification until actual close and pipe EOF', async () => {
  const fs = await import('node:fs/promises');
  const { spawn } = await import('node:child_process');
  const parent = process.env['TMPDIR'];
  if (parent === undefined) throw Error('owned lifetime TMPDIR absent');
  const directory = await fs.mkdtemp(parent + '/probe-lifetime-');
  await fs.chmod(directory, 0o700);
  if (
    fixtureHash(await fs.readFile(process.execPath)) !==
    '10702245766b225e70bbf6235fd6b47214fd94b4760d00ffaed8ab0df57ac235'
  )
    throw Error('owned lifetime runtime differs from trusted Bun');
  const sentinel = await fs.open(directory + '/foreign', 'wx+', 0o600);
  await sentinel.writeFile('foreign-lifetime');
  const before = await sentinel.stat({ bigint: true });
  const child = spawn(process.execPath, ['--no-env-file', '-e', 'await Bun.stdin.text()'], {
    cwd: directory,
    env: { WBS_ENV: 'dev', TMPDIR: directory },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const closed = Promise.withResolvers();
  child.once('close', (code, signal) => {
    closed.resolve({ code, signal });
  });
  const ends = { stdout: false, stderr: false };
  child.stdout.once('end', () => {
    ends.stdout = true;
  });
  child.stderr.once('end', () => {
    ends.stderr = true;
  });
  const stdinErrors: unknown[] = [];
  child.stdin.on('error', (failure) => {
    stdinErrors.push(failure);
  });
  const primary = Error('owned actual child error notification');
  const waiting = observeOwnedProbeChild(child, process.hrtime.bigint() + 5_000_000_000n, [
    sentinel,
    directory,
  ]);
  let settled = false;
  let observedFailure: unknown;
  void waiting.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  try {
    await Bun.sleep(20);
    child.emit('error', primary);
    await Bun.sleep(20);
    expect(settled).toBe(false);
    expect(ends).toEqual({ stdout: false, stderr: false });
    expect((await sentinel.stat({ bigint: true })).ino).toBe(before.ino);
  } finally {
    child.stdin.end();
    await closed.promise;
    observedFailure = await waiting.then(
      () => undefined,
      (cause: unknown) => cause,
    );
    expect(ends).toEqual({ stdout: true, stderr: true });
    expect((await sentinel.stat({ bigint: true })).ino).toBe(before.ino);
    expect(await fs.readFile(directory + '/foreign', 'utf8')).toBe('foreign-lifetime');
    expect(stdinErrors).toEqual([]);
    await sentinel.close();
    await fs.rm(directory, { recursive: true });
  }
  expect(observedFailure).toBeInstanceOf(AggregateError);
  expect(
    observedFailure instanceof AggregateError && observedFailure.errors.includes(primary),
  ).toBe(true);
}, 10000);

/**
 * Refuses effects at the original enclosing cutoff without rebasing the clock/deadline.
 * Proof: C5 at-cutoff omission reached effects1 without sampling; ordinary sampled once/effects0,
 * original K propagated by identity; before-cutoff positive reached one inert effect (50f4c30c).
 * Earlier actual-expiry control034e54ff is separate; C5 inventory covers11 call sites/two owners.
 */
function requireOwnedProbeTime(cutoffNs: bigint, readClockNs: () => bigint): void {
  if (readClockNs() >= cutoffNs) throw Error('owned enclosing cutoff expired before effect');
}
async function openInertLifetimeProbe(program: 'stdin' | 'overflow' | 'held' | 'abnormal') {
  const fs = await import('node:fs/promises');
  const { spawn } = await import('node:child_process');
  const parent = process.env['TMPDIR'];
  if (parent === undefined) throw Error('owned lifetime TMPDIR absent');
  const directory = await fs.mkdtemp(parent + '/probe-lifetime-');
  await fs.chmod(directory, 0o700);
  if (
    fixtureHash(await fs.readFile(process.execPath)) !==
    '10702245766b225e70bbf6235fd6b47214fd94b4760d00ffaed8ab0df57ac235'
  )
    throw Error('owned lifetime runtime differs from trusted Bun');
  const sentinel = await fs.open(directory + '/foreign', 'wx+', 0o600);
  await sentinel.writeFile('foreign-lifetime');
  const identity = await sentinel.stat({ bigint: true });
  const code =
    program === 'stdin'
      ? 'await Bun.stdin.text()'
      : program === 'overflow'
        ? 'process.stdout.write(Buffer.alloc(131072)); await Bun.stdin.text()'
        : program === 'abnormal'
          ? 'process.exitCode=1'
          : 'process.stdout.write("held")';
  const child = spawn(process.execPath, ['--no-env-file', '-e', code], {
    cwd: directory,
    env: { WBS_ENV: 'dev', TMPDIR: directory },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const closed = Promise.withResolvers<ProbeChildStatus>();
  const stdoutEnd = Promise.withResolvers<null>();
  const stderrEnd = Promise.withResolvers<null>();
  child.once('close', (status, signal) => {
    closed.resolve([status, signal]);
  });
  child.stdout.once('end', () => {
    stdoutEnd.resolve(null);
  });
  child.stderr.once('end', () => {
    stderrEnd.resolve(null);
  });
  const stdinErrors: unknown[] = [];
  child.stdin.on('error', (failure) => {
    stdinErrors.push(failure);
  });
  return {
    child,
    directory,
    sentinel,
    identity,
    closed: closed.promise,
    ends: Promise.all([stdoutEnd.promise, stderrEnd.promise]),
    async finish() {
      if (!child.stdin.destroyed && !child.stdin.writableEnded) child.stdin.end();
      await closed.promise;
      await Promise.all([stdoutEnd.promise, stderrEnd.promise]);
      expect((await sentinel.stat({ bigint: true })).ino).toBe(identity.ino);
      expect(await fs.readFile(directory + '/foreign', 'utf8')).toBe('foreign-lifetime');
      expect(stdinErrors).toEqual([]);
      await sentinel.close();
      await fs.rm(directory, { recursive: true });
    },
  };
}

test('owned probe lifetime overflow cancels only original child and joins actual close EOF', async () => {
  const owned = await openInertLifetimeProbe('overflow');
  const originalKill = owned.child.kill.bind(owned.child);
  const signals: unknown[] = [];
  const cancelling = spyOn(owned.child, 'kill').mockImplementation(function (
    this: typeof owned.child,
    signal,
  ) {
    if (this !== owned.child) throw Error('foreign child cancellation refused');
    signals.push(signal);
    return originalKill(signal);
  });
  const lifetime = new OwnedProbeLifetime(
    owned.child,
    process.hrtime.bigint() + 5_000_000_000n,
    [owned.sentinel, owned.directory],
    readProcessLocalNs,
  );
  try {
    const failure = await lifetime.wait().then(
      () => undefined,
      (cause: unknown) => cause,
    );
    expect(failure).toBeInstanceOf(AggregateError);
    if (!(failure instanceof AggregateError))
      throw Error('owned failure shape differs', { cause: failure });
    expect(
      failure.errors.some(
        (cause) => cause instanceof Error && cause.message === 'owned child stream bound',
      ),
    ).toBe(true);
    await owned.closed;
    await owned.ends;
    expect(lifetime.isSettled()).toBe(true);
    expect(signals).toEqual(['SIGTERM']);
    lifetime.cancel();
    expect(signals).toEqual(['SIGTERM']);
    expect((await lifetime.stdout.done).length).toBeLessThanOrEqual(65536);
  } finally {
    await owned.finish();
    cancelling.mockRestore();
  }
}, 10000);

test('owned probe lifetime held original reader prevents settlement after actual close EOF', async () => {
  const owned = await openInertLifetimeProbe('held');
  const release = Promise.withResolvers<null>();
  const iterator = owned.child.stdout[Symbol.asyncIterator].bind(owned.child.stdout);
  owned.child.stdout[Symbol.asyncIterator] = async function* () {
    for await (const chunk of { [Symbol.asyncIterator]: iterator }) yield chunk;
    await release.promise;
    return undefined;
  };
  const lifetime = new OwnedProbeLifetime(
    owned.child,
    process.hrtime.bigint() + 5_000_000_000n,
    [owned.sentinel, owned.directory],
    readProcessLocalNs,
  );
  const waiting = lifetime.wait();
  let settled = false;
  void waiting.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  try {
    await owned.closed;
    await owned.ends;
    await Bun.sleep(20);
    expect(settled).toBe(false);
    expect(lifetime.stdout.complete).toBe(false);
    expect(lifetime.isSettled()).toBe(false);
    expect((await owned.sentinel.stat({ bigint: true })).ino).toBe(owned.identity.ino);
    release.resolve(null);
    const observed = await waiting;
    expect(observed.status).toEqual([0, null]);
    expect(observed.stdout.toString()).toBe('held');
    expect(lifetime.isSettled()).toBe(true);
  } finally {
    release.resolve(null);
    await waiting.catch((cause: unknown) => {
      if (!(cause instanceof RetainedProbeChildFailure)) throw cause;
    });
    await Promise.all([lifetime.stdout.done, lifetime.stderr.done]);
    await owned.finish();
  }
}, 10000);

test('owned probe lifetime failed reader retains actual references despite independent EOF', async () => {
  const owned = await openInertLifetimeProbe('held');
  const primary = Error('owned original output reader failed');
  const iterator = owned.child.stdout[Symbol.asyncIterator].bind(owned.child.stdout);
  owned.child.stdout[Symbol.asyncIterator] = async function* () {
    for await (const chunk of { [Symbol.asyncIterator]: iterator }) yield chunk;
    throw primary;
  };
  const lifetime = new OwnedProbeLifetime(
    owned.child,
    process.hrtime.bigint() + 5_000_000_000n,
    [owned.sentinel, owned.directory],
    readProcessLocalNs,
  );
  try {
    const failure = await lifetime.wait().then(
      () => undefined,
      (cause: unknown) => cause,
    );
    expect(failure).toBeInstanceOf(RetainedProbeChildFailure);
    if (!(failure instanceof RetainedProbeChildFailure))
      throw Error('owned retained failure shape differs', { cause: failure });
    expect(failure.errors.includes(primary)).toBe(true);
    expect(failure.lifetime).toBe(lifetime);
    expect(retainedProbeChildren.has(lifetime)).toBe(true);
    expect(lifetime.dependencies[0]).toBe(owned.sentinel);
    expect((await owned.sentinel.stat({ bigint: true })).ino).toBe(owned.identity.ino);
  } finally {
    // The test guardian independently proves actual close and both native EOF events;
    // this does not turn the failed production reader into a successful settlement.
    await owned.finish();
  }
}, 10000);

test('owned probe lifetime cutoff refuses later effects and retains original cancellation refs', async () => {
  const owned = await openInertLifetimeProbe('stdin');
  const cutoffNs = process.hrtime.bigint() + 60_000_000n;
  const lifetime = new OwnedProbeLifetime(
    owned.child,
    cutoffNs,
    [owned.sentinel, owned.directory],
    readProcessLocalNs,
  );
  let laterEffects = 0;
  try {
    const failure = await lifetime.wait().then(
      () => undefined,
      (cause: unknown) => cause,
    );
    expect(failure).toBeInstanceOf(RetainedProbeChildFailure);
    if (!(failure instanceof RetainedProbeChildFailure))
      throw Error('owned retained failure shape differs', { cause: failure });
    expect(failure.lifetime.cutoffNs).toBe(cutoffNs);
    expect(lifetime.cancelRequested).toBe(true);
    try {
      requireOwnedProbeTime(cutoffNs, readProcessLocalNs);
      laterEffects++;
    } catch (cause) {
      expect(cause).toBeInstanceOf(Error);
    }
    expect(laterEffects).toBe(0);
    expect((await owned.sentinel.stat({ bigint: true })).ino).toBe(owned.identity.ino);
  } finally {
    await owned.finish();
  }
}, 10000);

interface OwnedLowerLifetimeControl {
  readonly sameBinding: boolean;
  readonly RetainedProbeLifetime: {
    new (
      message: string,
      failures: readonly unknown[],
      references: readonly unknown[],
    ): AggregateError;
    readonly prototype: AggregateError;
    recognizes(value: unknown): boolean;
  };
  readonly runOwnedLowerScope: (
    work: () => unknown,
    cleanup: () => void | Promise<void>,
    references: () => readonly unknown[],
    cutoffNs: bigint,
  ) => Promise<AggregateError>;
}
async function loadOwnedLowerLifetimeControl(directory: string) {
  const fs = await import('node:fs/promises');
  const source = `import {RetainedProbeLifetime} from 'stageb:retained-lifetime';
import {RetainedProbeLifetime as EntryRetention} from 'stageb:retained-lifetime';
const readMonotonicNs=()=>process.hrtime.bigint();
${lowerLifetimeConsumerSource}
export const sameBinding=RetainedProbeLifetime===EntryRetention;
export {RetainedProbeLifetime,runOwnedLowerScope};`;
  const built = await Bun.build({
    entrypoints: ['owned-lifetime:control'],
    target: 'bun',
    format: 'esm',
    splitting: false,
    plugins: [
      {
        name: 'owned-lifetime-control',
        setup(build) {
          provideRetainedLifetimeModule(build);
          provideCommonClockModule(build);
          build.onResolve({ filter: /^owned-lifetime:control$/ }, () => ({
            path: 'control',
            namespace: 'owned-lifetime',
          }));
          build.onLoad({ filter: /^control$/, namespace: 'owned-lifetime' }, () => ({
            contents: source,
            loader: 'js',
          }));
        },
      },
    ],
  });
  if (!built.success || built.outputs.length !== 1)
    throw new AggregateError(built.logs, 'owned lifetime control build failed');
  const bytes = Buffer.from(await built.outputs[0].arrayBuffer());
  const path = directory + '/lifetime-control.mjs';
  await fs.writeFile(path, bytes, { mode: 0o600, flag: 'wx' });
  const ts = await import('typescript');
  const parsed = ts.createSourceFile(
    path,
    bytes.toString(),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const classes: string[] = [];
  const calls: { callee: string; line: number }[] = [];
  const visit = (node: TypeScriptNode) => {
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      const names = node.members.map((member) => member.name?.getText(parsed));
      if (names.includes('recognizes') && names.includes('retain'))
        classes.push(node.getText(parsed));
    }
    if (ts.isCallExpression(node) || ts.isNewExpression(node))
      calls.push({
        callee: node.expression.getText(parsed),
        line: parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1,
      });
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  const scan = new Bun.Transpiler({ loader: 'js' }).scan(bytes.toString());
  if (classes.length !== 1 || scan.imports.length !== 0)
    throw Error('emitted virtual singleton binding differs');
  const parent = process.env['TMPDIR'];
  if (parent === undefined) throw Error('binding evidence parent absent');
  const evidenceDirectory = await fs.mkdtemp(parent + '/probe-lifetime-binding-');
  await fs.chmod(evidenceDirectory, 0o700);
  await fs.writeFile(evidenceDirectory + '/control.mjs', bytes, { mode: 0o600 });
  await fs.writeFile(evidenceDirectory + '/control-source.txt', source, { mode: 0o600 });
  await fs.writeFile(
    evidenceDirectory + '/binding.json',
    JSON.stringify(
      {
        emittedSha256: fixtureHash(bytes),
        moduleSourceSha256: fixtureHash(retainedLifetimeModuleSource),
        consumerSourceSha256: fixtureHash(lowerLifetimeConsumerSource),
        classes: classes.length,
        primitiveImports: scan.imports,
        calls,
      },
      null,
      2,
    ) + '\n',
    { mode: 0o600 },
  );
  // Boundary: this exact private compiled body has one nominal class and no primitive imports, audited immediately above.
  const module = (await import(path)) as OwnedLowerLifetimeControl;
  return { module, bytes, source, evidenceDirectory };
}

test('owned probe lifetime exact virtual nominal retention holds actual reader FD and mock', async () => {
  const owned = await openInertLifetimeProbe('held');
  const release = Promise.withResolvers<null>();
  const iterator = owned.child.stdout[Symbol.asyncIterator].bind(owned.child.stdout);
  owned.child.stdout[Symbol.asyncIterator] = async function* () {
    for await (const chunk of { [Symbol.asyncIterator]: iterator }) yield chunk;
    await release.promise;
    return undefined;
  };
  const lifetime = new OwnedProbeLifetime(
    owned.child,
    process.hrtime.bigint() + 5_000_000_000n,
    [owned.sentinel, owned.directory],
    readProcessLocalNs,
  );
  const waiting = lifetime.wait();
  let cleanupCalls = 0;
  let restored = 0;
  let unmappedReads = 0;
  const boundary = {
    read: async () => {
      unmappedReads++;
      return await owned.sentinel.stat({ bigint: true });
    },
  };
  const mock = spyOn(boundary, 'read').mockImplementation(
    async () => await owned.sentinel.stat({ bigint: true }),
  );
  const restore = () => {
    restored++;
    if (!lifetime.isSettled())
      throw Error('protected mock restore before original reader settlement');
    mock.mockRestore();
  };
  try {
    const control = await loadOwnedLowerLifetimeControl(owned.directory);
    expect(control.module.sameBinding).toBe(true);
    const { RetainedProbeLifetime, runOwnedLowerScope } = control.module;
    const primary = Error('actual original reader still pending');
    const original = new RetainedProbeLifetime(
      'original raw dependency pending',
      [primary],
      [lifetime, owned.child, owned.child.stdout, waiting, restore],
    );
    const retained = await runOwnedLowerScope(
      async () => {
        await owned.closed;
        await owned.ends;
        throw original;
      },
      async () => {
        cleanupCalls++;
        restore();
        await owned.sentinel.close();
      },
      () => [owned.sentinel, owned.directory],
      lifetime.cutoffNs,
    );
    expect(RetainedProbeLifetime.recognizes(retained)).toBe(true);
    expect(retained).toBe(original);
    expect(RetainedProbeLifetime.recognizes(JSON.parse(JSON.stringify(original)) as unknown)).toBe(
      false,
    );
    expect(retained.errors.includes(primary)).toBe(true);
    expect(cleanupCalls).toBe(0);
    expect(restored).toBe(0);
    expect((await boundary.read()).ino).toBe(owned.identity.ino);
    expect(unmappedReads).toBe(0);
    expect(lifetime.stdout.complete).toBe(false);
    expect(RetainedProbeLifetime.recognizes(Object.create(RetainedProbeLifetime.prototype))).toBe(
      false,
    );
    expect(RetainedProbeLifetime.recognizes(new AggregateError([primary], original.message))).toBe(
      false,
    );
    release.resolve(null);
    await waiting;
    expect(lifetime.isSettled()).toBe(true);
  } finally {
    release.resolve(null);
    await waiting;
    restore();
    await owned.finish();
  }
}, 10000);

test('owned probe lifetime cleanup failure cannot publish evidence or close later original FD', async () => {
  const owned = await openInertLifetimeProbe('held');
  const lifetime = new OwnedProbeLifetime(
    owned.child,
    process.hrtime.bigint() + 5_000_000_000n,
    [owned.sentinel, owned.directory],
    readProcessLocalNs,
  );
  let publications = 0;
  let laterCloses = 0;
  const primary = Error('actual lower cleanup dependency failure');
  const closeFailure = spyOn(owned.sentinel, 'close').mockImplementationOnce(() =>
    Promise.reject(primary),
  );
  try {
    await lifetime.wait();
    const { module } = await loadOwnedLowerLifetimeControl(owned.directory);
    const retained = await module.runOwnedLowerScope(
      async () => {
        await owned.closed;
        await owned.ends;
        return 'inert control observation';
      },
      async () => {
        await owned.sentinel.close();
        laterCloses++;
      },
      () => [owned.sentinel, owned.directory],
      lifetime.cutoffNs,
    );
    if (!module.RetainedProbeLifetime.recognizes(retained)) publications++;
    expect(module.RetainedProbeLifetime.recognizes(retained)).toBe(true);
    expect(retained.errors.includes(primary)).toBe(true);
    expect(publications).toBe(0);
    expect(laterCloses).toBe(0);
    expect((await owned.sentinel.stat({ bigint: true })).ino).toBe(owned.identity.ino);
  } finally {
    closeFailure.mockRestore();
    await owned.finish();
  }
}, 10000);

test('owned probe lifetime ordinary lookalike uses original settled failure cleanup', async () => {
  const owned = await openInertLifetimeProbe('held');
  const lifetime = new OwnedProbeLifetime(
    owned.child,
    process.hrtime.bigint() + 5_000_000_000n,
    [owned.sentinel, owned.directory],
    readProcessLocalNs,
  );
  let cleanupCalls = 0;
  try {
    await lifetime.wait();
    const { module } = await loadOwnedLowerLifetimeControl(owned.directory);
    const lookalike = Object.assign(new AggregateError([], 'lookalike'), {
      retain() {
        throw Error('lookalike method invoked');
      },
    });
    const failure = await module
      .runOwnedLowerScope(
        () => {
          throw lookalike;
        },
        () => {
          cleanupCalls++;
        },
        () => [owned.sentinel],
        lifetime.cutoffNs,
      )
      .then(
        () => undefined,
        (cause: unknown) => cause,
      );
    expect(failure).toBe(lookalike);
    expect(module.RetainedProbeLifetime.recognizes(failure)).toBe(false);
    expect(cleanupCalls).toBe(1);
  } finally {
    await owned.finish();
  }
}, 10000);

test('owned probe lifetime parent direct terminal does not close unresolved dependent authority FD', async () => {
  const owned = await openInertLifetimeProbe('abnormal');
  const lifetime = new OwnedProbeLifetime(
    owned.child,
    process.hrtime.bigint() + 5_000_000_000n,
    [owned.sentinel, owned.directory],
    readProcessLocalNs,
  );
  let authorityCloses = 0;
  try {
    const failure = await concludeOwnedLowerParent(lifetime, () => {
      authorityCloses++;
      throw Error('protected authority close while dependent scopes unproved');
    }, [owned.sentinel, owned.directory]).then(
      () => undefined,
      (cause: unknown) => cause,
    );
    await owned.closed;
    await owned.ends;
    expect(failure).toBeInstanceOf(RetainedLowerScopeFailure);
    if (!(failure instanceof RetainedLowerScopeFailure))
      throw Error('owned lower failure shape differs', { cause: failure });
    expect(failure.lifetime).toBe(lifetime);
    expect(lifetime.isSettled()).toBe(true);
    expect(authorityCloses).toBe(0);
    expect(failure.dependencies[0]).toBe(owned.sentinel);
    expect((await owned.sentinel.stat({ bigint: true })).ino).toBe(owned.identity.ino);
  } finally {
    await owned.finish();
  }
}, 10000);

test('owned probe lifetime terminal callback remains required after actual close and both EOFs', async () => {
  const owned = await openInertLifetimeProbe('held');
  const captured = Promise.withResolvers<null>();
  const originalOnce = owned.child.once.bind(owned.child);
  const originalOnceProperty = Object.getOwnPropertyDescriptor(owned.child, 'once');
  let deliver: (() => void) | undefined;
  let registrations = 0;
  let deliveries = 0;
  owned.child.once = function (
    event: string | symbol,
    listener: (...arguments_: unknown[]) => void,
  ) {
    if (event !== 'close') return originalOnce(event, listener);
    registrations++;
    return originalOnce(event, (...arguments_: unknown[]) => {
      deliver = () => {
        deliveries++;
        deliver = undefined;
        listener.apply(owned.child, arguments_);
      };
      captured.resolve(null);
    });
  };
  let lifetime: OwnedProbeLifetime;
  try {
    lifetime = new OwnedProbeLifetime(
      owned.child,
      process.hrtime.bigint() + 5_000_000_000n,
      [owned.sentinel, owned.directory],
      readProcessLocalNs,
    );
  } finally {
    if (originalOnceProperty === undefined) Reflect.deleteProperty(owned.child, 'once');
    else Object.defineProperty(owned.child, 'once', originalOnceProperty);
  }
  const waiting = lifetime.wait();
  let settled = false;
  void waiting.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  try {
    await captured.promise;
    await owned.closed;
    await owned.ends;
    await Promise.all([lifetime.stdout.done, lifetime.stderr.done]);
    await Bun.sleep(20);
    expect(registrations).toBe(1);
    expect(settled).toBe(false);
    expect(lifetime.status).toBeUndefined();
    expect((await owned.sentinel.stat({ bigint: true })).ino).toBe(owned.identity.ino);
    if (deliver === undefined) throw Error('actual production close callback absent');
    deliver();
    expect((await waiting).status).toEqual([0, null]);
    expect(deliveries).toBe(1);
  } finally {
    if (deliver !== undefined) deliver();
    await waiting.catch((cause: unknown) => {
      if (!(cause instanceof RetainedProbeChildFailure)) throw cause;
    });
    await owned.finish();
  }
}, 10000);

test('owned probe lifetime entry cutoff refuses work before any later private effect', async () => {
  const owned = await openInertLifetimeProbe('held');
  const lifetime = new OwnedProbeLifetime(
    owned.child,
    process.hrtime.bigint() + 5_000_000_000n,
    [owned.sentinel, owned.directory],
    readProcessLocalNs,
  );
  let workCalls = 0;
  let cleanupCalls = 0;
  try {
    await lifetime.wait();
    const { module } = await loadOwnedLowerLifetimeControl(owned.directory);
    const originalCutoffNs = process.hrtime.bigint() - 1n;
    const retained = await module.runOwnedLowerScope(
      () => {
        workCalls++;
        return lifetime.status;
      },
      () => {
        cleanupCalls++;
      },
      () => [owned.sentinel, owned.directory],
      originalCutoffNs,
    );
    expect(module.RetainedProbeLifetime.recognizes(retained)).toBe(true);
    expect(workCalls).toBe(0);
    expect(cleanupCalls).toBe(0);
    expect((await owned.sentinel.stat({ bigint: true })).ino).toBe(owned.identity.ino);
  } finally {
    await owned.finish();
  }
}, 10000);

test('owned probe lifetime entry cutoff refuses cleanup admitted after original work budget', async () => {
  const owned = await openInertLifetimeProbe('held');
  const lifetime = new OwnedProbeLifetime(
    owned.child,
    process.hrtime.bigint() + 5_000_000_000n,
    [owned.sentinel, owned.directory],
    readProcessLocalNs,
  );
  let cleanupCalls = 0;
  try {
    await lifetime.wait();
    const { module } = await loadOwnedLowerLifetimeControl(owned.directory);
    const originalCutoffNs = process.hrtime.bigint() + 15_000_000n;
    const retained = await module.runOwnedLowerScope(
      async () => {
        await Bun.sleep(25);
        return lifetime.status;
      },
      () => {
        cleanupCalls++;
        throw Error('protected original FD cleanup past cutoff');
      },
      () => [owned.sentinel, owned.directory],
      originalCutoffNs,
    );
    expect(module.RetainedProbeLifetime.recognizes(retained)).toBe(true);
    expect(cleanupCalls).toBe(0);
    expect((await owned.sentinel.stat({ bigint: true })).ino).toBe(owned.identity.ino);
  } finally {
    await owned.finish();
  }
}, 10000);

test('owned probe lifetime entry cutoff prevents publication after delayed original cleanup', async () => {
  const owned = await openInertLifetimeProbe('held');
  const lifetime = new OwnedProbeLifetime(
    owned.child,
    process.hrtime.bigint() + 5_000_000_000n,
    [owned.sentinel, owned.directory],
    readProcessLocalNs,
  );
  let publications = 0;
  try {
    await lifetime.wait();
    const { module } = await loadOwnedLowerLifetimeControl(owned.directory);
    const originalCutoffNs = process.hrtime.bigint() + 15_000_000n;
    const retained = await module.runOwnedLowerScope(
      () => lifetime.status,
      async () => {
        await Bun.sleep(25);
      },
      () => [owned.sentinel, owned.directory],
      originalCutoffNs,
    );
    if (!module.RetainedProbeLifetime.recognizes(retained)) publications++;
    expect(module.RetainedProbeLifetime.recognizes(retained)).toBe(true);
    expect(publications).toBe(0);
    expect((await owned.sentinel.stat({ bigint: true })).ino).toBe(owned.identity.ino);
  } finally {
    await owned.finish();
  }
}, 10000);

test.each(['stdout', 'stderr'] as const)(
  'owned probe lifetime original %s EOF observation cannot be replaced by reader completion',
  async (channel) => {
    const owned = await openInertLifetimeProbe('held');
    const stream = owned.child[channel];
    const originalOnce = stream.once.bind(stream);
    const originalProperty = Object.getOwnPropertyDescriptor(stream, 'once');
    let deliver: (() => void) | undefined;
    let held = false;
    stream.once = function (event: string | symbol, listener: (...arguments_: unknown[]) => void) {
      if (event !== 'end' || held) return originalOnce(event, listener);
      held = true;
      return originalOnce(event, (...arguments_: unknown[]) => {
        deliver = () => {
          deliver = undefined;
          listener.apply(stream, arguments_);
        };
      });
    };
    let lifetime: OwnedProbeLifetime;
    try {
      lifetime = new OwnedProbeLifetime(
        owned.child,
        process.hrtime.bigint() + 5_000_000_000n,
        [owned.sentinel, owned.directory],
        readProcessLocalNs,
      );
    } finally {
      if (originalProperty === undefined) Reflect.deleteProperty(stream, 'once');
      else Object.defineProperty(stream, 'once', originalProperty);
    }
    try {
      const failure = await lifetime.wait().then(
        () => undefined,
        (cause: unknown) => cause,
      );
      await owned.closed;
      await owned.ends;
      await Promise.all([lifetime.stdout.done, lifetime.stderr.done]);
      expect(failure).toBeInstanceOf(RetainedProbeChildFailure);
      expect(lifetime[channel].complete).toBe(true);
      expect(lifetime[channel].eof).toBe(false);
      expect((await owned.sentinel.stat({ bigint: true })).ino).toBe(owned.identity.ino);
      if (deliver === undefined) throw Error('actual original stream EOF observer absent');
      deliver();
      expect(lifetime.isSettled()).toBe(true);
    } finally {
      if (deliver !== undefined) deliver();
      await Promise.all([lifetime.stdout.done, lifetime.stderr.done]);
      await owned.finish();
    }
  },
  10000,
);

test('owned probe lifetime generated entry keeps actual FD mock and stdin reader until same-stream recovery', async () => {
  const fs = await import('node:fs/promises');
  const { spawn } = await import('node:child_process');
  const { readMonotonicNs } = await loadOwnedProbeClock();
  const parent = process.env['TMPDIR'];
  if (parent === undefined) throw Error('owned retained-entry parent absent');
  const directory = await fs.mkdtemp(parent + '/probe-retained-entry-');
  await fs.chmod(directory, 0o700);
  const runtime = await fs.readFile(process.execPath);
  if (fixtureHash(runtime) !== '10702245766b225e70bbf6235fd6b47214fd94b4760d00ffaed8ab0df57ac235')
    throw Error('trusted retained-entry Bun differs');
  const cutoffNs = readMonotonicNs() + 5_000_000_000n;
  const source = `import {open,writeFile,rename} from 'node:fs/promises';
import {RetainedProbeLifetime} from 'stageb:retained-lifetime';
import {readMonotonicNs} from 'stageb:monotonic-clock';
${lowerLifetimeConsumerSource}
${lowerLifetimeFinalizerSource}
const directory=${JSON.stringify(directory)};const cutoffNs=${String(cutoffNs)}n;
const original=await open(directory+'/lower-owned','wx+',384);await original.writeFile('original-lower-authority');
const identity=await original.stat({bigint:true});let cleanupCalls=0;let mockRestores=0;
const boundary={read:async()=>await original.stat({bigint:true})};const originalRead=boundary.read;
const mappedRead=async()=>await original.stat({bigint:true});boundary.read=mappedRead;
let nativeEOF=false;const eof=new Promise(resolve=>process.stdin.once('end',()=>{nativeEOF=true;resolve();}));
const reader=(async()=>{const chunks=[];for await(const chunk of process.stdin)chunks.push(Buffer.from(chunk));return Buffer.concat(chunks);})();
const keeper=setInterval(()=>{},1000);
async function publish(leaf,observation){await writeFile(directory+'/'+leaf+'.next',JSON.stringify(observation),{mode:384});await rename(directory+'/'+leaf+'.next',directory+'/'+leaf+'.json');}
const references=()=>[original,process.stdin,reader,eof,boundary,originalRead,keeper,directory];
const evidence=await runOwnedLowerScope(()=>{throw new RetainedProbeLifetime('actual stdin reader unproved',[Error('original stdin is still owned')],references());},async()=>{cleanupCalls++;if(!nativeEOF)throw Error('protected FD/mock cleanup before actual EOF');mockRestores++;boundary.read=originalRead;await original.close();},references,cutoffNs);
await publish('held',{descriptor:original.fd,device:String(identity.dev),inode:String(identity.ino),cleanupCalls,mockRestores,mockHeld:boundary.read===mappedRead,nativeEOF});
void (async()=>{const observed=await reader;await eof;const current=await original.stat({bigint:true});if(current.dev!==identity.dev||current.ino!==identity.ino)throw Error('original lower FD drift');await original.close();mockRestores++;boundary.read=originalRead;await publish('recovered',{reader:observed.toString(),nativeEOF,originalClosed:original.fd===-1,cleanupCalls,mockRestores});})().catch(failure=>{console.error('inert guardian failed');throw failure;});
await finalizeOwnedLowerScope(evidence,keeper,references);`;
  const built = await Bun.build({
    entrypoints: ['owned-lifetime:retained-entry'],
    target: 'bun',
    format: 'esm',
    splitting: false,
    plugins: [
      {
        name: 'actual-retained-entry-control',
        setup(build) {
          provideRetainedLifetimeModule(build);
          provideCommonClockModule(build);
          build.onResolve({ filter: /^owned-lifetime:retained-entry$/ }, () => ({
            path: 'entry',
            namespace: 'owned-retained-entry',
          }));
          build.onLoad({ filter: /^entry$/, namespace: 'owned-retained-entry' }, () => ({
            contents: source,
            loader: 'js',
          }));
        },
      },
    ],
  });
  if (!built.success || built.outputs.length !== 1)
    throw new AggregateError(built.logs, 'retained entry control build failed');
  const bytes = Buffer.from(await built.outputs[0].arrayBuffer());
  const entry = directory + '/retained-entry.mjs';
  await fs.writeFile(entry, bytes, { mode: 0o600, flag: 'wx' });
  const scan = new Bun.Transpiler({ loader: 'js' }).scan(bytes.toString());
  const singletonClasses = [
    ...bytes.toString().matchAll(/\bclass RetainedProbeLifetime extends AggregateError\b/g),
  ].length;
  if (
    singletonClasses !== 1 ||
    scan.imports.some((entry) => entry.path !== 'node:fs/promises' && entry.path !== 'fs/promises')
  )
    throw Error('retained entry primitive binding differs');
  const evidenceDirectory = await fs.mkdtemp(parent + '/probe-retained-entry-evidence-');
  await fs.chmod(evidenceDirectory, 0o700);
  await fs.writeFile(evidenceDirectory + '/source.txt', source, { mode: 0o600 });
  await fs.writeFile(evidenceDirectory + '/control.mjs', bytes, { mode: 0o600 });
  await fs.writeFile(
    evidenceDirectory + '/binding.json',
    JSON.stringify(
      {
        sourceSha256: fixtureHash(source),
        emittedSha256: fixtureHash(bytes),
        singletonClasses,
        primitiveImports: scan.imports,
        virtualModuleSha256: fixtureHash(retainedLifetimeModuleSource),
        consumerSha256: fixtureHash(lowerLifetimeConsumerSource),
        finalizerSha256: fixtureHash(lowerLifetimeFinalizerSource),
        cutoffNs: String(cutoffNs),
      },
      null,
      2,
    ) + '\n',
    { mode: 0o600 },
  );
  const authority = await fs.open(directory + '/parent-authority', 'wx+', 0o600);
  await authority.writeFile('original-parent-authority');
  const originalAuthority = await authority.stat({ bigint: true });
  requireOwnedProbeTime(cutoffNs, readMonotonicNs);
  const child = spawn(process.execPath, ['--no-env-file', entry], {
    cwd: directory,
    env: { WBS_ENV: 'dev', TMPDIR: directory, BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const independentClose = Promise.withResolvers<ProbeChildStatus>();
  child.once('close', (code, signal) => {
    independentClose.resolve([code, signal]);
  });
  const stdoutEnd = Promise.withResolvers<null>();
  const stderrEnd = Promise.withResolvers<null>();
  child.stdout.once('end', () => {
    stdoutEnd.resolve(null);
  });
  child.stderr.once('end', () => {
    stderrEnd.resolve(null);
  });
  const lifetime = new OwnedProbeLifetime(child, cutoffNs, [authority, directory], readMonotonicNs);
  let parentCloses = 0;
  const result = concludeOwnedLowerParent(lifetime, () => {
    parentCloses++;
    throw Error('protected parent authority release under dependent uncertainty');
  }, [authority, directory]).then(
    () => undefined,
    (cause: unknown) => cause,
  );
  const poll = async (leaf: string) => {
    for (;;) {
      requireOwnedProbeTime(cutoffNs, readMonotonicNs);
      try {
        return await fs.readFile(directory + '/' + leaf + '.json', 'utf8');
      } catch (cause) {
        if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) throw cause;
      }
      await Bun.sleep(5);
    }
  };
  try {
    const held = JSON.parse(await poll('held')) as {
      descriptor: number;
      device: string;
      inode: string;
      cleanupCalls: number;
      mockRestores: number;
      mockHeld: boolean;
      nativeEOF: boolean;
    };
    if (!Number.isSafeInteger(held.descriptor) || held.descriptor < 0 || child.pid === undefined)
      throw Error('original held FD observation malformed');
    expect(held.cleanupCalls).toBe(0);
    expect(held.mockRestores).toBe(0);
    expect(held.mockHeld).toBe(true);
    expect(held.nativeEOF).toBe(false);
    const original = await fs.lstat(directory + '/lower-owned', { bigint: true });
    const actualFD = await fs.stat(
      '/proc/' + String(child.pid) + '/fd/' + String(held.descriptor),
      { bigint: true },
    );
    expect(actualFD.dev).toBe(original.dev);
    expect(actualFD.ino).toBe(original.ino);
    expect(child.exitCode).toBeNull();
    expect(lifetime.isSettled()).toBe(false);
    child.stdin.end('recover-original-stream');
    const recovered = JSON.parse(await poll('recovered')) as {
      reader: string;
      nativeEOF: boolean;
      originalClosed: boolean;
      cleanupCalls: number;
      mockRestores: number;
    };
    expect(recovered).toEqual({
      reader: 'recover-original-stream',
      nativeEOF: true,
      originalClosed: true,
      cleanupCalls: 0,
      mockRestores: 1,
    });
    let absent = false;
    try {
      await fs.stat('/proc/' + String(child.pid) + '/fd/' + String(held.descriptor));
    } catch (cause) {
      if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) throw cause;
      absent = true;
    }
    expect(absent).toBe(true);
    lifetime.cancel();
    const failure = await result;
    expect(failure).toBeInstanceOf(RetainedLowerScopeFailure);
    expect(parentCloses).toBe(0);
    expect((await authority.stat({ bigint: true })).ino).toBe(originalAuthority.ino);
    expect((await lifetime.stdout.done).length).toBe(0);
    expect((await lifetime.stderr.done).toString()).toContain(
      'owned lower lifetime retained; original scopes unresolved',
    );
    await fs.writeFile(
      evidenceDirectory + '/runtime.json',
      JSON.stringify(
        {
          pid: child.pid,
          argv: child.spawnargs,
          cwd: directory,
          environment: {
            WBS_ENV: 'dev',
            TMPDIR: directory,
            BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0',
          },
          held,
          recovered,
          parentCloses,
          directStatus: lifetime.status,
          stdoutBytes: (await lifetime.stdout.done).length,
          stderr: (await lifetime.stderr.done).toString(),
          authorityDevice: String(originalAuthority.dev),
          authorityInode: String(originalAuthority.ino),
          scope:
            'inert test guardian recovered SAME actual stdin/FD/mock; original entry cleanup stayed0; SIGTERM of original child is not original I/J cleanup or descendant proof',
        },
        null,
        2,
      ) + '\n',
      { mode: 0o600 },
    );
  } finally {
    if (!child.stdin.destroyed && !child.stdin.writableEnded) child.stdin.end();
    lifetime.cancel();
    await independentClose.promise;
    await Promise.all([
      stdoutEnd.promise,
      stderrEnd.promise,
      lifetime.stdout.done,
      lifetime.stderr.done,
    ]);
    await result;
    // Explicit inert-test guardian cleanup after actual direct child/EOF settlement is
    // not an original I/J cleanup claim; forced exit can only close lower FDs mechanically.
    await authority.close();
    await fs.rm(directory, { recursive: true });
  }
}, 10000);
