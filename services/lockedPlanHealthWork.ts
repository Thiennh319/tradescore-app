import { pickSignalRowForSymbol } from './lockedPlanMonitorService';
import { buildPlanHealthFromSignalRow } from './planHealth';
import { evaluatePendingPlanAdvisor } from './pendingPlanAdvisor';
import type { SignalRow } from './signalBoardScan';

/** Cập nhật plan health và auto-cancel khi multi-confirmation — gọi sau mỗi scan 60s. */
export async function runLockedPlanHealthCheck(rows: SignalRow[]): Promise<void> {
  const { useTradeStore } = await import('../store/useTradeStore');
  const state = useTradeStore.getState();
  state.checkPlanExpiry();

  const plan = useTradeStore.getState().lockedPlan;
  if (!plan || plan.status !== 'WAITING') return;

  const row = pickSignalRowForSymbol(rows, plan.symbol);
  const health = buildPlanHealthFromSignalRow(plan.lockedDirection, row);
  await state.updateLockedPlanHealth(health);

  if (evaluatePendingPlanAdvisor(health).shouldAutoCancel) {
    await state.unlockTradePlan('MULTI_CONFIRMATION_CANCEL');
  }
}
