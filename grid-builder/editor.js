const CONFIG_URL = "../config.json";
const BOARD_URL = "../board.json";

const DEFAULT_ASSETS = {
  robot: { img: "pictures/mini-robot.png", label: "Робот" },
  stone: { img: "pictures/stone.jpg", label: "Камень" },
  hyperspace: { img: "pictures/гиперпрыжок.jpg", label: "Гиперпространство" }
};

const TOOL_DEFINITIONS = [
  { id: "path", label: "Путь" },
  { id: "start", label: "Старт" },
  { id: "object", label: "Объект" },
  { id: "hero", label: "Герой" },
  { id: "planet", label: "Планета" },
  { id: "erase", label: "Ластик" }
];

const labelMap = {
  stone: "Камень",
  box: "Ящик",
  lock: "Замок",
  hyperspace: "Гиперпространство"
};

const state = {
  columns: 10,
  rows: 8,
  path: new Set(),
  start: null,
  gridObjects: {},
  heroes: [],
  planets: [],
  assets: {},
  overseer: null,
  selectedTool: "path",
  selectedGridObject: null,
  selectedHero: null,
  selectedPlanet: null
};

const dom = {
  variantSelect: document.getElementById("variantSelect"),
  loadVariant: document.getElementById("loadVariant"),
  resetBoard: document.getElementById("resetBoard"),
  columnsInput: document.getElementById("columnsInput"),
  rowsInput: document.getElementById("rowsInput"),
  applyGrid: document.getElementById("applyGrid"),
  toolButtons: document.getElementById("toolButtons"),
  toolSettings: document.getElementById("toolSettings"),
  assetControls: document.getElementById("assetControls"),
  overseerSelect: document.getElementById("overseerSelect"),
  board: document.getElementById("builderBoard"),
  output: document.getElementById("output"),
  copyJson: document.getElementById("copyJson"),
  status: document.getElementById("status")
};

let boardConfig = null;
let resourceCatalog = null;
let config = null;
let hasScaleObserver = false;

function normalizeAssetPath(path) {
  if (!path) {
    return "";
  }
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:")) {
    return path;
  }
  if (path.startsWith("/")) {
    return path;
  }
  return `../${path}`;
}

function positionKey(position) {
  return `${position.x}:${position.y}`;
}

function parseKey(key) {
  const [x, y] = key.split(":").map(Number);
  return { x, y };
}

function sortPositions(a, b) {
  if (a.y !== b.y) {
    return a.y - b.y;
  }
  return a.x - b.x;
}

function buildResourceCatalog(boardData) {
  const heroes = new Map();
  const planets = new Map();
  const overseers = new Map();
  const assetKeys = new Set(Object.keys(DEFAULT_ASSETS));
  const assetsByKey = {};
  const gridObjectKeys = new Set();

  Object.values(boardData.variants ?? {}).forEach((variant) => {
    (variant.heroes ?? []).forEach((hero) => {
      const key = hero.id ?? hero.name ?? hero.img;
      if (key && !heroes.has(key)) {
        heroes.set(key, hero);
      }
    });

    (variant.planets ?? []).forEach((planet) => {
      const key = planet.id ?? planet.name ?? planet.img;
      if (key && !planets.has(key)) {
        planets.set(key, planet);
      }
    });

    if (variant.overseer) {
      const key = variant.overseer.name ?? variant.overseer.img;
      if (key && !overseers.has(key)) {
        overseers.set(key, variant.overseer);
      }
    }

    Object.entries(variant.assets ?? {}).forEach(([key, asset]) => {
      assetKeys.add(key);
      if (!assetsByKey[key]) {
        assetsByKey[key] = new Map();
      }
      if (asset?.img) {
        const assetKey = asset.img;
        if (!assetsByKey[key].has(assetKey)) {
          assetsByKey[key].set(assetKey, asset);
        }
      }
    });

    Object.entries(variant.grid ?? {}).forEach(([key, value]) => {
      if (["columns", "rows", "path", "start"].includes(key)) {
        return;
      }
      if (value && typeof value === "object") {
        gridObjectKeys.add(key);
      }
    });
  });

  Object.entries(DEFAULT_ASSETS).forEach(([key, asset]) => {
    if (!assetsByKey[key]) {
      assetsByKey[key] = new Map();
    }
    assetsByKey[key].set(asset.img, asset);
  });

  return {
    heroes: Array.from(heroes.values()),
    planets: Array.from(planets.values()),
    overseers: Array.from(overseers.values()),
    assetKeys: Array.from(assetKeys),
    assetsByKey,
    gridObjectKeys: Array.from(gridObjectKeys)
  };
}

