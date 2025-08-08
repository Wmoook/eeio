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
    }
    this.morx = morx; this.mory = mory;
    this.mox = mox; this.moy = moy;

    // input mapping per Player.tick: restrict input to axis not aligned with delayed gravity (skip in god or on dots)
    let inH = inputH;
    let inV = inputV;
    const zeroGrav = (state.onClimbDot || state.onClimbDelayed || state.onNoGravDotCurrent || state.onNoGravDotDelayed);
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
    // Slow/climb dot should slow movement; classic dot should NOT slow
    if (state.onClimbCurrent || state.onClimbDelayed) sm *= 0.6; // closer to EE ladders feel
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
    // Re-implement sub-tile stepping preserving EE’s per-unit collision stepping order
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
// Dynamic tile index for fast overlay (coins, above-layer)
const dynamicIndex = { coins: new Set(), above: new Set() };
function keyXY(x,y){ return `${x},${y}`; }
function isCoinId(id){ return id===100||id===101||id===110||id===111; }
function isAboveId(id){ return !!(window.EE_AboveIds && window.EE_AboveIds.has(id)); }
function updateDynamicAtXY(x,y){
  const idBg = (bgMap[y] && bgMap[y][x]) || 0;
  const idDe = (decoMap[y] && decoMap[y][x]) || 0;
  const idFg = (fgMap[y] && fgMap[y][x]) || 0;
  const hasCoin = isCoinId(idBg) || isCoinId(idDe) || isCoinId(idFg);
  const hasAbove = isAboveId(idBg) || isAboveId(idDe) || isAboveId(idFg);
  const k = keyXY(x,y);
  if (hasCoin) dynamicIndex.coins.add(k); else dynamicIndex.coins.delete(k);
  if (hasAbove) dynamicIndex.above.add(k); else dynamicIndex.above.delete(k);
}
function rebuildDynamicIndex(){
  dynamicIndex.coins.clear(); dynamicIndex.above.clear();
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
      if (isBlockingAt(x, y)) return true;
    }
  }
  return false;
}

// Dynamic blocking check: foreground solids, and doors/gates depending on key state
function isBlockingAt(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return true;
  const fg = (fgMap[ty] && fgMap[ty][tx]) || 0;
  if (fg && isSolidStaticId(fg)) return true;
  // Background never blocks
  // const bg = (bgMap[ty] && bgMap[ty][tx]) || 0; // intentionally ignored for blocking
  const decoId = (decoMap[ty] && decoMap[ty][tx]) || 0;
  // Doors (solid unless key active)
  const doorState = getDoorGateBlocking(decoId);
  if (doorState) return true;
  return false;
}

function getDoorGateBlocking(id) {
  // Returns true if this decoration id should block the player
  // Red/Green/Blue
  if (id === 23) return !isKeyActive('red'); // door red blocks when key inactive
  if (id === 24) return !isKeyActive('green');
  if (id === 25) return !isKeyActive('blue');
  if (id === 26) return isKeyActive('red'); // gate blocks when key active
  if (id === 27) return isKeyActive('green');
  if (id === 28) return isKeyActive('blue');
  // Cyan/Magenta/Yellow
  if (id === 1005) return !isKeyActive('cyan');
  if (id === 1006) return !isKeyActive('magenta');
  if (id === 1007) return !isKeyActive('yellow');
  if (id === 1008) return isKeyActive('cyan');
  if (id === 1009) return isKeyActive('magenta');
  if (id === 1010) return isKeyActive('yellow');
  return false;
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
        if (!(layer === 0 || layer === 1) || (xLen % 2 !== 0) || xsEnd + 4 > end) { i++; continue; }
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
    WORLD_W = Math.max(3, w);
    WORLD_H = Math.max(3, h);
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
        // basic sanity: layer 0/1, xLen even and not huge
        if ((layer === 0 || layer === 1) && xLen % 2 === 0 && xLen < 1e7) {
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
        if (!(layer === 0 || layer === 1) || (xLen % 2 !== 0) || xsEnd + 4 > end) { i++; continue; }
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
// Load the provided world file. Spaces in path are URL encoded automatically when serving locally.
fetch('./EX%20Crew%20Shift%20%5BTest%5D.eelvl').then(r => r.arrayBuffer()).then(buf => {
  levelData = new Uint8Array(buf);
  tryLoadLevelFromEELVL(levelData);
}).catch(()=>{ /* fallback to default world */ });

// SHIFT: DB loader and box rotator
let shift = {
  enabled: true,
  dbBytes: null,
  boxW: 32,
  boxH: 27,
  dst: { x0: 36, y0: 48, x1: 67, y1: 74 },
  curBox: 1,
  curLevel: 1,
  lastSwap: 0,
  intervalMs: 10000,
  swapping: false,
};

function copyShiftRegionToWorld(srcFg, srcBg, srcDeco, srcX0, srcY0, dstX0, dstY0, w, h) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const sx = srcX0 + dx;
      const sy = srcY0 + dy;
      const dxw = dstX0 + dx;
      const dyw = dstY0 + dy;
      const fid = (srcFg[sy] && srcFg[sy][sx]) || 0;
      const bid = (srcBg[sy] && srcBg[sy][sx]) || 0;
      const did = (srcDeco[sy] && srcDeco[sy][sx]) || 0;
      setTileBg(dxw, dyw, bid|0);
      setTileDeco(dxw, dyw, did|0);
      setTileFg(dxw, dyw, fid|0);
    }
  }
}

