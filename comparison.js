const ALL_MAPS_VALUE = "__all__";

const YEAR_FILES = [2021, 2022, 2023, 2024, 2025].map((year) => ({
  year,
  file: `db/agents_pick_rates_${year}.csv`,
}));

const MATCHES_FILE = "db/all_matches_games.csv";

const YEAR_SYMBOLS = {
  2021: "?",
  2022: "!",
  2023: "$",
  2024: "&",
  2025: "%",
};

const AGENT_SYMBOL_ALPHABET = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "Ñ",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
];

const STORAGE_KEY = "valorant_comparison_triplets";

const PICK_RATE_AUDIO_BASE = "assets/audio/guns/";
const PICK_RATE_AUDIO_FILES = [
  "bucky.mp3",
  "marshal.mp3",
  "shorty.mp3",
  "sheriff.mp3",
  "ghost.mp3",
  "vandal.mp3",
  "bulldog.mp3",
  "phantom.mp3",
  "odin.mp3",
  "spectre.mp3",
];

const vennAudioCache = new Map();
let activeVennAudio = null;

const FALLBACK_AGENTS = [
  "astra",
  "breach",
  "brimstone",
  "chamber",
  "clove",
  "cypher",
  "deadlock",
  "fade",
  "gekko",
  "harbor",
  "iso",
  "jett",
  "kayo",
  "killjoy",
  "neon",
  "omen",
  "phoenix",
  "raze",
  "reyna",
  "sage",
  "skye",
  "sova",
  "tejo",
  "viper",
  "vyse",
  "waylay",
  "yoru",
];

const FALLBACK_MAPS = [
  "abyss",
  "ascent",
  "bind",
  "breeze",
  "corrode",
  "fracture",
  "haven",
  "icebox",
  "lotus",
  "pearl",
  "split",
  "sunset",
];

const AGENT_ASSET_NAMES = {
  "kay/o": "KAYO",
  kayo: "KAYO",
};

const MAP_ASSET_NAMES = {
  abyss: "Abyss",
  ascent: "Ascent",
  bind: "Bind",
  breeze: "Breeze",
  corrode: "Corrode",
  fracture: "Fracture",
  haven: "Haven",
  icebox: "Icebox",
  lotus: "Lotus",
  pearl: "Pearl",
  split: "Split",
  sunset: "Sunset",
};

const tripletState = {
  years: [2021, 2022, 2023, 2024, 2025],
  maps: FALLBACK_MAPS,
  agents: FALLBACK_AGENTS,

  agentRows: [],
  matchRows: [],

  one: {
    year: 0,
    map: 1,
    agent: 0,
  },

  two: {
    year: 4,
    map: 1,
    agent: 15,
  },
};

initTripletLocks();

async function initTripletLocks() {
  try {
    const yearRows = await Promise.all(YEAR_FILES.map(loadYearRows));
    const agentRows = yearRows.flatMap((item) => item.rows || []);

    const matchesText = await fetchText(MATCHES_FILE);

    const matchRows = parseCSV(matchesText).filter((row) => {
      return tripletState.years.includes(Number(row.Year));
    });

    const dataAgents = extractAgents(agentRows);
    const dataMaps = extractMaps(agentRows);

    tripletState.agentRows = agentRows;
    tripletState.matchRows = matchRows;

    if (dataAgents.length) {
      tripletState.agents = dataAgents;
    }

    if (dataMaps.length) {
      tripletState.maps = dataMaps;
    }

    setDefaultTripletIndexes();
    loadTripletState();
  } catch (error) {
    console.warn("No se pudieron cargar los CSV para la comparación. Se usan valores base.", error);

    setDefaultTripletIndexes();
    loadTripletState();
  }

  bindTripletButtons();
  bindVennHoverAudio();
  renderAllTriplets();
}

async function fetchText(file) {
  const response = await fetch(file);

  if (!response.ok) {
    throw new Error(`No se encontró ${file}`);
  }

  return response.text();
}

async function loadYearRows({ year, file }) {
  const text = await fetchText(file);

  const rows = parseCSV(text).map((row) => ({
    ...row,
    Year: year,
  }));

  return {
    year,
    rows,
  };
}

