import { WHALE_RADAR_INTERVAL_MS, WHALE_RADAR_SYMBOLS } from '../constants/whaleRadar';

import type { AppTradeSymbol } from '../constants/scoring';

import { computeAtr1hFromKlines } from './atr1h';

import { fetchDeepOrderBook, fetchKlines, fetchTickerPrice } from './binanceApi';

import { calculateLiquidityHeatmap } from './indicators';

import {

  bumpWallMetaOnPullEvents,

  detectWhaleRadarEvents,

  extractWallsFromHeatmap,

  type SymbolBookSnapshot,

  type WhaleRadarEvent,

} from './whaleRadarDetect';

import { notifyWhaleRadarEvents } from './whaleRadarNotification';

import {

  appendWhaleRadarAlerts,

  getLastWhaleRadarScanAt,

  loadWhaleRadarSnapshots,

  saveWhaleRadarScanSummary,

  saveWhaleRadarSnapshot,

  setLastWhaleRadarScanAt,

  type WhaleRadarScanSummary,

} from './whaleRadarPersist';

import { filterValidRadarWallRecords } from './whaleRadarValidation';



async function fetchAtr1hForSymbol(

  symbol: AppTradeSymbol,

  markPrice: number,

): Promise<number> {

  try {

    const { klines } = await fetchKlines(symbol, '1h', 20);

    return computeAtr1hFromKlines(klines, markPrice);

  } catch {

    return markPrice > 0 ? markPrice * 0.015 : 0;

  }

}



async function scanSymbol(

  symbol: AppTradeSymbol,

  scannedAt: number,

  prevSnapshots: Awaited<ReturnType<typeof loadWhaleRadarSnapshots>>,

): Promise<{ snapshot: SymbolBookSnapshot; events: WhaleRadarEvent[] }> {

  const [book, ticker] = await Promise.all([
    fetchDeepOrderBook(symbol),
    fetchTickerPrice(symbol),
  ]);
  const markPrice = ticker.price;
  const atr = await fetchAtr1hForSymbol(symbol, markPrice);

  const heatmap = calculateLiquidityHeatmap(book, null);

  const prevSnap = prevSnapshots[symbol] ?? null;

  const prevWalls = prevSnap?.walls ?? [];

  const prevWallMeta = prevSnap?.wallMeta ?? {};



  const rawWalls = extractWallsFromHeatmap(

    symbol,

    markPrice,

    heatmap,

    scannedAt,

    prevWalls,

    prevWallMeta,

  );

  const walls = filterValidRadarWallRecords(

    rawWalls,

    symbol,

    markPrice,

    atr,

    scannedAt,

  );



  const snapshot: SymbolBookSnapshot = {

    symbol,

    scannedAt,

    markPrice,

    walls,

    wallMeta: prevWallMeta,

  };



  const events = detectWhaleRadarEvents(prevSnap, snapshot);

  snapshot.wallMeta = bumpWallMetaOnPullEvents(prevWallMeta, events);

  await saveWhaleRadarSnapshot(snapshot);



  return { snapshot, events };

}



export async function runWhaleRadarScan(now = Date.now()): Promise<WhaleRadarScanSummary> {

  const prevSnapshots = await loadWhaleRadarSnapshots();

  const allEvents: WhaleRadarEvent[] = [];

  let wallCount = 0;



  for (const symbol of WHALE_RADAR_SYMBOLS) {

    try {

      const { snapshot, events } = await scanSymbol(symbol, now, prevSnapshots);

      wallCount += snapshot.walls.length;

      allEvents.push(...events);

    } catch (error) {

      console.warn(`[whaleRadar] scan failed ${symbol}:`, error);

    }

  }



  const stamped = allEvents.map((e) => ({ ...e, detectedAt: now }));

  await appendWhaleRadarAlerts(stamped);

  const notified = await notifyWhaleRadarEvents(stamped);

  await setLastWhaleRadarScanAt(now);



  const summary: WhaleRadarScanSummary = {

    scannedAt: now,

    symbolCount: WHALE_RADAR_SYMBOLS.length,

    eventCount: allEvents.length,

    wallCount,

    events: stamped,

  };



  await saveWhaleRadarScanSummary(summary);



  if (notified > 0) {

    console.log(`[whaleRadar] ${notified} alert(s) sent`);

  }



  return summary;

}



/** Chỉ quét khi đủ 5 phút kể từ lần trước (hoặc chưa từng quét). */

export async function runWhaleRadarScanIfDue(now = Date.now()): Promise<WhaleRadarScanSummary | null> {

  const last = await getLastWhaleRadarScanAt();

  if (last != null && now - last < WHALE_RADAR_INTERVAL_MS) {

    return null;

  }

  return runWhaleRadarScan(now);

}



export { WHALE_RADAR_INTERVAL_MS };

