/**
 * Vitest orchestrator — chạy trusted-window V3/V4 cho XRP+BTC+SOL+BNB,
 * copy báo cáo từng coin, rồi ghi bảng so sánh. Không sửa scorer/production.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';
import { main } from './backtest-v3v4-xrp-trusted-window';
import { computeStats, type TradeRow } from './backtest-v4-near-90d';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../docs/exports');
const SYMBOLS = ['XRPUSDT', 'BTCUSDT', 'SOLUSDT', 'BNBUSDT'] as const;
const DAYS = 21;

type SideStats = { n: number; wr: number; pf: number; expR: number };
type CoinSlice = {
  symbol: string;
  v3: { all: SideStats; long: SideStats; short: SideStats };
  v4: { all: SideStats; long: SideStats; short: SideStats };
  v3LongPct: number;
  v4LongPct: number;
  hardV3: string;
  hardV4: string;
  mdPath: string;
};

function parseCsv(file: string): TradeRow[] {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cols = line.split(',');
    const row: Record<string, string> = {};
    header.forEach((h, i) => {
      row[h] = cols[i] ?? '';
    });
    return {
      symbol: row.symbol,
      side: row.side as 'LONG' | 'SHORT',
      resultR: Number(row.resultR),
      win: Number(row.win) as 0 | 1,
      pnlPct: Number(row.pnlPct),
    } as TradeRow;
  });
}

function sideBundle(rows: TradeRow[]): {
  all: SideStats;
  long: SideStats;
  short: SideStats;
} {
  const to = (r: TradeRow[]) => {
    const s = computeStats(r);
    return { n: s.n, wr: s.wr, pf: s.pf, expR: s.expectancyR };
  };
  return {
    all: to(rows),
    long: to(rows.filter((r) => r.side === 'LONG')),
    short: to(rows.filter((r) => r.side === 'SHORT')),
  };
}

function topHardLayers(md: string, engine: 'V3' | 'V4'): string {
  const engineIdx = md.indexOf(`### ${engine}`);
  if (engineIdx < 0) return 'n/a';
  const section = md.slice(engineIdx);
  const marker = '**Hard-block layer contributors';
  const hi = section.indexOf(marker);
  if (hi < 0) return 'n/a';
  const after = section.slice(hi);
  const tableMatch = after.match(
    /\| Layer \| Hits \|\r?\n\|[-:\s|]+\|\r?\n((?:\|[^\n]+\|\r?\n)+)/,
  );
  if (!tableMatch) return 'n/a';
  const rows = tableMatch[1]
    .trim()
    .split(/\r?\n/)
    .map((l) => {
      const parts = l.split('|').map((p) => p.trim()).filter(Boolean);
      return parts.length >= 2 ? `${parts[0]}(${parts[1]})` : '';
    })
    .filter(Boolean);
  return rows.slice(0, 3).join(', ') || 'n/a';
}

function fmt(s: SideStats): string {
  if (s.n === 0) return 'n=0';
  const pf = Number.isFinite(s.pf) ? s.pf.toFixed(2) : '∞';
  return `n=${s.n} WR=${s.wr.toFixed(1)}% PF=${pf} E[R]=${s.expR.toFixed(3)}`;
}

function longPct(rows: TradeRow[]): number {
  if (rows.length === 0) return 0;
  return (rows.filter((r) => r.side === 'LONG').length / rows.length) * 100;
}

describe('backtest-v3v4-peers-trusted-compare', () => {
  it(
    'runs XRP+BTC+SOL+BNB trusted 21d and writes comparison',
    { timeout: 1_200_000 },
    async () => {
      fs.mkdirSync(OUT, { recursive: true });
      const stamp = new Date().toISOString().slice(0, 10);
      /** Script main() always writes this hardcoded path — move aside per symbol. */
      const genericMd = path.join(OUT, `REPORT_BACKTEST_XRP_V3V4_TRUSTED_${stamp}.md`);
      const slices: CoinSlice[] = [];

      for (const symbol of SYMBOLS) {
        process.argv = [
          process.argv[0] ?? 'node',
          'backtest-v3v4-xrp-trusted-window.ts',
          '--symbol',
          symbol,
          '--days',
          String(DAYS),
        ];
        await main();

        const short = symbol.replace('USDT', '').toLowerCase();
        const perMd = path.join(
          OUT,
          `REPORT_BACKTEST_${short.toUpperCase()}_V3V4_TRUSTED_${stamp}.md`,
        );
        if (fs.existsSync(genericMd)) {
          fs.renameSync(genericMd, perMd);
        }

        const v3Rows = parseCsv(
          path.join(OUT, `${short}_v3v4_trusted_${DAYS}d_v3_trades.csv`),
        );
        const v4Rows = parseCsv(
          path.join(OUT, `${short}_v3v4_trusted_${DAYS}d_v4_trades.csv`),
        );
        const md = fs.existsSync(perMd) ? fs.readFileSync(perMd, 'utf8') : '';

        slices.push({
          symbol,
          v3: sideBundle(v3Rows),
          v4: sideBundle(v4Rows),
          v3LongPct: longPct(v3Rows),
          v4LongPct: longPct(v4Rows),
          hardV3: topHardLayers(md, 'V3'),
          hardV4: topHardLayers(md, 'V4'),
          mdPath: perMd,
        });
      }

      const comparePath = path.join(
        OUT,
        `REPORT_COMPARE_V3V4_TRUSTED_4COIN_${DAYS}d_${stamp}.md`,
      );

      const row = (
        label: string,
        pick: (c: CoinSlice) => string,
      ) =>
        `| ${label} | ${slices.map(pick).join(' | ')} |`;

      const md = `# COMPARE — V3/V4 Trusted Window ${DAYS}d — XRP / BTC / SOL / BNB

**Ngày:** ${stamp}  
**Cùng script:** \`backtest-v3v4-xrp-trusted-window.ts\`  
**Logic:** scoreAnalysisV3/V4 + tradePlanV3/V4 + ambiguity(2.5) + ADX gate  
**Cửa sổ:** \`--days ${DAYS}\` (end ≈ now — cùng pha thị trường gần nhất với backtest XRP)  
**Không:** sửa production / V41  

> Caveat: n nhỏ; win = resultR > 0 (gồm TIMEOUT lãi nhỏ). OI/LS real trong cửa sổ.

## Winrate / PF / Expectancy

### V4

| Metric | ${SYMBOLS.map((s) => s.replace('USDT', '')).join(' | ')} |
|--------|${SYMBOLS.map(() => '---').join('|')}|
${row('All', (c) => fmt(c.v4.all))}
${row('Long', (c) => fmt(c.v4.long))}
${row('Short', (c) => fmt(c.v4.short))}
${row('% Long entries', (c) => `${c.v4LongPct.toFixed(0)}% L / ${(100 - c.v4LongPct).toFixed(0)}% S`)}

### V3

| Metric | ${SYMBOLS.map((s) => s.replace('USDT', '')).join(' | ')} |
|--------|${SYMBOLS.map(() => '---').join('|')}|
${row('All', (c) => fmt(c.v3.all))}
${row('Long', (c) => fmt(c.v3.long))}
${row('Short', (c) => fmt(c.v3.short))}
${row('% Long entries', (c) => `${c.v3LongPct.toFixed(0)}% L / ${(100 - c.v3LongPct).toFixed(0)}% S`)}

## Hard-block layers (top 3 mỗi coin)

| Engine | ${SYMBOLS.map((s) => s.replace('USDT', '')).join(' | ')} |
|--------|${SYMBOLS.map(() => '---').join('|')}|
${row('V4', (c) => c.hardV4)}
${row('V3', (c) => c.hardV3)}

## Đọc nhanh Long/Short bias (V4)

${slices
  .map((c) => {
    const bias =
      c.v4.all.n === 0
        ? 'no trades'
        : c.v4LongPct === 0
          ? '**100% SHORT**'
          : c.v4LongPct === 100
            ? '**100% LONG**'
            : `${c.v4LongPct.toFixed(0)}% Long`;
    return `- **${c.symbol.replace('USDT', '')}:** n=${c.v4.all.n}, ${bias}`;
  })
  .join('\n')}

${(() => {
  const xrp = slices.find((s) => s.symbol === 'XRPUSDT');
  const peers = slices.filter((s) => s.symbol !== 'XRPUSDT');
  if (!xrp) return '';
  const peerAllShort = peers.every(
    (p) => p.v4.all.n > 0 && p.v4LongPct === 0,
  );
  const peerMostlyShort = peers.every(
    (p) => p.v4.all.n === 0 || p.v4LongPct <= 35,
  );
  if (xrp.v4LongPct === 0 && peerAllShort) {
    return `→ **XRP toàn Short ở V4 giống peers** trong pha này → nghiêng **xu hướng thị trường chung**, không riêng bias XRP.`;
  }
  if (xrp.v4LongPct === 0 && peerMostlyShort) {
    return `→ **XRP 100% Short; peers cũng Short-heavy** → thiên về market phase, có thể XRP lọc Long chặt hơn.`;
  }
  if (xrp.v4LongPct === 0) {
    return `→ **XRP 100% Short trong khi peers vẫn có Long** → có tín hiệu **bias/filter riêng XRP** (hoặc sample XRP thiếu Long pass gate).`;
  }
  return `→ XRP không 100% Short — xem bảng % Long ở trên.`;
})()}

## Artefacts từng coin

${slices
  .map(
    (c) =>
      `- ${c.symbol}: \`${path.relative(path.resolve(__dirname, '..'), c.mdPath)}\` + csv \`${c.symbol.replace('USDT', '').toLowerCase()}_v3v4_trusted_${DAYS}d_v{3,4}_trades.csv\``,
  )
  .join('\n')}
`;

      fs.writeFileSync(comparePath, md, 'utf8');
      console.log(`[compare] wrote ${comparePath}`);
      for (const c of slices) {
        console.log(
          `[compare] ${c.symbol} V4 ${fmt(c.v4.all)} | V3 ${fmt(c.v3.all)} | V4 L%=${c.v4LongPct.toFixed(0)}`,
        );
      }
    },
  );
});
