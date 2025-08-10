// Minimal .io-style clone: replicate Everybody Edits: Offline physics and smiley render
// Sources mirrored from: https://github.com/Seb-135/ee-offline
// Physics constants from src/Config.as, movement integration from src/SynchronizedObject.as and src/Player.as

const Config = {
  physics_ms_per_tick: 10,
  physics_variable_multiplyer: 7.752,
  physics_base_drag: Math.pow(0.9981, 10) * 1.00016093,
  physics_ice_no_mod_drag: Math.pow(0.9993, 10) * 1.00016093,
  physics_ice_drag: Math.pow(0.9998, 10) * 1.00016093,
  physics_no_modifier_drag: Math.pow(0.9900, 10) * 1.00016093,
  physics_water_drag: Math.pow(0.9950, 10) * 1.00016093,
  physics_mud_drag: Math.pow(0.9750, 10) * 1.00016093,
  physics_lava_drag: Math.pow(0.9800, 10) * 1.00016093,
  physics_toxic_drag: Math.pow(0.9900, 10) * 1.00016093,
  physics_jump_height: 26,
  physics_gravity: 2,
  physics_boost: 16,
  physics_water_buoyancy: -0.5,
  physics_mud_buoyancy: 0.4,
  physics_lava_buoyancy: 0.2,
  physics_toxic_buoyancy: -0.4,
  camera_lag: 1/16,
};

const GRAVITY_DIR = {
  down: 0, // default EE
  left: 1, // rotate 90deg cw of default handling order used in Player.tick
  up: 2,
  right: 3,
};

class PlayerPhysics {
  constructor() {
    this._speedX = 0;
    this._speedY = 0;
    this._modifierX = 0;
    this._modifierY = 0;
    this._no_modifier_dragX = Config.physics_no_modifier_drag;
    this._no_modifier_dragY = Config.physics_no_modifier_drag;
    this._water_drag = Config.physics_water_drag;
    this._mud_drag = Config.physics_mud_drag;
    this._lava_drag = Config.physics_lava_drag;
    this._toxic_drag = Config.physics_toxic_drag;
    this._gravity = Config.physics_gravity;
    this._boost = Config.physics_boost;

    this.mult = Config.physics_variable_multiplyer;
    this.mx = 0;
    this.my = 0;
    this.mox = 0;
    this.moy = 0;

    this.x = 16;
    this.y = 16;

    this.flipGravity = 0; // 0..3
    this.low_gravity = false;
    this.jumpBoost = 0; // 0 none, 1 high(1.3), 2 low(.75)
    this.speedBoost = 0; // 0 none, 1 fast(1.5), 2 slow(.6)
    this.maxJumps = 1;
    this.jumpCount = 0;
    this.lastJumpMs = -performance.now();
    // EE jump timing state
    this.spaceHeld = false;
    this.spacePressMs = 0; // used only for legacy logic, not needed after exact EE logic
  }

  get gravityMultiplier() {
    let gm = 1;
    if (this.low_gravity) gm *= 0.15;
    return gm;
  }
  get jumpMultiplier() {
    let jm = 1;
    if (this.jumpBoost === 1) jm *= 1.3;
    if (this.jumpBoost === 2) jm *= 0.75;
    return jm;
  }
  get speedMultiplier() {
    let sm = 1;
    if (this.speedBoost === 1) sm *= 1.5;
    if (this.speedBoost === 2) sm *= 0.6;
    return sm;
  }
  get speedX() { return this._speedX * this.mult; }
  set speedX(v) { this._speedX = v / this.mult; }
  get speedY() { return this._speedY * this.mult; }
  set speedY(v) { this._speedY = v / this.mult; }
  get modifierX() { return this._modifierX * this.mult; }
  set modifierX(v) { this._modifierX = v / this.mult; }
  get modifierY() { return this._modifierY * this.mult; }
  set modifierY(v) { this._modifierY = v / this.mult; }

  applyForces(inputH, inputV) {
    // EE-style: compute current (mor) and delayed (mo) based on action tiles, with rotate flags
    let morx = 0, mory = 0, mox = 0, moy = 0;
    let rotateGravitymor = true, rotateGravitymo = true;
    if (!state.godMode) {
      const cur = state.currentActionId | 0;
      const del = state.delayedActionId | 0;
      // current
      if (cur === 1 || cur === 411) { morx = -this._gravity; mory = 0; rotateGravitymor = false; }
      else if (cur === 2 || cur === 412) { morx = 0; mory = -this._gravity; rotateGravitymor = false; }
      else if (cur === 3 || cur === 413) { morx = this._gravity; mory = 0; rotateGravitymor = false; }
      else if (cur === 1518 || cur === 1519) { morx = 0; mory = this._gravity; rotateGravitymor = false; }
      else if (cur === 4 || cur === 414 || cur === 459 || cur === 460) { morx = 0; mory = 0; }
      else { morx = 0; mory = this._gravity; }
      // delayed
      if (del === 1 || del === 411) { mox = -this._gravity; moy = 0; rotateGravitymo = false; }
      else if (del === 2 || del === 412) { mox = 0; moy = -this._gravity; rotateGravitymo = false; }
      else if (del === 3 || del === 413) { mox = this._gravity; moy = 0; rotateGravitymo = false; }
      else if (del === 1518 || del === 1519) { mox = 0; moy = this._gravity; rotateGravitymo = false; }
      else if (del === 4 || del === 414 || del === 459 || del === 460) { mox = 0; moy = 0; }
      else { mox = 0; moy = this._gravity; }
      // Do not scale delayed arrow acceleration by stack; EE uses constant gravity magnitude
      // rotate by persistent flipGravity with rotate flags
      switch (this.flipGravity) {
        case 1: {
          if (rotateGravitymo) { const t = mox; mox = -moy; moy = t; }
          if (rotateGravitymor) { const t2 = morx; morx = -mory; mory = t2; }
          break;
        }
        case 2: {
          if (rotateGravitymo) { mox = -mox; moy = -moy; }
          if (rotateGravitymor) { morx = -morx; mory = -mory; }
          break;
        }
        case 3: {
          if (rotateGravitymo) { const t = mox; mox = moy; moy = -t; }
          if (rotateGravitymor) { const t2 = morx; morx = mory; mory = -t2; }
          break;
        }
      }
      // While on a ladder, cancel gravity accelerations entirely
      if (state.onLadder) { morx = 0; mory = 0; mox = 0; moy = 0; }
    }
    this.morx = morx; this.mory = mory;
    this.mox = mox; this.moy = moy;

    // input mapping per Player.tick: restrict input to axis not aligned with delayed gravity (skip in god or on dots)
    let inH = inputH;
    let inV = inputV;
    const zeroGrav = (state.onClimbDot || state.onClimbDelayed || state.onNoGravDotDotCurrent || state.onNoGravDotDotDelayed || state.onLadder);
    if (!state.godMode && !zeroGrav) {
      if (Math.abs(this.moy) > 0) {
        inV = 0;
      } else if (Math.abs(this.mox) > 0) {
        inH = 0;
      }
    }
    // On dots allow full directional input, otherwise restrict to axis not aligned with gravity
    if (zeroGrav) { inH = inputH; inV = inputV; }
    this.mx = inH;
    this.my = inV;

    // apply multipliers
    let sm = this.speedMultiplier;
    // Slow/climb dot should slow movement; classic dot should NOT slow.
    // Do NOT slow for ladders (handled separately for vertical only)
    if ((state.onClimbCurrent || state.onClimbDelayed) && !state.onLadder) sm *= 0.6;
    const gm = this.gravityMultiplier;
    const mx = this.mx * sm;
    const my = this.my * sm;
    // EE uses delayed tile acceleration (mox/moy) for this tick
    const moxAcc = this.mox * gm;
    const moyAcc = this.moy * gm;

    // Set via setters to keep units correct (internal = external / mult)
    this.modifierX = moxAcc + mx;
    this.modifierY = moyAcc + my;
    // no thrust hover; removed per request

    // X drag and clamp (mirrors Player.tick logic order)
    if (this._speedX || this._modifierX) {
      this._speedX += this._modifierX;
      // base drag (keep for smooth acceleration/deceleration, even in god mode)
      this._speedX *= Config.physics_base_drag;
      // if no input against gravity axis, apply additional drag matching EE behavior
      if (!state.godMode) {
        if ((mx === 0 && moyAcc !== 0) || (this._speedX < 0 && mx > 0) || (this._speedX > 0 && mx < 0)) {
          this._speedX *= this._no_modifier_dragX;
        }
      }
      if (this._speedX > 16) this._speedX = 16;
      else if (this._speedX < -16) this._speedX = -16;
      else if (Math.abs(this._speedX) < 0.0001) this._speedX = 0;
    }

      // Y drag and clamp
    if (this._speedY || this._modifierY) {
      this._speedY += this._modifierY;
      // EE base drag only
      this._speedY *= Config.physics_base_drag;
      if (!state.godMode) {
        if ((my === 0 && moxAcc !== 0) || (this._speedY < 0 && my > 0) || (this._speedY > 0 && my < 0)) {
          this._speedY *= this._no_modifier_dragY;
        }
      }
      // No special braking; rely on arrow acceleration strength
      if (this._speedY > 16) this._speedY = 16;
      else if (this._speedY < -16) this._speedY = -16;
      else if (Math.abs(this._speedY) < 0.0001) this._speedY = 0;
    }
  }

  stepPosition(collidesFn) {
    // Re-implement sub-tile stepping preserving EE's per-unit collision stepping order
    let currentSX = this._speedX;
    let currentSY = this._speedY;
    let rx = this.x % 1;
    let ry = this.y % 1;
    let donex = false, doney = false;

    const stepx = () => {
      if (currentSX > 0) {
        if (currentSX + rx >= 1) {
          this.x += (1 - rx); this.x = (this.x) >> 0; currentSX -= (1 - rx); rx = 0;
        } else { this.x += currentSX; currentSX = 0; }
      } else if (currentSX < 0) {
        if (rx + currentSX < 0 && rx !== 0) { currentSX += rx; this.x -= rx; this.x = (this.x) >> 0; rx = 1; }
        else { this.x += currentSX; currentSX = 0; }
      }
      if (!state.godMode && collidesFn(this.x, this.y)) {
        // revert X
        this.x = this.ox;
        this._speedX = 0; currentSX = this.osx; donex = true;
      }
    };
    const stepy = () => {
      if (currentSY > 0) {
        if (currentSY + ry >= 1) {
          this.y += (1 - ry); this.y = (this.y) >> 0; currentSY -= (1 - ry); ry = 0;
        } else { this.y += currentSY; currentSY = 0; }
      } else if (currentSY < 0) {
        if (ry + currentSY < 0 && ry !== 0) { this.y -= ry; this.y = (this.y) >> 0; currentSY += ry; ry = 1; }
        else { this.y += currentSY; currentSY = 0; }
      }
      if (!state.godMode && collidesFn(this.x, this.y)) {
        // revert Y
        this.y = this.oy;
        this._speedY = 0; currentSY = this.osy; doney = true;
      }
    };

    let guard = 0;
    while (((currentSX !== 0 && !donex) || (currentSY !== 0 && !doney)) && guard++ < 64) {
      this.ox = this.x; this.oy = this.y; this.osx = currentSX; this.osy = currentSY;
      stepx();
      stepy();
    }
  }

  shouldTriggerJump(spaceJustPressed, spaceHeld, now) {
    // Exact EE semantics from Player.tick:
    // On spaceJustPressed: immediate jump and lastJump = -now (negative)
    // While held: if lastJump < 0, trigger when now + lastJump > 750ms; else when now - lastJump > 150ms
    if (spaceJustPressed) {
      this.lastJumpMs = -now;
      return { trigger: true, mod: -1 };
    }
    if (spaceHeld) {
      if (this.lastJumpMs < 0) {
        if (now + this.lastJumpMs > 750) return { trigger: true, mod: +1 };
      } else {
        if (now - this.lastJumpMs > 150) return { trigger: true, mod: +1 };
      }
    }
    return { trigger: false, mod: +1 };
  }

  performJump(now, grounded, mod) {
    if (grounded) this.jumpCount = 0;
    if (this.jumpCount === 0 && !grounded) this.jumpCount = 1;

    let didJump = false;
    const doAxis = (axis) => {
      if (this.jumpCount < this.maxJumps && axis.mor) {
        if (this.maxJumps < 1000) this.jumpCount += 1;
        // Slight epsilon to prevent reaching a full 4-block jump
        const v0 = -axis.mor * Config.physics_jump_height * this.jumpMultiplier;
        const v = v0 * 0.995;
        if (axis.kind === 'x') this.speedX = v; else this.speedY = v;
        didJump = true;
      }
    };
    doAxis({ kind: 'x', mor: this.morx, mo: this.mox });
    doAxis({ kind: 'y', mor: this.mory, mo: this.moy });

    // lastJump handling: on spaceJustPressed we had set lastJump = -now already; subsequent jumps set lastJump to +now
    if (didJump) {
      if (mod < 0) {
        // keep it negative like EE does on first jump so the 750ms window applies
        this.lastJumpMs = -now;
      } else {
        this.lastJumpMs = now;
      }
    }
  }

  // no separate auto-jump helper; handled in shouldTriggerJump
}

// Simple tile world
const TILE = 16;
let WORLD_W = 40; // default 640/16
let WORLD_H = 31; // default 500/16 ~31.25
const solid = new Set();
function isSolidStaticId(id) {
  // Use authoritative EEBlocks folder as primary hint:
  // Foreground -> solid, Background/Decoration/Effect/Special -> non-solid
  try {
    if (window.getEEBlocksLayerForId) {
      const layer = window.getEEBlocksLayerForId(id);
      if (layer) {
        if (layer === 'foreground') {
          // Exceptions: instruments and coins are not solid
          if (id === 77 || id === 83) return false;
          if (id === 100 || id === 101 || id === 110 || id === 111) return false;
          // Ladder should be passable
          if (id === 120) return false;
          // Doors and gates are handled dynamically by getDoorGateBlocking
          if (id >= 23 && id <= 28) return false;
          // Keys are passable
          if (id === 6 || id === 7 || id === 8) return false;
          // Action tiles are not solid
          if (id === 1 || id === 2 || id === 3 || id === 1518 || id === 411 || id === 412 || id === 413 || id === 1519) return false;
          if (id === 4 || id === 414 || id === 459 || id === 460) return false;
          // Boost tiles (effect + foreground variants)
          if (id === 417 || id === 418 || id === 419 || id === 420 || id === 422 || id === 423) return false;
          if (id === 114 || id === 115 || id === 116 || id === 117) return false;
          return true;
        }
        return false;
      }
    }
  } catch (e) { /* fallback below */ }
  // Fallback to legacy heuristic ranges
  // Open coin door (use FG 136 sprite but treat as non-solid)
  if (id === 136) return false;
  // Ladder passable
  if (id === 120) return false;
  // Doors and gates are handled dynamically
  if (id >= 23 && id <= 28) return false;
  // Keys are always passable
  if (id === 6 || id === 7 || id === 8) return false;
  if (id === 77 || id === 83) return false; // instruments
  if (id === 1 || id === 2 || id === 3 || id === 1518 || id === 411 || id === 412 || id === 413 || id === 1519) return false; // arrows
  if (id === 4 || id === 414 || id === 459 || id === 460) return false; // dots
  if (id === 417 || id === 418 || id === 419 || id === 420 || id === 422 || id === 423) return false; // boosts (effect)
  if (id === 114 || id === 115 || id === 116 || id === 117) return false; // boosts (foreground variants)
  if ((id >= 9 && id <= 97) || (id >= 122 && id <= 217) || (id >= 1001 && id <= 1499)) return true;
  return false;
}

// minimal maps for rendering
let fgMap = [];
let bgMap = [];
let decoMap = [];
// Dynamic tile index for fast overlay (coins, above-layer, doors/gates)
const dynamicIndex = { coins: new Set(), above: new Set(), doors: new Set() };
// Local client-only door/gate ghosting:
// While the player is overlapping a door/gate tile, keep it non-blocking and show passable art locally
const localDoorGhosts = new Set();
try { window.EE_LocalGhosts = localDoorGhosts; } catch(_) {}
// Local per-color freeze: while touching a color's door/gate, freeze ONLY that color locally
const localFreezeUntil = { red: 0, green: 0, blue: 0 };
function isColorFrozen(color){ return performance.now() < (localFreezeUntil[color] || 0); }
try { window.EE_LocalFreezeColors = { red: false, green: false, blue: false }; } catch(_) {}
function keyXY(x,y){ return `${x},${y}`; }
function isCoinId(id){ return id===100||id===101||id===110||id===111; }
function isAboveId(id){ return !!(window.EE_AboveIds && window.EE_AboveIds.has(id)); }
function updateDynamicAtXY(x,y){
  const idBg = (bgMap[y] && bgMap[y][x]) || 0;
  const idDe = (decoMap[y] && decoMap[y][x]) || 0;
  const idFg = (fgMap[y] && fgMap[y][x]) || 0;
  const hasCoin = isCoinId(idBg) || isCoinId(idDe) || isCoinId(idFg);
  const hasAbove = isAboveId(idBg) || isAboveId(idDe) || isAboveId(idFg);
  const hasDoor = (idBg>=23&&idBg<=28) || (idDe>=23&&idDe<=28) || (idFg>=23&&idFg<=28);
  const k = keyXY(x,y);
  if (hasCoin) dynamicIndex.coins.add(k); else dynamicIndex.coins.delete(k);
  if (hasAbove) dynamicIndex.above.add(k); else dynamicIndex.above.delete(k);
  if (hasDoor) dynamicIndex.doors.add(k); else dynamicIndex.doors.delete(k);
}
function rebuildDynamicIndex(){
  dynamicIndex.coins.clear(); dynamicIndex.above.clear(); dynamicIndex.doors.clear();
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) updateDynamicAtXY(x,y);
  }
}
// Tile cache for maximal FPS: pre-render static tiles to a single offscreen canvas
const tileCache = { canvas: null, ctx: null, w: 0, h: 0, dirtyAll: true, dirtySet: new Set() };
function initMap() {
  fgMap = new Array(WORLD_H);
  bgMap = new Array(WORLD_H);
  decoMap = new Array(WORLD_H);
  for (let y=0;y<WORLD_H;y++){ fgMap[y]=new Array(WORLD_W).fill(0); bgMap[y]=new Array(WORLD_W).fill(0); decoMap[y]=new Array(WORLD_W).fill(0); }
  window.fgMap = fgMap;
  window.bgMap = bgMap;
  window.decoMap = decoMap;
  // Invalidate tile cache on world init
  tileCache.dirtyAll = true; tileCache.dirtySet.clear();
  rebuildDynamicIndex();
}
function markDirtyTile(x,y){ tileCache.dirtySet.add(`${x},${y}`); }
function setTileFg(x,y,id){ if (y>=0&&y<WORLD_H&&x>=0&&x<WORLD_W){ if (!fgMap[y]) fgMap[y]=[]; fgMap[y][x]=id; if (isSolid(id)) solid.add(`${x},${y}`); markDirtyTile(x,y); updateDynamicAtXY(x,y); }}
function setTileBg(x,y,id){ if (y>=0&&y<WORLD_H&&x>=0&&x<WORLD_W){ if (!bgMap[y]) bgMap[y]=[]; bgMap[y][x]=id; markDirtyTile(x,y); updateDynamicAtXY(x,y); }}
function setTileDeco(x,y,id){ if (y>=0&&y<WORLD_H&&x>=0&&x<WORLD_W){ if (!decoMap[y]) decoMap[y]=[]; decoMap[y][x]=id; markDirtyTile(x,y); updateDynamicAtXY(x,y); }}
function isSolid(id){
  return isSolidStaticId(id);
}

function clearWorld() {
  solid.clear();
}

function buildDefaultWorld() {
  clearWorld();
  initMap();
  // simple border using foreground solids
  for (let x = 0; x < WORLD_W; x++) { setTileFg(x, 0, 9); setTileFg(x, WORLD_H-1, 9); }
  for (let y = 0; y < WORLD_H; y++) { setTileFg(0, y, 9); setTileFg(WORLD_W-1, y, 9); }
}
buildDefaultWorld();

function collidesAt(px, py) {
  // Axis-aligned 16x16 bounding box
  const left = Math.floor(px / TILE);
  const top = Math.floor(py / TILE);
  const right = Math.floor((px + 15) / TILE);
  const bottom = Math.floor((py + 15) / TILE);
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      // Respect local door-gate ghosting: never block inside ghosted tiles for local client
      const k = `${x},${y}`;
      if (!state.godMode && localDoorGhosts && localDoorGhosts.has(k)) continue;
      if (isBlockingAt(x, y)) return true;
    }
  }
  return false;
}

// Dynamic blocking check: foreground solids, and doors/gates depending on key state
function isBlockingAt(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return true;
  if (state.godMode) return false;
  const fg = (fgMap[ty] && fgMap[ty][tx]) || 0;
  if (fg && isSolidStaticId(fg)) return true;
  // Background never blocks
  // const bg = (bgMap[ty] && bgMap[ty][tx]) || 0; // intentionally ignored for blocking
  const decoId = (decoMap[ty] && decoMap[ty][tx]) || 0;
  // If door/gate mistakenly placed in foreground, honor it too
  const fgDoor = (fg >= 23 && fg <= 28) ? fg : 0;
  const idForDoor = (decoId >= 23 && decoId <= 28) ? decoId : fgDoor;
  // If per-color freeze is on for this color, treat that color door/gate as passable locally
  if (idForDoor) {
    if ((idForDoor===23||idForDoor===26) && isColorFrozen('red')) return false;
    if ((idForDoor===24||idForDoor===27) && isColorFrozen('green')) return false;
    if ((idForDoor===25||idForDoor===28) && isColorFrozen('blue')) return false;
  }
  // Doors/gates use dynamic rule; per-tile ghost handled in collidesAt, not here
  const doorState = getDoorGateBlocking(idForDoor);
  if (doorState) return true;
  return false;
}

function isLadderId(id) { return id === 120; }
function isLadderAt(tx, ty) {
  const f = (fgMap[ty] && fgMap[ty][tx]) || 0;
  const d = (decoMap[ty] && decoMap[ty][tx]) || 0;
  const b = (bgMap[ty] && bgMap[ty][tx]) || 0;
  return isLadderId(f) || isLadderId(d) || isLadderId(b);
}

function getDoorGateBlocking(id) {
  // Dynamic rules: keys active for 5s
  const redOn = isKeyActive('red');
  const greenOn = isKeyActive('green');
  const blueOn = isKeyActive('blue');
  // Doors block when key is INACTIVE; open (passable) when key is active
  if (id === 23) return !redOn;
  if (id === 24) return !greenOn;
  if (id === 25) return !blueOn;
  // Gates block when key is ACTIVE; passable when key is inactive
  if (id === 26) return redOn;
  if (id === 27) return greenOn;
  if (id === 28) return blueOn;
  // Cyan/Magenta/Yellow
  if (id === 1005) return !isKeyActive('cyan');
  if (id === 1006) return !isKeyActive('magenta');
  if (id === 1007) return !isKeyActive('yellow');
  if (id === 1008) return isKeyActive('cyan');
  if (id === 1009) return isKeyActive('magenta');
  if (id === 1010) return isKeyActive('yellow');
  return false;
}

function transformDoorGateVisual(id) {
  const ro = isKeyActive('red');
  const go = isKeyActive('green');
  const bo = isKeyActive('blue');
  if (id === 23 && ro) return 26; // red door -> red gate when active
  if (id === 26 && ro) return 23; // red gate -> red door when active
  if (id === 24 && go) return 27; // green door -> green gate
  if (id === 27 && go) return 24;
  if (id === 25 && bo) return 28; // blue door -> blue gate
  if (id === 28 && bo) return 25;
  return id;
}

