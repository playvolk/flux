// ════════════════════════════════════════════════════════════
// FLUX — Renk Akış Bulmaca Oyunu  ·  v0.3
// Sawtooth difficulty, BFS solver, ice/bridge/bomb mechanics
// ════════════════════════════════════════════════════════════
(() => {
"use strict";

// ─── COLORS (Liquid Light Palette — doygun, sıcak, parlak) ──
const COLORS = {
    red:    { fill: "#FF3B5C", dark: "#B8163A", glow: "rgba(255,59,92,0.45)",  light: "#FF7A96", mid: "#E8284A", name: "Kırmızı" },
    blue:   { fill: "#3B9FFF", dark: "#1A5CBB", glow: "rgba(59,159,255,0.45)", light: "#7EC4FF", mid: "#2888E8", name: "Mavi" },
    yellow: { fill: "#FFD23B", dark: "#C4A010", glow: "rgba(255,210,59,0.45)", light: "#FFE57A", mid: "#E8BE28", name: "Sarı" },
    green:  { fill: "#3BFF8A", dark: "#14B855", glow: "rgba(59,255,138,0.45)", light: "#7AFFB0", mid: "#28E870", name: "Yeşil" },
    purple: { fill: "#A83BFF", dark: "#6B14B8", glow: "rgba(168,59,255,0.45)", light: "#C77AFF", mid: "#9028E8", name: "Mor" },
    orange: { fill: "#FF7A3B", dark: "#B84A14", glow: "rgba(255,122,59,0.45)", light: "#FFA57A", mid: "#E86428", name: "Turuncu" },
};
const COLOR_KEYS = ["red", "blue", "yellow", "green", "purple", "orange"];

const COLOR_MIX = { "blue+red": "purple", "red+yellow": "orange", "blue+yellow": "green" };
function getMixResult(a, b) { const k = [a,b].sort().join("+"); return COLOR_MIX[k] || null; }

// ─── SAWTOOTH DIFFICULTY ENGINE ─────────────────────────────
// Her 15 levellik "episode" içinde zorluk dağılımı:
// E=easy M=medium H=hard P=pinch(boss)
// Pattern: E E M E M H E M M H E M H H P
const EPISODE_PATTERN = [
    "easy","easy","medium","easy","medium","hard",
    "easy","medium","medium","hard","easy","medium",
    "hard","hard","pinch"
];

// Zorluk türüne göre hamle çarpanı (optimal çözüm × bu değer)
const DIFF_MOVE_MULT = {
    easy:   1.9,
    medium: 1.4,
    hard:   1.15,
    pinch:  1.0,
};

// Zorluk türüne göre scramble agresifliği
const DIFF_SCRAMBLE = {
    easy:   0.7,   // hafif karıştır
    medium: 1.3,   // normal+
    hard:   2.0,   // agresif
    pinch:  2.8,   // maksimum kaos
};

function getLevelDifficulty(levelNum) {
    const episodeIndex = (levelNum - 1) % 15;
    return EPISODE_PATTERN[episodeIndex];
}

function getEpisodeNumber(levelNum) {
    return Math.floor((levelNum - 1) / 15);
}

// ─── MECHANIC TIERS ─────────────────────────────────────────
// Episode bazlı mekanik açılımı (her episode ~15 level)
function getMechanicsForLevel(levelNum) {
    const ep = getEpisodeNumber(levelNum);
    const mechanics = [];
    const diff = getLevelDifficulty(levelNum);

    // Episode 0 (L1-15): Sadece temel akış, 2 renk
    // Episode 1 (L16-30): 3 renk
    // Episode 2-3 (L31-60): Duvarlar başlar
    // Episode 4-6 (L61-105): Buz hücreleri eklenir
    // Episode 7-10 (L106-165): Köprüler eklenir
    // Episode 11-15 (L166-240): Kilitli hücreler
    // Episode 16-20 (L241-315): Bomba hücreler
    // Episode 21-25 (L316-390): Borular (yönlendirici)
    // Episode 26+ (L391+): Renk karışımı + her şey

    if (ep >= 2)  mechanics.push("walls");
    if (ep >= 4)  mechanics.push("ice");
    if (ep >= 7)  mechanics.push("bridges");
    if (ep >= 11) mechanics.push("locks");
    if (ep >= 16) mechanics.push("bombs");
    if (ep >= 21) mechanics.push("pipes");
    if (ep >= 26) mechanics.push("mixing");

    return mechanics;
}

function getGridSize(levelNum) {
    const ep = getEpisodeNumber(levelNum);
    if (ep <= 1) return 5;
    if (ep <= 6) return 5;
    if (ep <= 15) return 6;
    if (ep <= 25) return 7;
    return 7; // cap at 7 for playability
}

function getColorCount(levelNum) {
    const ep = getEpisodeNumber(levelNum);
    if (ep <= 0) return 2;
    if (ep <= 3) return 3;
    if (ep <= 10) return 3;
    if (ep <= 20) return 4;
    return Math.min(5, 4 + Math.floor((ep - 20) / 10));
}

// ─── BFS SOLVER ─────────────────────────────────────────────
// Greedy solver: simulates reasonable player behavior
// Returns estimated number of moves to solve (or Infinity if stuck)
function solvePuzzle(grid, gridSize, maxMoves) {
    // Deep clone grid
    const g = grid.map(r => r.map(c => ({...c})));
    let moves = 0;

    for (let attempt = 0; attempt < maxMoves + 5; attempt++) {
        if (isSolved(g, gridSize)) return moves;

        // Find best move: pick source color + direction that fixes most cells
        let bestScore = -1;
        let bestPath = null;

        for (let r = 0; r < gridSize; r++) {
            for (let c = 0; c < gridSize; c++) {
                const cell = g[r][c];
                if (!cell.color || cell.isWall || cell.isLocked) continue;

                // Try paths in each direction using BFS
                const paths = generatePaths(g, gridSize, r, c, cell.color);
                for (const path of paths) {
                    const score = scorePath(g, gridSize, path, cell.color);
                    if (score > bestScore) {
                        bestScore = score;
                        bestPath = path;
                    }
                }
            }
        }

        if (!bestPath || bestScore <= 0) return Infinity; // stuck

        // Apply the move
        const color = g[bestPath[0].row][bestPath[0].col].color;
        for (let i = 1; i < bestPath.length; i++) {
            const cell = g[bestPath[i].row][bestPath[i].col];
            if (cell.isLocked && cell.lockColor === color) {
                cell.isLocked = false;
                cell.lockColor = null;
            }
            if (!cell.isLocked) cell.color = color;
        }
        moves++;
    }
    return moves;
}

function generatePaths(grid, gridSize, startR, startC, color) {
    // Generate meaningful paths (2-6 cells) from start position
    const paths = [];
    const dirs = [[0,1],[0,-1],[1,0],[-1,0]];

    // BFS to find reachable cells up to depth 6
    function dfs(path, visited) {
        if (path.length >= 2) {
            paths.push([...path]);
        }
        if (path.length >= 6) return;

        const last = path[path.length - 1];
        for (const [dr, dc] of dirs) {
            const nr = last.row + dr;
            const nc = last.col + dc;
            if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) continue;
            const key = nr * gridSize + nc;
            if (visited.has(key)) continue;
            const cell = grid[nr][nc];
            if (cell.isWall) continue;
            if (cell.isLocked && cell.lockColor !== color) continue;

            visited.add(key);
            path.push({row: nr, col: nc});
            dfs(path, visited);
            path.pop();
            visited.delete(key);
        }
    }

    const visited = new Set([startR * gridSize + startC]);
    dfs([{row: startR, col: startC}], visited);
    return paths;
}

function scorePath(grid, gridSize, path, color) {
    // Score = how many cells would become "correct" (matching their target)
    let score = 0;
    for (let i = 1; i < path.length; i++) {
        const cell = grid[path[i].row][path[i].col];
        if (cell.isWall) continue;
        // Would this cell become correct?
        if (cell.targetColor === color && cell.color !== color) {
            score += 3; // fixing a cell is very valuable
        }
        // Would this cell become wrong?
        if (cell.targetColor !== color && cell.color === cell.targetColor) {
            score -= 5; // breaking a correct cell is bad
        }
        // Converting a wrong cell to another wrong color
        if (cell.targetColor !== color && cell.color !== cell.targetColor) {
            score += 0.5; // at least it's a change
        }
    }
    return score;
}

function isSolved(grid, gridSize) {
    for (let r = 0; r < gridSize; r++)
        for (let c = 0; c < gridSize; c++) {
            const cell = grid[r][c];
            if (cell.isWall) continue;
            if (cell.color !== cell.targetColor) return false;
        }
    return true;
}

function countWrongCells(grid, gridSize) {
    let n = 0;
    for (let r = 0; r < gridSize; r++)
        for (let c = 0; c < gridSize; c++) {
            if (grid[r][c].isWall) continue;
            if (grid[r][c].color !== grid[r][c].targetColor) n++;
        }
    return n;
}

// ─── LEVEL GENERATION ───────────────────────────────────────
function generateLevel(levelNum) {
    const diff = getLevelDifficulty(levelNum);
    const mechanics = getMechanicsForLevel(levelNum);
    const gridSize = getGridSize(levelNum);
    const numColors = getColorCount(levelNum);
    const usedColors = COLOR_KEYS.slice(0, numColors);

    let bestGrid = null;
    let bestMoveLimit = 10;
    let bestOptimal = 5;

    // Generate multiple candidates and pick the one closest to target difficulty
    const attempts = 8;
    for (let a = 0; a < attempts; a++) {
        const grid = buildGrid(gridSize, numColors, usedColors, mechanics, diff, levelNum);

        // Run solver to get optimal move estimate
        const optimal = solvePuzzle(grid, gridSize, 30);
        if (optimal === Infinity || optimal < 2) continue;

        // Calculate move limit based on difficulty tier
        const mult = DIFF_MOVE_MULT[diff];
        const moveLimit = Math.max(optimal + 1, Math.ceil(optimal * mult));

        // Prefer puzzles where optimal is reasonable (not too easy, not insane)
        const targetOptimal = getTargetOptimal(gridSize, diff);
        const dist = Math.abs(optimal - targetOptimal);

        if (!bestGrid || dist < Math.abs(bestOptimal - targetOptimal)) {
            bestGrid = grid;
            bestMoveLimit = moveLimit;
            bestOptimal = optimal;
        }
    }

    // Fallback if no valid grid found
    if (!bestGrid) {
        bestGrid = buildGrid(gridSize, numColors, usedColors, mechanics, diff, levelNum);
        bestMoveLimit = 12;
    }

    return { grid: bestGrid, gridSize, moveLimit: bestMoveLimit, usedColors, diff, mechanics };
}

function getTargetOptimal(gridSize, diff) {
    // Target optimal moves based on grid size and difficulty
    const base = Math.floor(gridSize * 1.2);
    switch (diff) {
        case "easy":   return base;
        case "medium": return base + 2;
        case "hard":   return base + 4;
        case "pinch":  return base + 6;
    }
    return base;
}

function buildGrid(gridSize, numColors, usedColors, mechanics, diff, levelNum) {
    const grid = [];
    for (let r = 0; r < gridSize; r++) {
        grid[r] = [];
        for (let c = 0; c < gridSize; c++) {
            grid[r][c] = {
                color: null, targetColor: null,
                isWall: false, isIce: false, isBridge: false,
                isLocked: false, lockColor: null,
                isBomb: false, bombTimer: 0,
                pipeDir: null, // {dr, dc} for pipe direction
            };
        }
    }

    // ── Assign target colors (region-based) ──
    assignTargetRegions(grid, gridSize, numColors, usedColors);

    // ── Place walls ──
    if (mechanics.includes("walls")) {
        const wallCount = Math.floor(gridSize * 0.5) + (diff === "hard" || diff === "pinch" ? 2 : 0);
        placeObstacles(grid, gridSize, wallCount, (cell) => {
            cell.isWall = true;
            cell.color = null;
            cell.targetColor = null;
        });
    }

    // ── Place ice tiles ──
    if (mechanics.includes("ice")) {
        const iceCount = Math.floor(gridSize * 0.4) + (diff === "pinch" ? 2 : 0);
        placeObstacles(grid, gridSize, iceCount, (cell) => {
            cell.isIce = true;
        });
    }

    // ── Place bridges ──
    if (mechanics.includes("bridges")) {
        const bridgeCount = Math.max(1, Math.floor(gridSize * 0.2));
        placeObstacles(grid, gridSize, bridgeCount, (cell) => {
            cell.isBridge = true;
        });
    }

    // ── Place locked cells ──
    if (mechanics.includes("locks")) {
        const lockCount = Math.max(1, Math.floor(gridSize * 0.25));
        let placed = 0;
        const nonWall = getAllNonWall(grid, gridSize);
        shuffle(nonWall);
        for (const {r,c} of nonWall) {
            if (placed >= lockCount) break;
            if (grid[r][c].isWall || grid[r][c].isIce || grid[r][c].isLocked) continue;
            grid[r][c].isLocked = true;
            grid[r][c].lockColor = usedColors[Math.floor(Math.random() * numColors)];
            placed++;
        }
    }

    // ── Place bombs ──
    if (mechanics.includes("bombs")) {
        const bombCount = Math.max(1, Math.floor(gridSize * 0.2));
        let placed = 0;
        const nonWall = getAllNonWall(grid, gridSize);
        shuffle(nonWall);
        for (const {r,c} of nonWall) {
            if (placed >= bombCount) break;
            if (grid[r][c].isWall || grid[r][c].isLocked || grid[r][c].isBomb) continue;
            grid[r][c].isBomb = true;
            grid[r][c].bombTimer = diff === "pinch" ? 3 : diff === "hard" ? 4 : 6;
            placed++;
        }
    }

    // ── Place pipes ──
    if (mechanics.includes("pipes")) {
        const pipeCount = Math.max(1, Math.floor(gridSize * 0.3));
        const dirs = [{dr:0,dc:1},{dr:0,dc:-1},{dr:1,dc:0},{dr:-1,dc:0}];
        let placed = 0;
        const nonWall = getAllNonWall(grid, gridSize);
        shuffle(nonWall);
        for (const {r,c} of nonWall) {
            if (placed >= pipeCount) break;
            if (grid[r][c].isWall || grid[r][c].isBridge) continue;
            grid[r][c].pipeDir = dirs[Math.floor(Math.random() * dirs.length)];
            placed++;
        }
    }

    // ── Scramble ──
    scrambleGrid(grid, gridSize, diff, levelNum);

    return grid;
}

function assignTargetRegions(grid, gridSize, numColors, usedColors) {
    // More interesting region layouts based on color count
    if (numColors === 2) {
        // Left / Right split
        const mid = Math.floor(gridSize / 2);
        for (let r = 0; r < gridSize; r++)
            for (let c = 0; c < gridSize; c++) {
                const color = c < mid ? usedColors[0] : usedColors[1];
                grid[r][c].color = color;
                grid[r][c].targetColor = color;
            }
    } else if (numColors === 3) {
        // Three vertical stripes
        const w = Math.floor(gridSize / 3);
        for (let r = 0; r < gridSize; r++)
            for (let c = 0; c < gridSize; c++) {
                let ci = Math.min(2, Math.floor(c / w));
                if (c >= gridSize - (gridSize % 3)) ci = 2; // remainder goes to last
                grid[r][c].color = usedColors[ci];
                grid[r][c].targetColor = usedColors[ci];
            }
    } else if (numColors === 4) {
        // Four quadrants
        const midR = Math.floor(gridSize / 2);
        const midC = Math.floor(gridSize / 2);
        for (let r = 0; r < gridSize; r++)
            for (let c = 0; c < gridSize; c++) {
                const ci = (r < midR ? 0 : 2) + (c < midC ? 0 : 1);
                grid[r][c].color = usedColors[ci];
                grid[r][c].targetColor = usedColors[ci];
            }
    } else {
        // 5+ colors: stripe fallback
        const w = Math.floor(gridSize / numColors);
        for (let r = 0; r < gridSize; r++)
            for (let c = 0; c < gridSize; c++) {
                const ci = Math.min(numColors - 1, Math.floor(c / Math.max(1, w)));
                grid[r][c].color = usedColors[ci];
                grid[r][c].targetColor = usedColors[ci];
            }
    }
}

function placeObstacles(grid, gridSize, count, applyFn) {
    let placed = 0;
    let safety = count * 10;
    while (placed < count && safety-- > 0) {
        const r = Math.floor(Math.random() * gridSize);
        const c = Math.floor(Math.random() * gridSize);
        if (grid[r][c].isWall || grid[r][c].isIce || grid[r][c].isBridge) continue;
        applyFn(grid[r][c]);
        placed++;
    }
}

function getAllNonWall(grid, gridSize) {
    const cells = [];
    for (let r = 0; r < gridSize; r++)
        for (let c = 0; c < gridSize; c++)
            if (!grid[r][c].isWall) cells.push({r, c});
    return cells;
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

function scrambleGrid(grid, gridSize, diff, levelNum) {
    const nonWall = getAllNonWall(grid, gridSize);
    const intensity = DIFF_SCRAMBLE[diff];
    const scrambleCount = Math.floor(nonWall.length * (2 + intensity) + levelNum * 0.5);

    for (let i = 0; i < scrambleCount; i++) {
        const a = nonWall[Math.floor(Math.random() * nonWall.length)];
        const b = nonWall[Math.floor(Math.random() * nonWall.length)];
        const ca = grid[a.r][a.c], cb = grid[b.r][b.c];
        if (ca.color && cb.color && ca.color !== cb.color) {
            const tmp = ca.color;
            ca.color = cb.color;
            cb.color = tmp;
        }
    }

    // Ensure not already solved
    if (isSolved(grid, gridSize)) {
        if (nonWall.length >= 2) {
            const a = nonWall[0], b = nonWall[nonWall.length - 1];
            const tmp = grid[a.r][a.c].color;
            grid[a.r][a.c].color = grid[b.r][b.c].color;
            grid[b.r][b.c].color = tmp;
        }
    }
}

// ─── SAVE / LOAD ────────────────────────────────────────────
const SAVE_KEY = "flux_save_v3";
let saveData = {
    currentLevel: 1, maxUnlocked: 1,
    stars: {}, coins: 100, lives: 5, lastLifeTime: Date.now(),
    totalFails: 0, // for DDA
    recentResults: [], // last 5 results: true=win, false=lose
};

function loadSave() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (raw) Object.assign(saveData, JSON.parse(raw));
    } catch(e) {}
    regenLives();
}
function writeSave() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(saveData)); } catch(e) {}
}

