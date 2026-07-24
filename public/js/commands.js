let ALL_COMMANDS = [];

async function init(){
  const container = document.getElementById('cmd-container');
  try{
    const res = await fetch('/api/commands');
    ALL_COMMANDS = await res.json();
    render(ALL_COMMANDS);
  } catch {
    container.innerHTML = `<p class="muted">Couldn't load the command list.</p>`;
    return;
  }

  document.getElementById('cmd-search').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) return render(ALL_COMMANDS);
    render(ALL_COMMANDS.filter(c => c.name.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)));
  });
}

function render(commands){
  const container = document.getElementById('cmd-container');
  if (!commands.length){
    container.innerHTML = `<p class="muted">No commands match that search.</p>`;
    return;
  }

  const byCategory = {};
  commands.forEach(c => { (byCategory[c.category] ??= []).push(c); });

  container.innerHTML = Object.entries(byCategory).map(([cat, cmds]) => `
    <div class="cmd-group">
      <div class="cmd-group__title">${cat} · ${cmds.length}</div>
      <div class="cmd-list">
        ${cmds.map(c => `
          <div class="cmd-row">
            <code>${c.name}</code>
            <span>${c.desc}</span>
          </div>`).join('')}
      </div>
    </div>
  `).join('');
}

init();