// Minimal EEO .eelvl inflater and parser
function tryLoadLevelFromEELVL(bytes) {
  // EEO .eelvl is zlib-deflated payload. Try to inflate. If fail, skip.
  let inflated;
  let inflateMode = 'zlib';
  try {
    inflated = pako.inflate(bytes);
  } catch (e1) {
    try { inflated = pako.inflateRaw(bytes); inflateMode = 'raw'; }
    catch (e2) {
      try { inflated = pako.ungzip(bytes); inflateMode = 'gzip'; }
      catch (e3) {
        window.eelvlStats = { error: true, reason: 'inflate_failed', modesTried: ['zlib','raw','gzip'] };
        return;
      }
    }
  }
  const dv = new DataView(inflated.buffer);
  let p = 0;
  function readUTF() {
    // Strings are UTF bytes prefixed? In EEO save, they used ByteArray.writeUTF (2-byte length + data)
    if (p + 2 > dv.byteLength) return '';
    const len = dv.getUint16(p); p += 2;
    const slice = inflated.subarray(p, p + len); p += len;
    return new TextDecoder().decode(slice);
  }
  function readInt() { const v = dv.getInt32(p); p += 4; return v; }
  function readFloat() { const v = dv.getFloat32(p); p += 4; return v; }
  function readUInt() { const v = dv.getUint32(p); p += 4; return v; }
  function readBytes(n) { const s = inflated.subarray(p, p + n); p += n; return s; }

  try {
    // Helper: deep scan all plausible records regardless of current pointer
    function deepScanAllRecords() {
      const records = [];
      let i = 0;
      const end = dv.byteLength;
      while (i + 12 <= end) {
        const id = dv.getInt32(i);
        const layer = dv.getInt32(i + 4);
        const xLen = dv.getUint32(i + 8);
        const xsStart = i + 12;
        const xsEnd = xsStart + xLen;
        if (!(layer === 0 || layer === 1 || layer === 2) || (xLen % 2 !== 0) || xsEnd + 4 > end) { i++; continue; }
        const yLen = dv.getUint32(xsEnd);
        const ysStart = xsEnd + 4;
        const ysEnd = ysStart + yLen;
        if (yLen % 2 !== 0 || ysEnd > end) { i++; continue; }
        const count = xLen >> 1;
        if ((yLen >> 1) !== count) { i++; continue; }
        const xsArr = new Array(count);
        const ysArr = new Array(count);
        for (let k = 0; k < count; k++) {
          xsArr[k] = (inflated[xsStart + (k<<1)] << 8) | inflated[xsStart + (k<<1) + 1];
          ysArr[k] = (inflated[ysStart + (k<<1)] << 8) | inflated[ysStart + (k<<1) + 1];
        }
        records.push({ id, layer, xs: xsArr, ys: ysArr });
        i = ysEnd; // jump beyond arrays; extras ignored by scan
      }
      return records;
    }

    // Header (see DownloadLevel.as):
    // owner (UTF), name (UTF), width (int), height (int), gravity (float), bg (uint), desc (UTF),
    // campaign (bool), crewId (UTF), crewName (UTF), crewStatus (int), minimap (bool), ownerId (UTF)
    const owner = readUTF();
    const worldName = readUTF();
    const w = readInt();
    const h = readInt();
    const grav = readFloat();
    const bg = readUInt();
    const desc = readUTF();
    const campaign = dv.getUint8(p); p += 1;
    const crewId = readUTF();
    const crewName = readUTF();
    const crewStatus = readInt();
    const minimap = dv.getUint8(p); p += 1;
    const ownerId = readUTF();
    // Skip the rest of header by scanning blocks (we will try to parse blocks array by array)
    // Determine true dimensions by deep scanning all records first
    let maxHeaderW = Math.max(3, w);
    let maxHeaderH = Math.max(3, h);
    const preRecords = (function(){ try { return deepScanAllRecords(); } catch(_) { return []; } })();
    let maxX = 0, maxY = 0;
    for (const r of preRecords) {
      for (let k = 0; k < r.xs.length; k++) { if (r.xs[k] > maxX) maxX = r.xs[k]; if (r.ys[k] > maxY) maxY = r.ys[k]; }
    }
    WORLD_W = Math.max(maxHeaderW, maxX + 1);
    WORLD_H = Math.max(maxHeaderH, maxY + 1);
    clearWorld();
    initMap();
    // Build bounding border if not present in data
    for (let x = 0; x < WORLD_W; x++) { solid.add(`${x},0`); solid.add(`${x},${WORLD_H-1}`); }
    for (let y = 0; y < WORLD_H; y++) { solid.add(`0,${y}`); solid.add(`${WORLD_W-1},${y}`); }
    // Now iterate until end of buffer: blockId (int), layer (int), XsLen (uint), Xs bytes, YsLen (uint), Ys bytes, extra props ...
    function findNextRecordPos(start) {
      for (let pos = start; pos < dv.byteLength - 12; pos++) {
        const type = dv.getInt32(pos);
        const layer = dv.getInt32(pos + 4);
        const xLen = dv.getUint32(pos + 8);
        // basic sanity: layer 0/1/2, xLen even and not huge
        if ((layer === 0 || layer === 1 || layer === 2) && xLen % 2 === 0 && xLen < 1e7) {
          const xEnd = pos + 12 + xLen;
          if (xEnd + 4 <= dv.byteLength) {
            const yLen = dv.getUint32(xEnd);
            if (yLen % 2 === 0 && yLen < 1e7 && xEnd + 4 + yLen <= dv.byteLength) {
              return pos;
            }
          }
        }
      }
      return -1;
    }

    // align to first plausible record immediately after header
    const firstPos = findNextRecordPos(p);
    let placed = 0, recs = 0;
    if (firstPos === -1) {
      // Fallback: deep scan entire buffer for records
      const records = deepScanAllRecords();
      // Derive dims from records if empty header
      let maxX = 0, maxY = 0;
      for (const r of records) {
        for (let k = 0; k < r.xs.length; k++) { if (r.xs[k] > maxX) maxX = r.xs[k]; if (r.ys[k] > maxY) maxY = r.ys[k]; }
      }
      if (maxX + 1 > WORLD_W || maxY + 1 > WORLD_H) {
        WORLD_W = Math.max(WORLD_W, maxX + 1);
        WORLD_H = Math.max(WORLD_H, maxY + 1);
        clearWorld();
        initMap();
      }
      for (const r of records) {
        // EEO: layer 0 = foreground, 1 = background, 2 = decoration
        const setter = (r.layer === 1) ? setTileBg : setTileFg;
        for (let k = 0; k < r.xs.length; k++) { setter(r.xs[k], r.ys[k], r.id); placed++; }
        recs++;
      }
      window.eelvlStats = { width: WORLD_W, height: WORLD_H, records: recs, tiles: placed };
      return;
    }
    p = firstPos;

    placed = 0; recs = 0;
    while (p + 12 <= dv.byteLength) {
      const blockId = readInt();
      const layer = readInt();
      const xLen = readUInt();
      const xs = readBytes(xLen);
      const yLen = readUInt();
      const ys = readBytes(yLen);
      // Convert 16-bit ushort arrays
      const xsArr = [];
      for (let i = 0; i < xs.length; i += 2) xsArr.push((xs[i] << 8) | xs[i + 1]);
      const ysArr = [];
      for (let i = 0; i < ys.length; i += 2) ysArr.push((ys[i] << 8) | ys[i + 1]);
      // Record tiles by layer
      if (layer === 0) {
        for (let i = 0; i < xsArr.length; i++) {
          const x = xsArr[i], y = ysArr[i];
          setTileFg(x, y, blockId);
          placed++;
        }
      } else if (layer === 1) {
        for (let i = 0; i < xsArr.length; i++) {
          const x = xsArr[i], y = ysArr[i];
          setTileBg(x, y, blockId);
          placed++;
        }
      } else if (layer === 2) {
        for (let i = 0; i < xsArr.length; i++) {
          const x = xsArr[i], y = ysArr[i];
          setTileDeco(x, y, blockId);
          // decoration doesn't affect collision
        }
      }
      recs++;
      // Skip variable properties (unknown count) by scanning for the next plausible record anywhere ahead
      const nextPos = findNextRecordPos(p);
      if (nextPos === -1) break;
      p = nextPos;
    }
    // Fallback: deep scan for records if none placed
    if (!placed) {
      let i = (p /* current */);
      i = 0; // scan entire buffer after header parsing
      placed = 0; recs = 0;
      const end = dv.byteLength;
      while (i + 12 <= end) {
        const id = dv.getInt32(i);
        const layer = dv.getInt32(i + 4);
        const xLen = dv.getUint32(i + 8);
        const xsStart = i + 12;
        const xsEnd = xsStart + xLen;
        if (!(layer === 0 || layer === 1 || layer === 2) || (xLen % 2 !== 0) || xsEnd + 4 > end) { i++; continue; }
        const yLen = dv.getUint32(xsEnd);
        const ysStart = xsEnd + 4;
        const ysEnd = ysStart + yLen;
        if (yLen % 2 !== 0 || ysEnd > end) { i++; continue; }
        const count = xLen >> 1;
        if ((yLen >> 1) !== count) { i++; continue; }
        // Decode coords and validate plausibility
        const xsArr = [];
        const ysArr = [];
        let outside = 0;
        for (let k = 0; k < count; k++) {
          const xv = (inflated[xsStart + (k<<1)] << 8) | inflated[xsStart + (k<<1) + 1];
          const yv = (inflated[ysStart + (k<<1)] << 8) | inflated[ysStart + (k<<1) + 1];
          xsArr.push(xv); ysArr.push(yv);
          if (xv >= WORLD_W || yv >= WORLD_H) outside++;
        }
        if (outside > Math.max(1, count * 0.2)) { i++; continue; }
        // Accept record
        if (layer === 0) {
          for (let k = 0; k < count; k++) { setTileFg(xsArr[k], ysArr[k], id); placed++; }
        } else if (layer === 1) {
          for (let k = 0; k < count; k++) { setTileBg(xsArr[k], ysArr[k], id); placed++; }
        } else if (layer === 2) {
          for (let k = 0; k < count; k++) { setTileDeco(xsArr[k], ysArr[k], id); }
        }
        recs++;
        i = ysEnd; // jump past arrays; extras (if any) will be skipped by scanning
      }
    }
    window.eelvlStats = { width: WORLD_W, height: WORLD_H, records: recs, tiles: placed };
    // Rebuild cached world bitmap after load since layers changed
    try { window.EE_ForceCacheRebuild = true; } catch (e) {}
  } catch (e) {
    // if parsing fails, show empty bordered world with correct size
    clearWorld();
    for (let x = 0; x < WORLD_W; x++) { solid.add(`${x},0`); solid.add(`${x},${WORLD_H-1}`); }
    for (let y = 0; y < WORLD_H; y++) { solid.add(`0,${y}`); solid.add(`${WORLD_W-1},${y}`); }
    window.eelvlStats = { error: true, width: WORLD_W, height: WORLD_H, records: 0, tiles: 0 };
  }
}

// Pure parser variant: returns detached maps without mutating global world
function parseEELVLToMaps(bytes) {
  let inflated;
  let dv;
  try {
    try { inflated = pako.inflate(bytes); } catch { inflated = pako.inflateRaw(bytes); }
  } catch {
    try { inflated = pako.ungzip(bytes); } catch { return null; }
  }
  dv = new DataView(inflated.buffer);
  let p = 0;
  function readUTF() {
    if (p + 2 > dv.byteLength) return '';
    const len = dv.getUint16(p); p += 2;
    const slice = inflated.subarray(p, p + len); p += len;
    return new TextDecoder().decode(slice);
  }
  function readInt() { const v = dv.getInt32(p); p += 4; return v; }
  function readFloat() { const v = dv.getFloat32(p); p += 4; return v; }
  function readUInt() { const v = dv.getUint32(p); p += 4; return v; }

  function deepScanAllRecords() {
    const records = [];
    let i = 0; const end = dv.byteLength;
    while (i + 12 <= end) {
      const id = dv.getInt32(i);
      const layer = dv.getInt32(i + 4);
      const xLen = dv.getUint32(i + 8);
      const xsStart = i + 12; const xsEnd = xsStart + xLen;
      if (!(layer === 0 || layer === 1 || layer === 2) || (xLen % 2 !== 0) || xsEnd + 4 > end) { i++; continue; }
      const yLen = dv.getUint32(xsEnd);
      const ysStart = xsEnd + 4; const ysEnd = ysStart + yLen;
      if (yLen % 2 !== 0 || ysEnd > end) { i++; continue; }
      const count = xLen >> 1; if ((yLen >> 1) !== count) { i++; continue; }
      const xsArr = new Array(count); const ysArr = new Array(count);
      for (let k = 0; k < count; k++) {
        xsArr[k] = (inflated[xsStart + (k<<1)] << 8) | inflated[xsStart + (k<<1) + 1];
        ysArr[k] = (inflated[ysStart + (k<<1)] << 8) | inflated[ysStart + (k<<1) + 1];
      }
      records.push({ id, layer, xs: xsArr, ys: ysArr });
      i = ysEnd;
    }
    return records;
  }

  try {
    // Header
    const owner = readUTF();
    const worldName = readUTF();
    const wHeader = readInt();
    const hHeader = readInt();
    const grav = readFloat();
    const bgCol = readUInt();
    const desc = readUTF();
    const campaign = dv.getUint8(p); p += 1; const crewId = readUTF(); const crewName = readUTF();
    const crewStatus = readInt(); const minimap = dv.getUint8(p); p += 1; const ownerId = readUTF();

    function findNextRecordPos(start) {
      for (let pos = start; pos < dv.byteLength - 12; pos++) {
        const type = dv.getInt32(pos);
        const layer = dv.getInt32(pos + 4);
        const xLen = dv.getUint32(pos + 8);
        if ((layer === 0 || layer === 1 || layer === 2) && xLen % 2 === 0 && xLen < 1e7) {
          const xEnd = pos + 12 + xLen;
          if (xEnd + 4 <= dv.byteLength) {
            const yLen = dv.getUint32(xEnd);
            if (yLen % 2 === 0 && yLen < 1e7 && xEnd + 4 + yLen <= dv.byteLength) {
              return pos;
            }
          }
        }
      }
      return -1;
    }

    // Derive dimensions via deep scan first (more reliable than header)
    const pre = deepScanAllRecords();
    let maxX = 0, maxY = 0;
    for (const r of pre) { for (let i = 0; i < r.xs.length; i++) { if (r.xs[i] > maxX) maxX = r.xs[i]; if (r.ys[i] > maxY) maxY = r.ys[i]; } }
    const W = Math.max(3, Math.max(wHeader, maxX + 1));
    const H = Math.max(3, Math.max(hHeader, maxY + 1));
    const fg = new Array(H); const bgm = new Array(H); const deco = new Array(H);
    for (let y = 0; y < H; y++) { fg[y] = new Array(W).fill(0); bgm[y] = new Array(W).fill(0); deco[y] = new Array(W).fill(0); }

    // Try to iterate structured records starting where header left off
    let placed = 0;
    const firstPos = findNextRecordPos(p);
    if (firstPos !== -1) {
      p = firstPos;
      while (p + 12 <= dv.byteLength) {
        const blockId = readInt();
        const layer = readInt();
        const xLen = readUInt();
        const xs = inflated.subarray(p, p + xLen); p += xLen;
        const yLen = readUInt();
        const ys = inflated.subarray(p, p + yLen); p += yLen;
        const xsArr = []; for (let i = 0; i < xs.length; i += 2) xsArr.push((xs[i] << 8) | xs[i+1]);
        const ysArr = []; for (let i = 0; i < ys.length; i += 2) ysArr.push((ys[i] << 8) | ys[i+1]);
        if (layer === 0) {
          for (let i = 0; i < xsArr.length; i++) { const x = xsArr[i], y = ysArr[i]; if (x>=0&&y>=0&&x<W&&y<H) { fg[y][x] = blockId; placed++; } }
        } else if (layer === 1) {
          for (let i = 0; i < xsArr.length; i++) { const x = xsArr[i], y = ysArr[i]; if (x>=0&&y>=0&&x<W&&y<H) { bgm[y][x] = blockId; placed++; } }
        } else if (layer === 2) {
          for (let i = 0; i < xsArr.length; i++) { const x = xsArr[i], y = ysArr[i]; if (x>=0&&y>=0&&x<W&&y<H) { deco[y][x] = blockId; } }
        }
        const nextPos = findNextRecordPos(p); if (nextPos === -1) break; p = nextPos;
      }
    }
    // Fallback to deep scan results if structured pass placed nothing
    if (!placed) {
      for (const r of pre) {
        if (r.layer === 0) { for (let i = 0; i < r.xs.length; i++) { const x = r.xs[i], y = r.ys[i]; if (x>=0&&y>=0&&x<W&&y<H) fg[y][x] = r.id; } }
        else if (r.layer === 1) { for (let i = 0; i < r.xs.length; i++) { const x = r.xs[i], y = r.ys[i]; if (x>=0&&y>=0&&x<W&&y<H) bgm[y][x] = r.id; } }
        else if (r.layer === 2) { for (let i = 0; i < r.xs.length; i++) { const x = r.xs[i], y = r.ys[i]; if (x>=0&&y>=0&&x<W&&y<H) deco[y][x] = r.id; } }
      }
    }
    return { fg, bg: bgm, deco, W, H };
  } catch (e) {
    return null;
  }
}

// AMF3-aware parser for DB files. Tries AMF3 first, then binary deep-scan.
function parseEELVL_DB(bytes, forcedW = 400, forcedH = 200) {
  // Helper: AMF3 path
  function parseViaAMF3(rawBytes){
    const AMF = (typeof window !== 'undefined') && (window.AMF3 && typeof window.AMF3.decode === 'function') ? window.AMF3 : null;
    if (!AMF) return null;
    let root = AMF.decode(rawBytes);
    if (!root || (root instanceof Uint8Array)) {
      // Try inflate then decode (DB files may be zlib-compressed AMF3)
      try {
        const inflated = pako.inflate(rawBytes);
        root = AMF.decode(inflated);
      } catch(_) { /* fallthrough */ }
    }
    if (!root || (root instanceof Uint8Array)) return null;
    // DBs should always be 400x200; ignore header width/height and enforce forced dims
    const W = forcedW, H = forcedH;
    const queue = [root];
    for (let qi=0; qi<queue.length && qi<5000; qi++) {
      const cur = queue[qi];
      if (Array.isArray(cur)) {
        for (const v of cur) if (v && (typeof v === 'object' || Array.isArray(v))) queue.push(v);
      } else if (cur && typeof cur === 'object') {
        for (const k in cur) {
          const v = cur[k];
          if (v && (typeof v === 'object' || Array.isArray(v))) queue.push(v);
        }
      }
    }
    const fg = new Array(H); const bg = new Array(H); const deco = new Array(H);
    for (let y = 0; y < H; y++) { fg[y] = new Array(W).fill(0); bg[y] = new Array(W).fill(0); deco[y] = new Array(W).fill(0); }
    let placed = 0; let recs = 0;
    function asU16Pairs(buf){
      // buf may be Uint8Array or number[]
      if (buf instanceof Uint8Array) {
        const n = buf.length >> 1; const out = new Array(n);
        for (let i=0;i<n;i++){ out[i] = buf[(i<<1)] | (buf[(i<<1)+1] << 8); }
        return out;
      }
      if (Array.isArray(buf)) return buf.map(v => v|0);
      return [];
    }
    function tryPlaceRecord(obj){
      if (!obj || typeof obj !== 'object') return false;
      const id = obj.id ?? obj.blockId ?? obj.type ?? null;
      const layer = obj.layer ?? obj.plane ?? obj.l ?? null;
      const xsBA = obj.xs ?? obj.Xs ?? obj.x ?? obj.X ?? null;
      const ysBA = obj.ys ?? obj.Ys ?? obj.y ?? obj.Y ?? null;
      if (!Number.isFinite(id) || !Number.isFinite(layer) || xsBA == null || ysBA == null) return false;
      const xs = asU16Pairs(xsBA);
      const ys = asU16Pairs(ysBA);
      if (!xs.length || xs.length !== ys.length) return false;
      for (let i=0;i<xs.length;i++){
        const x = xs[i], y = ys[i];
        if (x>=0 && x<W && y>=0 && y<H) {
          if (layer === 0) fg[y][x] = id|0;
          else if (layer === 1) bg[y][x] = id|0;
          else if (layer === 2) deco[y][x] = id|0;
          placed++;
        }
      }
      recs++;
      return true;
    }
    // Traverse and place from any record-like objects
    for (let qi=0; qi<queue.length && qi<20000; qi++) {
      const cur = queue[qi];
      if (Array.isArray(cur)) {
        for (const v of cur) tryPlaceRecord(v);
      } else if (cur && typeof cur === 'object') {
        // Some containers use keys like 'blocks' or 'records'
        if (cur.blocks && Array.isArray(cur.blocks)) {
          for (const v of cur.blocks) tryPlaceRecord(v);
        }
        if (cur.records && Array.isArray(cur.records)) {
          for (const v of cur.records) tryPlaceRecord(v);
        }
        // Also try directly
        tryPlaceRecord(cur);
      }
    }
    if (placed === 0) return null;
    try { window.EE_DBStats = { placed, W, H, bytes: rawBytes.length, source: 'AMF3' }; } catch(_) {}
    return { fg, bg, deco, W, H, placed };
  }

  // Try to inflate; if not compressed, keep as raw for AMF3
  let inflated = bytes;
  try {
    try { inflated = pako.inflate(bytes); }
    catch { try { inflated = pako.inflateRaw(bytes); } catch { try { inflated = pako.ungzip(bytes); } catch { inflated = bytes; } } }
  } catch { inflated = bytes; }
  // First attempt AMF3 decode path using raw or inflated bytes
  const viaAmf = parseViaAMF3(inflated) || parseViaAMF3(bytes);
  if (viaAmf) return viaAmf;
  const dv = new DataView(inflated.buffer);
  const W = forcedW, H = forcedH;
  const fg = new Array(H); const bg = new Array(H); const deco = new Array(H);
  for (let y = 0; y < H; y++) { fg[y] = new Array(W).fill(0); bg[y] = new Array(W).fill(0); deco[y] = new Array(W).fill(0); }
  const end = dv.byteLength;
  let pos = 0; let placed = 0;
  // Helper to scan with a specific endianness for 16-bit coords
  function scanWithEndian(isBigEndian){
    let p = 0; let localPlaced = 0;
    while (p + 12 <= end) {
      const id = dv.getInt32(p);
      const layer = dv.getInt32(p + 4);
      const xLen = dv.getUint32(p + 8);
      const xsStart = p + 12;
      const xsEnd = xsStart + xLen;
      if (!(layer === 0 || layer === 1 || layer === 2) || (xLen % 2 !== 0) || xsEnd + 4 > end) { p++; continue; }
      const yLen = dv.getUint32(xsEnd);
      const ysStart = xsEnd + 4;
      const ysEnd = ysStart + yLen;
      if (yLen % 2 !== 0 || ysEnd > end) { p++; continue; }
      const count = xLen >> 1;
      if ((yLen >> 1) !== count || count <= 0 || count > 200000) { p++; continue; }
      for (let k = 0; k < count; k++) {
        let xv, yv;
        if (isBigEndian) {
          xv = (inflated[xsStart + (k<<1)] << 8) | (inflated[xsStart + (k<<1) + 1]);
          yv = (inflated[ysStart + (k<<1)] << 8) | (inflated[ysStart + (k<<1) + 1]);
        } else {
          xv = (inflated[xsStart + (k<<1)]) | (inflated[xsStart + (k<<1) + 1] << 8);
          yv = (inflated[ysStart + (k<<1)]) | (inflated[ysStart + (k<<1) + 1] << 8);
        }
        if (xv >= 0 && xv < W && yv >= 0 && yv < H) {
          if (layer === 0) { fg[yv][xv] = id|0; localPlaced++; }
          else if (layer === 1) { bg[yv][xv] = id|0; localPlaced++; }
          else if (layer === 2) { deco[yv][xv] = id|0; }
        }
      }
      p = ysEnd;
    }
    return localPlaced;
  }
  // Prefer big-endian (matches other parsers); fallback to little-endian
  placed = scanWithEndian(true);
  if (placed < 100) {
    // Try little-endian if BE yielded too few
    placed += scanWithEndian(false);
  }
  try { window.EE_DBStats = { placed, W, H, bytes: bytes.length, source: 'DEEP_SCAN' }; } catch(_) {}
  return { fg, bg, deco, W, H, placed };
}

// Simple name entry UI (runs once)
// Delay name UI until DOM is ready and ensure state exists
setTimeout(()=>{
  window.state = window.state || {};
  try { const saved = localStorage.getItem('EE_PlayerName'); if (saved) { state.playerName = saved; return; } } catch(_){}
  const overlay = document.createElement('div');
  overlay.id = 'nameOverlay';
  overlay.style.position = 'fixed'; overlay.style.inset = '0'; overlay.style.background = 'rgba(0,0,0,0.6)';
  overlay.style.display = 'flex'; overlay.style.alignItems = 'center'; overlay.style.justifyContent = 'center'; overlay.style.zIndex = '10000';
  const panel = document.createElement('div'); panel.style.background = '#1e1e1e'; panel.style.border = '1px solid #444'; panel.style.borderRadius = '8px'; panel.style.padding = '12px 14px'; panel.style.color = '#eee'; panel.style.minWidth = '280px';
  const title = document.createElement('div'); title.textContent = 'Enter a username'; title.style.marginBottom = '8px';
  const input = document.createElement('input'); input.type = 'text'; input.placeholder = 'Your name'; input.style.width = '100%'; input.style.padding = '6px'; input.style.marginBottom = '8px'; input.maxLength = 20;
  const btn = document.createElement('button'); btn.textContent = 'Start'; btn.style.padding = '6px 10px'; btn.style.cursor = 'pointer';
  const accept = ()=>{ const name = (input.value || 'Player').trim(); state.playerName = name; try { localStorage.setItem('EE_PlayerName', name); } catch(_){} overlay.remove(); };
  btn.addEventListener('click', accept);
  input.addEventListener('keydown', (e)=>{ if (e.key === 'Enter') accept(); });
  panel.appendChild(title); panel.appendChild(input); panel.appendChild(btn); overlay.appendChild(panel); document.body.appendChild(overlay); setTimeout(()=>input.focus(),0);
}, 0);

// Round message banner
(function ensureRoundMsg(){
  if (document.getElementById('roundMsg')) return;
  const div = document.createElement('div');
  div.id = 'roundMsg'; div.style.position = 'fixed'; div.style.top = '8px'; div.style.left = '50%'; div.style.transform = 'translateX(-50%)';
  div.style.zIndex = '9999'; div.style.background = 'rgba(0,0,0,0.6)'; div.style.border = '1px solid #555'; div.style.borderRadius = '8px'; div.style.padding = '6px 10px'; div.style.fontSize = '14px'; div.style.color = '#fff'; div.style.pointerEvents = 'none'; div.textContent = '';
  div.style.opacity = '0'; div.style.transition = 'opacity 200ms ease';
  document.body.appendChild(div);
})();

