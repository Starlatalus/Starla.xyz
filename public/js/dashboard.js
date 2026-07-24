const params = new URLSearchParams(location.search);
const guildId = params.get('id');

if (!guildId) location.href = 'servers.html';

/* ---------- Nav / mobile drawer (identical pattern to before) ---------- */
document.addEventListener('DOMContentLoaded', () => {
  const navItems = document.querySelectorAll('[data-view]');
  const views = document.querySelectorAll('.view');

  function showView(name){
    views.forEach(v => v.classList.toggle('is-active', v.id === `view-${name}`));
    navItems.forEach(n => { if (n.classList.contains('nav__item')) n.classList.toggle('is-active', n.dataset.view === name); });
    closeSidebar();
  }
  navItems.forEach(item => item.addEventListener('click', (e) => { e.preventDefault(); showView(item.dataset.view); }));

  const sidebar = document.getElementById('sidebar');
  const scrim = document.getElementById('scrim');
  const hamburger = document.getElementById('hamburger');
  function openSidebar(){ sidebar.classList.add('is-open'); scrim.classList.add('is-open'); }
  function closeSidebar(){ sidebar.classList.remove('is-open'); scrim.classList.remove('is-open'); }
  hamburger?.addEventListener('click', openSidebar);
  scrim?.addEventListener('click', closeSidebar);

  document.getElementById('logout-link')?.addEventListener('click', async (e) => {
    e.preventDefault();
    await fetch('/auth/logout', { method: 'POST' });
    location.href = '/';
  });

  document.getElementById('btn-refresh')?.addEventListener('click', loadEverything);

  const initial = location.hash.replace('#', '');
  if (['overview','logs','settings'].includes(initial)) showView(initial);

  loadEverything();
});

/* ---------- Data loading ---------- */
async function loadEverything(){
  await Promise.all([loadGuildDetail(), loadLogs()]);
}

let allLogEntries = [];

async function loadGuildDetail(){
  try{
    const res = await fetch(`/api/guilds/${guildId}`);
    if (res.status === 401){ location.href = '/'; return; }
    if (!res.ok){
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to load server');
    }
    const g = await res.json();
    renderGuild(g);
  } catch (e){
    document.getElementById('topbar-sub').textContent = e.message || 'Could not load this server.';
  }
}

function renderGuild(g){
  // Sidebar + topbar identity
  document.getElementById('sidebar-icon').src = g.icon || fallbackIcon(g.name);
  document.getElementById('sidebar-name').textContent = g.name;
  document.getElementById('sidebar-meta').textContent = g.memberCount ? `${g.memberCount.toLocaleString()} members` : 'Member count unavailable';
  document.title = `${g.name} — Starla`;
  document.getElementById('topbar-sub').textContent = `Live data for ${g.name}, fetched from Discord just now`;

  // Score gauge
  const score = g.score.total;
  const arc = document.getElementById('gauge-arc');
  requestAnimationFrame(() => { arc.style.strokeDasharray = `${score} 100`; });
  const band = score >= 80 ? 'good' : score >= 55 ? 'warn' : 'bad';
  const colorVar = { good:'var(--good)', warn:'var(--warn)', bad:'var(--danger)' }[band];
  arc.style.stroke = colorVar;
  document.getElementById('score-number').textContent = score;

  const tag = document.getElementById('score-tag');
  tag.className = `tag tag--${band}`;
  tag.textContent = band === 'good' ? 'Hardened' : band === 'warn' ? 'Needs attention' : 'At risk';
  document.getElementById('score-headline').textContent =
    band === 'good' ? 'This server is well defended.' :
    band === 'warn' ? 'A few gaps are worth closing.' :
    'This server has real exposure — act soon.';

  const statusPillHTML = (label, level) => `<i></i>${label}`;
  ['mobile-status','desktop-status'].forEach(id => {
    const el = document.getElementById(id);
    el.className = `status-pill status-pill--${band}`;
    el.innerHTML = statusPillHTML(band === 'good' ? 'PROTECTED' : band === 'warn' ? 'REVIEW' : 'AT RISK', band);
  });

  // Score breakdown bars
  const b = g.score.breakdown;
  const rows = [
    ['Verification level', b.verification, 30, `${g.verificationLabel}`],
    ['Two-factor requirement', b.mfa, 20, g.mfaLevel ? 'Required for mods' : 'Not required'],
    ['Content filter', b.contentFilter, 15, g.contentFilterLabel],
    ['AutoMod rules', b.automod, 25, `${g.automodRuleCount} configured`],
    ['Community features', b.community, 10, g.isCommunity ? 'Enabled' : 'Not enabled'],
  ];
  document.getElementById('score-breakdown').innerHTML = rows.map(([label, pts, max, detail]) => {
    const pct = Math.round((pts / max) * 100);
    const barBand = pct >= 70 ? 'good' : pct >= 35 ? 'warn' : '';
    return `<li><span>${label} <span class="muted">· ${detail}</span></span><div class="bar bar--${barBand}"><i style="width:${pct}%"></i></div><b>${pts}</b></li>`;
  }).join('');

  // Hardening card
  document.getElementById('chip-hardening').outerHTML =
    `<span class="chip chip--${g.verificationLevel >= 3 ? 'good' : g.verificationLevel >= 1 ? 'warn' : 'bad'}" id="chip-hardening">${g.verificationLabel}</span>`;
  document.getElementById('stats-hardening').innerHTML = `
    <li><span>Verification level</span><b>${g.verificationLabel}</b></li>
    <li><span>Two-factor for mods</span><b>${g.mfaLevel ? 'Required' : 'Not required'}</b></li>
    <li><span>Explicit content filter</span><b>${g.contentFilterLabel}</b></li>
    <li><span>Members</span><b>${g.memberCount?.toLocaleString() ?? '—'}</b></li>
  `;

  // AutoMod card
  document.getElementById('chip-automod').outerHTML =
    `<span class="chip chip--${g.automodRuleCount > 0 ? 'good' : 'warn'}" id="chip-automod">${g.automodRuleCount > 0 ? 'Active' : 'Not configured'}</span>`;
  document.getElementById('stats-automod').innerHTML = g.automodRules.length
    ? g.automodRules.slice(0,4).map(r => `<li><span>${r.name}</span><b>${r.enabled ? 'On' : 'Off'}</b></li>`).join('')
    : `<li><span colspan="2">No AutoMod rules configured yet</span></li>`;
  document.getElementById('automod-foot').textContent = `${g.automodRuleCount} rule${g.automodRuleCount === 1 ? '' : 's'} configured in Discord`;

  // Settings page automod list
  document.getElementById('automod-rule-list').innerHTML = g.automodRules.length
    ? g.automodRules.map(r => `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span>${r.name}</span>
          <span class="chip chip--${r.enabled ? 'good' : 'muted'}">${r.enabled ? 'On' : 'Off'}</span>
        </div>`).join('')
    : `<span class="muted">No rules yet — create some in Server Settings → AutoMod on Discord.</span>`;
}

