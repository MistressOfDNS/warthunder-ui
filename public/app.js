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
  showPendingObjectives: true,
  showMapLegend: false,
  mapView: {
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    isDragging: false,
    pointerId: null,
    lastPointerX: 0,
    lastPointerY: 0,
    minZoom: 1,
    maxZoom: 5
  },
  mapHitAreas: [],
  mapKey: null
};

const metricGrid = document.querySelector("#metric-grid");
const connectionDot = document.querySelector("#connection-dot");
const connectionLabel = document.querySelector("#connection-label");
const vehicleLabel = document.querySelector("#vehicle-label");
const updatedLabel = document.querySelector("#updated-label");
const mapMeta = document.querySelector("#map-meta");
const mapStage = document.querySelector(".map-stage");
const mapImage = document.querySelector("#map-image");
const mapOverlay = document.querySelector("#map-overlay");
const mapEmpty = document.querySelector("#map-empty");
const mapLegend = document.querySelector("#map-legend");
const mapTooltip = document.querySelector("#map-tooltip");
const toggleMapLegendButton = document.querySelector("#toggle-map-legend");
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

function clampMapOffsets() {
  const width = mapStage.clientWidth;
  const height = mapStage.clientHeight;
  const { zoom } = appState.mapView;

  if (zoom <= 1) {
    appState.mapView.offsetX = 0;
    appState.mapView.offsetY = 0;
    return;
  }

  const minOffsetX = width - width * zoom;
  const minOffsetY = height - height * zoom;

  appState.mapView.offsetX = clamp(appState.mapView.offsetX, minOffsetX, 0);
  appState.mapView.offsetY = clamp(appState.mapView.offsetY, minOffsetY, 0);
}

function applyMapTransform() {
  clampMapOffsets();

  const { offsetX, offsetY, zoom } = appState.mapView;
  const transform = `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`;

  mapImage.style.transform = transform;
  mapOverlay.style.transform = "";
  mapStage.dataset.canPan = String(zoom > 1);
  mapStage.dataset.dragging = String(appState.mapView.isDragging);
}

function projectMapPoint(x, y, width, height) {
  return {
    x: appState.mapView.offsetX + x * width * appState.mapView.zoom,
    y: appState.mapView.offsetY + y * height * appState.mapView.zoom
  };
}

function drawDiamond(context, x, y, size) {
  context.beginPath();
  context.moveTo(x, y - size);
  context.lineTo(x + size, y);
  context.lineTo(x, y + size);
  context.lineTo(x - size, y);
  context.closePath();
}

function drawTriangle(context, x, y, size) {
  context.beginPath();
  context.moveTo(x, y - size);
  context.lineTo(x + size * 0.9, y + size * 0.8);
  context.lineTo(x - size * 0.9, y + size * 0.8);
  context.closePath();
}

function drawChevron(context, x, y, size) {
  context.beginPath();
  context.moveTo(x, y - size);
  context.lineTo(x + size * 0.95, y + size * 0.85);
  context.lineTo(x, y + size * 0.3);
  context.lineTo(x - size * 0.95, y + size * 0.85);
  context.closePath();
}

function drawCrosshair(context, x, y, size) {
  context.beginPath();
  context.arc(x, y, size, 0, Math.PI * 2);
  context.moveTo(x - size - 3, y);
  context.lineTo(x + size + 3, y);
  context.moveTo(x, y - size - 3);
  context.lineTo(x, y + size + 3);
}

function drawTank(context, x, y, size) {
  context.beginPath();
  context.roundRect(x - size, y - size * 0.55, size * 2, size * 1.1, 2);
  context.moveTo(x - size * 0.3, y - size * 0.9);
  context.lineTo(x + size * 0.35, y - size * 0.9);
  context.lineTo(x + size * 0.35, y - size * 0.35);
  context.lineTo(x - size * 0.3, y - size * 0.35);
  context.closePath();
  context.moveTo(x + size * 0.35, y - size * 0.65);
  context.lineTo(x + size * 1.35, y - size * 0.95);
  context.moveTo(x - size * 0.7, y + size * 0.75);
  context.lineTo(x - size * 0.2, y + size * 0.75);
  context.moveTo(x + size * 0.2, y + size * 0.75);
  context.lineTo(x + size * 0.7, y + size * 0.75);
}

function drawShip(context, x, y, size) {
  context.beginPath();
  context.moveTo(x - size, y + size * 0.55);
  context.lineTo(x + size * 0.8, y + size * 0.55);
  context.lineTo(x + size * 1.15, y);
  context.lineTo(x - size * 0.45, y - size * 0.15);
  context.closePath();
  context.moveTo(x - size * 0.15, y - size * 0.15);
  context.lineTo(x - size * 0.15, y - size * 0.9);
  context.moveTo(x - size * 0.15, y - size * 0.9);
  context.lineTo(x + size * 0.45, y - size * 0.6);
}