// Elimination message
function showEliminationMessage() {
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed; top:40%; left:50%; transform:translate(-50%,-50%); font-size:64px; font-weight:bold; color:#ff0000; text-shadow:3px 3px 6px rgba(0,0,0,0.9); z-index:10000; pointer-events:none; animation: eliminationPulse 2s ease-out;';
  div.textContent = 'ELIMINATED';
  
  // Add CSS animation if not already present
  if (!document.getElementById('eliminationStyle')) {
    const style = document.createElement('style');
    style.id = 'eliminationStyle';
    style.textContent = `
      @keyframes eliminationPulse {
        0% { transform: translate(-50%,-50%) scale(0.5); opacity: 0; }
        20% { transform: translate(-50%,-50%) scale(1.2); opacity: 1; }
        40% { transform: translate(-50%,-50%) scale(1); }
        100% { transform: translate(-50%,-50%) scale(1); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(div);
  setTimeout(() => {
    div.style.transition = 'opacity 1s';
    div.style.opacity = '0';
    setTimeout(() => div.remove(), 1000);
  }, 3000);
}

// Victory message
function showVictoryMessage(winnerName) {
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed; top:40%; left:50%; transform:translate(-50%,-50%); font-size:48px; font-weight:bold; color:#00ff00; text-shadow:3px 3px 6px rgba(0,0,0,0.9); z-index:10000; pointer-events:none; text-align:center; animation: victoryPulse 3s ease-out;';
  div.innerHTML = `${winnerName || 'Player'}<br>WINS!`;
  
  // Add CSS animation if not already present
  if (!document.getElementById('victoryStyle')) {
    const style = document.createElement('style');
    style.id = 'victoryStyle';
    style.textContent = `
      @keyframes victoryPulse {
        0% { transform: translate(-50%,-50%) scale(0.5) rotate(0deg); opacity: 0; }
        20% { transform: translate(-50%,-50%) scale(1.3) rotate(5deg); opacity: 1; }
        40% { transform: translate(-50%,-50%) scale(1.1) rotate(-5deg); }
        60% { transform: translate(-50%,-50%) scale(1.2) rotate(3deg); }
        80% { transform: translate(-50%,-50%) scale(1) rotate(-2deg); }
        100% { transform: translate(-50%,-50%) scale(1) rotate(0deg); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(div);
  setTimeout(() => {
    div.style.transition = 'opacity 2s';
    div.style.opacity = '0';
    setTimeout(() => div.remove(), 2000);
  }, 5000);
}

// Rendering: use original smileys.png spritesheet
const canvas = document.getElementById('canvas');
canvas.setAttribute('tabindex', '0');
canvas.addEventListener('pointerdown', () => canvas.focus());
const ctx = canvas.getContext('2d');
// Render hints
ctx.imageSmoothingEnabled = false;
ctx.imageSmoothingEnabled = false;

// View transform for full-world upscale
const view = { dpr: 1, scale: 1, targetScale: 1, offX: 0, offY: 0, cssW: 0, cssH: 0, baseFit: 1, _initialized: false, anchorSx: 0, anchorSy: 0, anchorWx: 0, anchorWy: 0, zoomActive: false };
function computeView() {
  view.dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  view.cssW = window.innerWidth;
  view.cssH = window.innerHeight;
  const worldPxW = WORLD_W * TILE;
  const worldPxH = WORLD_H * TILE;
  const rawScale = Math.min(view.cssW / worldPxW, view.cssH / worldPxH);
  view.baseFit = Math.max(1, Math.floor(rawScale)); // initial fit
  // Keep current scale if already set; otherwise initialize to baseFit
  if (!view._initialized) {
    view.scale = view.baseFit;
    view.targetScale = view.baseFit;
    view._initialized = true;
    view.offX = Math.floor((view.cssW - worldPxW * view.scale) / 2);
    view.offY = Math.floor((view.cssH - worldPxH * view.scale) / 2);
  }
}
function resizeCanvas() {
  computeView();
  canvas.width = Math.floor(view.cssW * view.dpr);
  canvas.height = Math.floor(view.cssH * view.dpr);
  canvas.style.width = view.cssW + 'px';
  canvas.style.height = view.cssH + 'px';
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
// Also react to orientation change on mobile
try { window.addEventListener('orientationchange', resizeCanvas); } catch(_) {}

// Mobile helpers: detect simple mobile view and wire minimal controls
(function setupMobile(){
  try {
    const isMobile = /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent) || (Math.min(window.innerWidth, window.innerHeight) < 700);
    const leftTools = document.getElementById('left-tools');
  const hud = document.getElementById('hud');
    const coinHud = document.getElementById('coinHud');
    const netHud = document.getElementById('netHud');
    const mobile = document.getElementById('mobileControls');
    if (!isMobile || !mobile) return;
    // Hide desktop HUD/left tools on mobile
    if (leftTools) leftTools.style.display = 'none';
    if (hud) hud.style.display = 'none';
    if (coinHud) coinHud.style.display = 'none';
    // Keep only connect controls and mobile UI
    if (netHud) {
      netHud.style.left = '50%';
      netHud.style.bottom = 'auto';
      netHud.style.top = '8px';
      netHud.style.transform = 'translateX(-50%)';
    }
    mobile.style.display = 'block';
    try { document.body.classList.add('is-mobile'); } catch(_) {}
    // Prevent page scroll/zoom and text selection while using mobile controls
    try {
      // Global CSS to disable touch scrolling and text selection
      const mobileStyle = document.createElement('style');
      mobileStyle.id = 'mobileControlFixes';
      mobileStyle.textContent = `
        html, body { overscroll-behavior: none; touch-action: none; -ms-touch-action: none; }
        body { user-select: none; -webkit-user-select: none; -ms-user-select: none; }
        #mobileControls, #joyArea, #joyKnob, #mobileJump { touch-action: none; -ms-touch-action: none; user-select: none; -webkit-user-select: none; }
      `;
      if (!document.getElementById('mobileControlFixes')) document.head.appendChild(mobileStyle);
      // Also set attributes/styles directly as a fallback
      document.body.style.userSelect = 'none';
      document.body.style.webkitUserSelect = 'none';
      document.body.style.msUserSelect = 'none';
      document.body.style.touchAction = 'none';
      document.documentElement.style.touchAction = 'none';
    } catch(_) {}

    // Responsive mobile layout and sizing
    function layoutMobileControls(){
      const cw = window.innerWidth || mobile.clientWidth || 640;
      const ch = window.innerHeight || 480;
      const portrait = ch >= cw;
      const base = Math.min(cw, ch);
      // Joystick size scales with viewport, clamped for usability
      const joySize = Math.max(100, Math.min(Math.round(base * (portrait ? 0.28 : 0.22)), 220));
      const knobSize = Math.max(48, Math.round(joySize * 0.46));
      const gap = Math.max(6, Math.round(base * 0.012));
      // Containers
      const inner = mobile.firstElementChild;
      if (inner && inner.style) {
        inner.style.display = 'flex';
        inner.style.justifyContent = 'space-between';
        inner.style.alignItems = 'flex-end';
        inner.style.gap = gap + 'px';
      }
      // Joystick
      if (area && knob) {
        area.style.width = joySize + 'px';
        area.style.height = joySize + 'px';
        area.style.borderRadius = '50%';
        knob.style.width = knobSize + 'px';
        knob.style.height = knobSize + 'px';
      }
      // Jump button: make it circular and sized relative to joystick
      if (mJump) {
        const jb = Math.max(56, Math.round(joySize * 0.6));
        mJump.style.width = jb + 'px';
        mJump.style.height = jb + 'px';
        mJump.style.borderRadius = '50%';
        mJump.style.fontSize = Math.max(12, Math.round(jb * 0.18)) + 'px';
        mJump.style.padding = '0';
        mJump.style.display = 'inline-flex';
        mJump.style.alignItems = 'center';
        mJump.style.justifyContent = 'center';
      }
      // Start buttons row spacing
      if (mStart && mStartComp) {
        const row = mStart.parentElement;
        if (row && row.style) {
          row.style.display = 'flex';
          row.style.gap = gap + 'px';
        }
      }
      // Bottom center connect row: push up if portrait so it doesn't overlap controls
      try {
        const mobRoom = document.getElementById('mobileRoom');
        const connRow = mobRoom ? mobRoom.parentElement : null;
        if (connRow && connRow.style) {
          const lift = portrait ? (joySize + Math.max(40, gap * 4)) : 8;
          connRow.style.bottom = lift + 'px';
        }
      } catch(_) {}
      // Safe-area insets (iOS notch) padding
      const padL = parseInt(getComputedStyle(document.documentElement).getPropertyValue('env(safe-area-inset-left)') || '0') || 0;
      const padR = parseInt(getComputedStyle(document.documentElement).getPropertyValue('env(safe-area-inset-right)') || '0') || 0;
      const padB = parseInt(getComputedStyle(document.documentElement).getPropertyValue('env(safe-area-inset-bottom)') || '0') || 0;
      mobile.style.paddingLeft = (8 + padL) + 'px';
      mobile.style.paddingRight = (8 + padR) + 'px';
      mobile.style.paddingBottom = (8 + padB) + 'px';
    }
    layoutMobileControls();
    try { window.addEventListener('resize', layoutMobileControls); } catch(_) {}
    try { window.addEventListener('orientationchange', layoutMobileControls); } catch(_) {}

    // Wire mobile connect
    const mRoom = document.getElementById('mobileRoom');
    const mConn = document.getElementById('mobileConnect');
    if (mConn) mConn.addEventListener('click', ()=>{
      try {
        const roomInput = document.getElementById('roomInput');
        if (roomInput && mRoom) roomInput.value = mRoom.value || 'lobby';
        const btn = document.getElementById('connectBtn');
        if (btn) btn.click();
      } catch(_) {}
    });
    // Wire mobile Start / Start Comp
    const mStart = document.getElementById('mobileStart');
    const mStartComp = document.getElementById('mobileStartComp');
    if (mStart) mStart.addEventListener('click', ()=>{ const b = document.getElementById('startGame'); if (b) b.click(); });
    if (mStartComp) mStartComp.addEventListener('click', ()=>{ const b = document.getElementById('startCompGame'); if (b) b.click(); });
    // Wire mobile jump button -> Space
    const mJump = document.getElementById('mobileJump');
    if (mJump) {
      const press = ()=>{ state.input.jumpJP = true; state.p.spaceHeld = true; };
      const release = ()=>{ state.p.spaceHeld = false; state.input.jump = false; };
      mJump.style.touchAction = 'none';
      mJump.addEventListener('pointerdown', (e)=>{ e.preventDefault(); e.stopPropagation(); press(); }, { passive: false });
      mJump.addEventListener('pointerup', (e)=>{ e.preventDefault(); e.stopPropagation(); release(); }, { passive: false });
      mJump.addEventListener('pointerleave', (e)=>{ e.preventDefault(); e.stopPropagation(); release(); }, { passive: false });
    }
    // Virtual joystick
    const area = document.getElementById('joyArea');
    const knob = document.getElementById('joyKnob');
    if (area && knob) {
      // Prevent browser gestures on joystick
      area.style.touchAction = 'none';
      area.style.webkitUserSelect = 'none';
      area.style.userSelect = 'none';
      const center = ()=>({ x: area.clientWidth/2, y: area.clientHeight/2 });
      const clamp = (v, m)=> Math.max(-m, Math.min(m, v));
      const updateDir = (dx, dy)=>{
        const dead = 8;
        state.input.left = dx < -dead; state.input.right = dx > dead;
        state.input.up = dy < -dead; state.input.down = dy > dead;
        // update priority for smoothness
        state.input.hPri = state.input.right ? 1 : (state.input.left ? -1 : 0);
        state.input.vPri = state.input.down ? 1 : (state.input.up ? -1 : 0);
      };
      const setKnob = (dx, dy)=>{
        const maxR = 40;
        const rx = clamp(dx, maxR); const ry = clamp(dy, maxR);
        knob.style.left = `calc(50% + ${rx}px)`;
        knob.style.top = `calc(50% + ${ry}px)`;
      };
      let active = false;
      // On some mobile browsers, pointer events on descendants can bubble oddly; lock to area only
      area.addEventListener('pointerdown', (e)=>{
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault(); e.stopPropagation();
        active = true;
        try { area.setPointerCapture(e.pointerId); } catch(_) {}
        const c = center(); const rect = area.getBoundingClientRect();
        const dx = (e.clientX - rect.left) - c.x; const dy = (e.clientY - rect.top) - c.y;
        setKnob(dx, dy); updateDir(dx, dy);
      }, { passive: false });
      area.addEventListener('pointermove', (e)=>{
        e.preventDefault(); e.stopPropagation();
        if (!active) return;
        const c = center(); const rect = area.getBoundingClientRect();
        const dx = (e.clientX - rect.left) - c.x; const dy = (e.clientY - rect.top) - c.y;
        setKnob(dx, dy); updateDir(dx, dy);
      }, { passive: false });
      const end = (e)=>{ e && e.preventDefault && e.preventDefault(); e && e.stopPropagation && e.stopPropagation(); active = false; try{ area.releasePointerCapture(e.pointerId);}catch(_){}; setKnob(0,0); updateDir(0,0); };
      area.addEventListener('pointerup', end, { passive: false });
      area.addEventListener('pointercancel', end, { passive: false });
      area.addEventListener('pointerleave', end, { passive: false });
      // Fallback for browsers sending touch events only
      area.addEventListener('touchstart', (e)=>{
        e.preventDefault(); e.stopPropagation();
        active = true;
        const t = e.touches[0]; if (!t) return;
        const c = center(); const rect = area.getBoundingClientRect();
        const dx = (t.clientX - rect.left) - c.x; const dy = (t.clientY - rect.top) - c.y;
        setKnob(dx, dy); updateDir(dx, dy);
      }, { passive: false });
      area.addEventListener('touchmove', (e)=>{
        e.preventDefault(); e.stopPropagation();
        if (!active) return;
        const t = e.touches[0]; if (!t) return;
        const c = center(); const rect = area.getBoundingClientRect();
        const dx = (t.clientX - rect.left) - c.x; const dy = (t.clientY - rect.top) - c.y;
        setKnob(dx, dy); updateDir(dx, dy);
      }, { passive: false });
      const touchEnd = (e)=>{ e.preventDefault(); e.stopPropagation(); active = false; setKnob(0,0); updateDir(0,0); };
      area.addEventListener('touchend', touchEnd, { passive: false });
      area.addEventListener('touchcancel', touchEnd, { passive: false });
      // Ensure canvas doesn't steal pointer lock/focus away from joystick on mobile
      try { canvas.style.touchAction = 'none'; } catch(_) {}
    }
  } catch(_) {}
})();

function clampViewToBounds() {
  // No clamping. You can pan/zoom anywhere.
}

function setScale(newScale, anchorScreenX, anchorScreenY) {
  // Smooth zooming: set a target scale, keep anchor world point
  const minScale = 0.5;
  const maxScale = 12;
  view.targetScale = Math.max(minScale, Math.min(maxScale, newScale));
  view.anchorSx = anchorScreenX;
  view.anchorSy = anchorScreenY;
  // Convert anchor to world coords (do not clamp so you can zoom anywhere)
  view.anchorWx = (anchorScreenX - view.offX) / view.scale;
  view.anchorWy = (anchorScreenY - view.offY) / view.scale;
  view.zoomActive = true;
}

const smileyImg = new Image();
smileyImg.src = './smileys.png';
const auraImg = new Image();
auraImg.src = './auras_staff.png';
let levelData = null;
// Load the play world (EX Crew Shift [Test].eelvl) as main world; Shift will overlay boxes into its play area
(async function loadPlayWorld(){
  try {
    // Prefer EX Crew Shift [Test](1).eelvl, else fallback to original
    let resp = await fetch('./EX Crew Shift [Test](1).eelvl').catch(()=>null);
    if (!resp || !resp.ok) resp = await fetch('./EX Crew Shift [Test].eelvl');
    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    tryLoadLevelFromEELVL(bytes);
    // If header-based parser mis-sized, keep result; this file should be standard EEO and parse fine
    window.eelvlStats = Object.assign({ source: 'PLAY_WORLD' }, window.eelvlStats || { width: WORLD_W, height: WORLD_H, records: 0, tiles: 0 });
  } catch(_) {
    // Keep default world
  }
  try { shift.baseReady = true; } catch(_) {}
  // Initialize player spawn to spectator spawn by default and mark not finished
  state.p.x = 52 * TILE;
  state.p.y = 77 * TILE;
  shift.joinedLobby = true; shift.finished = false; shift.firstFinishTime = 0;
  // Take a pristine snapshot of the base play area for hard reset
  try {
    const area = { x0: shift.dst.x0, y0: shift.dst.y0, w: shift.boxW, h: shift.boxH };
    const data = { meta: { area }, fg: [], bg: [], deco: [] };
    for (let dy=0; dy<area.h; dy++) {
      const y = area.y0 + dy;
      const rfg = [], rbg = [], rde = [];
      for (let dx=0; dx<area.w; dx++) {
        const x = area.x0 + dx;
        rfg.push((fgMap[y] && fgMap[y][x]) || 0);
        rbg.push((bgMap[y] && bgMap[y][x]) || 0);
        rde.push((decoMap[y] && decoMap[y][x]) || 0);
      }
      data.fg.push(rfg); data.bg.push(rbg); data.deco.push(rde);
    }
    shift.baseAreaSnapshot = data;
  } catch(_) {}
  // Apply locally saved start map if present
  const appliedLocal = tryApplyLocalStartMap();
  if (!appliedLocal) { try { await tryApplyCustomStartMapFromDisk(); } catch(_){} }
})();

// SHIFT: DB loader and box rotator
let shift = {
  enabled: true,
  dbBytes: null,
  boxW: 32,
  boxH: 27,
  dst: { x0: 36, y0: 48, x1: 67, y1: 74 },
  // fine-tune source sampling offset: shift 1 tile right and 1 tile down
  srcOffset: { x: 1, y: 1 },
  curBox: 1,
  curLevel: 1,
  lastSwap: 0,
  intervalMs: 10000,
  swapping: false,
  // round state
  roundActive: false,
  roundGoldStart: 0,
  curCoinReq: 0,
  coinDoors: new Set(),
  firstFinishTime: 0,
  graceMs: 30000,
  graceEnd: 0,
  finished: false,
  localFinished: false,
  startPos: null,
  // match state
  playersAlive: new Set(),
  playersFinished: new Set(),
  nextRoundCountdownMs: 5000,
  nextRoundAt: 0,
  statusText: '',
  statusUntil: 0,
  // temporary key timers
  keyTimers: {}, // color -> expiry timestamp
  // lobby spawn enforcement
  joinedLobby: false,
  // start countdown and entrance positions
  startCountdownMs: 5000,
  pendingStartAt: 0,
  entranceSpawns: new Set(),
  clearedOutside: [],
  coinDoorExits: new Map(),
  didBackfillExits: false,
  baseAreaSnapshot: null,
  spectateNextRound: false,
  _pendingFirstRound: false,
  _alreadyMovedToSpectator: false, // Track if player has been moved to spectator position once
  _serverIdle: true, // When true, server is in default reset state waiting for players
    _goTimeoutId: 0,
    _startingClickLock: false,
  // Competitive game mode
  competitiveMode: false,
  gameWinner: null,
  gameOver: false,
  playersAtRoundStart: 0, // Track how many players started each round
};
// Expose for debugging
try { window.EE_Shift = shift; } catch (e) {}

// Multiplayer: track remote players and basic client networking hooks
const netPlayers = new Map(); // id -> { x,y, faceIndex, name }
function drawNetPlayers(){
  if (typeof Net === 'undefined') return;
  for (const [id, pl] of netPlayers) {
    if (!pl) continue;
    // Smooth remote positions to avoid choppy movement
    if (typeof pl.sx !== 'number' || typeof pl.sy !== 'number') { pl.sx = pl.x||0; pl.sy = pl.y||0; }
    const dx = (pl.x||0) - pl.sx; const dy = (pl.y||0) - pl.sy;
    const dist2 = dx*dx + dy*dy;
    if (dist2 > (64*64)) { pl.sx = pl.x||0; pl.sy = pl.y||0; } // snap on teleports/large gaps
    else { pl.sx += dx * 0.2; pl.sy += dy * 0.2; }
    if (smileyImg.complete) {
      const sx = (pl.faceIndex||0) * FACE_SIZE;
      const sy = 0;
      const rx = Math.floor((pl.sx||0) - 5 + 1);
      const ry = Math.floor((pl.sy||0) - 5 + 1);
      ctx.drawImage(smileyImg, sx, sy, FACE_SIZE, FACE_SIZE, rx, ry, FACE_SIZE, FACE_SIZE);
      const name = pl.name || `P${id}`;
      if (name) {
        ctx.save();
        ctx.setTransform(view.dpr * view.scale, 0, 0, view.dpr * view.scale, view.dpr * view.offX, view.dpr * view.offY);
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.font = '10px system-ui, Arial';
        const tw = ctx.measureText(name).width;
        const cx = Math.floor((pl.sx||0) + 8 - tw/2);
        const cy = Math.floor((pl.sy||0) + 20 + 10);
        ctx.fillRect(cx - 3, cy - 9, tw + 6, 12);
        ctx.fillStyle = '#fff';
        ctx.fillText(name, cx, cy);
        ctx.restore();
      }
    }
  }
}

function isAuthoritativeHost(){
  try {
    if (typeof Net === 'undefined' || !Net.id) return true;
    const my = parseInt(Net.id, 10) || 0;
    for (const id of netPlayers.keys()) {
      const v = parseInt(id, 10) || 0;
      if (v && v < my) return false;
    }
    return true;
  } catch(_) { return true; }
}

function initNetworking(){
  if (typeof Net === 'undefined' || initNetworking._wired) return;
  initNetworking._wired = true;
  function resetToDefaultState(){
    try {
      // Restore base area snapshot if present
      if (shift && shift.baseAreaSnapshot) {
        const { x0, y0, w, h } = shift.baseAreaSnapshot.meta.area;
        for (let dy = 0; dy < h; dy++) {
          const y = y0 + dy;
          for (let dx = 0; dx < w; dx++) {
            const x = x0 + dx;
            const bid = (shift.baseAreaSnapshot.bg[dy] && shift.baseAreaSnapshot.bg[dy][dx]) || 0;
            const did = (shift.baseAreaSnapshot.deco[dy] && shift.baseAreaSnapshot.deco[dy][dx]) || 0;
            const fid = (shift.baseAreaSnapshot.fg[dy] && shift.baseAreaSnapshot.fg[dy][dx]) || 0;
            setTileBg(x, y, 0); setTileDeco(x, y, 0); setTileFg(x, y, 0);
            if (bid) setTileBg(x, y, bid);
            if (did) setTileDeco(x, y, did);
            if (fid) setTileFg(x, y, fid);
          }
        }
        tileCache.dirtyAll = true; rebuildDynamicIndex();
      }
    } catch(_) {}
    try {
      // Clear all transient round state
      shift.roundActive = false;
      shift.firstFinishTime = 0;
      shift.graceEnd = 0;
      shift.finished = false;
      shift.finishedName = '';
      shift.pendingStartAt = 0;
      shift.nextRoundAt = 0;
      shift.playersAlive = new Set();
      shift.playersFinished = new Set();
      shift.spectatorUntilNext = false;
      shift.spectateNextRound = false;
      shift.localFinished = false;
      shift._pendingFirstRound = false;
      shift._alreadyMovedToSpectator = false;
      shift.lastSwap = 0;
      shift.statusText = '';
      // Return player to spectator spawn
      state.p.x = 52 * TILE; state.p.y = 77 * TILE;
      state.coins = 0; state.blueCoins = 0;
      // Reset competitive mode
      shift.competitiveMode = false;
      shift.gameOver = false;
      shift.gameWinner = null;
      shift.playersAtRoundStart = 0;
      // Mark idle
      shift._serverIdle = true;
    } catch(_) {}
  }
  // Late-join full state hydration
  Net.on('state_full', (msg) => {
    const { id: targetId, shift: s, keys, doorsOpen, edits } = msg || {};
    // Only process full-state snapshots intended for this client, or server-wide resets
    try { if (targetId && typeof Net !== 'undefined' && Net.id && targetId !== Net.id && targetId !== 'server') return; } catch(_){ }
    shift._hydratingFromFull = true;
    shift._pendingEdits = [];
    (async () => {
      try {
        // 1) Load DB
        // Only adopt level/box if there is an active game (countdown or running)
        const hasServerBox = !!(s && typeof s.level === 'number' && typeof s.box === 'number');
        const hasActiveGame = !!(s && (typeof s.startAtWall === 'number' || s.goAtWall));
        try { await ensureDBReady(); } catch (_) {}
        // 2) Place box
        if (hasServerBox && hasActiveGame && shift.dbMaps) {
          try {
            shift.curLevel = s.level; shift.curBox = s.box;
            placeShiftBox(shift.curLevel, shift.curBox);
          } catch (_) {}
        }
        // 3) Apply edits (snapshot and any queued during hydration)
        const applyEdit = (e) => {
          const tx = e.x|0, ty = e.y|0, id = e.id|0;
          if (e.layer === 'fg') { if (fgMap[ty]) fgMap[ty][tx] = id; }
          else if (e.layer === 'bg') { if (bgMap[ty]) bgMap[ty][tx] = id; }
          else if (e.layer === 'de') { if (decoMap[ty]) decoMap[ty][tx] = id; }
          if (typeof window.markDirtyTile === 'function') window.markDirtyTile(tx, ty);
        };
        if (Array.isArray(edits)) { for (const e of edits) applyEdit(e); }
        if (Array.isArray(shift._pendingEdits) && shift._pendingEdits.length) {
          for (const e of shift._pendingEdits) applyEdit(e);
        }
        // 4) Rebuild caches
        try { tileCache.dirtyAll = true; rebuildDynamicIndex(); } catch (_) {}
        // 5) Apply keys/doors/timers
        if (keys && typeof keys === 'object') {
          for (const color of Object.keys(keys)) {
            const remain = Math.max(0, (keys[color]|0) - Date.now());
            if (!shift.keyTimers) shift.keyTimers = {};
            shift.keyTimers[color] = performance.now() + remain;
            if (state && state.keys) state.keys[color] = remain > 0;
          }
        }
        // Coin doors are local per player; ignore server doorsOpen flag
        if (s && typeof s.startAtWall === 'number' && !s.goAtWall) {
          const remainMs = Math.max(0, s.startAtWall - Date.now());
          // Do NOT arm local auto-start. Only display countdown, wait for host 'shift_go'.
          shift.roundActive = false;
          // Late join during countdown: spectate until next round
          state.p.x = 52 * TILE; state.p.y = 77 * TILE;
          shift.spectatorUntilNext = true;
          // Show countdown text locally (non-authoritative)
          const remain = Math.ceil(remainMs / 1000);
          shift.statusText = remain > 0 ? `Starting in ${remain}` : '';
          // Server clearly not idle if a countdown is active
          shift._serverIdle = false;
        }
        if (s && s.goAtWall) {
          // Round already in progress: spectate until next round
          state.p.x = 52 * TILE; state.p.y = 77 * TILE;
          shift.roundActive = true; shift.pendingStartAt = 0; shift.statusText = '';
          shift.spectatorUntilNext = true; 
          shift.localFinished = false; // Late-joiners haven't finished the round
          // Server not idle if a round is running
          shift._serverIdle = false;
        }
        // If we have any shift metadata at all (level/box), the server isn't idle
        if (hasActiveGame) {
          shift._serverIdle = false;
        }
        if (s && typeof s.graceEndWall === 'number') {
          const remainG = Math.max(0, s.graceEndWall - Date.now());
          shift.firstFinishTime = performance.now();
          shift.graceEnd = performance.now() + remainG;
          shift.finished = true;
        }
      } finally {
        shift._hydratingFromFull = false;
        shift._pendingEdits = [];
      }
    })();
  });
  Net.on('join', ({ id }) => {
    if (!netPlayers.has(id)) netPlayers.set(id, { faceIndex: 0, name: `P${id}` });
    try {
      if (shift && shift.playersAlive) shift.playersAlive.add(id);
    } catch(_){ }
  });
  Net.on('leave', ({ id }) => { 
    netPlayers.delete(id); 
    try { if (shift && shift.playersAlive) shift.playersAlive.delete(id); } catch(_){ }
    // Do not auto-reset on leave; server will decide when to reset, or host will start explicitly
  });
  Net.on('state', ({ from, x, y, faceIndex, name }) => {
    if (!from) return;
    const pl = netPlayers.get(from) || {};
    // Initialize only when we receive a movement update, avoid initial spawn flash
    pl.x = x|0; pl.y = y|0; pl.faceIndex = faceIndex|0; if (name) pl.name = name;
    // Initialize smoothing targets if needed
    if (typeof pl.sx !== 'number' || typeof pl.sy !== 'number') { pl.sx = pl.x; pl.sy = pl.y; }
    netPlayers.set(from, pl);
  });
  // Keys are global; update timers when any client triggers
  Net.on('key', ({ color, durationMs }) => {
    if (!color) return;
    const dur = (durationMs|0) || 5000;
    if (!shift.keyTimers) shift.keyTimers = {};
    shift.keyTimers[color] = performance.now() + dur;
    // reflect active key state for visuals
    if (state && state.keys) state.keys[color] = true;
  });
  Net.on('doors', () => { try { openAllCoinDoors(); } catch(_){ } });
  // Server instructed a room reset: restore base map and idle state
  Net.on('reset_room', () => {
    try { resetToDefaultState(); } catch(_){}
  });
  // Additional finisher arrivals during grace window
  Net.on('shift_done', ({ from }) => {
    try {
      if (shift && !shift.localFinished && from === Net.id) {
        // ignore echo for local client. handled on local path
      }
      const pid = from || 'peer';
      if (shift && shift.playersFinished) shift.playersFinished.add(pid);
      if (shift && shift.playersAlive && from) shift.playersAlive.delete(from);
      // In competitive mode, ensure we have a finish time for this peer
      if (shift && shift.competitiveMode) {
        if (!shift.finishTimes) shift.finishTimes = new Map();
        if (!shift.finishTimes.has(pid)) {
          const t = Math.max(0, Date.now() - (shift.roundStartWall||Date.now()));
          shift.finishTimes.set(pid, t);
        }
        // Ensure participantsAtRoundStart is initialized, so HUD denominator is stable
        if (!shift.participantsAtRoundStart || !(shift.participantsAtRoundStart instanceof Set) || shift.participantsAtRoundStart.size === 0) {
          shift.participantsAtRoundStart = new Set([ 'local', ...Array.from(netPlayers.keys()) ]);
          shift.playersAtRoundStart = shift.participantsAtRoundStart.size;
        }
      }
    } catch(_) {}
  });
  // Peer reported their finish time (ms since round start)
  Net.on('comp_finish_time', ({ from, ms }) => {
    try {
      if (!shift || !shift.competitiveMode) return;
      const t = Math.max(0, ms|0);
      if (!shift.finishTimes) shift.finishTimes = new Map();
      shift.finishTimes.set(from||'peer', t);
    } catch(_) {}
  });
  // Force start now (host pulse) to eliminate drift
  Net.on('shift_go', ({ spawnX, spawnY, participants } = {}) => {
    // Track who is starting this round (host provided when available)
    if (participants && Array.isArray(participants)) {
      shift.participantsAtRoundStart = new Set(participants);
      shift.playersAtRoundStart = participants.length;
    } else if (shift.competitiveMode) {
      shift.participantsAtRoundStart = new Set(shift.playersAlive ? Array.from(shift.playersAlive) : []);
      shift.playersAtRoundStart = shift.participantsAtRoundStart.size;
    }
    // If host provided participants, and local is not included, force spectator state and do not move into play
    try {
      if (participants && Array.isArray(participants) && typeof Net !== 'undefined' && Net.id) {
        const localId = Net.id;
        const set = shift.participantsAtRoundStart instanceof Set ? shift.participantsAtRoundStart : new Set(participants);
        const isParticipant = set.has(localId);
        if (!isParticipant) {
          // Mark eliminated for the remainder of this game
          shift.spectateNextRound = true;
          shift.spectatorUntilNext = true;
          if (!shift._alreadyMovedToSpectator) {
            state.p.x = 52 * TILE;
            state.p.y = 77 * TILE;
            shift._alreadyMovedToSpectator = true;
          }
          // Do not process GO move for spectators
          return;
        }
      }
    } catch (_) {}
    
    // If this client joined mid-round or countdown, or was eliminated, do not move or change state (unless first round is pending)
    if (shift && shift.spectatorUntilNext && !shift._pendingFirstRound) {
      return;
    }
    // Teleport into play
    if (Number.isFinite(spawnX) && Number.isFinite(spawnY)) {
      state.p.x = (spawnX|0) * TILE; state.p.y = (spawnY|0) * TILE;
    } else {
      const target = getEntranceSpawnFallback();
      state.p.x = target.x * TILE; state.p.y = target.y * TILE;
    }
    // Safety: never spawn inside a blocking tile. Nudge up to 4 tiles along open axes.
    try {
      if (collidesAt(state.p.x, state.p.y)) {
        const dirs = [ [0,-1], [1,0], [-1,0], [0,1], [1,-1], [-1,-1], [1,1], [-1,1] ];
        let fixed = false;
        for (let step = 1; step <= 4 && !fixed; step++) {
          for (const [dx,dy] of dirs) {
            const nx = state.p.x + dx * TILE * step;
            const ny = state.p.y + dy * TILE * step;
            if (!collidesAt(nx, ny)) { state.p.x = nx; state.p.y = ny; fixed = true; break; }
          }
        }
        // As last resort, snap to fallback entrance
        if (!fixed) {
          const fb = getEntranceSpawnFallback();
          state.p.x = fb.x * TILE; state.p.y = fb.y * TILE;
        }
      }
    } catch(_) {}
    // Record round start wall clock for timing computations
    shift.roundStartWall = Date.now();
    shift.roundActive = true;
    shift.pendingStartAt = 0; shift.statusText = '';
    state.coins = 0; state.blueCoins = 0;
    // Reset per-round timing map
    shift.finishTimes = new Map();
    // Reset finished set for the new round so HUD starts at 0/X
    try { shift.playersFinished = new Set(); } catch(_) {}
    // Clear first-round pending marker after GO processes once
    if (shift) shift._pendingFirstRound = false;
  });
  // Remote edit replication
  Net.on('edit', ({ layer, x, y, id }) => {
    const tx = x|0, ty = y|0, vid = id|0;
    if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return;
    if (shift && shift._hydratingFromFull) {
      if (!Array.isArray(shift._pendingEdits)) shift._pendingEdits = [];
      shift._pendingEdits.push({ layer, x: tx, y: ty, id: vid });
      return;
    }
    if (layer === 'fg') { if (fgMap[ty]) fgMap[ty][tx] = vid; }
    else if (layer === 'bg') { if (bgMap[ty]) bgMap[ty][tx] = vid; }
    else if (layer === 'de') { if (decoMap[ty]) decoMap[ty][tx] = vid; }
    if (typeof window.markDirtyTile === 'function') window.markDirtyTile(tx, ty);
  });
  Net.on('shift_start', ({ level, box, startAtWall, firstRound }) => {
    if (typeof level === 'number') shift.curLevel = level;
    if (typeof box === 'number') shift.curBox = box;
    if (typeof startAtWall === 'number') {
      const remain = Math.max(0, startAtWall - Date.now());
      shift.pendingStartAt = performance.now() + remain;
    }
    // A start signal means the server is not idle
    shift._serverIdle = false;
    // Reset round tracking for everyone (per-round flags)
    shift.roundActive = false;
    // Store previous round winner status before clearing
    const wasPreviousWinner = !!shift.localFinished && !shift.spectatorUntilNext;
    // First round includes everyone regardless of spectator flags
    if (firstRound) {
      shift.spectatorUntilNext = false;
      shift.spectateNextRound = false;
      shift.localFinished = false;
      shift._pendingFirstRound = true;
      shift._alreadyMovedToSpectator = false; // Reset for new game
    } else {
      // Later rounds: spectate/eliminated persist until next Start Game
      // If player was eliminated (spectateNextRound = true), mark them as spectatorUntilNext
      if (shift.spectateNextRound) {
        shift.spectatorUntilNext = true;
      }
      // Do not clear spectateNextRound or spectatorUntilNext here; eliminated remain spectators for the entire game
      shift.localFinished = false;
    }
    shift.playersFinished = new Set();
    shift.playersAlive = new Set(['local', ...Array.from(netPlayers.keys())]);
    state.coins = 0; state.blueCoins = 0;
    // Reset the movement flag for new rounds
    shift._alreadyMovedToSpectator = false;
    // During countdown, move only participants (first round includes all, later rounds only winners)
    const isParticipant = !!firstRound || wasPreviousWinner;
    if (isParticipant) {
      state.p.x = 52 * TILE; state.p.y = 77 * TILE;
    }
  });
  Net.on('shift_place', ({ level, box, spawnX, spawnY }) => {
    if (typeof level === 'number') shift.curLevel = level;
    if (typeof box === 'number') shift.curBox = box;
    (async () => {
      try { await ensureDBReady(); } catch (_) {}
      try { placeShiftBox(shift.curLevel, shift.curBox); } catch (_) {}
      try { tileCache.dirtyAll = true; rebuildDynamicIndex(); } catch (_) {}
      // Note: Teleportation for round 2+ is now handled by shift_go message
      // which properly respects spectator flags
    })();
  });
  Net.on('shift_grace', ({ from, finisher, graceEndWall }) => {
    shift.firstFinishTime = performance.now();
    if (typeof graceEndWall === 'number') {
      const remain = Math.max(0, graceEndWall - Date.now());
      shift.graceEnd = performance.now() + remain;
    } else {
      shift.graceEnd = shift.firstFinishTime + (shift.graceMs||30000);
    }
    shift.finished = true;
    shift.finishedName = finisher || 'Player';
    // Snapshot exits now, so we can refill after placement even if the live set is cleared later
    try { shift._prevRoundExits = new Map(shift.coinDoorExits || []); } catch(_){}
    // Also schedule a fill at grace end to ensure the outside is blocked on time for all peers
    try {
      const ms = Math.max(0, (typeof graceEndWall === 'number') ? (graceEndWall - Date.now()) : ((shift.graceMs||30000)));
      setTimeout(() => { try { fillCoinDoorExitsWithBlock16(); } catch(_){} }, ms + 5);
    } catch(_){}
    try {
      if (shift.playersFinished) shift.playersFinished.add(from||finisher||'peer');
      if (shift.playersAlive && from) shift.playersAlive.delete(from);
    } catch(_){ }
  });
  
  // Competitive game victory announcement
  Net.on('comp_victory', ({ winner, winnerId }) => {
    if (shift.competitiveMode && !shift.gameOver) {
      shift.gameOver = true;
      shift.gameWinner = winner;
      showVictoryMessage(winner);
      shift.statusText = `${winner} wins!`;
      // Fully stop any pending round transitions to avoid freeze on losers
      shift.firstFinishTime = 0;
      shift.graceEnd = 0;
      shift.pendingStartAt = 0;
      shift.nextRoundAt = 0;
      shift.roundActive = false;
      // Move all players to spectator area
      try {
        if (winnerId !== 'local') {
          state.p.x = 52 * TILE; state.p.y = 77 * TILE; shift.spectatorUntilNext = true;
        }
      } catch(_) {}
    }
  });
  
  // Competitive game start announcement
  Net.on('comp_start', () => {
    shift.competitiveMode = true;
    shift.gameOver = false;
    shift.gameWinner = null;
  });
}

let lastNetSend = 0;
function netTick(now){
  try { initNetworking(); } catch(_){}
  if (typeof Net === 'undefined' || !Net.id) return;
  if (now - lastNetSend > 50) {
    lastNetSend = now;
    try { Net.send({ t: 'state', x: state.p.x|0, y: state.p.y|0, faceIndex: state.faceIndex|0, name: (window.state && window.state.playerName)||'Player' }); } catch(_){}
  }
}

function openAllCoinDoors() {
  if (!shift || !shift.coinDoors || !shift.coinDoors.size) return;
  for (const key of Array.from(shift.coinDoors)) {
    const [xs, ys] = key.split(',');
    const x = parseInt(xs, 10), y = parseInt(ys, 10);
    if (fgMap[y]) { fgMap[y][x] = 136; if (typeof window.markDirtyTile === 'function') window.markDirtyTile(x, y); }
  }
  shift.coinDoors.clear();
}

function fillCoinDoorExitsWithBlock16() {
  try {
    if (shift && shift.coinDoorExits && shift.coinDoorExits.size) {
      for (const [k, pos] of shift.coinDoorExits) {
        if (fgMap[pos.y]) {
          fgMap[pos.y][pos.x] = 16;
          if (typeof window.markDirtyTile === 'function') window.markDirtyTile(pos.x, pos.y);
        }
      }
    }
  } catch (_) {}
  // reset tracking after refill
  if (shift) shift.coinDoorExits = new Map();
}

function fillOldCoinDoorExitsExceptCurrent(prevExits) {
  try {
    if (!prevExits || prevExits.size === 0) return;
    const current = (shift && shift.coinDoorExits) ? shift.coinDoorExits : new Map();
    for (const [k, pos] of prevExits) {
      if (current && current.has(k)) continue; // skip exits reused this round
      if (fgMap[pos.y]) {
        fgMap[pos.y][pos.x] = 16;
        if (typeof window.markDirtyTile === 'function') window.markDirtyTile(pos.x, pos.y);
      }
    }
  } catch(_) {}
}

function getEntranceSpawnFallback() {
  // Deterministic entrance picker shared by host and clients
  // Preference: top -> left -> bottom -> right; choose entrance closest to that edge's center
  // Then step 1..4 tiles inward along the edge normal, choosing the first non-solid tile within box.
  try {
    // Special rule: Level 3, Box 2 always uses fixed entrance (67, 61)
    if (shift && shift.curLevel === 3 && shift.curBox === 2) {
      return { x: 67, y: 61 };
    }
    // Special rule: Level 1, Box 12 always uses fixed entrance (51, 48)
    if (shift && shift.curLevel === 1 && shift.curBox === 12) {
      return { x: 51, y: 48 };
    }
    // Special rule: Level 2, Box 1 always uses fixed entrance (51, 48)
    if (shift && shift.curLevel === 2 && shift.curBox === 1) {
      return { x: 51, y: 48 };
    }
    // Special rule: Level 5, Box 3 always uses fixed entrance (67, 61)
    if (shift && shift.curLevel === 5 && shift.curBox === 3) {
      return { x: 67, y: 61 };
    }
    if (!shift || !shift.dst) throw new Error('no box');
    const x0 = shift.dst.x0, y0 = shift.dst.y0, x1 = shift.dst.x1, y1 = shift.dst.y1;
    const entrances = [];
    if (shift.entranceSpawns && shift.entranceSpawns.size) {
      for (const key of shift.entranceSpawns) {
        const [xs, ys] = key.split(',');
        const ex = parseInt(xs, 10), ey = parseInt(ys, 10);
        if (Number.isFinite(ex) && Number.isFinite(ey)) entrances.push({ x: ex, y: ey });
      }
    }
    const top = entrances.filter(p => p.y === y0);
    const left = entrances.filter(p => p.x === x0);
    const bottom = entrances.filter(p => p.y === y1);
    const right = entrances.filter(p => p.x === x1);
    const centerX = Math.floor((x0 + x1) / 2);
    const centerY = Math.floor((y0 + y1) / 2);
    function pickClosest(list, axis, center) {
      if (!list || !list.length) return null;
      let best = list[0];
      let bestD = Math.abs((axis === 'x' ? best.x : best.y) - center);
      for (let i = 1; i < list.length; i++) {
        const v = list[i];
        const d = Math.abs((axis === 'x' ? v.x : v.y) - center);
        if (d < bestD || (d === bestD && (axis === 'x' ? (v.x < best.x) : (v.y < best.y)))) {
          best = v; bestD = d;
        }
      }
      return best;
    }
    let base = null;
    let normal = { x: 0, y: 1 }; // default inward (top)
    if (!base && top.length) { base = pickClosest(top, 'x', centerX); normal = { x: 0, y: 1 }; }
    if (!base && left.length) { base = pickClosest(left, 'y', centerY); normal = { x: 1, y: 0 }; }
    if (!base && bottom.length) { base = pickClosest(bottom, 'x', centerX); normal = { x: 0, y: -1 }; }
    if (!base && right.length) { base = pickClosest(right, 'y', centerY); normal = { x: -1, y: 0 }; }
    // If an entrance exists, step inward 1..4 tiles
    if (base) {
      for (let s = 1; s <= 6; s++) {
        let cx = base.x + normal.x * s;
        let cy = base.y + normal.y * s;
        // Clamp within box bounds
        if (cx < x0) cx = x0; if (cx > x1) cx = x1;
        if (cy < y0) cy = y0; if (cy > y1) cy = y1;
        if (!isBlockingAt(cx, cy)) return { x: cx, y: cy };
      }
      // If all candidates blocked, search a small spiral around base inside box
      let fx = base.x + normal.x;
      let fy = base.y + normal.y;
      if (fx < x0) fx = x0; if (fx > x1) fx = x1;
      if (fy < y0) fy = y0; if (fy > y1) fy = y1;
      if (!isBlockingAt(fx, fy)) return { x: fx, y: fy };
      const spiralDirs = [ [1,0],[0,1],[-1,0],[0,-1] ];
      let sx = fx, sy = fy, len = 1, dirIdx = 0, steps = 0;
      for (let ring = 0; ring < 3; ring++) {
        for (let r = 0; r < 2; r++) {
          for (let i = 0; i < len; i++) {
            sx += spiralDirs[dirIdx][0];
            sy += spiralDirs[dirIdx][1];
            if (sx < x0) sx = x0; if (sx > x1) sx = x1;
            if (sy < y0) sy = y0; if (sy > y1) sy = y1;
            if (!isBlockingAt(sx, sy)) return { x: sx, y: sy };
            steps++;
          }
          dirIdx = (dirIdx + 1) % 4;
        }
        len++;
      }
      // Fallback to base if everything is blocked (should be rare)
      return { x: fx, y: fy };
    }
    // No entrances: choose top-center nudged one tile inward
    const defX = centerX;
    let defY = Math.min(y1, y0 + 1);
    // Try to avoid solids just below top-center
    for (let s = 1; s <= 4; s++) {
      const cy = Math.min(y1, y0 + s);
      if (!isBlockingAt(defX, cy)) { defY = cy; break; }
    }
    return { x: defX, y: defY };
  } catch (_) {
    // Final fallback if anything failed
    return { x: 51, y: 75 };
  }
}

// Console test hooks
try {
  window.dumpShift = function(){
    console.log('EE_DBStats', window.EE_DBStats);
    console.log('EE_ShiftDebug', window.EE_ShiftDebug);
    console.log('EE_LastPlaced', window.EE_LastPlaced);
  };
  window.placeShiftBoxManual = function(level, box){ try { placeShiftBox(level|0, box|0); } catch(e){ console.error(e); } };
} catch(_) {}

function copyShiftRegionToWorld(srcFg, srcBg, srcDeco, srcX0, srcY0, dstX0, dstY0, w, h) {
  let goldCoinsInRegion = 0;
  shift.coinDoors = new Set();
  shift.entranceSpawns = new Set();
  // Reset coin-door exit tracking for this placement
  shift.coinDoorExits = new Map();
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const sx = srcX0 + dx;
      const sy = srcY0 + dy;
      const dxw = dstX0 + dx;
      const dyw = dstY0 + dy;
      let fid = (srcFg[sy] && srcFg[sy][sx]) || 0;
      let bid = (srcBg[sy] && srcBg[sy][sx]) || 0;
      let did = (srcDeco[sy] && srcDeco[sy][sx]) || 0;
      if (fid === 100) goldCoinsInRegion++;
      if (did === 100) goldCoinsInRegion++;
      // Transformations:
      // Remove green key doors (id 24) whether in foreground or decoration, and record entrance spawn points along border
      const onBorder = (dx === 0 || dy === 0 || dx === w - 1 || dy === h - 1);
      if (fid === 24) { fid = 0; if (onBorder) shift.entranceSpawns.add(`${dxw},${dyw}`); }
      if (did === 24) { did = 0; if (onBorder) shift.entranceSpawns.add(`${dxw},${dyw}`); }
      // Convert red key doors (id 23) to coin doors (solid fg id 43) ONLY on the border of the destination box
      const hasRed = (fid === 23) || (did === 23);
      if (hasRed) {
        if (onBorder) {
          fid = 43; // place solid coin door stand-in
          did = (did === 23 ? 0 : did);
          shift.coinDoors.add(`${dxw},${dyw}`);
          // Carve empty space (air) just outside the box behind the door to prevent players getting stuck
          const wx = dxw, wy = dyw;
          // Determine outward direction from the box center
          let nx = 0, ny = 0;
          if (dx === 0) { nx = -1; ny = 0; }
          else if (dx === w - 1) { nx = +1; ny = 0; }
          else if (dy === 0) { nx = 0; ny = -1; }
          else if (dy === h - 1) { nx = 0; ny = +1; }
          const cx = wx + nx, cy = wy + ny;
          if (cy>=0&&cy<WORLD_H&&cx>=0&&cx<WORLD_W) {
            // remember cleared tile so we can restore it on next round change if needed
            shift.clearedOutside.push({ x: cx, y: cy, fg: (fgMap[cy]&&fgMap[cy][cx])||0, de: (decoMap[cy]&&decoMap[cy][cx])||0, bg: (bgMap[cy]&&bgMap[cy][cx])||0 });
            setTileFg(cx, cy, 0);
            setTileDeco(cx, cy, 0);
            // Track for refill with FG 16 at grace-end, and for selective post-placement backfill
            shift.coinDoorExits.set(`${cx},${cy}`, { x: cx, y: cy });
          }
        } else {
          // strip internal red doors
          if (fid === 23) fid = 0;
          if (did === 23) did = 0;
        }
      }
      // Clear destination first so left-over tiles from base level do not leak
      setTileBg(dxw, dyw, 0);
      setTileDeco(dxw, dyw, 0);
      setTileFg(dxw, dyw, 0);
      setTileBg(dxw, dyw, bid|0);
      setTileDeco(dxw, dyw, did|0);
      setTileFg(dxw, dyw, fid|0);
    }
  }
  shift.lastCoinRequirement = goldCoinsInRegion;
}

async function loadShiftDBOnce() {
  if (shift.dbBytes && shift.dbMaps) return;
  try {
    // Try multiple DB filenames; parse via AMF3/deep-scan directly
    const candidates = [
      './EX Shift MDB1 - nou(1).eelvl',
      './EX Shift DB2 - nou.eelvl',
      './EX Shift DB3 - nou.eelvl'
    ];
    const dbs = [];
    for (const url of candidates) {
      try {
        const ab = await fetch(url).then(r => r.arrayBuffer());
        const bytes = new Uint8Array(ab);
        const parsed = parseEELVL_DB(bytes, 400, 200);
        if (parsed && parsed.W >= 400 && parsed.H >= 200) {
          const cols = Math.floor(parsed.W / 32);
          const rows = Math.floor(parsed.H / 27);
          dbs.push({ url, bytes, maps: parsed, cols, rows });
        }
      } catch (_) { /* ignore missing */ }
    }
    if (!dbs.length) throw new Error('No DB candidate parsed');
    // Build stitched layout: place DBs side-by-side into one big atlas (foreground/background/decoration)
    let stitchW = 0, stitchH = 0; const stepX = 32, stepY = 27;
    for (const d of dbs) { stitchW += d.maps.W; if (d.maps.H > stitchH) stitchH = d.maps.H; }
    const fgSt = new Array(stitchH); const bgSt = new Array(stitchH); const deSt = new Array(stitchH);
    for (let y = 0; y < stitchH; y++) { fgSt[y] = new Array(stitchW).fill(0); bgSt[y] = new Array(stitchW).fill(0); deSt[y] = new Array(stitchW).fill(0); }
    let xOffset = 0; const dbOffsets = [];
    for (const d of dbs) {
      dbOffsets.push({ url: d.url, x0: xOffset, W: d.maps.W, H: d.maps.H });
      for (let y = 0; y < d.maps.H; y++) {
        const srcFgRow = d.maps.fg[y] || []; const srcBgRow = d.maps.bg[y] || []; const srcDeRow = d.maps.deco[y] || [];
        for (let x = 0; x < d.maps.W; x++) {
          fgSt[y][xOffset + x] = srcFgRow[x] || 0;
          bgSt[y][xOffset + x] = srcBgRow[x] || 0;
          deSt[y][xOffset + x] = srcDeRow[x] || 0;
        }
      }
      xOffset += d.maps.W;
    }
    // Compute total columns/rows in stitched atlas
    const totalCols = Math.floor(stitchW / stepX);
    const totalRows = Math.floor(stitchH / stepY);
    shift.dbStitched = { fg: fgSt, bg: bgSt, deco: deSt, W: stitchW, H: stitchH, offsets: dbOffsets };
    shift.dbMaps = shift.dbStitched; // use stitched for placement
    shift.totalCols = totalCols; shift.totalRows = totalRows;
    shift.dbFile = 'STITCHED(DB1+DB2+DB3)';
    // Build DB stats summary
    try {
      function countLayer(map){
        let c = 0; for (let y=0;y<map.length;y++){ const row = map[y]||[]; for (let x=0;x<row.length;x++){ if (row[x]) c++; } } return c;
      }
      const perDb = dbs.map(d=>{
        const cFg = countLayer(d.maps.fg);
        const cBg = countLayer(d.maps.bg);
        const cDe = countLayer(d.maps.deco);
        return { url: d.url, W: d.maps.W, H: d.maps.H, tiles: { fg: cFg, bg: cBg, deco: cDe, total: cFg + cBg + cDe } };
      });
      const stitchedTiles = { fg: countLayer(fgSt), bg: countLayer(bgSt), deco: countLayer(deSt) };
      stitchedTiles.total = stitchedTiles.fg + stitchedTiles.bg + stitchedTiles.deco;
      window.EE_DBStats = {
        dbs: perDb,
        stitched: { W: stitchW, H: stitchH, tiles: stitchedTiles },
        stepX, stepY
      };
    } catch(_) {}
    try {
      window.EE_ShiftDebug = {
        stitched: true,
        files: dbs.map(d=>({url:d.url, W:d.maps.W, H:d.maps.H})),
        stitchW, stitchH,
        dbW: 400, dbH: 200,
        originX: 0, originY: 0,
        totalCols, totalRows, stepX, stepY
      };
    } catch(_) {}
    // Fixed tile box size
    shift.dbOrigin = { x: 0, y: 0 };
    shift.dbStep = { x: 32, y: 27 };
    // second debug line removed; world was already restored per-candidate
  } catch (e) {
    shift.enabled = true; // keep enabled; we will try again next frame
    shift.lastError = String(e && e.message || e);
    try { window.EE_ShiftDebug = Object.assign({}, window.EE_ShiftDebug||{}, { error: shift.lastError }); } catch (_) {}
  }
}

async function ensureDBReady() {
  if (shift && shift.dbMaps) return;
  try { await loadShiftDBOnce(); } catch (_) {}
  if (!shift || !shift.dbMaps) throw new Error('Shift DB not loaded');
}

function placeShiftBox(levelIndex, boxIndex) {
  if (!shift.dbMaps) return;
  // Guard against runaway recursion re-entry
  if (shift._placing) return;
  shift._placing = true;
  // Before placing new box: restore any previously cleared outside tiles and hard-reset play area
  try {
    if (shift.clearedOutside && shift.clearedOutside.length) {
      for (const t of shift.clearedOutside) {
        if (fgMap[t.y]) fgMap[t.y][t.x] = t.fg||0;
        if (decoMap[t.y]) decoMap[t.y][t.x] = t.de||0;
      }
      shift.clearedOutside = [];
      tileCache.dirtyAll = true;
    }
    if (shift.baseAreaSnapshot && shift.baseAreaSnapshot.meta && shift.baseAreaSnapshot.fg) {
      const { x0, y0, w, h } = shift.baseAreaSnapshot.meta.area;
      for (let dy=0; dy<h; dy++) {
        const y = y0 + dy;
        for (let dx=0; dx<w; dx++) {
          const x = x0 + dx;
          const bid = (shift.baseAreaSnapshot.bg[dy] && shift.baseAreaSnapshot.bg[dy][dx]) || 0;
          const did = (shift.baseAreaSnapshot.deco[dy] && shift.baseAreaSnapshot.deco[dy][dx]) || 0;
          const fid = (shift.baseAreaSnapshot.fg[dy] && shift.baseAreaSnapshot.fg[dy][dx]) || 0;
          setTileBg(x, y, 0); setTileDeco(x, y, 0); setTileFg(x, y, 0);
          if (bid) setTileBg(x, y, bid);
          if (did) setTileDeco(x, y, did);
          if (fid) setTileFg(x, y, fid);
        }
      }
    }
  } catch(_) {}
  const w = shift.boxW, h = shift.boxH;
  const stepX = 32, stepY = 27;
  const srcFg = shift.dbMaps.fg, srcBg = shift.dbMaps.bg, srcDeco = shift.dbMaps.deco;
  const srcW = shift.dbMaps.W, srcH = shift.dbMaps.H;
  const offx = (shift.srcOffset && Number.isFinite(shift.srcOffset.x)) ? (shift.srcOffset.x|0) : 0;
  const offy = (shift.srcOffset && Number.isFinite(shift.srcOffset.y)) ? (shift.srcOffset.y|0) : 0;
  const baseX = (boxIndex - 1) * stepX;
  const baseY = (levelIndex - 1) * stepY;
  let sx0 = baseX + offx;
  let sy0 = baseY + offy;
  if (sx0 < 0) sx0 = 0;
  if (sy0 < 0) sy0 = 0;
  // Clamp to DB bounds
  if (sx0 < 0 || sy0 < 0 || sx0 + w > srcW || sy0 + h > srcH) {
    shift.lastPlaced = { db: shift.dbFile, levelIndex, boxIndex, sx0, sy0, w, h, ok: false, reason: 'out_of_bounds', srcW, srcH };
    try { window.EE_LastPlaced = shift.lastPlaced; } catch(_) {}
    shift._placing = false;
    return;
  }
  const regionHasAny = (x0, y0) => {
    let nonzero = 0;
    for (let dy = 0; dy < h && nonzero < 4; dy++) {
      const yy = y0 + dy; if (!srcFg[yy] && !srcBg[yy] && !srcDeco[yy]) continue;
      for (let dx = 0; dx < w && nonzero < 4; dx++) {
        const xx = x0 + dx;
        const f = (srcFg[yy] && srcFg[yy][xx]) || 0;
        const b = (srcBg[yy] && srcBg[yy][xx]) || 0;
        const d = (srcDeco[yy] && srcDeco[yy][xx]) || 0;
        if (f|b|d) nonzero++;
      }
    }
    return nonzero > 0;
  };
  const any = regionHasAny(sx0, sy0);
  // Copy region into destination box
  copyShiftRegionToWorld(srcFg, srcBg, srcDeco, sx0, sy0, shift.dst.x0, shift.dst.y0, w, h);
  // Mark cache dirty
  tileCache.dirtyAll = true;
  rebuildDynamicIndex();
  // Reset coin counters when box changes so HUD matches new box
  try { state.coins = 0; state.blueCoins = 0; } catch(_) {}
  const coinReq = shift.lastCoinRequirement || 0;
  shift.curCoinReq = coinReq;
  shift.lastPlaced = { db: shift.dbFile, levelIndex, boxIndex, sx0, sy0, w, h, stepX, stepY, offx, offy, baseX, baseY, ok: true, any, srcW, srcH, coinReq };
  try { window.EE_LastPlaced = shift.lastPlaced; } catch (e) {}
  // Reset finish/grace state on new placement
  shift.firstFinishTime = 0; shift.finished = false; shift.finishedName = '';
  shift.graceEnd = 0; shift.nextRoundAt = 0; shift.statusText = '';
  shift._placing = false;
}

// Serialize current world (fg/bg/deco) for the play area into a compact JSON and persist to localStorage
function saveCurrentMapToLocal() {
  const area = { x0: shift.dst.x0, y0: shift.dst.y0, w: shift.boxW, h: shift.boxH };
  const data = { meta: { area }, fg: [], bg: [], deco: [] };
  for (let dy=0; dy<area.h; dy++) {
    const y = area.y0 + dy;
    const rfg = [], rbg = [], rde = [];
    for (let dx=0; dx<area.w; dx++) {
      const x = area.x0 + dx;
      rfg.push((fgMap[y] && fgMap[y][x]) || 0);
      rbg.push((bgMap[y] && bgMap[y][x]) || 0);
      rde.push((decoMap[y] && decoMap[y][x]) || 0);
    }
    data.fg.push(rfg); data.bg.push(rbg); data.deco.push(rde);
  }
  const json = JSON.stringify(data);
  try { localStorage.setItem('EEO_LOCAL_START_MAP', json); } catch(_){}
  // also trigger a file download for backup
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'custom_start_map.json'; document.body.appendChild(a); a.click(); URL.revokeObjectURL(url); a.remove();
}

// If a local map exists, apply it over the play area after the base world loads
function tryApplyLocalStartMap() {
  let json = null;
  try { json = localStorage.getItem('EEO_LOCAL_START_MAP'); } catch(_){}
  if (!json) return false;
  try {
    const data = JSON.parse(json);
    const { x0, y0, w, h } = data.meta.area;
    for (let dy=0; dy<h; dy++) {
      const y = y0 + dy;
      for (let dx=0; dx<w; dx++) {
        const x = x0 + dx;
        const bid = (data.bg[dy] && data.bg[dy][dx]) || 0;
        const did = (data.deco[dy] && data.deco[dy][dx]) || 0;
        const fid = (data.fg[dy] && data.fg[dy][dx]) || 0;
        setTileBg(x, y, 0); setTileDeco(x, y, 0); setTileFg(x, y, 0);
        if (bid) setTileBg(x, y, bid);
        if (did) setTileDeco(x, y, did);
        if (fid) setTileFg(x, y, fid);
      }
    }
    tileCache.dirtyAll = true; rebuildDynamicIndex();
    return true;
  } catch (_) { return false; }
}

async function tryApplyCustomStartMapFromDisk() {
  // If no local saved map, try loading ./custom_start_map.json from the server folder
  let json = null;
  try {
    const res = await fetch('./custom_start_map.json', { cache: 'no-store' });
    if (!res.ok) return false;
    json = await res.text();
  } catch { return false; }
  if (!json) return false;
  try {
    const data = JSON.parse(json);
    const { x0, y0, w, h } = data.meta.area;
    for (let dy=0; dy<h; dy++) {
      const y = y0 + dy;
      for (let dx=0; dx<w; dx++) {
        const x = x0 + dx;
        const bid = (data.bg[dy] && data.bg[dy][dx]) || 0;
        const did = (data.deco[dy] && data.deco[dy][dx]) || 0;
        const fid = (data.fg[dy] && data.fg[dy][dx]) || 0;
        setTileBg(x, y, 0); setTileDeco(x, y, 0); setTileFg(x, y, 0);
        if (bid) setTileBg(x, y, bid);
        if (did) setTileDeco(x, y, did);
        if (fid) setTileFg(x, y, fid);
      }
    }
    tileCache.dirtyAll = true; rebuildDynamicIndex();
    return true;
  } catch { return false; }
}

// Export current world into a minimal .eelvl
function exportWorldAsEELVL() {
  const owner = 'player';
  const worldName = 'EX Crew Shift [Test]';
  const width = WORLD_W|0; const height = WORLD_H|0; const gravity = 1.0; const bgCol = 0xff000000;
  const desc = 'Custom start map'; const campaign = false; const crewId=''; const crewName=''; const crewStatus=0; const minimap=true; const ownerId='made offline';
  const parts = [];
  const enc = new TextEncoder();
  function push(u8){ parts.push(u8); }
  function writeUTF(s){ const b = enc.encode(s); const len = new Uint8Array(2); new DataView(len.buffer).setUint16(0,b.length); push(len); push(b); }
  function writeInt(n){ const b=new Uint8Array(4); new DataView(b.buffer).setInt32(0,n); push(b); }
  function writeUInt(n){ const b=new Uint8Array(4); new DataView(b.buffer).setUint32(0,n>>>0); push(b); }
  function writeF32(f){ const b=new Uint8Array(4); new DataView(b.buffer).setFloat32(0,f); push(b); }
  function fromUShortArray(arr){ const out = new Uint8Array(arr.length*2); for(let i=0;i<arr.length;i++){ out[i*2]=(arr[i]>>8)&255; out[i*2+1]=arr[i]&255; } return out; }
  // header
  writeUTF(owner); writeUTF(worldName); writeInt(width); writeInt(height); writeF32(gravity); writeUInt(bgCol);
  writeUTF(desc); push(new Uint8Array([campaign?1:0])); writeUTF(crewId); writeUTF(crewName); writeInt(crewStatus); push(new Uint8Array([minimap?1:0])); writeUTF(ownerId);
  // collect tiles per (id,layer)
  const map = new Map();
  const add = (id,layer,x,y)=>{ const k=`${id}|${layer}`; let r=map.get(k); if(!r){ r={id,layer,xs:[],ys:[]}; map.set(k,r);} r.xs.push(x); r.ys.push(y); };
  for (let y=0;y<WORLD_H;y++){
    for (let x=0;x<WORLD_W;x++){
      const b=(bgMap[y]&&bgMap[y][x])||0, d=(decoMap[y]&&decoMap[y][x])||0, f=(fgMap[y]&&fgMap[y][x])||0;
      if (f) add(f,0,x,y); if (b) add(b,1,x,y); if (d) add(d,2,x,y);
    }
  }
  for (const r of map.values()){
    writeInt(r.id); writeInt(r.layer);
    const xb=fromUShortArray(r.xs); writeUInt(xb.length); push(xb);
    const yb=fromUShortArray(r.ys); writeUInt(yb.length); push(yb);
  }
  // combine + deflate
  let total=0; for(const p of parts) total+=p.length; const raw=new Uint8Array(total); let off=0; for(const p of parts){ raw.set(p,off); off+=p.length; }
  const out = (window.pako && pako.deflate) ? pako.deflate(raw) : raw;
  const blob=new Blob([out],{type:'application/octet-stream'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='EX Crew Shift [Test].eelvl'; document.body.appendChild(a); a.click(); URL.revokeObjectURL(url); a.remove();
}

const state = {
  p: new PlayerPhysics(),
  input: { left: false, right: false, up: false, down: false, jump: false, jumpJP: false, hPri: 0, vPri: 0 },
  faceIndex: 0, // frame index (26px step in EE, we'll draw 26x26 as in Player.rect2)
  goldBorder: false,
  godMode: false,
  canEdit: false,
  autoTrack: false,
  trackPlayer: true,
  auraAnim: { start: 0, playedIntro: false, loopStart: 0 },
  keys: { red: false, green: false, blue: false, cyan: false, magenta: false, yellow: false },
  coins: 0,
  blueCoins: 0,
  onClimbDot: false,
  actionQueue: [0, 0],
  inspectInfo: null,
};
window.state = state;

// Copy constants from EE render: 26x26 frames
const FACE_SIZE = 26;

function drawWorld() {
  // Clear using screen space
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.fillStyle = '#1c2027';
  ctx.fillRect(0, 0, canvas.width / view.dpr, canvas.height / view.dpr);
  // Build/update offscreen cache of static tiles
  const worldPxW = WORLD_W * TILE;
  const worldPxH = WORLD_H * TILE;
  if (!tileCache.canvas || tileCache.w !== worldPxW || tileCache.h !== worldPxH) {
    tileCache.canvas = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(worldPxW, worldPxH) : document.createElement('canvas');
    if (!(tileCache.canvas instanceof OffscreenCanvas)) { tileCache.canvas.width = worldPxW; tileCache.canvas.height = worldPxH; }
    tileCache.ctx = tileCache.canvas.getContext('2d');
    tileCache.ctx.imageSmoothingEnabled = false;
    tileCache.w = worldPxW; tileCache.h = worldPxH; tileCache.dirtyAll = true; tileCache.dirtySet.clear();
  }
  if (tileCache.dirtyAll) {
    window.EE_CacheBuild = true;
    const c = tileCache.ctx;
    c.setTransform(1,0,0,1,0,0);
    c.clearRect(0,0,worldPxW,worldPxH);
    if (window.EE_DrawTile) {
      for (let y = 0; y < WORLD_H; y++) {
        for (let x = 0; x < WORLD_W; x++) { window.EE_DrawTile(c, x, y); }
      }
    } else {
      c.fillStyle = '#2f3643';
      solid.forEach(key => { const [x, y] = key.split(',').map(Number); c.fillRect(x*TILE, y*TILE, TILE, TILE); });
    }
    tileCache.dirtyAll = false; tileCache.dirtySet.clear();
    window.EE_CacheBuild = false;
  } else if (tileCache.dirtySet.size) {
    window.EE_CacheBuild = true;
    const c = tileCache.ctx;
    c.setTransform(1,0,0,1,0,0);
    for (const key of tileCache.dirtySet) {
      const [xs, ys] = key.split(',');
      const x = parseInt(xs,10), y = parseInt(ys,10);
      const px = x*TILE, py = y*TILE;
      c.clearRect(px, py, TILE, TILE);
      if (window.EE_DrawTile) window.EE_DrawTile(c, x, y);
      else if (isSolidStaticId((fgMap[y] && fgMap[y][x]) || 0)) { c.fillStyle = '#2f3643'; c.fillRect(px, py, TILE, TILE); }
    }
    tileCache.dirtySet.clear();
    window.EE_CacheBuild = false;
  } else if ((window.tileCacheDirty && window.tileCacheDirty.size) || window.EE_ForceCacheRebuild) {
    window.EE_CacheBuild = true;
    const c = tileCache.ctx;
    c.setTransform(1,0,0,1,0,0);
    if (window.EE_ForceCacheRebuild) {
      c.clearRect(0,0,worldPxW,worldPxH);
      if (window.EE_DrawTile) {
        for (let y = 0; y < WORLD_H; y++) {
          for (let x = 0; x < WORLD_W; x++) { window.EE_DrawTile(c, x, y); }
        }
      }
      window.EE_ForceCacheRebuild = false;
    } else if (window.tileCacheDirty && window.tileCacheDirty.size) {
      for (const key of window.tileCacheDirty) {
        const [xs, ys] = key.split(',');
        const x = parseInt(xs,10), y = parseInt(ys,10);
        const px = x*TILE, py = y*TILE;
        c.clearRect(px, py, TILE, TILE);
        if (window.EE_DrawTile) window.EE_DrawTile(c, x, y);
      }
      window.tileCacheDirty.clear();
    }
    window.EE_CacheBuild = false;
  }
  // Blit only the visible portion of the cache, aligned to tile boundaries to avoid seams while zooming
  const cssW = canvas.width / view.dpr;
  const cssH = canvas.height / view.dpr;
  const tilesPerScale = TILE * view.scale;
  // Source start in world pixels, snapped to tile
  let srcX = Math.floor((-view.offX) / view.scale / TILE) * TILE;
  let srcY = Math.floor((-view.offY) / view.scale / TILE) * TILE;
  if (srcX < 0) srcX = 0; if (srcY < 0) srcY = 0;
  // How many tiles do we need to cover the viewport? add 2-tile margin
  const tilesW = Math.ceil(cssW / tilesPerScale) + 1;
  const tilesH = Math.ceil(cssH / tilesPerScale) + 1;
  let srcW = tilesW * TILE;
  let srcH = tilesH * TILE;
  if (srcX + srcW > worldPxW) srcW = worldPxW - srcX;
  if (srcY + srcH > worldPxH) srcH = worldPxH - srcY;
  if (srcW <= 0 || srcH <= 0) return;
  // Destination in screen pixels, aligned to pixel to avoid subpixel jitter
  const dstX = (view.offX + srcX * view.scale) | 0;
  const dstY = (view.offY + srcY * view.scale) | 0;
  const dstW = (srcW * view.scale) | 0;
  const dstH = (srcH * view.scale) | 0;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.filter = 'none';
  ctx.drawImage(tileCache.canvas, srcX, srcY, srcW, srcH, dstX, dstY, dstW, dstH);
  // Switch to world transform for any overlays (crosshair, effects)
  ctx.setTransform(view.dpr * view.scale, 0, 0, view.dpr * view.scale, view.dpr * view.offX, view.dpr * view.offY);

  // Reveal invisible action tiles (arrows/dots) when the player touches them
  const invisToVisible = (id) => {
    if (id === 411) return 1;   // left arrow
    if (id === 412) return 2;   // up arrow
    if (id === 413) return 3;   // right arrow
    if (id === 1519) return 1518; // down arrow
    if (id === 414) return 4;   // classic dot
    if (id === 460) return 459; // slow/climb dot
    return 0;
  };
  const drawRevealAt = (tx, ty) => {
    if (!window.EE_DrawTileFrom) return;
    // Save originals
    const d0 = (decoMap[ty] && decoMap[ty][tx]) || 0;
    const f0 = (fgMap[ty] && fgMap[ty][tx]) || 0;
    let changed = false;
    const dv = invisToVisible(d0);
    const fv = invisToVisible(f0);
    if (dv) { decoMap[ty][tx] = dv; changed = true; }
    if (fv) { fgMap[ty][tx] = fv; changed = true; }
    if (changed) {
      // Draw revealed tile in grey (EE-style ghost reveal)
      ctx.save();
      ctx.filter = 'grayscale(100%) brightness(85%)';
      if (dv) window.EE_DrawTileFrom(ctx, tx, ty, decoMap);
      if (fv) window.EE_DrawTileFrom(ctx, tx, ty, fgMap);
      ctx.restore();
      // restore
      if (dv) decoMap[ty][tx] = d0;
      if (fv) fgMap[ty][tx] = f0;
    }
  };
  // Player AABB in tiles
  const leftT = Math.max(0, Math.floor(state.p.x / TILE));
  const topT = Math.max(0, Math.floor(state.p.y / TILE));
  const rightT = Math.min(WORLD_W - 1, Math.floor((state.p.x + 15) / TILE));
  const bottomT = Math.min(WORLD_H - 1, Math.floor((state.p.y + 15) / TILE));
  for (let ty = topT; ty <= bottomT; ty++) {
    for (let tx = leftT; tx <= rightT; tx++) {
      drawRevealAt(tx, ty);
    }
  }

  // Animated/above overlay: redraw visible tiles each frame to animate coins/effects/above layer
  const nowMs = performance.now();
  if (typeof window.EE_SetTime === 'function') window.EE_SetTime(nowMs);
  else window.EE_time = nowMs;
  // Visible tile bounds (reuse values)
  const minX = Math.max(0, Math.floor(-view.offX / (TILE * view.scale)) - 1);
  const minY = Math.max(0, Math.floor(-view.offY / (TILE * view.scale)) - 1);
  const maxX = Math.min(WORLD_W - 1, Math.ceil((canvas.width / view.dpr - view.offX) / (TILE * view.scale)) + 1);
  const maxY = Math.min(WORLD_H - 1, Math.ceil((canvas.height / view.dpr - view.offY) / (TILE * view.scale)) + 1);
  if (window.EE_DrawOverlay) {
    // Precompute coin frame data once per frame for EE_DrawOverlay
    window.EE_CoinFrame = window.EE_CoinFrame || {};
    window.EE_CoinFrame.time = nowMs;
    // Render only dynamic tiles within visible bounds by iterating dynamic sets
    const visited = new Set();
    const drawIfVisible = (k) => {
      const comma = k.indexOf(',');
      if (comma === -1) return;
      const x = parseInt(k.slice(0, comma), 10);
      const y = parseInt(k.slice(comma+1), 10);
      if (x < minX || x > maxX || y < minY || y > maxY) return;
      const key = k; if (visited.has(key)) return; visited.add(key);
      window.EE_DrawOverlay(ctx, x, y);
    };
    // Iterate coins, doors, then above; sets are typically sparse
    for (const k of dynamicIndex.coins) drawIfVisible(k);
    for (const k of dynamicIndex.doors) drawIfVisible(k);
    for (const k of dynamicIndex.above) drawIfVisible(k);
  }
  // Render coin door labels (remaining coins) at border tiles
  if (shift && shift.coinDoors && shift.coinDoors.size) {
    ctx.save();
    ctx.setTransform(view.dpr * view.scale, 0, 0, view.dpr * view.scale, view.dpr * view.offX, view.dpr * view.offY);
    ctx.fillStyle = '#000';
    ctx.font = '10px system-ui, Arial';
    const req = shift.curCoinReq || 0;
    const remaining = Math.max(0, req - (state.coins|0));
    for (const key of shift.coinDoors) {
      const [xs, ys] = key.split(',');
      const x = parseInt(xs, 10), y = parseInt(ys, 10);
      // Only draw if tile still shows id 43
      const idf = (fgMap[y] && fgMap[y][x]) || 0;
      if (idf !== 43) continue;
      const text = `${remaining}`;
      const tw = ctx.measureText(text).width;
      const bx = x * TILE + (16 - tw) / 2;
      const by = y * TILE + 11;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(bx - 2, by - 10, tw + 4, 12);
      ctx.fillStyle = '#ffd24d';
      ctx.fillText(text, bx, by);
    }
    ctx.restore();
  }
  // Round banner text
  const msgEl = document.getElementById('roundMsg');
  const rhEl = document.getElementById('roundHud');
  if (msgEl) {
    if (shift && shift.pendingStartAt) {
      const remain0 = Math.max(0, Math.ceil((shift.pendingStartAt - nowMs) / 1000));
      msgEl.textContent = `Starting in ${remain0}`;
      msgEl.style.display = 'block'; msgEl.style.opacity = '1';
    } else if (shift && shift.firstFinishTime) {
      const remain = Math.max(0, Math.ceil((shift.graceEnd - nowMs) / 1000));
      msgEl.textContent = `${shift.finishedName || 'Player'} finished! ${remain}s left! (Need ${shift.curCoinReq||0} gold)`;
      msgEl.style.display = 'block'; msgEl.style.opacity = '1';
    } else if (shift && shift.nextRoundAt) {
      const remain2 = Math.max(0, Math.ceil((shift.nextRoundAt - nowMs) / 1000));
      msgEl.textContent = `Next round in ${remain2}`;
      msgEl.style.display = 'block'; msgEl.style.opacity = '1';
    } else if (shift && shift.statusText) {
      msgEl.textContent = shift.statusText; msgEl.style.display = 'block'; msgEl.style.opacity = '1';
    } else { msgEl.style.opacity = '0'; setTimeout(()=>{ msgEl.style.display = ''; msgEl.textContent = ''; }, 250); }
  }
  if (rhEl) {
    const diff = shift && shift.curLevel ? shift.curLevel : 0;
    const lvl = shift && shift.curBox ? shift.curBox : 0;
    const parts = [];
    if (shift && shift.roundActive && diff) parts.push(`Difficulty ${diff}`);
    if (shift && shift.roundActive && lvl) parts.push(`Level ${lvl}`);
    rhEl.textContent = parts.join(' • ');
    rhEl.style.display = parts.length ? 'block' : '';
  }
  // Competitive HUD overlays
  if (shift && shift.competitiveMode) {
    // Bottom center: players finished X/X
    try {
      const total = Math.max(shift.playersAtRoundStart||0, shift.playersAlive ? shift.playersAlive.size : 0);
      const finished = shift.playersFinished ? shift.playersFinished.size : 0;
      // create/update footer element
      let footer = document.getElementById('compFooter');
      if (!footer) {
        footer = document.createElement('div');
        footer.id = 'compFooter';
        footer.style.position = 'fixed'; footer.style.bottom = '8px'; footer.style.left = '50%'; footer.style.transform = 'translateX(-50%)';
        footer.style.zIndex = '9999'; footer.style.background = 'rgba(0,0,0,0.6)'; footer.style.border = '1px solid #555'; footer.style.borderRadius = '8px';
        footer.style.padding = '6px 10px'; footer.style.fontSize = '13px'; footer.style.color = '#fff'; footer.style.pointerEvents = 'none';
        document.body.appendChild(footer);
      }
      footer.textContent = `Players finished: ${finished}/${total}`;
    } catch(_) {}
    // Right side: per-player finish times
    try {
      let panel = document.getElementById('compTimes');
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'compTimes';
        panel.style.position = 'fixed'; panel.style.top = '80px'; panel.style.right = '8px';
        panel.style.zIndex = '9999'; panel.style.background = 'rgba(0,0,0,0.5)'; panel.style.border = '1px solid #555'; panel.style.borderRadius = '8px';
        panel.style.padding = '8px 10px'; panel.style.fontSize = '12px'; panel.style.color = '#fff'; panel.style.pointerEvents = 'none';
        document.body.appendChild(panel);
      }
      // Build unique name mapping (handle duplicate names -> suffix 1..N)
      const idToName = new Map();
      const nameCounts = new Map();
      const addName = (id, raw) => {
        const base = (raw||'Player').trim() || 'Player';
        const count = (nameCounts.get(base)||0) + 1; nameCounts.set(base, count);
        const final = count > 1 ? `${base}${count}` : base;
        idToName.set(id, final);
      };
      // Local
      addName('local', (window.state && window.state.playerName) || 'Player');
      // Peers
      for (const [pid, p] of netPlayers.entries()) addName(pid, p?.name || `P${pid}`);
      // Collect and sort finish times
      const rows = [];
      if (shift.finishTimes && shift.finishTimes.size) {
        for (const [id, ms] of shift.finishTimes.entries()) {
          const nm = idToName.get(id) || `P${id}`;
          rows.push({ name: nm, ms: ms|0 });
        }
        rows.sort((a,b)=>a.ms-b.ms);
      }
      // Render
      panel.innerHTML = '<div style="font-weight:600;margin-bottom:4px;">Finish times</div>' +
        (rows.length ? rows.map(r=>`<div>${r.name}: ${(r.ms/1000).toFixed(2)}s</div>`).join('') : '<div>—</div>');
    } catch(_) {}
  } else {
    // Hide comp HUD when not in competitive mode
    const footer = document.getElementById('compFooter'); if (footer) footer.remove();
    const panel = document.getElementById('compTimes'); if (panel) panel.remove();
  }
  // Optionally overlay action-only deco (e.g., arrows) debugging layer
  // for (let y = 0; y < WORLD_H; y++) { for (let x = 0; x < WORLD_W; x++) { window.EE_DrawTileFrom(ctx, x, y, decoMap); } }
  // when editing, draw a faint crosshair at mouse tile
  if (state.canEdit && mouse.tile) {
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    const worldMouse = screenToWorld(mouse.x, mouse.y);
    const mtX = Math.floor(worldMouse.x / TILE);
    const mtY = Math.floor(worldMouse.y / TILE);
    ctx.fillRect(mtX * TILE, mtY * TILE, TILE, TILE);
  }
}

function drawPlayer() {
  const px = state.p.x - 5; // EE offsets
  const py = state.p.y - 5;
  // Draw god mode aura first
  if (state.godMode && auraImg.complete) {
    const frameW = 64, frameH = 64;
    const frames = Math.max(1, Math.floor(auraImg.width / frameW));
    // Intro (first 6 frames) play once, then loop last 6 frames
    const now = performance.now();
    if (!state.auraAnim.start) state.auraAnim.start = now;
    const elapsed = now - state.auraAnim.start;
    const msPer = 90;
    let idx = 0;
    if (!state.auraAnim.playedIntro) {
      idx = Math.min(5, Math.floor(elapsed / msPer));
      if (idx >= 5) { state.auraAnim.playedIntro = true; state.auraAnim.loopStart = now; }
    } else {
      const loopElapsed = now - state.auraAnim.loopStart;
      // last 6 frames: frames-6 .. frames-1
      const loopStart = Math.max(0, frames - 6);
      const loopIdx = Math.floor(loopElapsed / msPer) % 6;
      idx = loopStart + loopIdx;
    }
    const sxA = idx * frameW; const syA = 0;
    const ax = Math.floor(state.p.x - (frameW - 16) / 2);
    const ay = Math.floor(state.p.y - (frameH - 16) / 2);
    ctx.drawImage(auraImg, sxA, syA, frameW, frameH, ax, ay, frameW, frameH);
  }
  if (smileyImg.complete) {
    const sx = state.faceIndex * FACE_SIZE;
    const sy = state.goldBorder ? FACE_SIZE : 0;
    ctx.imageSmoothingEnabled = false;
    // Snap to integer pixels after world scaling to avoid edge clipping
    const rx = Math.floor(px);
    const ry = Math.floor(py);
    ctx.drawImage(smileyImg, sx, sy, FACE_SIZE, FACE_SIZE, rx, ry, FACE_SIZE, FACE_SIZE);
    // Name tag under character
    const name = (window.state && window.state.playerName) || '';
    if (name) {
      ctx.save();
      ctx.setTransform(view.dpr * view.scale, 0, 0, view.dpr * view.scale, view.dpr * view.offX, view.dpr * view.offY);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.font = '10px system-ui, Arial';
      const tw = ctx.measureText(name).width;
      const cx = Math.floor(state.p.x + 8 - tw/2);
      const cy = Math.floor(state.p.y + 20 + 10);
      ctx.fillRect(cx - 3, cy - 9, tw + 6, 12);
      ctx.fillStyle = '#fff';
      ctx.fillText(name, cx, cy);
      ctx.restore();
    }
  } else {
    ctx.fillStyle = '#ff0';
    ctx.fillRect(state.p.x, state.p.y, 16, 16);
  }
}

function updateHud() {
  // Hide gravity direction and multi-jump info from HUD
  const dirEl = document.getElementById('gdir'); if (dirEl) dirEl.style.display = 'none';
  const jEl = document.getElementById('jinfo'); if (jEl) jEl.style.display = 'none';
  if (state.stats) {
    const fpsEl = document.getElementById('fps');
    const msEl = document.getElementById('ms');
    if (fpsEl) fpsEl.textContent = state.stats.fps.toFixed(1);
    if (msEl) msEl.textContent = state.stats.frameMs.toFixed(2);
  }
  const god = document.getElementById('godBadge');
  const edit = document.getElementById('editBadge');
  const fs = document.getElementById('fsBadge');
  if (god) { god.style.display = 'none'; }
  if (edit) { edit.style.display = 'none'; }
  if (fs) {
    const isFs = !!document.fullscreenElement;
    fs.textContent = isFs ? 'Exit Fullscreen' : 'Fullscreen';
    fs.className = `badge ${isFs ? 'on' : 'off'}`;
  }
  // create tracking toggle badge once
  let tp = document.getElementById('trackPlayerBadge');
  if (!tp) {
    const row = document.querySelector('.row');
    if (row) {
      const el = document.createElement('span');
      el.id = 'trackPlayerBadge';
      el.className = 'badge off';
      el.title = 'Toggle camera track player (EE style)';
      el.textContent = 'Track Player';
      row.appendChild(el);
      el.addEventListener('click', () => state.trackPlayer = !state.trackPlayer);
    }
  } else {
    tp.textContent = state.trackPlayer ? 'Track Player: ON' : 'Track Player';
    tp.className = `badge ${state.trackPlayer ? 'on' : 'off'}`;
  }
  // show eelvl stats if available
  const wi = document.getElementById('worldInfo');
  if (wi && window.eelvlStats) {
    let base = `Tiles: ${window.eelvlStats.tiles} | Records: ${window.eelvlStats.records} | ${WORLD_W}x${WORLD_H}`;
    if (window.EE_ShiftDebug) {
      const d = window.EE_ShiftDebug;
      if (d && d.dbW && d.dbH) base += ` | DB: ${d.dbW}x${d.dbH} @ (${d.originX||0},${d.originY||0}) step ${d.stepX}x${d.stepY}`;
    }
    if (shift && shift.roundActive && shift.curLevel) {
      base += ` | Level ${shift.curLevel}`;
    }
    if (window.EE_LastPlaced) {
      const lp = window.EE_LastPlaced;
      base += ` | Box ${lp.levelIndex}:${lp.boxIndex} from (${lp.sx0},${lp.sy0}) any=${lp.any}`;
      if (typeof lp.coinReq === 'number') base += ` | CoinReq≈${lp.coinReq}`;
    }
    if (shift && shift.roundActive) base += ` | Round: ON${shift.firstFinishTime?'/GRACE':''}`;
    wi.textContent = base;
  }
  const insp = document.getElementById('inspect');
  if (insp && state.inspectInfo) {
    const { x, y, bg, deco, fg, boxRel } = state.inspectInfo;
    const extra = boxRel ? ` | Box(${boxRel.relX},${boxRel.relY})` : '';
    insp.textContent = `Tile (${x}, ${y}) | FG: ${fg} | Deco: ${deco} | BG: ${bg}${extra}`;
  }
  const goldEl = document.getElementById('goldCount');
  const blueEl = document.getElementById('blueCount');
  if (goldEl) goldEl.textContent = `${state.coins|0}`;
  if (blueEl) blueEl.textContent = `${state.blueCoins|0}`;
}

function tick() {
  // Use last-pressed priority per axis so multiple simultaneous keys resolve deterministically
  const inpH = state.input.hPri || 0;
  const inpV = state.input.vPri || 0;
  // Compute action effects for any tile overlapping the player's 16x16 AABB
  // Reset per-tick flags
  state.onClimbDot = false; // any zero-grav dot active this tick
  state.onNoGravDotCurrent = false; // classic dot (4/414)
  state.onNoGravDotDelayed = false;
  state.onClimbCurrent = false; // slow/climb dot (459/460) and ladders
  state.onClimbDelayed = false;
  state.activeFlipGravity = null;
  state.activeFlipGravityDelayed = null;
  const left = Math.floor(state.p.x / TILE);
  const top = Math.floor(state.p.y / TILE);
  const right = Math.floor((state.p.x + 15) / TILE);
  const bottom = Math.floor((state.p.y + 15) / TILE);
  // Maintain a local freeze flag if touching any door/gate; cleared when fully out
  (function updateLocalColorFreeze(){
    if (state.godMode) { localFreezeUntil.red=localFreezeUntil.green=localFreezeUntil.blue=0; return; }
    const minTx = Math.max(0, left), minTy = Math.max(0, top);
    const maxTx = Math.min(WORLD_W - 1, right), maxTy = Math.min(WORLD_H - 1, bottom);
    const touching = { red: false, green: false, blue: false };
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        const decoId = (decoMap[ty] && decoMap[ty][tx]) || 0;
        const fgId = (fgMap[ty] && fgMap[ty][tx]) || 0;
        const doorId = (decoId >= 23 && decoId <= 28) ? decoId : (fgId >= 23 && fgId <= 28 ? fgId : 0);
        if (!doorId) continue;
        if (doorId === 23 || doorId === 26) touching.red = true;
        if (doorId === 24 || doorId === 27) touching.green = true;
        if (doorId === 25 || doorId === 28) touching.blue = true;
      }
    }
    // Instantly clear per-color freeze when not touching
    const now = performance.now();
    localFreezeUntil.red = touching.red ? now + 1 : 0;
    localFreezeUntil.green = touching.green ? now + 1 : 0;
    localFreezeUntil.blue = touching.blue ? now + 1 : 0;
    try { window.EE_LocalFreezeColors = { red: isColorFrozen('red'), green: isColorFrozen('green'), blue: isColorFrozen('blue') }; } catch(_) {}
  })();
  // If a gate turned back into a door while player is inside, resolve overlap immediately
  (function resolveDoorGateOverlap(){
    if (state.godMode) return;
    let px = state.p.x, py = state.p.y;
    const minTx = Math.max(0, left), minTy = Math.max(0, top);
    const maxTx = Math.min(WORLD_W - 1, right), maxTy = Math.min(WORLD_H - 1, bottom);
    let bestAxis = null; let bestDelta = Infinity; let bestAdjust = 0;
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        const decoId = (decoMap[ty] && decoMap[ty][tx]) || 0;
        const fgId = (fgMap[ty] && fgMap[ty][tx]) || 0;
        const doorId = (decoId >= 23 && decoId <= 28) ? decoId : (fgId >= 23 && fgId <= 28 ? fgId : 0);
        if (!doorId) continue;
        // God mode ignores all collisions
        if (state.godMode) continue;
        // If tile is locally ghosted, keep it passable and draw gate
        const key = `${tx},${ty}`;
        const currentlyBlocks = getDoorGateBlocking(doorId);
        // Keep passable for the color while frozen
        if ((doorId===23||doorId===26) && isColorFrozen('red')) continue;
        if ((doorId===24||doorId===27) && isColorFrozen('green')) continue;
        if ((doorId===25||doorId===28) && isColorFrozen('blue')) continue;
        if (!currentlyBlocks) {
          localDoorGhosts.add(key);
          continue;
        }
        // If it just became blocking while we're overlapping, keep it ghosted until we exit
        if (!localDoorGhosts.has(key)) { localDoorGhosts.add(key); continue; }
        // Tile rect
        const rx0 = tx * TILE, ry0 = ty * TILE, rx1 = rx0 + 16, ry1 = ry0 + 16;
        const px0 = px, py0 = py, px1 = px + 15, py1 = py + 15;
        const overlap = !(px1 < rx0 || py1 < ry0 || px0 > rx1 || py0 > ry1);
        if (!overlap) continue;
        // Compute minimal push out
        const pushLeft = Math.max(0, px1 - rx0 + 0.001);
        const pushRight = Math.max(0, rx1 - px0 + 0.001);
        const pushUp = Math.max(0, py1 - ry0 + 0.001);
        const pushDown = Math.max(0, ry1 - py0 + 0.001);
        // choose smallest axis push
        const candidates = [
          { axis: 'x-', d: pushLeft, dx: -pushLeft, dy: 0 },
          { axis: 'x+', d: pushRight, dx: +pushRight, dy: 0 },
          { axis: 'y-', d: pushUp, dx: 0, dy: -pushUp },
          { axis: 'y+', d: pushDown, dx: 0, dy: +pushDown },
        ];
        for (const c of candidates) {
          if (c.d > 0 && c.d < bestDelta) { bestDelta = c.d; bestAxis = c.axis; bestAdjust = c.axis[0] === 'x' ? c.dx : c.dy; }
        }
      }
    }
    if (bestAxis) {
      if (bestAxis[0] === 'x') {
        state.p.x += bestAdjust;
        state.p._speedX = 0;
      } else {
        state.p.y += bestAdjust;
        state.p._speedY = 0;
      }
    }
  })();
  // Clear local ghosts the moment player fully leaves the tile
  (function clearExitedGhosts(){
    if (!localDoorGhosts.size) return;
    const minTx = Math.max(0, left), minTy = Math.max(0, top);
    const maxTx = Math.min(WORLD_W - 1, right), maxTy = Math.min(WORLD_H - 1, bottom);
    const touching = new Set();
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) touching.add(`${tx},${ty}`);
    }
    for (const k of Array.from(localDoorGhosts)) {
      if (!touching.has(k)) localDoorGhosts.delete(k);
    }
  })();
  function handleActionId(id) {
    if (!id) return;
    // Gravity arrows (visible and invisible)
    if (id === 1 || id === 411) { state.activeFlipGravity = 1; state.onClimbDot = true; }
    else if (id === 2 || id === 412) { state.activeFlipGravity = 2; state.onClimbDot = true; }
    else if (id === 3 || id === 413) { state.activeFlipGravity = 3; state.onClimbDot = true; }
    else if (id === 1518 || id === 1519) { state.activeFlipGravity = 0; state.onClimbDot = true; }
    // Classic dot (no gravity but not climbable slowdown)
    if (id === 4 || id === 414) state.onNoGravDotCurrent = true;
    // Slow/climb dots (visible + invisible)
    if (id === 459 || id === 460) state.onClimbCurrent = true;
    // Boost tiles handled exactly like EE later for current (center) tile only
    // Keys: trigger timed global key for 5s
    if (id === 6) { triggerKeyTimer('red'); state.keys.red = true; try { if (typeof Net!=='undefined'&&Net.id) Net.send({ t:'key', color:'red', durationMs:5000 }); } catch(_){} }
    if (id === 7) { triggerKeyTimer('green'); state.keys.green = true; try { if (typeof Net!=='undefined'&&Net.id) Net.send({ t:'key', color:'green', durationMs:5000 }); } catch(_){} }
    if (id === 8) { triggerKeyTimer('blue'); state.keys.blue = true; try { if (typeof Net!=='undefined'&&Net.id) Net.send({ t:'key', color:'blue', durationMs:5000 }); } catch(_){} }
    if (id === 189) state.keys.cyan = true;
    if (id === 190) state.keys.magenta = true;
    if (id === 191) state.keys.yellow = true;
  }
  for (let ty = top; ty <= bottom; ty++) {
    for (let tx = left; tx <= right; tx++) {
      if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) continue;
      // Determine a single representative action id like EE (prefers current tile at (cx,cy) with half-block corrections; simplified here)
      handleActionId((decoMap[ty] && decoMap[ty][tx]) || 0);
      handleActionId((fgMap[ty] && fgMap[ty][tx]) || 0);
    }
  }
  // delayed action uses last tick's current action id
  state.onClimbDelayed = !!state.prevOnClimbCurrent;
  state.onNoGravDotDelayed = !!state.prevOnNoGravDotCurrent;
  state.activeFlipGravityDelayed = (state.prevActiveFlipGravity ?? null);
  // Determine current action strictly from center tile like EE
  const cx = Math.floor((state.p.x + 8) / TILE);
  const cy = Math.floor((state.p.y + 8) / TILE);
  // Coin collection: if center overlaps a coin, collect it and clear the tile
  const coinIds = new Set([100,101]);
  let collectedGold = false, collectedBlue = false;
  if ((decoMap[cy] && coinIds.has(decoMap[cy][cx])) || (fgMap[cy] && coinIds.has(fgMap[cy][cx]))) {
    if (decoMap[cy] && coinIds.has(decoMap[cy][cx])) { collectedGold = collectedGold || (decoMap[cy][cx] === 100); collectedBlue = collectedBlue || (decoMap[cy][cx] === 101); decoMap[cy][cx] = 0; }
    if (fgMap[cy] && coinIds.has(fgMap[cy][cx])) { collectedGold = collectedGold || (fgMap[cy][cx] === 100); collectedBlue = collectedBlue || (fgMap[cy][cx] === 101); fgMap[cy][cx] = 0; }
    if (collectedGold || collectedBlue) {
      state.coins = (state.coins|0) + (collectedGold?1:0);
      state.blueCoins = (state.blueCoins|0) + (collectedBlue?1:0);
      // mark cache dirty for this tile to erase cached coin sprite
      if (typeof window.markDirtyTile === 'function') window.markDirtyTile(cx, cy);
      // play EE coin sfx if available
      if (typeof window.playCoinSfx === 'function') window.playCoinSfx();
      // coin pickups are LOCAL per player; do not broadcast
      // If requirement met, open all coin doors immediately
      if (shift && shift.roundActive && (state.coins|0) >= (shift.curCoinReq||0)) {
        openAllCoinDoors();
      }
      // If inside play box and coin requirement met, mark finish when touching red-door stand-in
      if (shift && shift.roundActive && !shift.spectatorUntilNext) {
        const inBox = (cx >= shift.dst.x0 && cx <= shift.dst.x1 && cy >= shift.dst.y0 && cy <= shift.dst.y1);
        if (inBox && state.coins >= (shift.curCoinReq||0)) {
          // Detect reaching red door stand-in (we used solid id 43 as stand-in on foreground)
          // Check around center for the stand-in in fg/deco
          const near = [ [0,0],[1,0],[-1,0],[0,1],[0,-1] ];
          let atDoor = false;
          for (const [dx,dy] of near) {
            const tx = cx+dx, ty = cy+dy;
            const idf = (fgMap[ty] && fgMap[ty][tx]) || 0;
            const idd = (decoMap[ty] && decoMap[ty][tx]) || 0;
            if (idf === 43 || idf === 136 || idd === 23) { atDoor = true; break; }
          }
          // Also check proximity to coinDoorExits as a fallback during grace
          // Use either current coinDoorExits or the snapshot from when grace started
          const exitMap = (shift.coinDoorExits && shift.coinDoorExits.size > 0) ? shift.coinDoorExits : shift._prevRoundExits;
          if (!atDoor && shift.firstFinishTime && exitMap && exitMap.size > 0) {
            for (const [k, pos] of exitMap) {
              const dist = Math.abs(cx - pos.x) + Math.abs(cy - pos.y);
              if (dist <= 1) { atDoor = true; break; }
            }
          }
          if (atDoor) {
            // Open coin doors: convert FG id 43 at all border positions to id 136 (open coin door sprite, non-blocking)
            openAllCoinDoors();
            if (!shift.firstFinishTime) {
            // First finisher of the round: start grace for everyone
              shift.firstFinishTime = performance.now();
              shift.graceEnd = shift.firstFinishTime + (shift.graceMs||30000);
              shift.finished = true;
              shift.localFinished = true;
              shift.finishedName = (window.state && window.state.playerName) || 'Player';
              // broadcast grace start to peers (use wall clock for sync)
              try { if (typeof Net !== 'undefined' && Net.id) Net.send({ t: 'shift_grace', finisher: shift.finishedName, graceEndWall: Date.now() + (shift.graceMs||30000) }); } catch(_){ }
              // Competitive: record local finish time and mark finished set
              try {
                if (shift.competitiveMode) {
                  const base = (typeof shift.roundStartWall === 'number' && shift.roundStartWall > 0) ? shift.roundStartWall : (Date.now() - 1);
                  const t = Math.max(1, Date.now() - base);
                  if (!shift.finishTimes) shift.finishTimes = new Map();
                  shift.finishTimes.set('local', t);
                  if (shift.playersFinished) shift.playersFinished.add('local');
                  if (typeof Net !== 'undefined' && Net.id) Net.send({ t: 'comp_finish_time', ms: t });
                }
              } catch(_) {}
              // Teleport finisher immediately to winner staging area
              state.p.x = 51 * TILE; state.p.y = 75 * TILE;
            } else if (!shift.localFinished) {
              // Grace already running; this player also finished within grace window
              shift.localFinished = true;
              try { if (shift.playersFinished) shift.playersFinished.add('local'); } catch(_) {}
              try { if (typeof Net !== 'undefined' && Net.id) Net.send({ t: 'shift_done' }); } catch(_){ }
              // Record finish time relative to round start in competitive mode
              try {
                if (shift.competitiveMode) {
                  const base = (typeof shift.roundStartWall === 'number' && shift.roundStartWall > 0) ? shift.roundStartWall : (Date.now() - 1);
                  const t = Math.max(1, Date.now() - base);
                  if (!shift.finishTimes) shift.finishTimes = new Map();
                  shift.finishTimes.set('local', t);
                  if (typeof Net !== 'undefined' && Net.id) Net.send({ t: 'comp_finish_time', ms: t });
                }
              } catch(_) {}
              state.p.x = 51 * TILE; state.p.y = 75 * TILE;
            } else if (shift.localFinished && shift.firstFinishTime && !shift.spectatorUntilNext) {
              // Already marked as finished but ensure we're at winner staging during grace
              // This handles edge cases where localFinished might be set but player wasn't teleported
              const atStaging = Math.abs(state.p.x - 51 * TILE) < 16 && Math.abs(state.p.y - 75 * TILE) < 16;
              if (!atStaging) {
                state.p.x = 51 * TILE; state.p.y = 75 * TILE;
              }
            }
          }
        }
      }
    }
  }
  const centerDeco = (decoMap[cy] && decoMap[cy][cx]) || 0;
  const centerFg = (fgMap[cy] && fgMap[cy][cx]) || 0;
  // Detect ladder contact anywhere in the player's AABB, not only center
  let touchingLadder = false;
  for (let ty = top; ty <= bottom && !touchingLadder; ty++) {
    for (let tx = left; tx <= right; tx++) {
      if (isLadderAt(tx, ty)) { touchingLadder = true; break; }
    }
  }
  state.onLadder = !!touchingLadder;
  // If coins requirement met and player exits the box
  // Only use outside-box path when coins are required (to avoid false triggers at round start)
  if (shift && shift.roundActive && !shift.spectatorUntilNext && (shift.curCoinReq||0) > 0 && (state.coins|0) >= (shift.curCoinReq||0)) {
    const inside = (cx >= shift.dst.x0 && cx <= shift.dst.x1 && cy >= shift.dst.y0 && cy <= shift.dst.y1);
    if (!inside) {
      openAllCoinDoors();
      if (!shift.firstFinishTime) {
        // First finisher by exiting the box: start grace
        shift.firstFinishTime = performance.now();
        shift.graceEnd = shift.firstFinishTime + (shift.graceMs||30000);
        shift.finished = true;
        shift.localFinished = true;
        shift.finishedName = (window.state && window.state.playerName) || 'Player';
        try { if (typeof Net !== 'undefined' && Net.id) Net.send({ t: 'shift_grace', finisher: shift.finishedName, graceEndWall: Date.now() + (shift.graceMs||30000) }); } catch(_){ }
        // Competitive: record local finish time and mark finished set
        try {
          if (shift.competitiveMode) {
            const base = (typeof shift.roundStartWall === 'number' && shift.roundStartWall > 0) ? shift.roundStartWall : (Date.now() - 1);
            const t = Math.max(1, Date.now() - base);
            if (!shift.finishTimes) shift.finishTimes = new Map();
            shift.finishTimes.set('local', t);
            if (shift.playersFinished) shift.playersFinished.add('local');
            if (typeof Net !== 'undefined' && Net.id) Net.send({ t: 'comp_finish_time', ms: t });
          }
        } catch(_) {}
        state.p.x = 51 * TILE; state.p.y = 75 * TILE;
      } else if (!shift.localFinished) {
        // Grace already running; this player also finished within grace window
        shift.localFinished = true;
        try { if (shift.playersFinished) shift.playersFinished.add('local'); } catch(_) {}
        try { if (typeof Net !== 'undefined' && Net.id) Net.send({ t: 'shift_done' }); } catch(_){ }
        // Record finish time relative to round start in competitive mode
        try {
          if (shift.competitiveMode) {
            const base = (typeof shift.roundStartWall === 'number' && shift.roundStartWall > 0) ? shift.roundStartWall : (Date.now() - 1);
            const t = Math.max(1, Date.now() - base);
            if (!shift.finishTimes) shift.finishTimes = new Map();
            shift.finishTimes.set('local', t);
            if (typeof Net !== 'undefined' && Net.id) Net.send({ t: 'comp_finish_time', ms: t });
          }
        } catch(_) {}
        state.p.x = 51 * TILE; state.p.y = 75 * TILE;
      } else if (shift.localFinished && shift.firstFinishTime && !shift.spectatorUntilNext) {
        // Already marked as finished but ensure we're at winner staging during grace
        const atStaging = Math.abs(state.p.x - 51 * TILE) < 16 && Math.abs(state.p.y - 75 * TILE) < 16;
        if (!atStaging) {
          state.p.x = 51 * TILE; state.p.y = 75 * TILE;
        }
      }
    }
  }
  const isArrow = (id)=>id===1||id===2||id===3||id===1518||id===411||id===412||id===413||id===1519;
  const isSlowDot = (id)=>id===459||id===460;
  const isClassicDot = (id)=>id===4||id===414;
  let idc = 0;
  if (isArrow(centerDeco) || isSlowDot(centerDeco) || isClassicDot(centerDeco)) idc = centerDeco;
  else if (isArrow(centerFg) || isSlowDot(centerFg) || isClassicDot(centerFg)) idc = centerFg;
  state.onNoGravDotCurrent = isClassicDot(idc);
  state.onClimbCurrent = isSlowDot(idc);
  // Maintain a 2-length queue of action tiles per EE: current and delayed
  // Dot stickiness: if current is a dot, keep delayed as previous and repeat current
  const isArrowId = (id)=>id===1||id===2||id===3||id===1518||id===411||id===412||id===413||id===1519;
  const isClassicDotId = (id)=>id===4||id===414;
  if (isClassicDotId(idc)) {
    const delayed = state.actionQueue[1] ?? 0;
    state.actionQueue = [idc, idc];
    state.currentActionId = idc;
    state.delayedActionId = delayed;
  } else {
    const delayed = state.actionQueue.shift() ?? 0;
    state.actionQueue.push(idc);
    state.currentActionId = idc;
    state.delayedActionId = delayed;
  }
  // combine for zero-gravity condition (recomputed from center-based flags)
  state.onClimbDot = (state.onClimbCurrent || state.onNoGravDotCurrent);
  // Ladder handling flag only; movement override applied after applyForces
  if (state.onLadder && !state.godMode) {
    state.onClimbCurrent = true;
  }
  // Arrow stack count along arrow line (both directions from center)
  function arrowDir(id){
    if (id===1||id===411) return {dx:-1,dy:0};
    if (id===2||id===412) return {dx:0,dy:-1};
    if (id===3||id===413) return {dx:1,dy:0};
    if (id===1518||id===1519) return {dx:0,dy:1};
    return null;
  }
  function isSameArrow(id, base){
    const d1 = arrowDir(id); const d2 = arrowDir(base);
    return d1 && d2 && d1.dx===d2.dx && d1.dy===d2.dy;
  }
  let arrowStack = 0;
  if (isArrow(idc)) {
    const dir = arrowDir(idc);
    // count center and forward
    for (let k=0;k<=4;k++) {
      const tx = cx + dir.dx * k;
      const ty = cy + dir.dy * k;
      if (tx<0||ty<0||tx>=WORLD_W||ty>=WORLD_H) break;
      const idHere = (decoMap[ty]&&decoMap[ty][tx]) || (fgMap[ty]&&fgMap[ty][tx]) || 0;
      if (isSameArrow(idHere, idc)) arrowStack++; else break;
    }
    // count backward
    for (let k=-1;k>=-4;k--) {
      const tx = cx + dir.dx * k;
      const ty = cy + dir.dy * k;
      if (tx<0||ty<0||tx>=WORLD_W||ty>=WORLD_H) break;
      const idHere = (decoMap[ty]&&decoMap[ty][tx]) || (fgMap[ty]&&fgMap[ty][tx]) || 0;
      if (isSameArrow(idHere, idc)) arrowStack++; else break;
    }
  }
  state.currentArrowStack = arrowStack;
  // No dwell scaling; keep counters removed for clarity
  state.p.applyForces(inpH, inpV);
  // Ladder post-force correction so gravity cannot pull player down when idle
  if (!state.godMode) {
    if (state.onLadder) {
      const climbSpeed = 1.2;
      const wantUp = (state.input.vPri < 0);
      const wantDown = (state.input.vPri > 0);
      // Cancel gravity while on ladder (already removed in applyForces; keep here for safety)
      state.p._modifierY = 0;
      if (wantUp) {
        state.p._speedY = -climbSpeed;
      } else if (wantDown) {
        state.p._speedY = +climbSpeed;
      } else {
        // No input: smoothly decelerate existing vertical velocity (no instant stop)
        state.p._speedY *= 0.85;
        if (Math.abs(state.p._speedY) < 0.02) state.p._speedY = 0;
      }
      // Slight horizontal damping while on ladder (decelerate if you entered fast)
      state.p._speedX *= 0.9;
    }
  }
  // Apply boosts exactly like EE: based on current center tile only, set speed directly
  if (!state.godMode) {
    const boostIds = new Set([114,115,116,117]);
    let boostTile = 0;
    if (boostIds.has(centerDeco)) boostTile = centerDeco;
    else if (boostIds.has(centerFg)) boostTile = centerFg;
    // Set internal speeds directly like EE: use _boost in internal units
    if (boostTile === 114) { state.p._speedX = -state.p._boost; }
    else if (boostTile === 115) { state.p._speedX = +state.p._boost; }
    else if (boostTile === 116) { state.p._speedY = -state.p._boost; }
    else if (boostTile === 117) { state.p._speedY = +state.p._boost; }
  }
  state.p.stepPosition((x, y) => collidesAt(x, y));
  // no levitation thrust
  // Grounded = collision just beyond the player in gravity direction
  let grounded = false;
  if (Math.abs(state.p.mory) > 0) {
    grounded = collidesAt(state.p.x, state.p.y + Math.sign(state.p.mory) * 1);
  } else if (Math.abs(state.p.morx) > 0) {
    grounded = collidesAt(state.p.x + Math.sign(state.p.morx) * 1, state.p.y);
  }
  const nowT = performance.now();
  if (!state.godMode) {
    const { trigger, mod } = state.p.shouldTriggerJump(state.input.jumpJP, state.p.spaceHeld, nowT);
    if (trigger) state.p.performJump(nowT, grounded, mod);
  } else {
    // in god mode, ignore jump timing
  }
  state.input.jumpJP = false;
  // cache current for next tick's delayed handling
  state.prevOnClimbCurrent = state.onClimbCurrent;
  state.prevOnNoGravDotCurrent = state.onNoGravDotCurrent;
  state.prevActiveFlipGravity = state.activeFlipGravity;
  // EE-style camera tracking: follow player when enabled, else manual
  if (state.trackPlayer) {
    // Center player on screen (simple, stable)
    const targetX = Math.floor((view.cssW / 2) - (state.p.x * view.scale));
    const targetY = Math.floor((view.cssH / 2) - (state.p.y * view.scale));
    const lag = Config.camera_lag;
    view.offX = Math.floor(view.offX + (targetX - view.offX) * lag);
    view.offY = Math.floor(view.offY + (targetY - view.offY) * lag);
  }
}

