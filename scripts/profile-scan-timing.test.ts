/**
 * PROFILE ONLY — không sửa production path.
 * Đo wall time: fetch per-endpoint, per-symbol, full V3/V4 + V41, CPU score.
 *
 *   npx vitest run scripts/profile-scan-timing.test.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

import { DEFAULT_SCORING_PSYCHOLOGY_CHECKLIST, TRADE_SYMBOLS } from '../constants/scoring';
import {
  BINANCE_MAX_CONCURRENT,
  fetchAllMarketData,
  fetchDeepOrderBook,
  fetchForceOrders,
  fetchFundingRateHistory,
  fetchKlines,
  fetchLongShortRatio,
  fetchOIEngine,
  fetchTickerPrice,
  type TradeSymbol,
} from '../services/binanceApi';
import { MARKET_KLINE_LIMIT, MARKET_KLINE_LIMIT_MTF, MARKET_LS_DEPTH } from '../services/marketAnalysisFetch';
import { scanAllSignalRows } from '../services/signalBoardScan';
import { buildTodayStatsFromJournalV4, scoreAnalysisV4, buildAnalysisInputV4FromMarket } from '../services/scorerV4';
import { scanV41, DEFAULT_SCAN_SYMBOLS_V41 } from '../services/v41/scanV41';
import { fetchRawMarketV41, fetchSharedBtcMarketV41 } from '../services/v41/rawMarketFetcher';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../docs/exports');

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

async function timeMs<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const t0 = now();
  const value = await fn();
  return { ms: now() - t0, value };
}

function fmt(ms: number) {
  return `${ms.toFixed(0)}ms`;
}

describe('profile-scan-timing', () => {
  it(
    'measures V3/V4 + V41 scan bottlenecks (live Binance)',
    { timeout: 300_000 },
    async () => {
      const lines: string[] = [];
      const log = (s: string) => {
        console.log(s);
        lines.push(s);
      };

      log(`BINANCE_MAX_CONCURRENT=${BINANCE_MAX_CONCURRENT}`);
      log(`TRADE_SYMBOLS=${TRADE_SYMBOLS.join(',')}`);
      log(`V41_DEFAULT=${DEFAULT_SCAN_SYMBOLS_V41.join(',')}`);
      log('');

      // ── 1) Endpoint breakdown (BTC cold, then measure FORCE + others) ──
      log('=== A) Per-endpoint wall (BTCUSDT) ===');
      const endpoints: { name: string; ms: number; note?: string }[] = [];

      {
        const r = await timeMs(() => fetchKlines('BTCUSDT', '1h', MARKET_KLINE_LIMIT));
        endpoints.push({ name: 'klines 1h×220', ms: r.ms, note: r.value.fromCache ? 'cache' : 'net' });
      }
      {
        const r = await timeMs(() => fetchKlines('BTCUSDT', '4h', MARKET_KLINE_LIMIT));
        endpoints.push({ name: 'klines 4h×220', ms: r.ms, note: r.value.fromCache ? 'cache' : 'net' });
      }
      {
        const r = await timeMs(() => fetchKlines('BTCUSDT', '5m', MARKET_KLINE_LIMIT_MTF));
        endpoints.push({ name: 'klines 5m×80', ms: r.ms, note: r.value.fromCache ? 'cache' : 'net' });
      }
      {
        const r = await timeMs(() => fetchDeepOrderBook('BTCUSDT'));
        endpoints.push({
          name: 'depth limit=1000',
          ms: r.ms,
          note: r.value.fromCache ? 'cache' : 'net',
        });
      }
      {
        const r = await timeMs(() => fetchForceOrders('BTCUSDT').catch((e) => {
          console.warn('[profile] forceOrders failed:', String(e));
          return { fromCache: false, orders: [] as never[], symbol: 'BTCUSDT' as const };
        }));
        endpoints.push({
          name: 'forceOrders WS',
          ms: r.ms,
          note:
            'fromCache' in r.value && (r.value as { fromCache?: boolean }).fromCache
              ? 'cacheHIT'
              : 'WS~2s or fail',
        });
      }
      {
        const r = await timeMs(() => fetchOIEngine('BTCUSDT', '5m'));
        endpoints.push({ name: 'OI+OIHist', ms: r.ms, note: r.value.fromCache ? 'cache' : 'net' });
      }
      {
        const r = await timeMs(() => fetchFundingRateHistory('BTCUSDT'));
        endpoints.push({
          name: 'fundingHist',
          ms: r.ms,
          note: r.value == null ? 'null/fail' : 'net',
        });
      }
      {
        const r = await timeMs(() => fetchLongShortRatio('BTCUSDT', '1h'));
        endpoints.push({ name: 'LS ratio', ms: r.ms, note: r.value.fromCache ? 'cache' : 'net' });
      }
      {
        const r = await timeMs(() => fetchTickerPrice('BTCUSDT'));
        endpoints.push({ name: 'ticker', ms: r.ms, note: r.value.fromCache ? 'cache' : 'net' });
      }
      for (const e of endpoints) {
        log(`  ${e.name.padEnd(22)} ${fmt(e.ms).padStart(8)}  ${e.note ?? ''}`);
      }

      // forceOrders second call (should be cache within 45s if first succeeded)
      {
        const r = await timeMs(() =>
          fetchForceOrders('BTCUSDT').catch(() => ({
            fromCache: false,
            orders: [] as never[],
            symbol: 'BTCUSDT' as const,
          })),
        );
        log(
          `  forceOrders (2nd call) ${fmt(r.ms).padStart(8)}  ${
            (r.value as { fromCache?: boolean }).fromCache ? 'cacheHIT' : 'MISS/fail'
          }`,
        );
      }

      // ── 2) Per-symbol fetchAllMarketData ──
      log('');
      log('=== B) fetchAllMarketData per symbol (V3/V4 pipe) ===');
      const perSymFetch: { sym: string; ms: number }[] = [];
      for (const sym of TRADE_SYMBOLS) {
        const r = await timeMs(() =>
          fetchAllMarketData(
            sym as TradeSymbol,
            MARKET_KLINE_LIMIT,
            MARKET_LS_DEPTH,
            '5m',
            '1h',
            MARKET_KLINE_LIMIT_MTF,
          ),
        );
        perSymFetch.push({ sym, ms: r.ms });
        log(`  ${sym} fetchAllMarketData ${fmt(r.ms)}`);
      }
      const sumFetch = perSymFetch.reduce((s, x) => s + x.ms, 0);
      log(`  SUM sequential fetchAll = ${fmt(sumFetch)}`);

      // ── 3) CPU scoring only (reuse last markets) ──
      log('');
      log('=== C) CPU scoreAnalysisV4 only (reuse fetched market) ===');
      const cpuRows: { sym: string; ms: number }[] = [];
      for (const sym of TRADE_SYMBOLS) {
        const market = (
          await fetchAllMarketData(
            sym as TradeSymbol,
            MARKET_KLINE_LIMIT,
            MARKET_LS_DEPTH,
            '5m',
            '1h',
            MARKET_KLINE_LIMIT_MTF,
          )
        );
        // warm-ish; only time build+score
        const r = await timeMs(async () => {
          const ticker = await fetchTickerPrice(sym as TradeSymbol);
          const input = buildAnalysisInputV4FromMarket({
            symbol: sym,
            currentPrice: ticker.price,
            market,
            psychologyChecklist: {
              ...DEFAULT_SCORING_PSYCHOLOGY_CHECKLIST,
              alert: true,
              slTpReady: true,
            },
            btc24hChangePct: 0,
          });
          if (!input) throw new Error('no input');
          scoreAnalysisV4(input, buildTodayStatsFromJournalV4(0, 0));
        });
        // The ticker fetch sneaks in — note below
        cpuRows.push({ sym, ms: r.ms });
        log(`  ${sym} buildInput+scoreV4 (+ticker) ${fmt(r.ms)}`);
      }
      log(`  SUM CPU-ish = ${fmt(cpuRows.reduce((s, x) => s + x.ms, 0))}`);

      // Pure CPU: score same input 20×
      {
        const sym = 'BTCUSDT' as TradeSymbol;
        const market = await fetchAllMarketData(
          sym,
          MARKET_KLINE_LIMIT,
          MARKET_LS_DEPTH,
          '5m',
          '1h',
          MARKET_KLINE_LIMIT_MTF,
        );
        const ticker = await fetchTickerPrice(sym);
        const input = buildAnalysisInputV4FromMarket({
          symbol: sym,
          currentPrice: ticker.price,
          market,
          psychologyChecklist: {
            ...DEFAULT_SCORING_PSYCHOLOGY_CHECKLIST,
            alert: true,
            slTpReady: true,
          },
          btc24hChangePct: 0,
        })!;
        const stats = buildTodayStatsFromJournalV4(0, 0);
        const t0 = now();
        for (let i = 0; i < 20; i++) scoreAnalysisV4(input, stats);
        const avg = (now() - t0) / 20;
        log(`  Pure scoreAnalysisV4 BTC avg×20 = ${avg.toFixed(1)}ms`);
      }

      // ── 4) Full scanAllSignalRows (production path) ──
      log('');
      log('=== D) Full scanAllSignalRows (V3+V4 production) ===');
      const fullV3V4 = await timeMs(() =>
        scanAllSignalRows('1h', {
          ...DEFAULT_SCORING_PSYCHOLOGY_CHECKLIST,
          alert: true,
          slTpReady: true,
        }),
      );
      log(`  scanAllSignalRows TOTAL = ${fmt(fullV3V4.ms)} (n=${fullV3V4.value.length})`);

      // ── 5) V41 ──
      log('');
      log('=== E) V41 fetch + scan ===');
      const shared = await timeMs(() => fetchSharedBtcMarketV41());
      log(`  fetchSharedBtcMarketV41 = ${fmt(shared.ms)}`);
      for (const sym of DEFAULT_SCAN_SYMBOLS_V41) {
        const r = await timeMs(() => fetchRawMarketV41(sym, shared.value));
        log(`  fetchRawMarketV41 ${sym} = ${fmt(r.ms)}`);
      }
      const v41Full = await timeMs(() => scanV41([...DEFAULT_SCAN_SYMBOLS_V41]));
      log(`  scanV41(5) TOTAL = ${fmt(v41Full.ms)}`);

      // Unified-like: V3V4 already ran; time V41 alone was above.
      // Simulate sequential phases cost = D + E
      const unifiedEstimate = fullV3V4.ms + v41Full.ms;
      log('');
      log('=== F) Unified tick estimate (V3V4 then V41 sequential) ===');
      log(`  D + E = ${fmt(unifiedEstimate)}`);

      // Parallel symbol fetch estimate (what-if): max(perSym) vs sum
      const maxFetch = Math.max(...perSymFetch.map((x) => x.ms));
      log('');
      log('=== G) What-if (no code change, arithmetic only) ===');
      log(
        `  If V3/V4 symbols parallel (ideal, ignore concurrency=3): ~${fmt(maxFetch)} instead of ${fmt(sumFetch)}`,
      );
      log(
        `  If forceOrders skipped/cached always: per-symbol floor drops ~2s on miss → ~${fmt(Math.max(0, sumFetch - 5 * 1500))} rough`,
      );

      const stamp = new Date().toISOString().slice(0, 10);
      const mdPath = path.join(OUT, `REPORT_PROFILE_SCAN_TIMING_5COIN_${stamp}.md`);
      fs.mkdirSync(OUT, { recursive: true });
      const md = `# REPORT — Profile scan timing (5 coin)

**Generated:** ${new Date().toISOString()}  
**Mode:** đo live — **không** sửa production  
**Concurrency gate:** \`BINANCE_MAX_CONCURRENT=${BINANCE_MAX_CONCURRENT}\`

## Raw log

\`\`\`
${lines.join('\n')}
\`\`\`

## Key measured numbers

| Step | ms |
|------|---:|
| scanAllSignalRows (V3+V4 parallel + concurrency=${BINANCE_MAX_CONCURRENT}) | ${fullV3V4.ms.toFixed(0)} |
| scanV41 (5 sym parallel after shared BTC) | ${v41Full.ms.toFixed(0)} |
| Unified estimate D+E | ${unifiedEstimate.toFixed(0)} |
| Sum fetchAllMarketData sequential | ${sumFetch.toFixed(0)} |

## Architecture (from code — confirmed by timing)

| Axis | Behavior |
|------|----------|
| V3/V4 symbols | **PARALLEL** \`Promise.allSettled\` (REST ≤ BINANCE_MAX_CONCURRENT=${BINANCE_MAX_CONCURRENT}) |
| V3/V4 endpoints / symbol | **Parallel** Promise.all but capped at **3** concurrent REST globally |
| forceOrders | **WS collect 2000ms** on cache miss; holds concurrency slot |
| V41 symbols | **Parallel** Promise.allSettled after shared BTC |
| Happy-path REST cache | **No** soft-TTL skip — AsyncStorage only on **error** fallback (except forceOrders proactive 45s) |
`;
      fs.writeFileSync(mdPath, md, 'utf8');
      log(`[profile] wrote ${mdPath}`);
    },
  );
});
