import { describe, expect, it } from 'vitest';
import {
  SCAN_INTERVAL_MINUTES,
  SCAN_INTERVAL_MS,
  SCAN_INTERVAL_SECONDS,
} from './scanSchedule';

describe('scanSchedule', () => {
  it('uses 60 second interval everywhere', () => {
    expect(SCAN_INTERVAL_SECONDS).toBe(60);
    expect(SCAN_INTERVAL_MS).toBe(60_000);
    expect(SCAN_INTERVAL_MINUTES).toBe(1);
  });
});
