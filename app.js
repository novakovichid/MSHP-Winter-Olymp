const STORAGE_KEY = "mshp-olymp-state";
const CONFIG_URL = "config.json";
const BOARD_URL = "board.json";

const menu = document.getElementById("menu");
const game = document.getElementById("game");
const board = document.getElementById("board");
const costsList = document.getElementById("costs");
const commandsEl = document.getElementById("commands");
const programEl = document.getElementById("program");
const studentsInput = document.getElementById("students");
const pointsInput = document.getElementById("points");
const runBtn = document.getElementById("run");
const stepBtn = document.getElementById("step");
const clearBtn = document.getElementById("clear");
const removeBtn = document.getElementById("remove");
const resetBtn = document.getElementById("reset");
const fullscreenToggle = document.getElementById("fullscreenToggle");
const backBtn = document.getElementById("back");
const teamHeroes = document.getElementById("teamHeroes");
const heroTemplate = document.getElementById("heroTemplate");
const overseer = document.getElementById("overseer");
const seasonStep = document.getElementById("seasonStep");
const programStep = document.getElementById("programStep");
const programButtons = document.getElementById("programButtons");
const backToSeasonBtn = document.getElementById("backToSeason");
const isMenuPage = Boolean(menu);
const isGamePage = Boolean(game);

let config = null;
let boardConfig = null;
let state = null;
let programPointer = 0;
let isRunning = false;
let robotEl = null;
let finaleEl = null;
let resizeObserver = null;
let hasScaleObserver = false;

function getVariantConfig(variantId = state?.selectedVariant) {
  return config?.variants?.[variantId] ?? null;
}

function getBoardVariant(variantId = state?.selectedVariant) {
  return boardConfig?.variants?.[variantId] ?? null;
}

function getHeroes() {
  return getBoardVariant()?.heroes ?? [];
}

function getDefaultVariantId() {
  const ids = Object.keys(config?.variants ?? {});
  return ids.length > 0 ? ids[0] : null;
}

function isValidVariant(variantId) {
  return Boolean(config?.variants?.[variantId] && boardConfig?.variants?.[variantId]);
}

function buildInitialState(variantId) {
  const selectedVariant = variantId ?? getDefaultVariantId();
  const boardVariant = getBoardVariant(selectedVariant);
  return {
    program: [],
    position: boardVariant?.grid?.start ?? { x: 0, y: 0 },
    acquiredHeroes: [],
    availableCommands: [],
    boxOpened: false,
    points: 0,
    students: 10,
    selectedVariant
  };
}

function getCommandDefinitions() {
  return getVariantConfig()?.commands ?? [];
}

function getStageRules() {
  return getVariantConfig()?.stageRules ?? [];
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const parsed = JSON.parse(saved);
    const legacyVariant = parsed.selectedVariant ?? (parsed.selectedProgram ? `winter-${parsed.selectedProgram.toLowerCase()}` : null);
    const baseState = buildInitialState(legacyVariant);
    return {
      ...baseState,
      ...parsed,
      selectedVariant: legacyVariant ?? baseState.selectedVariant,
      position: parsed.position ?? baseState.position
    };
  }
  return buildInitialState(null);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function selectVariant(variantId) {
  const nextState = buildInitialState(variantId);
  state = {
    ...nextState,
    students: state?.students ?? nextState.students,
    points: state?.points ?? nextState.points
  };
  saveState();
  if (isMenuPage && !isGamePage) {
    const params = new URLSearchParams({ variant: variantId });
    window.location.href = `game.html?${params.toString()}`;
    return;
  }
  if (menu) {
    menu.classList.add("hidden");
  }
  if (game) {
    game.classList.remove("hidden");
  }
  setupGame();
}

function resetState() {
  state = buildInitialState(state.selectedVariant);
  saveState();
  setupGame();
}

function setupGame() {
  if (!isGamePage) {
    return;
  }
  studentsInput.value = state.students;
  pointsInput.value = state.points;
  renderOverseer();
  renderBoard();
  renderFinale();
  updateThresholds();
  renderCommandCosts();
  updateCommands();
  renderProgram();
  renderTeam();
  updateBoardScale();
}