async function loadLogs(){
  const feedPreview = document.getElementById('feed-preview');
  const terminal = document.getElementById('terminal-feed');
  try{
    const res = await fetch(`/api/guilds/${guildId}/logs`);
    if (!res.ok) throw new Error();
    allLogEntries = await res.json();

    if (!allLogEntries.length){
      feedPreview.innerHTML = `<p class="muted">No recent audit log entries — or Starla needs the "View Audit Log" permission in this server.</p>`;
      terminal.innerHTML = `<div class="term-empty">No audit log entries available.</div>`;
      return;
    }

    feedPreview.innerHTML = allLogEntries.slice(0,6).map(feedRow).join('');
    renderTerminal('all');
  } catch {
    feedPreview.innerHTML = `<p class="muted">Couldn't load the activity feed.</p>`;
    terminal.innerHTML = `<div class="term-empty">Couldn't load the audit log.</div>`;
  }

  document.getElementById('log-filters')?.addEventListener('click', (e) => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('is-active'));
    chip.classList.add('is-active');
    renderTerminal(chip.dataset.filter);
  }, { once: true });
}

function feedRow(entry){
  return `
    <div class="feed-row">
      <span class="feed-dot feed-dot--${entry.level}"></span>
      <span class="feed-text">${entry.label}${entry.userId ? ` <span class="muted">by &lt;@${entry.userId}&gt;</span>` : ''}</span>
      <span class="feed-time">${timeAgo(entry.timestamp)}</span>
    </div>`;
}

function renderTerminal(filter){
  const rows = allLogEntries.filter(e => filter === 'all' || e.cat === filter);
  const terminal = document.getElementById('terminal-feed');
  if (!rows.length){
    terminal.innerHTML = `<div class="term-empty">No entries in this category.</div>`;
    return;
  }
  terminal.innerHTML = rows.map(e => `
    <div class="term-line">
      <span class="t">[${timeAgo(e.timestamp)}]</span>
      <span class="lv-${e.level}">${e.label.toUpperCase()}</span>
      ${e.userId ? `<span> — by &lt;@${e.userId}&gt;</span>` : ''}
      ${e.reason ? `<span class="t"> · "${e.reason}"</span>` : ''}
    </div>`).join('') + `<div class="term-line"><span class="t">starla@dashboard:~$</span> <span class="term-cursor"></span></div>`;
}

function timeAgo(iso){
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fallbackIcon(name){
  const initials = name.split(/\s+/).slice(0,2).map(w => w[0]).join('');
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(initials)}&backgroundColor=9d5cff`;
}
