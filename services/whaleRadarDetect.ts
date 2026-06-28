import type { AppTradeSymbol } from '../constants/scoring';
import {
  WHALE_MIN_NOTIONAL_USD,
  WHALE_MIN_STRENGTH,
  WHALE_PULL_RATIO,
  WHALE_RADAR_INTERVAL_MS,
  WHALE_SPOOF_PROXIMITY_PCT,
} from '../constants/whaleRadar';
import type { LiquidityHeatmapResult } from './indicators';

export type WhaleRadarSide = 'BID' | 'ASK';
export type WhaleRadarEventKind = 'WALL_PLACED' | 'WALL_PULLED';

export interface WhaleWallGhostMeta {
  disappearReappearCount: number;
}

export interface WhaleWallRecord {
  priceKey: number;
  price: number;
  qty: number;
  side: WhaleRadarSide;
  notionalUsd: number;
  strength: number;
  /** Lần đầu thấy tường tại mức giá này (ms). */
  firstSeenAt: number;
  /** Khối lượng ước lượng đã khớp / rút khỏi tường (USD, tích lũy qua các lần quét). */
  executedVolumeUSD?: number;
  refreshCount?: number;
  disappearReappearCount?: number;
}

export interface SymbolBookSnapshot {
  symbol: AppTradeSymbol;
  scannedAt: number;
  markPrice: number;
  walls: WhaleWallRecord[];
  /** Meta cho tường đã bị gỡ — dùng khi tường xuất hiện lại. */
  wallMeta?: Record<string, WhaleWallGhostMeta>;
}

export interface WhaleRadarEvent {
  symbol: AppTradeSymbol;
  kind: WhaleRadarEventKind;
  side: WhaleRadarSide;
  price: number;
  notionalUsd: number;
  strength: number;
  markPrice: number;
  /** Chỉ có khi kind = WALL_PULLED */
  spoofScore?: number;
  reason: string;
  /** Thời điểm ghi nhận cảnh báo */
  detectedAt?: number;
}

/** Khóa ổn định theo giá tuyệt đối — không đổi khi mark price biến động giữa các lần quét. */
export function priceKeyForWall(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  if (price >= 10_000) return Math.round(price * 10) / 10;
  if (price >= 100) return Math.round(price * 100) / 100;
  if (price >= 1) return Math.round(price * 1_000) / 1_000;
  return Math.round(price * 10_000) / 10_000;
}

export function wallRecordKey(side: WhaleRadarSide, priceKey: number): string {
  return `${side}:${priceKey}`;
}

export function extractWallsFromHeatmap(
  symbol: AppTradeSymbol,
  markPrice: number,
  heatmap: LiquidityHeatmapResult,
  scannedAt: number,
  prevWalls: WhaleWallRecord[] = [],
  wallMeta: Record<string, WhaleWallGhostMeta> = {},
): WhaleWallRecord[] {
  const minNotional = WHALE_MIN_NOTIONAL_USD[symbol];
  const prevByKey = new Map(prevWalls.map((w) => [wallRecordKey(w.side, w.priceKey), w]));

  const walls: WhaleWallRecord[] = [];
  for (const point of heatmap.points) {
    if (point.type !== 'ORDERBOOK_WALL') continue;
    if (point.side !== 'BID' && point.side !== 'ASK') continue;
    if (point.strength < WHALE_MIN_STRENGTH) continue;

    const notionalUsd = point.price * point.volume;
    if (notionalUsd < minNotional) continue;

    const pk = priceKeyForWall(point.price);
    const key = wallRecordKey(point.side, pk);
    const prev = prevByKey.get(key);
    const ghost = wallMeta[key];

    let executedVolumeUSD = prev?.executedVolumeUSD ?? 0;
    let refreshCount = prev?.refreshCount ?? 0;
    let disappearReappearCount =
      prev?.disappearReappearCount ?? ghost?.disappearReappearCount ?? 0;

    if (prev) {
      if (notionalUsd < prev.notionalUsd) {
        executedVolumeUSD += prev.notionalUsd - notionalUsd;
      }
      if (notionalUsd >= prev.notionalUsd * 1.5) {
        refreshCount += 1;
      }
    }

    walls.push({
      priceKey: pk,
      price: point.price,
      qty: point.volume,
      side: point.side,
      notionalUsd,
      strength: point.strength,
      firstSeenAt: prev?.firstSeenAt ?? scannedAt,
      executedVolumeUSD,
      refreshCount,
      disappearReappearCount,
    });
  }

  return walls.sort((a, b) => b.notionalUsd - a.notionalUsd);
}

