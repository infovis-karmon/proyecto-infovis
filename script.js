const ALL_MAPS_VALUE = "__all__";

const YEAR_FILES = [2021, 2022, 2023, 2024, 2025].map((year) => ({
  year,
  file: `db/agents_pick_rates_${year}.csv`,
}));

const MATCHES_FILE = "db/all_matches_games.csv";

const COLORS = {
  annualBars: ["#b93945", "#9d2e3a", "#7e232b"],
};

const AGENT_ROLES = {
  "brimstone": "Controller",
  "viper": "Controller",
  "omen": "Controller",
  "killjoy": "Sentinel",
  "cypher": "Sentinel",
  "sova": "Initiator",
  "sage": "Sentinel",
  "phoenix": "Duelist",
  "jett": "Duelist",
  "reyna": "Duelist",
  "raze": "Duelist",
  "breach": "Initiator",
  "skye": "Initiator",
  "yoru": "Duelist",
  "astra": "Controller",
  "kay/o": "Initiator",
  "kayo": "Initiator",
  "chamber": "Sentinel",
  "neon": "Duelist",
  "fade": "Initiator",
  "harbor": "Controller",
  "gekko": "Initiator",
  "deadlock": "Sentinel",
  "iso": "Duelist",
  "clove": "Controller",
  "vyse": "Sentinel",
  "tejo": "Initiator",
  "waylay": "Duelist",
  "veto": "Sentinel",
  "miks": "Controller"
};

function getAgentRoleIcon(agent) {
  const normalized = normalizeAgentLabel(agent);
  const role = AGENT_ROLES[normalized] || "Controller";
  return `assets/${role}ClassSymbol.webp`;
}

const timelineTop = document.getElementById("timelineTop");
const timelineBottom = document.getElementById("timelineBottom");
const topConnectors = document.getElementById("timelineTopConnectors");
const bottomConnectors = document.getElementById("timelineBottomConnectors");
const yearNodesContainer = document.getElementById("yearNodes");
const overallMapsNote = document.getElementById("overallMapsNote");
const overallTopItems = Array.from(document.querySelectorAll(".top-global .top-item"));

const mapDropdown = document.getElementById("mapDropdown");
const mapSelectButton = document.getElementById("mapSelectButton");
const mapSelectLabel = document.getElementById("mapSelectLabel");
const mapSelectMenu = document.getElementById("mapSelectMenu");

const audioCache = new Map();

let mainBgAudio = null;
let currentMapAudio = null;
let fadeInterval = null;

function initMainBgAudio() {
  if (!mainBgAudio) {
    mainBgAudio = new Audio("assets/background/Valorant Agent.mp3");
    mainBgAudio.loop = true;
    mainBgAudio.volume = 0.2;
  }
}

function fadeAudio(audio, targetVolume, duration = 1000, callback = null) {
  if (!audio) return;

  const steps = 20;
  const stepTime = duration / steps;
  const volumeStep = (targetVolume - audio.volume) / steps;

  if (audio.fadeInterval) clearInterval(audio.fadeInterval);

  audio.fadeInterval = setInterval(() => {
    let newVolume = audio.volume + volumeStep;

    if (newVolume < 0) newVolume = 0;
    if (newVolume > 1) newVolume = 1;

    audio.volume = newVolume;

    if ((volumeStep > 0 && audio.volume >= targetVolume) ||
      (volumeStep < 0 && audio.volume <= targetVolume)) {
      clearInterval(audio.fadeInterval);
      audio.volume = targetVolume;
      if (callback) callback();
    }
  }, stepTime);
}

const appState = {
  yearRows: [],
  matchRows: [],
  selectedMap: ALL_MAPS_VALUE,
  mapOptions: [],
};

boot();

async function boot() {
  try {
    const [yearRowsRaw, matchRows] = await Promise.all([
      Promise.all(YEAR_FILES.map(loadYearRows)),
      loadMatchRows(MATCHES_FILE),
    ]);

    appState.yearRows = yearRowsRaw.filter(Boolean);
    appState.matchRows = matchRows;
    appState.selectedMap = ALL_MAPS_VALUE;

    if (!appState.yearRows.length) {
      throw new Error("No se pudieron cargar los CSV.");
    }

    populateMapSelector(appState.yearRows);
    bindMapDropdown();
    updateVisualization();
  } catch (error) {
    if (timelineTop) {
      timelineTop.innerHTML = `
        <div class="empty-state">
          ${error.message}<br><br>
          Si abriste el HTML con doble clic, prueba servir la carpeta con un servidor local.
        </div>
      `;
    }

    if (timelineBottom) timelineBottom.innerHTML = "";
    if (yearNodesContainer) yearNodesContainer.innerHTML = "";

    console.error(error);
  }
}

