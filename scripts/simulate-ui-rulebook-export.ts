/**
 * Simulates SignalBoard handleExportAuditPackage for trace-rulebook.
 * Same call shape as components/dashboard/SignalBoard.tsx (lines 725-734).
 *
 * Usage: npx tsx scripts/simulate-ui-rulebook-export.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { btcShortV4ProductionRow } from '../services/__fixtures__/btcShortV4ProductionRow';
import { exportTraceOrReviewMarkdown } from '../services/exportTraceReviewWire';

const exportedAt = new Date().toISOString();
const context = {
  rows: [btcShortV4ProductionRow()],
  scorerVersion: 'v4' as const,
  esmBridge: undefined,
  exportedAt,
};

const result = exportTraceOrReviewMarkdown('trace-rulebook', context);
if (!result.ok) {
  console.error('Export failed:', result.message);
  process.exit(1);
}

const outPath = path.join(
  process.cwd(),
  'docs',
  'UI_RULEBOOK_TRACE_SIGNALBOARD_EXPORT.md',
);
fs.writeFileSync(outPath, result.markdown, 'utf8');
console.log('OK', outPath);
console.log('filename', result.filename);
console.log('exportedAt', exportedAt);
console.log('bytes', result.markdown.length);
