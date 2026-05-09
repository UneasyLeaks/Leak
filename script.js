const colors = {
  world: "#5dd9d6",
  world_nether: "#ff6b6b",
  world_the_end: "#b58cff",
  unknown: "#ffd166",
  userCheck: "#ffffff",
  userCheckRing: "#8bd46e",
};

const leakRadius = 3000;

const updateNoticeKey = "uneasyvanilla:update-notice:2026-05-09-leak-checker";

const state = {
  bases: [],
  activeDimensions: new Set(),
  view: { scale: 1, offsetX: 0, offsetZ: 0 },
  bounds: null,
  hover: null,
  viewMode: "graph",
  checkedCoordinate: null,
};

const atlas = document.getElementById("atlasCanvas");
const atlasCtx = atlas.getContext("2d");
const tooltip = document.getElementById("tooltip");

fetch("coords.txt")
  .then((response) => response.text())
  .then((text) => {
    state.bases = parseCoords(text);
    state.activeDimensions = new Set([...new Set(state.bases.map((base) => base.dimension))]);
    state.bounds = getBounds(state.bases);
    updateStats(state.bases);
    buildFilters();
    attachUiEvents();
    renderBaseTable();
    renderGallery();
    showUpdateNotice();
    resetView();
    drawAll();
    attachAtlasEvents();
  });

function parseCoords(text) {
  const sections = text.split(/\n(?=Base \d+\n-+\n)/g).filter((section) => /^Base \d+/m.test(section));
  return sections.map((section) => {
    const id = Number(section.match(/^Base (\d+)/m)?.[1] || 0);
    const dimension = section.match(/^Dimension:\s*(.+)$/m)?.[1].trim() || "unknown";
    const subBaseCount = Number(section.match(/^Sub-bases:\s*(\d+)/m)?.[1] || 0);
    const knownName = section.match(/^Source:\s*(.+)$/m)?.[1].trim() || "";
    const centerMatch = section.match(/^Center:\s*X=([-\d.]+)\s+Y=([-\d.]+)\s+Z=([-\d.]+)/m);
    const center = {
      x: Number(centerMatch?.[1] || 0),
      y: Number(centerMatch?.[2] || 0),
      z: Number(centerMatch?.[3] || 0),
    };
    const subBases = [...section.matchAll(/^\s+\d+\.\s*X=([-\d.]+)\s+Y=([-\d.]+)\s+Z=([-\d.]+)/gm)]
      .map((match) => ({ x: Number(match[1]), y: Number(match[2]), z: Number(match[3]) }));
    return {
      id,
      knownName,
      dimension,
      subBaseCount,
      center,
      subBases,
      distance: Math.hypot(center.x, center.z),
    };
  });
}

function getBounds(bases) {
  const xs = bases.map((base) => base.center.x);
  const zs = bases.map((base) => base.center.z);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

function updateStats(bases) {
  const totalSubBases = bases.reduce((sum, base) => sum + base.subBaseCount, 0);
  const farthest = bases.reduce((max, base) => base.distance > max.distance ? base : max, bases[0]);
  document.getElementById("totalBases").textContent = formatNumber(bases.length);
  document.getElementById("totalSubBases").textContent = formatNumber(totalSubBases);
  document.getElementById("farthestBase").textContent = `${formatNumber(Math.round(farthest.distance))}`;
  renderFindings(bases, farthest);
}

function buildFilters() {
  const target = document.getElementById("dimensionFilters");
  target.innerHTML = "";
  [...state.activeDimensions].sort().forEach((dimension) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = true;
    input.addEventListener("change", () => {
      if (input.checked) state.activeDimensions.add(dimension);
      else state.activeDimensions.delete(dimension);
      drawAtlas();
      renderBaseTable();
    });
    label.append(input, document.createTextNode(dimension));
    target.append(label);
  });
}

function resetView() {
  const rect = atlas.getBoundingClientRect();
  const pad = 70;
  const width = state.bounds.maxX - state.bounds.minX || 1;
  const height = state.bounds.maxZ - state.bounds.minZ || 1;
  state.view.scale = Math.min((rect.width - pad * 2) / width, (rect.height - pad * 2) / height);
  state.view.offsetX = rect.width / 2 - ((state.bounds.minX + state.bounds.maxX) / 2) * state.view.scale;
  state.view.offsetZ = rect.height / 2 - ((state.bounds.minZ + state.bounds.maxZ) / 2) * state.view.scale;
}