async function loadShiftDBOnce() {
  if (shift.dbBytes && shift.dbMaps) return;
  try {
    const url = './EX%20Shift%20DB1%20-nou%281%29.eelvl';
    const buf = await fetch(url).then(r => r.arrayBuffer());
    shift.dbBytes = new Uint8Array(buf);
    // Parse DB once into temporary world, snapshot maps, then restore current world
    const saved = { fg: fgMap, bg: bgMap, deco: decoMap, W: WORLD_W, H: WORLD_H, solid: new Set(solid) };
    tryLoadLevelFromEELVL(shift.dbBytes);
    const dbFg = new Array(WORLD_H);
    const dbBg = new Array(WORLD_H);
    const dbDe = new Array(WORLD_H);
    for (let y = 0; y < WORLD_H; y++) {
      dbFg[y] = (fgMap[y] ? fgMap[y].slice() : []);
      dbBg[y] = (bgMap[y] ? bgMap[y].slice() : []);
      dbDe[y] = (decoMap[y] ? decoMap[y].slice() : []);
    }
    shift.dbMaps = { fg: dbFg, bg: dbBg, deco: dbDe, W: WORLD_W, H: WORLD_H };
    // Restore saved world
    fgMap = saved.fg; bgMap = saved.bg; decoMap = saved.deco; WORLD_W = saved.W; WORLD_H = saved.H;
    solid.clear(); saved.solid.forEach(v => solid.add(v));
    window.fgMap = fgMap; window.bgMap = bgMap; window.decoMap = decoMap;
    tileCache.dirtyAll = true;
  } catch (e) {
    shift.enabled = false;
  }
}

function placeShiftBox(levelIndex, boxIndex) {
  if (!shift.dbMaps) return;
  const srcFg = shift.dbMaps.fg, srcBg = shift.dbMaps.bg, srcDeco = shift.dbMaps.deco;
  // Compute source rect (1-based in spec). Convert to 0-based indices
  const w = shift.boxW, h = shift.boxH;
  const sx0 = (boxIndex - 1) * w; // zero-based
  const sy0 = (levelIndex - 1) * h; // zero-based
  // Copy region into destination box
  copyShiftRegionToWorld(srcFg, srcBg, srcDeco, sx0, sy0, shift.dst.x0, shift.dst.y0, w, h);
  // Mark cache dirty
  tileCache.dirtyAll = true;
  rebuildDynamicIndex();
}

const state = {
  p: new PlayerPhysics(),
  input: { left: false, right: false, up: false, down: false, jump: false, jumpJP: false, hPri: 0, vPri: 0 },
  faceIndex: 0, // frame index (26px step in EE, we’ll draw 26x26 as in Player.rect2)
  goldBorder: false,
  godMode: false,
  canEdit: true,
  autoTrack: false,
  trackPlayer: false,
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
    // Iterate coins then above; sets are typically sparse
    for (const k of dynamicIndex.coins) drawIfVisible(k);
    for (const k of dynamicIndex.above) drawIfVisible(k);
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
  } else {
    ctx.fillStyle = '#ff0';
    ctx.fillRect(state.p.x, state.p.y, 16, 16);
  }
}

function updateHud() {
  const dirEl = document.getElementById('gdir');
  dirEl.textContent = ['down', 'left', 'up', 'right'][state.p.flipGravity];
  const jEl = document.getElementById('jinfo');
  jEl.textContent = `${state.p.maxJumps}`;
  if (state.stats) {
    const fpsEl = document.getElementById('fps');
    const msEl = document.getElementById('ms');
    if (fpsEl) fpsEl.textContent = state.stats.fps.toFixed(1);
    if (msEl) msEl.textContent = state.stats.frameMs.toFixed(2);
  }
  const god = document.getElementById('godBadge');
  const edit = document.getElementById('editBadge');
  const fs = document.getElementById('fsBadge');
  if (god) {
    god.textContent = `God: ${state.godMode ? 'ON' : 'OFF'}`;
    god.className = `badge ${state.godMode ? 'on' : 'off'}`;
  }
  if (edit) {
    edit.textContent = `Edit: ${state.canEdit ? 'ON' : 'OFF'}`;
    edit.className = `badge ${state.canEdit ? 'on' : 'off'}`;
  }
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
    wi.textContent = `Tiles: ${window.eelvlStats.tiles} | Records: ${window.eelvlStats.records} | ${WORLD_W}x${WORLD_H}`;
  }
  const insp = document.getElementById('inspect');
  if (insp && state.inspectInfo) {
    const { x, y, bg, deco, fg } = state.inspectInfo;
    insp.textContent = `Tile (${x}, ${y}) | FG: ${fg} | Deco: ${deco} | BG: ${bg}`;
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
    // Keys
    if (id === 6) state.keys.red = true;
    if (id === 7) state.keys.green = true;
    if (id === 8) state.keys.blue = true;
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
    }
  }
  const centerDeco = (decoMap[cy] && decoMap[cy][cx]) || 0;
  const centerFg = (fgMap[cy] && fgMap[cy][cx]) || 0;
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
  return !!state.keys[color];
}

