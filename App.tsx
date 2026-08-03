import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Alert, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppHydrationGate } from './components/AppHydrationGate';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PsychologyModal } from './components/PsychologyModal';
import { RealTimeClock } from './components/RealTimeClock';
import { HeaderBar } from './components/dashboard/HeaderBar';
import {
  TradeAppDisabledOverlay,
  useTradeAppKeyboardLock,
} from './components/dashboard/TradeAppDisabledOverlay';
import { SignalBoard } from './components/dashboard/SignalBoard';
import { SignalBoardUnified } from './components/dashboard/SignalBoardUnified';
import { V41BoardRC3 } from './components/v41/V41BoardRC3';
import { ActiveTradesPanel } from './components/journal/ActiveTradesPanel';
import type { ManualTradeSetup } from './components/TradeRecommendationTable';
import {
  ConfirmTradeWizard,
  type ConfirmTradeValues,
} from './components/journal/ConfirmTradeWizard';
import { PendingLimitModal } from './components/journal/PendingLimitModal';
import { MilestoneUpgradeModal } from './components/capital/MilestoneUpgradeModal';
import { SettingsScreen } from './screens/SettingsScreen';
import { IS_APK_THIN_CLIENT, IS_DESKTOP_ANALYSIS_UI } from './constants/platformUi';
import {
  COLORS,
  DEFAULT_SETTINGS,
  LAYER_NAMES,
  type AnalysisTimeframe,
  type AppTradeSymbol,
  type MarketRegime,
  type TradeDirection,
} from './constants/scoring';
import { RADIUS, SPACING } from './constants/theme';
import { vi } from './constants/vi';
import { useAutoSessionNotification } from './hooks/useAutoSessionNotification';
import { usePriceLevelAlerts } from './hooks/usePriceLevelAlerts';
import { usePendingOrderFill } from './hooks/usePendingOrderFill';
import { useMarketAnalysis } from './hooks/useMarketAnalysis';
import { useSignalBoard } from './hooks/useSignalBoard';
import { useUnifiedAppScan } from './hooks/useUnifiedAppScan';
import { useV41TradeSessionAdviser } from './hooks/useV41TradeSessionAdviser';
import { WhaleRadarToast } from './components/WhaleRadarToast';
import { useWhaleRadar } from './hooks/useWhaleRadar';
import { useWebVisibilityRescan } from './hooks/useWebVisibilityRescan';
import { useResponsiveLayout } from './hooks/useResponsiveLayout';
import { SessionNotificationToggle } from './components/SessionNotificationToggle';
import { startForegroundScanService } from './services/foregroundScanService';
import { installNotificationHandler } from './services/localNotification';
import { requestNotificationPermission } from './services/notificationService';
import { registerBackgroundPositionCheck } from './tasks/backgroundPositionTask';
import { syncBackgroundSessionTaskRegistration } from './services/sessionNotification';
import { registerWebPersistGuard } from './services/webPersistGuard';
import { registerNativePersistGuard } from './services/nativePersistGuard';
import { registerWebTabSync } from './services/webDataSync';
import { computeDailyLossUsdt, derivePsychology, startAutoRefresh, toScoringPsychologyChecklist, useTradeStore } from './store/useTradeStore';
import { useTradeAppState } from './store/useTradeAppState';
import {
  initialDriveSyncState,
  useDriveSyncLifecycle,
} from './hooks/useDriveSyncLifecycle';
import { pullFromDrive, syncAll } from './services/driveSyncService';
import type { SyncState } from './types/driveSync';
import { buildSnapshotsFromSignalRow, buildLockedTradePlanInput, resolveAdxRegimeForLegacyJournal, resolveStructureSlSourceForLegacyJournal, resolveVwapZoneForLegacyJournal, resolveVwapEntryQualityForLegacyJournal } from './services/journalService';
import {
  inferSkipReasonFromSignalRow,
  resolveSkipPriceFromSignalRow,
} from './services/skippedSetupService';
import { effectiveTradeDirection } from './services/signalRowView';
import { isLimitEntryAwaitingFill } from './utils/pendingOrderFill';
import { tradePlanV3ToLegacyPlan } from './services/tradePlanV3';
import { JournalScreen } from './screens/JournalScreen';
import { InsightsScreen } from './screens/InsightsScreen';
import { SystemPerformanceScreen } from './screens/SystemPerformanceScreen';
import { useLockedPlanMonitor } from './hooks/useLockedPlanMonitor';
import type { SignalRow } from './hooks/useSignalBoard';
import {
  loadScoringPanels,
  saveScoringPanels,
  type ScoringPanelKey,
} from './components/dashboard/ScoringVisibilityBar';

type AppTab = 'signals' | 'journal' | 'insights' | 'performance' | 'settings';

