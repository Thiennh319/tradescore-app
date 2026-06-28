import { describe, expect, it } from 'vitest';
import {
  buildWhaleRadarMessage,
  formatWhaleEventLine,
} from './whaleRadarNotificationMessage';
import type { WhaleRadarEvent } from './whaleRadarDetect';

const placed: WhaleRadarEvent = {
  symbol: 'SOLUSDT',
  kind: 'WALL_PLACED',
  side: 'ASK',
  price: 142.5,
  notionalUsd: 6_240_000,
  strength: 7.4,
  markPrice: 142.1,
  reason: 'test',
};

const pulled: WhaleRadarEvent = {
  ...placed,
  kind: 'WALL_PULLED',
  spoofScore: 2,
};

describe('formatWhaleEventLine', () => {
  it('formats placed wall as one short line', () => {
    expect(formatWhaleEventLine(placed)).toBe(
      'Cá mập đang đặt tường lớn BÁN ở SOL ở giá 142.5',
    );
  });

  it('formats pulled wall as one short line', () => {
    expect(formatWhaleEventLine(pulled)).toBe(
      'Cá mập gỡ tường lớn BÁN ở SOL ở giá 142.5',
    );
  });

  it('shows MUA for bid wall', () => {
    const bid = { ...placed, side: 'BID' as const };
    expect(formatWhaleEventLine(bid)).toContain('MUA');
  });
});

describe('buildWhaleRadarMessage', () => {
  it('uses the same line for OS notification body', () => {
    const msg = buildWhaleRadarMessage(placed);
    expect(msg.body).toBe(formatWhaleEventLine(placed));
    expect(msg.title).toBe('Radar Cá Mập');
  });
});