function drawAircraft(context, x, y, size) {
  context.beginPath();
  context.moveTo(x, y - size);
  context.lineTo(x + size * 0.3, y - size * 0.1);
  context.lineTo(x + size, y + size * 0.1);
  context.lineTo(x + size * 0.28, y + size * 0.25);
  context.lineTo(x + size * 0.28, y + size);
  context.lineTo(x, y + size * 0.45);
  context.lineTo(x - size * 0.28, y + size);
  context.lineTo(x - size * 0.28, y + size * 0.25);
  context.lineTo(x - size, y + size * 0.1);
  context.lineTo(x - size * 0.3, y - size * 0.1);
  context.closePath();
}

function drawShield(context, x, y, size) {
  context.beginPath();
  context.moveTo(x, y - size);
  context.lineTo(x + size * 0.85, y - size * 0.2);
  context.lineTo(x + size * 0.55, y + size * 0.9);
  context.lineTo(x, y + size * 1.2);
  context.lineTo(x - size * 0.55, y + size * 0.9);
  context.lineTo(x - size * 0.85, y - size * 0.2);
  context.closePath();
}

function drawStar(context, x, y, size) {
  context.beginPath();
  for (let index = 0; index < 10; index += 1) {
    const radius = index % 2 === 0 ? size : size * 0.45;
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (index === 0) {
      context.moveTo(px, py);
    } else {
      context.lineTo(px, py);
    }
  }
  context.closePath();
}

function drawRoundedSquare(context, x, y, size, radius = 3) {
  const left = x - size;
  const top = y - size;
  const diameter = size * 2;

  context.beginPath();
  context.roundRect(left, top, diameter, diameter, radius);
}

function classifyMapSide(entry) {
  const color = String(entry?.color ?? "").toLowerCase();

  if (String(entry?.icon ?? "").toLowerCase() === "player") {
    return "self";
  }
  if (color.startsWith("#17") || color.startsWith("#04")) {
    return "friendly";
  }
  if (color.startsWith("#39")) {
    return "ally";
  }
  if (color.startsWith("#fa0") || color.startsWith("#f00") || color.startsWith("#f0")) {
    return "enemy";
  }
  if (color.startsWith("#fff")) {
    return "neutral";
  }

  return null;
}

function getMarkerKind(entry) {
  const icon = String(entry?.icon ?? "").toLowerCase();
  const type = String(entry?.type ?? "").toLowerCase();

  if (icon === "player") {
    return "player";
  }
  if (type === "capture_zone" || icon === "capture_zone") {
    return "capture-zone";
  }
  if (type === "bombing_point" || icon === "bombing_point") {
    return "bombing-point";
  }
  if (type === "defending_point" || icon === "defending_point") {
    return "defending-point";
  }
  if (type === "point_of_interest" || icon === "point_of_interest") {
    return "point-of-interest";
  }
  if (icon.includes("fighter") || type === "aircraft") {
    return "aircraft";
  }
  if (icon.includes("ship") || type === "ship") {
    return "ship";
  }
  if (icon.includes("spaa") || icon.includes("airdefence")) {
    return "spaa";
  }
  if (icon.includes("tank")) {
    return "tank";
  }
  if (type === "ground_model") {
    return "ground";
  }

  return "generic";
}

function formatMarkerKind(markerKind) {
  const labels = {
    player: "Player Aircraft",
    "capture-zone": "Capture Zone",
    "bombing-point": "Bombing Point",
    "defending-point": "Defending Point",
    "point-of-interest": "Point Of Interest",
    aircraft: "Aircraft",
    ship: "Ship",
    tank: "Tank",
    spaa: "Air Defence",
    ground: "Ground Unit",
    generic: "Map Marker"
  };

  return labels[markerKind] ?? "Map Marker";
}

function describeMapEntry(entry) {
  const markerKind = getMarkerKind(entry);
  const side = classifyMapSide(entry);
  const sideLabel = {
    self: "Self",
    friendly: "Friendly",
    ally: "Ally",
    enemy: "Enemy",
    neutral: "Neutral"
  }[side];
  const iconLabel =
    entry?.icon &&
    !["none", "player", "capture_zone", "bombing_point", "defending_point", "point_of_interest"].includes(
      String(entry.icon).toLowerCase()
    )
      ? titleCase(entry.icon)
      : null;

  return [sideLabel, iconLabel ?? formatMarkerKind(markerKind)].filter(Boolean).join(" ");
}