function setDefaultTripletIndexes() {
  tripletState.one.year = 0;
  tripletState.two.year = tripletState.years.length - 1;

  tripletState.one.map = findIndexOrZero(tripletState.maps, "ascent");
  tripletState.two.map = findIndexOrZero(tripletState.maps, "ascent");

  tripletState.one.agent = findIndexOrZero(tripletState.agents, "astra");
  tripletState.two.agent = findIndexOrZero(tripletState.agents, "omen");
}

function bindTripletButtons() {
  document.querySelectorAll(".triplet-lock").forEach((lock) => {
    const triplet = lock.dataset.triplet;

    lock.querySelectorAll(".lock-slot").forEach((slot) => {
      const field = slot.dataset.field;

      const upButton = slot.querySelector(".lock-arrow-up");
      const downButton = slot.querySelector(".lock-arrow-down");

      upButton?.addEventListener("click", () => {
        moveValue(triplet, field, 1);
      });

      downButton?.addEventListener("click", () => {
        moveValue(triplet, field, -1);
      });
    });
  });
}

function moveValue(triplet, field, direction) {
  const list = getListByField(field);
  const state = tripletState[triplet];

  if (!list.length || !state) return;

  state[field] = wrapIndex(state[field] + direction, list.length);

  renderTripletField(triplet, field);
  renderVenn(triplet);
  renderComparisonBars();
  saveTripletState();
}

function renderAllTriplets() {
  ["one", "two"].forEach((triplet) => {
    ["year", "map", "agent"].forEach((field) => {
      renderTripletField(triplet, field);
    });

    renderVenn(triplet);
  });

  renderComparisonBars();
}

function renderTripletField(triplet, field) {
  const lock = document.querySelector(`.triplet-lock[data-triplet="${triplet}"]`);
  if (!lock) return;

  const slot = lock.querySelector(`.lock-slot[data-field="${field}"]`);
  if (!slot) return;

  const symbolEl = slot.querySelector("[data-symbol]");
  const valueEl = slot.querySelector("[data-value]");

  if (!symbolEl || !valueEl) return;

  const list = getListByField(field);
  const index = tripletState[triplet][field];
  const value = list[index];

  if (field === "year") {
    symbolEl.textContent = YEAR_SYMBOLS[value] || "?";
    valueEl.textContent = String(value);
  }

  if (field === "map") {
    symbolEl.textContent = String(index);
    valueEl.textContent = capitalize(value);
  }

  if (field === "agent") {
    symbolEl.textContent = indexToLetters(index);
    valueEl.textContent = formatAgentName(value);
  }
}

function renderVenn(triplet) {
  const venn = document.querySelector(`.venn-card[data-venn="${triplet}"]`);
  const state = tripletState[triplet];

  if (!venn || !state) return;

  const year = tripletState.years[state.year];
  const map = tripletState.maps[state.map];
  const agent = tripletState.agents[state.agent];

  const yearEl = venn.querySelector("[data-venn-year]");
  const mapEl = venn.querySelector("[data-venn-map]");
  const agentEl = venn.querySelector("[data-venn-agent]");
  const mapImg = venn.querySelector("[data-venn-map-img]");
  const agentImg = venn.querySelector("[data-venn-agent-img]");
  const diagram = venn.querySelector(".venn-diagram");

  const pickRate = countAgentPickRate({
    agent,
    map,
    year,
  });

  if (diagram) {
    diagram.dataset.pickRate = String(clampPickRate(pickRate));
    diagram.title = `Pick rate: ${formatRate(pickRate)}%`;
  }

  if (yearEl) {
    yearEl.textContent = String(year);
  }

  if (mapEl) {
    mapEl.textContent = capitalize(map);
  }

  if (agentEl) {
    agentEl.textContent = formatAgentName(agent);
  }

  if (mapImg) {
    mapImg.src = getMapImagePath(map);
    mapImg.alt = `Mapa ${capitalize(map)}`;
  }

  if (agentImg) {
    agentImg.src = getAgentIconPath(agent);
    agentImg.alt = `Agente ${formatAgentName(agent)}`;
  }
}

function bindVennHoverAudio() {
  document.querySelectorAll(".venn-diagram").forEach((diagram) => {
    if (diagram.dataset.audioBound === "true") return;

    diagram.dataset.audioBound = "true";

    diagram.addEventListener("mouseenter", () => {
      playVennPickRateAudio(diagram);
    });

    diagram.addEventListener("mouseleave", stopVennPickRateAudio);
  });
}

