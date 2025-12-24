const STORAGE_KEY = "mshp-olymp-state";
const CONFIG_URL = "config.json";
const BOARD_URL = "board.json";

const menu = document.getElementById("menu");
const game = document.getElementById("game");
const board = document.getElementById("board");
const costsList = document.getElementById("costs");
const lockedCommandsEl = document.getElementById("lockedCommands");
const availableCommandsEl = document.getElementById("availableCommands");
const programEl = document.getElementById("program");
const studentsInput = document.getElementById("students");
const pointsInput = document.getElementById("points");
const scaleInput = document.getElementById("scale");
const runBtn = document.getElementById("run");
const stepBtn = document.getElementById("step");
const clearBtn = document.getElementById("clear");
const resetBtn = document.getElementById("reset");
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
const isCombinedPage = isMenuPage && isGamePage;

let config = null;
let boardConfig = null;
let state = null;
let programPointer = 0;
let isRunning = false;
let robotEl = null;

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
    selectedVariant,
    scale: 100
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
    points: state?.points ?? nextState.points,
    scale: state?.scale ?? nextState.scale
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
  scaleInput.value = state.scale;
  renderOverseer();
  renderBoard();
  updateThresholds();
  renderCommandCosts();
  updateCommands();
  renderProgram();
  renderTeam();
  updateScale();
}

function updateScale() {
  document.documentElement.style.setProperty("--scale", state.scale / 100);
}

function updateThresholds() {
  const variantConfig = getVariantConfig();
  if (!variantConfig?.coefficients) {
    return;
  }
  const thresholds = {
    stage1: variantConfig.coefficients.stage1 * state.students,
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
  overseer.appendChild(img);
  overseer.appendChild(text);
}

function updateCommands() {
  if (!lockedCommandsEl || !availableCommandsEl) {
    return;
  }
  lockedCommandsEl.innerHTML = "";
  availableCommandsEl.innerHTML = "";

  getCommandDefinitions().forEach((command) => {
    const isAvailable = state.availableCommands.includes(command.id);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = command.label;
    btn.className = `command-btn ${isAvailable ? "command-btn--available" : "command-btn--locked"}`;
    if (isAvailable) {
      btn.addEventListener("click", () => addToProgram(command.id));
      availableCommandsEl.appendChild(btn);
    } else {
      lockedCommandsEl.appendChild(btn);
    }
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

  variant.grid.path.forEach((cell) => {
    const cellEl = document.createElement("div");
    cellEl.className = "cell";
    placeAt(cellEl, cell);
    grid.appendChild(cellEl);
  });

  const stone = createPiece("object", "pictures/stone.jpg", "Камень");
  stone.classList.add("object--stone");
  placeAt(stone, variant.grid.stone);
  grid.appendChild(stone);

  const box = createPiece("object", "pictures/box.png", "Ящик");
  box.classList.add("object--box");
  placeAt(box, variant.grid.box);
  const lock = document.createElement("img");
  lock.src = "pictures/lock.jpg";
  lock.alt = "Замок";
  lock.className = "object--lock";
  box.appendChild(lock);
  grid.appendChild(box);

  getHeroes().forEach((hero) => {
    const heroEl = createPiece("hero", hero.img, hero.name);
    heroEl.dataset.hero = hero.id;
    if (state.acquiredHeroes.includes(hero.id)) {
      heroEl.classList.add("hero--acquired");
    }
    placeAt(heroEl, hero.position);
    grid.appendChild(heroEl);

    if (state.boxOpened && state.acquiredHeroes.includes(hero.id)) {
      const energy = document.createElement("div");
      energy.className = "energy";
      placeAt(energy, { x: hero.position.x + 0.35, y: hero.position.y - 0.15 }, 0, true);
      grid.appendChild(energy);
    }
  });

  robotEl = createPiece("robot", "pictures/mini-robot.png", "Робот");
  robotEl.classList.add("robot");
  placeAt(robotEl, state.position);
  grid.appendChild(robotEl);

  board.appendChild(grid);
}

function createPiece(className, imgSrc, label) {
  const piece = document.createElement("div");
  piece.className = className;
  const img = document.createElement("img");
  img.src = imgSrc;
  img.alt = label;
  piece.appendChild(img);
  return piece;
}

function placeAt(element, position, offsetY = 0, isTiny = false) {
  const size = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cell-size"));
  const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cell-gap"));
  const x = position.x * (size + gap);
  const y = position.y * (size + gap) + offsetY;

  if (element.classList.contains("robot")) {
    element.style.transform = `translate(${x}px, ${y}px)`;
  } else {
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
  }
  if (isTiny) {
    element.style.width = "22px";
    element.style.height = "22px";
  }
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
  teamHeroes.querySelectorAll(".team__hero:not([data-hero='supershish'])").forEach((hero) => hero.remove());
  state.acquiredHeroes.forEach((heroId) => {
    const hero = getHeroes().find((item) => item.id === heroId);
    if (!hero) return;
    const clone = heroTemplate.content.cloneNode(true);
    const wrapper = clone.querySelector(".hero");
    wrapper.className = "team__hero";
    wrapper.dataset.hero = hero.id;
    wrapper.querySelector("img").src = hero.img;
    wrapper.querySelector("img").alt = hero.name;
    wrapper.querySelector("span").textContent = hero.name;
    teamHeroes.appendChild(clone);
  });
}

function addToProgram(commandId) {
  state.program.push(commandId);
  saveState();
  renderProgram();
}

function clearProgram() {
  state.program = [];
  programPointer = 0;
  isRunning = false;
  saveState();
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
    alert("Хранилище открыто! Теперь можно открыть ящик.");
  }

  if (commandId === "box") {
    const box = getBoardVariant()?.grid?.box;
    if (box && current.x === box.x && current.y === box.y) {
      state.boxOpened = true;
      saveState();
      renderBoard();
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
  placeAt(robotEl, state.position);
  saveState();
}

async function runProgram() {
  if (isRunning || state.program.length === 0) {
    return;
  }
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

function handleScale() {
  state.scale = Number(scaleInput.value);
  saveState();
  updateScale();
}

function handleReset() {
  const confirmed = confirm("Сбросить прогресс игры?");
  if (confirmed) {
    resetState();
  }
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
      scale: state.scale ?? fallback.scale,
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
      if (isCombinedPage) {
        showSeasonSelection();
        if (menu) {
          menu.classList.remove("hidden");
        }
      } else {
        window.location.href = "index.html";
      }
    });
  }

  if (studentsInput) {
    studentsInput.addEventListener("input", handleInputChange);
  }
  if (pointsInput) {
    pointsInput.addEventListener("input", handleInputChange);
  }
  if (scaleInput) {
    scaleInput.addEventListener("input", handleScale);
  }
  if (clearBtn) {
    clearBtn.addEventListener("click", clearProgram);
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
    if (variantParam && !isValidVariant(variantParam)) {
      if (isCombinedPage) {
        showSeasonSelection();
        return;
      }
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
      if (!isCombinedPage) {
        window.location.href = "index.html";
        return;
      }
      showSeasonSelection();
      return;
    }
    setupGame();
  }
}

init();