function setActiveTool(toolId) {
  state.selectedTool = toolId;
  Array.from(dom.toolButtons.querySelectorAll("button")).forEach((btn) => {
    btn.classList.toggle("editor-tool--active", btn.dataset.tool === toolId);
  });
  renderToolSettings();
}

function renderToolButtons() {
  dom.toolButtons.innerHTML = "";
  TOOL_DEFINITIONS.forEach((tool) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = tool.label;
    button.dataset.tool = tool.id;
    button.className = "editor-tool";
    button.addEventListener("click", () => setActiveTool(tool.id));
    dom.toolButtons.appendChild(button);
  });
  setActiveTool(state.selectedTool);
}

function renderToolSettings() {
  dom.toolSettings.innerHTML = "";

  if (state.selectedTool === "object") {
    const wrapper = document.createElement("div");
    wrapper.className = "input-group";
    const label = document.createElement("label");
    label.textContent = "Тип объекта";
    const select = document.createElement("select");
    select.className = "editor-select";

    const keys = resourceCatalog.gridObjectKeys.length
      ? resourceCatalog.gridObjectKeys
      : ["stone", "box", "lock", "hyperspace"];

    keys.forEach((key) => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = labelMap[key] ?? key;
      select.appendChild(option);
    });

    select.value = state.selectedGridObject ?? keys[0];
    state.selectedGridObject = select.value;
    select.addEventListener("change", () => {
      state.selectedGridObject = select.value;
    });

    wrapper.appendChild(label);
    wrapper.appendChild(select);
    dom.toolSettings.appendChild(wrapper);
  }

  if (state.selectedTool === "hero") {
    if (resourceCatalog.heroes.length === 0) {
      const note = document.createElement("small");
      note.textContent = "В данных нет героев.";
      dom.toolSettings.appendChild(note);
      return;
    }
    const wrapper = document.createElement("div");
    wrapper.className = "input-group";
    const label = document.createElement("label");
    label.textContent = "Герой";
    const select = document.createElement("select");
    select.className = "editor-select";

    resourceCatalog.heroes.forEach((hero) => {
      const option = document.createElement("option");
      option.value = hero.id ?? hero.name ?? hero.img;
      option.textContent = hero.name ?? hero.id ?? "Герой";
      select.appendChild(option);
    });

    if (!state.selectedHero) {
      state.selectedHero = select.value;
    }
    select.value = state.selectedHero ?? select.value;
    select.addEventListener("change", () => {
      state.selectedHero = select.value;
    });

    wrapper.appendChild(label);
    wrapper.appendChild(select);
    dom.toolSettings.appendChild(wrapper);
  }

  if (state.selectedTool === "planet") {
    if (resourceCatalog.planets.length === 0) {
      const note = document.createElement("small");
      note.textContent = "В данных нет планет.";
      dom.toolSettings.appendChild(note);
      return;
    }
    const wrapper = document.createElement("div");
    wrapper.className = "input-group";
    const label = document.createElement("label");
    label.textContent = "Планета";
    const select = document.createElement("select");
    select.className = "editor-select";

    resourceCatalog.planets.forEach((planet) => {
      const option = document.createElement("option");
      option.value = planet.id ?? planet.name ?? planet.img;
      option.textContent = planet.name ?? planet.id ?? "Планета";
      select.appendChild(option);
    });

    if (!state.selectedPlanet) {
      state.selectedPlanet = select.value;
    }
    select.value = state.selectedPlanet ?? select.value;
    select.addEventListener("change", () => {
      state.selectedPlanet = select.value;
    });

    wrapper.appendChild(label);
    wrapper.appendChild(select);
    dom.toolSettings.appendChild(wrapper);
  }
}

