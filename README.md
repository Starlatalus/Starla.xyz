# Starla — Discord Security Dashboard

A real dashboard, not a mockup: it logs users in with actual Discord OAuth2, pulls
the actual list of servers they manage, and reads actual live security data
(verification level, 2FA requirement, AutoMod rules, audit log) straight from
Discord's API. Purple theme, mobile-friendly, three views (Overview / Logs /
Settings) plus a full Commands reference.

## What's real vs. what you need to add

Discord's REST API is the source of truth for everything below — nothing here is
faked or hardcoded with sample data:

| Feature | Source | Status |
|---|---|---|
| Login | Discord OAuth2 | ✅ Real |
| Server list | `/users/@me/guilds` | ✅ Real |
| Security score, verification level, 2FA, content filter | `/guilds/:id` | ✅ Real |
| AutoMod rules | `/guilds/:id/auto-moderation/rules` | ✅ Real |
| Moderation logs | `/guilds/:id/audit-logs` | ✅ Real |
| Command reference | `server/commands.json` | ✅ Real (edit this file to match your actual bot commands) |
| Anti-Nuke thresholds & status | — | ⚠️ Needs your bot |
| Backup snapshots | — | ⚠️ Needs your bot |

Anti-Nuke and Backups aren't Discord platform features — they're custom bot
logic that has to live somewhere with its own database (mass-ban detection,
snapshot storage, etc). The dashboard is built with clear hooks for this
(see `server/discord.js` and the "Anti-Nuke & Backups" card in
`dashboard.html`) — plug your bot's own API or database in there once you've
built that logic into the bot itself.

## 1. Create a Discord application

1. Go to <https://discord.com/developers/applications> → **New Application** → name it "Starla".
2. **OAuth2 → General**: copy the **Client ID** and **Client Secret**.
3. **OAuth2 → General → Redirects**: add `http://localhost:3000/auth/callback` (add your real domain later too, when you deploy).
4. **Bot** tab → **Add Bot** → copy the **Token** (click Reset Token if you don't see it). Under **Privileged Gateway Intents**, you don't need any for the dashboard itself.
5. Invite the bot to a server you manage so there's data to look at: **OAuth2 → URL Generator** → scopes `bot` + `applications.commands` → permissions: at minimum **View Audit Log**, **Manage Roles**, **Manage Channels**, **Kick Members**, **Ban Members**, **Moderate Members**, **Manage Webhooks** → open the generated URL and add it to a server.

## 2. Configure the server

```bash
cd server
cp .env.example .env
```

Fill in `.env`:

```
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_REDIRECT_URI=http://localhost:3000/auth/callback
SESSION_SECRET=any_long_random_string
PORT=3000
```

## 3. Install and run

```bash
cd server
npm install
npm start
```

Visit **http://localhost:3000**, click **Log in with Discord**, approve the
`identify` + `guilds` scopes, and you'll land on your real server list.

## Project structure

```
starla-dashboard/
├── server/
│   ├── index.js         # Express app: sessions, OAuth routes, API routes
│   ├── discord.js        # All real Discord REST API calls live here
│   ├── commands.json      # Starla's command catalogue — edit to match your bot
│   ├── package.json
│   └── .env.example
└── public/                # Static frontend, served by Express
    ├── index.html          # Login page
    ├── servers.html         # Real server picker
    ├── dashboard.html        # Per-server security dashboard
    ├── commands.html          # Command reference
    ├── css/style.css          # Purple theme — all design tokens at the top
    └── js/
        ├── servers.js
        ├── dashboard.js
        └── commands.js
```

## API routes (for reference)

- `GET /auth/login` — starts the OAuth2 flow
- `GET /auth/callback` — Discord redirects here after consent
- `POST /auth/logout` — clears the session
- `GET /api/me` — current logged-in user
- `GET /api/guilds` — servers the user can manage, flagged with whether Starla is in them
- `GET /api/guilds/:id` — live security snapshot for one server
- `GET /api/guilds/:id/logs` — recent audit log entries, normalized for the UI
- `GET /api/commands` — the command catalogue from `commands.json`

## Deploying

Any Node host works (Railway, Render, Fly.io, a VPS, etc.):

1. Set the same environment variables from `.env` in your host's dashboard — never commit `.env`.
2. Add your production URL's callback (`https://yourdomain.com/auth/callback`) to the Discord app's OAuth2 redirects, and update `DISCORD_REDIRECT_URI`.
3. `npm start` behind whatever process manager / reverse proxy you're using.

## Customizing the theme

All colors, fonts, and radii are CSS variables at the top of
`public/css/style.css` under `:root` — change `--accent` / `--accent-2` /
`--good` / `--warn` / `--danger` to reskin the whole dashboard from one place.

## Extending the command list

`server/commands.json` is a flat array of `{ category, name, desc }`. Add,
remove, or rename entries to match whatever slash commands your bot actually
registers — the Commands page renders straight from this file with no other
changes needed.
