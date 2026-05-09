const intelState = {
  alts: [],
  bans: [],
  view: "alts",
  loaded: false,
};

attachIntelEvents();

Promise.all([
  fetch("alts_with_main.txt").then((response) => response.text()),
  fetch("bans.txt").then((response) => response.text()),
]).then(([altsText, bansText]) => {
  intelState.alts = parseAlts(altsText);
  intelState.bans = parseBans(bansText);
  intelState.loaded = true;
  updateIntelStats();
  renderIntel();
}).catch(() => {
  intelState.loaded = true;
  document.getElementById("altsView").innerHTML = emptyState("Could not load alt and ban data.");
  document.getElementById("banTable").innerHTML = `<tr><td colspan="5">${emptyState("Could not load alt and ban data.")}</td></tr>`;
});

function parseAlts(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [main, rest = ""] = line.split(/:\s*/);
      const alts = rest.split(",").map((name) => name.trim()).filter(Boolean);
      return { main: main.trim(), alts, size: alts.length + 1 };
    });
}

function parseBans(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [date = "", player = "", duration = "", reason = ""] = line.split("|").map((part) => part.trim());
      return {
        date,
        player,
        duration,
        reason,
        durationDays: Number(duration.match(/\d+/)?.[0] || 0),
        timestamp: Date.parse(date.replace(" ", "T")),
      };
    })
    .filter((ban) => ban.player);
}

function updateIntelStats() {
  const linkedUsers = new Set(intelState.alts.flatMap((group) => [group.main, ...group.alts]));
  intelState.bans.forEach((ban) => linkedUsers.add(ban.player));
  document.getElementById("altGroupCount").textContent = formatIntelNumber(intelState.alts.length);
  document.getElementById("linkedUserCount").textContent = formatIntelNumber(linkedUsers.size);
  document.getElementById("banRecordCount").textContent = formatIntelNumber(intelState.bans.length);
}

function attachIntelEvents() {
  document.getElementById("altsTab").addEventListener("click", () => setIntelView("alts"));
  document.getElementById("bansTab").addEventListener("click", () => setIntelView("bans"));
  document.getElementById("altSearch").addEventListener("input", renderAltGroups);
  document.getElementById("altSort").addEventListener("change", renderAltGroups);
  document.getElementById("banSearch").addEventListener("input", renderBans);
  document.getElementById("banSort").addEventListener("change", renderBans);
}

function setIntelView(view) {
  intelState.view = view;
  document.getElementById("altsTab").classList.toggle("active", view === "alts");
  document.getElementById("bansTab").classList.toggle("active", view === "bans");
  document.getElementById("altControls").hidden = view !== "alts";
  document.getElementById("banControls").hidden = view !== "bans";
  document.getElementById("altsView").hidden = view !== "alts";
  document.getElementById("bansView").hidden = view !== "bans";
  renderIntel();
}

function renderIntel() {
  if (intelState.view === "alts") renderAltGroups();
  else renderBans();
}

function renderAltGroups() {
  if (!intelState.loaded) {
    document.getElementById("altsView").innerHTML = emptyState("Loading alt groups...");
    return;
  }

  const query = getQuery("altSearch");
  const sortMode = document.getElementById("altSort").value;
  const bannedPlayers = getBannedPlayers();
  const groups = intelState.alts
    .filter((group) => [group.main, ...group.alts].join(" ").toLowerCase().includes(query))
    .sort(getAltSort(sortMode, bannedPlayers));

  document.getElementById("altsView").innerHTML = groups.map((group) => `
    <article class="alt-card">
      <div class="alt-main">
        ${playerAvatar(group.main, 88)}
        <div>
          <div class="alt-main-meta">
            <span>Main</span>
            ${banStatusTag(group.main, bannedPlayers)}
          </div>
          ${profileLink(group.main, "alt-main-name")}
          <small>${group.size} linked account${group.size === 1 ? "" : "s"}</small>
        </div>
      </div>
      <div class="alt-list">
        ${group.alts.map((name) => `
          <div class="player-chip">
            ${playerAvatar(name, 36)}
            ${profileLink(name)}
            ${altStatusTag(name, group.main, bannedPlayers)}
          </div>
        `).join("")}
      </div>
    </article>
  `).join("") || emptyState("No alt groups match that search.");
}