let pendingAudioAgent = null;
let interactionListenerAdded = false;

function playBackgroundMusic(mapName) {
  initMainBgAudio();

  if (!mapName || mapName === ALL_MAPS_VALUE) {
    if (currentMapAudio) {
      fadeAudio(currentMapAudio, 0, 1000, () => {
        if (currentMapAudio) {
          currentMapAudio.pause();
          currentMapAudio = null;
        }
      });
    }

    if (mainBgAudio.paused) {
      mainBgAudio.volume = 0;
      mainBgAudio.play().catch(() => { });
      fadeAudio(mainBgAudio, 0.2, 1000);
    } else {
      fadeAudio(mainBgAudio, 0.2, 1000);
    }
    return;
  }

  const capitalizedMap = capitalize(mapName);

  if (currentMapAudio) {
    currentMapAudio.pause();
    currentMapAudio = null;
  }

  if (!mainBgAudio.paused) {
    fadeAudio(mainBgAudio, 0, 1000, () => {
      mainBgAudio.pause();
    });
  }

  const mapAudioPath = `assets/background/Valorant ${capitalizedMap} Map Theme Music.mp3`;
  currentMapAudio = new Audio(mapAudioPath);
  currentMapAudio.volume = 0;

  currentMapAudio.play().then(() => {
    fadeAudio(currentMapAudio, 0.3, 1000);
  }).catch((e) => {
    console.warn("No se pudo reproducir la música del mapa:", e);
  });

  currentMapAudio.addEventListener('ended', () => {
    currentMapAudio = null;
    mainBgAudio.volume = 0;
    mainBgAudio.play().catch(() => { });
    fadeAudio(mainBgAudio, 0.2, 2000);
  });
}

function handleFirstInteraction() {
  initMainBgAudio();
  if (mainBgAudio.paused && !currentMapAudio) {
    mainBgAudio.volume = 0;
    mainBgAudio.play().catch(() => { });
    fadeAudio(mainBgAudio, 0.2, 500);
  } else if (currentMapAudio && currentMapAudio.paused) {
    currentMapAudio.play().catch(() => { });
  }

  if (pendingAudioAgent) {
    playAgentAudio(pendingAudioAgent).catch(() => { });
    pendingAudioAgent = null;
  }
  document.removeEventListener("click", handleFirstInteraction);
  document.removeEventListener("keydown", handleFirstInteraction);
}
function updateVisualization() {
  if (appState.yearRows.length === 0) return;

  const loadedYears = appState.yearRows.map(({ year, rows }) =>
    aggregateYear(rows, year, appState.selectedMap)
  );

  const overall = aggregateOverall(loadedYears);
  const yearlyMapCounts = getYearlyMapCounts(appState.matchRows, appState.selectedMap);

  renderTimeline(loadedYears, yearlyMapCounts);
  renderOverallSummary(overall);
  renderOverallMapsNote(yearlyMapCounts);
  updateMapBackground(appState.selectedMap);

  const selectedOption = appState.mapOptions.find(opt => opt.value === appState.selectedMap);
  if (selectedOption) {
    const mapName = appState.selectedMap === ALL_MAPS_VALUE ? "todos los mapas" : selectedOption.label;
    const capitalizedMap = capitalize(mapName);

    const podiumH2 = document.querySelector(".podium-heading h2");
    const timelineH2 = document.querySelector(".timeline-heading h2");

    if (podiumH2) {
      podiumH2.innerHTML = `<span style="color: #00f2ff;">TOP 3</span> HISTÓRICO EN<br>${capitalizedMap}`;
    }
    if (timelineH2) {
      timelineH2.innerHTML = `<span style="color: #ff4655;">TOP 3</span> POR AÑO EN<br>${capitalizedMap}`;
    }
  }

  if (overall.length > 0) {
    const topAgent = overall[0].agent;
    playBackgroundMusic(appState.selectedMap);
    const playPromise = playAgentAudio(topAgent);
    if (playPromise) {
      playPromise.catch(() => {
        pendingAudioAgent = topAgent;
        if (!interactionListenerAdded) {
          document.addEventListener("click", handleFirstInteraction);
          document.addEventListener("keydown", handleFirstInteraction);
          interactionListenerAdded = true;
        }
      });
    }
  }
}

