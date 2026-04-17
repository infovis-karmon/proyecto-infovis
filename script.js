const YEAR_FILES = [2021, 2022, 2023, 2024, 2025].map((year) => ({
  year,
  file: `db/agents_pick_rates_${year}.csv`,
}));

const MATCHES_FILE = "db/all_matches_games.csv";

const COLORS = {
  annualBars: ["#7e232b", "#9d2e3a", "#b93945"],
};

const timelineTop = document.getElementById("timelineTop");
const timelineBottom = document.getElementById("timelineBottom");
const topConnectors = document.getElementById("timelineTopConnectors");
const bottomConnectors = document.getElementById("timelineBottomConnectors");
const topNotes = document.getElementById("timelineTopNotes");
const bottomNotes = document.getElementById("timelineBottomNotes");
const yearNodesContainer = document.getElementById("yearNodes");
const overallMapsNote = document.getElementById("overallMapsNote");
const overallTopItems = Array.from(document.querySelectorAll(".top-global .top-item"));

boot();

async function boot() {
  try {
    const [loadedYearsRaw, yearlyMapCounts] = await Promise.all([
      Promise.all(YEAR_FILES.map(loadYearFile)),
      loadMatchCounts(MATCHES_FILE),
    ]);

    const loadedYears = loadedYearsRaw.filter(Boolean);

    if (!loadedYears.length) {
      throw new Error("No se pudieron cargar los CSV.");
    }

    const overall = aggregateOverall(loadedYears);
    renderTimeline(loadedYears, yearlyMapCounts);
    renderOverallSummary(overall);
    renderOverallMapsNote(yearlyMapCounts);
  } catch (error) {
    if (timelineTop) timelineTop.innerHTML = `<div class="empty-state">${error.message}<br><br>Si abriste el HTML con doble clic, prueba servir la carpeta con un servidor local.</div>`;
    if (timelineBottom) timelineBottom.innerHTML = "";
    yearNodesContainer.innerHTML = "";
    console.error(error);
  }
}

function renderOverallSummary(entries) {
  if (!overallTopItems.length) return;

  overallTopItems.forEach((item, index) => {
    const entry = entries[index];
    if (!entry) return;

    const img = item.querySelector("img");
    const percent = item.querySelector(".top-percent");
    const label = item.querySelector(".top-label");

    if (img) {
      img.src = entry.asset;
      img.alt = capitalize(entry.agent);
    }

    if (percent) {
      percent.textContent = formatRate(entry.average);
    }

    if (label) {
      label.textContent = `#${index + 1} ${capitalize(entry.agent)}`;
    }
  });
}

function renderOverallMapsNote(yearlyMapCounts) {
  if (!overallMapsNote) return;

  const totalMaps = Object.values(yearlyMapCounts).reduce((sum, value) => {
    const count = Number(value) || 0;
    return sum + count;
  }, 0);

  overallMapsNote.textContent =
    totalMaps > 0 ? `Basado en ${totalMaps} mapas` : "Basado en mapas no disponibles";
}

async function loadYearFile({ year, file }) {
  try {
    const response = await fetch(file);
    if (!response.ok) {
      throw new Error(`No se encontró ${file}`);
    }
    const text = await response.text();
    const rows = parseCSV(text);
    const aggregate = aggregateYear(rows, year);
    if (!aggregate.topAgents.length) return null;
    return aggregate;
  } catch (error) {
    console.warn(`Omitiendo ${year}:`, error.message);
    return null;
  }
}

async function loadMatchCounts(file) {
  try {
    const response = await fetch(file);
    if (!response.ok) {
      throw new Error(`No se encontró ${file}`);
    }

    const text = await response.text();
    const rows = parseCSV(text);
    const counts = {};

    rows.forEach((row) => {
      const year = Number.parseInt(String(row.Year ?? "").trim(), 10);
      if (Number.isNaN(year)) return;
      counts[year] = (counts[year] || 0) + 1;
    });

    return counts;
  } catch (error) {
    console.warn("No se pudo cargar all_matches_games.csv:", error.message);
    return {};
  }
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
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  if (current.length || row.length) {
    row.push(current);
    if (row.some((cell) => cell !== "")) rows.push(row);
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

function aggregateYear(rows, year) {
  const preferred = rows.filter(
    (row) =>
      equalsIgnoreCase(row.Stage, "All Stages") &&
      equalsIgnoreCase(row["Match Type"], "All Match Types") &&
      equalsIgnoreCase(row.Map, "All Maps")
  );

  const sourceRows = preferred.length ? preferred : rows;
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
        map.set(entry.agent, { agent: entry.agent, values: [], asset: entry.asset });
      }
      map.get(entry.agent).values.push(entry.average);
    });
  });

  return [...map.values()]
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
  if (topNotes) topNotes.innerHTML = "";
  if (bottomNotes) bottomNotes.innerHTML = "";
  yearNodesContainer.innerHTML = "";

  const positions = distributePositions(years.length);

  years.forEach((block, index) => {
    const isAbove = index % 2 === 1;
    const left = `${positions[index]}%`;
    const mapCount = yearlyMapCounts[block.year] || 0;

    const yearNode = document.createElement("div");
    yearNode.className = "year-node";
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

    block.topAgents.forEach((agent, rank) => {
      const row = createRankBar({
        entry: agent,
        rank,
      });
      stack.appendChild(row);
    });

    const connectorEl = document.createElement("div");
    connectorEl.className = "year-connector-vertical";
    connectorEl.style.left = left;

    const metaNote = document.createElement("div");
    metaNote.className = "year-meta-note";
    metaNote.style.left = left;
    metaNote.textContent = mapCount ? `Basado en ${mapCount} mapas` : "Cantidad de mapas no disponible";

    group.appendChild(stack);

    if (isAbove) {
      timelineTop.appendChild(group);
      if (topConnectors) topConnectors.appendChild(connectorEl);
      if (topNotes) topNotes.appendChild(metaNote);
    } else {
      timelineBottom.appendChild(group);
      if (bottomConnectors) bottomConnectors.appendChild(connectorEl);
      if (bottomNotes) bottomNotes.appendChild(metaNote);
    }
  });
}

function createRankBar({ entry, rank }) {
  const row = document.createElement("div");
  row.className = "rank-row";

  const media = document.createElement("div");
  media.className = "rank-media";

  const img = document.createElement("img");
  img.src = entry.asset;
  img.alt = capitalize(entry.agent);
  img.loading = "lazy";
  img.className = "rank-avatar";

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

  labelRow.append(order, label);

  const bar = document.createElement("div");
  bar.className = "rank-bar";
  bar.style.setProperty("--bar-color", COLORS.annualBars[rank % COLORS.annualBars.length]);

  const fill = document.createElement("div");
  fill.className = "rank-bar-fill";
  fill.style.width = `${Math.max(0, Math.min(entry.average, 100))}%`;

  const value = document.createElement("span");
  value.className = "rank-value";
  value.textContent = formatRate(entry.average);

  bar.append(fill, value);
  barWrap.append(labelRow, bar);

  row.append(media, barWrap);
  return row;
}

function distributePositions(count) {
  if (count === 1) return [50];
  const start = 10;
  const end = 90;
  return Array.from({ length: count }, (_, index) => start + ((end - start) * index) / (count - 1));
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
  const filename = String(agent)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .split(/\s+/)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join("");

  return `assets/${filename}-icon.png`;
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