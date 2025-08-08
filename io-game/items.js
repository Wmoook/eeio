// Minimal EE item mapping for demo rendering
// NOTE: This is a partial map. For full fidelity, port ItemManager.as and ItemId.as.

export const Atlases = {
  // EE sheets and nominal tile sizes
  complete: { imgPath: './blocks_complete.png', tileSize: 18 },
  blocks: { imgPath: './blocks.png', tileSize: 16 },
  bg: { imgPath: './blocks_bg.png', tileSize: 16 },
  deco: { imgPath: './blocks_deco.png', tileSize: 16 },
  effect: { imgPath: './blocks_effect.png', tileSize: 16 },
  special: { imgPath: './blocks_special.png', tileSize: 16 },
  door: { imgPath: './blocks_door.png', tileSize: 16 },
  team: { imgPath: './blocks_team.png', tileSize: 16 },
  mud: { imgPath: './blocks_mud.png', tileSize: 16 },
  npc: { imgPath: './blocks_npc.png', tileSize: 16 },
  shadow: { imgPath: './blocks_shadow.png', tileSize: 16 },
};

// Example mapping: id -> { atlas: 'complete', sx, sy } where sx,sy are tile indices (not pixels)
// This needs to be extended to cover block IDs used by your eelvl.
import { GeneratedItemMap } from './items_map.js';

// Build a fast map: id -> { atlasKey, artoffset, layer }
const ItemMap = {};
const atlasColsCache = {};
function getAtlasCols(atlasKey, img) {
  if (atlasColsCache[atlasKey]) return atlasColsCache[atlasKey];
  if (!img || !img.complete || !img.width) return undefined;
  const sz = Atlases[atlasKey].tileSize;
  const cols = Math.max(1, Math.floor(img.width / sz));
  atlasColsCache[atlasKey] = cols;
  return cols;
}

export function buildItemMap(atlasImgs) {
  for (const [idStr, entry] of Object.entries(GeneratedItemMap)) {
    const id = parseInt(idStr, 10);
    const atlasKey = entry.atlas;
    ItemMap[id] = { atlasKey, artoffset: entry.artoffset, layer: entry.layer };
  }
  if (typeof window !== 'undefined') window.ItemMap = ItemMap;
  return ItemMap;
}

export function getAllItems() {
  const out = [];
  for (const [idStr, entry] of Object.entries(GeneratedItemMap)) {
    out.push({ id: parseInt(idStr, 10), layer: entry.layer, atlasKey: entry.atlas, artoffset: entry.artoffset });
  }
  return out;
}

export function isSolidId(id) {
  // Ported from ItemId.isSolid (simplified):
  // Solid if in [9..97] or [122..217] or [1001..1499], excluding 77 (piano) and 83 (drums)
  if (id === 77 || id === 83) return false;
  if ((id >= 9 && id <= 97) || (id >= 122 && id <= 217) || (id >= 1001 && id <= 1499)) return true;
  return false;
}

export function resolveSpriteForId(id, atlasImgs) {
  // Prefer exact per-ID EEBlocks image first (including Special), then fall back to atlas mapping
  const eeb = resolveEEBlocksImage(id);
  if (eeb && eeb.img && eeb.ready) {
    return { atlasKey: null, atlas: { tileSize: 16 }, sx: 0, sy: 0, directImg: eeb.img, directSize: 16 };
  }
  const entry = ItemMap[id];
  const entry2 = ItemMap[id];
  const entryUse = entry2;
  const atlasFrom = entryUse?.atlasKey || entryUse?.atlas;
  const entryAtlas = atlasFrom || 'blocks';
  const atlas = Atlases[entryAtlas];
  if (!atlas) return null;
  const imgObj = atlasImgs?.[entryAtlas];
  const cols = getAtlasCols(entryAtlas, imgObj);
  if (!cols) {
    // If atlas not yet ready, attempt EEBlocks direct as temp fallback
    const eeb = resolveEEBlocksImage(id);
    if (eeb && eeb.img && eeb.ready && eeb.folder && eeb.folder.toLowerCase() !== 'special') {
      return { atlasKey: null, atlas: { tileSize: 16 }, sx: 0, sy: 0, directImg: eeb.img, directSize: 16 };
    }
    return null;
  }
  const offset = entryUse?.artoffset ?? id;
  // Validate offset in atlas bounds; if invalid for 'special', fallback to EEBlocks direct
  if (imgObj && imgObj.width) {
    const rows = Math.max(1, Math.floor(imgObj.height / atlas.tileSize));
    const total = cols * rows;
    if (offset < 0 || offset >= total) {
      const eeb = resolveEEBlocksImage(id);
      if (eeb && eeb.img && eeb.ready) {
        return { atlasKey: null, atlas: { tileSize: 16 }, sx: 0, sy: 0, directImg: eeb.img, directSize: 16 };
      }
    }
  }
  const gx = offset % cols;
  const gy = Math.floor(offset / cols);
  return { atlasKey: entryAtlas, atlas, sx: gx, sy: gy };
}

// Lightweight resolver for EEBlocks per-ID images. Progressive: first call kicks off load, subsequent calls use cache.
const EEB_IMAGE_CACHE = new Map(); // id -> { img, ready, triedFoldersIdx, folder }
const EEB_FOLDERS = ['Foreground', 'Decoration', 'Background', 'Effect', 'Special'];
function tryLoadEEBFor(id, idx) {
  if (idx >= EEB_FOLDERS.length) return null;
  const folder = EEB_FOLDERS[idx];
  const img = new Image();
  img.decoding = 'async';
  img.loading = 'eager';
  img.src = `./EEBlocks/${folder}/b${id}.png`;
  const rec = { img, ready: false, triedFoldersIdx: idx, folder: null };
  img.onload = () => { 
    rec.ready = true; 
    rec.folder = folder; 
    try { if (typeof window !== 'undefined') window.EE_ForceCacheRebuild = true; } catch(e) {}
    try { if (typeof window !== 'undefined' && typeof window.requestRebuildPalette === 'function') window.requestRebuildPalette(); } catch(e) {}
  };
  img.onerror = () => {
    // Try next folder once
    const next = tryLoadEEBFor(id, idx + 1);
    if (next) {
      EEB_IMAGE_CACHE.set(id, next);
    } else {
      // mark as not found to avoid repeated attempts
      EEB_IMAGE_CACHE.set(id, { img: null, ready: false, triedFoldersIdx: EEB_FOLDERS.length, folder: null });
    }
  };
  return rec;
}
export function resolveEEBlocksImage(id) {
  let rec = EEB_IMAGE_CACHE.get(id);
  if (!rec) {
    rec = tryLoadEEBFor(id, 0) || { img: null, ready: false, triedFoldersIdx: EEB_FOLDERS.length, folder: null };
    EEB_IMAGE_CACHE.set(id, rec);
  }
  return rec;
}

// Expose helpers for non-module users
if (typeof window !== 'undefined') {
  window.resolveEEBlocksImage = resolveEEBlocksImage;
}

// Returns a lowercased layer hint based on EEBlocks folder name when available
export function getEEBlocksLayerForId(id) {
  const rec = resolveEEBlocksImage(id);
  if (rec && rec.folder) return rec.folder.toLowerCase();
  const entry = ItemMap[id];
  if (entry && entry.layer) return String(entry.layer).toLowerCase();
  return null;
}
if (typeof window !== 'undefined') {
  window.getEEBlocksLayerForId = getEEBlocksLayerForId;
}


