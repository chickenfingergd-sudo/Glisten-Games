const storageKey = "glisten-games-settings-v1";
const favoritesKey = "glisten-games-favorites-v1";
const recentsKey = "glisten-games-recents-v1";
const proxyBookmarksKey = "glisten-games-proxy-bookmarks-v1";

const defaultSettings = {
  accent: "#7cf7ff",
  background: "prism",
  font: "system",
  glass: 18,
  glow: 72,
  sparkle: 75,
  radius: 8,
  motion: true,
  reduced: false,
  density: "balanced",
  cardStyle: "poster",
  showDetails: true,
  autoFocus: true,
  launchMode: "player",
  fullscreen: false,
  proxyHome: "",
  panicTitle: "New Tab",
  panicUrl: "https://www.google.com"
};

const presets = [
  {
    name: "Crystal Rush",
    accent: "#7cf7ff",
    background: "prism",
    glow: 72,
    swatches: ["#7cf7ff", "#f7b2ff", "#111b38"]
  },
  {
    name: "Chrome Night",
    accent: "#d7e5ff",
    background: "midnight",
    glow: 58,
    swatches: ["#d7e5ff", "#6f7cff", "#04070d"]
  },
  {
    name: "Solar Candy",
    accent: "#ffd166",
    background: "sunrise",
    glow: 74,
    swatches: ["#ffd166", "#ff7aa2", "#26455d"]
  },
  {
    name: "Circuit Mint",
    accent: "#6dffb7",
    background: "matrix",
    glow: 68,
    swatches: ["#6dffb7", "#d3ff8f", "#04110c"]
  }
];

const defaultProxyBookmarks = [
  { title: "DuckDuckGo", url: "https://lite.duckduckgo.com/lite/" },
  { title: "Wikipedia", url: "https://www.wikipedia.org" },
  { title: "Coolmath", url: "https://www.coolmathgames.com" }
];

const state = {
  games: [],
  view: "library",
  switchingView: false,
  sort: "name",
  query: "",
  activeGame: null,
  settings: loadJson(storageKey, defaultSettings),
  favorites: loadJson(favoritesKey, []),
  recents: loadJson(recentsKey, []),
  proxyConnection: null,
  proxyReady: null,
  proxyTransportReady: false,
  proxySmokeOk: false,
  proxyTabs: [],
  activeProxyTabId: "",
  proxyTabSeq: 0,
  proxyBookmarks: loadJson(proxyBookmarksKey, defaultProxyBookmarks),
  proxyLoadId: 0
};

const viewOrder = ["library", "favorites", "recent", "proxy", "settings"];
const tabAnimationMs = 540;
const proxyResumeKey = "glisten-games-proxy-resume";
const proxyReloadKey = "glisten-games-proxy-worker-refresh";
const proxySmokeTestUrl = "https://example.com/";

const $ = (selector) => document.querySelector(selector);
const els = {
  body: document.body,
  canvas: $("#sparkCanvas"),
  scanStatus: $("#scanStatus"),
  viewTitle: $("#viewTitle"),
  searchInput: $("#searchInput"),
  refreshBtn: $("#refreshBtn"),
  panicBtn: $("#panicBtn"),
  gameGrid: $("#gameGrid"),
  favoritesGrid: $("#favoritesGrid"),
  recentGrid: $("#recentGrid"),
  emptyState: $("#emptyState"),
  favoritesEmpty: $("#favoritesEmpty"),
  recentEmpty: $("#recentEmpty"),
  gameCount: $("#gameCount"),
  favoriteCount: $("#favoriteCount"),
  recentCount: $("#recentCount"),
  launchMode: $("#launchMode"),
  playerDialog: $("#playerDialog"),
  playerShell: $("#playerShell"),
  playerTitle: $("#playerTitle"),
  gameFrame: $("#gameFrame"),
  closePlayer: $("#closePlayer"),
  favoritePlaying: $("#favoritePlaying"),
  openExternal: $("#openExternal"),
  fullscreenBtn: $("#fullscreenBtn"),
  presetGrid: $("#presetGrid"),
  proxyForm: $("#proxyForm"),
  proxyInput: $("#proxyInput"),
  proxyFrame: $("#proxyFrame"),
  proxyFrameStack: $("#proxyFrameStack"),
  proxyTabs: $("#proxyTabs"),
  proxyNewTab: $("#proxyNewTab"),
  proxyBack: $("#proxyBack"),
  proxyForward: $("#proxyForward"),
  proxyReload: $("#proxyReload"),
  proxyBookmark: $("#proxyBookmark"),
  proxyBookmarks: $("#proxyBookmarks"),
  proxyEmpty: $("#proxyEmpty"),
  proxyStatus: $("#proxyStatus"),
  proxyEngine: $("#proxyEngineTop"),
  proxyOpen: $("#proxyOpenTop"),
  proxyHome: $("#proxyHomeTop")
};

function loadJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((char) => char + char).join("") : value;
  const number = parseInt(full, 16);
  return `${(number >> 16) & 255}, ${(number >> 8) & 255}, ${number & 255}`;
}

