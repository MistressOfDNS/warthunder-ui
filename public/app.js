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
      visible: [],
      clearedThrough: Number(localStorage.getItem("wt-hudmsg-cleared-through") ?? 0)
    },
    gamechat: {
      source: [],
      visible: [],
      clearedThrough: Number(localStorage.getItem("wt-gamechat-cleared-through") ?? 0)
    }
  },
  showMapLegend: false,
  showBullseye: false,
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
  measure: {
    enabled: false,
    isDrawing: false,
    pointerId: null,
    unit: "km",
    start: null,
    end: null,
    startLabel: null,
    endLabel: null
  },
  route: {
    enabled: false,
    point: null,
    label: null,
    snapped: false
  },
  selectedObjectiveId: null,
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
const mapGridLabels = document.querySelector("#map-grid-labels");
const mapEmpty = document.querySelector("#map-empty");
const mapLegend = document.querySelector("#map-legend");
const mapTooltip = document.querySelector("#map-tooltip");
const toggleMapLegendButton = document.querySelector("#toggle-map-legend");
const toggleBullseyeButton = document.querySelector("#toggle-bullseye");
const toggleMeasureButton = document.querySelector("#toggle-measure");
const toggleRouteButton = document.querySelector("#toggle-route");
const measureUnitSelect = document.querySelector("#measure-unit");
const clearMeasureButton = document.querySelector("#clear-measure");
const clearRouteButton = document.querySelector("#clear-route");
const measureOutput = document.querySelector("#measure-output");
const routeOutput = document.querySelector("#route-output");
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
const refreshInFlight = new Set();
const FAST_REFRESH_MS = 250;
const SLOW_REFRESH_MS = 3000;
const BULLSEYE_POINT = {
  x: 4.5 / 8,
  y: 1 / 8,
  label: "Bullseye"
};

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
  mapStage.dataset.measuring = String(appState.measure.enabled);
  mapStage.dataset.routing = String(appState.route.enabled);
}

function projectMapPoint(x, y, width, height) {
  return {
    x: appState.mapView.offsetX + x * width * appState.mapView.zoom,
    y: appState.mapView.offsetY + y * height * appState.mapView.zoom
  };
}

function screenToMapPoint(screenX, screenY) {
  const width = mapStage.clientWidth || 1;
  const height = mapStage.clientHeight || 1;

  return {
    x: clamp((screenX - appState.mapView.offsetX) / (width * appState.mapView.zoom), 0, 1),
    y: clamp((screenY - appState.mapView.offsetY) / (height * appState.mapView.zoom), 0, 1)
  };
}

function getMapDimensionsMeters(mapInfo) {
  const min = Array.isArray(mapInfo?.map_min) ? mapInfo.map_min : null;
  const max = Array.isArray(mapInfo?.map_max) ? mapInfo.map_max : null;
  if (
    min?.length >= 2 &&
    max?.length >= 2 &&
    Number.isFinite(min[0]) &&
    Number.isFinite(min[1]) &&
    Number.isFinite(max[0]) &&
    Number.isFinite(max[1])
  ) {
    return {
      width: Math.abs(Number(max[0]) - Number(min[0])),
      height: Math.abs(Number(max[1]) - Number(min[1]))
    };
  }

  const gridSize = Array.isArray(mapInfo?.grid_size) ? mapInfo.grid_size : null;
  if (gridSize?.length >= 2 && Number.isFinite(gridSize[0]) && Number.isFinite(gridSize[1])) {
    return {
      width: Math.abs(Number(gridSize[0])),
      height: Math.abs(Number(gridSize[1]))
    };
  }

  return null;
}

function getMapGridSize(mapInfo) {
  const gridSize = Array.isArray(mapInfo?.grid_size) ? mapInfo.grid_size : null;
  const gridSteps = Array.isArray(mapInfo?.grid_steps) ? mapInfo.grid_steps : null;
  const columns =
    gridSize?.length >= 2 && gridSteps?.length >= 2 && Number(gridSteps[0]) > 0
      ? Math.round(Math.abs(Number(gridSize[0]) / Number(gridSteps[0])))
      : 8;
  const rows =
    gridSize?.length >= 2 && gridSteps?.length >= 2 && Number(gridSteps[1]) > 0
      ? Math.round(Math.abs(Number(gridSize[1]) / Number(gridSteps[1])))
      : 8;

  return {
    columns: clamp(columns, 1, 26),
    rows: clamp(rows, 1, 26)
  };
}

function formatGridColumn(index) {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

function parseGridColumnLabel(label) {
  let value = 0;
  for (const char of String(label).toUpperCase()) {
    const code = char.charCodeAt(0);
    if (code < 65 || code > 90) {
      return null;
    }
    value = value * 26 + (code - 64);
  }
  return value - 1;
}

function getMapGridCell(point, mapInfo) {
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) {
    return null;
  }

  const { columns, rows } = getMapGridSize(mapInfo);
  return {
    column: clamp(Math.floor(point.x * columns), 0, columns - 1),
    row: clamp(Math.floor(point.y * rows), 0, rows - 1),
    columns,
    rows
  };
}

function formatMapGridCell(point, mapInfo) {
  const cell = getMapGridCell(point, mapInfo);
  return cell ? `${formatGridColumn(cell.row)}${cell.column + 1}` : "Map Point";
}

function parseObjectiveGridReference(text, mapInfo) {
  const match = String(text).match(/\b([A-Z]{1,2})\s*[-:]?\s*(\d{1,2})\b/i);
  if (!match) {
    return null;
  }

  const { columns, rows } = getMapGridSize(mapInfo);
  const row = parseGridColumnLabel(match[1]);
  const column = Number(match[2]) - 1;

  if (row === null || !Number.isInteger(column) || column < 0 || column >= columns || row < 0 || row >= rows) {
    return null;
  }

  return {
    column,
    row,
    columns,
    rows,
    label: `${formatGridColumn(row)}${column + 1}`
  };
}

function alignCanvasLine(value, lineWidth = 1) {
  return Math.round(value) + (lineWidth % 2 === 1 ? 0.5 : 0);
}

