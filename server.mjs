import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? 3000);
const WT_BASE_URL = process.env.WT_BASE_URL ?? "http://localhost:8111";
const PUBLIC_DIR = path.join(__dirname, "public");

const ENDPOINTS = {
  fast: ["state", "indicators", "map_obj.json"],
  slow: ["mission.json", "map_info.json", "gamechat", "hudmsg"],
  full: ["state", "indicators", "mission.json", "map_info.json", "map_obj.json", "gamechat", "hudmsg"]
};

const cache = {
  state: null,
  indicators: null,
  mission: null,
  mapInfo: null,
  mapObjects: null,
  gamechat: [],
  hudmsg: [],
  updatedAt: {},
  errors: []
};

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(body);
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function readMetric(record, key) {
  if (!record || typeof record !== "object") {
    return null;
  }
  return toFiniteNumber(record[key]);
}

function titleizeKey(key) {
  return key
    .replaceAll("_", " ")
    .replaceAll(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function listKeys(record) {
  return record && typeof record === "object" ? Object.keys(record) : [];
}

function getEngineIndexes(state = {}) {
  const indexes = new Set();

  for (const key of listKeys(state)) {
    const match = key.match(/\s(\d+)(?=,|$)/);
    if (match) {
      indexes.add(Number(match[1]));
    }
  }

  return [...indexes].sort((left, right) => left - right);
}

function buildEngines(state = {}) {
  return getEngineIndexes(state)
    .map((index) => {
      const engine = {
        index,
        throttlePct: readMetric(state, `throttle ${index}, %`),
        powerHp: readMetric(state, `power ${index}, hp`),
        rpm: readMetric(state, `RPM ${index}`),
        manifoldAtm: readMetric(state, `manifold pressure ${index}, atm`),
        oilTempC: readMetric(state, `oil temp ${index}, C`),
        thrustKg: readMetric(state, `thrust ${index}, kgs`),
        efficiencyPct: readMetric(state, `efficiency ${index}, %`)
      };

      const hasAnyMetric = Object.values(engine).some(
        (value, entryIndex) => entryIndex > 0 && value !== null
      );

      return hasAnyMetric ? engine : null;
    })
    .filter(Boolean);
}

function deriveTelemetry() {
  const state = cache.state ?? {};
  const indicators = cache.indicators ?? {};
  const flight = {
    altitudeM: readMetric(state, "H, m"),
    tasKmh: readMetric(state, "TAS, km/h"),
    iasKmh: readMetric(state, "IAS, km/h"),
    mach: readMetric(state, "M"),
    climbMs: readMetric(state, "Vy, m/s"),
    aoaDeg: readMetric(state, "AoA, deg"),
    aosDeg: readMetric(state, "AoS, deg"),
    gLoad: readMetric(state, "Ny")
  };

  const currentFuelKg = readMetric(state, "Mfuel, kg");
  const maxFuelKg = readMetric(state, "Mfuel0, kg");
  const fuel = {
    currentKg: currentFuelKg,
    maxKg: maxFuelKg,
    percent:
      currentFuelKg !== null && maxFuelKg && maxFuelKg > 0
        ? (currentFuelKg / maxFuelKg) * 100
        : null
  };

  const engineList = buildEngines(state);
  const averageThrottle =
    engineList.length > 0
      ? engineList
          .map((engine) => engine.throttlePct)
          .filter((value) => value !== null)
          .reduce((total, value, _, source) => total + value / source.length, 0)
      : readMetric(indicators, "throttle");

  const controls = {
    aileronPct: readMetric(state, "aileron, %"),
    elevatorPct: readMetric(state, "elevator, %"),
    rudderPct: readMetric(state, "rudder, %"),
    flapsPct: readMetric(state, "flaps, %"),
    gearPct: readMetric(state, "gear, %"),
    airbrakePct: readMetric(state, "airbrake, %"),
    throttlePct: averageThrottle
  };

  const mapObjects = Array.isArray(cache.mapObjects) ? cache.mapObjects : [];
  const mapCounts = mapObjects.reduce((counts, entry) => {
    const type = entry?.type ?? "unknown";
    counts[type] = (counts[type] ?? 0) + 1;
    return counts;
  }, {});

  const playerMarker =
    mapObjects.find((entry) => entry?.icon === "Player") ??
    mapObjects.find((entry) => entry?.type === "aircraft");

  return {
    connection: {
      available: Boolean(
        cache.state?.valid ||
          cache.indicators?.valid ||
          cache.mapInfo?.valid ||
          cache.mission?.status
      ),
      lastUpdatedAt:
        cache.updatedAt.state ??
        cache.updatedAt.indicators ??
        cache.updatedAt["mission.json"] ??
        null
    },
    vehicle: {
      army: indicators.army ?? null,
      type: indicators.type ?? null
    },
    flight,
    fuel,
    controls,
    engines: engineList,
    map: {
      counts: mapCounts,
      player: playerMarker
        ? {
            x: toFiniteNumber(playerMarker.x),
            y: toFiniteNumber(playerMarker.y),
            dx: toFiniteNumber(playerMarker.dx),
            dy: toFiniteNumber(playerMarker.dy),
            color: playerMarker.color ?? "#FAC81E",
            type: playerMarker.type ?? "aircraft"
          }
        : null
    }
  };
}

function buildSnapshot() {
  return {
    derived: deriveTelemetry(),
    indicators: cache.indicators,
    mission: cache.mission,
    mapInfo: cache.mapInfo,
    mapObjects: cache.mapObjects,
    state: cache.state,
    feeds: {
      gamechat: cache.gamechat,
      hudmsg: cache.hudmsg
    },
    updatedAt: cache.updatedAt
  };
}

function parseLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatGameChatEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return String(entry ?? "");
  }

  const time = formatBattleTime(entry.time);
  const mode = entry.mode ? `[${entry.mode}] ` : "";
  const sender = entry.sender ? `${entry.sender}: ` : "";
  const message = entry.msg ?? entry.message ?? "";
  return [time, `${mode}${sender}${message}`.trim()].filter(Boolean).join(" ");
}

function formatHudEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return String(entry ?? "");
  }

  const rawMessage = String(entry.msg ?? entry.message ?? entry.text ?? entry.name ?? "");
  if (/td!\s*kd\?NET_PLAYER_DISCONNECT_FROM_GAME/i.test(rawMessage)) {
    return "";
  }

  const time = formatBattleTime(entry.time);
  const sender = entry.sender ? `${entry.sender} ` : "";
  const message = rawMessage;
  return [time, `${sender}${message || JSON.stringify(entry)}`.trim()].filter(Boolean).join(" ");
}

function formatBattleTime(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

function parseStructuredFeed(text, formatter) {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map(formatter).filter(Boolean);
    }
    if (parsed && typeof parsed === "object") {
      const entries = parsed.damage ?? parsed.events ?? parsed.messages ?? parsed.items ?? parsed;
      if (Array.isArray(entries)) {
        return entries.map(formatter).filter(Boolean);
      }
      return [formatter(parsed)].filter(Boolean);
    }
  } catch {
    // Fall through to line parsing for older/plain-text endpoint output.
  }

  return parseLines(text);
}

async function fetchUpstream(endpoint) {
  const upstreamPath =
    endpoint === "gamechat"
      ? "gamechat?lastId=0"
      : endpoint === "hudmsg"
        ? "hudmsg?lastEvt=0&lastDmg=0"
        : endpoint;
  const response = await fetch(`${WT_BASE_URL}/${upstreamPath}`, {
    headers: {
      Accept: endpoint === "gamechat" || endpoint === "hudmsg" ? "text/plain" : "application/json"
    }
  });

  if ((endpoint === "gamechat" || endpoint === "hudmsg") && (response.status === 400 || response.status === 204)) {
    return [];
  }

  if (!response.ok) {
    throw new Error(`Upstream ${endpoint} returned ${response.status}`);
  }

  if (endpoint === "gamechat" || endpoint === "hudmsg") {
    const text = await response.text();
    return endpoint === "gamechat"
      ? parseStructuredFeed(text, formatGameChatEntry)
      : parseStructuredFeed(text, formatHudEntry);
  }

  return response.json();
}

function writeCache(endpoint, payload) {
  if (endpoint === "mission.json") {
    cache.mission = payload;
  } else if (endpoint === "map_info.json") {
    cache.mapInfo = payload;
  } else if (endpoint === "map_obj.json") {
    cache.mapObjects = payload;
  } else if (endpoint === "gamechat") {
    cache.gamechat = payload;
  } else if (endpoint === "hudmsg") {
    cache.hudmsg = payload;
  } else {
    cache[endpoint] = payload;
  }

  cache.updatedAt[endpoint] = new Date().toISOString();
}

async function refreshTelemetry(scope = "full") {
  const endpoints = ENDPOINTS[scope] ?? ENDPOINTS.full;
  const startedAt = Date.now();
  const errors = [];

  await Promise.all(
    endpoints.map(async (endpoint) => {
      try {
        const payload = await fetchUpstream(endpoint);
        writeCache(endpoint, payload);
      } catch (error) {
        errors.push({
          endpoint,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    })
  );

  cache.errors = errors;

  return {
    ok: errors.length === 0,
    scope,
    fetchedAt: new Date().toISOString(),
    latencyMs: Date.now() - startedAt,
    errors,
    telemetry: buildSnapshot()
  };
}

async function proxyMapImage(response) {
  try {
    const upstream = await fetch(`${WT_BASE_URL}/map.img`, {
      headers: { Accept: "image/jpeg,image/*" }
    });

    if (!upstream.ok) {
      sendJson(response, upstream.status, {
        error: "Unable to fetch map image",
        status: upstream.status
      });
      return;
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Length": buffer.length,
      "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg"
    });
    response.end(buffer);
  } catch (error) {
    sendJson(response, 502, {
      error: "Map image proxy failed",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

async function serveStaticFile(requestPath, response) {
  const cleanPath = requestPath === "/" ? "/index.html" : requestPath;
  const resolvedPath = path.resolve(PUBLIC_DIR, `.${cleanPath}`);

  if (!resolvedPath.startsWith(PUBLIC_DIR)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }

  try {
    await access(resolvedPath);
    const extension = path.extname(resolvedPath);
    response.writeHead(200, {
      "Cache-Control": extension === ".html" ? "no-store" : "public, max-age=60",
      "Content-Type": MIME_TYPES[extension] ?? "application/octet-stream"
    });
    createReadStream(resolvedPath).pipe(response);
  } catch {
    sendJson(response, 404, { error: "Not found" });
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${HOST}:${PORT}`}`);

  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  if (url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      app: "warthunder-localhost-dashboard",
      now: new Date().toISOString(),
      upstream: WT_BASE_URL
    });
    return;
  }

  if (url.pathname === "/api/telemetry") {
    const scope = url.searchParams.get("scope") ?? "full";
    const payload = await refreshTelemetry(scope);
    sendJson(response, 200, payload);
    return;
  }

  if (url.pathname === "/api/map-image") {
    await proxyMapImage(response);
    return;
  }

  await serveStaticFile(url.pathname, response);
});

server.listen(PORT, HOST, () => {
  console.log(`War Thunder dashboard available at http://${HOST}:${PORT}`);
});