function drawAll() {
  drawAtlas();
  drawDimensionChart();
  drawQuadrantChart();
  drawHeightChart();
  drawDistanceChart();
  drawClusterChart();
  drawAxisChart();
  drawRangeChart();
  drawScaleChart();
}

function resizeCanvas(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(rect.height * ratio));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { width: rect.width, height: rect.height };
}

function drawAtlas() {
  const { width, height } = resizeCanvas(atlas);
  atlasCtx.clearRect(0, 0, width, height);
  atlasCtx.fillStyle = "#101417";
  atlasCtx.fillRect(0, 0, width, height);
  drawGrid(width, height);
  drawAxis(width, height);

  const visible = state.bases.filter((base) => state.activeDimensions.has(base.dimension));
  visible.forEach((base) => {
    const point = worldToScreen(base.center.x, base.center.z);
    const radius = Math.min(15, 3.5 + Math.sqrt(base.subBaseCount) * 1.7);
    atlasCtx.beginPath();
    atlasCtx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    atlasCtx.fillStyle = colors[base.dimension] || colors.unknown;
    atlasCtx.globalAlpha = state.hover && state.hover.id !== base.id ? 0.38 : 0.86;
    atlasCtx.fill();
    atlasCtx.globalAlpha = 1;
  });

  drawCheckedCoordinate();
}

function drawCheckedCoordinate() {
  if (!state.checkedCoordinate) return;
  const point = worldToScreen(state.checkedCoordinate.x, state.checkedCoordinate.z);
  const radius = Math.max(9, Math.min(18, 7 + 0.0015 / state.view.scale));
  const ringRadius = Math.max(radius + 5, Math.min(90, leakRadius * state.view.scale));

  atlasCtx.beginPath();
  atlasCtx.arc(point.x, point.y, ringRadius, 0, Math.PI * 2);
  atlasCtx.strokeStyle = state.checkedCoordinate.leaked ? "#ff6b6b" : colors.userCheckRing;
  atlasCtx.lineWidth = 2;
  atlasCtx.setLineDash([8, 6]);
  atlasCtx.stroke();
  atlasCtx.setLineDash([]);

  atlasCtx.beginPath();
  atlasCtx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  atlasCtx.fillStyle = colors.userCheck;
  atlasCtx.fill();
  atlasCtx.lineWidth = 3;
  atlasCtx.strokeStyle = state.checkedCoordinate.leaked ? "#ff6b6b" : colors.userCheckRing;
  atlasCtx.stroke();
}

function drawGrid(width, height) {
  const stepWorld = chooseGridStep(130 / state.view.scale);
  const startX = Math.floor(screenToWorld(0, 0).x / stepWorld) * stepWorld;
  const endX = screenToWorld(width, 0).x;
  const startZ = Math.floor(screenToWorld(0, 0).z / stepWorld) * stepWorld;
  const endZ = screenToWorld(0, height).z;
  atlasCtx.strokeStyle = "#263035";
  atlasCtx.lineWidth = 1;
  atlasCtx.fillStyle = "#77858c";
  atlasCtx.font = "12px system-ui";
  for (let x = startX; x <= endX; x += stepWorld) {
    const sx = worldToScreen(x, 0).x;
    atlasCtx.beginPath();
    atlasCtx.moveTo(sx, 0);
    atlasCtx.lineTo(sx, height);
    atlasCtx.stroke();
    atlasCtx.fillText(formatShort(x), sx + 4, 18);
  }
  for (let z = startZ; z <= endZ; z += stepWorld) {
    const sy = worldToScreen(0, z).y;
    atlasCtx.beginPath();
    atlasCtx.moveTo(0, sy);
    atlasCtx.lineTo(width, sy);
    atlasCtx.stroke();
    atlasCtx.fillText(formatShort(z), 8, sy - 4);
  }
}