function gridLabelHtml(label, x, y) {
  return `<span class="map-grid-label" style="left:${Math.round(x)}px; top:${Math.round(y)}px">${escapeHtml(label)}</span>`;
}

function mapCalloutHtml(label, x, y, width, height, variant = "route") {
  const maxWidth = Math.min(320, width - 12);
  const calloutWidth = Math.min(maxWidth, Math.max(160, label.length * 7 + 18));
  const calloutHeight = 28;
  const calloutX = Math.round(clamp(x, 6, width - calloutWidth - 6));
  const calloutY = Math.round(clamp(y, 6, height - calloutHeight - 6));

  return `
    <span
      class="map-callout map-callout-${variant}"
      style="left:${calloutX}px; top:${calloutY}px; max-width:${maxWidth}px"
    >${escapeHtml(label)}</span>
  `;
}

function drawWarThunderGrid(context, snapshot, width, height) {
  const { columns, rows } = getMapGridSize(snapshot?.mapInfo);
  const mapLeft = appState.mapView.offsetX;
  const mapTop = appState.mapView.offsetY;
  const mapRight = mapLeft + width * appState.mapView.zoom;
  const mapBottom = mapTop + height * appState.mapView.zoom;
  const visibleLeft = Math.max(0, mapLeft);
  const visibleRight = Math.min(width, mapRight);
  const visibleTop = Math.max(0, mapTop);
  const visibleBottom = Math.min(height, mapBottom);

  if (visibleLeft >= visibleRight || visibleTop >= visibleBottom) {
    mapGridLabels.innerHTML = "";
    return;
  }

  context.save();
  const labels = [];

  for (let index = 0; index <= columns; index += 1) {
    const point = projectMapPoint(index / columns, 0, width, height);
    const isEdge = index === 0 || index === columns;
    const lineWidth = isEdge ? 2 : 1;
    const lineX = alignCanvasLine(point.x, lineWidth);
    context.strokeStyle = isEdge ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.14)";
    context.lineWidth = lineWidth;
    context.beginPath();
    context.moveTo(lineX, Math.round(mapTop));
    context.lineTo(lineX, Math.round(mapBottom));
    context.stroke();
  }

  for (let index = 0; index <= rows; index += 1) {
    const point = projectMapPoint(0, index / rows, width, height);
    const isEdge = index === 0 || index === rows;
    const lineWidth = isEdge ? 2 : 1;
    const lineY = alignCanvasLine(point.y, lineWidth);
    context.strokeStyle = isEdge ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.14)";
    context.lineWidth = lineWidth;
    context.beginPath();
    context.moveTo(Math.round(mapLeft), lineY);
    context.lineTo(Math.round(mapRight), lineY);
    context.stroke();
  }

  const labelTop = Math.round(clamp(mapTop + 18, visibleTop + 14, visibleBottom - 12));
  const labelLeft = Math.round(clamp(mapLeft + 18, visibleLeft + 14, visibleRight - 12));

  for (let index = 0; index < columns; index += 1) {
    const center = projectMapPoint((index + 0.5) / columns, 0, width, height);
    if (center.x < visibleLeft + 8 || center.x > visibleRight - 8) {
      continue;
    }
    labels.push(gridLabelHtml(String(index + 1), center.x, labelTop));
  }

  for (let index = 0; index < rows; index += 1) {
    const center = projectMapPoint(0, (index + 0.5) / rows, width, height);
    if (center.y < visibleTop + 8 || center.y > visibleBottom - 8) {
      continue;
    }
    labels.push(gridLabelHtml(formatGridColumn(index), labelLeft, center.y));
  }

  mapGridLabels.innerHTML = labels.join("");
  context.restore();
}

function getMeasurementDistanceMeters(snapshot) {
  const { start, end } = appState.measure;
  const dimensions = getMapDimensionsMeters(snapshot?.mapInfo);

  if (!start || !end || !dimensions) {
    return null;
  }

  const deltaX = (end.x - start.x) * dimensions.width;
  const deltaY = (end.y - start.y) * dimensions.height;
  return Math.hypot(deltaX, deltaY);
}

function formatDistance(meters, unit = appState.measure.unit) {
  if (!Number.isFinite(meters)) {
    return "--";
  }

  const units = {
    km: { label: "km", factor: 1000 },
    mi: { label: "mi", factor: 1609.344 },
    nm: { label: "nm", factor: 1852 }
  };
  const target = units[unit] ?? units.km;
  const value = meters / target.factor;
  const decimals = value >= 100 ? 1 : value >= 10 ? 2 : 3;
  return `${value.toFixed(decimals)} ${target.label}`;
}

function formatBearing(degrees) {
  if (!Number.isFinite(degrees)) {
    return "--";
  }
  return `${Math.round((degrees + 360) % 360)} deg`;
}

function getCurrentSpeedMetersPerSecond(snapshot) {
  const flight = snapshot?.derived?.flight ?? {};
  const speedKmh = Number.isFinite(flight.tasKmh) ? flight.tasKmh : flight.iasKmh;
  if (!Number.isFinite(speedKmh) || speedKmh <= 1) {
    return null;
  }
  return speedKmh / 3.6;
}

function getTargetEtaSeconds(distanceMeters, snapshot) {
  const speedMetersPerSecond = getCurrentSpeedMetersPerSecond(snapshot);
  if (!Number.isFinite(distanceMeters) || !speedMetersPerSecond) {
    return null;
  }
  return distanceMeters / speedMetersPerSecond;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) {
    return "--";
  }

  const roundedSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(roundedSeconds / 3600);
  const minutes = Math.floor((roundedSeconds % 3600) / 60);
  const remainingSeconds = roundedSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatTargetNavigation(distanceMeters, bearingDegrees, snapshot) {
  const rangeBearing =
    distanceMeters === null ? "Range unavailable" : `${formatDistance(distanceMeters)} / ${formatBearing(bearingDegrees)}`;
  const etaSeconds = getTargetEtaSeconds(distanceMeters, snapshot);
  return etaSeconds === null ? rangeBearing : `${rangeBearing} / ETA ${formatDuration(etaSeconds)}`;
}

