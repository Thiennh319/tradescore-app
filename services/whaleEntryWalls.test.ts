import { describe, expect, it, beforeEach } from 'vitest';
import { buildWhaleEntryWalls } from './whaleEntryWalls';
import { setWhaleRadarSnapshotsSync } from './whaleRadarPersist';
import { priceKeyForWall } from './whaleRadarDetect';

describe('buildWhaleEntryWalls', () => {
  const scannedAt = Date.now();
  const firstSeenAt = scannedAt - 200_000;

  beforeEach(() => {
    setWhaleRadarSnapshotsSync({
      BTCUSDT: {
        symbol: 'BTCUSDT',
        scannedAt,
        markPrice: 100,
        walls: [
          {
            priceKey: priceKeyForWall(99.85),
            price: 99.85,
            qty: 1_000_000,
            side: 'BID',
            notionalUsd: 99_850_000,
            strength: 40,
            firstSeenAt,
            executedVolumeUSD: 10_000_000,
            refreshCount: 1,
            disappearReappearCount: 0,
          },
        ],
      },
    });
  });

  it('drops walls hugging market (< 0.10 ATR)', () => {
    const currentPrice = 100;
    const atr = 1;
    const pools = [
      {
        price: 99.95,
        volume: 1_000_000,
        strength: 40,
        type: 'ORDERBOOK_WALL' as const,
      },
      {
        price: 99.85,
        volume: 1_000_000,
        strength: 40,
        type: 'ORDERBOOK_WALL' as const,
      },
    ];

    const walls = buildWhaleEntryWalls('BTCUSDT', currentPrice, atr, pools, scannedAt);
    expect(walls.bidWalls.some((w) => w.price === 99.95)).toBe(false);
    expect(walls.bidWalls.some((w) => w.price === 99.85)).toBe(true);
  });
});