function isKeyActive(color) {
  // Global timed keys (R/G/B); other colors may use state flags
  const timedOn = (shift && shift.keyTimers && shift.keyTimers[color] && performance.now() < shift.keyTimers[color]);
  if (color === 'red' || color === 'green' || color === 'blue') return !!timedOn;
  return !!state.keys[color] || !!timedOn;
}
window.isKeyActive = isKeyActive;

function triggerKeyTimer(color, durationMs = 5000) {
  if (!shift.keyTimers) shift.keyTimers = {};
  shift.keyTimers[color] = performance.now() + durationMs;
}

function draw() {
  drawWorld();
  drawPlayer();
  try { drawNetPlayers(); } catch(_){}
  updateHud();
}

let last = performance.now();
let fpsLast = performance.now();
let frames = 0;
function loop() {
  const now = performance.now();
  // run fixed-step like EE (10ms); accumulate
  const dt = now - last;
  let acc = dt;
  while (acc >= Config.physics_ms_per_tick) {
    tick();
    applyEdit();
    acc -= Config.physics_ms_per_tick;
  }
  last = now - acc;
  // send network updates
  try { netTick(now); } catch(_){}
  // SHIFT: rotate box every interval for testing
  if (shift.enabled) {
    // Handle start countdown -> teleport to entrance and start the round
    if (shift.pendingStartAt) {
      const nowp = now;
      if (nowp >= shift.pendingStartAt && isAuthoritativeHost()) {
        // Host: start round. Teleport participants only (all on first round; only previous-round finishers otherwise)
        const allowTeleport = !shift.spectatorUntilNext || !!shift._pendingFirstRound;
        
        // Track how many players are starting this round (for competitive mode)
        if (shift.competitiveMode) {
          shift.playersAtRoundStart = shift.playersAlive.size;
        }
        
        if (allowTeleport) {
          // Set round start wall-clock immediately for host so local timing isn't 0
          shift.roundStartWall = Date.now();
          // Reset per-round tracking on host immediately so HUD shows 0/Y
          shift.finishTimes = new Map();
          try { shift.playersFinished = new Set(); } catch(_) {}
          // Use safe entrance spawn; ensure not inside a blocking tile
          const target = getEntranceSpawnFallback();
          state.p.x = target.x * TILE; state.p.y = target.y * TILE;
          if (collidesAt(state.p.x, state.p.y)) {
            const dirs = [ [0,-1], [1,0], [-1,0], [0,1], [1,-1], [-1,-1], [1,1], [-1,1] ];
            let fixed = false;
            for (let step = 1; step <= 4 && !fixed; step++) {
              for (const [dx,dy] of dirs) {
                const nx = state.p.x + dx * TILE * step;
                const ny = state.p.y + dy * TILE * step;
                if (!collidesAt(nx, ny)) { state.p.x = nx; state.p.y = ny; fixed = true; break; }
              }
            }
          }
          shift.roundActive = true;
          state.coins = 0; state.blueCoins = 0;
        }
        shift.pendingStartAt = 0; shift.statusText = '';
        // Broadcast GO with authoritative entrance from host
        try {
          if (typeof Net !== 'undefined' && Net.id) {
            const tpos = getEntranceSpawnFallback();
            // Winners from this round become participants: map 'local' to host id
            let participants = Array.from(shift.playersFinished || []);
            participants = participants.map(pid => pid === 'local' ? Net.id : pid);
            if (!participants.length) {
              // Fallback to everyone alive if winners not tracked
              participants = Array.from(shift.playersAlive || new Set(['local', ...Array.from(netPlayers.keys())])).map(pid => pid === 'local' ? Net.id : pid);
            }
            Net.send({ t: 'shift_place', level: shift.curLevel, box: shift.curBox, spawnX: tpos.x|0, spawnY: tpos.y|0 });
            Net.send({ t: 'shift_go', spawnX: tpos.x|0, spawnY: tpos.y|0, participants });
          }
        } catch(_){ }
        // Clear first-round pending marker after processing
        if (shift) shift._pendingFirstRound = false;
      }
    }
    if (!shift.lastSwap && shift.baseReady) {
      shift.lastSwap = now;
      // Do not auto-start. Only preload DBs; placement happens on Start button.
      loadShiftDBOnce().catch(()=>{});
      shift.roundActive = false; shift.firstFinishTime = 0; shift.finishedName = '';
      shift.playersAlive = new Set();
      shift.playersFinished.clear();
      // Do not forcibly move player here; lobby position is managed elsewhere
    }
    // disable the old 10s rotation demo
    // If grace running and timer expired, advance difficulty (placeholder) and respawn player
    if (shift.firstFinishTime && now >= shift.graceEnd) {
      // At grace end: ALL clients mark non-finishers as eliminated (not just host)
      // This must happen for all clients to ensure proper spectator state
      if (!shift.localFinished && !shift.spectateNextRound) {
        shift.spectateNextRound = true;
        shift.spectatorUntilNext = true;
        // Move to spectator position if not already there
        if (!shift._alreadyMovedToSpectator) {
          state.p.x = 52 * TILE;
          state.p.y = 77 * TILE;
          shift._alreadyMovedToSpectator = true;
        }
        // Show elimination message in competitive mode
        if (shift.competitiveMode && !shift.gameOver) {
          showEliminationMessage();
        }
      }
      
      // Host-only logic for round transition
      if (isAuthoritativeHost()) {
        // Start countdown "next round in 5..1" and teleport winners to start
            if (!shift.nextRoundAt) {
          shift.nextRoundAt = now + shift.nextRoundCountdownMs;
          // Round just ended: backfill coin-door exits immediately at grace end
          const prevExitsEnd = new Map(shift.coinDoorExits || []);
          fillCoinDoorExitsWithBlock16();
          // preserve the snapshot for after placement as well
          shift._prevRoundExits = prevExitsEnd;
              // If no finishers at grace end, end competitively as 'Nobody'
              if (shift.competitiveMode && (shift.playersFinished?.size||0) === 0) {
                shift.gameOver = true;
                shift.gameWinner = 'Nobody';
                shift.statusText = 'Nobody wins - all eliminated!';
                try { if (typeof Net !== 'undefined' && Net.id) Net.send({ t: 'comp_victory', winner: 'Nobody', winnerId: null }); } catch(_) {}
              }
        }
      } else {
        // Non-host clients: just wait for next round placement from host
        if (!shift.nextRoundAt) {
          shift.nextRoundAt = now + shift.nextRoundCountdownMs;
        }
      }
      const remain = Math.max(0, Math.ceil((shift.nextRoundAt - now) / 1000));
      shift.statusText = remain > 0 ? `Next round in ${remain}` : '';
      if (now >= shift.nextRoundAt && isAuthoritativeHost()) {
        // Only host handles the actual round transition
        // At next-round start: verify elimination status
        if (!shift.localFinished) { 
          try { if (shift.playersAlive) shift.playersAlive.delete('local'); } catch(_){ } 
          shift.spectatorUntilNext = true; // ensure eliminated stay spectators
        }
        const willPlayNext = !!shift.localFinished && !shift.spectatorUntilNext;
        
        // Check for winner in competitive mode
        if (shift.competitiveMode && !shift.gameOver) {
          // Participants who started this round (canonical set)
          const participantsSet = (shift.participantsAtRoundStart instanceof Set && shift.participantsAtRoundStart.size)
            ? new Set(shift.participantsAtRoundStart)
            : new Set(['local', ...Array.from(netPlayers.keys())]);
          const participantsCount = participantsSet.size;
          // Build a normalized set of finishers intersected with participants
          const finishers = new Set();
          for (const id of (shift.playersFinished || new Set())) {
            if (participantsSet.has(id)) finishers.add(id);
          }
          const finisherCount = finishers.size;
          const losersCount = Math.max(0, participantsCount - finisherCount);

          // Only declare a winner if exactly 1 participant finished and at least 1 participant did not
          if (finisherCount === 1 && losersCount >= 1) {
            shift.gameOver = true;
            const winnerId = Array.from(finishers)[0];
            const winnerName = winnerId === 'local' ? (state.playerName || 'Player') : 
                               (netPlayers.get(winnerId)?.name || `Player ${winnerId}`);
            shift.gameWinner = winnerName;
            // Broadcast victory to all clients
            try {
              if (typeof Net !== 'undefined' && Net.id) {
                Net.send({ t: 'comp_victory', winner: winnerName, winnerId });
              }
            } catch(_) {}
            // Show victory message locally for both winner and eliminated host
            showVictoryMessage(winnerName);
            shift.nextRoundAt = 0;
            shift.roundActive = false;
            shift.statusText = `${winnerName} wins!`;
            // If local is eliminated on host, move to spectator area
            if (winnerId !== 'local') {
              try { state.p.x = 52 * TILE; state.p.y = 77 * TILE; shift.spectatorUntilNext = true; } catch(_) {}
            }
            // Do not early-return; keep the frame loop alive
          } else if (finisherCount === 0 && participantsCount > 0) {
            // Special case: nobody finished - it's a draw
            shift.gameOver = true;
            shift.gameWinner = 'Nobody';
            shift.statusText = 'Nobody wins - all eliminated!';
            try {
              if (typeof Net !== 'undefined' && Net.id) {
                Net.send({ t: 'comp_victory', winner: 'Nobody', winnerId: null });
              }
            } catch(_) {}
            // Do not early-return; keep the frame loop alive
          }
          // Multiple finishers: continue to next round (no early end)
        }
        // Check if one player remaining
        if (!shift.gameOver && shift.playersAlive.size <= 1) {
          // Single-player: advance difficulty instead of resetting to 1
          shift.curLevel = Math.min(7, shift.curLevel + 1);
          {
            let nb;
            do { nb = Math.floor(Math.random()*12) + 1; } while (nb === shift.curBox);
            shift.curBox = nb;
          }
          // restore any previously cleared outside tiles before placing new box
          try {
            if (shift.clearedOutside && shift.clearedOutside.length) {
              for (const t of shift.clearedOutside) {
                if (fgMap[t.y]) fgMap[t.y][t.x] = t.fg||0;
                if (decoMap[t.y]) decoMap[t.y][t.x] = t.de||0;
              }
              shift.clearedOutside = [];
              tileCache.dirtyAll = true;
            }
          } catch(_){}
          // At placement time, we already backfilled at grace end; avoid double
          if (!shift.gameOver && isAuthoritativeHost()) {
            placeShiftBox(shift.curLevel, shift.curBox);
            // Send placement and immediate start (no countdown for round 2+)
            try { 
              if (typeof Net !== 'undefined' && Net.id) {
                const ent = getEntranceSpawnFallback();
                // Winners only become participants for next round
                let participants = Array.from(shift.playersFinished || []);
                participants = participants.map(pid => pid === 'local' ? Net.id : pid);
                if (!participants.length) participants = [Net.id];
                // Reset per-round tracking on host before sending GO
                shift.roundStartWall = Date.now();
                shift.finishTimes = new Map();
                try { shift.playersFinished = new Set(); } catch(_) {}
                Net.send({ t: 'shift_place', level: shift.curLevel, box: shift.curBox, spawnX: ent.x, spawnY: ent.y });
                // Send immediate go signal for round 2+ (no countdown)
                Net.send({ t: 'shift_go', spawnX: ent.x, spawnY: ent.y, participants });
              }
            } catch(_){ }
          }
          // If a snapshot exists, selectively backfill only those not reused by new box
          if (shift._prevRoundExits) { fillOldCoinDoorExitsExceptCurrent(shift._prevRoundExits); shift._prevRoundExits = null; }
          const ent = getEntranceSpawnFallback();
          if (!shift.gameOver && willPlayNext) {
            state.p.x = ent.x * TILE; state.p.y = ent.y * TILE;
            state.coins = 0; state.blueCoins = 0;
            shift.roundActive = true;
            shift.playersAlive = new Set(['local']);
          } else {
            // Ensure non-finishers remain spectators
            shift.spectatorUntilNext = true;
          }
          shift.playersFinished.clear();
          shift.firstFinishTime = 0; shift.finished = false; shift.finishedName = '';
          shift.graceEnd = 0; shift.nextRoundAt = 0; shift.statusText = '';
          shift.lastSwap = now;
          // Reset localFinished for the new round (but keep spectator flags for eliminated players)
          shift.localFinished = false;
          // Reset the movement flag for the next round (but eliminated players stay eliminated)
          shift._alreadyMovedToSpectator = false;
        } else if (!shift.gameOver) {
          // Advance to next level; randomly pick a box 1..12, place new box, then teleport
          shift.curLevel = Math.min(7, shift.curLevel + 1);
          {
            let nb2;
            do { nb2 = Math.floor(Math.random()*12) + 1; } while (nb2 === shift.curBox);
            shift.curBox = nb2;
          }
          // restore any previously cleared outside tiles before placing new box
          try {
            if (shift.clearedOutside && shift.clearedOutside.length) {
              for (const t of shift.clearedOutside) {
                if (fgMap[t.y]) fgMap[t.y][t.x] = t.fg||0;
                if (decoMap[t.y]) decoMap[t.y][t.x] = t.de||0;
              }
              shift.clearedOutside = [];
              tileCache.dirtyAll = true;
            }
          } catch(_){}
          // At placement time, we already backfilled at grace end; avoid double
          if (!shift.gameOver && isAuthoritativeHost()) {
            placeShiftBox(shift.curLevel, shift.curBox);
            // Send placement and immediate start (no countdown for round 2+)
            try { 
              if (typeof Net !== 'undefined' && Net.id) {
                const ent = getEntranceSpawnFallback();
                let participants = Array.from(shift.playersFinished || []);
                participants = participants.map(pid => pid === 'local' ? Net.id : pid);
                if (!participants.length) participants = [Net.id];
                // Reset per-round tracking on host before sending GO
                shift.roundStartWall = Date.now();
                shift.finishTimes = new Map();
                try { shift.playersFinished = new Set(); } catch(_) {}
                Net.send({ t: 'shift_place', level: shift.curLevel, box: shift.curBox, spawnX: ent.x, spawnY: ent.y });
                // Send immediate go signal for round 2+ (no countdown)
                Net.send({ t: 'shift_go', spawnX: ent.x, spawnY: ent.y, participants });
              }
            } catch(_){ }
          }
          if (shift._prevRoundExits) { fillOldCoinDoorExitsExceptCurrent(shift._prevRoundExits); shift._prevRoundExits = null; }
          const ent2 = getEntranceSpawnFallback();
          if (!shift.gameOver && willPlayNext) {
            state.p.x = ent2.x * TILE; state.p.y = ent2.y * TILE;
            state.coins = 0; state.blueCoins = 0;
            shift.roundActive = true;
          } else {
            shift.spectatorUntilNext = true;
          }
          // Reset round flags
          shift.firstFinishTime = 0; shift.finished = false; shift.finishedName = '';
          shift.graceEnd = 0; shift.nextRoundAt = 0; shift.statusText = '';
          shift.lastSwap = now;
          // Reset localFinished for the new round (but keep spectator flags for eliminated players)
          shift.localFinished = false;
          // Reset the movement flag for the next round (but eliminated players stay eliminated)
          shift._alreadyMovedToSpectator = false;
        }
        // New round: keep eliminated players spectating until a new Start Game is pressed
        // Winners will have localFinished cleared on shift_start for the next game
          }
        }
      } else if (now >= shift.nextRoundAt && !isAuthoritativeHost()) {
        // Non-host clients: mirror victory display locally if host packet is delayed/missed
        if (shift.competitiveMode && !shift.gameOver) {
          const finisherCount = shift.playersFinished ? shift.playersFinished.size : 0;
          const playersWhoStartedRound = shift.playersAtRoundStart || 0;
          if (finisherCount === 1 && playersWhoStartedRound > 1) {
            const winnerId = Array.from(shift.playersFinished)[0];
            const winnerName = winnerId === 'local' ? (state.playerName || 'Player') : (netPlayers.get(winnerId)?.name || `Player ${winnerId}`);
            // Avoid double-processing if comp_victory will arrive shortly; still, ensure we do not freeze UI
            if (!shift.gameOver) {
              showVictoryMessage(winnerName);
              shift.statusText = `${winnerName} wins!`;
              shift.gameOver = true;
              // Fully stop transitions
              shift.firstFinishTime = 0;
              shift.graceEnd = 0;
              shift.pendingStartAt = 0;
              shift.nextRoundAt = 0;
              shift.roundActive = false;
              // Teleport eliminated (non-winner) to spectator
              if (winnerId !== 'local') {
                state.p.x = 52 * TILE; state.p.y = 77 * TILE;
                shift.spectatorUntilNext = true;
              }
            }
          }
        }
  }
  // Smooth zoom step (avoid using now-last; use a fixed interpolation for stability)
  if (view.zoomActive) {
    // interpolate smoothly toward targetScale
    const lerp = (a,b,t)=>a+(b-a)*t;
    const t = 0.25; // constant smoothing factor for predictable CPU cost
    const oldScale = view.scale;
    const newScale = lerp(oldScale, view.targetScale, t);
    if (Math.abs(newScale - oldScale) < 0.001) {
      view.scale = view.targetScale;
      view.zoomActive = false;
    } else {
      view.scale = newScale;
    }
    // Keep anchor world point under cursor
    view.offX = Math.floor(view.anchorSx - view.anchorWx * view.scale);
    view.offY = Math.floor(view.anchorSy - view.anchorWy * view.scale);
    clampViewToBounds();
  }
  draw();
  // FPS stats: sample over 500ms to reduce overhead
  frames++;
  const ft = now - fpsLast;
  if (ft >= 500) {
    const fps = (frames / ft) * 1000;
    state.stats = { fps, frameMs: dt };
    fpsLast = now;
    frames = 0;
  }
  requestAnimationFrame(loop);
}