// ─── LIVES SYSTEM ───────────────────────────────────────────
const MAX_LIVES = 5;
const LIFE_REGEN_MS = 30 * 60 * 1000;

function regenLives() {
    if (saveData.lives >= MAX_LIVES) { saveData.lastLifeTime = Date.now(); return; }
    const elapsed = Date.now() - saveData.lastLifeTime;
    const gained = Math.floor(elapsed / LIFE_REGEN_MS);
    if (gained > 0) {
        saveData.lives = Math.min(MAX_LIVES, saveData.lives + gained);
        saveData.lastLifeTime += gained * LIFE_REGEN_MS;
        writeSave();
    }
}
function useLive() {
    regenLives();
    if (saveData.lives <= 0) return false;
    saveData.lives--;
    if (saveData.lives < MAX_LIVES && saveData.lastLifeTime > Date.now() - LIFE_REGEN_MS) {}
    else saveData.lastLifeTime = Date.now();
    writeSave();
    return true;
}
function renderLives() {
    regenLives();
    const el = document.getElementById("lives-container");
    el.innerHTML = "";
    for (let i = 0; i < MAX_LIVES; i++) {
        const h = document.createElement("span");
        h.className = "heart " + (i < saveData.lives ? "full" : "empty");
        h.textContent = "♥";
        el.appendChild(h);
    }
}