function populateMapSelector(yearRows) {
  if (!mapSelectMenu) return;

  const maps = new Set();

  yearRows.forEach(({ rows }) => {
    rows.forEach((row) => {
      const map = String(row.Map ?? "").trim();

      if (!map || equalsIgnoreCase(map, "All Maps") || equalsIgnoreCase(map, "TBD")) {
        return;
      }

      maps.add(map.toUpperCase());
    });
  });

  const sortedMaps = Array.from(maps).sort((a, b) => a.localeCompare(b, "es"));

  appState.mapOptions = [
    { value: ALL_MAPS_VALUE, label: "TODOS LOS MAPAS" },
    ...sortedMaps.map((mapName) => ({
      value: mapName.toLowerCase(),
      label: mapName,
    })),
  ];

  renderMapOptions();
  updateMapDropdownLabel();
}

function getMapCountryCode(mapName) {
  const flags = {
    bind: "ma",
    haven: "bt",
    split: "jp",
    ascent: "it",
    icebox: "ru",
    breeze: "bm",
    fracture: "us",
    pearl: "pt",
    lotus: "in",
    sunset: "us",
    abyss: "no",
    corrode: "fr"
  };
  const key = String(mapName).trim().toLowerCase();
  return flags[key] || "";
}

function renderMapOptions() {
  if (!mapSelectMenu) return;

  mapSelectMenu.innerHTML = "";

  appState.mapOptions.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "map-option";
    button.role = "option";
    button.dataset.value = option.value;

    const countryCode = getMapCountryCode(option.value);
    if (countryCode) {
      const flagImg = document.createElement("img");
      flagImg.src = `https://flagcdn.com/w20/${countryCode}.png`;
      flagImg.srcset = `https://flagcdn.com/w40/${countryCode}.png 2x`;
      flagImg.width = 20;
      flagImg.alt = countryCode.toUpperCase();
      flagImg.style.borderRadius = "2px";
      button.appendChild(flagImg);
    }

    const textSpan = document.createElement("span");
    textSpan.textContent = option.label;
    button.appendChild(textSpan);

    button.setAttribute("aria-selected", String(option.value === appState.selectedMap));

    button.addEventListener("click", () => {
      selectMap(option.value);
    });

    mapSelectMenu.appendChild(button);
  });
}

function bindMapDropdown() {
  if (!mapDropdown || !mapSelectButton || !mapSelectMenu) return;

  mapSelectButton.addEventListener("click", () => {
    const isOpen = mapDropdown.classList.contains("is-open");
    setMapDropdownOpen(!isOpen);
  });

  document.addEventListener("click", (event) => {
    if (!mapDropdown.contains(event.target)) {
      setMapDropdownOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setMapDropdownOpen(false);
    }
  });
}

function selectMap(value) {
  appState.selectedMap = value || ALL_MAPS_VALUE;

  updateMapDropdownLabel();
  setMapDropdownOpen(false);
  updateVisualization();
}

function updateMapDropdownLabel() {
  if (!mapSelectLabel || !mapSelectMenu) return;

  const selected = appState.mapOptions.find((option) => option.value === appState.selectedMap);

  mapSelectLabel.textContent = selected ? selected.label : "TODOS LOS MAPAS";

  mapSelectMenu.querySelectorAll(".map-option").forEach((option) => {
    option.setAttribute(
      "aria-selected",
      String(option.dataset.value === appState.selectedMap)
    );
  });
}

function setMapDropdownOpen(isOpen) {
  if (!mapDropdown || !mapSelectButton) return;

  mapDropdown.classList.toggle("is-open", isOpen);
  mapSelectButton.setAttribute("aria-expanded", String(isOpen));
}