function screenToWorld(sx, sy) {
  return {
    x: (sx - view.offX) / view.scale,
    y: (sy - view.offY) / view.scale,
  };
}

// Input
function isTypingTarget(e) {
  try {
    const el = e && e.target;
    if (!el) return false;
    const tag = (el.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
    if (el.isContentEditable) return true;
    if (typeof el.closest === 'function' && el.closest('[contenteditable="true"], input, textarea')) return true;
  } catch(_) {}
  return false;
}
function preventIfHandled(e) {
  if (isTypingTarget(e)) return; // allow typing into inputs/fields
  const k = e.key;
  const code = e.code;
  const handledKey = k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown' ||
                     k === 'a' || k === 'A' || k === 'd' || k === 'D' || k === 'w' || k === 'W' || k === 's' || k === 'S' ||
                     k === ' ';
  const handledCode = (KEYMAP.left && KEYMAP.left.includes(code)) ||
                      (KEYMAP.right && KEYMAP.right.includes(code)) ||
                      (KEYMAP.up && KEYMAP.up.includes(code)) ||
                      (KEYMAP.down && KEYMAP.down.includes(code)) ||
                      (KEYMAP.jump && KEYMAP.jump.includes(code));
  if (handledKey || handledCode) e.preventDefault();
}
// Track multiple physical keys per logical input to avoid ghosting drop-offs
const KEYMAP = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  // Jump bound to Space only (per request)
  jump: ['Space']
};
const pressedCodes = new Set();
addEventListener('keydown', (e) => {
  if (isTypingTarget(e)) return;
  preventIfHandled(e);
  if (e.repeat) return;
  pressedCodes.add(e.code);
  if (KEYMAP.left.includes(e.code) || e.key === 'a' || e.key === 'A') { state.input.left = true; state.input.hPri = -1; }
  if (KEYMAP.right.includes(e.code) || e.key === 'd' || e.key === 'D') { state.input.right = true; state.input.hPri = 1; }
  if (KEYMAP.up.includes(e.code) || e.key === 'w' || e.key === 'W') { state.input.up = true; state.input.vPri = -1; }
  if (KEYMAP.down.includes(e.code) || e.key === 's' || e.key === 'S') { state.input.down = true; state.input.vPri = 1; }
  if (KEYMAP.jump.includes(e.code)) {
    const wasHeld = state.input.jump;
    state.input.jump = true;
    // Generate a just-pressed pulse even if other keys are held
    if (!wasHeld) state.input.jumpJP = true;
    state.p.spaceHeld = true;
  }

  // Disable flip gravity keys
  if (e.key === 'q' || e.key === 'Q' || e.key === 'e' || e.key === 'E') { e.preventDefault(); return; }
  if (e.key === 'r' || e.key === 'R') { state.p.x = 64; state.p.y = 32; state.p._speedX = state.p._speedY = 0; state.p.jumpCount = 0; }
  // Disable low-gravity toggle and god/edit mode toggle
  if (e.key === 'l' || e.key === 'L' || e.key === 'g' || e.key === 'G') { e.preventDefault(); return; }
  // Disable multi-jump adjustments
  if (e.key === '[' || e.key === ']') { e.preventDefault(); return; }
  if (e.key >= '1' && e.key <= '9') state.faceIndex = (parseInt(e.key, 10) - 1);
  // Timed key toggles (simulate EE key effects): R/G/B/C/M/Y open for 5 seconds
  const keyMap = { 'r': 'red', 'g': 'green', 'b': 'blue', 'c': 'cyan', 'm': 'magenta', 'y': 'yellow', 'R': 'red', 'G': 'green', 'B': 'blue', 'C': 'cyan', 'M': 'magenta', 'Y': 'yellow' };
  if (keyMap[e.key]) {
    const color = keyMap[e.key];
    const now = performance.now();
    const duration = 5000; // ms open time
    shift.keyTimers[color] = now + duration;
  }
});
addEventListener('keyup', (e) => {
  preventIfHandled(e);
  pressedCodes.delete(e.code);
  if (KEYMAP.left.includes(e.code) || e.key === 'a' || e.key === 'A') {
    state.input.left = KEYMAP.left.some(c => pressedCodes.has(c));
    if (state.input.hPri === -1 && !state.input.left) state.input.hPri = state.input.right ? 1 : 0;
  }
  if (KEYMAP.right.includes(e.code) || e.key === 'd' || e.key === 'D') {
    state.input.right = KEYMAP.right.some(c => pressedCodes.has(c));
    if (state.input.hPri === 1 && !state.input.right) state.input.hPri = state.input.left ? -1 : 0;
  }
  if (KEYMAP.up.includes(e.code) || e.key === 'w' || e.key === 'W') {
    state.input.up = KEYMAP.up.some(c => pressedCodes.has(c));
    if (state.input.vPri === -1 && !state.input.up) state.input.vPri = state.input.down ? 1 : 0;
  }
  if (KEYMAP.down.includes(e.code) || e.key === 's' || e.key === 'S') {
    state.input.down = KEYMAP.down.some(c => pressedCodes.has(c));
    if (state.input.vPri === 1 && !state.input.down) state.input.vPri = state.input.up ? -1 : 0;
  }
  if (KEYMAP.jump.includes(e.code)) {
    state.input.jump = KEYMAP.jump.some(c => pressedCodes.has(c));
    state.p.spaceHeld = state.input.jump;
  }
  if (e.key === 'i' || e.key === 'I') {
    // Inspect mouse cursor tile coords and IDs and also map to DB-space box coords
    const tx = (mouse && mouse.tile) ? mouse.tile.x : Math.floor((state.p.x + 8) / TILE);
    const ty = (mouse && mouse.tile) ? mouse.tile.y : Math.floor((state.p.y + 8) / TILE);
    const idBg = (bgMap[ty] && bgMap[ty][tx]) || 0;
    const idDe = (decoMap[ty] && decoMap[ty][tx]) || 0;
    const idFg = (fgMap[ty] && fgMap[ty][tx]) || 0;
    const inBox = (tx >= shift.dst.x0 && tx <= shift.dst.x1 && ty >= shift.dst.y0 && ty <= shift.dst.y1);
    let boxRel = null;
    if (inBox) {
      const relX = (tx - shift.dst.x0) + 1; // 1-based
      const relY = (ty - shift.dst.y0) + 1;
      boxRel = { relX, relY };
    }
    state.inspectInfo = { x: tx, y: ty, bg: idBg, deco: idDe, fg: idFg, boxRel };
    if (boxRel) {
      console.log(`Box-relative: (${boxRel.relX}, ${boxRel.relY})`);
    }
  }
});
function clearInputs() {
  state.input.left = state.input.right = state.input.up = state.input.down = false;
  state.input.jump = state.input.jumpJP = false;
  state.input.hPri = 0; state.input.vPri = 0;
  state.p.spaceHeld = false;
}
addEventListener('blur', clearInputs);
addEventListener('visibilitychange', () => { if (document.hidden) clearInputs(); });