// ─── DDA (Dynamic Difficulty Adjustment) ────────────────────
function getDDABonus() {
    // If player lost 3+ of last 5, ease up
    const recent = saveData.recentResults.slice(-5);
    const losses = recent.filter(r => !r).length;
    if (losses >= 3) return 2; // +2 extra moves
    if (losses >= 4) return 4; // +4 extra moves
    return 0;
}

// ─── CANVAS & RENDER ────────────────────────────────────────
const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const TILE_DEPTH = 6;

// ─── LIQUID PAINT DROP RENDERER ──────────────────────────────
const orbCache = {};
function getOrbCanvas(colorKey, radius) {
    const ck = `${colorKey}_${radius}`;
    if (orbCache[ck]) return orbCache[ck];

    const pad = 12;
    const size = (radius + pad) * 2;
    const oc = document.createElement("canvas");
    oc.width = size; oc.height = size;
    const o = oc.getContext("2d");
    const cx = size/2, cy = size/2;
    const c = COLORS[colorKey];

    // ── 1. Neon glow halo (Liquid Light)
    const glowR = radius * 1.6;
    const gg = o.createRadialGradient(cx, cy, radius*0.3, cx, cy, glowR);
    gg.addColorStop(0, c.glow);
    gg.addColorStop(0.6, c.glow.replace(/[\d.]+\)$/, "0.12)"));
    gg.addColorStop(1, "transparent");
    o.fillStyle = gg;
    o.beginPath(); o.arc(cx, cy, glowR, 0, Math.PI*2); o.fill();

    // ── 2. Drop shadow (yere yansıma)
    o.beginPath();
    o.ellipse(cx + 1, cy + radius*0.5, radius*0.75, radius*0.22, 0, 0, Math.PI*2);
    o.fillStyle = "rgba(0,0,0,0.35)";
    o.fill();

    // ── 3. Ana boya damlası — "blob" şekli (hafif squash)
    const blobW = radius * 1.05;
    const blobH = radius * 0.95;
    o.save();
    o.translate(cx, cy);
    o.scale(blobW / radius, blobH / radius);

    // Gradient: üstte açık (ışık), altta koyu (derinlik), kenar parlak
    const bg = o.createRadialGradient(
        -radius*0.2, -radius*0.25, radius*0.05,
        0, 0, radius
    );
    bg.addColorStop(0, "rgba(255,255,255,0.9)");
    bg.addColorStop(0.12, c.light);
    bg.addColorStop(0.4, c.fill);
    bg.addColorStop(0.75, c.mid);
    bg.addColorStop(1, c.dark);

    o.beginPath(); o.arc(0, 0, radius, 0, Math.PI*2);
    o.fillStyle = bg; o.fill();

    // ── 4. İç parlaklık — glossy boya yüzey gerilimi
    const ig = o.createRadialGradient(
        -radius*0.15, -radius*0.2, 0,
        -radius*0.15, -radius*0.2, radius*0.55
    );
    ig.addColorStop(0, "rgba(255,255,255,0.45)");
    ig.addColorStop(0.5, "rgba(255,255,255,0.08)");
    ig.addColorStop(1, "transparent");
    o.fillStyle = ig;
    o.beginPath(); o.arc(0, 0, radius, 0, Math.PI*2); o.fill();

    // ── 5. Specular highlight — keskin parlak nokta
    o.beginPath();
    o.ellipse(-radius*0.2, -radius*0.28, radius*0.2, radius*0.13, -0.3, 0, Math.PI*2);
    o.fillStyle = "rgba(255,255,255,0.7)";
    o.fill();

    // ── 6. Küçük ikincil highlight
    o.beginPath();
    o.arc(radius*0.2, radius*0.22, radius*0.08, 0, Math.PI*2);
    o.fillStyle = "rgba(255,255,255,0.2)";
    o.fill();

    // ── 7. Kenar rim — ince parlak halka (cam yansıması)
    o.beginPath(); o.arc(0, 0, radius - 0.5, 0, Math.PI*2);
    o.strokeStyle = "rgba(255,255,255,0.12)";
    o.lineWidth = 1;
    o.stroke();

    o.restore();

    orbCache[ck] = oc;
    return oc;
}

