# tool-secrets

Encrypted secret storage for the WBS stack.

## Files

- `src/production.env.sops` — SOPS-encrypted production env (placeholder until a real age key is configured).
- `src/local.env.example` — non-secret template for local development. Copy to `.env.local` and fill in.
- `/.sops.yaml` (repo root) — creation rules mapping `*.env.sops` → age recipient(s).

## CLI (invoked through Nx)

- `nx run tool-secrets:decrypt` — decrypt `production.env.sops` into a temp file, print the path, and exit.
- `nx run tool-secrets:encrypt` — encrypt a plaintext env file back into `production.env.sops` in place.
- `nx run tool-secrets:push` — upload the decrypted file to the remote host at `/srv/wbs/.env` via `scp`.
- `nx run tool-secrets:updatekeys` — run `sops updatekeys` to rewrap existing ciphertexts after adding/removing recipients in `.sops.yaml`.

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

- Never commit decrypted material. The repo `.gitignore` covers `*.env.plain`, `.env.local`, `~/.config/sops/**`.
- The CLI scripts are placeholders until a production age key lands; they fail fast with a helpful message so no accidental operations execute against an unconfigured trust root.