function renderBans() {
  if (!intelState.loaded) {
    document.getElementById("banTable").innerHTML = `<tr><td colspan="5">${emptyState("Loading bans...")}</td></tr>`;
    return;
  }

  const query = getQuery("banSearch");
  const sortMode = document.getElementById("banSort").value;
  const bans = intelState.bans
    .filter((ban) => [ban.date, ban.player, ban.duration, ban.reason].join(" ").toLowerCase().includes(query))
    .sort(getBanSort(sortMode));

  document.getElementById("banTable").innerHTML = bans.map((ban) => `
    <tr>
      <td>
        <div class="ban-player">
          ${playerAvatar(ban.player, 34)}
          <strong>${escapeIntelHtml(ban.player)}</strong>
        </div>
      </td>
      <td>${escapeIntelHtml(ban.date)}</td>
      <td>${escapeIntelHtml(ban.duration)}</td>
      <td><span class="reason-pill">${escapeIntelHtml(ban.reason)}</span></td>
      <td>${profileLink(ban.player)}</td>
    </tr>
  `).join("") || `<tr><td colspan="5">${emptyState("No ban records match that search.")}</td></tr>`;
}

function getAltSort(mode, bannedPlayers) {
  const sorters = {
    "main-asc": (a, b) => a.main.localeCompare(b.main),
    "group-size-desc": (a, b) => b.size - a.size || a.main.localeCompare(b.main),
    "banned-first": (a, b) => Number(isBannedMain(b.main, bannedPlayers)) - Number(isBannedMain(a.main, bannedPlayers)) || a.main.localeCompare(b.main),
    "not-banned-first": (a, b) => Number(isBannedMain(a.main, bannedPlayers)) - Number(isBannedMain(b.main, bannedPlayers)) || a.main.localeCompare(b.main),
  };
  return sorters[mode] || sorters["group-size-desc"];
}

function getBanSort(mode) {
  const sorters = {
    "date-desc": (a, b) => b.timestamp - a.timestamp,
    "duration-desc": (a, b) => b.durationDays - a.durationDays || b.timestamp - a.timestamp,
    "reason-asc": (a, b) => a.reason.localeCompare(b.reason) || b.timestamp - a.timestamp,
  };
  return sorters[mode] || sorters["date-desc"];
}

function getQuery(id) {
  return document.getElementById(id).value.trim().toLowerCase();
}

function getBannedPlayers() {
  return new Set(intelState.bans.map((ban) => ban.player.toLowerCase()));
}

function isBannedMain(name, bannedPlayers) {
  return bannedPlayers.has(name.toLowerCase());
}

function banStatusTag(name, bannedPlayers) {
  const banned = isBannedMain(name, bannedPlayers);
  return `<span class="status-tag ${banned ? "is-banned" : "not-banned"}">${banned ? "Banned" : "Not banned"}</span>`;
}

function altStatusTag(name, main, bannedPlayers) {
  if (bannedPlayers.has(name.toLowerCase())) {
    return '<span class="status-tag is-banned">Banned</span>';
  }
  if (bannedPlayers.has(main.toLowerCase())) {
    return '<span class="status-tag status-unknown">Should be banned / status unknown</span>';
  }
  return "";
}

function profileLink(name, className = "") {
  const encoded = encodeURIComponent(name);
  return `<a class="${className}" href="https://namemc.com/profile/${encoded}.1" target="_blank" rel="noopener noreferrer">${escapeIntelHtml(name)}</a>`;
}

function playerAvatar(name, size) {
  const encoded = encodeURIComponent(name);
  return `<img class="player-avatar" src="https://mc-heads.net/avatar/${encoded}/${size}.png" loading="lazy" decoding="async" alt="">`;
}

function emptyState(message) {
  return `<div class="empty-state">${message}</div>`;
}

function formatIntelNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function escapeIntelHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}
