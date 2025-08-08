const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'EEBlocks');
const folders = ['Foreground','Decoration','Background','Effect','Special'];
const entries = [];
for (const folder of folders) {
  const dir = path.join(root, folder);
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const m = /^b(\d+)\.png$/i.exec(f);
    if (!m) continue;
    entries.push({ id: Number(m[1]), folder });
  }
}
entries.sort((a,b)=>a.id-b.id);
const outPath = path.join(__dirname, '..', 'eeblocks_ids.js');
const js = 'export const EEBlocksIds = ' + JSON.stringify(entries, null, 2) + ';\n';
fs.writeFileSync(outPath, js, 'utf8');
console.log('Wrote', entries.length, 'EEBlocks IDs to', outPath);