function renderLegendSymbol(markerKind) {
  const svgByKind = {
    player:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l6 10-6-3-6 3z"></path><circle cx="12" cy="12" r="7"></circle></svg>',
    "capture-zone":
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5"></circle><path d="M2 12h20"></path><path d="M12 2v20"></path></svg>',
    "bombing-point":
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 9-8 9-8-9z"></path></svg>',
    "defending-point":
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 4v5c0 5-3.3 7.9-7 9-3.7-1.1-7-4-7-9V7z"></path></svg>',
    "point-of-interest":
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"></path></svg>',
    aircraft:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2 6 7 2-6 2v8l-3-2-3 2v-8l-6-2 7-2z"></path></svg>',
    ship:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15h12l4-3-2 7H6z"></path><path d="M11 12V6"></path></svg>',
    tank:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="10" height="6" rx="1"></rect><path d="M11 10V7h4"></path><path d="M15 8h4"></path></svg>',
    spaa:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="8" width="12" height="12" rx="2"></rect><path d="M12 5v18"></path><path d="M5 12h14"></path></svg>',
    ground:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5l7 12H5z"></path></svg>',
    generic:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6"></circle></svg>'
  };

  return svgByKind[markerKind] ?? svgByKind.generic;
}

function renderMapLegend() {
  const legendItems = [
    { kind: "player", label: "Self" },
    { kind: "aircraft", label: "Aircraft" },
    { kind: "ship", label: "Ship" },
    { kind: "tank", label: "Tank" },
    { kind: "spaa", label: "Air Defence" },
    { kind: "capture-zone", label: "Capture Zone" },
    { kind: "bombing-point", label: "Bombing Point" },
    { kind: "defending-point", label: "Defending Point" },
    { kind: "point-of-interest", label: "Point Of Interest" }
  ];

  mapLegend.innerHTML = `
    <div class="map-legend-grid">
      ${legendItems
        .map(
          (item) => `
            <div class="legend-item">
              <span class="legend-symbol legend-${item.kind}">${renderLegendSymbol(item.kind)}</span>
              <span>${item.label}</span>
            </div>
          `
        )
        .join("")}
    </div>
  `;

  mapLegend.hidden = !appState.showMapLegend;
  toggleMapLegendButton.textContent = appState.showMapLegend ? "Hide Legend" : "Show Legend";
  toggleMapLegendButton.setAttribute("aria-pressed", String(appState.showMapLegend));
}

function hideMapTooltip() {
  mapTooltip.hidden = true;
}

function showMapTooltip(text, x, y) {
  mapTooltip.textContent = text;
  mapTooltip.style.left = `${x}px`;
  mapTooltip.style.top = `${y}px`;
  mapTooltip.hidden = false;
}

function findMapHitArea(x, y) {
  for (let index = appState.mapHitAreas.length - 1; index >= 0; index -= 1) {
    const area = appState.mapHitAreas[index];
    const dx = x - area.x;
    const dy = y - area.y;
    if (dx * dx + dy * dy <= area.radius * area.radius) {
      return area;
    }
  }
  return null;
}