function drawAxis(width, height) {
  const origin = worldToScreen(0, 0);
  atlasCtx.strokeStyle = "#6a767c";
  atlasCtx.lineWidth = 1.5;
  if (origin.x >= 0 && origin.x <= width) {
    atlasCtx.beginPath();
    atlasCtx.moveTo(origin.x, 0);
    atlasCtx.lineTo(origin.x, height);
    atlasCtx.stroke();
  }
  if (origin.y >= 0 && origin.y <= height) {
    atlasCtx.beginPath();
    atlasCtx.moveTo(0, origin.y);
    atlasCtx.lineTo(width, origin.y);
    atlasCtx.stroke();
  }
}

function attachAtlasEvents() {
  let dragging = false;
  let last = null;
  const activePointers = new Map();
  let pinch = null;

  atlas.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    dragging = true;
    last = { x: event.clientX, y: event.clientY };
    atlas.setPointerCapture(event.pointerId);
    atlas.classList.add("dragging");

    if (activePointers.size === 2) {
      pinch = getPinchState();
      dragging = false;
    }
  });

  atlas.addEventListener("pointerup", (event) => {
    activePointers.delete(event.pointerId);
    dragging = false;
    pinch = null;
    if (atlas.hasPointerCapture(event.pointerId)) {
      atlas.releasePointerCapture(event.pointerId);
    }
    atlas.classList.remove("dragging");
  });

  atlas.addEventListener("pointercancel", (event) => {
    activePointers.delete(event.pointerId);
    dragging = false;
    pinch = null;
    atlas.classList.remove("dragging");
  });

  atlas.addEventListener("pointermove", (event) => {
    if (activePointers.has(event.pointerId)) {
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    if (activePointers.size === 2 && pinch) {
      const current = getPinchState();
      const factor = current.distance / pinch.distance;
      state.view.scale = Math.max(0.000001, Math.min(0.08, pinch.scale * factor));
      state.view.offsetX = current.center.x - pinch.world.x * state.view.scale;
      state.view.offsetZ = current.center.y - pinch.world.z * state.view.scale;
      drawAtlas();
      return;
    }

    if (dragging) {
      state.view.offsetX += event.clientX - last.x;
      state.view.offsetZ += event.clientY - last.y;
      last = { x: event.clientX, y: event.clientY };
      drawAtlas();
      return;
    }
    updateHover(event);
  });
  atlas.addEventListener("wheel", (event) => {
    event.preventDefault();
    const rect = atlas.getBoundingClientRect();
    const mouse = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const before = screenToWorld(mouse.x, mouse.y);
    const factor = event.deltaY < 0 ? 1.18 : 0.85;
    state.view.scale = Math.max(0.000001, Math.min(0.08, state.view.scale * factor));
    state.view.offsetX = mouse.x - before.x * state.view.scale;
    state.view.offsetZ = mouse.y - before.z * state.view.scale;
    drawAtlas();
  }, { passive: false });
  document.getElementById("resetView").addEventListener("click", () => {
    resetView();
    drawAtlas();
  });
  window.addEventListener("resize", () => {
    resetView();
    drawAll();
  });

  function getPinchState() {
    const points = [...activePointers.values()];
    const center = {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2,
    };
    const rect = atlas.getBoundingClientRect();
    const screenCenter = { x: center.x - rect.left, y: center.y - rect.top };
    return {
      center: screenCenter,
      distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
      scale: state.view.scale,
      world: screenToWorld(screenCenter.x, screenCenter.y),
    };
  }
}

function attachUiEvents() {
  document.getElementById("graphTab").addEventListener("click", () => setViewMode("graph"));
  document.getElementById("listTab").addEventListener("click", () => setViewMode("list"));
  document.getElementById("openLeakCheck").addEventListener("click", openLeakCheck);
  document.getElementById("closeLeakCheck").addEventListener("click", closeLeakCheck);
  document.getElementById("leakCheckPanel").addEventListener("submit", checkLeakCoordinate);
  document.getElementById("baseSearch").addEventListener("input", renderBaseTable);
  document.getElementById("sortMode").addEventListener("change", renderBaseTable);
  document.getElementById("closeLightbox").addEventListener("click", closeLightbox);
  document.getElementById("dismissUpdateNotice").addEventListener("click", dismissUpdateNotice);
  document.getElementById("lightbox").addEventListener("click", (event) => {
    if (event.target.id === "lightbox") closeLightbox();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeLightbox();
  });
}

