/**
 * One-shot: scan NEARUSDT via production scanV41 → rulebook markdown.
 * Usage: npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/export-near-rulebook-live.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { scanV41 } from '../services/v41/scanV41';
import { buildRulebookV41Export } from '../services/v41Export/rulebook';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(
  __dirname,
  '../docs/exports/01_RULEBOOK_V41_NEARUSDT.md',
);

async function main(): Promise<void> {
  const rows = await scanV41(['NEARUSDT']);
  const row = rows[0];
  if (row == null) throw new Error('No NEARUSDT row');
  if (row.error) {
    console.warn('scan warning:', row.error);
  }

  const md = buildRulebookV41Export({
    row,
    metadata: {
      generatedAt: new Date().toISOString(),
      coin: 'NEARUSDT',
    },
  });

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, md, 'utf8');
  console.log('Wrote', OUT);
  console.log('bytes', md.length);
  console.log('hasKlines1H', (row.klines1H?.length ?? 0) > 0);
  console.log('klines1H', row.klines1H?.length ?? 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
