const appState = {
  latest: null,
  history: {
    altitudeM: [],
    iasKmh: [],
    fuelPct: []
  },
  feeds: {
    hudmsg: {
      source: [],
      visible: []
    },
    gamechat: {
      source: [],
      visible: []
    }
  },
  mapKey: null
};

const metricGrid = document.querySelector("#metric-grid");
const connectionDot = document.querySelector("#connection-dot");
const connectionLabel = document.querySelector("#connection-label");
const vehicleLabel = document.querySelector("#vehicle-label");
const updatedLabel = document.querySelector("#updated-label");
const mapMeta = document.querySelector("#map-meta");
const mapImage = document.querySelector("#map-image");
const mapOverlay = document.querySelector("#map-overlay");
const mapEmpty = document.querySelector("#map-empty");
const sparkGrid = document.querySelector("#spark-grid");
const engineGrid = document.querySelector("#engine-grid");
const controlGrid = document.querySelector("#control-grid");
const missionContent = document.querySelector("#mission-content");
const hudFeed = document.querySelector("#hud-feed");
const chatFeed = document.querySelector("#chat-feed");
const clearHudFeedButton = document.querySelector("#clear-hud-feed");
const clearChatFeedButton = document.querySelector("#clear-chat-feed");
const stateTable = document.querySelector("#state-table");
const indicatorsTable = document.querySelector("#indicators-table");
const inspectorFilter = document.querySelector("#inspector-filter");

const metricDefinitions = [
  { key: "altitudeM", label: "Altitude", suffix: "m", decimals: 0 },
  { key: "iasKmh", label: "IAS", suffix: "km/h", decimals: 0 },
  { key: "tasKmh", label: "TAS", suffix: "km/h", decimals: 0 },
  { key: "mach", label: "Mach", suffix: "", decimals: 2 },
  { key: "climbMs", label: "Climb", suffix: "m/s", decimals: 1 },
  { key: "gLoad", label: "G-Load", suffix: "g", decimals: 2 },
  { key: "aoaDeg", label: "AoA", suffix: "deg", decimals: 1 },
  { key: "aosDeg", label: "AoS", suffix: "deg", decimals: 1 }
];

const controlDefinitions = [
  { key: "throttlePct", label: "Throttle" },
  { key: "aileronPct", label: "Aileron" },
  { key: "elevatorPct", label: "Elevator" },
  { key: "rudderPct", label: "Rudder" },
  { key: "flapsPct", label: "Flaps" },
  { key: "gearPct", label: "Gear" },
  { key: "airbrakePct", label: "Airbrake" }
];

const missionRoleOrder = ["attack", "defend", "scout", "support"];

const missionRoleMeta = {
  attack: {
    label: "Attack",
    accent: "attack"
  },
  defend: {
    label: "Defend",
    accent: "defend"
  },
  scout: {
    label: "Scout",
    accent: "scout"
  },
  support: {
    label: "Support",
    accent: "support"
  }
};

const targetTypeMeta = {
  ground: {
    label: "Ground Strike",
    icon: "ground"
  },
  naval: {
    label: "Naval",
    icon: "naval"
  },
  air: {
    label: "Air",
    icon: "air"
  },
  mixed: {
    label: "Mixed",
    icon: "mixed"
  }
};

function formatValue(value, suffix = "", decimals = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }
  const formatted = Number(value).toFixed(decimals);
  return suffix ? `${formatted} ${suffix}` : formatted;
}