function playVennPickRateAudio(diagram) {
  const pickRate = clampPickRate(diagram.dataset.pickRate);
  const audioPath = getPickRateAudioPath(pickRate);
  const audio = getVennAudio(audioPath);

  stopVennPickRateAudio();

  audio.currentTime = 0;
  audio.volume = pickRate / 100;
  activeVennAudio = audio;

  audio.play().catch((error) => {
    if (activeVennAudio === audio) {
      activeVennAudio = null;
    }

    console.warn(`No se pudo reproducir ${audioPath}:`, error);
  });
}

function stopVennPickRateAudio() {
  if (!activeVennAudio) return;

  activeVennAudio.pause();
  activeVennAudio.currentTime = 0;
  activeVennAudio = null;
}

function getPickRateAudioPath(pickRate) {
  const safeRate = clampPickRate(pickRate);
  const percentileIndex = safeRate >= 100
    ? PICK_RATE_AUDIO_FILES.length - 1
    : Math.floor(safeRate / 10);

  return `${PICK_RATE_AUDIO_BASE}${PICK_RATE_AUDIO_FILES[percentileIndex]}`;
}

function getVennAudio(audioPath) {
  if (!vennAudioCache.has(audioPath)) {
    const audio = new Audio(audioPath);
    audio.preload = "auto";

    audio.addEventListener("ended", () => {
      if (activeVennAudio === audio) {
        activeVennAudio = null;
      }
    });

    vennAudioCache.set(audioPath, audio);
  }

  return vennAudioCache.get(audioPath);
}

function clampPickRate(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) return 0;

  return Math.max(0, Math.min(numericValue, 100));
}

function renderComparisonBars() {
  const container = document.getElementById("comparisonBarsList");
  if (!container) return;

  const comparisons = buildComparisonData();

  const globalMax = Math.max(
    ...comparisons.flatMap((item) => [
      item.oneScaleValue ?? item.oneValue,
      item.twoScaleValue ?? item.twoValue,
    ]),
    1
  );

  container.innerHTML = "";

  comparisons.forEach((item) => {
    const group = document.createElement("article");
    group.className = `compare-group compare-type-${item.type}`;

    const header = document.createElement("div");
    header.className = "compare-group-title";

    const title = document.createElement("h3");
    title.textContent = item.title;

    header.append(title);

    const bars = document.createElement("div");
    bars.className = "compare-bars";

    bars.append(
      createCompareBar({
        label: item.oneLabel,
        value: item.oneValue,
        scaleValue: item.oneScaleValue ?? item.oneValue,
        maxValue: globalMax,
        unit: item.unit,
      })
    );

    bars.append(
      createCompareBar({
        label: item.twoLabel,
        value: item.twoValue,
        scaleValue: item.twoScaleValue ?? item.twoValue,
        maxValue: globalMax,
        unit: item.unit,
      })
    );

    group.append(header, bars);
    container.append(group);
  });
}

function createCompareBar({ label, value, scaleValue, maxValue, unit = "partidas" }) {
  const row = document.createElement("div");
  row.className = "compare-bar-row";

  const labelEl = document.createElement("span");
  labelEl.className = "compare-bar-label";
  labelEl.textContent = label;

  const track = document.createElement("div");
  track.className = "compare-bar-track";

  const fill = document.createElement("div");
  fill.className = "compare-bar-fill";

  const numericValue = Number(value) || 0;
  const numericScaleValue = Number(scaleValue) || 0;

  if (numericScaleValue <= 0) {
    fill.classList.add("is-zero");
    fill.style.setProperty("--bar-width", "0%");
  } else {
    const width = maxValue > 0
      ? Math.min((numericScaleValue / maxValue) * 100, 100)
      : 0;

    fill.style.setProperty("--bar-width", `${width}%`);
  }

  track.append(fill);

  const valueEl = document.createElement("span");
  valueEl.className = "compare-bar-value";

  if (unit === "%") {
    valueEl.textContent = `${formatRate(numericValue)}%`;
  } else {
    valueEl.textContent = `${formatInteger(numericValue)} partidas`;
  }

  row.append(labelEl, track, valueEl);

  return row;
}