function applySettings() {
  const settings = state.settings;
  document.documentElement.style.setProperty("--accent", settings.accent);
  document.documentElement.style.setProperty("--accent-rgb", hexToRgb(settings.accent));
  document.documentElement.style.setProperty("--glass", `${settings.glass}px`);
  document.documentElement.style.setProperty("--glow", settings.glow / 100);
  document.documentElement.style.setProperty("--radius", `${settings.radius}px`);

  els.body.classList.toggle("bg-midnight", settings.background === "midnight");
  els.body.classList.toggle("bg-sunrise", settings.background === "sunrise");
  els.body.classList.toggle("bg-matrix", settings.background === "matrix");
  els.body.classList.toggle("font-rounded", settings.font === "rounded");
  els.body.classList.toggle("font-mono", settings.font === "mono");
  els.body.classList.toggle("motion-on", settings.motion);
  els.body.classList.toggle("reduce-motion", settings.reduced);
  els.body.classList.toggle("density-roomy", settings.density === "roomy");
  els.body.classList.toggle("density-compact", settings.density === "compact");
  els.body.classList.toggle("card-minimal", settings.cardStyle === "minimal");
  els.body.classList.toggle("card-neon", settings.cardStyle === "neon");
  els.body.classList.toggle("hide-details", !settings.showDetails);
  document.title = "Glisten Games";
}

function syncSettingsControls() {
  $("#accentColor").value = state.settings.accent;
  $("#backgroundSelect").value = state.settings.background;
  $("#fontSelect").value = state.settings.font;
  $("#glassRange").value = state.settings.glass;
  $("#glowRange").value = state.settings.glow;
  $("#sparkleRange").value = state.settings.sparkle;
  $("#radiusRange").value = state.settings.radius;
  $("#motionToggle").checked = state.settings.motion;
  $("#reducedToggle").checked = state.settings.reduced;
  $("#densitySelect").value = state.settings.density;
  $("#cardStyleSelect").value = state.settings.cardStyle;
  $("#detailsToggle").checked = state.settings.showDetails;
  $("#autoFocusToggle").checked = state.settings.autoFocus;
  $("#fullscreenToggle").checked = state.settings.fullscreen;
  $("#panicTitle").value = state.settings.panicTitle;
  $("#panicUrl").value = state.settings.panicUrl;
  els.launchMode.value = state.settings.launchMode;
  highlightPreset();
}

