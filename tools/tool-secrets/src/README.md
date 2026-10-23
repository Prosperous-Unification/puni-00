# tool-secrets

Encrypted secret storage for the WBS stack.

## Files

- `src/production.env.sops` — SOPS-encrypted production env (placeholder until a real age key is configured).
- `src/local.env.example` — non-secret template for local development. Copy to `.env.local` and fill in.
- `/.sops.yaml` (repo root) — creation rules mapping `*.env.sops` → age recipient(s).

## CLI (invoked through Nx)

> **None of these four does anything yet**: the SOPS integration does not exist because no real
> age key is configured, so read the list as the intended contract. `encrypt` and `updatekeys`
> print the command they _would_ run and exit 0. `decrypt` and `push` first refuse with exit 1
> while `production.env.sops` is the placeholder (no `sops_mac` or `ENC[`), then only print the
> command; `push` also requires `DEPLOY_HOST`. A `push` that appears to succeed has uploaded
> nothing. See `cli/*.ts`.

- `nx run tool-secrets:decrypt` — _intended:_ decrypt `production.env.sops` into a temp file, print the path, and exit.
- `nx run tool-secrets:encrypt` — _intended:_ encrypt a plaintext env file back into `production.env.sops` in place.
- `nx run tool-secrets:push` — _intended:_ upload the decrypted file to the remote host's env file. The target moved to `/home/puni1/wbs/.env` ([ADR 0002](../../../docs/adr/0002-environment-roots-live-under-the-deploy-users-home.md)); the placeholder still names the stale `/srv/wbs/.env`.
- `nx run tool-secrets:updatekeys` — _intended:_ run `sops updatekeys` to rewrap existing ciphertexts after adding/removing recipients in `.sops.yaml`.

All four targets are marked `cache: false` in `project.json` — they depend on runtime secrets and the Nx cache must never store their outputs.

## Key rotation playbook

1. **Add the new age recipient** to `.sops.yaml` under `key_groups.age`.
2. **Run `nx run tool-secrets:updatekeys`.** This rewraps the data key for every encrypted file with the new recipient list without changing the plaintext.
3. **Commit the rewrapped `.sops` file** alongside the `.sops.yaml` change.
4. **Remove an old recipient** by deleting it from `.sops.yaml` and re-running `updatekeys`. The old private key can no longer decrypt the file after the commit is merged.

## On-machine setup (one-time)

```bash
age-keygen -o ~/.config/sops/age/keys.txt
# Copy the printed public key (age1…) into .sops.yaml
export SOPS_AGE_KEY_FILE=~/.config/sops/age/keys.txt
```

## Safety

- Never commit decrypted material. The repo `.gitignore` covers `.env`, `.env.local`, `*.age` and
  `~/.config/sops/age/keys.txt`; it does not cover `*.env.plain` or `src/production.env`.