// Fullscreen toggle via badge
const fsBadge = document.getElementById('fsBadge');
if (fsBadge) {
  fsBadge.addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
      resizeCanvas();
    } catch (e) { /* ignore */ }
  });
}

// left-tools: reset view button
const resetBtn = document.getElementById('resetView');
if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    // Default view: fit world and center
    view.scale = view.baseFit;
    view.targetScale = view.baseFit;
    view.offX = Math.floor((view.cssW - WORLD_W * TILE * view.scale) / 2);
    view.offY = Math.floor((view.cssH - WORLD_H * TILE * view.scale) / 2);
  });
}

// Start game button
const startBtn = document.getElementById('startGame');
if (startBtn) {
  startBtn.addEventListener('click', async () => {
    try {
        // Only the authoritative host can start the game; ignore clicks from others to avoid local desync
        if (!isAuthoritativeHost()) { shift.statusText = 'Only the host can start the game'; return; }
      if (shift._startingClickLock) return;
      shift._startingClickLock = true;
      setTimeout(() => { try { shift._startingClickLock = false; } catch(_){} }, 500);
      // Ensure DBs are loaded
      await loadShiftDBOnce();
      // Refill any coin-door exit spaces with solid block 16
      
      // Disable competitive mode for regular games
      shift.competitiveMode = false;
      shift.gameOver = false;
      shift.gameWinner = null;
      
      // Prepare round at level 1 with random box but do not teleport yet
      shift.curLevel = 1;
      {
        let nb3;
        do { nb3 = Math.floor(Math.random()*12) + 1; } while (nb3 === shift.curBox);
        shift.curBox = nb3;
      }
      placeShiftBox(shift.curLevel, shift.curBox);
      // Countdown start (5s). Broadcast using wall-clock to avoid drift.
      const startAtWall = Date.now() + (shift.startCountdownMs||5000);
      shift.pendingStartAt = performance.now() + (shift.startCountdownMs||5000);
        // Starting a game means server is not idle
        shift._serverIdle = false;
      // Round 1: ensure local flags are cleared immediately (server won't echo our own start)
      shift.spectatorUntilNext = false;
      shift.spectateNextRound = false;
      shift.localFinished = false;
      shift._pendingFirstRound = true;
      shift._alreadyMovedToSpectator = false; // Reset spectator movement flag for new game
      // Move host to spectator spawn immediately for countdown
      state.p.x = 52 * TILE; state.p.y = 77 * TILE;
      // announce placement and countdown start to peers (host-first, wall clock)
      try {
        if (typeof Net !== 'undefined' && Net.id) {
          Net.send({ t: 'shift_place', level: shift.curLevel, box: shift.curBox });
          Net.send({ t: 'shift_start', level: shift.curLevel, box: shift.curBox, startAtWall, firstRound: true });
          if (shift._goTimeoutId) { try { clearTimeout(shift._goTimeoutId); } catch(_){} }
          shift._goTimeoutId = setTimeout(() => { try { Net.send({ t: 'shift_go' }); } catch(_){} }, (shift.startCountdownMs||5000));
        }
      } catch(_){ }
      shift.statusText = 'Starting in 5';
      shift.roundActive = false; shift.firstFinishTime = 0; shift.finishedName = '';
      shift.playersAlive = new Set(['local']);
      shift.playersFinished.clear();
      state.coins = 0; state.blueCoins = 0;
      // Stay at spectator spawn during countdown (redundant, in case of race)
      state.p.x = 52 * TILE; state.p.y = 77 * TILE;
    } catch (_) {}
  });
}
// Save map / Clear local map buttons
// Start competitive game button
const startCompBtn = document.getElementById('startCompGame');
if (startCompBtn) {
  startCompBtn.addEventListener('click', async () => {
    try {
      // Only the authoritative host can start the game
      if (!isAuthoritativeHost()) { 
        shift.statusText = 'Only the host can start competitive games'; 
        return; 
      }
      if (shift._startingClickLock) return;
      shift._startingClickLock = true;
      setTimeout(() => { try { shift._startingClickLock = false; } catch(_){} }, 500);
      
      // Ensure DBs are loaded
      await loadShiftDBOnce();
      
      // Enable competitive mode
      shift.competitiveMode = true;
      shift.gameOver = false;
      shift.gameWinner = null;
      shift.playersAtRoundStart = 0;
      
      // Prepare round at level 1 with random box but do not teleport yet
      shift.curLevel = 1;
      {
        let nb3;
        do { nb3 = Math.floor(Math.random()*12) + 1; } while (nb3 === shift.curBox);
        shift.curBox = nb3;
      }
      placeShiftBox(shift.curLevel, shift.curBox);
      
      // Countdown start (5s). Broadcast using wall-clock to avoid drift.
      const startAtWall = Date.now() + (shift.startCountdownMs||5000);
      shift.pendingStartAt = performance.now() + (shift.startCountdownMs||5000);
      
      // Starting a game means server is not idle
      shift._serverIdle = false;
      
      // Round 1: ensure local flags are cleared immediately
      shift.spectatorUntilNext = false;
      shift.spectateNextRound = false;
      shift.localFinished = false;
      shift._pendingFirstRound = true;
      shift._alreadyMovedToSpectator = false;
      
      // Move host to spectator spawn immediately for countdown
      state.p.x = 52 * TILE; state.p.y = 77 * TILE;
      
      // Announce competitive game start to peers
      try {
        if (typeof Net !== 'undefined' && Net.id) {
          Net.send({ t: 'comp_start' }); // Notify competitive mode
          Net.send({ t: 'shift_place', level: shift.curLevel, box: shift.curBox });
          Net.send({ t: 'shift_start', level: shift.curLevel, box: shift.curBox, startAtWall, firstRound: true });
          if (shift._goTimeoutId) { try { clearTimeout(shift._goTimeoutId); } catch(_){} }
          shift._goTimeoutId = setTimeout(() => { try { Net.send({ t: 'shift_go' }); } catch(_){} }, (shift.startCountdownMs||5000));
        }
      } catch(_){ }
      
      shift.statusText = 'COMPETITIVE: Starting in 5';
      shift.roundActive = false; shift.firstFinishTime = 0; shift.finishedName = '';
      // Include all connected players for competitive mode
      shift.playersAlive = new Set(['local', ...Array.from(netPlayers.keys())]);
      shift.playersFinished.clear();
      state.coins = 0; state.blueCoins = 0;
      
      // Stay at spectator spawn during countdown
      state.p.x = 52 * TILE; state.p.y = 77 * TILE;
    } catch (_) {}
  });
}