function openLeakCheck() {
  setViewMode("graph");
  const panel = document.getElementById("leakCheckPanel");
  panel.hidden = false;
  document.getElementById("leakX").focus();
}

function closeLeakCheck() {
  document.getElementById("leakCheckPanel").hidden = true;
}

function checkLeakCoordinate(event) {
  event.preventDefault();
  const x = Number(document.getElementById("leakX").value);
  const z = Number(document.getElementById("leakZ").value);
  const result = document.getElementById("leakCheckResult");

  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    result.className = "leak-check-result";
    result.textContent = "Enter valid X and Z coordinates.";
    return;
  }

  const nearest = findNearestKnownCoordinate(x, z);
  const leaked = nearest && nearest.distance <= leakRadius;
  state.checkedCoordinate = { x, z, leaked, nearest };
  focusMapOnCoordinate(x, z);
  drawAtlas();

  if (leaked) {
    result.className = "leak-check-result leaked";
    result.innerHTML = `Leaked. Nearest known coordinate is ${formatNumber(Math.round(nearest.distance))} blocks away at Base ${nearest.base.id}.`;
  } else {
    result.className = "leak-check-result not-leaked";
    result.textContent = "Not leaked. No known coordinate is close enough to this location.";
  }
}

function findNearestKnownCoordinate(x, z) {
  let nearest = null;
  state.bases.forEach((base) => {
    [{ ...base.center, source: "center" }, ...base.subBases.map((coord) => ({ ...coord, source: "sub-base" }))]
      .forEach((coord) => {
        const distance = Math.hypot(coord.x - x, coord.z - z);
        if (!nearest || distance < nearest.distance) {
          nearest = { base, coord, distance };
        }
      });
  });
  return nearest;
}

function focusMapOnCoordinate(x, z) {
  const rect = atlas.getBoundingClientRect();
  const targetScale = Math.max(state.view.scale, Math.min(0.08, 0.018));
  state.view.scale = targetScale;
  state.view.offsetX = rect.width / 2 - x * state.view.scale;
  state.view.offsetZ = rect.height / 2 - z * state.view.scale;
}

function showUpdateNotice() {
  if (localStorage.getItem(updateNoticeKey) === "seen") return;
  const notice = document.getElementById("updateNotice");
  notice.hidden = false;
  document.body.classList.add("notice-open");
}

function dismissUpdateNotice() {
  localStorage.setItem(updateNoticeKey, "seen");
  document.getElementById("updateNotice").hidden = true;
  document.body.classList.remove("notice-open");
}

function setViewMode(mode) {
  state.viewMode = mode;
  document.getElementById("graphView").hidden = mode !== "graph";
  document.getElementById("listView").hidden = mode !== "list";
  document.getElementById("graphTab").classList.toggle("active", mode === "graph");
  document.getElementById("listTab").classList.toggle("active", mode === "list");
  if (mode === "graph") drawAtlas();
  else renderBaseTable();
}

function updateHover(event) {
  const rect = atlas.getBoundingClientRect();
  const mouse = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  let nearest = null;
  let nearestDistance = Infinity;
  state.bases.filter((base) => state.activeDimensions.has(base.dimension)).forEach((base) => {
    const point = worldToScreen(base.center.x, base.center.z);
    const distance = Math.hypot(point.x - mouse.x, point.y - mouse.y);
    if (distance < nearestDistance && distance < 18) {
      nearest = base;
      nearestDistance = distance;
    }
  });
  state.hover = nearest;
  if (!nearest) {
    tooltip.hidden = true;
    drawAtlas();
    return;
  }
  tooltip.hidden = false;
  tooltip.style.left = `${Math.min(mouse.x + 16, rect.width - 290)}px`;
  tooltip.style.top = `${Math.max(12, mouse.y + 16)}px`;
  tooltip.innerHTML = `
    <strong>Base ${nearest.id}</strong><br>
    ${nearest.knownName ? `<span class="tooltip-name">${escapeHtml(nearest.knownName)}</span><br>` : ""}
    ${nearest.dimension}<br>
    X ${formatNumber(nearest.center.x)} / Y ${formatNumber(nearest.center.y)} / Z ${formatNumber(nearest.center.z)}<br>
    ${nearest.subBaseCount} sub-base${nearest.subBaseCount === 1 ? "" : "s"}<br>
    ${formatNumber(Math.round(nearest.distance))} blocks from spawn
  `;
  drawAtlas();
}

