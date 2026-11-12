# Running the game server on the PC (Windows)

Before launch the game runs on the owner's PC: `wrangler dev` serves the built client and the `/api` server, and a
TryCloudflare quick tunnel puts it online. This page is the runbook.

## Where things live
- Repo: `C:\Users\User\Desktop\Repositories\Guildwright\IdleMMO`
- Server data (the local database): `C:\Users\User\Desktop\Repositories\Guildwright\guildwright-data`
- Backups: `C:\Users\User\Desktop\Repositories\Guildwright\guildwright-backups`

The data and backups sit next to the repo, not inside it, so `git clean -x`, deleting the repo or cloning it again
can't wipe player data. To use other folders, set `GW_DATA_DIR` and/or `GW_BACKUP_DIR` once
(`setx GW_DATA_DIR "D:\guildwright-data"`, then open a new terminal). If OneDrive syncs your Desktop, move both folders
outside it: syncing a live database can lock or corrupt it.

## First-time setup
In PowerShell, in the repo folder:
```powershell
npm install
npm run build -w @guildwright/client
Copy-Item server\.dev.vars.example server\.dev.vars
```
`server\.dev.vars` is ignored by git. Never commit it.

## Start the server
The tunnel already points at `http://localhost:4173`, so run the server on that port and the tunnel keeps its URL.
1. Stop `vite preview` (Ctrl+C in its window). Only one program can use port 4173.
2. After every `git pull`, rebuild the client: `npm run build -w @guildwright/client`
3. Start the server:
   ```powershell
   npm run serve
   ```
   That runs the server on port 4173. It applies any new database migrations first, then starts `wrangler dev`.
   A brand-new data folder just works. `npm run dev:server` uses port 8787 instead.
   PowerShell drops a bare `--`, so `npm run dev -w @guildwright/server -- --port 4173` loses the `--port`; the
   script now reads a lone number as the port, but `npm run serve` is the simple way.

Players keep their local saves when you switch from `vite preview` to the server, because the address stays the same.

## Check it works
- Open `https://<tunnel>.trycloudflare.com/api/health`. You should see
  `{"ok":true,"version":"0.0.0","db":true,"tables":5}`. `db:false` means the database didn't open: read the
  server window for errors.
- The server window prints one `[headers] GET /api/health {...}` line per `/api` request (because
  `LOG_HEADERS=1` in `.dev.vars`). Copy one of those lines from a request made through the tunnel (ideally from your
  phone) and send it to Claude: it's needed to write the sign-in Origin check. Then set `LOG_HEADERS=0`.
- A 502 from the tunnel usually means nothing is listening on 4173, or `localhost` resolves differently for the tunnel
  and the server. Set `GW_PORT=4173` and run `npm run dev -w @guildwright/server '--' --ip 127.0.0.1` (quote the `--` in PowerShell).

## Daily backup
Run one backup by hand first (it also creates the backups folder):
```powershell
npm run backup -w @guildwright/server
```
It prints the file name and size, for example `guildwright-20261113-0400.sql (1.5 KB)`, and keeps the newest 14.
Backups work while the server is running.

Then schedule it daily at 04:00 (paste into PowerShell once):
```powershell
$repo = "C:\Users\User\Desktop\Repositories\Guildwright\IdleMMO"
$action = New-ScheduledTaskAction -Execute "cmd.exe" -WorkingDirectory $repo `
  -Argument '/c npm run backup -w @guildwright/server >> ..\guildwright-backups\backup.log 2>&1'
$trigger = New-ScheduledTaskTrigger -Daily -At 4am
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable
Register-ScheduledTask -TaskName "Guildwright backup" -Action $action -Trigger $trigger -Settings $settings
```
It runs while you're signed in to Windows. Check `guildwright-backups\backup.log` now and then. To remove it:
`Unregister-ScheduledTask -TaskName "Guildwright backup"`.

## Restore drill (do it once now, then monthly)
```powershell
npm run restore-check -w @guildwright/server
```
It loads the newest backup into a throwaway database, prints row counts (players, sessions, saves, treasury_log) and
deletes the throwaway copy. It never touches the live data. To check an older file:
`npm run restore-check -w @guildwright/server -- ..\guildwright-backups\guildwright-20261113-0400.sql`

To really restore (only if the live data is lost or broken):
1. Stop the server (Ctrl+C).
2. Rename `guildwright-data` to `guildwright-data-broken`.
3. From the `server` folder, load the backup into a new, empty data folder:
   ```powershell
   npx wrangler d1 execute guildwright --local --persist-to ..\..\guildwright-data --file ..\..\guildwright-backups\<file>.sql --yes
   ```
4. Start the server as usual. The migrations recorded in the backup are skipped.

## During test weeks
- Keep the PC awake: `powercfg /change standby-timeout-ac 0` and `powercfg /change hibernate-timeout-ac 0`
  (afterwards, for example, `powercfg /change standby-timeout-ac 30`).
- A Windows Update reboot, a cloudflared restart or a crash gives the tunnel a **new URL**. Players then open the new link,
  and their local saves and installs stay behind on the old address. Until cloud saves arrive, they move with a save
  export code. Set Windows Update active hours to cover play time, and post the new link when it changes.
- The weekly cron in `server/wrangler.jsonc` is in UTC. It's a stub today. Matching raids to Sydney time is a later
  engine task.