function updateSetting(key, value) {
  state.settings[key] = value;
  saveJson(storageKey, state.settings);
  applySettings();
  syncSettingsControls();
  drawSparkles();
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

function filteredGames(source = state.games) {
  const query = state.query.trim().toLowerCase();
  const filtered = source.filter((game) => !query || game.title.toLowerCase().includes(query) || game.file.toLowerCase().includes(query));
  return filtered.sort((a, b) => {
    if (state.sort === "updated") return new Date(b.updated) - new Date(a.updated);
    if (state.sort === "size") return b.size - a.size;
    return a.title.localeCompare(b.title);
  });
}

function gameCard(game) {
  const isFavorite = state.favorites.includes(game.file);
  const template = document.createElement("article");
  template.className = "game-card";
  template.innerHTML = `
    <div class="game-topline">
      <div class="game-badge">${game.title.slice(0, 1)}</div>
      <button class="favorite-btn ${isFavorite ? "active" : ""}" title="Favorite ${escapeHtml(game.title)}" aria-label="Favorite ${escapeHtml(game.title)}">★</button>
    </div>
    <h3 class="game-title">${escapeHtml(game.title)}</h3>
    <div class="game-meta">
      <span class="pill">${escapeHtml(formatSize(game.size))}</span>
      <span class="pill">${escapeHtml(formatDate(game.updated))}</span>
      <span class="pill">HTML</span>
    </div>
    <button class="play-btn">Play</button>
  `;

  template.querySelector(".favorite-btn").addEventListener("click", (event) => {
    event.stopPropagation();
    toggleFavorite(game.file);
  });
  template.querySelector(".play-btn").addEventListener("click", () => launchGame(game));
  template.addEventListener("dblclick", () => launchGame(game));
  return template;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function renderGrid(container, games, emptyElement) {
  container.innerHTML = "";
  const list = filteredGames(games);
  list.forEach((game) => container.appendChild(gameCard(game)));
  emptyElement.hidden = list.length > 0;
}

function render() {
  const favoriteGames = state.favorites.map((file) => state.games.find((game) => game.file === file)).filter(Boolean);
  const recentGames = state.recents.map((file) => state.games.find((game) => game.file === file)).filter(Boolean);

  renderGrid(els.gameGrid, state.games, els.emptyState);
  renderGrid(els.favoritesGrid, favoriteGames, els.favoritesEmpty);
  renderGrid(els.recentGrid, recentGames, els.recentEmpty);

  els.gameCount.textContent = state.games.length;
  els.favoriteCount.textContent = favoriteGames.length;
  els.recentCount.textContent = recentGames.length;
  els.favoritePlaying.classList.toggle("active", state.activeGame && state.favorites.includes(state.activeGame.file));
}

async function loadGames() {
  els.scanStatus.textContent = "Scanning games folder";
  try {
    const response = await fetch("/api/games", { cache: "no-store" });
    if (!response.ok) throw new Error("No game API");
    const data = await response.json();
    state.games = data.games || [];
    els.scanStatus.textContent = `${state.games.length} games ready`;
  } catch {
    try {
      const response = await fetch("games/manifest.json", { cache: "no-store" });
      if (!response.ok) throw new Error("No static manifest");
      const data = await response.json();
      state.games = data.games || [];
      els.scanStatus.textContent = `${state.games.length} games ready`;
    } catch {
      state.games = fallbackGames();
      els.scanStatus.textContent = "Demo mode";
    }
  }
  render();
}

function fallbackGames() {
  return [
    {
      id: "sample-spark-runner",
      title: "Sample Spark Runner",
      file: "sample-spark-runner.html",
      url: "games/sample-spark-runner.html",
      size: 4200,
      updated: new Date().toISOString()
    }
  ];
}

function toggleFavorite(file) {
  state.favorites = state.favorites.includes(file)
    ? state.favorites.filter((item) => item !== file)
    : [file, ...state.favorites];
  saveJson(favoritesKey, state.favorites);
  render();
}

function rememberRecent(file) {
  state.recents = [file, ...state.recents.filter((item) => item !== file)].slice(0, 24);
  saveJson(recentsKey, state.recents);
}

function launchGame(game) {
  rememberRecent(game.file);
  state.activeGame = game;
  render();

  if (state.settings.launchMode === "new-tab") {
    window.open(game.url, "_blank", "noopener,noreferrer");
    return;
  }

  els.playerTitle.textContent = game.title;
  els.gameFrame.src = game.url;
  if (!els.playerDialog.open) els.playerDialog.showModal();
  if (state.settings.autoFocus) {
    els.gameFrame.addEventListener("load", () => els.gameFrame.focus(), { once: true });
  }
  if (state.settings.fullscreen) openPlayerFullscreen();
}

function closePlayer() {
  els.playerDialog.classList.remove("fullscreen-fallback");
  els.gameFrame.src = "about:blank";
  els.playerDialog.close();
}

async function requestFullscreen(element) {
  if (!element || document.fullscreenElement) return false;

  const request =
    element.requestFullscreen ||
    element.webkitRequestFullscreen ||
    element.msRequestFullscreen;

  if (!request) return false;

  try {
    await request.call(element);
    return true;
  } catch {
    return false;
  }
}

async function openPlayerFullscreen() {
  if (els.playerDialog.classList.contains("fullscreen-fallback")) {
    els.playerDialog.classList.remove("fullscreen-fallback");
    return;
  }

  if (document.fullscreenElement) {
    const exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
    if (exit) exit.call(document);
    return;
  }

  const openedFrame = await requestFullscreen(els.gameFrame);
  const openedShell = openedFrame ? true : await requestFullscreen(els.playerShell);
  if (!openedShell) els.playerDialog.classList.add("fullscreen-fallback");
}

function updateNavHighlight() {
  const active = document.querySelector(".nav-item.active");
  const nav = document.querySelector(".nav-list");
  if (!active || !nav) return;

  const navBox = nav.getBoundingClientRect();
  const activeBox = active.getBoundingClientRect();
  nav.style.setProperty("--nav-x", `${activeBox.left - navBox.left}px`);
  nav.style.setProperty("--nav-y", `${activeBox.top - navBox.top}px`);
  nav.style.setProperty("--nav-w", `${activeBox.width}px`);
  nav.style.setProperty("--nav-h", `${activeBox.height}px`);
}

function switchView(view) {
  if (view === state.view || state.switchingView) return;
  const previousView = state.view;
  const previousElement = document.querySelector(".view.active");
  const nextElement = document.querySelector(`#${view}View`);
  if (!nextElement) return;

  const direction = viewOrder.indexOf(view) >= viewOrder.indexOf(previousView) ? "forward" : "back";
  els.body.classList.toggle("tab-back", direction === "back");
  els.body.classList.toggle("tab-forward", direction === "forward");

  state.switchingView = true;
  state.view = view;
  if (previousElement) {
    previousElement.classList.add("exiting");
    previousElement.classList.remove("active");
  }
  nextElement.classList.add("active");

  document.querySelectorAll(".nav-item").forEach((element) => element.classList.toggle("active", element.dataset.view === view));
  updateNavHighlight();
  els.viewTitle.textContent = view.charAt(0).toUpperCase() + view.slice(1);

  window.setTimeout(() => {
    if (previousElement) previousElement.classList.remove("exiting");
    state.switchingView = false;
  }, tabAnimationMs);
}

function renderPresets() {
  els.presetGrid.innerHTML = "";
  presets.forEach((preset) => {
    const button = document.createElement("button");
    button.className = "preset-btn";
    button.innerHTML = `
      <div class="swatches">${preset.swatches.map((color) => `<span style="background:${color}"></span>`).join("")}</div>
      <strong>${preset.name}</strong>
    `;
    button.addEventListener("click", () => {
      state.settings.accent = preset.accent;
      state.settings.background = preset.background;
      state.settings.glow = preset.glow;
      saveJson(storageKey, state.settings);
      applySettings();
      syncSettingsControls();
      drawSparkles();
    });
    els.presetGrid.appendChild(button);
  });
  highlightPreset();
}

function highlightPreset() {
  const buttons = [...document.querySelectorAll(".preset-btn")];
  buttons.forEach((button, index) => {
    const preset = presets[index];
    button.classList.toggle("active", preset.accent === state.settings.accent && preset.background === state.settings.background);
  });
}

function activatePanic() {
  const url = state.settings.panicUrl.trim();
  if (url) {
    window.location.href = url;
    return;
  }
  document.body.innerHTML = `<main class="panic-screen"><button>Continue</button></main>`;
}

function normalizeProxyInput(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(trimmed)) return `https://${trimmed}`;
  return `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(trimmed)}`;
}

function loadScript(src) {
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.defer = true;
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener("error", () => reject(new Error(`Could not load ${src}`)), { once: true });
    document.head.appendChild(script);
  });
}

