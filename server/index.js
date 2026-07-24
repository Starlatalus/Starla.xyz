require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const discord = require('./discord');

const REQUIRED_ENV = ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_BOT_TOKEN', 'DISCORD_REDIRECT_URI'];
const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missingEnv.length) {
  console.warn('\n⚠️  Starla is running WITHOUT full Discord credentials.');
  console.warn(`   Missing: ${missingEnv.join(', ')}`);
  console.warn('   Copy server/.env.example to server/.env and fill it in — see README.md\n');
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 12 },
  })
);
app.use(express.static(path.join(__dirname, '..', 'public')));

function requireAuth(req, res, next) {
  if (!req.session.user || !req.session.accessToken) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  next();
}

/* ============================== AUTH ============================== */

app.get('/auth/login', (req, res) => {
  if (missingEnv.length) {
    return res.status(500).send(
      'Starla is missing Discord app credentials. Fill in server/.env — see README.md for setup steps.'
    );
  }
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;
  res.redirect(discord.getAuthorizeUrl(state));
});

app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state || state !== req.session.oauthState) {
    return res.status(400).send('Invalid or expired login attempt. Go back and try logging in again.');
  }
  try {
    const token = await discord.exchangeCodeForToken(code);
    const user = await discord.getCurrentUser(token.access_token);
    req.session.accessToken = token.access_token;
    req.session.user = user;
    res.redirect('/servers.html');
  } catch (err) {
    console.error('OAuth callback failed:', err.body || err.message);
    res.status(500).send('Login with Discord failed. Check server logs and your .env credentials.');
  }
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({
    id: req.session.user.id,
    username: req.session.user.username,
    avatar: req.session.user.avatar
      ? `https://cdn.discordapp.com/avatars/${req.session.user.id}/${req.session.user.avatar}.png`
      : `https://cdn.discordapp.com/embed/avatars/${Number(req.session.user.discriminator || 0) % 5}.png`,
  });
});

/* ============================== GUILDS ============================== */

// All servers the logged-in user can manage, flagged with whether Starla is in them
app.get('/api/guilds', requireAuth, async (req, res) => {
  try {
    const [userGuilds, botGuilds] = await Promise.all([
      discord.getUserGuilds(req.session.accessToken),
      discord.getBotGuilds().catch(() => []), // bot token optional at this stage
    ]);

    const botGuildIds = new Set(botGuilds.map((g) => g.id));

    const manageable = userGuilds
      .filter((g) => discord.hasManagePermissions(g.permissions))
      .map((g) => ({
        id: g.id,
        name: g.name,
        icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null,
        botPresent: botGuildIds.has(g.id),
        inviteUrl: discord.getBotInviteUrl(g.id),
      }));

    res.json(manageable);
  } catch (err) {
    console.error('GET /api/guilds failed:', err.body || err.message);
    res.status(502).json({ error: 'Could not fetch servers from Discord' });
  }
});

// Real security snapshot for one guild
app.get('/api/guilds/:id', requireAuth, async (req, res) => {
  try {
    const [guild, automodRules] = await Promise.all([
      discord.getGuildDetail(req.params.id),
      discord.getAutoModRules(req.params.id),
    ]);
    const score = discord.computeSecurityScore(guild, automodRules);

    res.json({
      id: guild.id,
      name: guild.name,
      icon: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null,
      memberCount: guild.approximate_member_count ?? null,
      verificationLevel: guild.verification_level,
      verificationLabel: discord.VERIFICATION_LABELS[guild.verification_level],
      mfaLevel: guild.mfa_level,
      contentFilter: guild.explicit_content_filter,
      contentFilterLabel: discord.CONTENT_FILTER_LABELS[guild.explicit_content_filter],
      isCommunity: guild.features?.includes('COMMUNITY') || false,
      automodRuleCount: automodRules.length,
      automodRules: automodRules.map((r) => ({ id: r.id, name: r.name, enabled: r.enabled, triggerType: r.trigger_type })),
      score,
    });
  } catch (err) {
    if (err.status === 403 || err.status === 404) {
      return res.status(404).json({ error: 'Starla is not in that server (or lacks access). Invite the bot first.' });
    }
    console.error(`GET /api/guilds/${req.params.id} failed:`, err.body || err.message);
    res.status(502).json({ error: 'Could not fetch that server from Discord' });
  }
});

// Real audit-log-derived moderation feed
app.get('/api/guilds/:id/logs', requireAuth, async (req, res) => {
  try {
    const entries = await discord.getAuditLogs(req.params.id, 30);
    res.json(entries.map(discord.describeAuditEntry));
  } catch (err) {
    console.error(`GET /api/guilds/${req.params.id}/logs failed:`, err.body || err.message);
    res.status(502).json({ error: 'Could not fetch audit log from Discord' });
  }
});

/* ============================== COMMANDS ============================== */
// Static catalogue of what Starla supports — edit freely, this is your bot's command list.
const COMMANDS = require('./commands.json');
app.get('/api/commands', (req, res) => res.json(COMMANDS));

app.listen(PORT, () => {
  console.log(`\n🟣 Starla dashboard running at http://localhost:${PORT}`);
  if (missingEnv.length) console.log('   (Credentials incomplete — login will not work until .env is filled in.)\n');
});
