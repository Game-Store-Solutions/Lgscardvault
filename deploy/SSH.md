# SSH access (Hetzner prod)

Local shortcut for the production VPS. **Never commit private keys or passphrases.**

| Item | Value |
|------|--------|
| Server name | `lgs-prod-app-1` |
| Provider | Hetzner Cloud (US — Ashburn/Hillsboro) |
| Private network | `lgscardvault-us-east` |
| SSH Host alias | `lgs` |
| User | `root` |
| Key (on your PC) | `~/.ssh/id_ed25519` (+ `.pub` on the server) |

## Connect

```powershell
ssh lgs
```

Or after loading your PowerShell profile:

```powershell
lgs
```

Enter the **key passphrase** when `ssh-add` / first connect asks. With `ssh-agent` running, you usually unlock once per login session.

## One-time setup (Windows)

Already applied on the machine that ran this bootstrap; re-run if you get a new PC:

```powershell
# 1. Keys live in %USERPROFILE%\.ssh\ (not OneDrive)
# 2. Config: %USERPROFILE%\.ssh\config
```

```
Host lgs
  HostName <PUBLIC_IPV4_FROM_HETZNER>
  User root
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
```

```powershell
Get-Service ssh-agent | Set-Service -StartupType Manual
Start-Service ssh-agent
ssh-add $env:USERPROFILE\.ssh\id_ed25519

# Optional shortcut
function lgs { ssh lgs }   # also in PowerShell $PROFILE
```

**Windows note:** if `Start-Service ssh-agent` fails and `ssh-add` says `Error connecting to agent`, the service is **Disabled**. Open **PowerShell as Administrator** once and run:

```powershell
Set-Service ssh-agent -StartupType Manual
Start-Service ssh-agent
```

Then in a normal terminal: `ssh-add $env:USERPROFILE\.ssh\id_ed25519`.

Without the agent, `ssh lgs` still works — you just enter the passphrase on every connect.

Current prod IP (update if the server is rebuilt): see Hetzner console for `lgs-prod-app-1`, or `HostName` in your local `~/.ssh/config`.

## Rules

- Hetzner **SSH key** field = **public** key only (`.pub` / `ssh-ed25519 AAAA…`).
- `ssh -i` / `IdentityFile` = **private** key (no `.pub`).
- Deploy CI will use a **separate** deploy key later (`lgs-deploy`) — do not reuse your laptop key in GitHub Actions secrets if you can avoid it.
- Server hostname must be RFC 1123 (`lgs-prod-app-1`, hyphens only — no underscores).