function buildComparisonData() {
  const one = getTripletValues("one");
  const two = getTripletValues("two");

  const totalMatches = countAllMatches();

  const oneYearMatches = countMatchesByYear(one.year);
  const twoYearMatches = countMatchesByYear(two.year);

  const oneMapMatches = countMatchesByMap(one.map);
  const twoMapMatches = countMatchesByMap(two.map);

  const oneMapYearMatches = countMatchesByMapAndYear(one.map, one.year);
  const twoMapYearMatches = countMatchesByMapAndYear(two.map, two.year);

  const oneAgentRate = countAgentPickRate({
    agent: one.agent,
  });

  const twoAgentRate = countAgentPickRate({
    agent: two.agent,
  });

  const oneAgentYearRate = countAgentPickRate({
    agent: one.agent,
    year: one.year,
  });

  const twoAgentYearRate = countAgentPickRate({
    agent: two.agent,
    year: two.year,
  });

  const oneAgentMapRate = countAgentPickRate({
    agent: one.agent,
    map: one.map,
  });

  const twoAgentMapRate = countAgentPickRate({
    agent: two.agent,
    map: two.map,
  });

  const oneAgentMapYearRate = countAgentPickRate({
    agent: one.agent,
    map: one.map,
    year: one.year,
  });

  const twoAgentMapYearRate = countAgentPickRate({
    agent: two.agent,
    map: two.map,
    year: two.year,
  });

  return [
    {
      type: "year",
      title: "Partidas jugadas durante el año",
      unit: "partidas",
      oneLabel: String(one.year),
      twoLabel: String(two.year),
      oneValue: oneYearMatches,
      twoValue: twoYearMatches,
      oneScaleValue: oneYearMatches,
      twoScaleValue: twoYearMatches,
    },
    {
      type: "agent",
      title: "Pick rate promedio del agente",
      unit: "%",
      oneLabel: formatAgentName(one.agent),
      twoLabel: formatAgentName(two.agent),
      oneValue: oneAgentRate,
      twoValue: twoAgentRate,
      oneScaleValue: getPercentScaleValue(oneAgentRate, totalMatches),
      twoScaleValue: getPercentScaleValue(twoAgentRate, totalMatches),
    },
    {
      type: "map",
      title: "Partidas jugadas en el mapa",
      unit: "partidas",
      oneLabel: capitalize(one.map),
      twoLabel: capitalize(two.map),
      oneValue: oneMapMatches,
      twoValue: twoMapMatches,
      oneScaleValue: oneMapMatches,
      twoScaleValue: twoMapMatches,
    },
    {
      type: "agent-year",
      title: "Pick rate del agente durante el año",
      unit: "%",
      oneLabel: `${formatAgentName(one.agent)} / ${one.year}`,
      twoLabel: `${formatAgentName(two.agent)} / ${two.year}`,
      oneValue: oneAgentYearRate,
      twoValue: twoAgentYearRate,
      oneScaleValue: getPercentScaleValue(oneAgentYearRate, oneYearMatches),
      twoScaleValue: getPercentScaleValue(twoAgentYearRate, twoYearMatches),
    },
    {
      type: "map-year",
      title: "Partidas del mapa durante el año",
      unit: "partidas",
      oneLabel: `${capitalize(one.map)} / ${one.year}`,
      twoLabel: `${capitalize(two.map)} / ${two.year}`,
      oneValue: oneMapYearMatches,
      twoValue: twoMapYearMatches,
      oneScaleValue: oneMapYearMatches,
      twoScaleValue: twoMapYearMatches,
    },
    {
      type: "agent-map",
      title: "Pick rate del agente en el mapa",
      unit: "%",
      oneLabel: `${formatAgentName(one.agent)} / ${capitalize(one.map)}`,
      twoLabel: `${formatAgentName(two.agent)} / ${capitalize(two.map)}`,
      oneValue: oneAgentMapRate,
      twoValue: twoAgentMapRate,
      oneScaleValue: getPercentScaleValue(oneAgentMapRate, oneMapMatches),
      twoScaleValue: getPercentScaleValue(twoAgentMapRate, twoMapMatches),
    },
    {
      type: "agent-map-year",
      title: "Pick rate del agente en mapa y año",
      unit: "%",
      oneLabel: `${formatAgentName(one.agent)} / ${capitalize(one.map)} / ${one.year}`,
      twoLabel: `${formatAgentName(two.agent)} / ${capitalize(two.map)} / ${two.year}`,
      oneValue: oneAgentMapYearRate,
      twoValue: twoAgentMapYearRate,
      oneScaleValue: getPercentScaleValue(oneAgentMapYearRate, oneMapYearMatches),
      twoScaleValue: getPercentScaleValue(twoAgentMapYearRate, twoMapYearMatches),
    },
  ];
}