function drawTile(x, y, w, h, topColor, sideColor, borderColor) {
    const r = 4; // corner radius — buzlu cam köşeleri

    // Side face (bottom) — derinlik
    ctx.fillStyle = sideColor;
    ctx.beginPath();
    ctx.moveTo(x+r, y+h); ctx.lineTo(x+w-r, y+h);
    ctx.lineTo(x+w-r, y+h+TILE_DEPTH); ctx.lineTo(x+r, y+h+TILE_DEPTH);
    ctx.closePath(); ctx.fill();

    // Side face (right) — derinlik
    ctx.fillStyle = sideColor; ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(x+w, y+r); ctx.lineTo(x+w, y+h);
    ctx.lineTo(x+w, y+h+TILE_DEPTH); ctx.lineTo(x+w, y+r+TILE_DEPTH);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;

    // Top face — rounded rect (buzlu cam yüzey)
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fillStyle = topColor;
    ctx.fill();

    // Glass inner highlight — üst kenar ışık çizgisi
    ctx.beginPath();
    ctx.moveTo(x + r + 2, y + 1.5);
    ctx.lineTo(x + w - r - 2, y + 1.5);
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Border
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 0.5;
    ctx.stroke();
}

// ─── GAME STATE ─────────────────────────────────────────────
let G = {
    gridSize: 5, cellPx: 0, grid: [],
    moves: 0, moveLimit: 10, level: 1,
    dragging: false, dragColor: null, dragPath: [],
    particles: [], convertAnims: [],
    completed: false, failed: false,
    history: [],
    hintCells: null, hintTimer: 0,
    paused: false,
    diff: "easy", mechanics: [],
};

// ─── SCREENS ────────────────────────────────────────────────
function showScreen(id) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    document.getElementById(id).classList.add("active");
}
function hideAllOverlays() {
    document.querySelectorAll(".overlay").forEach(o => o.classList.add("hidden"));
}

// ─── RESIZE ─────────────────────────────────────────────────
function resizeCanvas(gridSize) {
    // Account for HUD + toolbar + safe areas, keep canvas square and centered
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const hudHeight = 110; // approx HUD + move bar
    const toolbarHeight = 80; // approx toolbar
    const safeTop = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sat')) || 0;
    const safeBot = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sab')) || 0;

    const availW = vw - 24; // horizontal padding
    const availH = vh - hudHeight - toolbarHeight - safeTop - safeBot - 16;
    const maxPx = Math.min(availW, availH, 460);
    const cellPx = Math.floor(maxPx / gridSize);
    const w = cellPx * gridSize;
    const h = cellPx * gridSize + TILE_DEPTH;

    // Use devicePixelRatio for sharp rendering on all screens
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return cellPx;
}

// ─── INIT LEVEL ─────────────────────────────────────────────
function initLevel(levelNum) {
    const lv = generateLevel(levelNum);
    // Apply DDA bonus
    const ddaBonus = getDDABonus();
    lv.moveLimit += ddaBonus;

    G.gridSize = lv.gridSize;
    G.cellPx = resizeCanvas(lv.gridSize);
    G.grid = lv.grid;
    G.moves = 0;
    G.moveLimit = lv.moveLimit;
    G.level = levelNum;
    G.diff = lv.diff;
    G.mechanics = lv.mechanics;
    G.dragging = false;
    G.dragColor = null;
    G.dragPath = [];
    G.convertAnims = [];
    G.particles = [];
    G.completed = false;
    G.failed = false;
    G.history = [];
    G.hintCells = null;
    G.hintTimer = 0;
    G.paused = false;

    // Update UI
    document.getElementById("level-label").textContent = `Level ${levelNum}`;
    document.getElementById("moves-count").textContent = "0";
    document.getElementById("moves-limit").textContent = lv.moveLimit;

    // Show difficulty badge
    const diffLabels = { easy: "Kolay", medium: "Orta", hard: "Zor", pinch: "BOSS" };
    const diffColors = { easy: "#4DFF91", medium: "#FFD94D", hard: "#FF8C42", pinch: "#FF4D6A" };
    const diffEl = document.getElementById("diff-badge");
    if (diffEl) {
        diffEl.textContent = diffLabels[lv.diff] || "";
        diffEl.style.color = diffColors[lv.diff] || "#fff";
    }

    updateStarsUI();
    renderLives();
    updateCoinsUI();
    hideAllOverlays();
    showScreen("screen-game");
    render();
}

function updateStarsUI() {
    const ratio = G.moveLimit > 0 ? G.moves / G.moveLimit : 1;
    for (let i = 0; i < 3; i++) {
        const el = document.getElementById(`star-${i}`);
        let earned = false;
        if (i === 0) earned = true;
        if (i === 1) earned = ratio <= 0.85;
        if (i === 2) earned = ratio <= 0.6;
        el.classList.toggle("earned", earned && !G.failed);
    }
}

function updateCoinsUI() {
    document.getElementById("hud-coins").textContent = saveData.coins;
    const mc = document.getElementById("menu-coins");
    if (mc) mc.textContent = saveData.coins;
}

function updateTotalStars() {
    let total = 0;
    for (const k of Object.keys(saveData.stars)) total += saveData.stars[k];
    const el = document.getElementById("menu-total-stars");
    if (el) el.textContent = total;
}

// ─── COORDINATE HELPERS ─────────────────────────────────────
function posToGrid(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const sx = canvas.width / dpr / rect.width;
    const sy = canvas.height / dpr / rect.height;
    const x = (clientX - rect.left) * sx;
    const y = (clientY - rect.top) * sy;
    const col = Math.floor(x / G.cellPx);
    const row = Math.floor(y / G.cellPx);
    if (row < 0 || row >= G.gridSize || col < 0 || col >= G.gridSize) return null;
    return { row, col };
}

// ─── DRAG MECHANIC ──────────────────────────────────────────
function onDragStart(cx, cy) {
    if (G.completed || G.failed || G.paused) return;
    const pos = posToGrid(cx, cy);
    if (!pos) return;
    const cell = G.grid[pos.row][pos.col];
    if (!cell.color || cell.isWall) return;
    if (cell.isLocked) return;

    G.dragging = true;
    G.dragColor = cell.color;
    G.dragPath = [pos];
    G.hintCells = null;
    render();
}

function onDragMove(cx, cy) {
    if (!G.dragging) return;
    const pos = posToGrid(cx, cy);
    if (!pos) return;
    const last = G.dragPath[G.dragPath.length - 1];
    if (last.row === pos.row && last.col === pos.col) return;
    if (Math.abs(pos.row - last.row) + Math.abs(pos.col - last.col) !== 1) return;

    const cell = G.grid[pos.row][pos.col];
    if (cell.isWall) return;
    if (cell.isLocked && cell.lockColor !== G.dragColor) return;

    // Backtrack
    if (G.dragPath.length >= 2) {
        const prev = G.dragPath[G.dragPath.length - 2];
        if (prev.row === pos.row && prev.col === pos.col) {
            G.dragPath.pop();
            render();
            return;
        }
    }

    // No revisit (unless bridge)
    const already = G.dragPath.some(p => p.row === pos.row && p.col === pos.col);
    if (already && !cell.isBridge) return;

    G.dragPath.push(pos);
    if (navigator.vibrate) navigator.vibrate(8);
    render();
}

