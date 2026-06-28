import { describe, expect, it } from 'vitest';
import {
  buildProminentBlockReasons,
  collectHardBlockReasons,
  isBlockedFinalDecision,
  resolveFinalEntryDecision,
  shouldShowExpectedValue,
  shouldShowTpLevels,
  shouldShowWaitBanner,
} from './tradePlanDisplay';

describe('resolveFinalEntryDecision', () => {
  it('hardBlocked → HARD_BLOCK', () => {
    expect(
      resolveFinalEntryDecision({
        decisionLabel: 'VAO_TU_TIN',
        hardBlocked: true,
      }),
    ).toBe('HARD_BLOCK');
  });

  it('awaitingRescore → CHO_TAI_CHAM', () => {
    expect(
      resolveFinalEntryDecision({
        decisionLabel: 'CO_THE_VAO',
        hardBlocked: false,
        awaitingRescore: true,
      }),
    ).toBe('CHO_TAI_CHAM');
  });
});

describe('collectHardBlockReasons', () => {
  it('ưu tiên hard blocks theo hướng', () => {
    expect(
      collectHardBlockReasons({
        direction: 'LONG',
        mandatoryViolations: ['other'],
        longHardBlocks: ['BTC -2.5% — chặn Long'],
        hardBlocked: true,
      }),
    ).toEqual(['BTC -2.5% — chặn Long']);
  });
});

describe('buildProminentBlockReasons', () => {
  it('format HARD BLOCK prefix', () => {
    const lines = buildProminentBlockReasons(
      'HARD_BLOCK',
      { blockReasons: [] },
      ['BTC -2.5% — chặn Long'],
    );
    expect(lines[0]).toBe('❌ HARD BLOCK: BTC -2.5% — chặn Long');
  });

  it('format R:R block từ plan', () => {
    const lines = buildProminentBlockReasons(
      'KHONG_VAO',
      { blockReasons: ['R:R 1.85:1 < tối thiểu 2:1 — không vào'] },
      [],
    );
    expect(lines[0]).toContain('R:R 1.85:1');
  });
});

describe('visibility flags', () => {
  it('KHONG_VAO → ẩn TP và EV', () => {
    expect(isBlockedFinalDecision('KHONG_VAO')).toBe(true);
    expect(shouldShowTpLevels('KHONG_VAO')).toBe(false);
    expect(shouldShowExpectedValue('KHONG_VAO')).toBe(false);
    expect(shouldShowWaitBanner('KHONG_VAO')).toBe(false);
  });

  it('HARD_BLOCK → ẩn TP và EV', () => {
    expect(shouldShowTpLevels('HARD_BLOCK')).toBe(false);
    expect(shouldShowExpectedValue('HARD_BLOCK')).toBe(false);
  });

  it('CHO_THEM → banner chờ', () => {
    expect(shouldShowWaitBanner('CHO_THEM')).toBe(true);
    expect(shouldShowTpLevels('CHO_THEM')).toBe(true);
  });

  it('VAO_TU_TIN → hiển thị đầy đủ', () => {
    expect(shouldShowTpLevels('VAO_TU_TIN')).toBe(true);
    expect(shouldShowWaitBanner('VAO_TU_TIN')).toBe(false);
  });
});