function renderAssetControls() {
  dom.assetControls.innerHTML = "";
  resourceCatalog.assetKeys.forEach((key) => {
    const row = document.createElement("div");
    row.className = "editor-resource-row";
    const label = document.createElement("label");
    label.textContent = labelMap[key] ? `Ассет: ${labelMap[key]}` : `Ассет: ${key}`;
    const select = document.createElement("select");
    select.className = "editor-select";

    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "Не переопределять";
    select.appendChild(emptyOption);

    const assetMap = resourceCatalog.assetsByKey[key] ?? new Map();
    Array.from(assetMap.values()).forEach((asset) => {
      const option = document.createElement("option");
      option.value = asset.img;
      option.textContent = asset.label ?? asset.img;
      select.appendChild(option);
    });

    select.value = state.assets[key]?.img ?? "";
    select.addEventListener("change", () => {
      if (!select.value) {
        delete state.assets[key];
      } else {
        const asset = assetMap.get(select.value);
        if (asset) {
          state.assets[key] = { ...asset };
        }
      }
      renderBoard();
      updateOutput();
    });

    row.appendChild(label);
    row.appendChild(select);
    dom.assetControls.appendChild(row);
  });
}

function renderVariantOptions() {
  dom.variantSelect.innerHTML = "";
  Object.entries(boardConfig.variants ?? {}).forEach(([variantId, variant]) => {
    const option = document.createElement("option");
    option.value = variantId;
    const configLabel = config?.variants?.[variantId]?.label;
    if (configLabel) {
      option.textContent = configLabel;
    } else {
      option.textContent = variantId;
    }
    dom.variantSelect.appendChild(option);
  });
}

function renderOverseerOptions() {
  dom.overseerSelect.innerHTML = "";
  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = "Не указывать";
  dom.overseerSelect.appendChild(emptyOption);

  resourceCatalog.overseers.forEach((overseer) => {
    const option = document.createElement("option");
    option.value = getOverseerValue(overseer);
    option.textContent = overseer.name ?? "Надзиратель";
    dom.overseerSelect.appendChild(option);
  });

  dom.overseerSelect.value = state.overseer ? getOverseerValue(state.overseer) : "";
}

function setGridPosition(element, position) {
  element.style.setProperty("--grid-x", position.x);
  element.style.setProperty("--grid-y", position.y);
}

function createPiece(className, imgSrc, label) {
  const piece = document.createElement("div");
  piece.className = `${className} grid-item editor-piece`;
  if (imgSrc) {
    const img = document.createElement("img");
    img.src = normalizeAssetPath(imgSrc);
    img.alt = label ?? "";
    piece.appendChild(img);
  } else {
    const fallback = document.createElement("span");
    fallback.textContent = label ?? "";
    fallback.style.fontSize = "10px";
    fallback.style.textAlign = "center";
    piece.appendChild(fallback);
  }
  return piece;
}

function findResourceByKey(list, key) {
  return list.find((item) => (item.id ?? item.name ?? item.img) === key) ?? null;
}

function getOverseerValue(overseer) {
  return overseer?.name ?? overseer?.img ?? "";
}

function togglePath(position) {
  const key = positionKey(position);
  if (state.path.has(key)) {
    state.path.delete(key);
  } else {
    state.path.add(key);
  }
}

function placeSingleObject(key, position) {
  const current = state.gridObjects[key];
  if (current && current.x === position.x && current.y === position.y) {
    delete state.gridObjects[key];
  } else {
    state.gridObjects[key] = { ...position };
  }
}

function placeHero(position) {
  if (!state.selectedHero) {
    return;
  }
  const hero = findResourceByKey(resourceCatalog.heroes, state.selectedHero);
  if (!hero) {
    return;
  }
  state.heroes = state.heroes.filter((item) => positionKey(item.position) !== positionKey(position));
  const existingIndex = state.heroes.findIndex((item) => item.id === hero.id);
  const payload = {
    id: hero.id ?? hero.name ?? hero.img,
    name: hero.name ?? hero.id,
    img: hero.img,
    position: { ...position }
  };
  if (existingIndex >= 0) {
    state.heroes[existingIndex] = payload;
  } else {
    state.heroes.push(payload);
  }
}