function onDragEnd() {
    if (!G.dragging) return;
    if (G.dragPath.length >= 2) {
        completeDrag();
    } else {
        G.dragging = false;
        G.dragPath = [];
        G.dragColor = null;
        render();
    }
}

function completeDrag() {
    // Save undo
    G.history.push({
        grid: G.grid.map(row => row.map(c => ({...c}))),
        moves: G.moves,
    });
    if (G.history.length > 30) G.history.shift();

    const path = G.dragPath;
    const color = G.dragColor;

    // ► CORE: renk yayılma — tüm hücreler anında dönüşür
    for (let i = 1; i < path.length; i++) {
        const cell = G.grid[path[i].row][path[i].col];

        // Unlock
        if (cell.isLocked && cell.lockColor === color) {
            cell.isLocked = false;
            cell.lockColor = null;
        }

        // Convert
        if (!cell.isLocked) {
            cell.color = color;
        }

        // Ice mechanic: color slides in the direction of entry
        if (cell.isIce && i >= 1) {
            const dr = path[i].row - path[i-1].row;
            const dc = path[i].col - path[i-1].col;
            slideIce(path[i].row, path[i].col, dr, dc, color);
        }

        // Convert anim
        G.convertAnims.push({
            row: path[i].row, col: path[i].col, color,
            progress: 0, delay: i * 0.06, duration: 0.35,
        });
    }

    // Bomb tick: decrease all bomb timers
    tickBombs();

    G.moves++;
    document.getElementById("moves-count").textContent = G.moves;
    updateStarsUI();

    G.dragging = false;
    G.dragPath = [];
    G.dragColor = null;

    // Check completion/failure
    setTimeout(() => {
        if (G.completed || G.failed) return;
        if (isSolved(G.grid, G.gridSize)) {
            onLevelComplete();
        } else if (G.moves >= G.moveLimit) {
            onLevelFail();
        }
    }, path.length * 60 + 200);
}

// ─── ICE SLIDE ──────────────────────────────────────────────
function slideIce(row, col, dr, dc, color) {
    let r = row + dr, c = col + dc;
    while (r >= 0 && r < G.gridSize && c >= 0 && c < G.gridSize) {
        const cell = G.grid[r][c];
        if (cell.isWall) break;
        if (cell.isLocked) break;
        cell.color = color;
        // Spawn slide anim
        G.convertAnims.push({
            row: r, col: c, color,
            progress: 0, delay: Math.abs(r - row + c - col) * 0.08, duration: 0.25,
        });
        r += dr;
        c += dc;
    }
}

// ─── BOMB TICK ──────────────────────────────────────────────
function tickBombs() {
    for (let r = 0; r < G.gridSize; r++) {
        for (let c = 0; c < G.gridSize; c++) {
            const cell = G.grid[r][c];
            if (!cell.isBomb) continue;
            // Check if bomb is satisfied (correct color)
            if (cell.color === cell.targetColor) {
                cell.isBomb = false;
                cell.bombTimer = 0;
                spawnParticles((c+0.5)*G.cellPx, (r+0.5)*G.cellPx, "#4DFF91", 10);
                continue;
            }
            cell.bombTimer--;
            if (cell.bombTimer <= 0) {
                // BOOM — scramble nearby cells
                explodeBomb(r, c);
            }
        }
    }
}

function explodeBomb(br, bc) {
    const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    // Scramble surrounding cells
    for (const [dr,dc] of dirs) {
        const r = br+dr, c = bc+dc;
        if (r < 0 || r >= G.gridSize || c < 0 || c >= G.gridSize) continue;
        const cell = G.grid[r][c];
        if (cell.isWall) continue;
        // Randomize color from existing palette
        const colors = getUsedColors();
        cell.color = colors[Math.floor(Math.random() * colors.length)];
        spawnParticles((c+0.5)*G.cellPx, (r+0.5)*G.cellPx, "#FF4D6A", 6);
    }
    G.grid[br][bc].isBomb = false;
    G.grid[br][bc].bombTimer = 0;
    spawnParticles((bc+0.5)*G.cellPx, (br+0.5)*G.cellPx, "#FF4D6A", 15);
}

function getUsedColors() {
    const set = new Set();
    for (let r = 0; r < G.gridSize; r++)
        for (let c = 0; c < G.gridSize; c++)
            if (G.grid[r][c].color) set.add(G.grid[r][c].color);
    return [...set];
}

// ─── LEVEL COMPLETE / FAIL ──────────────────────────────────
function onLevelComplete() {
    G.completed = true;
    const ratio = G.moves / G.moveLimit;
    let stars = ratio <= 0.6 ? 3 : ratio <= 0.85 ? 2 : 1;

    const prev = saveData.stars[G.level] || 0;
    if (stars > prev) saveData.stars[G.level] = stars;
    if (G.level >= saveData.maxUnlocked) saveData.maxUnlocked = G.level + 1;
    saveData.currentLevel = G.level + 1;
    saveData.coins += stars * 10;
    saveData.recentResults.push(true);
    if (saveData.recentResults.length > 10) saveData.recentResults.shift();
    writeSave();
    updateTotalStars();

    // Celebration
    for (let i = 0; i < 8; i++) {
        setTimeout(() => {
            spawnParticles(
                Math.random() * G.cellPx * G.gridSize,
                Math.random() * G.cellPx * G.gridSize,
                COLORS[COLOR_KEYS[Math.floor(Math.random() * 5)]].fill, 12
            );
        }, i * 120);
    }

    setTimeout(() => {
        document.getElementById("complete-stars").textContent = "★".repeat(stars) + "☆".repeat(3-stars);
        const msgs = ["Tebrikler! Leveli geçtin.", "Harika! Verimli hamleler.", "Mükemmel! Minimum hamle ustası!"];
        document.getElementById("complete-msg").textContent = msgs[stars-1];
        document.getElementById("complete-moves").textContent = G.moves;
        document.getElementById("complete-score").textContent = stars * 100 + (G.moveLimit - G.moves) * 15;
        document.getElementById("overlay-complete").classList.remove("hidden");
    }, 1000);
}

function onLevelFail() {
    G.failed = true;
    saveData.recentResults.push(false);
    if (saveData.recentResults.length > 10) saveData.recentResults.shift();
    useLive();
    renderLives();
    writeSave();
    document.getElementById("overlay-fail").classList.remove("hidden");
}

// ─── NO LIVES MESSAGE (replaces alert) ──────────────────────
function showNoLivesMessage() {
    // Briefly flash a toast-like message
    let toast = document.getElementById("toast-msg");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast-msg";
        toast.style.cssText = `
            position:fixed; bottom:calc(80px + env(safe-area-inset-bottom,0px)); left:50%; transform:translateX(-50%);
            background:rgba(255,59,92,0.9); color:#fff; padding:12px 24px;
            border-radius:12px; font-size:0.9rem; font-weight:600; font-family:inherit;
            z-index:300; pointer-events:none; opacity:0; transition:opacity 0.3s;
            text-align:center; max-width:90vw;
        `;
        document.body.appendChild(toast);
    }
    toast.textContent = "Canın kalmadı! 30 dakika bekle.";
    toast.style.opacity = "1";
    setTimeout(() => { toast.style.opacity = "0"; }, 2500);
}

