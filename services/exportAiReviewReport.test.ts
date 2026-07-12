/**
 * AI Review Report export — tests (UL-03 / UL-03.1).
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_ESM_BRIDGE_STATE } from '../store/esmBridgeTypes';
import {
  AI_REVIEW_REPORT_FILENAME,
  exportAiReviewReport,
} from './exportAiReviewReport';

describe('exportAiReviewReport — UL-03.1', () => {
  it('exports single markdown with required sections', () => {
    const md = exportAiReviewReport({
      generatedAt: '2026-07-12T14:00:00.000Z',
      scorerVersion: 'v4',
      signalRows: [],
      esmBridge: DEFAULT_ESM_BRIDGE_STATE,
      journalEntries: [],
      pendingOrders: [],
      runningOrders: [],
      closedTrades: [],
      accountHistory: [],
      testCount: 428,
    });

    expect(md.startsWith('# TradeScore AI Review')).toBe(true);
    expect(md).toContain('## System Version');
    expect(md).toContain('## Architecture Version');
    expect(md).toContain('## Freeze Version');
    expect(md).toContain('## Feature Flags');
    expect(md).toContain('## Signals');
    expect(md).toContain('## Running Orders');
    expect(md).toContain('## Journal');
    expect(md).toContain('## Recommendation');
    expect(md).toContain('## Entry State');
    expect(md).toContain('## Position Adviser Snapshot');
    expect(md).toContain('## Entry / SL / TP');
    expect(md).toContain('## Trade History');
    expect(md).toContain('## Statistics');
    expect(md).toContain('## RuleBook Summary');
    expect(md).toContain('## Audit Summary');
    expect(md).toContain('## Open Reason / Close Reason');
    expect(md).toContain('## End Report');
    expect(md).toContain('# Architecture Version Matrix');
    expect(md).toContain('# Feature Flags');
    expect(md).toContain('UI Layer');
    expect(md).toContain('UL-03.2');
    expect(md).not.toContain('.zip');
  });

  it('uses canonical filename constant', () => {
    expect(AI_REVIEW_REPORT_FILENAME).toBe('TradeScore_AI_Review.md');
  });
});