function worldToScreen(x, z) {
  return { x: x * state.view.scale + state.view.offsetX, y: z * state.view.scale + state.view.offsetZ };
}

function screenToWorld(x, y) {
  return { x: (x - state.view.offsetX) / state.view.scale, z: (y - state.view.offsetZ) / state.view.scale };
}

function drawDimensionChart() {
  const counts = countBy(state.bases, (base) => base.dimension);
  drawBarChart("dimensionChart", Object.entries(counts), { colorFor: ([dimension]) => colors[dimension] || colors.unknown });
}

function drawQuadrantChart() {
  const counts = countBy(state.bases, (base) => {
    if (base.center.x >= 0 && base.center.z >= 0) return "+X +Z";
    if (base.center.x < 0 && base.center.z >= 0) return "-X +Z";
    if (base.center.x < 0 && base.center.z < 0) return "-X -Z";
    return "+X -Z";
  });
  drawBarChart("quadrantChart", Object.entries(counts), { color: "#8bd46e" });
}

function drawHeightChart() {
  const bins = binValues(state.bases.map((base) => base.center.y), 20);
  drawBarChart("heightChart", bins.map((bin) => [bin.label, bin.count]), { color: "#ffd166" });
}

function drawDistanceChart() {
  const bins = binValues(state.bases.map((base) => base.distance), 10);
  drawBarChart("distanceChart", bins.map((bin) => [bin.label, bin.count]), { color: "#5dd9d6" });
}

function drawClusterChart() {
  const counts = countBy(state.bases, (base) => base.subBaseCount >= 10 ? "10+" : String(base.subBaseCount));
  const entries = Object.entries(counts).sort((a, b) => Number(a[0].replace("+", "")) - Number(b[0].replace("+", "")));
  drawBarChart("clusterChart", entries, { color: "#ff6b6b" });
}

function drawAxisChart() {
  const entries = [
    ["X < -1m", state.bases.filter((base) => base.center.x < -1000000).length],
    ["X -1m..0", state.bases.filter((base) => base.center.x >= -1000000 && base.center.x < 0).length],
    ["X 0..1m", state.bases.filter((base) => base.center.x >= 0 && base.center.x <= 1000000).length],
    ["X > 1m", state.bases.filter((base) => base.center.x > 1000000).length],
    ["Z < -1m", state.bases.filter((base) => base.center.z < -1000000).length],
    ["Z -1m..0", state.bases.filter((base) => base.center.z >= -1000000 && base.center.z < 0).length],
    ["Z 0..1m", state.bases.filter((base) => base.center.z >= 0 && base.center.z <= 1000000).length],
    ["Z > 1m", state.bases.filter((base) => base.center.z > 1000000).length],
  ];
  drawBarChart("axisChart", entries, { color: "#b58cff" });
}

function drawRangeChart() {
  const ranges = [
    ["0-1k", 0, 1000],
    ["1k-10k", 1000, 10000],
    ["10k-100k", 10000, 100000],
    ["100k-1m", 100000, 1000000],
    ["1m-10m", 1000000, 10000000],
    ["10m+", 10000000, Infinity],
  ];
  const entries = ranges.map(([label, min, max]) => [
    label,
    state.bases.filter((base) => base.distance >= min && base.distance < max).length,
  ]);
  drawBarChart("rangeChart", entries, { color: "#8bd46e" });
}

function drawScaleChart() {
  const converted = state.bases
    .filter((base) => base.dimension === "world_nether" || base.dimension === "world")
    .map((base) => {
      const scale = base.dimension === "world_nether" ? 8 : 1;
      return {
        ...base,
        convertedDistance: Math.hypot(base.center.x * scale, base.center.z * scale),
      };
    });
  const ranges = [
    ["0-10k", 0, 10000],
    ["10k-100k", 10000, 100000],
    ["100k-1m", 100000, 1000000],
    ["1m-10m", 1000000, 10000000],
    ["10m+", 10000000, Infinity],
  ];
  const entries = ranges.map(([label, min, max]) => [
    label,
    converted.filter((base) => base.convertedDistance >= min && base.convertedDistance < max).length,
  ]);
  drawBarChart("scaleChart", entries, { color: "#5dd9d6" });
}