// ─── HINT ───────────────────────────────────────────────────
function useHint() {
    if (G.completed || G.failed) return;
    if (saveData.coins < 50) return;
    for (let r = 0; r < G.gridSize; r++) {
        for (let c = 0; c < G.gridSize; c++) {
            const cell = G.grid[r][c];
            if (cell.isWall || cell.color === cell.targetColor) continue;
            const target = cell.targetColor;
            for (let r2 = 0; r2 < G.gridSize; r2++) {
                for (let c2 = 0; c2 < G.gridSize; c2++) {
                    if (G.grid[r2][c2].color === target && !G.grid[r2][c2].isWall) {
                        G.hintCells = [{row:r2,col:c2},{row:r,col:c}];
                        G.hintTimer = 3;
                        saveData.coins -= 50;
                        writeSave(); updateCoinsUI(); render();
                        return;
                    }
                }
            }
        }
    }
}

// ─── UNDO ───────────────────────────────────────────────────
function undo() {
    if (G.history.length === 0 || G.completed || G.failed) return;
    const snap = G.history.pop();
    G.grid = snap.grid;
    G.moves = snap.moves;
    G.convertAnims = [];
    document.getElementById("moves-count").textContent = G.moves;
    updateStarsUI();
    render();
}

// ─── PARTICLES — Sıvı damlacık fiziği ──────────────────────
function spawnParticles(x, y, color, count = 8) {
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI*2*i)/count + (Math.random()-0.5)*0.6;
        const speed = 50 + Math.random()*90;
        G.particles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 20, // hafif yukarı fırlama
            alpha: 1,
            radius: 1.5 + Math.random() * 3,
            color,
            life: 0.5 + Math.random() * 0.4,
            elapsed: 0,
        });
    }
}
function updateParticles(dt) {
    for (const p of G.particles) {
        p.elapsed += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 80 * dt;    // yerçekimi — damlacıklar düşer
        p.vx *= 0.96;
        p.vy *= 0.96;
        p.alpha = Math.max(0, 1 - p.elapsed / p.life);
        // Damlacık büzülmesi
        p.radius *= 0.997;
    }
    G.particles = G.particles.filter(p => p.elapsed < p.life);
}

// ─── CONVERT ANIMS ──────────────────────────────────────────
function updateConvertAnims(dt) {
    for (const a of G.convertAnims) {
        if (a.delay > 0) {
            a.delay -= dt;
            if (a.delay <= 0) {
                spawnParticles((a.col+0.5)*G.cellPx, (a.row+0.5)*G.cellPx, COLORS[a.color].fill, 8);
            }
            continue;
        }
        a.progress += dt / a.duration;
        if (a.progress > 1) a.progress = 1;
    }
    G.convertAnims = G.convertAnims.filter(a => a.delay > 0 || a.progress < 1);
}

