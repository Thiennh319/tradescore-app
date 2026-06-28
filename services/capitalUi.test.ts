import { describe, expect, it } from 'vitest';
import {
  calculateCapitalTier,
  checkMilestoneUpgrade,
  computeMilestoneProgress,
  confirmMilestoneUpgrade,
  processAccountSizeUpdate,
} from './capitalManagement';
import { DEFAULT_SETTINGS } from '../constants/scoring';
import {
  CAPITAL_STATE_STORAGE_KEY,
} from './capitalStatePersistence';

describe('capital UI progress & milestone modal', () => {
  const initial = { ...DEFAULT_SETTINGS };

  it('capital=39.10 → progress ≈ 50%, không modal', () => {
    const last = 34;
    const target = calculateCapitalTier(last, 34).nextMilestone;
    const progress = computeMilestoneProgress(39.1, last, target);
    expect(progress).toBeCloseTo(50, 0);
    const result = processAccountSizeUpdate(39.1, initial);
    expect(result.milestoneUpgradePreview).toBeNull();
    expect(result.pendingUpgrade).toBe(false);
  });

  it('capital=44.20 → progress 100%, modal upgrade', () => {
    const last = 34;
    const target = calculateCapitalTier(last, 34).nextMilestone;
    const progress = computeMilestoneProgress(44.2, last, target);
    expect(progress).toBe(100);
    const result = processAccountSizeUpdate(44.2, initial);
    expect(result.pendingUpgrade).toBe(true);
    expect(result.milestoneUpgradePreview).not.toBeNull();
    expect(result.milestoneUpgradePreview?.toTierName).toBe('GD2');
    expect(result.settings.lastMilestoneCapital).toBe(34);
  });

  it('sau confirm GD2, capital=57.5 → modal GD3', () => {
    const afterGd1 = confirmMilestoneUpgrade(
      processAccountSizeUpdate(44.2, initial).settings,
    );
    expect(afterGd1.settings.lastMilestoneCapital).toBe(44.2);
    const gd3 = processAccountSizeUpdate(57.5, afterGd1.settings);
    expect(gd3.milestoneUpgradePreview?.fromTierName).toBe('GD2');
    expect(gd3.milestoneUpgradePreview?.toTierName).toBe('GD3');
    expect(checkMilestoneUpgrade(57.5, 44.2)).toBe(true);
  });
});

describe('capital_state persistence', () => {
  it('lưu và khôi phục tier sau restart (in-memory)', () => {
    const memory = new Map<string, string>();
    const payload = {
      currentCapital: 44.2,
      initialCapital: 34,
      lastMilestoneCapital: 44.2,
      updatedAt: Date.now(),
      milestoneJournal: ['milestone_upgrade: GD1→GD2, capital: 44.20'],
    };
    memory.set(CAPITAL_STATE_STORAGE_KEY, JSON.stringify(payload));
    const raw = memory.get(CAPITAL_STATE_STORAGE_KEY);
    const loaded = raw ? (JSON.parse(raw) as typeof payload) : null;
    expect(loaded?.currentCapital).toBe(44.2);
    expect(loaded?.lastMilestoneCapital).toBe(44.2);
    const tier = calculateCapitalTier(loaded!.currentCapital, loaded!.initialCapital);
    expect(tier.tierName).toBe('GD2');
    expect(tier.sizePerTrade).toBe(7.8);
  });

  it('uses storage key capital_state', () => {
    expect(CAPITAL_STATE_STORAGE_KEY).toBe('capital_state');
  });
});

describe('processAccountSizeUpdate defer milestone', () => {
  it('chờ confirm trước khi cập nhật lastMilestoneCapital', () => {
    const { settings, pendingUpgrade } = processAccountSizeUpdate(44.2, {
      ...DEFAULT_SETTINGS,
    });
    expect(pendingUpgrade).toBe(true);
    expect(settings.lastMilestoneCapital).toBe(34);
    expect(settings.sizePerTrade).toBe(7.8);
  });

  it('confirmMilestoneUpgrade cập nhật lastMilestone và journal note', () => {
    const pending = processAccountSizeUpdate(44.2, { ...DEFAULT_SETTINGS });
    const confirmed = confirmMilestoneUpgrade(pending.settings);
    expect(confirmed.settings.lastMilestoneCapital).toBe(44.2);
    expect(confirmed.journalNote).toContain('GD1→GD2');
    expect(confirmed.journalNote).toContain('44.20');
  });
});

describe('tier badge label', () => {
  it('hiển thị đúng tier name theo vốn', () => {
    expect(calculateCapitalTier(34, 34).tierName).toBe('GD1');
    expect(calculateCapitalTier(44.2, 34).tierName).toBe('GD2');
    expect(calculateCapitalTier(57.46, 34).tierName).toBe('GD3');
  });
});