function drawMapMarker(context, entry, x, y) {
  const color = entry?.color ?? "#ffffff";
  const markerKind = getMarkerKind(entry);

  if (markerKind === "player") {
    const headingX = Number.isFinite(entry?.dx) ? entry.dx : 0;
    const headingY = Number.isFinite(entry?.dy) ? entry.dy : -1;
    const angle = Math.atan2(headingY, headingX) + Math.PI / 2;

    context.save();
    context.translate(x, y);
    context.rotate(angle);
    context.fillStyle = "#f6cf2f";
    context.strokeStyle = "rgba(255,255,255,0.95)";
    context.lineWidth = 2;
    drawChevron(context, 0, 0, 8);
    context.fill();
    context.stroke();

    context.fillStyle = "rgba(255,255,255,0.18)";
    context.beginPath();
    context.moveTo(0, -13);
    context.lineTo(3.5, -5.5);
    context.lineTo(-3.5, -5.5);
    context.closePath();
    context.fill();

    context.restore();

    context.save();
    context.strokeStyle = "rgba(255,255,255,0.9)";
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(x, y, 10, 0, Math.PI * 2);
    context.stroke();
    context.restore();

    if (Number.isFinite(entry?.dx) && Number.isFinite(entry?.dy)) {
      context.save();
      context.strokeStyle = "#ffffff";
      context.lineWidth = 1.5;
      context.setLineDash([3, 3]);
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + entry.dx * 14, y + entry.dy * 14);
      context.stroke();
      context.restore();
    }
    return;
  }

  context.save();
  context.fillStyle = color;
  context.strokeStyle = "rgba(12, 18, 28, 0.72)";
  context.lineWidth = 1.5;
  context.globalAlpha = entry?.blink ? 0.72 : 0.96;

  if (markerKind === "capture-zone") {
    context.lineWidth = 2.5;
    drawCrosshair(context, x, y, 6.5);
    context.strokeStyle = color;
    context.stroke();
    context.beginPath();
    context.arc(x, y, 3.5, 0, Math.PI * 2);
    context.fill();
    context.restore();
    return;
  }

  if (markerKind === "bombing-point") {
    drawDiamond(context, x, y, 7);
    context.fill();
    context.stroke();
    context.restore();
    return;
  }

  if (markerKind === "defending-point") {
    drawShield(context, x, y, 6.5);
    context.fill();
    context.stroke();
    context.restore();
    return;
  }

  if (markerKind === "point-of-interest") {
    drawStar(context, x, y, 7);
    context.fill();
    context.stroke();
    context.restore();
    return;
  }

  if (markerKind === "aircraft") {
    drawAircraft(context, x, y, 6);
    context.fill();
    context.stroke();
    context.restore();
    return;
  }

  if (markerKind === "ship") {
    drawShip(context, x, y, 6.5);
    context.fill();
    context.stroke();
    context.restore();
    return;
  }

  if (markerKind === "tank") {
    drawTank(context, x, y, 5.5);
    context.fill();
    context.stroke();
    context.restore();
    return;
  }

  if (markerKind === "spaa") {
    drawRoundedSquare(context, x, y, 5.5);
    context.fill();
    context.stroke();
    context.beginPath();
    context.moveTo(x - 4, y);
    context.lineTo(x + 4, y);
    context.moveTo(x, y - 4);
    context.lineTo(x, y + 4);
    context.stroke();
    context.restore();
    return;
  }

  if (markerKind === "ground") {
    drawTriangle(context, x, y, 5.5);
    context.fill();
    context.stroke();
    context.restore();
    return;
  }

  context.beginPath();
  context.arc(x, y, 5, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.restore();
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
  const pendingObjectives = objectives.filter((objective) => getStatusClass(objective.status) === "is-pending");
  const visibleObjectives = appState.showPendingObjectives
    ? objectives
    : objectives.filter((objective) => getStatusClass(objective.status) !== "is-pending");
  const groupedObjectives = missionRoleOrder
    .map((role) => ({
      role,
      meta: missionRoleMeta[role],
      items: visibleObjectives
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
    <div class="mission-toolbar">
      <button
        id="toggle-pending-targets"
        class="clear-button toggle-button"
        type="button"
        aria-pressed="${String(!appState.showPendingObjectives)}"
      >
        ${appState.showPendingObjectives ? "Hide" : "Show"} Pending Targets (${pendingObjectives.length})
      </button>
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
        : `<p class="empty-note">${
            objectives.length > 0
              ? "No objectives match the current pending-target filter."
              : "War Thunder is not publishing objective details for this sortie."
          }</p>`
    }
  `;

  const togglePendingTargetsButton = document.querySelector("#toggle-pending-targets");
  togglePendingTargetsButton?.addEventListener("click", () => {
    appState.showPendingObjectives = !appState.showPendingObjectives;
    if (appState.latest) {
      renderMission(appState.latest);
    }
  });
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
  const rect = mapStage.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  mapOverlay.width = Math.round(rect.width * ratio);
  mapOverlay.height = Math.round(rect.height * ratio);
  const context = mapOverlay.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  applyMapTransform();
}

function drawMap(snapshot) {
  resizeCanvas();

  const context = mapOverlay.getContext("2d");
  const width = mapStage.clientWidth;
  const height = mapStage.clientHeight;
  const objects = Array.isArray(snapshot?.mapObjects) ? snapshot.mapObjects : [];
  appState.mapHitAreas = [];

  context.clearRect(0, 0, width, height);

  for (let index = 1; index < 8; index += 1) {
    const vertical = projectMapPoint(index / 8, 0, width, height);
    const verticalEnd = projectMapPoint(index / 8, 1, width, height);
    const horizontal = projectMapPoint(0, index / 8, width, height);
    const horizontalEnd = projectMapPoint(1, index / 8, width, height);
    context.strokeStyle = "rgba(255,255,255,0.08)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(vertical.x, vertical.y);
    context.lineTo(verticalEnd.x, verticalEnd.y);
    context.moveTo(horizontal.x, horizontal.y);
    context.lineTo(horizontalEnd.x, horizontalEnd.y);
    context.stroke();
  }

  objects.forEach((entry) => {
    const color = entry?.color ?? "#ffffff";

    if (Number.isFinite(entry?.sx) && Number.isFinite(entry?.sy) && Number.isFinite(entry?.ex) && Number.isFinite(entry?.ey)) {
      const start = projectMapPoint(entry.sx, entry.sy, width, height);
      const end = projectMapPoint(entry.ex, entry.ey, width, height);
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.stroke();
      return;
    }

    if (!Number.isFinite(entry?.x) || !Number.isFinite(entry?.y)) {
      return;
    }

    const projected = projectMapPoint(entry.x, entry.y, width, height);
    drawMapMarker(context, entry, projected.x, projected.y);
    appState.mapHitAreas.push({
      x: projected.x,
      y: projected.y,
      radius: getMarkerKind(entry) === "player" ? 16 : 12,
      label: describeMapEntry(entry)
    });
  });

  mapMeta.innerHTML = `
    <span>${objects.length} objects</span>
    <span>${snapshot?.mapInfo?.valid ? "Map live" : "Map idle"}</span>
    <span>${appState.mapView.zoom.toFixed(1)}x zoom</span>
  `;
  mapEmpty.hidden = objects.length > 0;
  applyMapTransform();
  renderMapLegend();
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
  applyMapTransform();
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

toggleMapLegendButton.addEventListener("click", () => {
  appState.showMapLegend = !appState.showMapLegend;
  renderMapLegend();
});

mapStage.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();

    const rect = mapStage.getBoundingClientRect();
    const cursorX = event.clientX - rect.left;
    const cursorY = event.clientY - rect.top;
    const zoomFactor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    const previousZoom = appState.mapView.zoom;
    const nextZoom = clamp(previousZoom * zoomFactor, appState.mapView.minZoom, appState.mapView.maxZoom);

    if (nextZoom === previousZoom) {
      return;
    }

    const worldX = (cursorX - appState.mapView.offsetX) / previousZoom;
    const worldY = (cursorY - appState.mapView.offsetY) / previousZoom;

    appState.mapView.zoom = nextZoom;
    appState.mapView.offsetX = cursorX - worldX * nextZoom;
    appState.mapView.offsetY = cursorY - worldY * nextZoom;

    if (nextZoom === 1) {
      appState.mapView.offsetX = 0;
      appState.mapView.offsetY = 0;
    }

    applyMapTransform();

    if (appState.latest) {
      drawMap(appState.latest);
    }
  },
  { passive: false }
);

mapStage.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || appState.mapView.zoom <= 1) {
    return;
  }

  event.preventDefault();
  appState.mapView.isDragging = true;
  appState.mapView.pointerId = event.pointerId;
  appState.mapView.lastPointerX = event.clientX;
  appState.mapView.lastPointerY = event.clientY;
  mapStage.setPointerCapture(event.pointerId);
  applyMapTransform();
});

mapStage.addEventListener("pointermove", (event) => {
  if (!appState.mapView.isDragging || appState.mapView.pointerId !== event.pointerId) {
    const rect = mapStage.getBoundingClientRect();
    const hitArea = findMapHitArea(event.clientX - rect.left, event.clientY - rect.top);
    if (hitArea) {
      showMapTooltip(hitArea.label, event.clientX - rect.left + 14, event.clientY - rect.top + 14);
    } else {
      hideMapTooltip();
    }
    return;
  }

  const deltaX = event.clientX - appState.mapView.lastPointerX;
  const deltaY = event.clientY - appState.mapView.lastPointerY;

  appState.mapView.offsetX += deltaX;
  appState.mapView.offsetY += deltaY;
  appState.mapView.lastPointerX = event.clientX;
  appState.mapView.lastPointerY = event.clientY;

  if (appState.latest) {
    drawMap(appState.latest);
  } else {
    applyMapTransform();
  }
  hideMapTooltip();
});

function stopMapDragging(event) {
  if (!appState.mapView.isDragging) {
    return;
  }

  if (event && appState.mapView.pointerId !== null && event.pointerId !== appState.mapView.pointerId) {
    return;
  }

  if (event && mapStage.hasPointerCapture(event.pointerId)) {
    mapStage.releasePointerCapture(event.pointerId);
  }

  appState.mapView.isDragging = false;
  appState.mapView.pointerId = null;
  applyMapTransform();
}

mapStage.addEventListener("pointerup", stopMapDragging);
mapStage.addEventListener("pointercancel", stopMapDragging);
mapStage.addEventListener("pointerleave", hideMapTooltip);

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