function draw() {
  drawWorld();
  drawPlayer();
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
  // SHIFT: rotate box every interval for testing
  if (shift.enabled) {
    if (!shift.lastSwap) { shift.lastSwap = now; loadShiftDBOnce().then(()=>placeShiftBox(1,1)); }
    if (now - shift.lastSwap > shift.intervalMs && !shift.swapping) {
      shift.swapping = true;
      const nextBox = ((shift.curBox) % 12) + 1; // 1..12
      const nextLevel = shift.curLevel; // keep difficulty for test
      placeShiftBox(nextLevel, nextBox);
      shift.curBox = nextBox;
      shift.lastSwap = now;
      shift.swapping = false;
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
function preventIfHandled(e) {
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

  if (e.key === 'q' || e.key === 'Q') state.p.flipGravity = (state.p.flipGravity + 1) % 4;
  if (e.key === 'e' || e.key === 'E') state.p.flipGravity = (state.p.flipGravity + 3) % 4;
  if (e.key === 'r' || e.key === 'R') { state.p.x = 64; state.p.y = 32; state.p._speedX = state.p._speedY = 0; state.p.jumpCount = 0; }
  if (e.key === 'l' || e.key === 'L') state.p.low_gravity = !state.p.low_gravity;
  if (e.key === 'g' || e.key === 'G') { state.godMode = !state.godMode; state.canEdit = state.godMode; if (state.godMode) { state.auraAnim = { start: 0, playedIntro: false, loopStart: 0 }; } }
  if (e.key === '[') state.p.maxJumps = Math.max(1, state.p.maxJumps - 1);
  if (e.key === ']') state.p.maxJumps = Math.min(10, state.p.maxJumps + 1);
  if (e.key >= '1' && e.key <= '9') state.faceIndex = (parseInt(e.key, 10) - 1);
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
    // Inspect mouse cursor tile coords and IDs
    const tx = (mouse && mouse.tile) ? mouse.tile.x : Math.floor((state.p.x + 8) / TILE);
    const ty = (mouse && mouse.tile) ? mouse.tile.y : Math.floor((state.p.y + 8) / TILE);
    const idBg = (bgMap[ty] && bgMap[ty][tx]) || 0;
    const idDe = (decoMap[ty] && decoMap[ty][tx]) || 0;
    const idFg = (fgMap[ty] && fgMap[ty][tx]) || 0;
    state.inspectInfo = { x: tx, y: ty, bg: idBg, deco: idDe, fg: idFg };
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
      if (fgMap[ty]) { fgMap[ty][tx] = 0; if (typeof window.markDirtyTile === 'function') window.markDirtyTile(tx, ty); }
    } else if (forced === 'background') {
      if (bgMap[ty]) { bgMap[ty][tx] = 0; if (typeof window.markDirtyTile === 'function') window.markDirtyTile(tx, ty); }
    } else if (forced === 'auto') {
      let changed = false;
      if (fgMap[ty] && fgMap[ty][tx] === brush) { fgMap[ty][tx] = 0; changed = true; }
      if (decoMap[ty] && decoMap[ty][tx] === brush) { decoMap[ty][tx] = 0; changed = true; }
      if (bgMap[ty] && bgMap[ty][tx] === brush) { bgMap[ty][tx] = 0; changed = true; }
      if (changed && typeof window.markDirtyTile === 'function') window.markDirtyTile(tx, ty);
    } else {
      if (decoMap[ty]) { decoMap[ty][tx] = 0; if (typeof window.markDirtyTile === 'function') window.markDirtyTile(tx, ty); }
    }
    return;
  }
  // place
  if (forced === 'foreground' || (forced === 'auto' && isSolidStaticId(brush))) {
    if (fgMap[ty]) { fgMap[ty][tx] = brush; if (typeof window.markDirtyTile === 'function') window.markDirtyTile(tx, ty); }
  } else if (forced === 'background') {
    if (bgMap[ty]) { bgMap[ty][tx] = brush; if (typeof window.markDirtyTile === 'function') window.markDirtyTile(tx, ty); }
  } else {
    if (decoMap[ty]) { decoMap[ty][tx] = brush; if (typeof window.markDirtyTile === 'function') window.markDirtyTile(tx, ty); }
  }
}

// initialize position and start loop immediately (do not depend on image load)
state.p.x = 3 * TILE;
state.p.y = 2 * TILE;
loop();


