# Guildwright

A mobile idle MMO about gathering, crafting and trading in a medieval guild town: idle gather, refine and craft through the week, then idle raid at the weekend. This repo is the phase 0 rebuild as a PWA (Svelte 5 client, Cloudflare Worker server, shared game engine).

## Layout

- `engine/`: pure game rules (shared by client and server).
- `client/`: Vite + Svelte 5 + TypeScript app (`@guildwright/client`), builds to `client/dist`.
- `server/`: Cloudflare Worker (`@guildwright/server`): `/api/*`, static assets from `client/dist`, D1 database, `Guild` Durable Object, weekly cron. D1 schema in `server/migrations/`.
- `art/`: art sources and `CREDITS.md` (record every pack, author, licence and link; flag share-alike).
- `index.html`: the legacy single-file prototype, kept at the root for now.

## Run locally

```
npm install
npm run build -w client
npm run dev:server        # Worker + built client at http://localhost:8787
```

For client hot reload, run `npm run dev:client` (Vite proxies `/api` to port 8787) alongside `dev:server`.

Other scripts: `npm test`, `npm run typecheck`, `npm run build`.

Note: `.npmrc` sets `legacy-peer-deps=true` because npm 10 crashes resolving vitest peer dependencies. It can go once npm is upgraded.

### Share with testers

```
npm run tunnel            # cloudflared tunnel --url http://localhost:8787
```

The quick-tunnel URL changes every restart, so testers must reopen the new link. Saves are stored per address (browser storage) until cloud saves exist, so a new URL means a fresh save.

### Test the weekly cron handler

`npm run dev:server` runs `wrangler dev --test-scheduled`. With it running:

```
curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=0+22+*+*+6"
```

The `scheduled` handler logs to the wrangler console. Cron times in `wrangler.jsonc` are UTC.

### Local database

`npm run migrate:local -w @guildwright/server` applies `server/migrations/` to the local D1.