const DESKTOP_TABS: readonly { id: AppTab; label: string; shortLabel: string }[] = [
  { id: 'signals', label: 'Tín hiệu', shortLabel: 'Tín hiệu' },
  { id: 'journal', label: 'Nhật ký', shortLabel: 'NK' },
  { id: 'insights', label: 'Thống kê', shortLabel: 'TK' },
  { id: 'performance', label: 'Hiệu suất HT', shortLabel: 'HT' },
  { id: 'settings', label: 'Cài đặt', shortLabel: 'Cài đặt' },
];

/** APK thin client — Signal + Settings only (Task 14.5). */
const APK_TABS: readonly { id: AppTab; label: string; shortLabel: string }[] = [
  { id: 'signals', label: 'Tín hiệu', shortLabel: 'Tín hiệu' },
  { id: 'settings', label: 'Cài đặt', shortLabel: 'Cài đặt' },
];

function legacyPlanForSetup(row: SignalRow, setup?: ManualTradeSetup) {
  if ((setup?.planSource === 'v3' || setup?.planSource === 'v4') && row.tradePlanV3) {
    return tradePlanV3ToLegacyPlan(row.tradePlanV3);
  }
  return row.tradePlan;
}

async function placePendingLimitTrade(
  row: SignalRow,
  setup: ManualTradeSetup,
  limitPrice: number,
  analysisTimeframe: AnalysisTimeframe,
): Promise<void> {
  await useTradeStore.getState().addJournalEntry({
    symbol: row.symbol,
    direction: effectiveTradeDirection(row, setup.planSource),
    entryPrice: limitPrice,
    entryTime: Date.now(),
    leverage: setup.leverage,
    size: setup.marginUsdt,
    stopLoss: setup.stopLoss,
    takeProfit1: setup.takeProfit1,
    takeProfit2: setup.takeProfit2,
    takeProfit3: setup.takeProfit3,
    analysisTimeframe,
    status: 'PENDING',
    strategySource: setup.strategySource,
    adxRegime: resolveAdxRegimeForLegacyJournal(row),
    slSource: resolveStructureSlSourceForLegacyJournal(row),
    vwapZone: resolveVwapZoneForLegacyJournal(row),
    vwapEntryQuality: resolveVwapEntryQualityForLegacyJournal(row),
  });

  const snapshots = buildSnapshotsFromSignalRow({
    row,
    entryPrice: limitPrice,
    stopLoss: setup.stopLoss,
    takeProfit1: setup.takeProfit1,
    sizeActual: setup.marginUsdt,
    settings: useTradeStore.getState().settings,
    planSource: setup.planSource,
    scorerVersion: useTradeStore.getState().scorerVersion,
    strategySource: setup.strategySource,
  });
  await useTradeStore.getState().placePendingOrder(
    row.symbol,
    snapshots.market,
    snapshots.scoring,
    snapshots.plan,
    limitPrice,
    setup.strategySource,
    snapshots.adxSnapshot,
    snapshots.structureSLSnapshot,
    snapshots.vwapSnapshot,
  ).then(async (entryId) => {
    await useTradeStore.getState().lockTradePlan(
      buildLockedTradePlanInput({
        pendingEntryId: entryId,
        symbol: row.symbol,
        scoring: snapshots.scoring,
        plan: snapshots.plan,
        market: snapshots.market,
        limitOrderPrice: limitPrice,
      }),
    );
  });
}

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

const fmt = (n: number, digits = 2) =>
  n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

