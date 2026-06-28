/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiTradeJournalEntry } from '../../constants/aiJournal';
import { migrateAiJournalEntry } from '../../services/phase1Migration';
import { CloseTradeModal, type CloseTradeResult } from './CloseTradeModal';

const buildCloseAdvisorContextMock = vi.hoisted(() => vi.fn());

vi.mock('../../services/positionAdvisorExitTracking', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../services/positionAdvisorExitTracking')>();
  return {
    ...mod,
    buildCloseAdvisorContext: buildCloseAdvisorContextMock,
  };
});

vi.mock('../../store/useTradeStore', () => ({
  useTradeStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      scorerVersion: 'v4',
      scoringResultV4: null,
      scoringResultV3: null,
      lockedPlan: null,
      settings: { leverage: 5 },
    }),
}));

vi.mock('react-native', async (importOriginal) => {
  const mod = await importOriginal<typeof import('react-native')>();
  return {
    ...mod,
    Platform: { ...mod.Platform, OS: 'web' },
  };
});

function openEntry(): AiTradeJournalEntry {
  const entry = migrateAiJournalEntry({
    id: 'open-1',
    timestamp: Date.now(),
    symbol: 'BNBUSDT',
    outcome: { status: 'OPEN' },
    scoring: { totalScore: 11, direction: 'SHORT', decision: 'VAO_TU_TIN' },
    market: { entryPrice: 582.5, priceAtAnalysis: 580.09 },
    plan: { slProposed: 586, tp1Proposed: 575, sizeProposed: 6.04 },
  });
  if (!entry) throw new Error('entry');
  return entry;
}

function renderModal(onConfirm = vi.fn<(result: CloseTradeResult) => void>()) {
  render(
    <CloseTradeModal
      visible
      entry={openEntry()}
      markPrice={580.09}
      onClose={() => {}}
      onConfirm={onConfirm}
    />,
  );
  return onConfirm;
}

describe('CloseTradeModal', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  beforeEach(() => {
    buildCloseAdvisorContextMock.mockReset();
    buildCloseAdvisorContextMock.mockReturnValue({
      positionAdvisorActionAtExit: 'HOLD_STRONG',
      scoringDecisionAtExit: 'VAO_TU_TIN',
      planHealthAtExit: 'NORMAL',
      recommendationLabel: 'Giữ lệnh',
      hasClearRecommendation: true,
    });
  });

  it('Test 1: hiển thị đúng khuyến nghị HOLD_STRONG → 🟢 GIỮ LỆNH', () => {
    renderModal();
    expect(screen.getByText('🟢 GIỮ LỆNH')).toBeTruthy();
  });

  it('Test 2: nút confirm disabled khi chưa chọn lý do', () => {
    const onConfirm = vi.fn<(result: CloseTradeResult) => void>();
    renderModal(onConfirm);
    fireEvent.click(screen.getByText('Xác nhận đóng'));
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Chốt lời thủ công'));
    fireEvent.click(screen.getByText('Xác nhận đóng'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('Test 3: ghi đúng followedAdvisorRecommendation', () => {
    const onConfirm = vi.fn<(result: CloseTradeResult) => void>();

    buildCloseAdvisorContextMock.mockReturnValueOnce({
      positionAdvisorActionAtExit: 'CLOSE_NOW',
      scoringDecisionAtExit: 'CHO_THEM',
      planHealthAtExit: 'WEAK',
      recommendationLabel: 'Đóng ngay',
      hasClearRecommendation: true,
    });
    renderModal(onConfirm);
    fireEvent.click(screen.getByText('Theo khuyến nghị app'));
    fireEvent.click(screen.getByText('Xác nhận đóng'));
    expect(onConfirm.mock.calls[0][0].followedAdvisorRecommendation).toBe(true);
    expect(onConfirm.mock.calls[0][0].positionAdvisorActionAtExit).toBe('CLOSE_NOW');

    cleanup();
    buildCloseAdvisorContextMock.mockReturnValueOnce({
      positionAdvisorActionAtExit: 'HOLD_STRONG',
      scoringDecisionAtExit: 'VAO_TU_TIN',
      planHealthAtExit: 'NORMAL',
      recommendationLabel: 'Giữ lệnh',
      hasClearRecommendation: true,
    });
    const onConfirm2 = vi.fn<(result: CloseTradeResult) => void>();
    renderModal(onConfirm2);
    fireEvent.click(screen.getByText('Cắt lỗ thủ công'));
    fireEvent.click(screen.getByText('Xác nhận đóng'));
    expect(onConfirm2.mock.calls[0][0].followedAdvisorRecommendation).toBe(false);
    expect(onConfirm2.mock.calls[0][0].positionAdvisorActionAtExit).toBe('HOLD_STRONG');
  });

  it('Test 4: OTHER reason lưu manualExitNote', () => {
    const onConfirm = vi.fn<(result: CloseTradeResult) => void>();
    renderModal(onConfirm);
    fireEvent.click(screen.getByText('Lý do khác'));
    fireEvent.change(screen.getByPlaceholderText('Nhập lý do...'), {
      target: { value: 'Tin tức xấu' },
    });
    fireEvent.click(screen.getByText('Xác nhận đóng'));
    expect(onConfirm.mock.calls[0][0].manualExitReason).toBe('OTHER');
    expect(onConfirm.mock.calls[0][0].manualExitNote).toBe('Tin tức xấu');
  });
});
