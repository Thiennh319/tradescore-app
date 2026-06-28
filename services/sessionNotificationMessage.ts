import type { AppTradeSymbol } from '../constants/scoring';
import { symbolLabelVi, vi } from '../constants/vi';

export interface SessionCheckSummary {
  time: Date;
  setups: Array<{
    symbol: AppTradeSymbol;
    direction: 'LONG' | 'SHORT';
    score: number;
  }>;
  openTradeCount: number;
}

export interface SessionCheckMessage {
  title: string;
  body: string;
}

export function buildSessionCheckMessage(
  summary: SessionCheckSummary,
  isTest = false,
): SessionCheckMessage {
  const timeLabel = summary.time.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const setupText =
    summary.setups.length > 0
      ? summary.setups
          .slice(0, 3)
          .map((s) => `${symbolLabelVi(s.symbol)} ${s.direction} ${s.score.toFixed(1)}đ`)
          .join(' · ')
      : vi.notify.noSetup;

  const openPart =
    summary.openTradeCount > 0
      ? vi.notify.openTrades(summary.openTradeCount)
      : vi.notify.noOpenTrades;

  return {
    title: isTest ? vi.notify.testTitle(timeLabel) : vi.notify.title(timeLabel),
    body: `${setupText}. ${openPart}. ${vi.notify.action}`,
  };
}