async function waitForProxyWorker(registration) {
  if (registration.active?.state === "activated") return;

  const worker = registration.installing || registration.waiting;
  if (!worker) return;

  await new Promise((resolve) => {
    if (worker.state === "activated") {
      resolve();
      return;
    }

    worker.addEventListener("statechange", () => {
      if (worker.state === "activated") resolve();
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function reloadForProxyWorker(target) {
  sessionStorage.setItem(proxyReloadKey, target || "pending");
  if (target) sessionStorage.setItem(proxyResumeKey, target);
  window.location.reload();
}

async function waitForProxyController(target) {
  if (navigator.serviceWorker.controller) return;

  const controlled = await new Promise((resolve) => {
    const timeout = window.setTimeout(() => resolve(false), 4500);
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => {
        window.clearTimeout(timeout);
        resolve(true);
      },
      { once: true }
    );
  });

  if (controlled || navigator.serviceWorker.controller) return;

  if (sessionStorage.getItem(proxyReloadKey) !== target) {
    reloadForProxyWorker(target);
    throw new Error("Refreshing the page once so the real proxy engine can attach.");
  }

  throw new Error("The real proxy worker did not attach. Try reloading the website once.");
}

function proxyWispUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/wisp/`;
}

function normalizeBareHeaders(headers) {
  if (!headers) return [];
  if (Array.isArray(headers)) return headers;
  if (headers instanceof Headers) return [...headers.entries()];

  return Object.entries(headers).flatMap(([key, value]) => {
    if (Array.isArray(value)) return value.map((item) => [key, String(item)]);
    return [[key, String(value)]];
  });
}

function createEpoxyBareMuxTransport() {
  const EpoxyTransport = window.EpoxyTransport.default || window.EpoxyTransport;
  const epoxy = new EpoxyTransport({
    wisp: proxyWispUrl(),
    wisp_v2: false
  });

  return {
    get ready() {
      return epoxy.ready;
    },
    init() {
      return epoxy.init();
    },
    meta() {
      return epoxy.meta?.();
    },
    request(remote, method, body, headers, signal) {
      return epoxy.request(remote, method, body, normalizeBareHeaders(headers), signal);
    },
    connect(url, protocols, requestHeaders, onopen, onmessage, onclose, onerror) {
      return epoxy.connect(url, protocols, normalizeBareHeaders(requestHeaders), onopen, onmessage, onclose, onerror);
    }
  };
}

async function ensureProxyEngine() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("This browser does not support the proxy service worker.");
  }

  if (!state.proxyReady) {
    state.proxyReady = (async () => {
      await loadScript("/uv/uv.bundle.js");
      await loadScript("/uv/uv.config.js");
      await loadScript("/baremux/index.js");
      await loadScript("/epoxy/index.js");

      if (!window.__uv$config || !window.Ultraviolet || !window.BareMux || !window.EpoxyTransport) {
        throw new Error("The real proxy engine did not load. Restart the website after npm install.");
      }

      const oldRegistration = await navigator.serviceWorker.getRegistration("/uv/");
      if (oldRegistration) await oldRegistration.unregister();

      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none"
      });
      await registration.update().catch(() => {});
      await waitForProxyWorker(registration);
      await waitForProxyController(state.settings.proxyHome);

      if (!state.proxyConnection) {
        state.proxyConnection = new BareMux.BareMuxConnection("/baremux/worker.js");
      }
    })();
  }

  await state.proxyReady;
  if (!state.proxyTransportReady) {
    await state.proxyConnection.setRemoteTransport(createEpoxyBareMuxTransport(), `Epoxy-${Date.now()}`);
    state.proxyTransportReady = true;
  }
  if (!state.proxySmokeOk) {
    await proxyEngineSmokeTest();
    state.proxySmokeOk = true;
  }
  sessionStorage.removeItem(proxyReloadKey);
}

function proxyEngineUrlFor(value) {
  const normalized = normalizeProxyInput(value);
  return normalized ? `${window.__uv$config.prefix}${window.__uv$config.encodeUrl(normalized)}` : "";
}

async function proxyEngineSmokeTest() {
  if (!navigator.serviceWorker.controller) {
    throw new Error("The proxy worker is not attached to this tab yet.");
  }

  const testUrl = `${window.__uv$config.prefix}${window.__uv$config.encodeUrl(proxySmokeTestUrl)}`;
  const response = await fetch(testUrl, { cache: "no-store" });
  const text = await response.text();

  if (!response.ok || !text.toLowerCase().includes("example domain")) {
    const detail = text.replace(/\s+/g, " ").trim().slice(0, 160) || "blank response";
    throw new Error(`The main proxy engine test returned ${response.status}: ${detail}`);
  }
}

function proxyFallbackUrlFor(value) {
  const normalized = normalizeProxyInput(value);
  return normalized ? `/api/proxy?url=${encodeURIComponent(normalized)}` : "";
}

function proxyNotice(title, message) {
  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <style>
          body{display:grid;min-height:100vh;margin:0;place-items:center;background:#061018;color:#f7fbff;font-family:system-ui,sans-serif}
          main{max-width:560px;padding:28px;text-align:center}
          strong{display:block;margin-bottom:8px;font-size:24px}
          span{color:rgba(247,251,255,.68);line-height:1.55}
        </style>
      </head>
      <body><main><strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span></main></body>
    </html>`;
}

function proxyTabTitleFor(url) {
  if (!url) return "New tab";
  try {
    const hostname = new URL(url).hostname.replace(/^www\./i, "");
    return hostname.split(".")[0].replace(/^\w/, (letter) => letter.toUpperCase()) || "Web tab";
  } catch {
    return "Web tab";
  }
}

function activeProxyTab() {
  return state.proxyTabs.find((tab) => tab.id === state.activeProxyTabId) || state.proxyTabs[0];
}

function setProxyTabStatus(tab, status) {
  tab.status = status;
  if (tab.id === state.activeProxyTabId) {
    els.proxyStatus.textContent = status;
  }
  renderProxyTabs();
}

function saveProxyBookmarks() {
  saveJson(proxyBookmarksKey, state.proxyBookmarks);
}

function isProxyBookmarked(url) {
  return Boolean(url && state.proxyBookmarks.some((bookmark) => bookmark.url === url));
}

function syncProxyBookmarkStar() {
  const tab = activeProxyTab();
  const bookmarked = isProxyBookmarked(tab?.url);
  els.proxyBookmark.classList.toggle("active", bookmarked);
  els.proxyBookmark.textContent = bookmarked ? "★" : "☆";
}

function renderProxyBookmarks() {
  els.proxyBookmarks.innerHTML = "";
  state.proxyBookmarks.forEach((bookmark) => {
    const item = document.createElement("button");
    item.className = "proxy-bookmark";
    item.type = "button";
    item.title = bookmark.url;
    item.innerHTML = `
      <span class="proxy-bookmark-icon">${escapeHtml(bookmark.title.slice(0, 1).toUpperCase())}</span>
      <span class="proxy-bookmark-title">${escapeHtml(bookmark.title)}</span>
      <span class="proxy-bookmark-remove" title="Remove bookmark" aria-label="Remove bookmark">×</span>
    `;
    item.addEventListener("click", (event) => {
      if (event.target.closest(".proxy-bookmark-remove")) {
        state.proxyBookmarks = state.proxyBookmarks.filter((saved) => saved.url !== bookmark.url);
        saveProxyBookmarks();
        renderProxyBookmarks();
        syncProxyBookmarkStar();
        return;
      }
      loadProxy(bookmark.url, "media");
    });
    els.proxyBookmarks.appendChild(item);
  });
}

function toggleProxyBookmark() {
  const tab = activeProxyTab();
  const normalized = normalizeProxyInput(tab?.url || els.proxyInput.value);
  if (!normalized) return;

  if (isProxyBookmarked(normalized)) {
    state.proxyBookmarks = state.proxyBookmarks.filter((bookmark) => bookmark.url !== normalized);
  } else {
    const title = tab?.title && tab.title !== "New tab" ? tab.title : proxyTabTitleFor(normalized);
    state.proxyBookmarks.push({ title, url: normalized });
  }

  saveProxyBookmarks();
  renderProxyBookmarks();
  syncProxyBookmarkStar();
}

function createProxyFrame(tabId) {
  const frame = document.createElement("iframe");
  frame.className = "proxy-frame";
  frame.title = "Proxy viewer";
  frame.dataset.proxyTabId = tabId;
  frame.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-read; clipboard-write";
  frame.sandbox = "allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-pointer-lock allow-downloads allow-modals allow-presentation allow-top-navigation-by-user-activation";
  els.proxyFrameStack.appendChild(frame);
  return frame;
}

function renderProxyTabs() {
  els.proxyTabs.innerHTML = "";
  state.proxyTabs.forEach((tab) => {
    const button = document.createElement("button");
    button.className = `proxy-tab ${tab.id === state.activeProxyTabId ? "active" : ""}`;
    button.type = "button";
    button.title = tab.url || "New proxy tab";
    button.dataset.proxyTabId = tab.id;
    button.innerHTML = `
      <span class="proxy-tab-title">${escapeHtml(tab.title)}</span>
      <span class="proxy-tab-close" title="Close tab" aria-label="Close tab">×</span>
    `;
    button.addEventListener("click", (event) => {
      if (event.target.closest(".proxy-tab-close")) {
        closeProxyTab(tab.id);
        return;
      }
      switchProxyTab(tab.id);
    });
    els.proxyTabs.appendChild(button);
  });
}

function syncProxyUiFromActiveTab() {
  const tab = activeProxyTab();
  if (!tab) return;

  els.proxyFrame = tab.frame;
  state.proxyTabs.forEach((item) => item.frame.classList.toggle("active", item.id === tab.id));
  els.proxyInput.value = tab.url || "";
  els.proxyStatus.textContent = tab.status || "Ready";
  els.proxyEmpty.hidden = Boolean(tab.url || tab.frame.getAttribute("src") || tab.frame.getAttribute("srcdoc"));
  renderProxyTabs();
  syncProxyBookmarkStar();
}

function switchProxyTab(id) {
  state.activeProxyTabId = id;
  syncProxyUiFromActiveTab();
}

function createProxyTab({ activate = true } = {}) {
  const id = `proxy-tab-${++state.proxyTabSeq}`;
  const frame = state.proxyTabs.length ? createProxyFrame(id) : els.proxyFrame;
  frame.dataset.proxyTabId = id;
  setupProxyFrame(frame);

  const tab = {
    id,
    title: "New tab",
    url: "",
    status: "Ready",
    mode: "",
    frame
  };

  state.proxyTabs.push(tab);
  if (activate || !state.activeProxyTabId) state.activeProxyTabId = id;
  syncProxyUiFromActiveTab();
  return tab;
}

function closeProxyTab(id) {
  if (state.proxyTabs.length === 1) {
    clearProxy();
    return;
  }

  const index = state.proxyTabs.findIndex((tab) => tab.id === id);
  if (index === -1) return;

  const [tab] = state.proxyTabs.splice(index, 1);
  tab.frame.remove();
  if (state.activeProxyTabId === id) {
    const next = state.proxyTabs[Math.max(0, index - 1)] || state.proxyTabs[0];
    state.activeProxyTabId = next.id;
  }
  syncProxyUiFromActiveTab();
}

function initProxyTabs() {
  createProxyTab({ activate: true });
}

function proxyHistoryAction(action) {
  const tab = activeProxyTab();
  if (!tab) return;
  try {
    tab.frame.contentWindow.history[action]();
  } catch {
    // Cross-origin frames can reject history access; ignore quietly.
  }
}

function reloadProxyTab() {
  const tab = activeProxyTab();
  if (!tab) return;
  if (tab.frame.getAttribute("src")) {
    try {
      tab.frame.contentWindow.location.reload();
      return;
    } catch {
      tab.frame.src = tab.frame.src;
      return;
    }
  }
  if (tab.url) loadProxy(tab.url, tab.mode === "engine" ? "engine" : "media");
}

async function loadProxy(value, mode = "media") {
  const normalized = normalizeProxyInput(value);
  if (!normalized) return;
  const loadId = Date.now();
  state.proxyLoadId = loadId;
  const tab = activeProxyTab() || createProxyTab();
  const frame = tab.frame;

  state.settings.proxyHome = normalized;
  saveJson(storageKey, state.settings);
  tab.url = normalized;
  tab.title = proxyTabTitleFor(normalized);
  tab.mode = mode === "engine" ? "engine" : "fallback";
  tab.status = mode === "engine" ? "Starting" : "Media";
  els.proxyInput.value = normalized;
  els.proxyEmpty.hidden = true;
  frame.dataset.proxyOk = "loading";
  frame.dataset.proxyMode = tab.mode;
  frame.dataset.proxyTarget = normalized;
  frame.removeAttribute("srcdoc");
  renderProxyTabs();
  syncProxyBookmarkStar();

  if (mode !== "engine") {
    setProxyTabStatus(tab, "Media");
    frame.src = proxyFallbackUrlFor(normalized);
    return;
  }

  setProxyTabStatus(tab, "Starting");
  frame.srcdoc = proxyNotice("Starting live engine...", "Loading Ultraviolet, BareMux, Epoxy, and Wisp.");

  try {
    await ensureProxyEngine();
    if (state.proxyLoadId !== loadId) return;
    setProxyTabStatus(tab, "Loading");
    frame.dataset.proxyOk = "loading";
    frame.removeAttribute("srcdoc");
    frame.src = proxyEngineUrlFor(normalized);
  } catch (error) {
    if (state.proxyLoadId !== loadId) return;
    state.proxyReady = null;
    state.proxyTransportReady = false;
    state.proxySmokeOk = false;
    frame.dataset.proxyOk = "false";
    setProxyTabStatus(tab, "Needs engine");
    frame.srcdoc = proxyNotice("Proxy engine could not start.", error.message);
  }
}

function clearProxy() {
  const tab = activeProxyTab();
  if (!tab) return;
  const frame = tab.frame;
  state.proxyLoadId += 1;
  frame.removeAttribute("src");
  frame.removeAttribute("srcdoc");
  frame.dataset.proxyOk = "false";
  frame.dataset.proxyMode = "";
  frame.dataset.proxyTarget = "";
  tab.url = "";
  tab.title = "New tab";
  tab.mode = "";
  tab.status = "Ready";
  els.proxyInput.value = "";
  els.proxyEmpty.hidden = false;
  setProxyTabStatus(tab, "Ready");
}

function readProxyFrameText(frame = els.proxyFrame) {
  try {
    return frame.contentDocument?.body?.innerText || "";
  } catch {
    return "";
  }
}

function readProxyFrameHealth(frame = els.proxyFrame) {
  try {
    const doc = frame.contentDocument;
    const body = doc?.body;
    return {
      text: body?.innerText || "",
      title: doc?.title || "",
      elementCount: body ? body.querySelectorAll("a,img,video,audio,canvas,iframe,form,input,button,main,article,section,div,p,h1,h2,h3").length : 0,
      imageCount: doc ? doc.images.length : 0,
      readyState: doc?.readyState || ""
    };
  } catch {
    return {
      text: "",
      title: "",
      elementCount: 0,
      imageCount: 0,
      readyState: ""
    };
  }
}

function proxyFrameLooksBroken(health) {
  const text = typeof health === "string" ? health : health.text;
  const normalized = text.toLowerCase();
  const hasVisibleStructure = typeof health === "object" && (health.elementCount > 0 || health.imageCount > 0 || health.title.trim());
  return (
    (!normalized.trim() && !hasVisibleStructure) ||
    normalized.includes("error processing your request") ||
    normalized.includes("internal server error") ||
    normalized.includes("there are no bare clients") ||
    normalized.includes("no baretransport was set") ||
    normalized.includes("proxy worker is not attached") ||
    normalized.includes("err_blocked_by_response") ||
    normalized.trim() === "not found"
  );
}

function useProxyFallback(frame = els.proxyFrame) {
  const target = frame.dataset.proxyTarget;
  if (!target || frame.dataset.proxyMode === "fallback") return false;

  const fallbackUrl = proxyFallbackUrlFor(target);
  if (!fallbackUrl) return false;

  const tab = state.proxyTabs.find((item) => item.frame === frame);
  frame.dataset.proxyMode = "fallback";
  frame.dataset.proxyOk = "loading";
  if (tab) {
    tab.mode = "fallback";
    setProxyTabStatus(tab, "Media");
  }
  frame.src = fallbackUrl;
  return true;
}

function setupProxyFrame(frame) {
  if (frame.dataset.listenerReady) return;
  frame.dataset.listenerReady = "true";
  frame.addEventListener("load", () => {
    if (frame.dataset.proxyOk === "loading") {
      window.setTimeout(async () => {
        let health = readProxyFrameHealth(frame);
        if (frame.dataset.proxyMode === "engine" && proxyFrameLooksBroken(health)) {
          await sleep(2200);
          health = readProxyFrameHealth(frame);
        }

        if (proxyFrameLooksBroken(health)) {
          if (frame.dataset.proxyMode === "engine") {
            if (useProxyFallback(frame)) return;
          }

          if (useProxyFallback(frame)) return;
        }

        const tab = state.proxyTabs.find((item) => item.frame === frame);
        frame.dataset.proxyOk = "true";
        if (tab) setProxyTabStatus(tab, frame.dataset.proxyMode === "fallback" ? "Media" : "Live");
      }, frame.dataset.proxyMode === "engine" ? 900 : 250);
    }
  });
}

function bindEvents() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  document.querySelectorAll(".segment").forEach((button) => {
    button.addEventListener("click", () => {
      state.sort = button.dataset.sort;
      document.querySelectorAll(".segment").forEach((item) => item.classList.toggle("active", item === button));
      render();
    });
  });

  els.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value;
    render();
  });
  els.refreshBtn.addEventListener("click", loadGames);
  els.panicBtn.addEventListener("click", activatePanic);
  els.closePlayer.addEventListener("click", closePlayer);
  els.playerDialog.addEventListener("cancel", closePlayer);
  els.favoritePlaying.addEventListener("click", () => state.activeGame && toggleFavorite(state.activeGame.file));
  els.openExternal.addEventListener("click", () => state.activeGame && window.open(state.activeGame.url, "_blank", "noopener,noreferrer"));
  els.fullscreenBtn.addEventListener("click", openPlayerFullscreen);
  els.proxyForm.addEventListener("submit", (event) => {
    event.preventDefault();
    loadProxy(els.proxyInput.value, "media");
  });
  els.proxyInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    loadProxy(els.proxyInput.value, "media");
  });
  els.proxyNewTab.addEventListener("click", () => createProxyTab({ activate: true }));
  els.proxyBack.addEventListener("click", () => proxyHistoryAction("back"));
  els.proxyForward.addEventListener("click", () => proxyHistoryAction("forward"));
  els.proxyReload.addEventListener("click", reloadProxyTab);
  els.proxyBookmark.addEventListener("click", toggleProxyBookmark);
  els.proxyEngine.addEventListener("click", () => loadProxy(els.proxyInput.value, "engine"));
  els.proxyOpen.addEventListener("click", async () => {
    const normalized = normalizeProxyInput(els.proxyInput.value);
    if (!normalized) return;

    const popup = window.open("about:blank", "_blank", "noopener,noreferrer");
    try {
      await ensureProxyEngine();
      if (popup) popup.location.href = proxyEngineUrlFor(normalized);
    } catch {
      if (popup) popup.location.href = normalized;
    }
  });
  els.proxyHome.addEventListener("click", clearProxy);
  document.querySelectorAll("[data-proxy-url]").forEach((button) => {
    button.addEventListener("click", () => loadProxy(button.dataset.proxyUrl, "media"));
  });

  els.launchMode.addEventListener("change", (event) => updateSetting("launchMode", event.target.value));
  $("#accentColor").addEventListener("input", (event) => updateSetting("accent", event.target.value));
  $("#backgroundSelect").addEventListener("change", (event) => updateSetting("background", event.target.value));
  $("#fontSelect").addEventListener("change", (event) => updateSetting("font", event.target.value));
  $("#glassRange").addEventListener("input", (event) => updateSetting("glass", Number(event.target.value)));
  $("#glowRange").addEventListener("input", (event) => updateSetting("glow", Number(event.target.value)));
  $("#sparkleRange").addEventListener("input", (event) => updateSetting("sparkle", Number(event.target.value)));
  $("#radiusRange").addEventListener("input", (event) => updateSetting("radius", Number(event.target.value)));
  $("#motionToggle").addEventListener("change", (event) => updateSetting("motion", event.target.checked));
  $("#reducedToggle").addEventListener("change", (event) => updateSetting("reduced", event.target.checked));
  $("#densitySelect").addEventListener("change", (event) => updateSetting("density", event.target.value));
  $("#cardStyleSelect").addEventListener("change", (event) => updateSetting("cardStyle", event.target.value));
  $("#detailsToggle").addEventListener("change", (event) => updateSetting("showDetails", event.target.checked));
  $("#autoFocusToggle").addEventListener("change", (event) => updateSetting("autoFocus", event.target.checked));
  $("#fullscreenToggle").addEventListener("change", (event) => updateSetting("fullscreen", event.target.checked));
  $("#panicTitle").addEventListener("change", (event) => updateSetting("panicTitle", event.target.value));
  $("#panicUrl").addEventListener("change", (event) => updateSetting("panicUrl", event.target.value));
  $("#resetSettings").addEventListener("click", () => {
    state.settings = structuredClone(defaultSettings);
    saveJson(storageKey, state.settings);
    applySettings();
    syncSettingsControls();
    drawSparkles();
  });
  $("#clearData").addEventListener("click", () => {
    state.favorites = [];
    state.recents = [];
    saveJson(favoritesKey, state.favorites);
    saveJson(recentsKey, state.recents);
    render();
  });

  window.addEventListener("resize", drawSparkles);
  window.addEventListener("resize", updateNavHighlight);
}

