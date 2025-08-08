// Generate a mapping from EEO ItemManager.as createBrick calls to a JS export
// Usage: node io-game/scripts/gen_items_map.js
const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '..', '..', 'ee-offline', 'src', 'items', 'ItemManager.as');
let content;
try {
  content = fs.readFileSync(srcPath, 'utf8');
} catch (e) {
  console.error('Failed to read', srcPath, e.message);
  process.exit(1);
}

const layerMap = {
  FOREGROUND: 'foreground',
  FORGROUND: 'foreground', // typo used in code
  BACKGROUND: 'background',
  DECORATION: 'decoration',
  ABOVE: 'above',
};
const baseMap = {
  blocksBMD: 'blocks',
  decoBlocksBMD: 'deco',
  bgBlocksBMD: 'bg',
  specialBlocksBMD: 'special',
  doorBlocksBMD: 'door',
  effectBlocksBMD: 'effect',
  completeBlocksBMD: 'complete',
  teamBlocksBMD: 'team',
  mudBlocksBMD: 'mud',
  npcBlocksBMD: 'npc',
  shadowBlocksBMD: 'shadow',
};

// Regex to capture: id, ItemLayer.X, baseVar, ..., bool, bool, artoffset,
const re = /createBrick\(\s*(\d+)\s*,\s*ItemLayer\.(\w+)\s*,\s*(\w+)\s*,[\s\S]*?,\s*(?:true|false)\s*,\s*(?:true|false)\s*,\s*(-?\d+)\s*,/g;
let m;
const map = {};
while ((m = re.exec(content))) {
  const id = Number(m[1]);
  const layerName = m[2];
  const baseVar = m[3];
  const artoffset = Number(m[4]);
  const atlas = baseMap[baseVar] || baseVar;
  const layer = layerMap[layerName] || layerName;
  map[id] = { atlas, layer, artoffset };
}

const outPath = path.join(__dirname, '..', 'items_map.js');
const js = 'export const GeneratedItemMap = ' + JSON.stringify(map, null, 2) + ';\n';
fs.writeFileSync(outPath, js, 'utf8');
console.log('Wrote', Object.keys(map).length, 'entries to', outPath);