function renderOverallSummary(entries) {
  if (!overallTopItems.length) return;

  const visibleEntries = entries.slice(0, overallTopItems.length);
  const rates = visibleEntries.map((entry) => entry.average);
  const minRate = rates.length ? Math.min(...rates) : 0;
  const maxRate = rates.length ? Math.max(...rates) : 0;

  overallTopItems.forEach((item, index) => {
    const entry = entries[index];

    item.style.visibility = entry ? "visible" : "hidden";

    if (!entry) return;

    const podiumHeight = getPodiumHeight(entry.average, minRate, maxRate);
    item.style.setProperty("--podium-height", `${podiumHeight}px`);

    const img = item.querySelector("img");
    const percent = item.querySelector(".top-percent");
    const label = item.querySelector(".top-label");

    if (img) {
      img.src = fullArtworkPath(entry.agent);
      img.alt = capitalize(entry.agent);
      img.dataset.agent = entry.agent;
      img.onerror = () => {
        img.onerror = null;
        img.src = entry.asset;
      };
    }

    if (percent) {
      percent.textContent = formatRate(entry.average);
    }

    if (label) {
      label.innerHTML = `#${index + 1} ${capitalize(entry.agent)} <img src="${getAgentRoleIcon(entry.agent)}" alt="Role" class="role-icon">`;
    }
  });
}

function getPodiumHeight(value, minValue, maxValue) {
  const maxHeight = 300;

  if (!Number.isFinite(value)) return 0;

  const normalized = Math.max(0, Math.min(value, 100)) / 100;
  return normalized * maxHeight;
}

function renderOverallMapsNote(yearlyMapCounts) {
  if (!overallMapsNote) return;

  const totalMaps = Number(yearlyMapCounts.__total) || 0;

  overallMapsNote.textContent =
    totalMaps > 0 ? `Basado en ${totalMaps} mapas` : "Basado en 0 mapas";
}

async function loadYearRows({ year, file }) {
  try {
    const response = await fetch(file);

    if (!response.ok) {
      throw new Error(`No se encontró ${file}`);
    }

    const text = await response.text();
    const rows = parseCSV(text);

    return { year, rows };
  } catch (error) {
    console.warn(`Omitiendo ${year}:`, error.message);
    return null;
  }
}

async function loadMatchRows(file) {
  try {
    const response = await fetch(file);

    if (!response.ok) {
      throw new Error(`No se encontró ${file}`);
    }

    const text = await response.text();
    return parseCSV(text);
  } catch (error) {
    console.warn("No se pudo cargar all_matches_games.csv:", error.message);
    return [];
  }
}

function getYearlyMapCounts(rows, selectedMap) {
  const counts = {
    __total: 0,
  };

  YEAR_FILES.forEach(({ year }) => {
    counts[year] = 0;
  });

  rows.forEach((row) => {
    const year = Number.parseInt(String(row.Year ?? "").trim(), 10);
    const map = String(row.Map ?? "").trim();

    if (Number.isNaN(year)) return;

    const isSelected =
      selectedMap === ALL_MAPS_VALUE ? true : equalsIgnoreCase(map, selectedMap);

    if (!isSelected) return;

    if (Object.prototype.hasOwnProperty.call(counts, year)) {
      counts[year] += 1;
      counts.__total += 1;
    }
  });

  return counts;
}

function parseCSV(text) {
  const rows = [];
  let current = "";
  let row = [];
  let insideQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (insideQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        insideQuotes = !insideQuotes;
      }

      continue;
    }

    if (char === "," && !insideQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && next === "\n") i += 1;

      row.push(current);

      if (row.some((cell) => cell !== "")) {
        rows.push(row);
      }

      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  if (current.length || row.length) {
    row.push(current);

    if (row.some((cell) => cell !== "")) {
      rows.push(row);
    }
  }

  if (!rows.length) return [];

  const headers = rows[0].map((header) => header.trim());

  return rows.slice(1).map((cells) => {
    const record = {};

    headers.forEach((header, index) => {
      record[header] = (cells[index] ?? "").trim();
    });

    return record;
  });
}