function getNavigationToPoint(point, snapshot) {
  const player = getPlayerMapPoint(snapshot);
  if (!player || !point) {
    return {
      distanceMeters: null,
      bearingDegrees: null,
      label: "Range unavailable"
    };
  }

  const distanceMeters = getMapDistanceMeters(player, point, snapshot?.mapInfo);
  const bearingDegrees = getMapBearingDegrees(player, point, snapshot?.mapInfo);
  return {
    distanceMeters,
    bearingDegrees,
    label: formatTargetNavigation(distanceMeters, bearingDegrees, snapshot)
  };
}

function getMapDistanceMeters(from, to, mapInfo) {
  const dimensions = getMapDimensionsMeters(mapInfo);
  if (!from || !to || !dimensions) {
    return null;
  }

  const deltaX = (to.x - from.x) * dimensions.width;
  const deltaY = (to.y - from.y) * dimensions.height;
  return Math.hypot(deltaX, deltaY);
}

function getMapBearingDegrees(from, to, mapInfo) {
  const dimensions = getMapDimensionsMeters(mapInfo);
  if (!from || !to || !dimensions) {
    return null;
  }

  const eastMeters = (to.x - from.x) * dimensions.width;
  const northMeters = (from.y - to.y) * dimensions.height;
  return (Math.atan2(eastMeters, northMeters) * 180) / Math.PI;
}

function getPlayerMapPoint(snapshot) {
  const derivedPlayer = snapshot?.derived?.map?.player;
  if (Number.isFinite(derivedPlayer?.x) && Number.isFinite(derivedPlayer?.y)) {
    return {
      x: derivedPlayer.x,
      y: derivedPlayer.y
    };
  }

  const objects = Array.isArray(snapshot?.mapObjects) ? snapshot.mapObjects : [];
  const player = objects.find((entry) => getMarkerKind(entry) === "player");
  if (Number.isFinite(player?.x) && Number.isFinite(player?.y)) {
    return {
      x: player.x,
      y: player.y
    };
  }

  return null;
}

