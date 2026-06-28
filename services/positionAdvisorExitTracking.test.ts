import { describe, expect, it } from 'vitest';
import type { AiTradeJournalEntry } from '../constants/aiJournal';
import type { PositionRecommendation } from './positionAdvisorV3';
import { migrateAiJournalEntry } from './phase1Migration';
import { exportJournalToCSV } from './exportService';
import {
  advisorActionCompactLabel,
  advisorActionDisplayLabel,
  followedAdvisorFromManualReason,
  formatAdvisorExitFieldForDisplay,
  mapRecommendationToAdvisorActionAtExit,
} from './positionAdvisorExitTracking';
import { calculateAdvisorFollowStats, countAdvisorExitNa } from './actualWinrate';

function holdStrongRec(): PositionRecommendation {
  return {
    type: 'HOLD',
    label: 'Giữ lệnh — momentum mạnh',
    color: '#0ECB81',
    confidence: 0.85,
    reasons: ['PnL dương'],
    urgency: 'LOW',
    matchedRuleCount: 2,
    triggeredBy: 'HOLD_STRONG',
  };
}

function closeNowRec(): PositionRecommendation {
  return {
    type: 'CLOSE_NOW',
    label: 'Đóng ngay — tín hiệu yếu',
    color: '#F6465D',
    confidence: 0.9,
    reasons: ['Score giảm'],
    urgency: 'HIGH',
    matchedRuleCount: 3,
    triggeredBy: 'CLOSE_NOW',
  };
}

function closedEntry(
  overrides: Partial<AiTradeJournalEntry> = {},
): AiTradeJournalEntry {
  const base = migrateAiJournalEntry({
    id: 't-advisor',
    timestamp: Date.parse('2026-06-14T03:00:00.000Z'),
    symbol: 'NEARUSDT',
    outcome: { status: 'WIN', pnlUSDT: 1.5, exitPrice: 2.21 },
    scoring: {
      totalScore: 11,
      direction: 'LONG',
      decision: 'VAO_TU_TIN',
    },
  });
  if (!base) throw new Error('migrate failed');
  return { ...base, ...overrides };
}

describe('positionAdvisorExitTracking', () => {
  it('Test 1: HOLD_STRONG — chọn ngược khuyến nghị → followed=false', () => {
    const action = mapRecommendationToAdvisorActionAtExit(holdStrongRec());
    expect(action).toBe('HOLD_STRONG');
    expect(advisorActionCompactLabel(action)).toContain('GIỮ LỆNH');
    expect(followedAdvisorFromManualReason('CUT_LOSS_MANUAL')).toBe(false);
    expect(followedAdvisorFromManualReason('FOLLOW_ADVISOR')).toBe(true);
  });

  it('Test 2: CLOSE_NOW — chọn theo khuyến nghị → followed=true', () => {
    const action = mapRecommendationToAdvisorActionAtExit(closeNowRec());
    expect(action).toBe('CLOSE_NOW');
    expect(advisorActionCompactLabel(action)).toContain('ĐÓNG LỆNH');
    expect(followedAdvisorFromManualReason('FOLLOW_ADVISOR')).toBe(true);
    expect(followedAdvisorFromManualReason('TAKE_PROFIT_MANUAL')).toBe(false);
  });

  it('Test 3: lệnh cũ thiếu field — migrate không crash, stats hiển thị N/A', () => {
    const entry = migrateAiJournalEntry({
      id: 'aj_old',
      timestamp: 1_700_000_000_000,
      symbol: 'BTCUSDT',
      outcome: { status: 'WIN', pnlUSDT: 5 },
      scoring: { totalScore: 10, direction: 'LONG', decision: 'VAO_TU_TIN' },
    });
    expect(entry).not.toBeNull();
    expect(entry?.positionAdvisorActionAtExit).toBeUndefined();
    expect(entry?.followedAdvisorRecommendation).toBeUndefined();
    expect(formatAdvisorExitFieldForDisplay(entry?.positionAdvisorActionAtExit)).toBe('N/A');

    const rows = calculateAdvisorFollowStats([closedEntry()]);
    expect(rows.every((r) => !r.hasData)).toBe(true);
    expect(rows[0]?.trades).toBe(0);
    expect(countAdvisorExitNa([closedEntry()])).toBe(1);
  });

  it('Test 4: CSV export có 4 cột advisor exit với giá trị đúng', async () => {
    const entry = closedEntry({
      positionAdvisorActionAtExit: 'CLOSE_NOW',
      followedAdvisorRecommendation: true,
      scoringDecisionAtExit: 'VAO_TU_TIN',
      planHealthAtExit: 'STRONG',
    });
    const csv = await exportJournalToCSV([entry]);
    const [header, row] = csv.split('\n');
    expect(header).toContain('positionAdvisorActionAtExit');
    expect(header).toContain('followedAdvisorRecommendation');
    expect(header).toContain('scoringDecisionAtExit');
    expect(header).toContain('planHealthAtExit');

    const headers = header.split(',');
    const values = row.split(',');
    const idx = (name: string) => headers.indexOf(name);
    expect(values[idx('positionAdvisorActionAtExit')]).toBe('CLOSE_NOW');
    expect(values[idx('followedAdvisorRecommendation')]).toBe('true');
    expect(values[idx('scoringDecisionAtExit')]).toBe('VAO_TU_TIN');
    expect(values[idx('planHealthAtExit')]).toBe('STRONG');
  });
});