function aggregateYear(rows, year, selectedMap) {
  const targetMap = selectedMap === ALL_MAPS_VALUE ? "All Maps" : selectedMap;

  const preferred = rows.filter(
    (row) =>
      equalsIgnoreCase(row.Stage, "All Stages") &&
      equalsIgnoreCase(row["Match Type"], "All Match Types") &&
      equalsIgnoreCase(row.Map, targetMap)
  );

  const fallback = rows.filter((row) => equalsIgnoreCase(row.Map, targetMap));
  const sourceRows = preferred.length ? preferred : fallback;

  const grouped = new Map();

  sourceRows.forEach((row) => {
    const agent = normalizeAgentLabel(row.Agent);
    const rate = parsePickRate(row["Pick Rate"]);

    if (!agent || Number.isNaN(rate)) return;

    if (!grouped.has(agent)) {
      grouped.set(agent, { agent, values: [] });
    }

    grouped.get(agent).values.push(rate);
  });

  const aggregates = [...grouped.values()]
    .map(({ agent, values }) => ({
      agent,
      average: average(values),
      asset: assetPath(agent),
    }))
    .sort((a, b) => b.average - a.average);

  return {
    year,
    topAgents: aggregates.slice(0, 3),
    allAgents: aggregates,
  };
}

function aggregateOverall(years) {
  const map = new Map();

  years.forEach((yearBlock) => {
    yearBlock.allAgents.forEach((entry) => {
      if (!map.has(entry.agent)) {
        map.set(entry.agent, {
          agent: entry.agent,
          values: [],
          asset: entry.asset,
        });
      }

      map.get(entry.agent).values.push(entry.average);
    });
  });

  return [...map.values()]
    .filter((entry) => entry.values.length > 0)
    .map(({ agent, values, asset }) => ({
      agent,
      average: average(values),
      yearsPresent: values.length,
      asset,
    }))
    .sort((a, b) => b.average - a.average)
    .slice(0, 3);
}

function renderTimeline(years, yearlyMapCounts) {
  if (timelineTop) timelineTop.innerHTML = "";
  if (timelineBottom) timelineBottom.innerHTML = "";
  if (topConnectors) topConnectors.innerHTML = "";
  if (bottomConnectors) bottomConnectors.innerHTML = "";
  if (yearNodesContainer) yearNodesContainer.innerHTML = "";

  const positions = distributePositions(years.length);

  years.forEach((block, index) => {
    const isAbove = index % 2 === 1;
    const left = `${positions[index]}%`;
    const mapCount = yearlyMapCounts[block.year] || 0;

    const yearNode = document.createElement("div");
    yearNode.className = `year-node ${isAbove ? "year-node-label-below" : "year-node-label-above"
      }`;
    yearNode.style.left = left;
    yearNode.innerHTML = `
      <span class="year-label">${block.year}</span>
      <span class="year-dot"></span>
    `;
    yearNodesContainer.appendChild(yearNode);

    const group = document.createElement("article");
    group.className = `year-group ${isAbove ? "above" : "below"}`;
    group.style.left = left;

    const stack = document.createElement("div");
    stack.className = "bar-stack";

    if (block.topAgents.length) {
      block.topAgents.forEach((agent, rank) => {
        const row = createRankBar({
          entry: agent,
          rank,
        });

        stack.appendChild(row);
      });
    } else {
      const empty = document.createElement("div");
      empty.className = "year-empty";
      empty.textContent = "Mapa no disponible este año";
      stack.appendChild(empty);
    }

    const metaNote = document.createElement("div");
    metaNote.className = "year-meta-note maps-note";
    metaNote.textContent = `Basado en ${mapCount} mapas`;

    const connectorEl = document.createElement("div");
    connectorEl.className = "year-connector-vertical";
    connectorEl.style.left = left;

    group.appendChild(stack);
    group.appendChild(metaNote);

    if (isAbove) {
      timelineTop.appendChild(group);
      if (topConnectors) topConnectors.appendChild(connectorEl);
    } else {
      timelineBottom.appendChild(group);
      if (bottomConnectors) bottomConnectors.appendChild(connectorEl);
    }
  });
}

