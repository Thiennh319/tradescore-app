import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AnalysisTimeframe, AppTradeSymbol, PsychologyChecklistV2 } from '../constants/scoring';
import {
  pickSignalRowForSymbol,
  rebalanceAnalysisInputPrice,
  refreshLockedPlanMonitorContext,
} from '../services/lockedPlanMonitorService';
import type { SignalRow } from '../services/signalBoardScan';
import type { AnalysisInput } from '../services/analysisInput';
import {
  getEntryZonePriceStatus,
  scoreInEntryZoneMode,
  shouldCancelLockedPlan,
  type CancelReason,
  type EntryZonePriceStatus,
  type EntryZoneScoringResult,
} from '../services/lockedPlanScoring';
import { buildPlanHealthFromSignalRow } from '../services/planHealth';
import { evaluatePendingPlanAdvisor } from '../services/pendingPlanAdvisor';
import type { PlanHealth } from '../types/tradePlan';
import { useTradeStore } from '../store/useTradeStore';
import { subscribeScanMarketSnapshots } from '../services/scanMarketSnapshotStore';
import { useResumeableBinanceInterval } from './useResumeableBinanceInterval';

const MONITOR_INTERVAL_MS = 30_000;

interface CancelWarning {
  reason: CancelReason;
  message: string;
}

export interface LockedPlanMonitorOptions {
  rows: SignalRow[];
  timeframe: AnalysisTimeframe;
  psychologyChecklist: PsychologyChecklistV2;
  btcChange24h: number;
}