function updateBoardScale() {
  if (!isGamePage) {
    return;
  }
  const field = document.querySelector(".board-area__field");
  const variant = getBoardVariant();
  if (!field || !variant?.grid) {
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
  const columns = Number(variant.grid.columns) || 1;
  const rows = Number(variant.grid.rows) || 1;
  const totalWidth = columns * baseCell + (columns - 1) * baseGap;
  const totalHeight = rows * baseCell + (rows - 1) * baseGap;
  const scale = Math.min(availableWidth / totalWidth, availableHeight / totalHeight);
  const nextScale = Math.max(0.6, Math.min(scale, 3));
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
  resizeObserver = new ResizeObserver(updateBoardScale);
  resizeObserver.observe(field);
  window.addEventListener("resize", updateBoardScale);
  hasScaleObserver = true;
}

function updateThresholds() {
  const variantConfig = getVariantConfig();
  if (!variantConfig) {
    return;
  }
  const commandCosts = variantConfig.commandCosts ?? {};
  const hasCosts = Object.keys(commandCosts).length > 0;

  if (hasCosts) {
    state.availableCommands = getCommandDefinitions()
      .filter((command) => {
        const cost = commandCosts[command.id];
        return Number.isFinite(cost) && state.points >= cost * state.students;
      })
      .map((command) => command.id);
  } else if (variantConfig.coefficients) {
    const thresholds = {
      commands: variantConfig.coefficients.commands * state.students,
      hero: variantConfig.coefficients.hero * state.students,
      final: variantConfig.coefficients.final * state.students
    };

    state.availableCommands = [];
    getStageRules().forEach((stage) => {
      if (state.points >= thresholds[stage.id]) {
        state.availableCommands.push(...stage.commands);
      }
    });
    state.availableCommands = [...new Set(state.availableCommands)];
  } else {
    state.availableCommands = [];
  }
  saveState();
}

function getCommandCost(commandId) {
  const cost = getVariantConfig()?.commandCosts?.[commandId];
  return Number.isFinite(cost) ? cost : 0;
}

function renderCommandCosts() {
  if (!costsList) {
    return;
  }
  costsList.innerHTML = "";
  getCommandDefinitions().forEach((command) => {
    const item = document.createElement("li");
    const cost = getCommandCost(command.id) * state.students;
    item.textContent = `${command.label} — ${cost}`;
    costsList.appendChild(item);
  });
}

function renderOverseer() {
  const variant = getBoardVariant();
  if (!overseer || !variant?.overseer) {
    return;
  }
  overseer.innerHTML = "";
  const img = document.createElement("img");
  img.src = variant.overseer.img;
  img.alt = variant.overseer.name;
  const text = document.createElement("p");
  text.className = "overseer__text";
  text.textContent = variant.overseer.caption;
  overseer.appendChild(text);
  overseer.appendChild(img);
}

function updateCommands() {
  if (!commandsEl) {
    return;
  }
  commandsEl.innerHTML = "";

  getCommandDefinitions().forEach((command) => {
    const isAvailable = state.availableCommands.includes(command.id);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = command.label;
    btn.className = `command-btn ${isAvailable ? "command-btn--available" : "command-btn--locked"}`;
    if (isAvailable) {
      btn.addEventListener("click", () => addToProgram(command.id));
    } else {
      btn.disabled = true;
      btn.setAttribute("aria-disabled", "true");
    }
    commandsEl.appendChild(btn);
  });
}

function renderBoard() {
  const variant = getBoardVariant();
  if (!variant?.grid || !board) {
    return;
  }
  board.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "grid";
  const columns = Number(variant.grid.columns) || 1;
  const rows = Number(variant.grid.rows) || 1;
  grid.style.setProperty("--grid-columns", columns);
  grid.style.setProperty("--grid-rows", rows);

  const uniquePath = new Map();
  variant.grid.path.forEach((cell) => {
    uniquePath.set(`${cell.x}:${cell.y}`, cell);
  });

  uniquePath.forEach((cell) => {
    const cellEl = document.createElement("div");
    cellEl.className = "cell grid-item";
    setGridPosition(cellEl, cell);
    grid.appendChild(cellEl);
  });

  if (variant.grid.stone) {
    const stone = createPiece("object", "pictures/stone.jpg", "Камень");
    stone.classList.add("object--stone");
    setGridPosition(stone, variant.grid.stone);
    grid.appendChild(stone);
  }

  if (variant.grid.box) {
    const box = createPiece("object", "pictures/box.png", "Ящик");
    box.classList.add("object--box");
    setGridPosition(box, variant.grid.box);
    grid.appendChild(box);
  }

  if (variant.grid.lock) {
    const lock = createPiece("object", "pictures/lock.jpg", "Замок");
    lock.classList.add("object--lock");
    setGridPosition(lock, variant.grid.lock);
    grid.appendChild(lock);
  }

  getHeroes().forEach((hero) => {
    const heroEl = createPiece("hero", hero.img, hero.name);
    heroEl.dataset.hero = hero.id;
    if (state.acquiredHeroes.includes(hero.id)) {
      heroEl.classList.add("hero--acquired");
    }
    setGridPosition(heroEl, hero.position);
    grid.appendChild(heroEl);

    if (state.boxOpened && state.acquiredHeroes.includes(hero.id)) {
      const energy = document.createElement("div");
      energy.className = "energy grid-item";
      setGridPosition(energy, { x: hero.position.x + 0.35, y: hero.position.y - 0.15 });
      grid.appendChild(energy);
    }
  });

  robotEl = createPiece("robot", "pictures/mini-robot.png", "Робот");
  robotEl.classList.add("robot");
  setGridPosition(robotEl, state.position);
  grid.appendChild(robotEl);

  board.appendChild(grid);
}

function renderFinale() {
  const field = document.querySelector(".board-area__field");
  if (!field) {
    return;
  }
  if (!finaleEl) {
    finaleEl = document.createElement("div");
    finaleEl.className = "finale";
    finaleEl.innerHTML = `
      <div class="finale__burst"></div>
      <div class="finale__card">
        <h4>Ящик открыт!</h4>
        <p>Сила команды раскрыта — герои готовы к финальной битве.</p>
      </div>
    `;
    field.appendChild(finaleEl);
  }
  finaleEl.classList.toggle("finale--active", Boolean(state.boxOpened));
}

function createPiece(className, imgSrc, label) {
  const piece = document.createElement("div");
  piece.className = `${className} grid-item`;
  const img = document.createElement("img");
  img.src = imgSrc;
  img.alt = label;
  piece.appendChild(img);
  return piece;
}

function setGridPosition(element, position, offsetY = 0) {
  element.style.setProperty("--grid-x", position.x);
  element.style.setProperty("--grid-y", position.y);
  element.style.setProperty("--grid-offset-y", `${offsetY}px`);
}

function renderProgram() {
  if (!programEl) {
    return;
  }
  programEl.innerHTML = "";
  state.program.forEach((commandId, index) => {
    const command = getCommandDefinitions().find((item) => item.id === commandId);
    const item = document.createElement("li");
    item.textContent = command ? command.label : commandId;
    if (index === programPointer && isRunning) {
      item.style.fontWeight = "700";
      item.style.color = "var(--primary)";
    }
    programEl.appendChild(item);
  });
}

function renderTeam() {
  if (!teamHeroes || !heroTemplate) {
    return;
  }
  teamHeroes.innerHTML = "";
  getHeroes().forEach((hero) => {
    const clone = heroTemplate.content.cloneNode(true);
    const wrapper = clone.querySelector(".hero");
    wrapper.className = "team__hero";
    wrapper.dataset.hero = hero.id;
    const img = wrapper.querySelector("img");
    const name = wrapper.querySelector("span");
    name.textContent = hero.name;
    if (state.acquiredHeroes.includes(hero.id)) {
      img.src = hero.img;
      img.alt = hero.name;
    } else {
      wrapper.classList.add("team__hero--empty");
      img.remove();
      name.remove();
    }
    teamHeroes.appendChild(clone);
  });
}

function resetProgramState() {
  programPointer = 0;
  isRunning = false;
  resetRobotPosition();
}

function addToProgram(commandId) {
  state.program.push(commandId);
  saveState();
  resetProgramState();
  renderProgram();
}

function clearProgram() {
  state.program = [];
  saveState();
  resetProgramState();
  renderProgram();
}

function removeLastCommand() {
  if (state.program.length === 0) {
    return;
  }
  state.program.pop();
  saveState();
  resetProgramState();
  renderProgram();
}

function canMoveTo(position) {
  const variant = getBoardVariant();
  return variant?.grid?.path?.some((cell) => cell.x === position.x && cell.y === position.y);
}

function executeCommand(commandId) {
  const current = state.position;
  let next = null;

  if (["up", "down", "left", "right"].includes(commandId)) {
    const delta = {
      up: { x: 0, y: -1 },
      down: { x: 0, y: 1 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 }
    }[commandId];

    next = { x: current.x + delta.x, y: current.y + delta.y };
    const stone = getBoardVariant()?.grid?.stone;
    if (stone && next.x === stone.x && next.y === stone.y) {
      return;
    }
    if (canMoveTo(next)) {
      state.position = next;
      moveRobot();
    }
  }

  if (commandId === "jump") {
    const directions = [
      { x: 0, y: -1 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 }
    ];

    directions.forEach((dir) => {
      const stonePos = { x: current.x + dir.x, y: current.y + dir.y };
      const landing = { x: current.x + dir.x * 2, y: current.y + dir.y * 2 };
      const stone = getBoardVariant()?.grid?.stone;
      if (stone && stonePos.x === stone.x && stonePos.y === stone.y && canMoveTo(landing)) {
        state.position = landing;
        moveRobot();
      }
    });
  }

  if (commandId === "hero") {
    const hero = getHeroes().find(
      (item) => item.position.x === current.x && item.position.y === current.y
    );
    if (hero && !state.acquiredHeroes.includes(hero.id)) {
      state.acquiredHeroes.push(hero.id);
      saveState();
      renderBoard();
      renderTeam();
      flashHero(hero.id);
    }
  }

  if (commandId === "storage") {
    const lock = getBoardVariant()?.grid?.lock;
    if (lock && current.x === lock.x && current.y === lock.y) {
      alert("Хранилище открыто! Теперь можно открыть ящик.");
    }
  }

  if (commandId === "box") {
    const box = getBoardVariant()?.grid?.box;
    if (box && current.x === box.x && current.y === box.y) {
      state.boxOpened = true;
      saveState();
      renderBoard();
      renderFinale();
    }
  }
}

function flashHero(heroId) {
  if (!board) {
    return;
  }
  const heroEl = board.querySelector(`.hero[data-hero='${heroId}']`);
  if (heroEl) {
    heroEl.classList.add("hero--flash");
    setTimeout(() => heroEl.classList.remove("hero--flash"), 800);
  }
}

function moveRobot() {
  if (!robotEl) {
    return;
  }
  setGridPosition(robotEl, state.position);
  saveState();
}

function resetRobotPosition() {
  const start = getBoardVariant()?.grid?.start;
  if (!start) {
    return;
  }
  state.position = { ...start };
  moveRobot();
}

async function runProgram() {
  if (isRunning || state.program.length === 0) {
    return;
  }
  resetRobotPosition();
  isRunning = true;
  programPointer = 0;
  renderProgram();

  for (let i = 0; i < state.program.length; i += 1) {
    programPointer = i;
    renderProgram();
    executeCommand(state.program[i]);
    await new Promise((resolve) => setTimeout(resolve, 650));
  }
  isRunning = false;
  programPointer = 0;
  renderProgram();
}

function stepProgram() {
  if (state.program.length === 0) {
    return;
  }
  if (programPointer >= state.program.length) {
    programPointer = 0;
  }
  executeCommand(state.program[programPointer]);
  programPointer += 1;
  renderProgram();
}

function handleInputChange() {
  state.students = Number(studentsInput.value);
  state.points = Number(pointsInput.value);
  saveState();
  updateThresholds();
  renderCommandCosts();
  updateCommands();
}

function handleReset() {
  const confirmed = confirm("Сбросить прогресс игры?");
  if (confirmed) {
    resetState();
  }
}

function toggleFullscreen() {
  if (document.fullscreenEnabled) {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {
        const nextState = !document.body.classList.contains("is-fullscreen");
        setFullscreenState(nextState);
      });
    } else {
      document.exitFullscreen().catch(() => {
        const nextState = !document.body.classList.contains("is-fullscreen");
        setFullscreenState(nextState);
      });
    }
    return;
  }
  const nextState = !document.body.classList.contains("is-fullscreen");
  setFullscreenState(nextState);
}