export default function App() {
  const hydrated = useTradeStore((st) => st.hydrated);
  const persistSummary = useTradeStore((st) => st.persistSummary);
  const tradeAppEnabled = useTradeAppState((st) => st.tradeAppEnabled);
  useTradeAppKeyboardLock(!tradeAppEnabled);
  const [prefsReady, setPrefsReady] = useState(false);
  const [symbol, setSymbol] = useState<AppTradeSymbol>('BTCUSDT');
  const [analysisTimeframe, setAnalysisTimeframe] = useState<AnalysisTimeframe>('1h');
  const [regime, setRegime] = useState<MarketRegime>('TRENDING_BULL');
  const [scoringPanels, setScoringPanels] = useState(loadScoringPanels);
  const [showMatrix, setShowMatrix] = useState(false);
  const [showPsychology, setShowPsychology] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>('signals');
  const [signalBoardTab, setSignalBoardTab] = useState<'v4' | 'v41' | 'unified'>('unified');
  const [settingsFocusCapital, setSettingsFocusCapital] = useState(false);

  useEffect(() => {
    if (!IS_APK_THIN_CLIENT) return;
    if (activeTab !== 'signals' && activeTab !== 'settings') {
      setActiveTab('signals');
      setSettingsFocusCapital(false);
    }
  }, [activeTab]);
  const [confirmRow, setConfirmRow] = useState<SignalRow | null>(null);
  const [confirmSetup, setConfirmSetup] = useState<ManualTradeSetup | null>(null);
  const [pendingRow, setPendingRow] = useState<SignalRow | null>(null);
  const [pendingSetup, setPendingSetup] = useState<ManualTradeSetup | null>(null);
  const [journalToast, setJournalToast] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>(initialDriveSyncState);
  const aiTradeJournal = useTradeStore((st) => st.aiTradeJournal);
  const getStaleOpenTrades = useTradeStore((st) => st.getStaleOpenTrades);
  const lockedPlan = useTradeStore((st) => st.lockedPlan);
  const tradeJournalForPsy = useTradeStore((st) => st.tradeJournal);
  const settingsForPsy = useTradeStore((st) => st.settings);
  const capitalManagement = useTradeStore((st) => st.capitalManagement);
  const milestoneUpgradePreview = useTradeStore((st) => st.milestoneUpgradePreview);
  const confirmMilestoneUpgrade = useTradeStore((st) => st.confirmMilestoneUpgrade);
  const fetchAndAnalyze = useTradeStore((st) => st.fetchAndAnalyze);
  const psychologyChecklist = useTradeStore((st) => st.psychologyChecklist);
  const psychology = useMemo(
    () => derivePsychology(tradeJournalForPsy, settingsForPsy),
    [tradeJournalForPsy, settingsForPsy],
  );
  const scoringPsychology = useMemo(
    () => toScoringPsychologyChecklist(psychologyChecklist, tradeJournalForPsy, settingsForPsy),
    [psychologyChecklist, tradeJournalForPsy, settingsForPsy],
  );
  const scoringContext = useMemo(
    () => ({
      consecutiveLosses: psychology.consecutiveLosses,
      consecutiveLossesIn24h: psychology.consecutiveLossesIn24h,
      lossStreakLocked: psychology.lossStreakLocked,
      lossStreakLockUntil: psychology.lossStreakLockUntil,
      dailyLossUSDT: computeDailyLossUsdt(tradeJournalForPsy),
      recentJournal: aiTradeJournal.slice(-30).map((e) => ({ outcome: e.outcome })),
      currentCapital: settingsForPsy.accountSize,
      initialCapital: settingsForPsy.initialCapital,
    }),
    [
      psychology.consecutiveLosses,
      psychology.consecutiveLossesIn24h,
      psychology.lossStreakLocked,
      psychology.lossStreakLockUntil,
      tradeJournalForPsy,
      aiTradeJournal,
      settingsForPsy.accountSize,
      settingsForPsy.initialCapital,
    ],
  );
  const market = useMarketAnalysis(
    symbol,
    analysisTimeframe,
    psychology,
    scoringPsychology,
    scoringContext,
  );
  const signalBoard = useSignalBoard(analysisTimeframe, { pauseAutoScan: true });
  const { runUnifiedScan, v41Rows, v41Cards, v41Loading, v41LastScannedAt } = useUnifiedAppScan(
    signalBoard.scan,
    ['NEARUSDT', 'SOLUSDT', 'BNBUSDT', 'BTCUSDT'],
  );
  useV41TradeSessionAdviser(v41Rows, v41Loading);
  const lockedPlanMonitor = useLockedPlanMonitor({
    rows: signalBoard.rows,
    timeframe: analysisTimeframe,
    psychologyChecklist: scoringPsychology,
    btcChange24h: market.btcChange24h,
  });
  const whaleRadar = useWhaleRadar();
  useWebVisibilityRescan(() => void runUnifiedScan(true), signalBoard.lastScannedAt);
  const s = settingsForPsy;
  const riskPct = ((s.maxLossPerTrade / s.accountSize) * 100).toFixed(1);

  const goToCapitalSettings = () => {
    setSettingsFocusCapital(true);
    setActiveTab('settings');
  };

  const handleCapitalUpdated = () => {
    void runUnifiedScan(true);
    void fetchAndAnalyze();
  };

  const handleMilestoneConfirm = () => {
    void confirmMilestoneUpgrade().then(() => {
      void runUnifiedScan(true);
      void fetchAndAnalyze();
    });
  };
  const isLive = market.market != null && !market.market.fromCache;

  useEffect(() => {
    if (market.analysis?.regime.regime) {
      setRegime(market.analysis.regime.regime);
    }
  }, [market.analysis?.regime.regime]);

  const setScoringPanelVisible = (key: ScoringPanelKey, visible: boolean) => {
    setScoringPanels((prev) => {
      const next = { ...prev, [key]: visible };
      saveScoringPanels(next);
      return next;
    });
  };

  const sidePanelsVisible =
    scoringPanels.spectrum || scoringPanels.mtf || scoringPanels.engine;

  const tradeJournal = useTradeStore((s) => s.tradeJournal);
  const openTrades = useMemo(
    () => tradeJournal.filter((e) => e.status === 'OPEN'),
    [tradeJournal],
  );
  const openTradeCount = openTrades.length;

  const sessionNotify = useAutoSessionNotification({
    rows: signalBoard.rows,
    loading: signalBoard.loading,
    lastScannedAt: signalBoard.lastScannedAt,
    autoTriggeredAt: signalBoard.autoTriggeredAt,
    openTradeCount,
  });

  usePriceLevelAlerts();
  usePendingOrderFill();

  const handleQuickAnalyze = () => {
    setShowPsychology(false);
    void runUnifiedScan(true);
  };

  const handleRequestConfirmTrade = (
    row: SignalRow,
    setup: ManualTradeSetup,
  ) => {
    setConfirmRow(row);
    setConfirmSetup(setup);
  };

  const handleWizardConfirm = async (values: ConfirmTradeValues) => {
    if (!confirmRow || !confirmSetup) return;
    const row = confirmRow;
    const setup: ManualTradeSetup = {
      ...confirmSetup,
      entryPrice: values.entryPrice,
      stopLoss: values.stopLoss,
      marginUsdt: values.sizeActual,
    };

    const direction = effectiveTradeDirection(row, setup.planSource);
    const markPrice = row.price;
    if (
      markPrice != null &&
      Number.isFinite(markPrice) &&
      isLimitEntryAwaitingFill(direction, markPrice, setup.entryPrice)
    ) {
      await placePendingLimitTrade(row, setup, setup.entryPrice, analysisTimeframe);
      setJournalToast(
        `Đã lưu lệnh chờ ${row.symbol.replace('USDT', '')} ${direction} tại ${setup.entryPrice}`,
      );
      setConfirmRow(null);
      setConfirmSetup(null);
      setActiveTab('signals');
      setTimeout(() => setJournalToast(null), 4000);
      return;
    }

    await useTradeStore.getState().addJournalEntry({
      symbol: row.symbol,
      direction: effectiveTradeDirection(row, setup.planSource),
      entryPrice: setup.entryPrice,
      entryTime: Date.now(),
      leverage: setup.leverage,
      size: setup.marginUsdt,
      stopLoss: setup.stopLoss,
      takeProfit1: setup.takeProfit1,
      takeProfit2: setup.takeProfit2,
      takeProfit3: setup.takeProfit3,
      analysisTimeframe,
      strategySource: setup.strategySource,
      adxRegime: resolveAdxRegimeForLegacyJournal(row),
      slSource: resolveStructureSlSourceForLegacyJournal(row),
      vwapZone: resolveVwapZoneForLegacyJournal(row),
      vwapEntryQuality: resolveVwapEntryQualityForLegacyJournal(row),
    });

    const snapshots = buildSnapshotsFromSignalRow({
      row,
      entryPrice: setup.entryPrice,
      stopLoss: setup.stopLoss,
      takeProfit1: setup.takeProfit1,
      sizeActual: setup.marginUsdt,
      settings: useTradeStore.getState().settings,
      planSource: setup.planSource,
      scorerVersion: useTradeStore.getState().scorerVersion,
      strategySource: setup.strategySource,
    });
    await useTradeStore.getState().addTradeEntry(
      row.symbol,
      snapshots.market,
      snapshots.scoring,
      snapshots.plan,
      [],
      snapshots.fundingAtEntry,
      snapshots.squeezeAtEntry,
      setup.strategySource,
      snapshots.adxSnapshot,
      snapshots.structureSLSnapshot,
      snapshots.vwapSnapshot,
    );

    setJournalToast(
      `Đã lưu lệnh ${row.symbol.replace('USDT', '')} ${row.direction} ${setup.entryPrice}`,
    );
    setConfirmRow(null);
    setConfirmSetup(null);
    setActiveTab('signals');
    setTimeout(() => setJournalToast(null), 4000);
  };

  const handleOpenPosition = async (
    row: (typeof signalBoard.rows)[number],
    manual = false,
    setup?: ManualTradeSetup,
  ) => {
    const plan = legacyPlanForSetup(row, setup);
    const entryPrice = setup?.entryPrice ?? plan?.entryPrice ?? row.price;
    if (!entryPrice) return;
    if (!manual && !plan && !setup) return;
    const strategySource = manual ? 'MANUAL' : setup!.strategySource!;
    const direction = effectiveTradeDirection(row, setup?.planSource);
    const markPrice = row.price;

    if (
      markPrice != null &&
      Number.isFinite(markPrice) &&
      isLimitEntryAwaitingFill(direction, markPrice, entryPrice)
    ) {
      const pendingSetup: ManualTradeSetup = setup ?? {
        entryPrice,
        stopLoss: plan?.stopLoss ?? 0,
        takeProfit1: plan?.takeProfit1 ?? 0,
        takeProfit2: plan?.takeProfit2 ?? 0,
        takeProfit3: plan?.takeProfit3 ?? 0,
        marginUsdt: s.sizePerTrade,
        leverage: s.leverage,
        planSource:
          useTradeStore.getState().scorerVersion === 'v3' ? 'v3' : 'v4',
        strategySource,
      };
      await placePendingLimitTrade(row, pendingSetup, entryPrice, analysisTimeframe);
      setJournalToast(
        `Đã lưu lệnh chờ ${row.symbol.replace('USDT', '')} ${direction} tại ${entryPrice}`,
      );
      setActiveTab('signals');
      setTimeout(() => setJournalToast(null), 4000);
      return;
    }

    await useTradeStore.getState().addJournalEntry({
      symbol: row.symbol,
      direction: effectiveTradeDirection(row, setup?.planSource),
      entryPrice,
      entryTime: Date.now(),
      leverage: setup?.leverage ?? s.leverage,
      size: setup?.marginUsdt ?? s.sizePerTrade,
      stopLoss: setup?.stopLoss ?? plan?.stopLoss,
      takeProfit1: setup?.takeProfit1 ?? plan?.takeProfit1,
      takeProfit2: setup?.takeProfit2 ?? plan?.takeProfit2,
      takeProfit3: setup?.takeProfit3 ?? plan?.takeProfit3,
      analysisTimeframe,
      strategySource,
      adxRegime: resolveAdxRegimeForLegacyJournal(row),
      slSource: resolveStructureSlSourceForLegacyJournal(row),
      vwapZone: resolveVwapZoneForLegacyJournal(row),
      vwapEntryQuality: resolveVwapEntryQualityForLegacyJournal(row),
    });

    const snapshots = buildSnapshotsFromSignalRow({
      row,
      entryPrice,
      stopLoss: setup?.stopLoss ?? plan?.stopLoss,
      takeProfit1: setup?.takeProfit1 ?? plan?.takeProfit1,
      sizeActual: setup?.marginUsdt ?? s.sizePerTrade,
      settings: useTradeStore.getState().settings,
      planSource: setup?.planSource,
      scorerVersion: useTradeStore.getState().scorerVersion,
      strategySource,
    });
    await useTradeStore.getState().addTradeEntry(
      row.symbol,
      snapshots.market,
      snapshots.scoring,
      snapshots.plan,
      [],
      snapshots.fundingAtEntry,
      snapshots.squeezeAtEntry,
      strategySource,
      snapshots.adxSnapshot,
      snapshots.structureSLSnapshot,
      snapshots.vwapSnapshot,
    );
    setActiveTab('signals');
  };

  const handleRequestPendingOrder = (
    row: SignalRow,
    setup: ManualTradeSetup,
  ) => {
    setPendingRow(row);
    setPendingSetup(setup);
  };

  const handlePendingLimitConfirm = async (limitPrice: number) => {
    if (!pendingRow || !pendingSetup) return;
    const row = pendingRow;
    const setup: ManualTradeSetup = {
      ...pendingSetup,
      entryPrice: limitPrice,
    };

    await placePendingLimitTrade(row, setup, limitPrice, analysisTimeframe);

    setJournalToast(
      `Đã lưu lệnh chờ ${row.symbol.replace('USDT', '')} ${row.direction} tại ${limitPrice}`,
    );
    setPendingRow(null);
    setPendingSetup(null);
    setActiveTab('signals');
    setTimeout(() => setJournalToast(null), 4000);
  };

  const handleRecordSkippedSetup = (
    row: SignalRow,
    setupDirection?: TradeDirection,
  ) => {
    const direction = setupDirection ?? row.direction;
    const skipPrice = resolveSkipPriceFromSignalRow(row, direction);
    if (skipPrice == null) {
      setJournalToast('Không ghi nhận được — thiếu giá thị trường');
      setTimeout(() => setJournalToast(null), 4000);
      return;
    }
    const totalScore =
      setupDirection === 'LONG'
        ? row.longScore
        : setupDirection === 'SHORT'
          ? row.shortScore
          : row.score;
    const { skipReason, skipReasonDetail } = inferSkipReasonFromSignalRow(row);
    void useTradeStore.getState().addSkippedSetup(
      row.symbol,
      direction,
      totalScore,
      skipReason,
      skipReasonDetail,
      skipPrice,
    );
    const symbolLabel = row.symbol.replace('USDT', '');
    setJournalToast(`✅ Đã ghi nhận setup ${symbolLabel}`);
    setTimeout(() => setJournalToast(null), 4000);
  };

  const handlePendingOrder = async (
    row: (typeof signalBoard.rows)[number],
    setup: ManualTradeSetup,
  ) => {
    handleRequestPendingOrder(row, setup);
  };

  const markPricesBySymbol = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of signalBoard.rows) {
      if (row.price != null && Number.isFinite(row.price)) {
        map[row.symbol] = row.price;
      }
    }
    return map;
  }, [signalBoard.rows]);

  useEffect(() => {
    if (Object.keys(markPricesBySymbol).length === 0) return;
    void useTradeStore.getState().refreshSkippedSetupMarkPrices(markPricesBySymbol);
  }, [markPricesBySymbol]);

  useDriveSyncLifecycle(setSyncState);

  const handleManualSyncPress = useCallback(() => {
    if (Platform.OS === 'web') {
      void pullFromDrive();
      return;
    }
    void syncAll();
  }, []);

  useEffect(() => {
    let stopAutoRefresh = () => {};
    let unregisterWebPersist = () => {};
    let unregisterTabSync = () => {};
    let unregisterNativePersist = () => {};

    void (async () => {
      await useTradeStore.getState().hydrate();

      if (Platform.OS !== 'web') {
        try {
          installNotificationHandler();
          const granted = await requestNotificationPermission();
          await syncBackgroundSessionTaskRegistration();
          if (granted) {
            await registerBackgroundPositionCheck();
          }
          await startForegroundScanService();
        } catch {
          // Native notifications optional on this platform
        }
        unregisterNativePersist = registerNativePersistGuard(useTradeStore);
      }

      unregisterWebPersist = registerWebPersistGuard(useTradeStore);
      unregisterTabSync = registerWebTabSync(useTradeStore);
      stopAutoRefresh = startAutoRefresh(useTradeStore);
    })();

    return () => {
      unregisterNativePersist();
      unregisterWebPersist();
      unregisterTabSync();
      stopAutoRefresh();
    };
  }, []);

  useEffect(() => {
    if (!hydrated || prefsReady) return;
    const st = useTradeStore.getState();
    setSymbol(st.selectedSymbol);
    setAnalysisTimeframe(st.analysisTimeframe);
    setPrefsReady(true);
  }, [hydrated, prefsReady]);

  const staleAlertShown = useRef(false);

  useEffect(() => {
    if (!hydrated || staleAlertShown.current) return;
    const stale = getStaleOpenTrades();
    if (stale.length === 0) return;
    staleAlertShown.current = true;
    const e = stale[0]!;
    Alert.alert(
      'Lệnh đang mở',
      `Bạn có lệnh ${e.symbol.replace('USDT', '')} ${e.scoring.direction} đang mở từ hơn 24h. Hãy cập nhật kết quả trong Nhật ký.`,
    );
  }, [hydrated, aiTradeJournal, getStaleOpenTrades]);

  useEffect(() => {
    if (!prefsReady) return;
    useTradeStore.getState().setSelectedSymbol(symbol);
  }, [symbol, prefsReady]);

  useEffect(() => {
    if (!prefsReady) return;
    useTradeStore.getState().setAnalysisTimeframe(analysisTimeframe);
  }, [analysisTimeframe, prefsReady]);

  const suggestedDirection =
    market.suggestedDirection ??
    market.fullAnalysis?.suggestedDirection ??
    (market.analysis?.smc.trend === 'BEARISH' ? 'SHORT' : 'LONG');

  const scorerVersion = useTradeStore((st) => st.scorerVersion);
  const storeScoringV3 = useTradeStore((st) => st.scoringResultV3);
  const scoreSide = suggestedDirection === 'LONG' ? 'long' : 'short';

  const activeScoreV4 = market.scoringResultV4?.[scoreSide] ?? null;
  const activeScoreV3 = storeScoringV3?.[scoreSide] ?? null;

  const scoringBadge =
    scorerVersion === 'v4'
      ? activeScoreV4?.awaitingRescore
        ? activeScoreV4.decisionLabel
        : activeScoreV4?.decisionLabel
      : activeScoreV3?.decisionLabel;

  const activeTotalScoreDisplay =
    scorerVersion === 'v4'
      ? activeScoreV4?.awaitingRescore
        ? null
        : (activeScoreV4?.officialTotalScore ?? activeScoreV4?.referenceTotalScore ?? null)
      : (activeScoreV3?.totalScore ?? null);

  const { isCompact, isMobile, contentPadding } = useResponsiveLayout();

  return (
    <ErrorBoundary>
      <AppHydrationGate ready={hydrated}>
      <SafeAreaView style={styles.root}>
        {persistSummary &&
        persistSummary.open + persistSummary.pending + persistSummary.closed > 0 ? (
          <View style={styles.persistBanner}>
            <Text style={styles.persistBannerText}>
              {vi.app.persistRestored(
                persistSummary.open,
                persistSummary.pending,
                persistSummary.closed,
              )}
            </Text>
          </View>
        ) : null}
        {journalToast ? (
          <View style={styles.journalToast}>
            <Text style={styles.journalToastText}>{journalToast}</Text>
          </View>
        ) : null}
        <WhaleRadarToast items={whaleRadar.toasts} />
        <StatusBar style="light" />
        <HeaderBar
          timezone={s.timezone}
          refreshInterval={s.refreshInterval}
          isLive={isLive}
          tierName={capitalManagement.currentTier.tierName}
          onTierPress={goToCapitalSettings}
          syncState={syncState}
          onSyncPress={handleManualSyncPress}
        />

        <View style={styles.interactionShell}>
          <View
            style={styles.interactionContent}
            pointerEvents={tradeAppEnabled ? 'auto' : 'none'}
          >
        <View style={[styles.tabBar, isMobile && { paddingHorizontal: contentPadding }]}>
          {(IS_DESKTOP_ANALYSIS_UI ? DESKTOP_TABS : APK_TABS).map(({ id: tab, label, shortLabel }) => (
            <Pressable
              key={tab}
              onPress={() => {
                setActiveTab(tab);
                if (tab !== 'settings') setSettingsFocusCapital(false);
              }}
              style={[
                styles.tabBtn,
                isCompact && styles.tabBtnCompact,
                activeTab === tab && styles.tabBtnActive,
                webPointer,
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  isCompact && styles.tabTextCompact,
                  activeTab === tab && styles.tabTextActive,
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit={isCompact}
                minimumFontScale={0.85}
              >
                {isCompact ? shortLabel : label}
              </Text>
            </Pressable>
          ))}
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { padding: contentPadding, paddingBottom: SPACING.xxl + SPACING.md },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {IS_DESKTOP_ANALYSIS_UI && activeTab === 'journal' ? (
            <View style={styles.section}>
              <JournalScreen signalRows={signalBoard.rows} v41Rows={v41Rows} />
            </View>
          ) : IS_DESKTOP_ANALYSIS_UI && activeTab === 'insights' ? (
            <View style={styles.section}>
              <InsightsScreen />
            </View>
          ) : IS_DESKTOP_ANALYSIS_UI && activeTab === 'performance' ? (
            <View style={styles.section}>
              <SystemPerformanceScreen />
            </View>
          ) : activeTab === 'settings' ? (
            <View style={styles.section}>
              <SettingsScreen
                focusCapital={settingsFocusCapital}
                onCapitalUpdated={handleCapitalUpdated}
              />
            </View>
          ) : (
          <>
          <View style={styles.dashBar}>
            <RealTimeClock />
            <View style={styles.dashActions}>
              <SessionNotificationToggle
                supported={sessionNotify.supported}
                enabled={sessionNotify.enabled}
                permission={sessionNotify.permission}
                onEnable={() => void sessionNotify.enable()}
                onDisable={() => void sessionNotify.disable()}
                onTest={() => sessionNotify.sendTest()}
              />
              {/* Quick Analysis = Trading Layer (APK + Desktop). Not Intelligence. */}
              <Pressable
                onPress={() => setShowPsychology(true)}
                style={({ pressed }) => [styles.quickBtn, pressed && styles.quickBtnPressed, webPointer]}
              >
                <Text style={styles.quickBtnText}>⚡ {vi.psychology.open}</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.signalBoardTabRow}>
              {(
                [
                  { id: 'unified' as const, label: '⭐ Tổng hợp' },
                  { id: 'v4' as const, label: 'V3/V4' },
                  { id: 'v41' as const, label: 'V4.1' },
                ] as const
              ).map(({ id, label }) => {
                const active = signalBoardTab === id;
                return (
                  <Pressable
                    key={id}
                    onPress={() => setSignalBoardTab(id)}
                    style={[
                      styles.signalBoardTabBtn,
                      active && styles.signalBoardTabBtnActive,
                      webPointer,
                    ]}
                  >
                    <Text
                      style={[
                        styles.signalBoardTabText,
                        active && styles.signalBoardTabTextActive,
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {signalBoardTab === 'unified' && (
              <SignalBoardUnified
                symbols={['NEARUSDT', 'SOLUSDT', 'BNBUSDT', 'BTCUSDT']}
                onRequestScan={() => void runUnifiedScan(true)}
              />
            )}
            {signalBoardTab === 'v4' ? (
              <SignalBoard
                rows={signalBoard.rows}
                loading={signalBoard.loading}
                lastScannedAt={signalBoard.lastScannedAt}
                autoTriggeredAt={signalBoard.autoTriggeredAt}
                onScan={() => void runUnifiedScan(true)}
                tierName={capitalManagement.currentTier.tierName}
                onTierPress={goToCapitalSettings}
                onOpenPosition={handleOpenPosition}
                onRequestConfirmTrade={handleRequestConfirmTrade}
                onRequestPendingOrder={handleRequestPendingOrder}
                onPendingOrder={handlePendingOrder}
                onRecordSkippedSetup={handleRecordSkippedSetup}
                lockedPlanOverlay={
                  lockedPlan && lockedPlan.status === 'WAITING'
                    ? {
                        symbol: lockedPlan.symbol,
                        direction: lockedPlan.lockedDirection,
                        lockedScore: lockedPlan.lockedScore,
                        decisionLabel: lockedPlan.lockedScoringSnapshot.decision,
                      }
                    : null
                }
                lockedPlanMonitor={lockedPlanMonitor}
              />
            ) : signalBoardTab === 'v41' ? (
              <V41BoardRC3
                cards={v41Cards}
                rows={v41Rows}
                loading={v41Loading}
                lastScannedAt={v41LastScannedAt}
                onRequestScan={() => void runUnifiedScan(true)}
              />
            ) : null}
          </View>

          {signalBoardTab === 'v4' ? (
            <View style={styles.section}>
              <ActiveTradesPanel signalRows={signalBoard.rows} v41Rows={v41Rows} />
            </View>
          ) : null}

          {/* Task 14.6.1 — Signal tab trading-only: Intelligence / advanced analysis panels removed. */}

          </>
          )}

          <Text style={styles.footer}>{vi.app.footer(LAYER_NAMES.length)}</Text>
        </ScrollView>

        <MilestoneUpgradeModal
          visible={milestoneUpgradePreview != null}
          preview={milestoneUpgradePreview}
          onConfirm={handleMilestoneConfirm}
        />

        <PsychologyModal
          visible={showPsychology}
          onClose={() => setShowPsychology(false)}
          onConfirm={handleQuickAnalyze}
        />

        <ConfirmTradeWizard
          visible={confirmRow != null}
          row={confirmRow}
          defaultEntry={confirmSetup?.entryPrice}
          defaultSl={confirmSetup?.stopLoss}
          defaultSize={confirmSetup?.marginUsdt}
          onCancel={() => {
            setConfirmRow(null);
            setConfirmSetup(null);
          }}
          onConfirm={(values) => void handleWizardConfirm(values)}
        />

        <PendingLimitModal
          visible={pendingRow != null}
          row={pendingRow}
          defaultLimitPrice={
            pendingSetup?.entryPrice ??
            pendingRow?.tradePlan?.entryZone?.optimal ??
            pendingRow?.tradePlan?.entryPrice
          }
          onCancel={() => {
            setPendingRow(null);
            setPendingSetup(null);
          }}
          onConfirm={(limitPrice) => void handlePendingLimitConfirm(limitPrice)}
        />
          </View>
          {!tradeAppEnabled ? <TradeAppDisabledOverlay /> : null}
        </View>
      </SafeAreaView>
      </AppHydrationGate>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  interactionShell: {
    flex: 1,
    position: 'relative',
  },
  interactionContent: {
    flex: 1,
  },
  persistBanner: {
    backgroundColor: 'rgba(14, 203, 129, 0.1)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(14, 203, 129, 0.25)',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  persistBannerText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.bullish,
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: SPACING.xl,
    paddingBottom: SPACING.xxl + SPACING.md,
    maxWidth: 1240,
    width: '100%',
    alignSelf: 'center',
  },
  section: {
    marginBottom: SPACING.xxl,
  },
  signalBoardTabRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  signalBoardTabBtn: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  signalBoardTabBtnActive: {
    borderColor: COLORS.accent,
    backgroundColor: '#F0B90B18',
  },
  signalBoardTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  signalBoardTabTextActive: {
    color: COLORS.accent,
  },
  dashBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  dashActions: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  quickBtn: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.accent,
  },
  quickBtnPressed: {
    opacity: 0.85,
  },
  quickBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#02110A',
  },
  matrixWrap: {
    marginBottom: SPACING.md,
  },
  metricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  twoCol: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
    alignItems: 'flex-start',
  },
  colFull: {
    flex: 1,
    minWidth: '100%',
  },
  colSide: {
    flex: 1,
    minWidth: 0,
  },
  spacer: {
    height: SPACING.md,
  },
  engineCard: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
  },
  engineTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  configRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: SPACING.md,
  },
  configLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    flex: 1,
  },
  configValue: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textPrimary,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  footer: {
    marginTop: SPACING.xl,
    textAlign: 'center',
    fontSize: 10,
    color: COLORS.textMuted,
    letterSpacing: 0.3,
    lineHeight: 16,
  },
  tabBar: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.sm,
    maxWidth: 1240,
    width: '100%',
    alignSelf: 'center',
  },
  tabBtn: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
  },
  tabBtnCompact: {
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  tabBtnActive: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(14, 203, 129, 0.1)',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  tabTextCompact: {
    fontSize: 10,
  },
  tabTextActive: {
    color: COLORS.accent,
  },
  journalToast: {
    backgroundColor: 'rgba(14, 203, 129, 0.15)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(14, 203, 129, 0.3)',
    paddingHorizontal: SPACING.lg,
    paddingVertical: 8,
  },
  journalToastText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.bullish,
    textAlign: 'center',
  },
});