export function useLockedPlanMonitor(options: LockedPlanMonitorOptions) {
  const lockedPlan = useTradeStore((s) => s.lockedPlan);
  const settings = useTradeStore((s) => s.settings);
  const checkPlanExpiry = useTradeStore((s) => s.checkPlanExpiry);
  const updateLockedPlanHealth = useTradeStore((s) => s.updateLockedPlanHealth);
  const unlockTradePlan = useTradeStore((s) => s.unlockTradePlan);
  const getTodayStats = useTradeStore((s) => s.getTodayStats);

  const [context, setContext] = useState<{
    price: number;
    analysisInput: AnalysisInput;
  } | null>(null);
  const [cancelWarning, setCancelWarning] = useState<CancelWarning | null>(null);
  const [entryZoneResult, setEntryZoneResult] = useState<EntryZoneScoringResult | null>(null);
  const [planHealth, setPlanHealth] = useState<PlanHealth | null>(null);

  const activePlan = lockedPlan?.status === 'WAITING' ? lockedPlan : null;

  const rowForPlan = useMemo(
    () => (activePlan ? pickSignalRowForSymbol(options.rows, activePlan.symbol) : undefined),
    [activePlan, options.rows],
  );

  const currentPrice = rowForPlan?.price ?? context?.price ?? null;

  useEffect(() => {
    if (!activePlan?.expiresAt) return;

    const fireIfExpired = () => {
      checkPlanExpiry();
    };

    fireIfExpired();

    const msUntilExpiry = activePlan.expiresAt - Date.now();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (msUntilExpiry > 0) {
      timeoutId = setTimeout(fireIfExpired, msUntilExpiry + 50);
    }

    const backupId = setInterval(fireIfExpired, 15_000);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      clearInterval(backupId);
    };
  }, [activePlan?.id, activePlan?.expiresAt, checkPlanExpiry]);

  const runMonitorTick = useCallback(
    (
      plan: NonNullable<typeof activePlan>,
      baseInput: AnalysisInput,
      price: number,
      row?: SignalRow,
    ) => {
      checkPlanExpiry();
      const freshPlan = useTradeStore.getState().lockedPlan;
      if (!freshPlan || freshPlan.status !== 'WAITING' || freshPlan.id !== plan.id) {
        return;
      }

      const health = buildPlanHealthFromSignalRow(freshPlan.lockedDirection, row);
      setPlanHealth(health);
      void updateLockedPlanHealth(health);

      const advisor = evaluatePendingPlanAdvisor(health);
      if (advisor.shouldAutoCancel) {
        setCancelWarning(null);
        void unlockTradePlan('MULTI_CONFIRMATION_CANCEL');
        return;
      }

      const input = rebalanceAnalysisInputPrice(baseInput, price);
      const cancelCheck = shouldCancelLockedPlan(freshPlan, input, price, settings);
      setCancelWarning(
        cancelCheck.cancel && cancelCheck.reason
          ? {
              reason: cancelCheck.reason,
              message: cancelCheck.message ?? 'Nên hủy kế hoạch chờ',
            }
          : null,
      );
      setEntryZoneResult(scoreInEntryZoneMode(input, freshPlan, getTodayStats()));
    },
    [checkPlanExpiry, settings, getTodayStats, updateLockedPlanHealth, unlockTradePlan],
  );

  useEffect(() => {
    if (!activePlan) {
      setContext(null);
      setCancelWarning(null);
      setEntryZoneResult(null);
      setPlanHealth(null);
    }
  }, [activePlan]);

  /** Hydrate analysisInput from Unified snapshot (no full Binance market fetch). */
  const hydrateFromShared = useCallback(
    async (fetchTicker: boolean) => {
      const plan = useTradeStore.getState().lockedPlan;
      if (!plan || plan.status !== 'WAITING') return;

      checkPlanExpiry();
      const planAfterExpiry = useTradeStore.getState().lockedPlan;
      if (!planAfterExpiry || planAfterExpiry.status !== 'WAITING') return;

      const result = await refreshLockedPlanMonitorContext(
        planAfterExpiry.symbol as AppTradeSymbol,
        options.timeframe,
        options.psychologyChecklist,
        options.btcChange24h,
        { fetchTicker },
      );
      if (!result) return;

      setContext(result);
      const row = pickSignalRowForSymbol(options.rows, planAfterExpiry.symbol);
      const rowPrice = row?.price;
      runMonitorTick(planAfterExpiry, result.analysisInput, rowPrice ?? result.price, row);
    },
    [
      checkPlanExpiry,
      options.timeframe,
      options.psychologyChecklist,
      options.btcChange24h,
      options.rows,
      runMonitorTick,
    ],
  );

  useEffect(() => {
    if (!activePlan) return;
    void hydrateFromShared(false);
    return subscribeScanMarketSnapshots(() => {
      void hydrateFromShared(false);
    });
  }, [activePlan?.id, activePlan?.symbol, hydrateFromShared]);

  // Between Unified scans: ticker-only (weight 1), keep analysisInput from snapshot.
  useResumeableBinanceInterval(
    () => hydrateFromShared(true),
    MONITOR_INTERVAL_MS,
    {
      enabled: activePlan != null,
      runOnMount: false,
    },
  );

  useEffect(() => {
    if (!activePlan || !context?.analysisInput || currentPrice == null) return;
    runMonitorTick(activePlan, context.analysisInput, currentPrice, rowForPlan);
  }, [activePlan, context?.analysisInput, currentPrice, rowForPlan, runMonitorTick]);

  const entryZoneStatus: EntryZonePriceStatus = useMemo(() => {
    if (!activePlan || currentPrice == null) return 'ABOVE';
    return getEntryZonePriceStatus(
      currentPrice,
      activePlan.entryZone.rangeLow,
      activePlan.entryZone.rangeHigh,
    );
  }, [activePlan, currentPrice]);

  const liveLayerScores = useMemo(() => {
    if (!entryZoneResult) return {};
    return {
      l5: entryZoneResult.liveLayers.l5,
      l6: entryZoneResult.liveLayers.l6,
      l8: entryZoneResult.liveLayers.l8,
      l9: entryZoneResult.liveLayers.l9,
    };
  }, [entryZoneResult]);

  const handleConfirmFill = useCallback(() => {
    void unlockTradePlan('FILLED', currentPrice ?? undefined);
  }, [unlockTradePlan, currentPrice]);

  const handleCancel = useCallback(() => {
    void unlockTradePlan(cancelWarning?.reason ?? 'USER_MANUAL');
  }, [unlockTradePlan, cancelWarning]);

  const handlePlanExpired = useCallback(() => {
    checkPlanExpiry();
  }, [checkPlanExpiry]);

  const displayPlanHealth = planHealth ?? activePlan?.planHealth ?? null;

  return {
    lockedPlan: activePlan,
    currentPrice,
    entryZoneStatus,
    entryZoneResult,
    liveLayerScores,
    planHealth: displayPlanHealth,
    cancelWarning: cancelWarning ?? undefined,
    handleConfirmFill,
    handleCancel,
    handlePlanExpired,
  };
}