function placePlanet(position) {
  if (!state.selectedPlanet) {
    return;
  }
  const planet = findResourceByKey(resourceCatalog.planets, state.selectedPlanet);
  if (!planet) {
    return;
  }
  state.planets = state.planets.filter((item) => positionKey(item.position) !== positionKey(position));
  const existingIndex = state.planets.findIndex((item) => item.id === planet.id);
  const payload = {
    id: planet.id ?? planet.name ?? planet.img,
    name: planet.name ?? planet.id,
    img: planet.img,
    heroId: planet.heroId,
    position: { ...position }
  };
  if (existingIndex >= 0) {
    state.planets[existingIndex] = payload;
  } else {
    state.planets.push(payload);
  }
}

function eraseAt(position) {
  state.path.delete(positionKey(position));
  if (state.start && positionKey(state.start) === positionKey(position)) {
    state.start = null;
  }
  Object.keys(state.gridObjects).forEach((key) => {
    if (positionKey(state.gridObjects[key]) === positionKey(position)) {
      delete state.gridObjects[key];
    }
  });
  state.heroes = state.heroes.filter((hero) => positionKey(hero.position) !== positionKey(position));
  state.planets = state.planets.filter((planet) => positionKey(planet.position) !== positionKey(position));
}

function handleCellClick(position) {
  if (state.selectedTool === "path") {
    togglePath(position);
  }
  if (state.selectedTool === "start") {
    if (state.start && positionKey(state.start) === positionKey(position)) {
      state.start = null;
    } else {
      state.start = { ...position };
    }
  }
  if (state.selectedTool === "object") {
    if (!state.selectedGridObject) {
      return;
    }
    placeSingleObject(state.selectedGridObject, position);
  }
  if (state.selectedTool === "hero") {
    placeHero(position);
  }
  if (state.selectedTool === "planet") {
    placePlanet(position);
  }
  if (state.selectedTool === "erase") {
    eraseAt(position);
  }
  renderBoard();
  updateOutput();
}

function renderCells(grid) {
  for (let y = 1; y <= state.rows; y += 1) {
    for (let x = 1; x <= state.columns; x += 1) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell editor-cell grid-item";
      const position = { x, y };
      const key = positionKey(position);
      if (state.path.has(key)) {
        cell.classList.add("editor-cell--path");
      }
      if (state.start && positionKey(state.start) === key) {
        cell.classList.add("editor-cell--start");
      }
      if (Object.values(state.gridObjects).some((obj) => obj && positionKey(obj) === key)) {
        cell.classList.add("editor-cell--highlight");
      }
      cell.dataset.x = x;
      cell.dataset.y = y;
      setGridPosition(cell, position);
      cell.addEventListener("click", () => handleCellClick(position));
      grid.appendChild(cell);
    }
  }
}

function renderGridObjects(grid) {
  Object.entries(state.gridObjects).forEach(([key, position]) => {
    if (!position) {
      return;
    }
    let asset = null;
    if (state.assets[key]) {
      asset = state.assets[key];
    } else if (DEFAULT_ASSETS[key]) {
      asset = DEFAULT_ASSETS[key];
    }

    if (key === "box") {
      asset = { img: "pictures/box.png", label: "Ящик" };
    }
    if (key === "lock") {
      asset = { img: "pictures/lock.jpg", label: "Замок" };
    }

    const label = asset?.label ?? labelMap[key] ?? key;
    const piece = createPiece("object", asset?.img, label);
    if (key === "stone") {
      piece.classList.add("object--stone");
    }
    if (key === "box") {
      piece.classList.add("object--box");
    }
    if (key === "lock") {
      piece.classList.add("object--lock");
    }
    if (key === "hyperspace") {
      piece.classList.add("object--hyperspace");
    }
    setGridPosition(piece, position);
    grid.appendChild(piece);
  });
}

function renderHeroes(grid) {
  state.heroes.forEach((hero) => {
    const piece = createPiece("hero", hero.img, hero.name);
    setGridPosition(piece, hero.position);
    grid.appendChild(piece);
  });
}