/** Cập nhật ghost meta sau khi phát hiện tường bị gỡ. */
export function bumpWallMetaOnPullEvents(
  wallMeta: Record<string, WhaleWallGhostMeta>,
  events: WhaleRadarEvent[],
): Record<string, WhaleWallGhostMeta> {
  const next = { ...wallMeta };
  for (const event of events) {
    if (event.kind !== 'WALL_PULLED') continue;
    const key = wallRecordKey(event.side, priceKeyForWall(event.price));
    next[key] = {
      disappearReappearCount: (next[key]?.disappearReappearCount ?? 0) + 1,
    };
  }
  return next;
}

function proximityPct(wallPrice: number, markPrice: number): number {
  if (!Number.isFinite(wallPrice) || !Number.isFinite(markPrice) || markPrice <= 0) {
    return Infinity;
  }
  return (Math.abs(wallPrice - markPrice) / markPrice) * 100;
}

function findWall(
  walls: WhaleWallRecord[],
  side: WhaleRadarSide,
  priceKey: number,
): WhaleWallRecord | undefined {
  return walls.find((w) => w.side === side && w.priceKey === priceKey);
}

function formatNotional(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

/** So sánh 2 snapshot sổ lệnh — phát hiện đặt / gỡ lệnh lớn. */
export function detectWhaleRadarEvents(
  prev: SymbolBookSnapshot | null,
  curr: SymbolBookSnapshot,
): WhaleRadarEvent[] {
  if (!prev) return [];

  const events: WhaleRadarEvent[] = [];
  const minNotional = WHALE_MIN_NOTIONAL_USD[curr.symbol];

  for (const wall of curr.walls) {
    const prevWall = findWall(prev.walls, wall.side, wall.priceKey);
    const isNewPlacement =
      !prevWall || wall.notionalUsd >= prevWall.notionalUsd * 1.5;

    if (isNewPlacement && wall.notionalUsd >= minNotional) {
      events.push({
        symbol: curr.symbol,
        kind: 'WALL_PLACED',
        side: wall.side,
        price: wall.price,
        notionalUsd: wall.notionalUsd,
        strength: wall.strength,
        markPrice: curr.markPrice,
        reason: `${wall.side === 'BID' ? 'Bid' : 'Ask'} ${formatNotional(wall.notionalUsd)} · ${wall.strength.toFixed(1)}× TB`,
      });
    }
  }

  for (const prevWall of prev.walls) {
    if (prevWall.notionalUsd < minNotional || prevWall.strength < WHALE_MIN_STRENGTH) {
      continue;
    }

    const currWall = findWall(curr.walls, prevWall.side, prevWall.priceKey);
    const pulled =
      !currWall || currWall.notionalUsd < prevWall.notionalUsd * WHALE_PULL_RATIO;

    if (!pulled) continue;

    const dist = proximityPct(prevWall.price, curr.markPrice);
    const ageMs = curr.scannedAt - prevWall.firstSeenAt;
    const shortLived = ageMs <= WHALE_RADAR_INTERVAL_MS * 2;
    const nearPrice = dist <= WHALE_SPOOF_PROXIMITY_PCT;

    let spoofScore = 0;
    if (nearPrice) spoofScore += 2;
    if (shortLived) spoofScore += 2;
    if (prevWall.strength >= WHALE_MIN_STRENGTH * 1.5) spoofScore += 1;

    const spoofLike = spoofScore >= 2;
    const reasonParts = [
      `Gỡ ${formatNotional(prevWall.notionalUsd)}`,
      prevWall.side === 'BID' ? 'bid' : 'ask',
      nearPrice ? `cách giá ${dist.toFixed(2)}%` : `cách giá ${dist.toFixed(2)}%`,
      shortLived ? 'tồn tại ngắn' : null,
      spoofLike ? '⚠ spoof' : null,
    ].filter(Boolean);

    events.push({
      symbol: curr.symbol,
      kind: 'WALL_PULLED',
      side: prevWall.side,
      price: prevWall.price,
      notionalUsd: prevWall.notionalUsd,
      strength: prevWall.strength,
      markPrice: curr.markPrice,
      spoofScore,
      reason: reasonParts.join(' · '),
    });
  }

  return events;
}

export function alertLockKey(event: WhaleRadarEvent): string {
  const pk = priceKeyForWall(event.price);
  return `${event.symbol}:${event.kind}:${event.side}:${pk}`;
}