function drawSparkles() {
  const canvas = els.canvas;
  const context = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * ratio);
  canvas.height = Math.floor(window.innerHeight * ratio);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);

  const count = state.settings.reduced ? 0 : Number(state.settings.sparkle);
  const particles = Array.from({ length: count }, () => ({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    size: Math.random() * 1.9 + 0.4,
    phase: Math.random() * Math.PI * 2,
    speed: Math.random() * 0.015 + 0.006
  }));

  function paint(time = 0) {
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const rgb = hexToRgb(state.settings.accent);
    particles.forEach((spark) => {
      const shimmer = state.settings.motion ? (Math.sin(time * spark.speed + spark.phase) + 1) / 2 : 0.7;
      context.globalAlpha = 0.14 + shimmer * 0.42;
      context.fillStyle = `rgb(${rgb})`;
      context.beginPath();
      context.arc(spark.x, spark.y, spark.size + shimmer * 1.8, 0, Math.PI * 2);
      context.fill();
    });
    context.globalAlpha = 1;
    if (state.settings.motion && !state.settings.reduced) requestAnimationFrame(paint);
  }

  paint();
}

renderPresets();
applySettings();
syncSettingsControls();
renderProxyBookmarks();
initProxyTabs();
bindEvents();
loadGames();
drawSparkles();
updateNavHighlight();

const resumeProxyTarget = sessionStorage.getItem(proxyResumeKey);
if (resumeProxyTarget) {
  sessionStorage.removeItem(proxyResumeKey);
  switchView("proxy");
  window.setTimeout(() => loadProxy(resumeProxyTarget), 250);
}