function renderPlanets(grid) {
  state.planets.forEach((planet) => {
    const piece = createPiece("planet", planet.img, planet.name);
    setGridPosition(piece, planet.position);
    grid.appendChild(piece);
  });
}

function renderRobot(grid) {
  if (!state.start) {
    return;
  }
  const asset = state.assets.robot ?? DEFAULT_ASSETS.robot;
  const robot = createPiece("robot", asset.img, asset.label);
  if (asset.className) {
    robot.classList.add(asset.className);
  }
  if (asset.rotates) {
    robot.classList.add("robot--rotating");
    robot.style.setProperty("--robot-rotation", "0deg");
  }
  setGridPosition(robot, state.start);
  grid.appendChild(robot);
}

function renderBoard() {
  if (!dom.board) {
    return;
  }
  dom.board.innerHTML = "";
  dom.board.style.setProperty("--grid-columns", state.columns);
  dom.board.style.setProperty("--grid-rows", state.rows);
  const grid = document.createElement("div");
  grid.className = "grid";
  grid.style.setProperty("--grid-columns", state.columns);
  grid.style.setProperty("--grid-rows", state.rows);

  renderCells(grid);
  renderPlanets(grid);
  renderGridObjects(grid);
  renderHeroes(grid);
  renderRobot(grid);

  dom.board.appendChild(grid);
  updateBoardScale();
}

function buildSnippet() {
  const grid = {
    columns: state.columns,
    rows: state.rows,
    path: Array.from(state.path).map(parseKey).sort(sortPositions)
  };

  if (state.start) {
    grid.start = { ...state.start };
  }

  Object.entries(state.gridObjects).forEach(([key, position]) => {
    if (position) {
      grid[key] = { ...position };
    }
  });

  const snippet = { grid };

  if (state.heroes.length > 0) {
    snippet.heroes = state.heroes.map((hero) => ({
      id: hero.id,
      name: hero.name,
      img: hero.img,
      position: { ...hero.position }
    }));
  }

  if (state.planets.length > 0) {
    snippet.planets = state.planets.map((planet) => {
      const payload = {
        id: planet.id,
        name: planet.name,
        img: planet.img,
        position: { ...planet.position }
      };
      if (planet.heroId) {
        payload.heroId = planet.heroId;
      }
      return payload;
    });
  }

  const assetEntries = Object.entries(state.assets).filter(([, asset]) => asset);
  if (assetEntries.length > 0) {
    snippet.assets = assetEntries.reduce((acc, [key, asset]) => {
      acc[key] = { ...asset };
      return acc;
    }, {});
  }

  if (state.overseer) {
    snippet.overseer = { ...state.overseer };
  }

  return snippet;
}

function updateOutput() {
  const snippet = buildSnippet();
  dom.output.value = JSON.stringify(snippet, null, 2);
}

function updateStatus(message) {
  dom.status.textContent = message;
}

function pruneOutOfBounds() {
  const maxX = state.columns;
  const maxY = state.rows;
  state.path = new Set(Array.from(state.path).filter((key) => {
    const { x, y } = parseKey(key);
    return x <= maxX && y <= maxY;
  }));

  if (state.start && (state.start.x > maxX || state.start.y > maxY)) {
    state.start = null;
  }

  Object.entries(state.gridObjects).forEach(([key, value]) => {
    if (value.x > maxX || value.y > maxY) {
      delete state.gridObjects[key];
    }
  });

  state.heroes = state.heroes.filter((hero) => hero.position.x <= maxX && hero.position.y <= maxY);
  state.planets = state.planets.filter((planet) => planet.position.x <= maxX && planet.position.y <= maxY);
}

