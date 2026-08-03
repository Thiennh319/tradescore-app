import fs from 'fs';
import path from 'path';

const root = 'D:/Thiennh3/APP/Trading/TradeScore';
const hist = path.join(process.env.APPDATA, 'Cursor/User/History');

function listEmpty(d, acc = []) {
  if (!fs.existsSync(d)) return acc;
  const st = fs.statSync(d);
  if (st.isFile()) {
    if (st.size <= 5) acc.push(d);
    return acc;
  }
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (['node_modules', 'dist', '.git', 'TradeScore-web-v1', 'android'].includes(e.name)) continue;
      listEmpty(p, acc);
    } else if (fs.statSync(p).size <= 5) {
      acc.push(p);
    }
  }
  return acc;
}

const roots = [
  'services',
  'components',
  'config',
  'constants',
  'hooks',
  'screens',
  'scripts',
  'store',
  'utils',
  'adapters',
  'App.tsx',
];
const empty = [];
for (const r of roots) listEmpty(path.join(root, r), empty);

const histMap = new Map();
for (const dirEnt of fs.readdirSync(hist, { withFileTypes: true })) {
  if (!dirEnt.isDirectory()) continue;
  const dir = path.join(hist, dirEnt.name);
  const entPath = path.join(dir, 'entries.json');
  if (!fs.existsSync(entPath)) continue;
  let j;
  try {
    j = JSON.parse(fs.readFileSync(entPath, 'utf8'));
  } catch {
    continue;
  }
  const res = decodeURIComponent(String(j.resource || ''));
  const idx = res.toLowerCase().indexOf('/tradescore/');
  if (idx < 0) continue;
  let rel = res.slice(idx + '/tradescore/'.length).replace(/\\/g, '/').split('?')[0];
  const entries = [...(j.entries || [])].reverse();
  let picked = null;
  for (const e of entries) {
    const src = path.join(dir, e.id);
    if (fs.existsSync(src) && fs.statSync(src).size > 50) {
      picked = { src, size: fs.statSync(src).size };
      break;
    }
  }
  if (!picked) continue;
  const prev = histMap.get(rel.toLowerCase());
  if (!prev || picked.size >= prev.size) histMap.set(rel.toLowerCase(), { ...picked, rel });
}

let restored = 0;
const missingList = [];
for (const abs of empty) {
  let rel = path.relative(root, abs).replace(/\\/g, '/');
  const key = rel.toLowerCase();
  let hit = histMap.get(key);
  if (!hit) {
    const base = path.basename(abs).toLowerCase();
    const parent = path.basename(path.dirname(abs)).toLowerCase();
    for (const [k, v] of histMap) {
      if (k.endsWith('/' + base) && k.includes('/' + parent + '/')) {
        hit = v;
        break;
      }
    }
  }
  if (!hit) {
    // basename-only fallback for unique names
    const base = path.basename(abs).toLowerCase();
    const matches = [];
    for (const [k, v] of histMap) {
      if (k.endsWith('/' + base) || k === base) matches.push(v);
    }
    if (matches.length === 1) hit = matches[0];
  }
  if (!hit) {
    missingList.push(rel);
    continue;
  }
  fs.copyFileSync(hit.src, abs);
  restored++;
}

const stillEmpty = empty.filter((p) => fs.statSync(p).size <= 5).length;
fs.writeFileSync(
  path.join(root, 'docs/exports/_empty-restore-missing.txt'),
  missingList.join('\n'),
  'utf8',
);
console.log(
  JSON.stringify(
    {
      emptyBefore: empty.length,
      restored,
      missing: missingList.length,
      stillEmpty,
      histEntries: histMap.size,
    },
    null,
    2,
  ),
);
console.log('missing sample:\n' + missingList.slice(0, 40).join('\n'));