const saveMapBtn = document.getElementById('saveMap');
if (saveMapBtn) { saveMapBtn.style.display = 'none'; saveMapBtn.disabled = true; }
const clearMapBtn = document.getElementById('clearLocalMap');
if (clearMapBtn) { clearMapBtn.style.display = 'none'; clearMapBtn.disabled = true; }
const exportBtn = document.getElementById('exportEELVL');
if (exportBtn) { exportBtn.style.display = 'none'; exportBtn.disabled = true; }

// Mouse for editing
const mouse = { x: 0, y: 0, tile: null, down: false, pan: false, panStartX: 0, panStartY: 0, offStartX: 0, offStartY: 0, strokeKeys: new Set(), strokeMode: 'place', strokeBrush: null, strokeLayer: 'auto' };
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = e.clientX - rect.left;
  mouse.y = e.clientY - rect.top;
  // compute tile in world space
  const wm = screenToWorld(mouse.x, mouse.y);
  mouse.tile = { x: Math.floor(wm.x / TILE), y: Math.floor(wm.y / TILE) };
  if (mouse.pan) {
    const dx = mouse.x - mouse.panStartX;
    const dy = mouse.y - mouse.panStartY;
    view.offX = mouse.offStartX + dx;
    view.offY = mouse.offStartY + dy;
  }
});
canvas.addEventListener('mousedown', (e) => {
  // Play mode: mouse no longer triggers jump (Space only)
  if (e.shiftKey) {
    mouse.pan = true;
    mouse.panStartX = mouse.x;
    mouse.panStartY = mouse.y;
    mouse.offStartX = view.offX;
    mouse.offStartY = view.offY;
    return;
  }
  mouse.down = true;
  // start a new stroke for painting; decide mode once based on starting tile
  mouse.strokeKeys = new Set();
  const wm = screenToWorld(mouse.x, mouse.y);
  const tx = Math.floor(wm.x / TILE);
  const ty = Math.floor(wm.y / TILE);
  const brush = window.currentBrushId || 9;
  const forced = (window.layerSelect && window.layerSelect.value) || 'auto';
  mouse.strokeBrush = brush;
  mouse.strokeLayer = forced;
  // Decide remove vs place once per stroke to avoid flicker
  let willRemove = false;
  if (!state.canEdit) return; // guard if edit disabled
  if (forced === 'foreground') {
    willRemove = (fgMap[ty] && fgMap[ty][tx]) === brush;
  } else if (forced === 'background') {
    willRemove = (bgMap[ty] && bgMap[ty][tx]) === brush;
  } else if (forced === 'auto') {
    willRemove = ((fgMap[ty] && fgMap[ty][tx]) === brush) || ((decoMap[ty] && decoMap[ty][tx]) === brush) || ((bgMap[ty] && bgMap[ty][tx]) === brush);
  } else {
    // decorative
    willRemove = (decoMap[ty] && decoMap[ty][tx]) === brush;
  }
  mouse.strokeMode = willRemove ? 'remove' : 'place';
  // Apply immediately on mousedown
  applyEdit();
});
addEventListener('mouseup', () => {
  // Release jump when using mouse in play mode
  if (!state.canEdit) { state.input.jump = false; state.p.spaceHeld = false; }
  mouse.down = false; mouse.strokeKeys = new Set();
});
addEventListener('mouseup', () => { mouse.pan = false; });
canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); });

