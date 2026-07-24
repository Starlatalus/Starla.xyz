function initials(name){
  return name.split(/\s+/).slice(0,2).map(w => w[0]).join('').toUpperCase();
}

async function init(){
  // Current user
  try{
    const meRes = await fetch('/api/me');
    if (meRes.status === 401){ location.href = '/'; return; }
    const me = await meRes.json();
    document.getElementById('user-avatar').src = me.avatar;
    document.getElementById('user-name').textContent = me.username;
  } catch {
    location.href = '/';
    return;
  }

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/auth/logout', { method: 'POST' });
    location.href = '/';
  });

  // Real server list
  const grid = document.getElementById('server-grid');
  try{
    const res = await fetch('/api/guilds');
    if (!res.ok) throw new Error('failed');
    const guilds = await res.json();

    if (!guilds.length){
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <h3>No manageable servers found</h3>
          <p>Starla only shows servers where you have Manage Server permission.</p>
        </div>`;
      return;
    }

    grid.innerHTML = guilds.map(g => {
      const icon = g.icon
        ? `<img class="server-card__icon" src="${g.icon}" alt="">`
        : `<div class="server-card__icon server-card__icon--fallback" style="background:var(--elevated)">${initials(g.name)}</div>`;

      const action = g.botPresent
        ? `<a class="btn btn--primary" style="width:100%;text-align:center" href="dashboard.html?id=${g.id}">Open dashboard</a>`
        : `<a class="btn btn--ghost" style="width:100%;text-align:center" href="${g.inviteUrl}" target="_blank" rel="noopener">Invite Starla</a>`;

      const status = g.botPresent
        ? `<span class="chip chip--good">Protected</span>`
        : `<span class="chip chip--muted">Not added</span>`;

      return `
        <div class="server-card">
          <div class="server-card__top">
            ${icon}
            <div style="min-width:0">
              <div class="server-card__name">${g.name}</div>
              <div class="server-card__id">id ${g.id}</div>
            </div>
          </div>
          ${status}
          ${action}
        </div>`;
    }).join('');
  } catch {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <h3>Couldn't load servers</h3>
        <p>Discord's API didn't respond as expected. Check the server logs.</p>
      </div>`;
  }
}

init();