function drawBarChart(id, entries, options = {}) {
  const canvas = document.getElementById(id);
  const ctx = canvas.getContext("2d");
  const { width, height } = resizeCanvas(canvas);
  ctx.clearRect(0, 0, width, height);
  const pad = { left: 48, right: 18, top: 18, bottom: 58 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const max = Math.max(...entries.map(([, value]) => value), 1);
  ctx.strokeStyle = "#30383d";
  ctx.fillStyle = "#9aa5aa";
  ctx.font = "12px system-ui";
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + plotH - (plotH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    ctx.fillText(Math.round((max * i) / 4), 8, y + 4);
  }
  const barW = plotW / entries.length;
  entries.forEach((entry, index) => {
    const [label, value] = entry;
    const h = (value / max) * plotH;
    const x = pad.left + index * barW + Math.min(10, barW * 0.16);
    const y = pad.top + plotH - h;
    ctx.fillStyle = options.colorFor ? options.colorFor(entry) : options.color || "#5dd9d6";
    ctx.fillRect(x, y, Math.max(3, barW * 0.68), h);
    ctx.fillStyle = "#dce2e5";
    ctx.fillText(value, x, Math.max(12, y - 5));
    ctx.save();
    ctx.translate(x + Math.max(3, barW * 0.34), height - 12);
    ctx.rotate(-Math.PI / 5);
    ctx.fillStyle = "#9aa5aa";
    ctx.fillText(label, 0, 0);
    ctx.restore();
  });
}

function renderFindings(bases, farthest) {
  const biggest = bases.reduce((max, base) => base.subBaseCount > max.subBaseCount ? base : max, bases[0]);
  const highest = bases.reduce((max, base) => base.center.y > max.center.y ? base : max, bases[0]);
  const lowest = bases.reduce((min, base) => base.center.y < min.center.y ? base : min, bases[0]);
  const nearest = bases.reduce((min, base) => base.distance < min.distance ? base : min, bases[0]);
  const avgSubBases = bases.reduce((sum, base) => sum + base.subBaseCount, 0) / bases.length;
  const negativeY = bases.filter((base) => base.center.y < 0).length;
  const borderBases = bases.filter((base) => Math.abs(base.center.x) >= 29900000 || Math.abs(base.center.z) >= 29900000).length;
  const namedBases = bases.filter((base) => base.knownName).length;
  const rows = [
    ["Largest cluster", `Base ${biggest.id}`, `${biggest.subBaseCount} sub-bases`],
    ["Farthest coordinate", `Base ${farthest.id}`, `${formatNumber(Math.round(farthest.distance))} blocks`],
    ["Closest to spawn", `Base ${nearest.id}`, `${formatNumber(Math.round(nearest.distance))} blocks`],
    ["Highest center Y", `Base ${highest.id}`, `Y ${formatNumber(highest.center.y)}`],
    ["Lowest center Y", `Base ${lowest.id}`, `Y ${formatNumber(lowest.center.y)}`],
    ["Average cluster size", "Sub-bases per base", formatNumber(avgSubBases)],
    ["Below Y 0", "Negative center height", `${negativeY} bases`],
    ["Near world border", "Within 100k of border", `${borderBases} bases`],
    ["Known names", "Named bases or residents", `${namedBases} bases`],
  ];
  document.getElementById("findingsList").innerHTML = rows.map(([label, title, value]) => `
    <div class="finding">
      <div><span>${label}</span><br>${title}</div>
      <strong>${value}</strong>
    </div>
  `).join("");
}

function renderBaseTable() {
  const query = document.getElementById("baseSearch")?.value.trim().toLowerCase() || "";
  const sortMode = document.getElementById("sortMode")?.value || "id";
  const rows = state.bases
    .filter((base) => state.activeDimensions.has(base.dimension))
    .filter((base) => {
      const haystack = [
        `base ${base.id}`,
        base.knownName,
        base.dimension,
        base.center.x,
        base.center.y,
        base.center.z,
        base.subBaseCount,
      ].join(" ").toLowerCase();
      return haystack.includes(query);
    })
    .sort(getSort(sortMode));

  document.getElementById("baseTable").innerHTML = rows.map((base) => `
    <tr>
      <td>Base ${base.id}</td>
      <td>${base.knownName ? escapeHtml(base.knownName) : '<span class="muted">Unknown</span>'}</td>
      <td>${base.dimension}</td>
      <td>X ${formatNumber(base.center.x)} / Y ${formatNumber(base.center.y)} / Z ${formatNumber(base.center.z)}</td>
      <td>${base.subBaseCount}</td>
      <td>${formatNumber(Math.round(base.distance))}</td>
    </tr>
  `).join("");
}

function getSort(mode) {
  const sorters = {
    id: (a, b) => a.id - b.id,
    "distance-desc": (a, b) => b.distance - a.distance,
    "distance-asc": (a, b) => a.distance - b.distance,
    "subbases-desc": (a, b) => b.subBaseCount - a.subBaseCount,
    "y-desc": (a, b) => b.center.y - a.center.y,
    "y-asc": (a, b) => a.center.y - b.center.y,
  };
  return sorters[mode] || sorters.id;
}

function renderGallery() {
  const images = window.screenshotImages || [];
  const gallery = document.getElementById("screenshotGallery");
  document.getElementById("galleryCount").textContent = `${images.length} images`;
  gallery.innerHTML = images.map((src) => {
    const label = screenshotLabel(src);
    const thumb = screenshotThumb(src);
    return `
      <button class="gallery-item" type="button" data-src="${src}" data-label="${label}">
        <img src="${thumb}" loading="lazy" decoding="async" alt="${label}">
        <span>${label}</span>
      </button>
    `;
  }).join("");
  gallery.querySelectorAll(".gallery-item").forEach((item) => {
    item.addEventListener("click", () => openLightbox(item.dataset.src, item.dataset.label));
  });
}

function openLightbox(src, label) {
  const lightbox = document.getElementById("lightbox");
  const image = document.getElementById("lightboxImage");
  const download = document.getElementById("downloadLightboxImage");
  image.src = src;
  image.alt = label;
  download.href = src;
  download.download = src.split("/").pop();
  document.getElementById("lightboxCaption").textContent = label;
  lightbox.hidden = false;
}

function closeLightbox() {
  const lightbox = document.getElementById("lightbox");
  lightbox.hidden = true;
  document.getElementById("lightboxImage").src = "";
}

function screenshotLabel(src) {
  return src
    .split("/")
    .pop()
    .replace(".png", "")
    .replace("_", " ")
    .replaceAll(".", ":");
}

function screenshotThumb(src) {
  return src.replace("screenshots/", "screenshots/thumbs/").replace(".png", ".jpg");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function countBy(items, getKey) {
  return items.reduce((result, item) => {
    const key = getKey(item);
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {});
}

function binValues(values, binCount) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const size = (max - min || 1) / binCount;
  const bins = Array.from({ length: binCount }, (_, index) => ({
    start: min + index * size,
    end: min + (index + 1) * size,
    count: 0,
  }));
  values.forEach((value) => {
    const index = Math.min(binCount - 1, Math.floor((value - min) / size));
    bins[index].count += 1;
  });
  return bins.map((bin) => ({
    label: `${formatShort(bin.start)}-${formatShort(bin.end)}`,
    count: bin.count,
  }));
}

function chooseGridStep(target) {
  const power = Math.pow(10, Math.floor(Math.log10(target)));
  const normalized = target / power;
  if (normalized > 5) return 10 * power;
  if (normalized > 2) return 5 * power;
  if (normalized > 1) return 2 * power;
  return power;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

function formatShort(value) {
  const abs = Math.abs(value);
  if (abs >= 1000000) return `${(value / 1000000).toFixed(abs >= 10000000 ? 0 : 1)}m`;
  if (abs >= 1000) return `${(value / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  return String(Math.round(value));
}
