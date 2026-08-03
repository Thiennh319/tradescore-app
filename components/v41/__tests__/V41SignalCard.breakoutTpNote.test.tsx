/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  BREAKOUT_TP_MIRROR_NOTE,
  V41SignalCard,
} from '../V41SignalCard';
import type { V41Rc3SignalCardModel } from '../v41Rc3Types';

vi.mock('../../../hooks/useResponsiveLayout', () => ({
  useResponsiveLayout: () => ({
    signalCardLayout: {},
    isMobile: false,
    isCompact: false,
    contentPadding: 16,
    useJournalCards: false,
  }),
}));

afterEach(() => {
  cleanup();
});

function baseCard(
  overrides: Partial<V41Rc3SignalCardModel> = {},
): V41Rc3SignalCardModel {
  return {
    symbol: 'NEARUSDT',
    displayName: 'NEAR',
    triggerType: null,
    confidence: null,
    gate: {
      signalsPassed: 0,
      signalsRequired: 3,
      signalsTotal: 4,
      confidenceTr: null,
      confidenceMin: 50,
      signalsMet: false,
      confidenceMet: false,
      activeEligible: false,
    },
    checklist: [
      { id: 'cvd_flip', label: 'CVD Flip', passed: false },
      { id: 'volume', label: 'Volume Confirm', passed: false },
      { id: 'structure', label: 'Structure Break', passed: false },
      { id: 'exhaustion', label: 'Exhaustion', passed: false },
    ],
    levels: {
      entry: 2.45,
      stop: 2.37,
      tp1: 2.57,
      tp2: 2.57,
      tp3: 2.57,
      rr: 1.5,
    },
    decision: 'LONG',
    fetchedAt: 1_720_000_000_000,
    ...overrides,
  };
}

describe('V41SignalCard — breakout TP mirror note', () => {
  it('shows "TP1 only · 1.5R" when triggerType is Breakout Confirmed', () => {
    render(
      <V41SignalCard
        card={baseCard({ triggerType: 'Breakout Confirmed' })}
        nowMs={1_720_000_000_000}
      />,
    );
    expect(screen.getByText(BREAKOUT_TP_MIRROR_NOTE)).toBeTruthy();
    expect(screen.getByTestId('breakout-tp-mirror-note')).toBeTruthy();
  });

  it('does not show the note for Trend Reversal cards', () => {
    render(
      <V41SignalCard
        card={baseCard({
          symbol: 'BTCUSDT',
          displayName: 'BTC',
          triggerType: 'Trend Reversal',
          levels: {
            entry: 65000,
            stop: 64000,
            tp1: 66500,
            tp2: 67000,
            tp3: 67500,
            rr: 1.5,
          },
        })}
        nowMs={1_720_000_000_000}
      />,
    );
    expect(screen.queryByText(BREAKOUT_TP_MIRROR_NOTE)).toBeNull();
    expect(screen.queryByTestId('breakout-tp-mirror-note')).toBeNull();
  });

  it('does not show the note when levels are hidden', () => {
    render(
      <V41SignalCard
        card={baseCard({
          triggerType: 'Breakout Confirmed',
          levels: null,
          decision: 'WATCH',
        })}
        nowMs={1_720_000_000_000}
      />,
    );
    expect(screen.queryByText(BREAKOUT_TP_MIRROR_NOTE)).toBeNull();
  });
});