function applyVariant(variantId) {
  const variant = boardConfig.variants?.[variantId];
  if (!variant?.grid) {
    return;
  }
  state.columns = variant.grid.columns ?? state.columns;
  state.rows = variant.grid.rows ?? state.rows;
  dom.columnsInput.value = state.columns;
  dom.rowsInput.value = state.rows;

  state.path = new Set((variant.grid.path ?? []).map(positionKey));
  state.start = variant.grid.start ? { ...variant.grid.start } : null;
  state.gridObjects = {};

  Object.entries(variant.grid).forEach(([key, value]) => {
    if (["columns", "rows", "path", "start"].includes(key)) {
      return;
    }
    if (value && typeof value === "object") {
      state.gridObjects[key] = { ...value };
    }
  });

  state.heroes = (variant.heroes ?? []).map((hero) => ({
    id: hero.id,
    name: hero.name,
    img: hero.img,
    position: { ...hero.position }
  }));

  state.planets = (variant.planets ?? []).map((planet) => ({
    id: planet.id,
    name: planet.name,
    img: planet.img,
    heroId: planet.heroId,
    position: { ...planet.position }
  }));

  state.assets = { ...(variant.assets ?? {}) };
  state.overseer = variant.overseer ? { ...variant.overseer } : null;

  renderAssetControls();
  renderOverseerOptions();
  renderBoard();
  updateOutput();
}

function resetBoard() {
  state.path.clear();
  state.start = null;
  state.gridObjects = {};
  state.heroes = [];
  state.planets = [];
  state.assets = {};
  state.overseer = null;
  renderAssetControls();
  renderOverseerOptions();
  renderBoard();
  updateOutput();
}

function updateBoardScale() {
  const field = document.querySelector(".board-area__field");
  if (!field) {
    return;
  }
  const availableWidth = field.clientWidth;
  const availableHeight = field.clientHeight;
  if (!availableWidth || !availableHeight) {
    return;
  }
  const rootStyles = getComputedStyle(document.documentElement);
  const baseCell = parseFloat(rootStyles.getPropertyValue("--cell-size-base")) || 36;
  const baseGap = parseFloat(rootStyles.getPropertyValue("--cell-gap-base")) || 4;
  const totalWidth = state.columns * baseCell + (state.columns - 1) * baseGap;
  const totalHeight = state.rows * baseCell + (state.rows - 1) * baseGap;
  const scale = Math.min(availableWidth / totalWidth, availableHeight / totalHeight);
  const paddedScale = scale * 0.98;
  const nextScale = Math.max(0.6, Math.min(paddedScale, 3));
  document.body.style.setProperty("--scale", nextScale.toFixed(3));
}

function ensureScaleObserver() {
  if (hasScaleObserver) {
    return;
  }
  const field = document.querySelector(".board-area__field");
  if (!field) {
    return;
  }
  const resizeObserver = new ResizeObserver(updateBoardScale);
  resizeObserver.observe(field);
  window.addEventListener("resize", updateBoardScale);
  hasScaleObserver = true;
}

function bindEvents() {
  dom.loadVariant.addEventListener("click", () => {
    applyVariant(dom.variantSelect.value);
  });

  dom.resetBoard.addEventListener("click", () => {
    resetBoard();
  });

  dom.applyGrid.addEventListener("click", () => {
    state.columns = Number(dom.columnsInput.value) || 1;
    state.rows = Number(dom.rowsInput.value) || 1;
    pruneOutOfBounds();
    renderBoard();
    updateOutput();
  });

  dom.overseerSelect.addEventListener("change", () => {
    const value = dom.overseerSelect.value;
    state.overseer = value
      ? resourceCatalog.overseers.find((item) => getOverseerValue(item) === value)
      : null;
    updateOutput();
  });

  dom.copyJson.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(dom.output.value);
      updateStatus("JSON скопирован в буфер обмена.");
    } catch (error) {
      updateStatus("Не удалось скопировать JSON. Выделите и скопируйте вручную.");
    }
  });
}

async function init() {
  try {
    const configResponse = await fetch(CONFIG_URL, { cache: "no-store" });
    config = await configResponse.json();
    const boardResponse = await fetch(BOARD_URL, { cache: "no-store" });
    boardConfig = await boardResponse.json();
  } catch (error) {
    updateStatus("Не удалось загрузить данные. Проверьте запуск через сервер.");
    return;
  }

  resourceCatalog = buildResourceCatalog(boardConfig);
  renderVariantOptions();
  renderToolButtons();
  renderToolSettings();
  renderAssetControls();
  renderOverseerOptions();
  bindEvents();
  renderBoard();
  updateOutput();
  ensureScaleObserver();
}

init();