function createRankBar({ entry, rank }) {
  const row = document.createElement("div");
  row.className = "rank-row";
  row.dataset.agent = entry.agent;

  const media = document.createElement("div");
  media.className = "rank-media";

  const img = document.createElement("img");
  img.src = entry.asset;
  img.alt = capitalize(entry.agent);
  img.loading = "lazy";
  img.className = "rank-avatar";
  img.dataset.agent = entry.agent;

  const fallback = document.createElement("span");
  fallback.className = "rank-avatar-fallback";
  fallback.textContent = initials(entry.agent);
  fallback.style.display = "none";

  img.addEventListener("error", () => {
    img.style.display = "none";
    fallback.style.display = "grid";
  });

  media.append(img, fallback);

  const barWrap = document.createElement("div");
  barWrap.className = "rank-bar-wrap";

  const labelRow = document.createElement("div");
  labelRow.className = "rank-label-row";

  const order = document.createElement("span");
  order.className = "rank-order";
  order.textContent = `#${rank + 1}`;

  const label = document.createElement("span");
  label.className = "rank-agent";
  label.textContent = capitalize(entry.agent);

  const roleIcon = document.createElement("img");
  roleIcon.src = getAgentRoleIcon(entry.agent);
  roleIcon.className = "role-icon-small";
  roleIcon.alt = "Role";

  labelRow.append(order, label, roleIcon);

  const bar = document.createElement("div");
  bar.className = "rank-bar";
  bar.style.setProperty("--bar-color", COLORS.annualBars[rank % COLORS.annualBars.length]);

  const fill = document.createElement("div");
  fill.className = "rank-bar-fill";
  fill.style.width = `0%`;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fill.style.width = `${Math.max(0, Math.min(entry.average, 100))}%`;
    });
  });

  const value = document.createElement("span");
  value.className = "rank-value";
  value.textContent = formatRate(entry.average);

  bar.append(fill, value);
  barWrap.append(labelRow, bar);

  row.append(media, barWrap);

  return row;
}

function updateMapBackground(selectedMap) {
  const root = document.documentElement;

  if (selectedMap === ALL_MAPS_VALUE) {
    root.classList.remove("has-map-background");
    root.style.removeProperty("--map-bg-image");
    return;
  }

  const filename = mapBackgroundFilename(selectedMap);

  root.style.setProperty(
    "--map-bg-image",
    `url("assets/maps/Loading_Screen_${filename}.webp")`
  );

  root.classList.add("has-map-background");
}

function mapBackgroundFilename(mapName) {
  return String(mapName)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .split(/\s+/)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join("_");
}

function distributePositions(count) {
  if (count === 1) return [50];

  const start = 10;
  const end = 90;

  return Array.from(
    { length: count },
    (_, index) => start + ((end - start) * index) / (count - 1)
  );
}

function parsePickRate(value) {
  return Number.parseFloat(String(value ?? "").replace("%", "").trim());
}

function normalizeAgentLabel(agent) {
  return String(agent ?? "").trim().toLowerCase();
}

function capitalize(text) {
  return String(text)
    .split(/\s+/)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function initials(text) {
  const clean = String(text).trim().toUpperCase();

  return clean.length <= 3 ? clean : clean.slice(0, 3);
}

function assetPath(agent) {
  const filename = agentFilename(agent);
  return `assets/icons/${filename}-icon.png`;
}

function fullArtworkPath(agent) {
  const filename = agentFilename(agent);
  return `assets/full/${filename}_Artwork_Full.webp`;
}

function agentFilename(agent) {
  const normalized = String(agent)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();

  const specialNames = {
    kayo: "KAYO",
  };

  if (specialNames[normalized]) {
    return specialNames[normalized];
  }

  return String(agent)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .split(/\s+/)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join("");
}

function getAudioPath(agentName) {
  const filename = agentFilename(agentName).toLowerCase();
  return `assets/audio/${filename}.mp3`;
}

function getAudio(agentName) {
  const key = normalizeAgentLabel(agentName);

  if (!audioCache.has(key)) {
    const audio = new Audio(getAudioPath(agentName));
    audio.volume = 1.0;
    audio.preload = "auto";
    audioCache.set(key, audio);
  }

  return audioCache.get(key);
}

function playAgentAudio(agentName) {
  if (!agentName) return Promise.resolve();

  const audio = getAudio(agentName);

  try {
    audio.currentTime = 0;
    return audio.play().catch((error) => {
      console.warn(`No se pudo reproducir el audio de ${agentName}:`, error);
      throw error;
    });
  } catch (error) {
    console.warn(`No se pudo preparar el audio de ${agentName}:`, error);
    return Promise.reject(error);
  }
}


function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function equalsIgnoreCase(a, b) {
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
}

function formatRate(value) {
  return `${value.toFixed(1)}%`;
}