function getTripletValues(triplet) {
  const state = tripletState[triplet];

  return {
    year: tripletState.years[state.year],
    map: tripletState.maps[state.map],
    agent: tripletState.agents[state.agent],
  };
}

function countAllMatches() {
  return tripletState.matchRows.length;
}

function countMatchesByYear(year) {
  return tripletState.matchRows.filter((row) => {
    return Number(row.Year) === Number(year);
  }).length;
}

function countMatchesByMap(map) {
  const normalizedMap = normalizeLabel(map);

  return tripletState.matchRows.filter((row) => {
    return normalizeLabel(row.Map) === normalizedMap;
  }).length;
}

function countMatchesByMapAndYear(map, year) {
  const normalizedMap = normalizeLabel(map);

  return tripletState.matchRows.filter((row) => {
    return normalizeLabel(row.Map) === normalizedMap &&
      Number(row.Year) === Number(year);
  }).length;
}

function getPercentScaleValue(rate, baseMatches) {
  const numericRate = Number(rate) || 0;
  const numericBase = Number(baseMatches) || 0;

  return numericBase * (numericRate / 100);
}

function countAgentPickRate({ agent, map, year }) {
  if (year) {
    return getAgentPickRateForYear({
      agent,
      map,
      year,
    });
  }

  const yearlyValues = tripletState.years
    .map((currentYear) =>
      getAgentPickRateForYear({
        agent,
        map,
        year: currentYear,
        returnNullWhenEmpty: true,
      })
    )
    .filter((value) => value !== null && Number.isFinite(value));

  return average(yearlyValues);
}

function getAgentPickRateForYear({ agent, map, year, returnNullWhenEmpty = false }) {
  const rows = getRowsForAgentPickRate({
    agent,
    map,
    year,
  });

  if (!rows.length) {
    return returnNullWhenEmpty ? null : 0;
  }

  const values = rows
    .map((row) => parsePickRate(row["Pick Rate"]))
    .filter((value) => Number.isFinite(value));

  if (!values.length) {
    return returnNullWhenEmpty ? null : 0;
  }

  return average(values);
}

function getRowsForAgentPickRate({ agent, map, year }) {
  const normalizedAgent = normalizeAgent(agent);
  const targetMap = map ? normalizeLabel(map) : "all maps";

  const candidates = tripletState.agentRows.filter((row) => {
    const rowAgent = normalizeAgent(row.Agent);
    const rowYear = Number(row.Year);

    if (rowAgent !== normalizedAgent) return false;
    if (Number(rowYear) !== Number(year)) return false;

    return true;
  });

  const preferred = candidates.filter((row) => {
    return equalsIgnoreCase(row.Stage, "All Stages") &&
      equalsIgnoreCase(row["Match Type"], "All Match Types") &&
      normalizeLabel(row.Map) === targetMap;
  });

  if (preferred.length) {
    return preferred;
  }

  return candidates.filter((row) => {
    return normalizeLabel(row.Map) === targetMap;
  });
}

function average(values) {
  if (!values.length) return 0;

  const total = values.reduce((sum, value) => sum + value, 0);

  return total / values.length;
}

function parsePickRate(value) {
  const numeric = Number.parseFloat(
    String(value ?? "")
      .replace("%", "")
      .replace(",", ".")
      .trim()
  );

  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return numeric;
}