function updateMeasureOutput(snapshot = appState.latest) {
  toggleMeasureButton.setAttribute("aria-pressed", String(appState.measure.enabled));

  if (!appState.measure.start || !appState.measure.end) {
    measureOutput.innerHTML = `<span class="measure-output-main">${
      appState.measure.enabled ? "Click and drag on the map" : "No measurement"
    }</span><span class="measure-output-detail">&nbsp;</span>`;
    return;
  }

  const distanceMeters = getMeasurementDistanceMeters(snapshot);
  const secondaryUnits = ["km", "mi", "nm"].filter((unit) => unit !== appState.measure.unit);
  const snapLabel = escapeHtml(
    appState.measure.startLabel && appState.measure.endLabel
      ? `${appState.measure.startLabel} to ${appState.measure.endLabel}`
      : ""
  );
  const mainText =
    distanceMeters === null
      ? "Map scale unavailable"
      : `${formatDistance(distanceMeters)} (${secondaryUnits.map((unit) => formatDistance(distanceMeters, unit)).join(" / ")})`;

  measureOutput.innerHTML = `
    <span class="measure-output-main">${escapeHtml(mainText)}</span>
    <span class="measure-output-detail">${snapLabel || "&nbsp;"}</span>
  `;
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

function drawBullseye(context, x, y) {
  context.save();
  context.strokeStyle = "#ffffff";
  context.fillStyle = "rgba(255, 255, 255, 0.1)";
  context.lineWidth = 2;

  context.beginPath();
  context.arc(x, y, 15, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.beginPath();
  context.arc(x, y, 8, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.arc(x, y, 2.5, 0, Math.PI * 2);
  context.fillStyle = "#ffffff";
  context.fill();

  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(x - 22, y);
  context.lineTo(x - 16, y);
  context.moveTo(x + 16, y);
  context.lineTo(x + 22, y);
  context.moveTo(x, y - 22);
  context.lineTo(x, y - 16);
  context.moveTo(x, y + 16);
  context.lineTo(x, y + 22);
  context.stroke();
  context.restore();
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

function drawBomber(context, x, y, size) {
  context.beginPath();
  context.moveTo(x, y - size);
  context.lineTo(x + size * 0.42, y - size * 0.18);
  context.lineTo(x + size * 1.15, y - size * 0.02);
  context.lineTo(x + size * 0.45, y + size * 0.2);
  context.lineTo(x + size * 0.3, y + size);
  context.lineTo(x, y + size * 0.55);
  context.lineTo(x - size * 0.3, y + size);
  context.lineTo(x - size * 0.45, y + size * 0.2);
  context.lineTo(x - size * 1.15, y - size * 0.02);
  context.lineTo(x - size * 0.42, y - size * 0.18);
  context.closePath();
}

function drawHelicopter(context, x, y, size) {
  context.beginPath();
  context.roundRect(x - size * 0.45, y - size * 0.55, size * 0.9, size * 1.05, 3);
  context.moveTo(x + size * 0.45, y - size * 0.15);
  context.lineTo(x + size * 1.45, y - size * 0.15);
  context.moveTo(x - size * 1.4, y - size * 0.85);
  context.lineTo(x + size * 1.4, y - size * 0.85);
  context.moveTo(x, y - size * 1.25);
  context.lineTo(x, y - size * 0.55);
  context.moveTo(x - size * 0.55, y + size * 0.75);
  context.lineTo(x - size * 0.2, y + size * 1.15);
  context.moveTo(x + size * 0.55, y + size * 0.75);
  context.lineTo(x + size * 0.2, y + size * 1.15);
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
  if (icon.includes("helicopter") || icon.includes("heli")) {
    return "helicopter";
  }
  if (icon.includes("bomber")) {
    return "bomber";
  }
  if (icon.includes("assault") || icon.includes("attacker")) {
    return "assault-aircraft";
  }
  if (icon.includes("fighter")) {
    return "fighter";
  }
  if (type === "aircraft") {
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
    fighter: "Fighter",
    "assault-aircraft": "Assault Aircraft",
    bomber: "Bomber",
    helicopter: "Helicopter",
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

function getObjectiveMatchScore(objective, entry, snapshot) {
  if (!Number.isFinite(entry?.x) || !Number.isFinite(entry?.y) || getMarkerKind(entry) === "player") {
    return -Infinity;
  }

  const markerKind = getMarkerKind(entry);
  const side = classifyMapSide(entry);
  const text = objective.text.toLowerCase();
  const gridReference = parseObjectiveGridReference(objective.text, snapshot?.mapInfo);
  const entryCell = getMapGridCell(entry, snapshot?.mapInfo);
  const haystack = [entry?.icon, entry?.type, entry?.name, entry?.label, entry?.title, describeMapEntry(entry)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  let score = 0;
  const isConvoyObjective = /\b(convoy|column)\b/.test(text);
  const isBombingObjective = /\b(base|bomb(?:ing|er|ers)?|airfield|runway|strike)\b/.test(text);
  const groundUnitKinds = ["ground", "tank", "spaa"];
  const objectivePointKinds = ["bombing-point", "capture-zone", "defending-point"];
  const groundKinds = [...groundUnitKinds, ...objectivePointKinds];
  const airKinds = ["fighter", "assault-aircraft", "bomber", "helicopter", "aircraft"];

  if (gridReference && entryCell) {
    const columnDelta = Math.abs(entryCell.column - gridReference.column);
    const rowDelta = Math.abs(entryCell.row - gridReference.row);
    const gridDistance = Math.hypot(columnDelta, rowDelta);

    if (columnDelta === 0 && rowDelta === 0) {
      score += 100;
    } else {
      score += Math.max(0, 42 - gridDistance * 16);
    }
  }

  if (side === "enemy" && objective.role === "attack") {
    score += 12;
  }
  if (side === "friendly" && objective.role === "defend") {
    score += 12;
  }

  if (objective.targetType === "ground" && groundKinds.includes(markerKind)) {
    score += 8;
  }
  if (objective.targetType === "naval" && markerKind === "ship") {
    score += 8;
  }
  if (objective.targetType === "air" && airKinds.includes(markerKind)) {
    score += 8;
  }
  if (objective.targetType === "mixed" && (groundKinds.includes(markerKind) || airKinds.includes(markerKind) || markerKind === "ship")) {
    score += 5;
  }

  if (isConvoyObjective && groundUnitKinds.includes(markerKind)) {
    score += 35;
  }
  if (isConvoyObjective && markerKind === "bombing-point") {
    score -= 80;
  }
  if (isConvoyObjective && side === "enemy" && objective.role === "attack") {
    score += 12;
  }
  if (isConvoyObjective && side === "friendly" && objective.role === "defend") {
    score += 12;
  }

  if (isBombingObjective && markerKind === "bombing-point") {
    score += 18;
  }
  if (/(capture|zone|point)/.test(text) && markerKind === "capture-zone") {
    score += 6;
  }
  if (/(defend|protect|hold|secure)/.test(text) && markerKind === "defending-point") {
    score += 6;
  }
  if (/(vehicle|truck|tank|artillery|ground)/.test(text) && groundUnitKinds.includes(markerKind)) {
    score += 4;
  }
  if (/(airfield|runway)/.test(text) && markerKind === "bombing-point") {
    score += 3;
  }

  const words = text.match(/[a-z0-9]{4,}/g) ?? [];
  for (const word of words) {
    if (haystack.includes(word)) {
      score += 2;
    }
  }

  if (markerKind === "generic") {
    score -= 1;
  }

  return score;
}

function getObjectiveMapMatch(objective, snapshot) {
  const objects = Array.isArray(snapshot?.mapObjects) ? snapshot.mapObjects : [];
  const ranked = objects
    .map((entry) => ({
      entry,
      score: getObjectiveMatchScore(objective, entry, snapshot)
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);

  return ranked[0] ?? null;
}

function getSelectedObjective(snapshot) {
  if (!appState.selectedObjectiveId) {
    return null;
  }

  return getCurrentObjectives(snapshot).find((objective) => objective.id === appState.selectedObjectiveId) ?? null;
}

function drawSelectedObjective(context, snapshot, width, height) {
  const objective = getSelectedObjective(snapshot);
  const match = objective ? getObjectiveMapMatch(objective, snapshot) : null;
  if (!objective || !match) {
    return null;
  }

  const targetPoint = projectMapPoint(match.entry.x, match.entry.y, width, height);
  const player = getPlayerMapPoint(snapshot);
  const playerPoint = player ? projectMapPoint(player.x, player.y, width, height) : null;
  const distanceMeters = player ? getMapDistanceMeters(player, match.entry, snapshot?.mapInfo) : null;
  const bearingDegrees = player ? getMapBearingDegrees(player, match.entry, snapshot?.mapInfo) : null;
  const navigationLabel = formatTargetNavigation(distanceMeters, bearingDegrees, snapshot);
  const title = describeMapEntry(match.entry);

  context.save();

  if (playerPoint) {
    context.strokeStyle = "rgba(242, 211, 111, 0.86)";
    context.lineWidth = 2;
    context.setLineDash([9, 6]);
    context.beginPath();
    context.moveTo(playerPoint.x, playerPoint.y);
    context.lineTo(targetPoint.x, targetPoint.y);
    context.stroke();
    context.setLineDash([]);
  }

  context.strokeStyle = "#f2d36f";
  context.fillStyle = "rgba(242, 211, 111, 0.16)";
  context.lineWidth = 3;
  context.beginPath();
  context.arc(targetPoint.x, targetPoint.y, 18, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.beginPath();
  context.arc(targetPoint.x, targetPoint.y, 26, 0, Math.PI * 2);
  context.stroke();

  context.restore();

  mapGridLabels.insertAdjacentHTML(
    "beforeend",
    mapCalloutHtml(`${title} ${navigationLabel}`, targetPoint.x + 14, targetPoint.y - 40, width, height, "objective")
  );

  return {
    objective,
    match,
    distanceMeters,
    bearingDegrees
  };
}

function updateRouteOutput(snapshot = appState.latest) {
  toggleRouteButton.setAttribute("aria-pressed", String(appState.route.enabled));

  if (!appState.route.point) {
    routeOutput.innerHTML = `<span class="measure-output-main">${
      appState.route.enabled ? "Click a map point or marker" : "No route"
    }</span><span class="measure-output-detail">&nbsp;</span>`;
    return;
  }

  const navigation = getNavigationToPoint(appState.route.point, snapshot);
  const routeTitle = appState.route.label ?? "Route";
  routeOutput.innerHTML = `
    <span class="measure-output-main">${escapeHtml(navigation.label)}</span>
    <span class="measure-output-detail">${escapeHtml(routeTitle)}${appState.route.snapped ? " snapped" : ""}</span>
  `;
}

function drawRoutePoint(context, snapshot, width, height) {
  if (!appState.route.point) {
    updateRouteOutput(snapshot);
    return null;
  }

  const targetPoint = projectMapPoint(appState.route.point.x, appState.route.point.y, width, height);
  const player = getPlayerMapPoint(snapshot);
  const playerPoint = player ? projectMapPoint(player.x, player.y, width, height) : null;
  const navigation = getNavigationToPoint(appState.route.point, snapshot);
  const title = appState.route.label ?? formatMapGridCell(appState.route.point, snapshot?.mapInfo);

  context.save();

  if (playerPoint) {
    context.strokeStyle = "rgba(92, 191, 231, 0.88)";
    context.lineWidth = 2;
    context.setLineDash([6, 5]);
    context.beginPath();
    context.moveTo(playerPoint.x, playerPoint.y);
    context.lineTo(targetPoint.x, targetPoint.y);
    context.stroke();
    context.setLineDash([]);
  }

  context.strokeStyle = "#5cbfe7";
  context.fillStyle = "rgba(92, 191, 231, 0.17)";
  context.lineWidth = 3;
  context.beginPath();
  context.arc(targetPoint.x, targetPoint.y, 17, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.beginPath();
  context.moveTo(targetPoint.x - 8, targetPoint.y);
  context.lineTo(targetPoint.x + 8, targetPoint.y);
  context.moveTo(targetPoint.x, targetPoint.y - 8);
  context.lineTo(targetPoint.x, targetPoint.y + 8);
  context.stroke();

  context.restore();

  mapGridLabels.insertAdjacentHTML(
    "beforeend",
    mapCalloutHtml(`${title} ${navigation.label}`, targetPoint.x + 14, targetPoint.y + 14, width, height, "route")
  );

  updateRouteOutput(snapshot);

  return {
    point: appState.route.point,
    title,
    distanceMeters: navigation.distanceMeters,
    bearingDegrees: navigation.bearingDegrees,
    navigationLabel: navigation.label
  };
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
    fighter:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2 6 7 2-6 2v8l-3-2-3 2v-8l-6-2 7-2z"></path></svg>',
    "assault-aircraft":
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l3 6 6 2-5 2 1 8-5-3-5 3 1-8-5-2 6-2z"></path></svg>',
    bomber:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l3 4 7 1-6 2-1 8-3-2-3 2-1-8-6-2 7-1z"></path></svg>',
    helicopter:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="8" width="6" height="8" rx="2"></rect><path d="M6 7h12"></path><path d="M12 4v4"></path><path d="M15 11h5"></path><path d="M10 17l-2 3"></path><path d="M14 17l2 3"></path></svg>',
    aircraft:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2 6 7 2-6 2v8l-3-2-3 2v-8l-6-2 7-2z"></path></svg>',
    ship:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15h12l4-3-2 7H6z"></path><path d="M11 12V6"></path></svg>',
    tank:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="10" height="6" rx="1"></rect><path d="M11 10V7h4"></path><path d="M15 8h4"></path></svg>',
    spaa:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="8" width="12" height="12" rx="2"></rect><path d="M12 5v18"></path><path d="M5 12h14"></path></svg>',
    bullseye:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="4"></circle><path d="M12 1v5"></path><path d="M12 18v5"></path><path d="M1 12h5"></path><path d="M18 12h5"></path></svg>',
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
    { kind: "fighter", label: "Fighter" },
    { kind: "assault-aircraft", label: "Assault Aircraft" },
    { kind: "bomber", label: "Bomber" },
    { kind: "helicopter", label: "Helicopter" },
    { kind: "aircraft", label: "Generic Aircraft" },
    { kind: "ship", label: "Ship" },
    { kind: "tank", label: "Tank" },
    { kind: "spaa", label: "Air Defence" },
    { kind: "bullseye", label: "Bullseye" },
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

function drawBullseyeMarker(context, width, height) {
  const projected = projectMapPoint(BULLSEYE_POINT.x, BULLSEYE_POINT.y, width, height);
  drawBullseye(context, projected.x, projected.y);

  appState.mapHitAreas.push({
    x: projected.x,
    y: projected.y,
    mapX: BULLSEYE_POINT.x,
    mapY: BULLSEYE_POINT.y,
    radius: 24,
    label: BULLSEYE_POINT.label
  });

  mapGridLabels.insertAdjacentHTML(
    "beforeend",
    `<span class="map-bullseye-label" style="left:${Math.round(projected.x)}px; top:${Math.round(projected.y - 30)}px">${escapeHtml(
      BULLSEYE_POINT.label
    )}</span>`
  );
}

function findMapSnapArea(x, y) {
  let closest = null;
  let closestDistanceSquared = Infinity;

  for (const area of appState.mapHitAreas) {
    const dx = x - area.x;
    const dy = y - area.y;
    const snapRadius = Math.max(area.radius + 10, 22);
    const distanceSquared = dx * dx + dy * dy;

    if (distanceSquared <= snapRadius * snapRadius && distanceSquared < closestDistanceSquared) {
      closest = area;
      closestDistanceSquared = distanceSquared;
    }
  }

  return closest;
}

function getSnappedMapPoint(screenX, screenY) {
  const snapArea = findMapSnapArea(screenX, screenY);
  if (snapArea) {
    return {
      point: {
        x: snapArea.mapX,
        y: snapArea.mapY
      },
      label: snapArea.label,
      snapped: true
    };
  }

  const point = screenToMapPoint(screenX, screenY);
  return {
    point,
    label: formatMapGridCell(point, appState.latest?.mapInfo),
    snapped: false
  };
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

  if (markerKind === "fighter") {
    drawAircraft(context, x, y, 6);
    context.fill();
    context.stroke();
    context.restore();
    return;
  }

  if (markerKind === "assault-aircraft") {
    drawBomber(context, x, y, 6);
    context.fill();
    context.stroke();
    context.restore();
    return;
  }

  if (markerKind === "bomber") {
    drawBomber(context, x, y, 6.5);
    context.fill();
    context.stroke();
    context.restore();
    return;
  }

  if (markerKind === "helicopter") {
    drawHelicopter(context, x, y, 5.5);
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

function drawMeasurement(context, snapshot, width, height) {
  const { start, end } = appState.measure;
  if (!start || !end) {
    updateMeasureOutput(snapshot);
    return;
  }

  const startPoint = projectMapPoint(start.x, start.y, width, height);
  const endPoint = projectMapPoint(end.x, end.y, width, height);
  const distanceMeters = getMeasurementDistanceMeters(snapshot);
  const label = distanceMeters === null ? "Scale unavailable" : formatDistance(distanceMeters);
  const labelX = (startPoint.x + endPoint.x) / 2;
  const labelY = (startPoint.y + endPoint.y) / 2;

  context.save();
  context.strokeStyle = "#f2d36f";
  context.fillStyle = "#f2d36f";
  context.lineWidth = 2;
  context.setLineDash([8, 5]);
  context.beginPath();
  context.moveTo(startPoint.x, startPoint.y);
  context.lineTo(endPoint.x, endPoint.y);
  context.stroke();
  context.setLineDash([]);

  for (const point of [startPoint, endPoint]) {
    context.beginPath();
    context.arc(point.x, point.y, 5, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "rgba(8, 10, 12, 0.9)";
    context.lineWidth = 2;
    context.stroke();
  }

  context.font = "700 12px Inter, Segoe UI, sans-serif";
  const metrics = context.measureText(label);
  const paddingX = 8;
  const boxWidth = metrics.width + paddingX * 2;
  const boxHeight = 24;
  const boxX = clamp(labelX - boxWidth / 2, 6, width - boxWidth - 6);
  const boxY = clamp(labelY - boxHeight - 10, 6, height - boxHeight - 6);

  context.fillStyle = "rgba(9, 13, 18, 0.94)";
  context.strokeStyle = "rgba(242, 211, 111, 0.7)";
  context.lineWidth = 1;
  context.beginPath();
  context.roundRect(boxX, boxY, boxWidth, boxHeight, 6);
  context.fill();
  context.stroke();
  context.fillStyle = "#f2d36f";
  context.fillText(label, boxX + paddingX, boxY + 16);
  context.restore();

  updateMeasureOutput(snapshot);
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

  const hasNaval = /(carrier|fleet|naval|port|harbor|frigate|destroyer|cruiser|ship|boat|submarine)\b/.test(
    normalized
  );
  const hasAir = /(airfield|aircraft|bomber|fighter|helicopter|plane|jet|runway)\b/.test(normalized);
  const hasGround =
    /(tank|ground|base|column|convoy|artillery|vehicle|bunker|truck|bridge|aa|spaa|sam)\b/.test(normalized);

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
    id: `objective-${index}-${hashText(text)}`,
    index,
    text,
    primary: Boolean(objective?.primary),
    role,
    targetType,
    status,
    statusLabel: getStatusLabel(status)
  };
}

function hashText(value) {
  let hash = 0;
  for (let index = 0; index < String(value).length; index += 1) {
    hash = (hash * 31 + String(value).charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function getCurrentObjectives(snapshot) {
  const mission = snapshot?.mission;
  return Array.isArray(mission?.objectives) ? mission.objectives.map(enrichObjective) : [];
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

function renderObjectiveCard(objective, snapshot) {
  const roleMeta = missionRoleMeta[objective.role] ?? missionRoleMeta.support;
  const targetMeta = targetTypeMeta[objective.targetType] ?? targetTypeMeta.ground;
  const isSelected = appState.selectedObjectiveId === objective.id;
  const match = isSelected ? getObjectiveMapMatch(objective, snapshot) : null;
  const player = getPlayerMapPoint(snapshot);
  const distanceMeters = match?.entry && player ? getMapDistanceMeters(player, match.entry, snapshot?.mapInfo) : null;
  const bearingDegrees = match?.entry && player ? getMapBearingDegrees(player, match.entry, snapshot?.mapInfo) : null;
  const navigationLabel = formatTargetNavigation(distanceMeters, bearingDegrees, snapshot);

  return `
    <button
      class="objective-card objective-${roleMeta.accent}"
      type="button"
      data-objective-id="${escapeHtml(objective.id)}"
      aria-pressed="${String(isSelected)}"
    >
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
      ${
        isSelected
          ? `<div class="objective-selection-detail">
              <span>${match ? escapeHtml(describeMapEntry(match.entry)) : "No matching map marker"}</span>
              <strong>${
                distanceMeters === null
                  ? "Range unavailable"
                  : navigationLabel
              }</strong>
            </div>`
          : ""
      }
    </button>
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

  const objectives = getCurrentObjectives(snapshot);
  if (appState.selectedObjectiveId && !objectives.some((objective) => objective.id === appState.selectedObjectiveId)) {
    appState.selectedObjectiveId = null;
  }
  const visibleObjectives = objectives.filter((objective) => getStatusClass(objective.status) !== "is-pending");
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
        <strong>${visibleObjectives.length}</strong>
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
                  <div class="objective-card-grid">${group.items.map((objective) => renderObjectiveCard(objective, snapshot)).join("")}</div>
                </section>
              `
            )
            .join("")}</div>`
        : `<p class="empty-note">${
            objectives.length > 0
              ? "No active objective details are being reported for this sortie."
              : "War Thunder is not publishing objective details for this sortie."
          }</p>`
    }
  `;

  for (const card of missionContent.querySelectorAll("[data-objective-id]")) {
    card.addEventListener("click", () => {
      const nextId = card.dataset.objectiveId;
      appState.selectedObjectiveId = appState.selectedObjectiveId === nextId ? null : nextId;
      hideMapTooltip();
      if (appState.latest) {
        renderMission(appState.latest);
        drawMap(appState.latest);
      }
    });
  }
}

function syncFeed(feedName, incomingLines) {
  const entry = appState.feeds[feedName];
  const incoming = Array.isArray(incomingLines) ? incomingLines.map(formatFeedLine).filter(Boolean) : [];
  const visibleIncoming = incoming.slice(entry.clearedThrough);

  if (incoming.length < entry.source.length || !arraysMatchPrefix(entry.source, incoming)) {
    entry.source = [...incoming];
    entry.clearedThrough = Math.min(entry.clearedThrough, incoming.length);
    entry.visible = incoming.slice(entry.clearedThrough);
    return;
  }

  if (incoming.length > entry.source.length) {
    const appended = incoming.slice(Math.max(entry.source.length, entry.clearedThrough));
    entry.visible.push(...appended);
    entry.source = [...incoming];
    return;
  }

  entry.visible = visibleIncoming;
}

function renderFeed(target, lines, emptyText) {
  const renderKey = JSON.stringify(lines);
  if (target.dataset.renderKey === renderKey) {
    return;
  }

  if (isSelectionInside(target)) {
    target.dataset.pendingRenderKey = renderKey;
    return;
  }

  target.innerHTML =
    lines.length > 0
      ? lines
          .map((line) => `<li class="${target === hudFeed ? getHudEventClass(line) : ""}">${renderFeedLineHtml(line)}</li>`)
          .join("")
      : `<li class="empty-note">${emptyText}</li>`;
  target.dataset.renderKey = renderKey;
  delete target.dataset.pendingRenderKey;
  target.scrollTop = target.scrollHeight;
}

function isSelectionInside(target) {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return false;
  }

  const range = selection.getRangeAt(0);
  return target.contains(range.commonAncestorContainer);
}

function renderFeedLineHtml(line) {
  const prefixMatch = String(line).match(/^(\d+:\d{2}\s+)?(\[(?:Team|All|Squad|System)\])\s*/i);
  const timestamp = prefixMatch?.[1] ?? "";
  const prefix = prefixMatch?.[2] ?? "";
  const prefixHtml = prefixMatch
    ? `${escapeHtml(timestamp)}<span class="feed-prefix feed-prefix-${prefix.slice(1, -1).toLowerCase()}">${escapeHtml(
        prefix
      )}</span> `
    : "";
  const rest = prefixMatch ? String(line).slice(prefixMatch[0].length) : String(line);

  return `${prefixHtml}${renderWarThunderText(rest)}`;
}

function getHudEventClass(line) {
  const text = String(line).toLowerCase();

  if (/has achieved/.test(text)) {
    return "event-achievement";
  }
  if (/destroyed|shot down/.test(text)) {
    return "event-kill";
  }
  if (/critically damaged|severely damaged/.test(text)) {
    return "event-critical";
  }
  if (/set afire/.test(text)) {
    return "event-fire";
  }
  if (/has been wrecked/.test(text)) {
    return "event-wrecked";
  }
  if (/disconnected from the game|net_player_disconnect/.test(text)) {
    return "event-disconnect";
  }

  return "";
}

function renderWarThunderText(text) {
  const source = String(text);
  let html = "";
  let cursor = 0;
  const colorTagPattern = /<color=(#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?)>(.*?)<\/color>/gis;

  for (const match of source.matchAll(colorTagPattern)) {
    html += escapeHtml(source.slice(cursor, match.index));
    const color = normalizeWarThunderColor(match[1]);
    html += `<span class="wt-color" style="color: ${color}">${escapeHtml(match[2])}</span>`;
    cursor = match.index + match[0].length;
  }

  html += escapeHtml(source.slice(cursor));
  return html;
}

function normalizeWarThunderColor(value) {
  const hex = String(value);
  return /^#[0-9a-fA-F]{8}$/.test(hex) ? hex.slice(0, 7) : hex;
}

function formatFeedLine(line) {
  if (line === null || line === undefined) {
    return "";
  }

  if (typeof line === "string") {
    return line;
  }

  if (typeof line === "object") {
    const mode = line.mode ? `[${line.mode}] ` : "";
    const sender = line.sender ? `${line.sender}: ` : "";
    const message = line.msg ?? line.message ?? JSON.stringify(line);
    return `${mode}${sender}${message}`.trim();
  }

  return String(line);
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
  drawWarThunderGrid(context, snapshot, width, height);

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
      mapX: entry.x,
      mapY: entry.y,
      radius: getMarkerKind(entry) === "player" ? 16 : 12,
      label: describeMapEntry(entry)
    });
  });

  if (appState.showBullseye) {
    drawBullseyeMarker(context, width, height);
  }
  const selection = drawSelectedObjective(context, snapshot, width, height);
  const route = drawRoutePoint(context, snapshot, width, height);
  drawMeasurement(context, snapshot, width, height);

  mapMeta.innerHTML = `
    <span>${objects.length} objects</span>
    <span>${snapshot?.mapInfo?.valid ? "Map live" : "Map idle"}</span>
    <span>${getMapGridSize(snapshot?.mapInfo).columns}x${getMapGridSize(snapshot?.mapInfo).rows} grid</span>
    <span>${appState.mapView.zoom.toFixed(1)}x zoom</span>
    ${
      selection
        ? `<span>Selected: ${formatTargetNavigation(selection.distanceMeters, selection.bearingDegrees, snapshot)}</span>`
        : ""
    }
    ${
      route
        ? `<span>Route: ${escapeHtml(route.title)} / ${escapeHtml(route.navigationLabel)}</span>`
        : ""
    }
  `;
  mapEmpty.hidden = objects.length > 0;
  toggleBullseyeButton.setAttribute("aria-pressed", String(appState.showBullseye));
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
  if (refreshInFlight.has(scope)) {
    return;
  }

  refreshInFlight.add(scope);
  try {
    const payload = await fetchTelemetry(scope);
    appState.latest = payload.telemetry;
    updateHistory(appState.latest);
    render(appState.latest);
  } catch (error) {
    connectionDot.dataset.connected = "false";
    connectionLabel.textContent = "Telemetry unavailable";
    updatedLabel.textContent = error instanceof Error ? error.message : "Unknown error";
  } finally {
    refreshInFlight.delete(scope);
  }
}

inspectorFilter.addEventListener("input", () => {
  if (appState.latest) {
    renderInspector(appState.latest);
  }
});

clearHudFeedButton.addEventListener("click", () => {
  appState.feeds.hudmsg.clearedThrough = appState.feeds.hudmsg.source.length;
  localStorage.setItem("wt-hudmsg-cleared-through", String(appState.feeds.hudmsg.clearedThrough));
  appState.feeds.hudmsg.visible = [];
  renderFeed(hudFeed, appState.feeds.hudmsg.visible, "No HUD events yet.");
});

clearChatFeedButton.addEventListener("click", () => {
  appState.feeds.gamechat.clearedThrough = appState.feeds.gamechat.source.length;
  localStorage.setItem("wt-gamechat-cleared-through", String(appState.feeds.gamechat.clearedThrough));
  appState.feeds.gamechat.visible = [];
  renderFeed(chatFeed, appState.feeds.gamechat.visible, "No chat lines yet.");
});

document.addEventListener("selectionchange", () => {
  for (const [target, lines, emptyText] of [
    [hudFeed, appState.feeds.hudmsg.visible, "No HUD events yet."],
    [chatFeed, appState.feeds.gamechat.visible, "No chat lines yet."]
  ]) {
    if (target.dataset.pendingRenderKey && !isSelectionInside(target)) {
      renderFeed(target, lines, emptyText);
    }
  }
});

toggleMapLegendButton.addEventListener("click", () => {
  appState.showMapLegend = !appState.showMapLegend;
  renderMapLegend();
});

toggleBullseyeButton.addEventListener("click", () => {
  appState.showBullseye = !appState.showBullseye;
  toggleBullseyeButton.setAttribute("aria-pressed", String(appState.showBullseye));
  if (appState.latest) {
    drawMap(appState.latest);
  }
});

toggleMeasureButton.addEventListener("click", () => {
  appState.measure.enabled = !appState.measure.enabled;
  appState.measure.isDrawing = false;
  appState.measure.pointerId = null;
  if (appState.measure.enabled) {
    appState.route.enabled = false;
  }
  updateMeasureOutput();
  updateRouteOutput();
  applyMapTransform();
});

toggleRouteButton.addEventListener("click", () => {
  appState.route.enabled = !appState.route.enabled;
  if (appState.route.enabled) {
    appState.measure.enabled = false;
    appState.measure.isDrawing = false;
    appState.measure.pointerId = null;
  }
  updateMeasureOutput();
  updateRouteOutput();
  applyMapTransform();
});

measureUnitSelect.addEventListener("change", () => {
  appState.measure.unit = measureUnitSelect.value;
  if (appState.latest) {
    drawMap(appState.latest);
  } else {
    updateMeasureOutput();
  }
});

clearMeasureButton.addEventListener("click", () => {
  appState.measure.start = null;
  appState.measure.end = null;
  appState.measure.startLabel = null;
  appState.measure.endLabel = null;
  appState.measure.isDrawing = false;
  appState.measure.pointerId = null;
  if (appState.latest) {
    drawMap(appState.latest);
  } else {
    updateMeasureOutput();
  }
});

clearRouteButton.addEventListener("click", () => {
  appState.route.enabled = false;
  appState.route.point = null;
  appState.route.label = null;
  appState.route.snapped = false;
  if (appState.latest) {
    drawMap(appState.latest);
  } else {
    updateRouteOutput();
  }
  applyMapTransform();
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
  if (appState.route.enabled) {
    if (event.button !== 0) {
      return;
    }

    const rect = mapStage.getBoundingClientRect();
    const routeTarget = getSnappedMapPoint(event.clientX - rect.left, event.clientY - rect.top);

    event.preventDefault();
    hideMapTooltip();
    appState.route.point = routeTarget.point;
    appState.route.label = routeTarget.label;
    appState.route.snapped = routeTarget.snapped;
    appState.route.enabled = false;

    if (appState.latest) {
      drawMap(appState.latest);
    } else {
      updateRouteOutput();
    }
    applyMapTransform();
    return;
  }

  if (appState.measure.enabled) {
    if (event.button !== 0) {
      return;
    }

    const rect = mapStage.getBoundingClientRect();
    const measureStart = getSnappedMapPoint(event.clientX - rect.left, event.clientY - rect.top);

    event.preventDefault();
    hideMapTooltip();
    appState.measure.start = measureStart.point;
    appState.measure.end = measureStart.point;
    appState.measure.startLabel = measureStart.label;
    appState.measure.endLabel = measureStart.label;
    appState.measure.isDrawing = true;
    appState.measure.pointerId = event.pointerId;
    mapStage.setPointerCapture(event.pointerId);

    if (appState.latest) {
      drawMap(appState.latest);
    } else {
      updateMeasureOutput();
    }
    return;
  }

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
  if (appState.measure.isDrawing && appState.measure.pointerId === event.pointerId) {
    const rect = mapStage.getBoundingClientRect();
    const measureEnd = getSnappedMapPoint(event.clientX - rect.left, event.clientY - rect.top);
    appState.measure.end = measureEnd.point;
    appState.measure.endLabel = measureEnd.label;
    event.preventDefault();

    if (appState.latest) {
      drawMap(appState.latest);
    } else {
      updateMeasureOutput();
    }
    return;
  }

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

function stopMeasuring(event) {
  if (!appState.measure.isDrawing) {
    return false;
  }

  if (event && appState.measure.pointerId !== null && event.pointerId !== appState.measure.pointerId) {
    return true;
  }

  if (event && mapStage.hasPointerCapture(event.pointerId)) {
    mapStage.releasePointerCapture(event.pointerId);
  }

  appState.measure.isDrawing = false;
  appState.measure.pointerId = null;
  updateMeasureOutput();
  return true;
}

function stopMapDragging(event) {
  if (stopMeasuring(event)) {
    return;
  }

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
}, FAST_REFRESH_MS);
window.setInterval(() => {
  refresh("slow");
}, SLOW_REFRESH_MS);
