import { describe, expect, it } from 'vitest';
import {
  calculateCapitalTier,
  checkMilestoneUpgrade,
  processAccountSizeUpdate,
} from './capitalManagement';
import { DEFAULT_SETTINGS } from '../constants/scoring';

describe('calculateCapitalTier', () => {
  it('capital=34, initial=34 → GD1', () => {
    const t = calculateCapitalTier(34, 34);
    expect(t.tierName).toBe('GD1');
    expect(t.sizePerTrade).toBe(6.0);
    expect(t.maxLossPerTrade).toBe(1.5);
    expect(t.maxLossPerDay).toBe(3.0);
    expect(t.nextMilestone).toBe(44.2);
    expect(t.notionalPerTrade).toBe(30.0);
    expect(t.slDistancePercent).toBeCloseTo(0.05, 5);
  });

  it('capital=44.2, initial=34 → GD2', () => {
    const t = calculateCapitalTier(44.2, 34);
    expect(t.tierName).toBe('GD2');
    expect(t.sizePerTrade).toBe(7.8);
    expect(t.maxLossPerTrade).toBe(1.95);
    expect(t.maxLossPerDay).toBe(3.9);
    expect(t.nextMilestone).toBe(57.46);
  });

  it('capital=57.5, initial=34 → GD3', () => {
    const t = calculateCapitalTier(57.5, 34);
    expect(t.tierName).toBe('GD3');
    expect(t.sizePerTrade).toBe(10.15);
    expect(t.maxLossPerTrade).toBe(2.54);
    expect(t.maxLossPerDay).toBe(5.08);
    expect(t.nextMilestone).toBeCloseTo(74.7, 1);
  });

  it('capital=100, initial=34 → GD5', () => {
    const t = calculateCapitalTier(100, 34);
    expect(t.tierName).toBe('GD5');
    expect(t.sizePerTrade).toBe(17.65);
    expect(t.maxLossPerTrade).toBe(4.41);
    expect(t.maxLossPerDay).toBe(8.82);
  });

  it('capital=97, initial=34 → GD4 (chưa đủ ngưỡng GD5)', () => {
    const t = calculateCapitalTier(97, 34);
    expect(t.tierName).toBe('GD4');
    expect(t.sizePerTrade).toBe(17.12);
    expect(t.maxLossPerTrade).toBe(4.28);
    expect(t.maxLossPerDay).toBe(8.56);
  });
});

describe('checkMilestoneUpgrade', () => {
  it('current=44.2, lastMilestone=34 → true', () => {
    expect(checkMilestoneUpgrade(44.2, 34)).toBe(true);
  });

  it('current=43.9, lastMilestone=34 → false', () => {
    expect(checkMilestoneUpgrade(43.9, 34)).toBe(false);
  });

  it('current=57.5, lastMilestone=44.2 → true', () => {
    expect(checkMilestoneUpgrade(57.5, 44.2)).toBe(true);
  });
});

describe('processAccountSizeUpdate', () => {
  it('áp dụng tier mới nhưng giữ lastMilestone chờ modal', () => {
    const { settings, pendingUpgrade, milestoneUpgradePreview } = processAccountSizeUpdate(
      44.2,
      { ...DEFAULT_SETTINGS },
    );
    expect(pendingUpgrade).toBe(true);
    expect(settings.lastMilestoneCapital).toBe(34);
    expect(settings.sizePerTrade).toBe(7.8);
    expect(settings.maxLossPerTrade).toBe(1.95);
    expect(milestoneUpgradePreview?.toTierName).toBe('GD2');
  });
});
