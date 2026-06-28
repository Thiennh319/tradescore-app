import type { StoredTradeJournalEntry } from '../store/useTradeStore';
import { useTradeStore } from '../store/useTradeStore';
import { isPriceLevelHit } from '../utils/priceLevelHit';
import { resolveAiOpenForLegacy } from '../utils/resolveAiOpenForLegacy';

/**
 * Tự đóng lệnh khi giá chạm SL — ghi aiTradeJournal (SL_HIT) + legacy journal (SL).
 * Theo guideline: đóng tự động → advisor exit fields = null.
 */
export async function autoCloseOnSlHit(
  legacyEntry: StoredTradeJournalEntry,
  markPrice: number,
  options?: { offlineClose?: boolean },
): Promise<boolean> {
  if (legacyEntry.status !== 'OPEN') return false;

  const sl = legacyEntry.stopLoss;
  if (sl == null || !Number.isFinite(sl)) return false;
  if (!isPriceLevelHit(legacyEntry.direction, markPrice, sl, 'SL')) return false;

  const state = useTradeStore.getState();
  const aiOpen = resolveAiOpenForLegacy(
    legacyEntry,
    state.aiTradeJournal,
    state.currentOpenDataTrade,
  );

  if (aiOpen) {
    await state.closeTradeEntry(aiOpen.id, {
      exitPrice: markPrice,
      exitReason: 'SL_HIT',
      offlineClose: options?.offlineClose === true,
      positionAdvisorActionAtExit: null,
      followedAdvisorRecommendation: null,
      scoringDecisionAtExit: null,
      planHealthAtExit: null,
      manualExitReason: null,
      manualExitNote: null,
    });
    return true;
  }

  if (legacyEntry.id) {
    await state.closeJournalEntry(legacyEntry.id, {
      exitPrice: markPrice,
      closeReason: 'SL',
    });
    return true;
  }

  return false;
}