function formatTimestamp(value) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function arraysMatchPrefix(left, right) {
  if (left.length > right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function titleCase(value) {
  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function detectObjectiveRole(text) {
  const normalized = text.toLowerCase();

  if (/(locate|scout|recon|search|find|identify|spot)\b/.test(normalized)) {
    return "scout";
  }

  if (/(protect|defend|escort|cover|hold|secure|guard)\b/.test(normalized)) {
    return "defend";
  }

  if (/(destroy|attack|bomb|capture|sink|intercept|eliminate|strike|assault)\b/.test(normalized)) {
    return "attack";
  }

  return "support";
}

function detectObjectiveTargetType(text) {
  const normalized = text.toLowerCase();

  const hasNaval = /(carrier|convoy|fleet|naval|port|harbor|frigate|destroyer|cruiser|ship|boat|submarine)\b/.test(
    normalized
  );
  const hasAir = /(airfield|aircraft|bomber|fighter|helicopter|plane|jet|runway)\b/.test(normalized);
  const hasGround = /(tank|ground|base|column|artillery|vehicle|bunker|truck|bridge|aa|spaa|sam)\b/.test(normalized);

  const matchedCount = [hasNaval, hasAir, hasGround].filter(Boolean).length;

  if (matchedCount > 1) {
    return "mixed";
  }
  if (hasNaval) {
    return "naval";
  }
  if (hasAir) {
    return "air";
  }
  if (hasGround) {
    return "ground";
  }

  return "ground";
}

function getStatusLabel(status) {
  if (!status || status === "undefined") {
    return "Pending";
  }

  return titleCase(status);
}

function getStatusClass(status) {
  if (status === "completed" || status === "success" || status === "done") {
    return "is-complete";
  }

  if (status === "failed" || status === "cancelled") {
    return "is-failed";
  }

  if (status === "in_progress") {
    return "is-active";
  }

  return "is-pending";
}

function enrichObjective(objective, index) {
  const text = objective?.text ?? objective?.title ?? `Objective ${index + 1}`;
  const role = detectObjectiveRole(text);
  const targetType = detectObjectiveTargetType(text);
  const status = objective?.status ?? "undefined";

  return {
    index,
    text,
    primary: Boolean(objective?.primary),
    role,
    targetType,
    status,
    statusLabel: getStatusLabel(status)
  };
}

function renderTargetIcon(targetType) {
  if (targetType === "naval") {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v10"></path>
        <path d="M8 7h8"></path>
        <path d="M7 14c0 3 2.2 5 5 5s5-2 5-5"></path>
        <path d="M4 14c0 4.4 3.6 8 8 8s8-3.6 8-8"></path>
      </svg>
    `;
  }

  if (targetType === "air") {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3l2.2 6 6.8 1-5 3.4 1.9 6.6-5.9-3.8-5.9 3.8 1.9-6.6-5-3.4 6.8-1z"></path>
      </svg>
    `;
  }

  if (targetType === "mixed") {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8"></circle>
        <path d="M12 6v12"></path>
        <path d="M6 12h12"></path>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 16h16"></path>
      <path d="M7 16l2-6h6l2 6"></path>
      <path d="M10 10V7h4v3"></path>
    </svg>
  `;
}

function renderObjectiveCard(objective) {
  const roleMeta = missionRoleMeta[objective.role] ?? missionRoleMeta.support;
  const targetMeta = targetTypeMeta[objective.targetType] ?? targetTypeMeta.ground;

  return `
    <article class="objective-card objective-${roleMeta.accent}">
      <div class="objective-header">
        <div class="objective-target-badge">
          <span class="objective-icon objective-icon-${targetMeta.icon}">${renderTargetIcon(objective.targetType)}</span>
          <div>
            <strong>${targetMeta.label}</strong>
            <span>${objective.primary ? "Primary Objective" : "Secondary Objective"}</span>
          </div>
        </div>
        <span class="objective-status ${getStatusClass(objective.status)}">${objective.statusLabel}</span>
      </div>
      <p class="objective-text">${escapeHtml(objective.text)}</p>
    </article>
  `;
}

function updateHistory(latest) {
  const flight = latest?.derived?.flight ?? {};
  const fuel = latest?.derived?.fuel ?? {};

  const samples = [
    ["altitudeM", flight.altitudeM],
    ["iasKmh", flight.iasKmh],
    ["fuelPct", fuel.percent]
  ];

  for (const [key, value] of samples) {
    if (value !== null && value !== undefined) {
      appState.history[key].push(Number(value));
      if (appState.history[key].length > 60) {
        appState.history[key].shift();
      }
    }
  }
}

function metricCardHtml(title, value, note) {
  return `
    <article class="metric-card">
      <span>${title}</span>
      <strong>${value}</strong>
      <p>${note}</p>
    </article>
  `;
}

function renderMetrics(snapshot) {
  const flight = snapshot?.derived?.flight ?? {};
  const fuel = snapshot?.derived?.fuel ?? {};

  const cards = metricDefinitions.map((definition) =>
    metricCardHtml(
      definition.label,
      formatValue(flight[definition.key], definition.suffix, definition.decimals),
      "Live flight data"
    )
  );

  cards.push(
    metricCardHtml(
      "Fuel",
      formatValue(fuel.currentKg, "kg", 0),
      fuel.percent !== null && fuel.percent !== undefined
        ? `${formatValue(fuel.percent, "%", 1)} remaining`
        : "No fuel telemetry"
    )
  );

  metricGrid.innerHTML = cards.join("");
}

function buildSparkline(values, color) {
  if (values.length < 2) {
    return `<div class="spark-empty">Collecting samples</div>`;
  }

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 100 - ((value - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  return `
    <svg viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline fill="none" stroke="${color}" stroke-width="3" points="${points}"></polyline>
    </svg>
  `;
}

function renderTrends(snapshot) {
  const fuel = snapshot?.derived?.fuel ?? {};
  const charts = [
    {
      label: "Altitude",
      latest: formatValue(snapshot?.derived?.flight?.altitudeM, "m", 0),
      values: appState.history.altitudeM,
      color: "#7be0b8"
    },
    {
      label: "IAS",
      latest: formatValue(snapshot?.derived?.flight?.iasKmh, "km/h", 0),
      values: appState.history.iasKmh,
      color: "#f7c873"
    },
    {
      label: "Fuel",
      latest: formatValue(fuel.percent, "%", 1),
      values: appState.history.fuelPct,
      color: "#ff8a6b"
    }
  ];

  sparkGrid.innerHTML = charts
    .map(
      (chart) => `
        <article class="spark-card">
          <div class="spark-head">
            <span>${chart.label}</span>
            <strong>${chart.latest}</strong>
          </div>
          <div class="spark-shell">${buildSparkline(chart.values, chart.color)}</div>
        </article>
      `
    )
    .join("");
}

function renderEngines(snapshot) {
  const engines = snapshot?.derived?.engines ?? [];

  if (engines.length === 0) {
    engineGrid.innerHTML = `<p class="empty-note">No engine telemetry is available for the current vehicle.</p>`;
    return;
  }

  engineGrid.innerHTML = engines
    .map(
      (engine) => `
        <article class="engine-card">
          <div class="engine-title">
            <span>Engine ${engine.index}</span>
            <strong>${formatValue(engine.throttlePct, "%", 0)}</strong>
          </div>
          <dl>
            <div><dt>RPM</dt><dd>${formatValue(engine.rpm, "", 0)}</dd></div>
            <div><dt>Power</dt><dd>${formatValue(engine.powerHp, "hp", 0)}</dd></div>
            <div><dt>Thrust</dt><dd>${formatValue(engine.thrustKg, "kg", 0)}</dd></div>
            <div><dt>Oil Temp</dt><dd>${formatValue(engine.oilTempC, "C", 0)}</dd></div>
            <div><dt>Manifold</dt><dd>${formatValue(engine.manifoldAtm, "atm", 2)}</dd></div>
            <div><dt>Efficiency</dt><dd>${formatValue(engine.efficiencyPct, "%", 0)}</dd></div>
          </dl>
        </article>
      `
    )
    .join("");
}

function renderControls(snapshot) {
  const controls = snapshot?.derived?.controls ?? {};

  controlGrid.innerHTML = controlDefinitions
    .map((definition) => {
      const value = controls[definition.key];
      const isSigned = ["aileronPct", "elevatorPct", "rudderPct"].includes(definition.key);
      const safeValue = value ?? 0;
      const fill = isSigned ? clamp((safeValue + 100) / 2, 0, 100) : clamp(safeValue, 0, 100);

      return `
        <article class="control-card">
          <div class="control-head">
            <span>${definition.label}</span>
            <strong>${formatValue(value, "%", 0)}</strong>
          </div>
          <div class="bar-shell">
            <div class="bar-fill" style="width:${fill}%"></div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderMission(snapshot) {
  const mission = snapshot?.mission;

  if (!mission) {
    missionContent.innerHTML = `<p class="empty-note">Mission data is not available yet.</p>`;
    return;
  }

  const objectives = Array.isArray(mission.objectives) ? mission.objectives.map(enrichObjective) : [];
  const groupedObjectives = missionRoleOrder
    .map((role) => ({
      role,
      meta: missionRoleMeta[role],
      items: objectives
        .filter((objective) => objective.role === role)
        .sort((left, right) => {
          if (left.primary !== right.primary) {
            return Number(right.primary) - Number(left.primary);
          }
          return left.text.localeCompare(right.text);
        })
    }))
    .filter((group) => group.items.length > 0);

  missionContent.innerHTML = `
    <div class="mission-status-row">
      <article class="mission-pill">
        <span>Status</span>
        <strong>${mission.status ?? "unknown"}</strong>
      </article>
      <article class="mission-pill">
        <span>Objectives</span>
        <strong>${objectives.length}</strong>
      </article>
    </div>
    ${
      groupedObjectives.length > 0
        ? `<div class="objective-groups">${groupedObjectives
            .map(
              (group) => `
                <section class="objective-group">
                  <div class="objective-group-header">
                    <span class="objective-group-tag objective-${group.meta.accent}">${group.meta.label}</span>
                    <strong>${group.items.length}</strong>
                  </div>
                  <div class="objective-card-grid">${group.items.map(renderObjectiveCard).join("")}</div>
                </section>
              `
            )
            .join("")}</div>`
        : `<p class="empty-note">War Thunder is not publishing objective details for this sortie.</p>`
    }
  `;
}

function syncFeed(feedName, incomingLines) {
  const entry = appState.feeds[feedName];
  const incoming = Array.isArray(incomingLines) ? incomingLines : [];

  if (incoming.length < entry.source.length || !arraysMatchPrefix(entry.source, incoming)) {
    entry.source = [...incoming];
    entry.visible = [...incoming];
    return;
  }

  if (incoming.length > entry.source.length) {
    const appended = incoming.slice(entry.source.length);
    entry.visible.push(...appended);
    entry.source = [...incoming];
  }
}

function renderFeed(target, lines, emptyText) {
  target.innerHTML =
    lines.length > 0
      ? lines.map((line) => `<li>${line}</li>`).join("")
      : `<li class="empty-note">${emptyText}</li>`;
  target.scrollTop = target.scrollHeight;
}

function createTableRows(record, filter) {
  return Object.entries(record ?? {})
    .filter(([key]) => key.toLowerCase().includes(filter))
    .map(
      ([key, value]) => `
        <div class="kv-row">
          <span>${key}</span>
          <strong>${typeof value === "number" ? value : JSON.stringify(value)}</strong>
        </div>
      `
    )
    .join("");
}

function renderInspector(snapshot) {
  const filter = inspectorFilter.value.trim().toLowerCase();
  stateTable.innerHTML = createTableRows(snapshot?.state ?? {}, filter) || `<p class="empty-note">No matching state keys.</p>`;
  indicatorsTable.innerHTML =
    createTableRows(snapshot?.indicators ?? {}, filter) || `<p class="empty-note">No matching indicator keys.</p>`;
}

function resizeCanvas() {
  const rect = mapOverlay.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  mapOverlay.width = Math.round(rect.width * ratio);
  mapOverlay.height = Math.round(rect.height * ratio);
  const context = mapOverlay.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function drawMap(snapshot) {
  resizeCanvas();

  const context = mapOverlay.getContext("2d");
  const width = mapOverlay.clientWidth;
  const height = mapOverlay.clientHeight;
  const objects = Array.isArray(snapshot?.mapObjects) ? snapshot.mapObjects : [];

  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgba(7, 12, 20, 0.12)";
  context.fillRect(0, 0, width, height);

  for (let index = 1; index < 8; index += 1) {
    const x = (width / 8) * index;
    const y = (height / 8) * index;
    context.strokeStyle = "rgba(255,255,255,0.08)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  objects.forEach((entry) => {
    const color = entry?.color ?? "#ffffff";

    if (Number.isFinite(entry?.sx) && Number.isFinite(entry?.sy) && Number.isFinite(entry?.ex) && Number.isFinite(entry?.ey)) {
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(entry.sx * width, entry.sy * height);
      context.lineTo(entry.ex * width, entry.ey * height);
      context.stroke();
      return;
    }

    if (!Number.isFinite(entry?.x) || !Number.isFinite(entry?.y)) {
      return;
    }

    const x = entry.x * width;
    const y = entry.y * height;
    const size = entry?.icon === "Player" ? 8 : entry?.type === "capture_zone" ? 6 : 4;

    context.fillStyle = color;
    context.globalAlpha = entry?.blink ? 0.6 : 0.95;
    context.beginPath();
    context.arc(x, y, size, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;

    if (entry?.icon === "Player") {
      context.strokeStyle = "#ffffff";
      context.lineWidth = 2;
      context.beginPath();
      context.arc(x, y, size + 5, 0, Math.PI * 2);
      context.stroke();

      if (Number.isFinite(entry?.dx) && Number.isFinite(entry?.dy)) {
        context.strokeStyle = "#ffffff";
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + entry.dx * 18, y + entry.dy * 18);
        context.stroke();
      }
    }
  });

  mapMeta.innerHTML = `
    <span>${objects.length} objects</span>
    <span>${snapshot?.mapInfo?.valid ? "Map live" : "Map idle"}</span>
  `;
  mapEmpty.hidden = objects.length > 0;
}

function refreshMapImage(snapshot) {
  if (!snapshot?.mapInfo?.valid) {
    return;
  }

  const generation = snapshot.mapInfo.map_generation ?? "default";
  if (appState.mapKey === generation && mapImage.getAttribute("src")) {
    return;
  }

  appState.mapKey = generation;
  mapImage.src = `/api/map-image?generation=${generation}&t=${Date.now()}`;
}

function renderHeader(snapshot) {
  const available = Boolean(snapshot?.derived?.connection?.available);
  const vehicle = snapshot?.derived?.vehicle ?? {};
  const updated = snapshot?.updatedAt?.state ?? snapshot?.updatedAt?.indicators ?? snapshot?.updatedAt?.["mission.json"];

  connectionDot.dataset.connected = String(available);
  connectionLabel.textContent = available ? "Connected to localhost:8111" : "Waiting for telemetry";
  vehicleLabel.textContent = vehicle.type
    ? `${vehicle.type}${vehicle.army ? ` / ${vehicle.army}` : ""}`
    : "Vehicle unknown";
  updatedLabel.textContent = formatTimestamp(updated);
}

function render(snapshot) {
  renderHeader(snapshot);
  renderMetrics(snapshot);
  renderTrends(snapshot);
  renderEngines(snapshot);
  renderControls(snapshot);
  renderMission(snapshot);
  syncFeed("hudmsg", snapshot?.feeds?.hudmsg ?? []);
  syncFeed("gamechat", snapshot?.feeds?.gamechat ?? []);
  renderFeed(hudFeed, appState.feeds.hudmsg.visible, "No HUD events yet.");
  renderFeed(chatFeed, appState.feeds.gamechat.visible, "No chat lines yet.");
  renderInspector(snapshot);
  refreshMapImage(snapshot);
  drawMap(snapshot);
}

async function fetchTelemetry(scope) {
  const response = await fetch(`/api/telemetry?scope=${scope}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.errors?.[0]?.message ?? `Request failed with ${response.status}`);
  }

  return response.json();
}

async function refresh(scope) {
  try {
    const payload = await fetchTelemetry(scope);
    appState.latest = payload.telemetry;
    updateHistory(appState.latest);
    render(appState.latest);
  } catch (error) {
    connectionDot.dataset.connected = "false";
    connectionLabel.textContent = "Telemetry unavailable";
    updatedLabel.textContent = error instanceof Error ? error.message : "Unknown error";
  }
}

inspectorFilter.addEventListener("input", () => {
  if (appState.latest) {
    renderInspector(appState.latest);
  }
});

clearHudFeedButton.addEventListener("click", () => {
  appState.feeds.hudmsg.visible = [];
  renderFeed(hudFeed, appState.feeds.hudmsg.visible, "No HUD events yet.");
});

clearChatFeedButton.addEventListener("click", () => {
  appState.feeds.gamechat.visible = [];
  renderFeed(chatFeed, appState.feeds.gamechat.visible, "No chat lines yet.");
});

window.addEventListener("resize", () => {
  if (appState.latest) {
    drawMap(appState.latest);
  }
});

await refresh("full");
window.setInterval(() => {
  refresh("fast");
}, 600);
window.setInterval(() => {
  refresh("slow");
}, 3000);