// Zoom with wheel (integer scale), anchor at cursor
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = Math.sign(e.deltaY);
  const rect = canvas.getBoundingClientRect();
  const anchorX = e.clientX - rect.left;
  const anchorY = e.clientY - rect.top;
  // Use smooth factor per wheel step
  const factor = delta > 0 ? 0.9 : 1.1;
  const next = view.scale * factor;
  setScale(next, anchorX, anchorY);
}, { passive: false });

function applyEdit() {
  if (!state.canEdit || !mouse.down) return;
  const wm = screenToWorld(mouse.x, mouse.y);
  const tx = Math.floor(wm.x / TILE);
  const ty = Math.floor(wm.y / TILE);
  // Guard: ignore edits outside world bounds to avoid runtime errors
  if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return;
  const key = `${tx},${ty}`;
  if (mouse.strokeKeys.has(key)) return; // already processed this tile in current stroke
  mouse.strokeKeys.add(key);
  const brush = mouse.strokeBrush || (window.currentBrushId || 9);
  const forced = mouse.strokeLayer || ((window.layerSelect && window.layerSelect.value) || 'auto');
  if (mouse.strokeMode === 'remove') {
    if (forced === 'foreground') {
      if (fgMap[ty]) { fgMap[ty][tx] = 0; if (typeof window.markDirtyTile === 'function') window.markDirtyTile(tx, ty); try { if (typeof Net!=='undefined'&&Net.id) Net.send({ t:'edit', layer:'fg', x:tx, y:ty, id:0 }); } catch(_){} }
    } else if (forced === 'background') {
      if (bgMap[ty]) { bgMap[ty][tx] = 0; if (typeof window.markDirtyTile === 'function') window.markDirtyTile(tx, ty); try { if (typeof Net!=='undefined'&&Net.id) Net.send({ t:'edit', layer:'bg', x:tx, y:ty, id:0 }); } catch(_){} }
    } else if (forced === 'auto') {
      let changed = false;
      if (fgMap[ty] && fgMap[ty][tx] === brush) { fgMap[ty][tx] = 0; try { if (typeof Net!=='undefined'&&Net.id) Net.send({ t:'edit', layer:'fg', x:tx, y:ty, id:0 }); } catch(_){} changed = true; }
      if (decoMap[ty] && decoMap[ty][tx] === brush) { decoMap[ty][tx] = 0; try { if (typeof Net!=='undefined'&&Net.id) Net.send({ t:'edit', layer:'de', x:tx, y:ty, id:0 }); } catch(_){} changed = true; }
      if (bgMap[ty] && bgMap[ty][tx] === brush) { bgMap[ty][tx] = 0; try { if (typeof Net!=='undefined'&&Net.id) Net.send({ t:'edit', layer:'bg', x:tx, y:ty, id:0 }); } catch(_){} changed = true; }
      if (changed && typeof window.markDirtyTile === 'function') window.markDirtyTile(tx, ty);
    } else {
      if (decoMap[ty]) { decoMap[ty][tx] = 0; if (typeof window.markDirtyTile === 'function') window.markDirtyTile(tx, ty); try { if (typeof Net!=='undefined'&&Net.id) Net.send({ t:'edit', layer:'de', x:tx, y:ty, id:0 }); } catch(_){} }
    }
    return;
  }
  // place
  if (forced === 'foreground' || (forced === 'auto' && isSolidStaticId(brush))) {
    if (fgMap[ty]) { fgMap[ty][tx] = brush; if (typeof window.markDirtyTile === 'function') window.markDirtyTile(tx, ty); try { if (typeof Net!=='undefined'&&Net.id) Net.send({ t:'edit', layer:'fg', x:tx, y:ty, id:brush }); } catch(_){} }
  } else if (forced === 'background') {
    if (bgMap[ty]) { bgMap[ty][tx] = brush; if (typeof window.markDirtyTile === 'function') window.markDirtyTile(tx, ty); try { if (typeof Net!=='undefined'&&Net.id) Net.send({ t:'edit', layer:'bg', x:tx, y:ty, id:brush }); } catch(_){} }
  } else {
    if (decoMap[ty]) { decoMap[ty][tx] = brush; if (typeof window.markDirtyTile === 'function') window.markDirtyTile(tx, ty); try { if (typeof Net!=='undefined'&&Net.id) Net.send({ t:'edit', layer:'de', x:tx, y:ty, id:brush }); } catch(_){} }
  }
}

// initialize loop immediately (position set during world load)
loop();