function setFullscreenState(isFullscreen) {
  document.body.classList.toggle("is-fullscreen", isFullscreen);
  if (fullscreenToggle) {
    fullscreenToggle.textContent = isFullscreen ? "Вернуться" : "Во весь экран";
    fullscreenToggle.setAttribute("aria-pressed", String(isFullscreen));
  }
  updateBoardScale();
}

async function init() {
  const [configResponse, boardResponse] = await Promise.all([
    fetch(CONFIG_URL),
    fetch(BOARD_URL)
  ]);
  config = await configResponse.json();
  boardConfig = await boardResponse.json();
  state = loadState();
  if (state.selectedVariant && !isValidVariant(state.selectedVariant)) {
    const fallback = buildInitialState(null);
    state = {
      ...fallback,
      students: state.students ?? fallback.students,
      points: state.points ?? fallback.points,
      selectedVariant: null
    };
    saveState();
  }
  const urlParams = new URLSearchParams(window.location.search);
  const variantParam = urlParams.get("variant");

  const seasonPrograms = {
    winter: ["J3", "J4"],
    spring: ["J3", "J4", "P3"]
  };

  function showSeasonSelection() {
    if (!seasonStep || !programStep || !programButtons) {
      return;
    }
    seasonStep.classList.remove("hidden");
    programStep.classList.add("hidden");
    programButtons.innerHTML = "";
    if (game) {
      game.classList.add("hidden");
    }
  }

  function showProgramSelection(season) {
    if (!seasonStep || !programStep || !programButtons) {
      return;
    }
    seasonStep.classList.add("hidden");
    programStep.classList.remove("hidden");
    programButtons.innerHTML = "";
    const programs = seasonPrograms[season] ?? [];
    programs.forEach((program) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn--primary";
      btn.textContent = program;
      btn.addEventListener("click", () => {
        const variantId = `${season}-${program.toLowerCase()}`;
        selectVariant(variantId);
      });
      programButtons.appendChild(btn);
    });
  }

  if (isMenuPage) {
    document.querySelectorAll("[data-season]").forEach((button) => {
      button.addEventListener("click", () => showProgramSelection(button.dataset.season));
    });
  }

  if (backToSeasonBtn) {
    backToSeasonBtn.addEventListener("click", showSeasonSelection);
  }

  if (backBtn) {
    backBtn.addEventListener("click", () => {
      window.location.href = "index.html";
    });
  }

  if (fullscreenToggle) {
    fullscreenToggle.addEventListener("click", toggleFullscreen);
  }

  if (studentsInput) {
    studentsInput.addEventListener("input", handleInputChange);
  }
  if (pointsInput) {
    pointsInput.addEventListener("input", handleInputChange);
  }
  if (clearBtn) {
    clearBtn.addEventListener("click", clearProgram);
  }
  if (removeBtn) {
    removeBtn.addEventListener("click", removeLastCommand);
  }
  if (runBtn) {
    runBtn.addEventListener("click", runProgram);
  }
  if (stepBtn) {
    stepBtn.addEventListener("click", stepProgram);
  }
  if (resetBtn) {
    resetBtn.addEventListener("click", handleReset);
  }

  if (isMenuPage && !isGamePage) {
    showSeasonSelection();
    return;
  }

  if (isGamePage) {
    document.body.classList.add("game-mode");
    ensureScaleObserver();
    document.addEventListener("fullscreenchange", () => {
      setFullscreenState(Boolean(document.fullscreenElement));
    });
    if (variantParam && !isValidVariant(variantParam)) {
      window.location.href = "index.html";
      return;
    }
    if (variantParam && variantParam !== state.selectedVariant) {
      selectVariant(variantParam);
      return;
    }
    if (!variantParam && state.selectedVariant && isValidVariant(state.selectedVariant)) {
      selectVariant(state.selectedVariant);
      return;
    }
    if (!state.selectedVariant) {
      window.location.href = "index.html";
      return;
    }
    setupGame();
  }
}

init();
