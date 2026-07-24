/* =========================================================
   discord.js — thin wrapper around Discord's real REST API.
   Every function here hits https://discord.com/api/v10 for real.
   ========================================================= */

const API = 'https://discord.com/api/v10';

const {
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_BOT_TOKEN,
  DISCORD_REDIRECT_URI,
} = process.env;

// Permission bit flags we care about (Discord permission bitfield)
const PERM = {
  ADMINISTRATOR: 0x8,
  MANAGE_GUILD: 0x20,
};

function hasManagePermissions(permissionsString) {
  const bits = BigInt(permissionsString || '0');
  return (bits & BigInt(PERM.ADMINISTRATOR)) !== 0n || (bits & BigInt(PERM.MANAGE_GUILD)) !== 0n;
}

async function discordFetch(path, { token, bot = false, method = 'GET', body } = {}) {
  const headers = {
    Authorization: bot ? `Bot ${DISCORD_BOT_TOKEN}` : `Bearer ${token}`,
  };
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }

  if (!res.ok) {
    const err = new Error(`Discord API ${method} ${path} → ${res.status}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

/* ---------- OAuth2 ---------- */

function getAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify guilds',
    state,
    prompt: 'consent',
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

function getBotInviteUrl(guildId) {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    // View Audit Log, Manage Roles, Kick, Ban, Manage Channels, Manage Webhooks, Moderate Members
    permissions: '1374397046',
    scope: 'bot applications.commands',
  });
  if (guildId) params.set('guild_id', guildId);
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  const body = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    client_secret: DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: DISCORD_REDIRECT_URI,
  });

  const res = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const json = await res.json();
  if (!res.ok) {
    const err = new Error('OAuth token exchange failed');
    err.body = json;
    throw err;
  }
  return json; // { access_token, refresh_token, expires_in, ... }
}

async function getCurrentUser(accessToken) {
  return discordFetch('/users/@me', { token: accessToken });
}

async function getUserGuilds(accessToken) {
  return discordFetch('/users/@me/guilds', { token: accessToken });
}

/* ---------- Bot-token calls (require the bot to actually be in the guild) ---------- */

async function getBotGuilds() {
  // Guilds the bot itself is a member of
  return discordFetch('/users/@me/guilds', { bot: true });
}

async function getGuildDetail(guildId) {
  return discordFetch(`/guilds/${guildId}?with_counts=true`, { bot: true });
}

async function getAutoModRules(guildId) {
  try {
    return await discordFetch(`/guilds/${guildId}/auto-moderation/rules`, { bot: true });
  } catch (e) {
    if (e.status === 403) return []; // bot lacks permission — treat as none configured
    throw e;
  }
}

async function getAuditLogs(guildId, limit = 25) {
  try {
    const data = await discordFetch(`/guilds/${guildId}/audit-logs?limit=${limit}`, { bot: true });
    return data.audit_log_entries || [];
  } catch (e) {
    if (e.status === 403) return []; // bot lacks View Audit Log permission
    throw e;
  }
}

/* ---------- Security scoring, derived from real guild fields ---------- */

function computeSecurityScore(guild, automodRules) {
  // verification_level: 0 (none) – 4 (highest)
  const verificationPts = Math.round((guild.verification_level / 4) * 30);
  // mfa_level: 0 or 1 (2FA required for mods)
  const mfaPts = guild.mfa_level >= 1 ? 20 : 0;
  // explicit_content_filter: 0–2
  const contentFilterPts = Math.round((guild.explicit_content_filter / 2) * 15);
  // automod: scale rule count, cap contribution at 25
  const automodPts = Math.min(25, (automodRules?.length || 0) * 8);
  // community/features bonus — servers with COMMUNITY get extra moderation tooling
  const communityPts = guild.features?.includes('COMMUNITY') ? 10 : 0;

  const total = verificationPts + mfaPts + contentFilterPts + automodPts + communityPts;
  return {
    total: Math.min(100, total),
    breakdown: {
      verification: verificationPts,
      mfa: mfaPts,
      contentFilter: contentFilterPts,
      automod: automodPts,
      community: communityPts,
    },
  };
}

const VERIFICATION_LABELS = ['None', 'Low', 'Medium', 'High', 'Highest'];
const CONTENT_FILTER_LABELS = ['Disabled', 'Members without roles', 'All members'];

/* ---------- Audit log action_type → human label ---------- */
const AUDIT_ACTIONS = {
  1: { label: 'Server settings updated', cat: 'admin', level: 'good' },
  10: { label: 'Channel created', cat: 'channel', level: 'good' },
  11: { label: 'Channel updated', cat: 'channel', level: 'good' },
  12: { label: 'Channel deleted', cat: 'channel', level: 'bad' },
  20: { label: 'Member kicked', cat: 'mod', level: 'warn' },
  21: { label: 'Members pruned', cat: 'mod', level: 'warn' },
  22: { label: 'Member banned', cat: 'mod', level: 'bad' },
  23: { label: 'Member unbanned', cat: 'mod', level: 'good' },
  24: { label: 'Member updated', cat: 'mod', level: 'good' },
  25: { label: "Member's roles changed", cat: 'mod', level: 'warn' },
  26: { label: 'Member moved (voice)', cat: 'mod', level: 'good' },
  27: { label: 'Member disconnected (voice)', cat: 'mod', level: 'good' },
  30: { label: 'Role created', cat: 'role', level: 'good' },
  31: { label: 'Role updated', cat: 'role', level: 'warn' },
  32: { label: 'Role deleted', cat: 'role', level: 'bad' },
  40: { label: 'Invite created', cat: 'invite', level: 'good' },
  42: { label: 'Invite deleted', cat: 'invite', level: 'warn' },
  50: { label: 'Webhook created', cat: 'webhook', level: 'warn' },
  51: { label: 'Webhook updated', cat: 'webhook', level: 'warn' },
  52: { label: 'Webhook deleted', cat: 'webhook', level: 'good' },
  60: { label: 'Emoji created', cat: 'other', level: 'good' },
  62: { label: 'Emoji deleted', cat: 'other', level: 'good' },
  72: { label: 'Message deleted', cat: 'message', level: 'warn' },
  73: { label: 'Messages bulk deleted', cat: 'message', level: 'bad' },
  75: { label: 'Message pinned', cat: 'message', level: 'good' },
  76: { label: 'Message unpinned', cat: 'message', level: 'good' },
  110: { label: 'Thread created', cat: 'channel', level: 'good' },
  111: { label: 'Thread updated', cat: 'channel', level: 'good' },
  112: { label: 'Thread deleted', cat: 'channel', level: 'warn' },
  140: { label: 'AutoMod rule created', cat: 'automod', level: 'good' },
  141: { label: 'AutoMod rule updated', cat: 'automod', level: 'good' },
  142: { label: 'AutoMod rule deleted', cat: 'automod', level: 'warn' },
  143: { label: 'AutoMod blocked a message', cat: 'automod', level: 'warn' },
  144: { label: 'AutoMod flagged a message', cat: 'automod', level: 'warn' },
  145: { label: 'AutoMod timed out a member', cat: 'automod', level: 'warn' },
};

function describeAuditEntry(entry) {
  const meta = AUDIT_ACTIONS[entry.action_type] || { label: `Action #${entry.action_type}`, cat: 'other', level: 'good' };
  return {
    id: entry.id,
    label: meta.label,
    cat: meta.cat,
    level: meta.level,
    userId: entry.user_id || null,
    targetId: entry.target_id || null,
    reason: entry.reason || null,
    // Discord snowflake → real timestamp, no guessing
    timestamp: snowflakeToDate(entry.id),
  };
}

function snowflakeToDate(id) {
  if (!id) return null;
  const DISCORD_EPOCH = 1420070400000n;
  const ms = (BigInt(id) >> 22n) + DISCORD_EPOCH;
  return new Date(Number(ms)).toISOString();
}

module.exports = {
  hasManagePermissions,
  getAuthorizeUrl,
  getBotInviteUrl,
  exchangeCodeForToken,
  getCurrentUser,
  getUserGuilds,
  getBotGuilds,
  getGuildDetail,
  getAutoModRules,
  getAuditLogs,
  computeSecurityScore,
  describeAuditEntry,
  VERIFICATION_LABELS,
  CONTENT_FILTER_LABELS,
};