// ─── RENDER ─────────────────────────────────────────────────
function render() {
    const { gridSize, cellPx, grid } = G;
    if (!cellPx) return;
    const w = cellPx * gridSize;
    const h = cellPx * gridSize + TILE_DEPTH;

    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // ── BACKGROUND — derin uzay gradient ──
    const bgGrad = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, w*0.8);
    bgGrad.addColorStop(0, "#101030");
    bgGrad.addColorStop(1, "#060614");
    ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, w, h);

    // ── DRAW GRID ──
    const pad = 2;
    for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
            const cell = grid[r][c];
            const x = c * cellPx, y = r * cellPx;

            // ═══ WALL — koyu, çarpı işaretli ═══
            if (cell.isWall) {
                drawTile(x+pad, y+pad, cellPx-pad*2, cellPx-pad*2,
                    "#111128", "#0A0A18", "rgba(255,255,255,0.02)");
                ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x+pad+8, y+pad+8); ctx.lineTo(x+cellPx-pad-8, y+cellPx-pad-8);
                ctx.moveTo(x+cellPx-pad-8, y+pad+8); ctx.lineTo(x+pad+8, y+cellPx-pad-8);
                ctx.stroke();
                continue;
            }

            // ═══ TILE — Buzlu cam yüzey ═══
            // Hedef renge göre cam tonu
            let topColor = "#12123A";
            let sideColor = "#0A0A25";
            let borderCol = "rgba(255,255,255,0.05)";

            if (cell.targetColor) {
                const tc = COLORS[cell.targetColor];
                const isCorrect = cell.color === cell.targetColor;
                // Cam yüzey: hedef rengin hafif ama belirgin tonu
                topColor = isCorrect
                    ? tc.glow.replace(/[\d.]+\)$/, "0.20)")
                    : tc.glow.replace(/[\d.]+\)$/, "0.10)");
                sideColor = tc.glow.replace(/[\d.]+\)$/, isCorrect ? "0.14)" : "0.06)");
                borderCol = tc.glow.replace(/[\d.]+\)$/, isCorrect ? "0.30)" : "0.15)");
            }

            // Ice override
            if (cell.isIce) {
                topColor = "rgba(59,159,255,0.12)";
                sideColor = "rgba(59,159,255,0.06)";
            }

            drawTile(x+pad, y+pad, cellPx-pad*2, cellPx-pad*2, topColor, sideColor, borderCol);

            // ── Hedef renk şeridi (alt kenar, rounded) ──
            if (cell.targetColor) {
                const tc = COLORS[cell.targetColor];
                const isCorrect = cell.color === cell.targetColor;
                const stripeH = 3;
                const sx = x + pad + 4, sy = y + cellPx - pad - stripeH - 1;
                const sw = cellPx - pad*2 - 8;

                ctx.beginPath();
                ctx.roundRect(sx, sy, sw, stripeH, 1.5);
                ctx.fillStyle = tc.fill;
                ctx.globalAlpha = isCorrect ? 0.55 : 0.3;
                ctx.fill();
                ctx.globalAlpha = 1;

                // Köşe hedef dot (sol üst)
                ctx.beginPath();
                ctx.arc(x+pad+8, y+pad+8, 3.5, 0, Math.PI*2);
                ctx.fillStyle = tc.fill;
                ctx.globalAlpha = isCorrect ? 0.65 : 0.35;
                ctx.fill();
                ctx.globalAlpha = 1;
            }

            // ── ICE — kristal çizgiler ──
            if (cell.isIce) {
                ctx.strokeStyle = "rgba(130,210,255,0.18)"; ctx.lineWidth = 0.5;
                for (let li = 0; li < 3; li++) {
                    const ly = y + pad + (cellPx-pad*2) * (0.25 + li*0.25);
                    ctx.beginPath();
                    ctx.moveTo(x+pad+5, ly);
                    ctx.lineTo(x+cellPx-pad-5, ly + (li%2===0 ? 2 : -2));
                    ctx.stroke();
                }
                // Snowflake dot
                ctx.fillStyle = "rgba(200,240,255,0.25)";
                ctx.font = `${cellPx*0.18}px Inter`;
                ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.fillText("❄", x+cellPx-pad-9, y+pad+9);
            }

            // ── BRIDGE — köprü kavsi ──
            if (cell.isBridge) {
                const bx = x + cellPx/2, by = y + cellPx/2, bs = cellPx*0.28;
                ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(bx-bs, by+2); ctx.quadraticCurveTo(bx, by-bs*0.7, bx+bs, by+2);
                ctx.stroke();
                // Second arch below
                ctx.strokeStyle = "rgba(255,255,255,0.06)";
                ctx.beginPath();
                ctx.moveTo(bx-bs, by+5); ctx.quadraticCurveTo(bx, by-bs*0.5+2, bx+bs, by+5);
                ctx.stroke();
            }

            // ── BOMB — sayaç + uyarı halkası ──
            if (cell.isBomb) {
                const urgent = cell.bombTimer <= 2;
                // Timer badge (sağ üst)
                const bx = x + cellPx - pad - 11, by = y + pad + 11;
                ctx.beginPath(); ctx.arc(bx, by, 8, 0, Math.PI*2);
                ctx.fillStyle = urgent ? "rgba(255,59,92,0.7)" : "rgba(255,122,59,0.5)";
                ctx.fill();
                ctx.fillStyle = "#fff";
                ctx.font = `bold ${cellPx*0.2}px Inter`;
                ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.fillText(cell.bombTimer, bx, by);

                // Pulsing danger ring
                if (urgent) {
                    const pulse = 0.4 + 0.4 * Math.sin(Date.now() * 0.01);
                    ctx.beginPath();
                    ctx.arc(x+cellPx/2, y+cellPx/2, cellPx*0.42, 0, Math.PI*2);
                    ctx.strokeStyle = `rgba(255,59,92,${pulse})`;
                    ctx.lineWidth = 2; ctx.stroke();
                }
            }

            // ── PIPE — yön oku ──
            if (cell.pipeDir) {
                const px = x+cellPx/2, py = y+cellPx/2;
                const angle = Math.atan2(cell.pipeDir.dr, cell.pipeDir.dc);
                ctx.save(); ctx.translate(px, py); ctx.rotate(angle);
                // Pipe background
                ctx.fillStyle = "rgba(255,255,255,0.06)";
                ctx.beginPath();
                ctx.roundRect(-cellPx*0.2, -cellPx*0.08, cellPx*0.4, cellPx*0.16, 3);
                ctx.fill();
                // Arrow
                ctx.fillStyle = "rgba(255,255,255,0.22)";
                ctx.beginPath();
                ctx.moveTo(cellPx*0.22, 0);
                ctx.lineTo(-cellPx*0.05, -cellPx*0.1);
                ctx.lineTo(-cellPx*0.05, cellPx*0.1);
                ctx.closePath(); ctx.fill();
                ctx.restore();
            }

            // ── LOCKED — kilit ikonu ──
            if (cell.isLocked) {
                const lc = COLORS[cell.lockColor];
                // Lock background circle
                ctx.beginPath();
                ctx.arc(x+cellPx/2, y+cellPx/2, cellPx*0.25, 0, Math.PI*2);
                ctx.fillStyle = lc ? lc.glow.replace(/[\d.]+\)$/, "0.2)") : "rgba(255,255,255,0.1)";
                ctx.fill();
                ctx.fillStyle = lc ? lc.fill : "#fff";
                ctx.globalAlpha = 0.6;
                ctx.font = `${cellPx*0.26}px Inter`;
                ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.fillText("🔒", x+cellPx/2, y+cellPx/2);
                ctx.globalAlpha = 1;
            }

            // ═══ LIQUID PAINT DROP ═══
            if (cell.color && !cell.isLocked) {
                const orbR = cellPx * 0.32;
                const orbPad = 12;
                const orb = getOrbCanvas(cell.color, Math.round(orbR));
                const orbSize = (orbR + orbPad) * 2;
                ctx.drawImage(orb,
                    x + cellPx/2 - orbSize/2,
                    y + cellPx/2 - orbSize/2,
                    orbSize, orbSize
                );

                // ── Doğru yerleşim efekti — hafif yıldız parıltısı ──
                if (cell.targetColor && cell.color === cell.targetColor) {
                    const sparkle = 0.15 + 0.1 * Math.sin(Date.now()*0.003 + r*2 + c*3);
                    ctx.beginPath();
                    ctx.arc(x+cellPx/2, y+cellPx/2, orbR+4, 0, Math.PI*2);
                    ctx.strokeStyle = `rgba(255,255,255,${sparkle})`;
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                }
            }
        }
    }

    // ═══ DRAG PATH — Sıvı boya akış yolu ═══
    if (G.dragging && G.dragPath.length > 0) {
        const cd = COLORS[G.dragColor];
        const f = G.dragPath[0];

        // Layer 1: Geniş glow — sıvı boya ışıma
        ctx.beginPath();
        ctx.strokeStyle = cd.glow;
        ctx.lineWidth = cellPx * 0.45;
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.moveTo((f.col+0.5)*cellPx, (f.row+0.5)*cellPx);
        for (let i = 1; i < G.dragPath.length; i++) {
            const p = G.dragPath[i];
            ctx.lineTo((p.col+0.5)*cellPx, (p.row+0.5)*cellPx);
        }
        ctx.stroke();

        // Layer 2: Orta şerit — ana boya rengi
        ctx.beginPath();
        ctx.strokeStyle = cd.fill;
        ctx.lineWidth = cellPx * 0.18;
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.moveTo((f.col+0.5)*cellPx, (f.row+0.5)*cellPx);
        for (let i = 1; i < G.dragPath.length; i++) {
            const p = G.dragPath[i];
            ctx.lineTo((p.col+0.5)*cellPx, (p.row+0.5)*cellPx);
        }
        ctx.stroke();

        // Layer 3: İnce parlak merkez çizgi — ışık yansıması
        ctx.beginPath();
        ctx.strokeStyle = cd.light;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = cellPx * 0.05;
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.moveTo((f.col+0.5)*cellPx, (f.row+0.5)*cellPx);
        for (let i = 1; i < G.dragPath.length; i++) {
            const p = G.dragPath[i];
            ctx.lineTo((p.col+0.5)*cellPx, (p.row+0.5)*cellPx);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Yön okları — cam üzerinde beyaz damla
        for (let i = 0; i < G.dragPath.length - 1; i++) {
            const fr = G.dragPath[i], to = G.dragPath[i+1];
            const mx = ((fr.col+to.col)/2+0.5)*cellPx;
            const my = ((fr.row+to.row)/2+0.5)*cellPx;
            const angle = Math.atan2(to.row-fr.row, to.col-fr.col);
            ctx.save(); ctx.translate(mx, my); ctx.rotate(angle);
            ctx.fillStyle = "rgba(255,255,255,0.7)";
            ctx.beginPath();
            ctx.moveTo(6, 0); ctx.lineTo(-3, -4); ctx.lineTo(-3, 4);
            ctx.closePath(); ctx.fill();
            ctx.restore();
        }

        // Uç noktada nabız atan damla
        if (G.dragPath.length >= 2) {
            const last = G.dragPath[G.dragPath.length - 1];
            const pulse = 0.8 + 0.2 * Math.sin(Date.now() * 0.008);
            const pr = cellPx * 0.15 * pulse;
            ctx.beginPath();
            ctx.arc((last.col+0.5)*cellPx, (last.row+0.5)*cellPx, pr, 0, Math.PI*2);
            ctx.fillStyle = cd.fill;
            ctx.globalAlpha = 0.6;
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }

    // ═══ CONVERT ANIMS — Sıvı boya dönüşüm efekti ═══
    for (const a of G.convertAnims) {
        if (a.delay > 0) continue;
        const cd = COLORS[a.color];
        const cx = (a.col+0.5)*cellPx, cy = (a.row+0.5)*cellPx;
        const t = a.progress;

        // Elastic overshoot: blob squash & stretch
        let scale;
        if (t < 0.3) {
            scale = (t/0.3) * 1.4;          // büyü
        } else if (t < 0.5) {
            scale = 1.4 - 0.5*((t-0.3)/0.2); // geri çekil
        } else {
            scale = 0.9 + 0.1*((t-0.5)/0.5); // yerleş
        }

        const r = cellPx * 0.4 * scale;

        // Dış dalga halkası — sıvının yayılma dalgası
        if (t < 0.6) {
            const waveR = cellPx * 0.2 + cellPx * 0.35 * (t/0.6);
            ctx.beginPath(); ctx.arc(cx, cy, waveR, 0, Math.PI*2);
            ctx.strokeStyle = cd.fill;
            ctx.globalAlpha = 0.4 * (1 - t/0.6);
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        // Parlak merkez — boya sıçraması
        if (t < 0.35) {
            const flashR = r * 1.3 * (1 - t/0.35);
            ctx.beginPath(); ctx.arc(cx, cy, flashR, 0, Math.PI*2);
            const fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, flashR);
            fg.addColorStop(0, "rgba(255,255,255,0.6)");
            fg.addColorStop(0.5, cd.light);
            fg.addColorStop(1, "transparent");
            ctx.fillStyle = fg;
            ctx.globalAlpha = 0.7 * (1 - t/0.35);
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // Boya glow kalıntısı
        ctx.beginPath(); ctx.arc(cx, cy, r + 4*(1-t), 0, Math.PI*2);
        ctx.fillStyle = cd.glow;
        ctx.globalAlpha = 0.3 * (1 - t);
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    // ═══ HINT ═══
    if (G.hintCells && G.hintTimer > 0) {
        const pulse = 0.3 + 0.4 * Math.sin(Date.now()*0.005*Math.PI);
        for (const h of G.hintCells) {
            const hx = (h.col+0.5)*cellPx, hy = (h.row+0.5)*cellPx;
            // Outer glow
            ctx.beginPath(); ctx.arc(hx, hy, cellPx*0.42, 0, Math.PI*2);
            ctx.strokeStyle = `rgba(255,255,255,${pulse*0.5})`;
            ctx.lineWidth = 3; ctx.stroke();
            // Inner ring
            ctx.beginPath(); ctx.arc(hx, hy, cellPx*0.35, 0, Math.PI*2);
            ctx.strokeStyle = `rgba(255,255,255,${pulse})`;
            ctx.lineWidth = 1.5; ctx.stroke();
        }
    }

    // ═══ PARTICLES — sıvı damlacıklar ═══
    for (const p of G.particles) {
        // Her parçacık küçük bir parlak damla
        ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI*2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();
        // Tiny highlight
        if (p.radius > 2) {
            ctx.beginPath();
            ctx.arc(p.x - p.radius*0.2, p.y - p.radius*0.2, p.radius*0.3, 0, Math.PI*2);
            ctx.fillStyle = "rgba(255,255,255,0.5)";
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }
}

// ─── GAME LOOP ──────────────────────────────────────────────
let lastTime = 0;
function gameLoop(ts) {
    const dt = Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;
    if (!G.paused) {
        updateConvertAnims(dt);
        updateParticles(dt);
        if (G.hintTimer > 0) {
            G.hintTimer -= dt;
            if (G.hintTimer <= 0) G.hintCells = null;
        }
    }
    render();
    requestAnimationFrame(gameLoop);
}

// ─── INPUT ──────────────────────────────────────────────────
canvas.addEventListener("mousedown", e => { e.preventDefault(); onDragStart(e.clientX, e.clientY); });
document.addEventListener("mousemove", e => { if (G.dragging) { e.preventDefault(); onDragMove(e.clientX, e.clientY); }});
document.addEventListener("mouseup", e => { if (G.dragging) { e.preventDefault(); onDragEnd(); }});

canvas.addEventListener("touchstart", e => { e.preventDefault(); onDragStart(e.touches[0].clientX, e.touches[0].clientY); }, {passive:false});
document.addEventListener("touchmove", e => { if (G.dragging) { e.preventDefault(); onDragMove(e.touches[0].clientX, e.touches[0].clientY); }}, {passive:false});
document.addEventListener("touchend", e => { if (G.dragging) { e.preventDefault(); onDragEnd(); }}, {passive:false});
document.addEventListener("touchcancel", e => { if (G.dragging) onDragEnd(); }, {passive:false});

// ─── BUTTON HANDLERS ────────────────────────────────────────
document.getElementById("btn-play").addEventListener("click", () => {
    regenLives();
    if (saveData.lives <= 0) { showNoLivesMessage(); return; }
    initLevel(saveData.currentLevel);
});

document.getElementById("btn-levels").addEventListener("click", () => {
    buildLevelSelect();
    showScreen("screen-levels");
});
document.getElementById("btn-color-guide").addEventListener("click", () => showScreen("screen-colors"));
document.getElementById("btn-back-levels").addEventListener("click", () => showScreen("screen-menu"));
document.getElementById("btn-back-colors").addEventListener("click", () => showScreen("screen-menu"));

document.getElementById("btn-undo").addEventListener("click", undo);
document.getElementById("btn-hint").addEventListener("click", useHint);
document.getElementById("btn-restart").addEventListener("click", () => initLevel(G.level));

document.getElementById("btn-pause").addEventListener("click", () => {
    G.paused = true;
    document.getElementById("overlay-pause").classList.remove("hidden");
});
document.getElementById("btn-resume").addEventListener("click", () => {
    G.paused = false;
    document.getElementById("overlay-pause").classList.add("hidden");
});
document.getElementById("btn-quit").addEventListener("click", () => {
    G.paused = false; hideAllOverlays();
    showScreen("screen-menu"); updateTotalStars(); updateCoinsUI();
});

document.getElementById("btn-next-level").addEventListener("click", () => {
    hideAllOverlays(); regenLives();
    if (saveData.lives <= 0) { showNoLivesMessage(); showScreen("screen-menu"); return; }
    initLevel(G.level + 1);
});
document.getElementById("btn-replay").addEventListener("click", () => { hideAllOverlays(); initLevel(G.level); });

document.getElementById("btn-extra-moves").addEventListener("click", () => {
    G.moveLimit += 3; G.failed = false;
    document.getElementById("moves-limit").textContent = G.moveLimit;
    updateStarsUI(); hideAllOverlays(); render();
});
document.getElementById("btn-fail-restart").addEventListener("click", () => { hideAllOverlays(); initLevel(G.level); });
document.getElementById("btn-fail-menu").addEventListener("click", () => { hideAllOverlays(); showScreen("screen-menu"); });

// ─── LEVEL SELECT ───────────────────────────────────────────
function buildLevelSelect() {
    const container = document.getElementById("level-grid");
    container.innerHTML = "";
    const maxShow = Math.max(saveData.maxUnlocked + 5, 30);

    for (let i = 1; i <= maxShow; i++) {
        const btn = document.createElement("button");
        btn.className = "level-btn";
        const stars = saveData.stars[i] || 0;
        const locked = i > saveData.maxUnlocked;
        const current = i === saveData.currentLevel;
        const diff = getLevelDifficulty(i);

        if (locked) btn.classList.add("locked");
        if (current) btn.classList.add("current");

        // Color-code by difficulty
        const diffDots = { easy: "🟢", medium: "🟡", hard: "🟠", pinch: "🔴" };
        btn.innerHTML = `
            <span>${locked ? "🔒" : i}</span>
            <span class="level-stars">${locked ? "" : "★".repeat(stars) + "☆".repeat(3-stars)}</span>
            ${!locked ? `<span style="font-size:0.5rem">${diffDots[diff]||""}</span>` : ""}
        `;

        if (!locked) {
            btn.addEventListener("click", () => {
                regenLives();
                if (saveData.lives <= 0) { showNoLivesMessage(); return; }
                initLevel(i);
            });
        }
        container.appendChild(btn);
    }
}

// ─── WINDOW RESIZE + ORIENTATION ────────────────────────────
function onResize() {
    if (document.getElementById("screen-game").classList.contains("active")) {
        G.cellPx = resizeCanvas(G.gridSize);
        Object.keys(orbCache).forEach(k => delete orbCache[k]);
        render();
    }
}
window.addEventListener("resize", onResize);
window.addEventListener("orientationchange", () => setTimeout(onResize, 150));

// ─── BOOT ───────────────────────────────────────────────────
loadSave();

// ► DEV MODE ◄
saveData.lives = MAX_LIVES;
saveData.lastLifeTime = Date.now();
saveData.maxUnlocked = 2000;
saveData.coins = 9999;
writeSave();

updateTotalStars();
updateCoinsUI();
showScreen("screen-menu");
requestAnimationFrame(gameLoop);

})();