function formatRate(value) {
  return new Intl.NumberFormat("es-CL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(Number(value) || 0);
}

function equalsIgnoreCase(a, b) {
  return normalizeLabel(a) === normalizeLabel(b);
}

function saveTripletState() {
  const payload = {
    one: getStoredTriplet("one"),
    two: getStoredTriplet("two"),
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("No se pudo guardar la selección de tripletas.", error);
  }
}

function loadTripletState() {
  try {
    const savedRaw = localStorage.getItem(STORAGE_KEY);
    if (!savedRaw) return;

    const saved = JSON.parse(savedRaw);

    applyStoredTriplet("one", saved.one);
    applyStoredTriplet("two", saved.two);
  } catch (error) {
    console.warn("No se pudo cargar la selección guardada de tripletas.", error);
  }
}

function getStoredTriplet(triplet) {
  const state = tripletState[triplet];

  return {
    year: tripletState.years[state.year],
    map: tripletState.maps[state.map],
    agent: tripletState.agents[state.agent],
  };
}

function applyStoredTriplet(triplet, stored) {
  if (!stored || !tripletState[triplet]) return;

  const yearIndex = tripletState.years.findIndex((year) => {
    return Number(year) === Number(stored.year);
  });

  const mapIndex = tripletState.maps.findIndex((map) => {
    return normalizeLabel(map) === normalizeLabel(stored.map);
  });

  const agentIndex = tripletState.agents.findIndex((agent) => {
    return normalizeAgent(agent) === normalizeAgent(stored.agent);
  });

  if (yearIndex >= 0) {
    tripletState[triplet].year = yearIndex;
  }

  if (mapIndex >= 0) {
    tripletState[triplet].map = mapIndex;
  }

  if (agentIndex >= 0) {
    tripletState[triplet].agent = agentIndex;
  }
}

function getListByField(field) {
  if (field === "year") return tripletState.years;
  if (field === "map") return tripletState.maps;
  if (field === "agent") return tripletState.agents;

  return [];
}

function wrapIndex(index, length) {
  return ((index % length) + length) % length;
}

function extractAgents(rows) {
  const agents = new Set();

  rows.forEach((row) => {
    const agent = normalizeAgent(row.Agent);

    if (agent) {
      agents.add(agent);
    }
  });

  return Array.from(agents).sort((a, b) => {
    return a.localeCompare(b, "es");
  });
}

function extractMaps(rows) {
  const maps = new Set();

  rows.forEach((row) => {
    const map = normalizeLabel(row.Map);

    if (!map || map === "all maps" || map === "tbd") {
      return;
    }

    maps.add(map);
  });

  return Array.from(maps).sort((a, b) => {
    return a.localeCompare(b, "es");
  });
}

function indexToLetters(index) {
  const alphabet = AGENT_SYMBOL_ALPHABET;
  const base = alphabet.length;

  let number = Number(index) || 0;
  let label = "";

  do {
    label = alphabet[number % base] + label;
    number = Math.floor(number / base) - 1;
  } while (number >= 0);

  return label;
}

function getAgentIconPath(agent) {
  const normalized = normalizeAgent(agent);
  const assetName = AGENT_ASSET_NAMES[normalized] || capitalizeAssetName(normalized);

  return `assets/icons/${assetName}-icon.png`;
}

function getMapImagePath(map) {
  const normalized = normalizeLabel(map);
  const assetName = MAP_ASSET_NAMES[normalized] || capitalizeAssetName(normalized);

  return `assets/maps/Loading_Screen_${assetName}.webp`;
}

function normalizeAgent(value) {
  const normalized = normalizeLabel(value);

  if (normalized === "kay/o") return "kayo";

  return normalized;
}

function normalizeLabel(value) {
  return String(value ?? "").trim().toLowerCase();
}

function capitalize(text) {
  return String(text ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function formatAgentName(agent) {
  const normalized = normalizeAgent(agent);

  if (normalized === "kayo") {
    return "KAYO";
  }

  return capitalize(normalized);
}

function capitalizeAssetName(text) {
  return String(text ?? "")
    .split(/[\s/_-]+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join("");
}

function findIndexOrZero(list, value) {
  const normalizedValue = normalizeAgent(value);

  const index = list.findIndex((item) => {
    return normalizeAgent(item) === normalizedValue;
  });

  return index >= 0 ? index : 0;
}

function formatInteger(value) {
  return new Intl.NumberFormat("es-CL").format(Number(value) || 0);
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
      if (char === "\r" && next === "\n") {
        i += 1;
      }

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