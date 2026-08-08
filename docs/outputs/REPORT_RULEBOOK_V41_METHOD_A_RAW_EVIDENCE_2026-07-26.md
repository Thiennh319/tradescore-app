# RAW EVIDENCE — Method A verify (no code changes)

**Date:** 2026-07-26  
**Command tsc:** `npx tsc --noEmit -p tsconfig.json`  
**tsc exit:** 2  
**Lines in tsc output:** 398  
**Paths containing `services/v41Export/` in tsc list:** 0 — **KHÔNG** (0 dòng)

---

## 1. TSC — NGUYÊN VĂN TOÀN BỘ

Also saved at: `docs/outputs/_tsc_full_method_a_verify.txt`

```
App.tsx(49,44): error TS2307: Cannot find module './services/foregroundScanService' or its corresponding type declarations.
App.tsx(50,44): error TS2307: Cannot find module './services/localNotification' or its corresponding type declarations.
App.tsx(52,49): error TS2307: Cannot find module './tasks/backgroundPositionTask' or its corresponding type declarations.
App.tsx(55,44): error TS2307: Cannot find module './services/nativePersistGuard' or its corresponding type declarations.
App.tsx(115,45): error TS2345: Argument of type '"v3" | "v4" | "v2" | undefined' is not assignable to parameter of type 'ScorerVersion | undefined'.
  Type '"v2"' is not assignable to type 'ScorerVersion | undefined'.
App.tsx(345,52): error TS2345: Argument of type '"v3" | "v4" | "v2" | undefined' is not assignable to parameter of type 'ScorerVersion | undefined'.
  Type '"v2"' is not assignable to type 'ScorerVersion | undefined'.
App.tsx(365,47): error TS2345: Argument of type '"v3" | "v4" | "v2" | undefined' is not assignable to parameter of type 'ScorerVersion | undefined'.
  Type '"v2"' is not assignable to type 'ScorerVersion | undefined'.
App.tsx(426,52): error TS2345: Argument of type '"v3" | "v4" | "v2" | undefined' is not assignable to parameter of type 'ScorerVersion | undefined'.
  Type '"v2"' is not assignable to type 'ScorerVersion | undefined'.
App.tsx(457,47): error TS2345: Argument of type '"v3" | "v4" | "v2" | undefined' is not assignable to parameter of type 'ScorerVersion | undefined'.
  Type '"v2"' is not assignable to type 'ScorerVersion | undefined'.
components/dashboard/ScoreSpectrum.tsx(58,40): error TS2769: No overload matches this call.
  Overload 1 of 2, '(props: ViewProps): View', gave the following error.
    Type '{ left: string; }' is not assignable to type 'ViewStyle | Falsy | RecursiveArray<ViewStyle | Falsy> | readonly (ViewStyle | Falsy)[]'.
      Types of property 'left' are incompatible.
        Type 'string' is not assignable to type 'DimensionValue | undefined'.
  Overload 2 of 2, '(props: ViewProps, context: any): View', gave the following error.
    Type '{ left: string; }' is not assignable to type 'ViewStyle | Falsy | RecursiveArray<ViewStyle | Falsy> | readonly (ViewStyle | Falsy)[]'.
      Types of property 'left' are incompatible.
        Type 'string' is not assignable to type 'DimensionValue | undefined'.
components/dashboard/SignalBoard.tsx(1526,17): error TS2322: Type 'number | null' is not assignable to type 'number'.
  Type 'null' is not assignable to type 'number'.
components/dashboard/SignalBoard.tsx(1555,24): error TS18048: 'adxGate' is possibly 'undefined'.
components/dashboard/SignalBoard.tsx(1571,24): error TS18047: 'displayScore' is possibly 'null'.
components/dashboard/SignalBoard.tsx(1613,23): error TS2322: Type '{ A: number; B: number; C: number; } | undefined' is not assignable to type 'GroupScores'.
  Type 'undefined' is not assignable to type 'GroupScores'.
components/dashboard/SignalBoard.tsx(1614,23): error TS2322: Type 'string[] | undefined' is not assignable to type 'string[]'.
  Type 'undefined' is not assignable to type 'string[]'.
components/dashboard/SignalBoard.tsx(1619,21): error TS2322: Type '{ detail: L6DetailV4 | undefined; longScore: number; shortScore: number; activeDirection: TradeDirection; } | undefined' is not assignable to type 'L6LayerExpandV4Props | undefined'.
  Type '{ detail: L6DetailV4 | undefined; longScore: number; shortScore: number; activeDirection: TradeDirection; }' is not assignable to type 'L6LayerExpandV4Props'.
    Types of property 'detail' are incompatible.
      Type 'L6DetailV4 | undefined' is not assignable to type 'L6DetailV4'.
        Type 'undefined' is not assignable to type 'L6DetailV4'.
components/dashboard/SignalBoard.tsx(1631,21): error TS2322: Type '{ squeezeRisk: SqueezeRiskResult | undefined; } | undefined' is not assignable to type 'L11LayerExpandV4Props | undefined'.
  Type '{ squeezeRisk: SqueezeRiskResult | undefined; }' is not assignable to type 'L11LayerExpandV4Props'.
    Types of property 'squeezeRisk' are incompatible.
      Type 'SqueezeRiskResult | undefined' is not assignable to type 'SqueezeRiskResult'.
        Type 'undefined' is not assignable to type 'SqueezeRiskResult'.
components/dashboard/SignalBoard.tsx(1643,37): error TS2322: Type 'ADXAnalysis | undefined' is not assignable to type 'ADXAnalysis'.
  Type 'undefined' is not assignable to type 'ADXAnalysis'.
components/dashboard/SignalBoard.tsx(1647,33): error TS2322: Type 'StructureSLResult | undefined' is not assignable to type 'StructureSLResult'.
  Type 'undefined' is not assignable to type 'StructureSLResult'.
components/dashboard/SignalBoard.tsx(1652,15): error TS2322: Type 'VWAPResult | undefined' is not assignable to type 'VWAPResult'.
  Type 'undefined' is not assignable to type 'VWAPResult'.
components/dashboard/SignalBoard.tsx(1653,15): error TS2322: Type 'number | null' is not assignable to type 'number'.
  Type 'null' is not assignable to type 'number'.
components/dashboard/SignalBoard.tsx(1845,34): error TS2722: Cannot invoke an object which is possibly 'undefined'.
components/dashboard/SignalBoard.tsx(1868,27): error TS2722: Cannot invoke an object which is possibly 'undefined'.
components/dashboard/SignalBoardUnified.tsx(85,3): error TS2322: Type '{ symbol: string; snapshot: MarketIntelligenceSnapshot; earlyWarning: EarlyWarningSnapshot | undefined; reversalState: ReversalState | undefined; ... 12 more ...; error?: string; }' is not assignable to type 'SignalRowV41'.
  Types of property 'visibilityMode' are incompatible.
    Type 'VisibilityMode | undefined' is not assignable to type 'VisibilityMode'.
      Type 'undefined' is not assignable to type 'VisibilityMode'.
components/dashboard/SignalBoardV41.tsx(294,7): error TS2322: Type '"v41"' is not assignable to type 'ScorerVersion | undefined'.
components/dashboard/TradeHistoryPanel.tsx(158,13): error TS2322: Type '{ readonly cursor: "pointer"; } | { readonly cursor?: undefined; }' is not assignable to type 'Record<string, never> | { cursor: "pointer"; }'.
  Type '{ readonly cursor?: undefined; }' is not assignable to type 'Record<string, never> | { cursor: "pointer"; }'.
    Type '{ readonly cursor?: undefined; }' is not assignable to type '{ cursor: "pointer"; }'.
      Types of property 'cursor' are incompatible.
        Type 'undefined' is not assignable to type '"pointer"'.
components/intelligence/DashboardIntelligencePanel.tsx(130,40): error TS2339: Property 'primary' does not exist on type '{ readonly background: "#0B0E11"; readonly surface: "#1E2329"; readonly surfaceElevated: "#2B3139"; readonly border: "#363A45"; readonly textPrimary: "#EAECEF"; readonly textSecondary: "#848E9C"; ... 12 more ...; readonly overlay: "rgba(11, 14, 17, 0.85)"; }'.
components/journal/EsmRecommendationCell.tsx(2,30): error TS7016: Could not find a declaration file for module 'react-dom'. 'D:/Thiennh3/APP/Trading/TradeScore/node_modules/react-dom/index.js' implicitly has an 'any' type.
  Try `npm i --save-dev @types/react-dom` if it exists or add a new declaration (.d.ts) file containing `declare module 'react-dom';`
components/journal/EsmRecommendationCell.tsx(220,13): error TS2769: No overload matches this call.
  Overload 1 of 2, '(props: ViewProps): View', gave the following error.
    Type '{ children: Element[]; style: (ViewStyle | ImageStyle)[]; onMouseEnter: () => void; onMouseLeave: () => void; }' is not assignable to type 'IntrinsicAttributes & IntrinsicClassAttributes<View> & Readonly<ViewProps>'.
      Property 'onMouseEnter' does not exist on type 'IntrinsicAttributes & IntrinsicClassAttributes<View> & Readonly<ViewProps>'.
  Overload 2 of 2, '(props: ViewProps, context: any): View', gave the following error.
    Type '{ children: Element[]; style: (ViewStyle | ImageStyle)[]; onMouseEnter: () => void; onMouseLeave: () => void; }' is not assignable to type 'IntrinsicAttributes & IntrinsicClassAttributes<View> & Readonly<ViewProps>'.
      Property 'onMouseEnter' does not exist on type 'IntrinsicAttributes & IntrinsicClassAttributes<View> & Readonly<ViewProps>'.
components/journal/EsmRecommendationCell.tsx(348,5): error TS2322: Type '"fixed"' is not assignable to type '"relative" | "absolute" | "static" | undefined'.
components/journal/JournalEntryIntelligenceSection.tsx(135,19): error TS2339: Property 'primary' does not exist on type '{ readonly background: "#0B0E11"; readonly surface: "#1E2329"; readonly surfaceElevated: "#2B3139"; readonly border: "#363A45"; readonly textPrimary: "#EAECEF"; readonly textSecondary: "#848E9C"; ... 12 more ...; readonly overlay: "rgba(11, 14, 17, 0.85)"; }'.
components/journal/JournalReplayTimeline.tsx(107,28): error TS2339: Property 'primary' does not exist on type '{ readonly background: "#0B0E11"; readonly surface: "#1E2329"; readonly surfaceElevated: "#2B3139"; readonly border: "#363A45"; readonly textPrimary: "#EAECEF"; readonly textSecondary: "#848E9C"; ... 12 more ...; readonly overlay: "rgba(11, 14, 17, 0.85)"; }'.
components/PartialCloseConfirmModal.tsx(9,41): error TS2307: Cannot find module '../../constants/aiJournal' or its corresponding type declarations.
components/PartialCloseConfirmModal.tsx(10,24): error TS2307: Cannot find module '../../constants/scoring' or its corresponding type declarations.
components/PartialCloseConfirmModal.tsx(11,33): error TS2307: Cannot find module '../../constants/theme' or its corresponding type declarations.
components/PartialCloseConfirmModal.tsx(12,20): error TS2307: Cannot find module '../../constants/vi' or its corresponding type declarations.
components/PartialCloseConfirmModal.tsx(13,44): error TS2307: Cannot find module '../../services/partialClose' or its corresponding type declarations.
components/PartialCloseConfirmModal.tsx(14,32): error TS2307: Cannot find module '../../utils/formatPrice' or its corresponding type declarations.
components/PartialCloseConfirmModal.tsx(15,37): error TS2307: Cannot find module '../../constants/scoring' or its corresponding type declarations.
components/PendingOrderCard.expiry.test.tsx(18,3): error TS2353: Object literal may only specify known properties, and 'timestamp' does not exist in type 'StoredTradeJournalEntry'.
components/performance/PerformanceHtDashboard.tsx(433,17): error TS2339: Property 'hovered' does not exist on type 'PressableStateCallbackType'.
components/performance/PerformanceHtDashboard.tsx(772,17): error TS2322: Type 'EquityCurveChartData | null' is not assignable to type 'EquityCurveChartData'.
  Type 'null' is not assignable to type 'EquityCurveChartData'.
components/performance/PerformanceHtDashboard.tsx(826,27): error TS2339: Property 'hovered' does not exist on type 'PressableStateCallbackType'.
components/v41/V41ExecutionMonitor.tsx(133,21): error TS2769: No overload matches this call.
  Overload 1 of 2, '(props: ViewProps): View', gave the following error.
    Type '{ fontSize: number; color: "#EAECEF"; fontWeight: "600"; }' is not assignable to type 'ViewStyle | Falsy | RecursiveArray<ViewStyle | Falsy> | readonly (ViewStyle | Falsy)[]'.
  Overload 2 of 2, '(props: ViewProps, context: any): View', gave the following error.
    Type '{ fontSize: number; color: "#EAECEF"; fontWeight: "600"; }' is not assignable to type 'ViewStyle | Falsy | RecursiveArray<ViewStyle | Falsy> | readonly (ViewStyle | Falsy)[]'.
components/v41/V41ExecutionMonitor.tsx(139,21): error TS2769: No overload matches this call.
  Overload 1 of 2, '(props: ViewProps): View', gave the following error.
    Type '{ fontSize: number; color: "#EAECEF"; fontWeight: "600"; }' is not assignable to type 'ViewStyle | Falsy | RecursiveArray<ViewStyle | Falsy> | readonly (ViewStyle | Falsy)[]'.
  Overload 2 of 2, '(props: ViewProps, context: any): View', gave the following error.
    Type '{ fontSize: number; color: "#EAECEF"; fontWeight: "600"; }' is not assignable to type 'ViewStyle | Falsy | RecursiveArray<ViewStyle | Falsy> | readonly (ViewStyle | Falsy)[]'.
config/featureFlags.ts(41,7): error TS2367: This comparison appears to be unintentional because the types 'false' and 'true' have no overlap.
config/featureFlags.ts(64,10): error TS2367: This comparison appears to be unintentional because the types 'false' and 'true' have no overlap.
hooks/useJournalMarketSync.test.ts(42,10): error TS2352: Conversion of type '{ symbol: string; direction: "SHORT"; score: number; price: number; decision: string; atr1h: number; layers: never[]; groupScores: { A: number; B: number; C: number; }; marketMode: string; hardBlocks: never[]; warnings: never[]; long: { ...; }; short: { ...; }; }' to type 'SignalRow' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
  Type '{ symbol: string; direction: "SHORT"; score: number; price: number; decision: string; atr1h: number; layers: never[]; groupScores: { A: number; B: number; C: number; }; marketMode: string; hardBlocks: never[]; warnings: never[]; long: { ...; }; short: { ...; }; }' is missing the following properties from type 'SignalRow': change24h, trend, regimeConfidence, longScore, and 9 more.
index.ts(4,8): error TS2882: Cannot find module or type declarations for side-effect import of './tasks/backgroundSessionTask'.
index.ts(5,8): error TS2882: Cannot find module or type declarations for side-effect import of './tasks/backgroundPositionTask'.
scripts/generate-multi-coin-trace-exports.ts(108,7): error TS2345: Argument of type '{ consecutiveLosses: number; consecutiveLossesIn24h: number; lossStreakLocked: boolean; lossStreakLockUntil: number | null; dailyLossUSDT: number; recentJournal: { outcome: unknown; }[]; }' is not assignable to parameter of type 'SignalScanContext'.
  Types of property 'recentJournal' are incompatible.
    Type '{ outcome: unknown; }[]' is not assignable to type '{ outcome: { status: string; }; }[]'.
      Type '{ outcome: unknown; }' is not assignable to type '{ outcome: { status: string; }; }'.
        Types of property 'outcome' are incompatible.
          Type 'unknown' is not assignable to type '{ status: string; }'.
scripts/generate-multi-coin-trace-exports.ts(129,24): error TS2339: Property 'planV4' does not exist on type 'SignalRow'.
scripts/generate-multi-coin-trace-exports.ts(155,7): error TS2322: Type 'number | null' is not assignable to type 'number'.
  Type 'null' is not assignable to type 'number'.
scripts/generate-multi-coin-trace-exports.ts(158,22): error TS2339: Property 'planV4' does not exist on type 'SignalRow'.
services/__fixtures__/btcShortV4ProductionRow.ts(128,5): error TS2740: Type '{ adx1H: number; adx4H: number; }' is missing the following properties from type 'ADXAnalysis': adxAvg, regime, regimeStrength, isChoppy1H, and 2 more.
services/__fixtures__/btcShortV4ProductionRow.ts(132,5): error TS2739: Type '{ allowed: true; regime: string; }' is missing the following properties from type 'ADXGateResult': block, tpMultiplier, slMultiplier, message, severity
services/__tests__/driveSync.e2e.test.ts(130,29): error TS18048: 'options.journal' is possibly 'undefined'.
services/__tests__/driveSync.e2e.test.ts(130,45): error TS2339: Property 'content' does not exist on type 'PullJournalMock'.
  Property 'content' does not exist on type '{ kind: "invalid_json"; }'.
services/__tests__/exportTraceReviewWire.consistency1752.test.ts(184,14): error TS2322: Type '{ layers: { layer: number; name: string; score: number; maxScore: number; passed: boolean; isMandatory: boolean; isMandatoryViolation: boolean; reason: string; }[]; symbol: AppTradeSymbol; ... 40 more ...; ruleAuditSnapshot?: RuleAuditSnapshot; }' is not assignable to type 'SignalRow'.
  Types of property 'layers' are incompatible.
    Type '{ layer: number; name: string; score: number; maxScore: number; passed: boolean; isMandatory: boolean; isMandatoryViolation: boolean; reason: string; }[]' is not assignable to type 'LayerResult[]'.
      Type '{ layer: number; name: string; score: number; maxScore: number; passed: boolean; isMandatory: boolean; isMandatoryViolation: boolean; reason: string; }' is not assignable to type 'LayerResult'.
        Types of property 'layer' are incompatible.
          Type 'number' is not assignable to type 'ScorerLayerId'.
services/__tests__/exportTraceReviewWire.consistency1752.test.ts(189,14): error TS2322: Type '{ layers: { layer: number; name: string; score: number; maxScore: number; passed: boolean; isMandatory: boolean; isMandatoryViolation: boolean; reason: string; }[]; symbol: AppTradeSymbol; ... 40 more ...; ruleAuditSnapshot?: RuleAuditSnapshot; }' is not assignable to type 'SignalRow'.
  Types of property 'layers' are incompatible.
    Type '{ layer: number; name: string; score: number; maxScore: number; passed: boolean; isMandatory: boolean; isMandatoryViolation: boolean; reason: string; }[]' is not assignable to type 'LayerResult[]'.
      Type '{ layer: number; name: string; score: number; maxScore: number; passed: boolean; isMandatory: boolean; isMandatoryViolation: boolean; reason: string; }' is not assignable to type 'LayerResult'.
        Types of property 'layer' are incompatible.
          Type 'number' is not assignable to type 'ScorerLayerId'.
services/__tests__/exportTraceReviewWire.l5aBlockTypeSoft.test.ts(71,5): error TS2322: Type 'string' is not assignable to type '"BTCUSDT" | "NEARUSDT" | "SOLUSDT" | "BNBUSDT"'.
services/__tests__/exportTraceReviewWire.positionAdviserWire.test.ts(83,5): error TS2353: Object literal may only specify known properties, and 'groupScores' does not exist in type 'SignalRow'.
services/__tests__/exportTraceReviewWire.rulebookStateSsot.test.ts(99,5): error TS2740: Type '{ adx1H: number; adx4H: number; }' is missing the following properties from type 'ADXAnalysis': adxAvg, regime, regimeStrength, isChoppy1H, and 2 more.
services/__tests__/exportTraceReviewWire.rulebookStateSsot.test.ts(103,5): error TS2739: Type '{ allowed: true; regime: string; }' is missing the following properties from type 'ADXGateResult': block, tpMultiplier, slMultiplier, message, severity
services/__tests__/exportTraceReviewWire.task186.optionB.test.ts(73,5): error TS2353: Object literal may only specify known properties, and 'groupScores' does not exist in type 'SignalRow'.
services/__tests__/exportTraceReviewWire.task1863.groupBreakdownRounding.test.ts(80,5): error TS2353: Object literal may only specify known properties, and 'groupScores' does not exist in type 'SignalRow'.
services/__tests__/exportTraceReviewWire.task1863.groupBreakdownRounding.test.ts(120,16): error TS2339: Property 'groupScores' does not exist on type 'SignalRow'.
services/__tests__/exportTraceReviewWire.task187.scoreTraceLabels.test.ts(76,5): error TS2353: Object literal may only specify known properties, and 'groupScores' does not exist in type 'SignalRow'.
services/__tests__/exportTraceReviewWire.task187.scoreTraceLabels.test.ts(165,5): error TS2740: Type '{ adx1H: number; adx4H: number; }' is missing the following properties from type 'ADXAnalysis': adxAvg, regime, regimeStrength, isChoppy1H, and 2 more.
services/__tests__/exportTraceReviewWire.task187.scoreTraceLabels.test.ts(169,5): error TS2739: Type '{ allowed: true; regime: string; }' is missing the following properties from type 'ADXGateResult': block, tpMultiplier, slMultiplier, message, severity
services/__tests__/exportTraceReviewWire.task188.blockingEventsOrigin.test.ts(189,5): error TS2740: Type '{ adx1H: number; adx4H: number; }' is missing the following properties from type 'ADXAnalysis': adxAvg, regime, regimeStrength, isChoppy1H, and 2 more.
services/__tests__/exportTraceReviewWire.task188.blockingEventsOrigin.test.ts(193,5): error TS2739: Type '{ allowed: true; regime: string; }' is missing the following properties from type 'ADXGateResult': block, tpMultiplier, slMultiplier, message, severity
services/__tests__/generateMultiCoinTraceExports.live.test.ts(77,28): error TS2339: Property 'planV4' does not exist on type 'SignalRow'.
services/__tests__/generateMultiCoinTraceExports.live.test.ts(124,11): error TS2322: Type 'number | null' is not assignable to type 'number'.
  Type 'null' is not assignable to type 'number'.
services/__tests__/generateMultiCoinTraceExports.live.test.ts(127,26): error TS2339: Property 'planV4' does not exist on type 'SignalRow'.
services/__tests__/unifiedSignalEngine.test.ts(96,10): error TS2352: Conversion of type '{ symbol: "NEARUSDT"; price: number; change24h: number; trend: "UP"; regimeConfidence: number; score: number; longScore: number; shortScore: number; direction: "LONG"; decisionLabel: "VAO_TU_TIN"; ... 11 more ...; shortSnapshot: { ...; }; }' to type 'SignalRowWithDirSnapshots' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
  Type '{ symbol: "NEARUSDT"; price: number; change24h: number; trend: "UP"; regimeConfidence: number; score: number; longScore: number; shortScore: number; direction: "LONG"; decisionLabel: "VAO_TU_TIN"; ... 11 more ...; shortSnapshot: { ...; }; }' is not comparable to type 'SignalRow'.
    Types of property 'trend' are incompatible.
      Type '"UP"' is not comparable to type 'MarketTrend'.
services/adxJournal.test.ts(52,37): error TS2345: Argument of type '{ symbol: string; accountSizeAtEntry: number; market: MarketSnapshot; scoring: ScoringSnapshot; plan: { entryZoneOptimal: number; entryZoneType: string; ... 7 more ...; openReason: null; }; adxSnapshot: AdxJournalSnapshot | undefined; }' is not assignable to parameter of type '{ symbol: string; accountSizeAtEntry: number; market: MarketSnapshot; scoring: ScoringSnapshot; plan: TradePlanSnapshot; tags?: string[] | undefined; ... 12 more ...; vwapSnapshot?: VWAPSnapshot | undefined; }'.
  Types of property 'plan' are incompatible.
    Type '{ entryZoneOptimal: number; entryZoneType: string; stopLoss: number; takeProfit1: number; takeProfit2: number; takeProfit3: number; sizeActual: number; sizeProposed: number; riskRewardRatio: number; openReason: null; }' is missing the following properties from type 'TradePlanSnapshot': entryZoneRangeLow, entryZoneRangeHigh, slProposed, slActual, and 6 more.
services/derivativesDataService.test.ts(49,52): error TS2345: Argument of type '"SOLUSDT"' is not assignable to parameter of type 'TradeDirection'.
services/entryStateManager/runtimeDispatcher.ts(57,11): error TS2739: Type '{ decisionResult: { conflictResult: { priorityResult: { aggregateResult: { triggerCount: number; halted: true; message: string; context: {}; }; priorityGroups: never[]; highestPriority: null; halted: true; message: string; context: { ...; }; }; ... 7 more ...; context: { ...; }; }; ... 4 more ...; context: { ...; };...' is missing the following properties from type 'FinalDecisionResult': finalDecision, decisionCount, halted, message, context
services/entryStateManager/runtimeDispatcher.ts(195,9): error TS1117: An object literal cannot have multiple properties with the same name.
services/entryStateManager/runtimeExecutor.ts(52,19): error TS2352: Conversion of type '{ actionRuntimeResult: { runtimeActions: never[]; actionCount: number; halted: true; message: string; context: { actionEngineResult: { halted: true; context: {}; }; }; actionEngineResult: { actions: never[]; ... 4 more ...; stateMachineResult: { ...; }; }; }; }' to type 'RuntimeDispatcherContext' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
  The types of 'actionRuntimeResult.actionEngineResult.stateMachineResult.context' are incompatible between these types.
    Property 'currentState' is missing in type '{ finalDecisionResult: { halted: true; context: {}; }; }' but required in type 'EntryStateMachineContext'.
services/entryStateManager/stateValidator.ts(77,28): error TS2345: Argument of type '{ message: string; ruleReference: string; state: EntryState; stateDefinition: EntryStateDefinition; }' is not assignable to parameter of type 'Omit<EntryStateValidationResult, "valid" | "errorCode"> & { message: string; }'.
  Type '{ message: string; ruleReference: string; state: EntryState; stateDefinition: EntryStateDefinition; }' is missing the following properties from type 'Omit<EntryStateValidationResult, "valid" | "errorCode">': transitionId, transitionCategory
services/entryStateManager/triggerAggregator.test.ts(230,43): error TS2322: Type '{ triggerId: string; detected: boolean; reason: string; evidence: readonly HardBlockEvidence[]; sourceModule: TransitionSourceModule; ... 7 more ...; context: HardBlockDetectionContext; }' is not assignable to type 'HardBlockDetectionResult'.
  Types of property 'triggerId' are incompatible.
    Type 'string' is not assignable to type '"ESM-TRIG-HardBlock" | "ESM-TRIG-Unlock" | "ESM-TRIG-Recovery" | "ESM-TRIG-Confirmation" | "ESM-TRIG-Noise"'.
services/entryStateManager/triggerAggregator.ts(43,5): error TS2322: Type '(result: HardBlockDetectionResult) => HardBlockDetectionValidationResult' is not assignable to type '(result: unknown) => { valid: boolean; errors: readonly string[]; }'.
  Types of parameters 'result' and 'result' are incompatible.
    Type 'unknown' is not assignable to type 'HardBlockDetectionResult'.
services/entryStateManager/triggerAggregator.ts(48,5): error TS2322: Type '(result: RecoveryDetectionResult) => RecoveryDetectionValidationResult' is not assignable to type '(result: unknown) => { valid: boolean; errors: readonly string[]; }'.
  Types of parameters 'result' and 'result' are incompatible.
    Type 'unknown' is not assignable to type 'RecoveryDetectionResult'.
services/entryStateManager/triggerAggregator.ts(53,5): error TS2322: Type '(result: UnlockDetectionResult) => UnlockDetectionValidationResult' is not assignable to type '(result: unknown) => { valid: boolean; errors: readonly string[]; }'.
  Types of parameters 'result' and 'result' are incompatible.
    Type 'unknown' is not assignable to type 'UnlockDetectionResult'.
services/entryStateManager/triggerAggregator.ts(58,5): error TS2322: Type '(result: ConfirmationDetectionResult) => ConfirmationDetectionValidationResult' is not assignable to type '(result: unknown) => { valid: boolean; errors: readonly string[]; }'.
  Types of parameters 'result' and 'result' are incompatible.
    Type 'unknown' is not assignable to type 'ConfirmationDetectionResult'.
services/entryStateManager/triggerAggregator.ts(63,5): error TS2322: Type '(result: NoiseDetectionResult) => NoiseDetectionValidationResult' is not assignable to type '(result: unknown) => { valid: boolean; errors: readonly string[]; }'.
  Types of parameters 'result' and 'result' are incompatible.
    Type 'unknown' is not assignable to type 'NoiseDetectionResult'.
services/events/tradeEventValidator.ts(185,24): error TS2322: Type 'TradeEventBase<"TRADE_CREATED" | "ORDER_SUBMITTED" | "ORDER_FILLED" | "POSITION_RUNNING" | "STOP_MOVED" | "PARTIAL_EXIT" | "TP_REACHED" | "SL_REACHED" | "ADVISER_UPDATED" | "TRADE_CLOSED" | "TRADE_CANCELLED" | "SYNC_ACK" | "HEARTBEAT">' is not assignable to type 'TradeEvent | undefined'.
  Type 'TradeEventBase<"TRADE_CREATED" | "ORDER_SUBMITTED" | "ORDER_FILLED" | "POSITION_RUNNING" | "STOP_MOVED" | "PARTIAL_EXIT" | "TP_REACHED" | "SL_REACHED" | "ADVISER_UPDATED" | "TRADE_CLOSED" | "TRADE_CANCELLED" | "SYNC_ACK" | "HEARTBEAT">' is not assignable to type 'TradeCreatedEvent | OrderSubmittedEvent | OrderFilledEvent | PositionRunningEvent | StopMovedEvent | ... 7 more ... | HeartbeatEvent'.
    Type 'TradeEventBase<"TRADE_CREATED" | "ORDER_SUBMITTED" | "ORDER_FILLED" | "POSITION_RUNNING" | "STOP_MOVED" | "PARTIAL_EXIT" | "TP_REACHED" | "SL_REACHED" | "ADVISER_UPDATED" | "TRADE_CLOSED" | "TRADE_CANCELLED" | "SYNC_ACK" | "HEARTBEAT">' is not assignable to type 'HeartbeatEvent'.
      Types of property 'eventType' are incompatible.
        Type '"TRADE_CREATED" | "ORDER_SUBMITTED" | "ORDER_FILLED" | "POSITION_RUNNING" | "STOP_MOVED" | "PARTIAL_EXIT" | "TP_REACHED" | "SL_REACHED" | "ADVISER_UPDATED" | "TRADE_CLOSED" | "TRADE_CANCELLED" | "SYNC_ACK" | "HEARTBEAT"' is not assignable to type '"HEARTBEAT"'.
          Type '"TRADE_CREATED"' is not assignable to type '"HEARTBEAT"'.
services/eventStore/__tests__/eventStore.test.ts(246,43): error TS2339: Property 'eventId' does not exist on type '{ symbol?: string | undefined; }'.
services/exportDecisionReplay.test.ts(64,5): error TS2322: Type '"UP"' is not assignable to type 'MarketTrend'.
services/exportDecisionReplay.test.ts(225,7): error TS2322: Type '"ETHUSDT"' is not assignable to type '"BTCUSDT" | "NEARUSDT" | "SOLUSDT" | "BNBUSDT"'.
services/exportDecisionTrace.test.ts(63,5): error TS2322: Type '"UP"' is not assignable to type 'MarketTrend'.
services/exportService.layerInputSnapshot.test.ts(84,5): error TS2322: Type '"UP"' is not assignable to type 'MarketTrend'.
services/exportService.ts(1436,66): error TS18048: 'layer' is possibly 'undefined'.
services/exportService.ts(1837,5): error TS2322: Type '"UP"' is not assignable to type 'MarketTrend'.
services/exportService.ts(1864,18): error TS2352: Conversion of type '{ symbol: string; direction: "LONG"; recommendedEntry: number; entryZone: { quality: "GOOD"; }; stopLoss: { price: number; quality: "STRUCTURE"; atrDistance: number; }; tp1: { price: number; rrRatio: number; }; ... 4 more ...; decision: string; }' to type 'TradePlanV3' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
  Type '{ symbol: string; direction: "LONG"; recommendedEntry: number; entryZone: { quality: "GOOD"; }; stopLoss: { price: number; quality: "STRUCTURE"; atrDistance: number; }; tp1: { price: number; rrRatio: number; }; ... 4 more ...; decision: string; }' is missing the following properties from type 'TradePlanV3': generatedAt, totalScore, marketMode, groupScores, and 10 more.
services/indicators.cache.test.ts(31,5): error TS2561: Object literal may only specify known properties, but 'takerBuyBaseVolume' does not exist in type 'Kline'. Did you mean to write 'takerBuyVolume'?
services/indicators.cache.test.ts(68,57): error TS2345: Argument of type '{ ema20: number; ema50: number; ema200: number; priceVsEma20: "above"; priceVsEma50: "above"; priceVsEma200: "above"; alignment: "BULLISH"; }' is not assignable to parameter of type 'EMAAnalysisV3'.
  Type '{ ema20: number; ema50: number; ema200: number; priceVsEma20: "above"; priceVsEma50: "above"; priceVsEma200: "above"; alignment: "BULLISH"; }' is missing the following properties from type 'EMAAnalysisV3': slope20, slope50, priceVsEma20Pct, priceVsEma50Pct, and 2 more.
services/indicators.cache.test.ts(75,7): error TS2345: Argument of type '{ ema20: number; ema50: number; ema200: number; priceVsEma20: "above"; priceVsEma50: "above"; priceVsEma200: "above"; alignment: "BULLISH"; }' is not assignable to parameter of type 'EMAAnalysisV3'.
  Type '{ ema20: number; ema50: number; ema200: number; priceVsEma20: "above"; priceVsEma50: "above"; priceVsEma200: "above"; alignment: "BULLISH"; }' is missing the following properties from type 'EMAAnalysisV3': slope20, slope50, priceVsEma20Pct, priceVsEma50Pct, and 2 more.
services/indicators.cache.test.ts(90,57): error TS2345: Argument of type '{ ema20: number; ema50: number; ema200: number; priceVsEma20: "above"; priceVsEma50: "above"; priceVsEma200: "above"; alignment: "BULLISH"; }' is not assignable to parameter of type 'EMAAnalysisV3'.
  Type '{ ema20: number; ema50: number; ema200: number; priceVsEma20: "above"; priceVsEma50: "above"; priceVsEma200: "above"; alignment: "BULLISH"; }' is missing the following properties from type 'EMAAnalysisV3': slope20, slope50, priceVsEma20Pct, priceVsEma50Pct, and 2 more.
services/indicators.cache.test.ts(97,7): error TS2345: Argument of type '{ ema20: number; ema50: number; ema200: number; priceVsEma20: "above"; priceVsEma50: "above"; priceVsEma200: "above"; alignment: "BULLISH"; }' is not assignable to parameter of type 'EMAAnalysisV3'.
  Type '{ ema20: number; ema50: number; ema200: number; priceVsEma20: "above"; priceVsEma50: "above"; priceVsEma200: "above"; alignment: "BULLISH"; }' is missing the following properties from type 'EMAAnalysisV3': slope20, slope50, priceVsEma20Pct, priceVsEma50Pct, and 2 more.
services/integration/__tests__/dualWrite.test.ts(30,27): error TS2345: Argument of type '{ eventType: T; aggregateId: string; source: "APK"; correlationId: string; eventId: string; idempotencyKey: string; createdAtUtc: string; metadata: { sequence: number | undefined; }; payload: (Extract<...> | ... 11 more ... | Extract<...>)["payload"]; }' is not assignable to parameter of type 'CreateTradeEventInput<T>'.
  Types of property 'payload' are incompatible.
    Type 'Extract<TradeCreatedEvent, { eventType: T; }>["payload"] | Extract<OrderSubmittedEvent, { eventType: T; }>["payload"] | ... 10 more ... | Extract<...>["payload"]' is not assignable to type 'TradeEventPayloadByType[T]'.
      Type 'Extract<TradeCreatedEvent, { eventType: T; }>["payload"]' is not assignable to type 'TradeEventPayloadByType[T]'.
        Type 'Extract<TradeCreatedEvent, { eventType: T; }>' is not assignable to type 'TradeEventPayloadByType'.
          Type '{ eventType: T; } & TradeCreatedEvent' is missing the following properties from type 'TradeEventPayloadByType': TRADE_CREATED, ORDER_SUBMITTED, ORDER_FILLED, POSITION_RUNNING, and 9 more.
services/integration/__tests__/flipSourceOfTruth.test.ts(25,27): error TS2345: Argument of type '{ eventType: T; aggregateId: string; source: "APK"; correlationId: string; eventId: string; idempotencyKey: string; createdAtUtc: string; metadata: { sequence: number | undefined; }; payload: (Extract<...> | ... 11 more ... | Extract<...>)["payload"]; }' is not assignable to parameter of type 'CreateTradeEventInput<T>'.
  Types of property 'payload' are incompatible.
    Type 'Extract<TradeCreatedEvent, { eventType: T; }>["payload"] | Extract<OrderSubmittedEvent, { eventType: T; }>["payload"] | ... 10 more ... | Extract<...>["payload"]' is not assignable to type 'TradeEventPayloadByType[T]'.
      Type 'Extract<TradeCreatedEvent, { eventType: T; }>["payload"]' is not assignable to type 'TradeEventPayloadByType[T]'.
        Type 'Extract<TradeCreatedEvent, { eventType: T; }>' is not assignable to type 'TradeEventPayloadByType'.
          Type '{ eventType: T; } & TradeCreatedEvent' is missing the following properties from type 'TradeEventPayloadByType': TRADE_CREATED, ORDER_SUBMITTED, ORDER_FILLED, POSITION_RUNNING, and 9 more.
services/intelligence/__tests__/dashboard.test.ts(43,7): error TS2353: Object literal may only specify known properties, and 'topTraderRatio' does not exist in type 'MarketSnapshot'.
services/intelligence/__tests__/intelligence.test.ts(31,7): error TS2353: Object literal may only specify known properties, and 'topTraderRatio' does not exist in type 'MarketSnapshot'.
services/intelligence/__tests__/journalIntelligence.test.ts(54,7): error TS2353: Object literal may only specify known properties, and 'topTraderRatio' does not exist in type 'MarketSnapshot'.
services/intelligence/__tests__/performance.test.ts(44,7): error TS2353: Object literal may only specify known properties, and 'topTraderRatio' does not exist in type 'MarketSnapshot'.
services/intelligence/__tests__/releaseStabilization.test.ts(43,7): error TS2353: Object literal may only specify known properties, and 'topTraderRatio' does not exist in type 'MarketSnapshot'.
services/intelligence/__tests__/statistics.test.ts(38,7): error TS2353: Object literal may only specify known properties, and 'topTraderRatio' does not exist in type 'MarketSnapshot'.
services/intelligence/__tests__/statistics.test.ts(117,9): error TS2353: Object literal may only specify known properties, and 'topTraderRatio' does not exist in type 'MarketSnapshot'.
services/intelligence/journalAiSummary.ts(39,22): error TS2339: Property 'topTraderRatio' does not exist on type 'MarketSnapshot'.
services/intelligence/journalAiSummary.ts(41,29): error TS2339: Property 'topTraderRatio' does not exist on type 'MarketSnapshot'.
services/intelligence/journalEvidence.ts(59,51): error TS2339: Property 'topTraderRatio' does not exist on type 'MarketSnapshot'.
services/intelligence/journalEvidence.ts(61,32): error TS2339: Property 'topTraderRatio' does not exist on type 'MarketSnapshot'.
services/intelligence/journalIntelligence.ts(130,27): error TS2339: Property 'topTraderRatio' does not exist on type 'MarketSnapshot'.
services/intelligence/shared/tradeTags.ts(29,20): error TS2339: Property 'topTraderRatio' does not exist on type 'MarketSnapshot'.
services/intelligence/shared/tradeTags.ts(29,58): error TS2339: Property 'topTraderRatio' does not exist on type 'MarketSnapshot'.
services/intelligence/statistics/statisticsGrouping.ts(55,22): error TS2339: Property 'topTraderRatio' does not exist on type 'MarketSnapshot'.
services/journalService.test.ts(134,12): error TS2352: Conversion of type '{ symbol: "NEARUSDT"; direction: "LONG"; score: number; decisionLabel: "VAO_TU_TIN"; decisionDisplay: string; layers: never[]; mandatoryViolations: never[]; price: number; change24h: number; tradePlan: { ...; }; }' to type 'SignalRow' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
  Type '{ symbol: "NEARUSDT"; direction: "LONG"; score: number; decisionLabel: "VAO_TU_TIN"; decisionDisplay: string; layers: never[]; mandatoryViolations: never[]; price: number; change24h: number; tradePlan: { ...; }; }' is missing the following properties from type 'SignalRow': trend, regimeConfidence, longScore, shortScore, and 4 more.
services/journalService.test.ts(173,12): error TS2352: Conversion of type '{ symbol: "BTCUSDT"; direction: "LONG"; score: number; decisionLabel: "VAO_TU_TIN"; decisionDisplay: string; layers: never[]; mandatoryViolations: never[]; price: number; change24h: number; l6Detail: { ...; }; v4: { ...; }; }' to type 'SignalRow' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
  Type '{ symbol: "BTCUSDT"; direction: "LONG"; score: number; decisionLabel: "VAO_TU_TIN"; decisionDisplay: string; layers: never[]; mandatoryViolations: never[]; price: number; change24h: number; l6Detail: { ...; }; v4: { ...; }; }' is missing the following properties from type 'SignalRow': trend, regimeConfidence, longScore, shortScore, and 5 more.
services/journalService.test.ts(235,12): error TS2352: Conversion of type '{ symbol: "NEARUSDT"; direction: "LONG"; score: number; decisionLabel: "CO_THE_VAO"; layers: never[]; mandatoryViolations: never[]; price: number; change24h: number; tradePlan: { direction: "LONG"; ... 11 more ...; notes: string; }; v3: { ...; }; tradePlanV3: { ...; }; }' to type 'SignalRow' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
  Type '{ symbol: "NEARUSDT"; direction: "LONG"; score: number; decisionLabel: "CO_THE_VAO"; layers: never[]; mandatoryViolations: never[]; price: number; change24h: number; tradePlan: { direction: "LONG"; ... 11 more ...; notes: string; }; v3: { ...; }; tradePlanV3: { ...; }; }' is missing the following properties from type 'SignalRow': trend, regimeConfidence, longScore, shortScore, and 5 more.
services/journalService.test.ts(621,12): error TS2352: Conversion of type '{ symbol: "BTCUSDT"; direction: "LONG"; score: number; decisionLabel: "VAO_TU_TIN"; decisionDisplay: string; layers: never[]; mandatoryViolations: never[]; price: number; change24h: number; squeezeRisk: { ...; }; v4: { ...; }; }' to type 'SignalRow' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
  Type '{ symbol: "BTCUSDT"; direction: "LONG"; score: number; decisionLabel: "VAO_TU_TIN"; decisionDisplay: string; layers: never[]; mandatoryViolations: never[]; price: number; change24h: number; squeezeRisk: { ...; }; v4: { ...; }; }' is missing the following properties from type 'SignalRow': trend, regimeConfidence, longScore, shortScore, and 5 more.
services/journalService.test.ts(669,33): error TS2739: Type '{ scorerVersion: "v4"; }' is missing the following properties from type 'ScoringSnapshot': totalScore, direction, layerScores, mandatoryViolations, decision
services/journalService.test.ts(699,7): error TS2322: Type '"UP"' is not assignable to type 'MarketTrend'.
services/journalService.test.ts(751,9): error TS2322: Type '"ETHUSDT"' is not assignable to type '"BTCUSDT" | "NEARUSDT" | "SOLUSDT" | "BNBUSDT"'.
services/journalService.test.ts(754,9): error TS2322: Type '"UP"' is not assignable to type 'MarketTrend'.
services/journalService.test.ts(819,9): error TS2322: Type 'null' is not assignable to type 'string | undefined'.
services/notificationService.ts(10,8): error TS2307: Cannot find module './localNotification' or its corresponding type declarations.
services/performanceHt/buildPerformanceHtDataBundle.ts(17,8): error TS2724: '"../intelligence/dashboard"' has no exported member named 'DashboardFilterPeriod'. Did you mean 'DashboardFilter'?
services/periodicTradingWork.ts(8,8): error TS2307: Cannot find module './localNotification' or its corresponding type declarations.
services/persistence/fileEventPersistence.ts(34,9): error TS2416: Property 'read' in type 'FileEventPersistence' is not assignable to the same property in base type 'IEventPersistence'.
  Type '(_eventId: string) => Promise<void>' is not assignable to type '(eventId: string) => Promise<StoredTradeEvent | null>'.
    Type 'Promise<void>' is not assignable to type 'Promise<StoredTradeEvent | null>'.
      Type 'void' is not assignable to type 'StoredTradeEvent | null'.
services/persistence/fileEventPersistence.ts(38,9): error TS2416: Property 'readAggregate' in type 'FileEventPersistence' is not assignable to the same property in base type 'IEventPersistence'.
  Type '(_aggregateId: string) => Promise<void>' is not assignable to type '(aggregateId: string) => Promise<StoredTradeEvent[]>'.
    Type 'Promise<void>' is not assignable to type 'Promise<StoredTradeEvent[]>'.
      Type 'void' is not assignable to type 'StoredTradeEvent[]'.
services/persistence/fileEventPersistence.ts(42,9): error TS2416: Property 'readAll' in type 'FileEventPersistence' is not assignable to the same property in base type 'IEventPersistence'.
  Type '() => Promise<void>' is not assignable to type '() => Promise<StoredTradeEvent[]>'.
    Type 'Promise<void>' is not assignable to type 'Promise<StoredTradeEvent[]>'.
      Type 'void' is not assignable to type 'StoredTradeEvent[]'.
services/persistence/fileEventPersistence.ts(65,3): error TS2322: Type 'FileEventPersistence' is not assignable to type 'IEventPersistence'.
  The types returned by 'read(...)' are incompatible between these types.
    Type 'Promise<void>' is not assignable to type 'Promise<StoredTradeEvent | null>'.
      Type 'void' is not assignable to type 'StoredTradeEvent | null'.
services/persistence/sqliteEventPersistence.ts(34,9): error TS2416: Property 'read' in type 'SqliteEventPersistence' is not assignable to the same property in base type 'IEventPersistence'.
  Type '(_eventId: string) => Promise<void>' is not assignable to type '(eventId: string) => Promise<StoredTradeEvent | null>'.
    Type 'Promise<void>' is not assignable to type 'Promise<StoredTradeEvent | null>'.
      Type 'void' is not assignable to type 'StoredTradeEvent | null'.
services/persistence/sqliteEventPersistence.ts(38,9): error TS2416: Property 'readAggregate' in type 'SqliteEventPersistence' is not assignable to the same property in base type 'IEventPersistence'.
  Type '(_aggregateId: string) => Promise<void>' is not assignable to type '(aggregateId: string) => Promise<StoredTradeEvent[]>'.
    Type 'Promise<void>' is not assignable to type 'Promise<StoredTradeEvent[]>'.
      Type 'void' is not assignable to type 'StoredTradeEvent[]'.
services/persistence/sqliteEventPersistence.ts(42,9): error TS2416: Property 'readAll' in type 'SqliteEventPersistence' is not assignable to the same property in base type 'IEventPersistence'.
  Type '() => Promise<void>' is not assignable to type '() => Promise<StoredTradeEvent[]>'.
    Type 'Promise<void>' is not assignable to type 'Promise<StoredTradeEvent[]>'.
      Type 'void' is not assignable to type 'StoredTradeEvent[]'.
services/persistence/sqliteEventPersistence.ts(65,3): error TS2322: Type 'SqliteEventPersistence' is not assignable to type 'IEventPersistence'.
  The types returned by 'read(...)' are incompatible between these types.
    Type 'Promise<void>' is not assignable to type 'Promise<StoredTradeEvent | null>'.
      Type 'void' is not assignable to type 'StoredTradeEvent | null'.
services/phase1Migration.ts(365,5): error TS2322: Type '"15m" | "1h" | "4h" | "1d"' is not assignable to type '"1h" | "4h" | "1d" | undefined'.
  Type '"15m"' is not assignable to type '"1h" | "4h" | "1d" | undefined'.
services/phase1Migration.ts(435,10): error TS2352: Conversion of type 'Record<string, unknown>' to type 'LockedTradePlan' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
  Type 'Record<string, unknown>' is missing the following properties from type 'LockedTradePlan': id, pendingEntryId, lockedAt, expiresAt, and 14 more.
services/planHealth.test.ts(179,7): error TS2345: Argument of type '{ squeezeRisk: SqueezeRiskResult; l6Detail: { fundingState: FundingState; }; layers: { layer: number; score: number; }[]; v4: { longLayers: { layer: number; score: number; }[]; shortLayers: { layer: number; score: number; }[]; }; }' is not assignable to parameter of type 'Pick<SignalRow, "v4" | "l6Detail" | "squeezeRisk" | "layers">'.
  Types of property 'v4' are incompatible.
    Type '{ longLayers: { layer: number; score: number; }[]; shortLayers: { layer: number; score: number; }[]; }' is missing the following properties from type 'SignalRowScorerSnapshot': score, longScore, shortScore, direction, and 7 more.
services/planHealth.test.ts(195,7): error TS2345: Argument of type '{ squeezeRisk: SqueezeRiskResult; l6Detail: { fundingState: FundingState; }; layers: { layer: number; score: number; }[]; v4: { longLayers: { layer: number; score: number; }[]; shortLayers: { layer: number; score: number; }[]; }; }' is not assignable to parameter of type 'Pick<SignalRow, "v4" | "l6Detail" | "squeezeRisk" | "layers">'.
  Types of property 'v4' are incompatible.
    Type '{ longLayers: { layer: number; score: number; }[]; shortLayers: { layer: number; score: number; }[]; }' is missing the following properties from type 'SignalRowScorerSnapshot': score, longScore, shortScore, direction, and 7 more.
services/planHealth.test.ts(211,7): error TS2345: Argument of type '{ squeezeRisk: SqueezeRiskResult; l6Detail: { fundingState: FundingState; }; layers: { layer: number; score: number; }[]; v4: { longLayers: { layer: number; score: number; }[]; shortLayers: { layer: number; score: number; }[]; }; }' is not assignable to parameter of type 'Pick<SignalRow, "v4" | "l6Detail" | "squeezeRisk" | "layers">'.
  Types of property 'v4' are incompatible.
    Type '{ longLayers: { layer: number; score: number; }[]; shortLayers: { layer: number; score: number; }[]; }' is missing the following properties from type 'SignalRowScorerSnapshot': score, longScore, shortScore, direction, and 7 more.
services/positionAdvisorV4.ts(23,8): error TS2459: Module '"./positionAdvisorV3"' declares 'PositionWithPrice' locally, but it is not exported.
services/priceAlertNotification.ts(9,8): error TS2307: Cannot find module './localNotification' or its corresponding type declarations.
services/productionEsmBridge/productionEsmScanWiring.test.ts(18,5): error TS2322: Type 'string' is not assignable to type '"BTCUSDT" | "NEARUSDT" | "SOLUSDT" | "BNBUSDT"'.
services/productionEsmBridge/productionEsmScanWiring.test.ts(46,35): error TS2353: Object literal may only specify known properties, and 'markPrice' does not exist in type 'MarketSnapshot'.
services/productionEsmBridge/productionEsmScanWiring.test.ts(50,7): error TS2740: Type '{}' is missing the following properties from type 'LayerScoreMap': l1, l2, l3, l4, and 6 more.
services/productionEsmBridge/productionEsmSymbolFilter.test.ts(19,30): error TS2353: Object literal may only specify known properties, and 'markPrice' does not exist in type 'MarketSnapshot'.
services/productionEsmBridge/productionEsmSymbolFilter.test.ts(23,7): error TS2740: Type '{}' is missing the following properties from type 'LayerScoreMap': l1, l2, l3, l4, and 6 more.
services/productionEsmBridge/ul042StagingValidation.test.ts(38,5): error TS2322: Type 'string' is not assignable to type '"BTCUSDT" | "NEARUSDT" | "SOLUSDT" | "BNBUSDT"'.
services/productionEsmBridge/ul042StagingValidation.test.ts(70,32): error TS2353: Object literal may only specify known properties, and 'markPrice' does not exist in type 'MarketSnapshot'.
services/productionEsmBridge/ul042StagingValidation.test.ts(74,7): error TS2740: Type '{}' is missing the following properties from type 'LayerScoreMap': l1, l2, l3, l4, and 6 more.
services/projector/__tests__/tradeProjector.test.ts(31,27): error TS2345: Argument of type '{ eventType: T; aggregateId: string; source: "APK"; correlationId: string; causationId: string; eventId: string; idempotencyKey: string; createdAtUtc: string; metadata: { sequence: number | undefined; featureSetVersion: string; engineVersion: string; }; payload: (Extract<...> | ... 11 more ... | Extract<...>)["paylo...' is not assignable to parameter of type 'CreateTradeEventInput<T>'.
  Types of property 'payload' are incompatible.
    Type 'Extract<TradeCreatedEvent, { eventType: T; }>["payload"] | Extract<OrderSubmittedEvent, { eventType: T; }>["payload"] | ... 10 more ... | Extract<...>["payload"]' is not assignable to type 'TradeEventPayloadByType[T]'.
      Type 'Extract<TradeCreatedEvent, { eventType: T; }>["payload"]' is not assignable to type 'TradeEventPayloadByType[T]'.
        Type 'Extract<TradeCreatedEvent, { eventType: T; }>' is not assignable to type 'TradeEventPayloadByType'.
          Type '{ eventType: T; } & TradeCreatedEvent' is missing the following properties from type 'TradeEventPayloadByType': TRADE_CREATED, ORDER_SUBMITTED, ORDER_FILLED, POSITION_RUNNING, and 9 more.
services/projector/tradeProjector.ts(122,5): error TS2353: Object literal may only specify known properties, and 'topTraderRatio' does not exist in type 'MarketSnapshot'.
services/scorer.ts(521,7): error TS2741: Property 'CHO_TAI_CHAM' is missing in type '{ KHONG_VAO: string; CHO_THEM: string; CO_THE_VAO: string; VAO_TU_TIN: string; SETUP_NGON: string; }' but required in type 'Record<TradeDecisionLabel, string>'.
services/scorer.ts(1343,5): error TS2739: Type '{ consecutiveLosses: number; dailyLossPercent: number; maxDailyLossPercent: number; }' is missing the following properties from type 'IndicatorPsychology': consecutiveLossesIn24h, lossStreakLocked, lossStreakLockUntil
services/scorerV3.test.ts(265,43): error TS2345: Argument of type '{ consecutiveLosses: number; dailyLossUSDT: number; }' is not assignable to parameter of type 'TodayStats'.
  Type '{ consecutiveLosses: number; dailyLossUSDT: number; }' is missing the following properties from type 'TodayStats': consecutiveLossesIn24h, lossStreakLocked, lossStreakLockUntil
services/scorerV4.test.ts(315,43): error TS2345: Argument of type '{ consecutiveLosses: number; dailyLossUSDT: number; }' is not assignable to parameter of type 'TodayStats'.
  Type '{ consecutiveLosses: number; dailyLossUSDT: number; }' is missing the following properties from type 'TodayStats': consecutiveLossesIn24h, lossStreakLocked, lossStreakLockUntil
services/scorerV4.test.ts(410,68): error TS2345: Argument of type '{ consecutiveLosses: number; dailyLossUSDT: number; }' is not assignable to parameter of type 'TodayStats'.
  Type '{ consecutiveLosses: number; dailyLossUSDT: number; }' is missing the following properties from type 'TodayStats': consecutiveLossesIn24h, lossStreakLocked, lossStreakLockUntil
services/scorerV4.test.ts(424,43): error TS2345: Argument of type '{ consecutiveLosses: number; dailyLossUSDT: number; }' is not assignable to parameter of type 'TodayStats'.
  Type '{ consecutiveLosses: number; dailyLossUSDT: number; }' is missing the following properties from type 'TodayStats': consecutiveLossesIn24h, lossStreakLocked, lossStreakLockUntil
services/scorerV4.test.ts(434,49): error TS2345: Argument of type '{ consecutiveLosses: number; dailyLossUSDT: number; }' is not assignable to parameter of type 'TodayStats'.
  Type '{ consecutiveLosses: number; dailyLossUSDT: number; }' is missing the following properties from type 'TodayStats': consecutiveLossesIn24h, lossStreakLocked, lossStreakLockUntil
services/scorerV4.test.ts(446,49): error TS2345: Argument of type '{ consecutiveLosses: number; dailyLossUSDT: number; }' is not assignable to parameter of type 'TodayStats'.
  Type '{ consecutiveLosses: number; dailyLossUSDT: number; }' is missing the following properties from type 'TodayStats': consecutiveLossesIn24h, lossStreakLocked, lossStreakLockUntil
services/scorerV4.test.ts(458,49): error TS2345: Argument of type '{ consecutiveLosses: number; dailyLossUSDT: number; }' is not assignable to parameter of type 'TodayStats'.
  Type '{ consecutiveLosses: number; dailyLossUSDT: number; }' is missing the following properties from type 'TodayStats': consecutiveLossesIn24h, lossStreakLocked, lossStreakLockUntil
services/scorerV4.test.ts(500,49): error TS2345: Argument of type '{ consecutiveLosses: number; dailyLossUSDT: number; }' is not assignable to parameter of type 'TodayStats'.
  Type '{ consecutiveLosses: number; dailyLossUSDT: number; }' is missing the following properties from type 'TodayStats': consecutiveLossesIn24h, lossStreakLocked, lossStreakLockUntil
services/scorerV4.test.ts(529,64): error TS2345: Argument of type '{ consecutiveLosses: number; dailyLossUSDT: number; }' is not assignable to parameter of type 'TodayStats'.
  Type '{ consecutiveLosses: number; dailyLossUSDT: number; }' is missing the following properties from type 'TodayStats': consecutiveLossesIn24h, lossStreakLocked, lossStreakLockUntil
services/scorerV4.test.ts(544,49): error TS2345: Argument of type '{ consecutiveLosses: number; dailyLossUSDT: number; }' is not assignable to parameter of type 'TodayStats'.
  Type '{ consecutiveLosses: number; dailyLossUSDT: number; }' is missing the following properties from type 'TodayStats': consecutiveLossesIn24h, lossStreakLocked, lossStreakLockUntil
services/sessionNotification.ts(10,8): error TS2307: Cannot find module './localNotification' or its corresponding type declarations.
services/sessionNotification.ts(14,8): error TS2307: Cannot find module '../tasks/backgroundSessionTask' or its corresponding type declarations.
services/signalScanContext.test.ts(10,9): error TS2739: Type '{ id: string; timestamp: number; symbol: string; market: never; scoring: never; plan: never; outcome: { status: "LOSS"; pnlUSDT: number; }; }' is missing the following properties from type 'AiTradeJournalEntry': accountSizeAtEntry, tags, version
services/skippedSetupService.ts(211,7): error TS2322: Type 'number' is not assignable to type 'undefined'.
services/structureSLJournal.test.ts(95,37): error TS2345: Argument of type '{ symbol: string; accountSizeAtEntry: number; market: MarketSnapshot; scoring: ScoringSnapshot; plan: { entryZoneOptimal: number; entryZoneType: string; ... 7 more ...; openReason: null; }; structureSLSnapshot: StructureSLSnapshot | undefined; }' is not assignable to parameter of type '{ symbol: string; accountSizeAtEntry: number; market: MarketSnapshot; scoring: ScoringSnapshot; plan: TradePlanSnapshot; tags?: string[] | undefined; ... 12 more ...; vwapSnapshot?: VWAPSnapshot | undefined; }'.
  Types of property 'plan' are incompatible.
    Type '{ entryZoneOptimal: number; entryZoneType: string; stopLoss: number; takeProfit1: number; takeProfit2: number; takeProfit3: number; sizeActual: number; sizeProposed: number; riskRewardRatio: number; openReason: null; }' is missing the following properties from type 'TradePlanSnapshot': entryZoneRangeLow, entryZoneRangeHigh, slProposed, slActual, and 6 more.
services/tradeHistorySync.test.ts(9,7): error TS2739: Type '{ id: string; timestamp: number; symbol: string; market: MarketSnapshot; scoring: ScoringSnapshot; plan: TradePlanSnapshot; outcome: { ...; }; }' is missing the following properties from type 'AiTradeJournalEntry': accountSizeAtEntry, tags, version
services/tradeHistorySync.test.ts(56,7): error TS2739: Type '{ id: string; timestamp: number; symbol: string; market: MarketSnapshot; scoring: ScoringSnapshot; plan: TradePlanSnapshot; outcome: { ...; }; }' is missing the following properties from type 'AiTradeJournalEntry': accountSizeAtEntry, tags, version
services/tradeHistorySync.ts(23,10): error TS2678: Type '"OFFLINE_CLOSE"' is not comparable to type 'TradeExitReason | undefined'.
services/tradePlanDisplay.ts(1,54): error TS2307: Cannot find module './scoring' or its corresponding type declarations.
services/tradeSnapshot.test.ts(27,9): error TS2739: Type '{ id: string; timestamp: number; symbol: string; market: never; scoring: never; plan: never; outcome: { status: "WIN"; }; }' is missing the following properties from type 'AiTradeJournalEntry': accountSizeAtEntry, tags, version
services/tradeSnapshot.ts(73,16): error TS2554: Expected 2 arguments, but got 1.
services/ul/adapters/__tests__/PerformanceDashboardValidator.test.ts(286,40): error TS2352: Conversion of type '{ summary?: undefined; riskWidget?: undefined; equityChart?: undefined; recommendationPanel?: undefined; } | { summary: null; riskWidget: string; equityChart: number; recommendationPanel?: undefined; } | { ...; } | null | undefined' to type 'PerformanceDashboardViewModel' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
  Type '{ recommendationPanel: { items: string; }; summary?: undefined; riskWidget?: undefined; equityChart?: undefined; }' is missing the following properties from type 'PerformanceDashboardViewModel': version, generatedAt, tradeCount, fingerprint, and 5 more.
services/ul/coach/TradingCoachBuilder.ts(49,14): error TS2339: Property 'id' does not exist on type 'T'.
services/ul/coach/TradingCoachBuilder.ts(49,33): error TS2339: Property 'id' does not exist on type 'T'.
services/unifiedSignalEngine.ts(457,29): error TS2367: This comparison appears to be unintentional because the types 'TradeDirection' and '"NONE"' have no overlap.
services/v41/__tests__/confidenceEngine.test.ts(244,23): error TS2322: Type '0.9' is not assignable to type '0.5'.
services/v41/__tests__/confidenceEngine.test.ts(244,43): error TS2322: Type '0.1' is not assignable to type '0.5'.
services/v41/__tests__/entryQualityEngine.test.ts(168,7): error TS2739: Type '{ stopHuntDetected: true; volatilityRisk: "EXTREME"; protectionPenalty: number; }' is missing the following properties from type 'ProtectionSnapshot': stopHuntRisk, volatilityAtrPct, protectionWarnings
services/v41/__tests__/exportServiceV41.entryGate.test.ts(114,9): error TS2561: Object literal may only specify known properties, but 'signals' does not exist in type 'EarlyWarningSnapshot'. Did you mean to write 'signals1H'?
services/v41/__tests__/exportServiceV41.momentum.test.ts(6,10): error TS2352: Conversion of type '{ symbol: string; visibilityMode: "TRADE_MODE"; markPrice: number; snapshot: { marketState: "TRENDING"; trendStrength: number; trendDirection: "UP"; trendExhaustion: number; volumeDivergencePts: 0; ... 5 more ...; btcDirection: "UP"; }; momentum: MomentumResult | undefined; }' to type 'SignalRowV41' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
  Property 'fetchedAt' is missing in type '{ symbol: string; visibilityMode: "TRADE_MODE"; markPrice: number; snapshot: { marketState: "TRENDING"; trendStrength: number; trendDirection: "UP"; trendExhaustion: number; volumeDivergencePts: 0; ... 5 more ...; btcDirection: "UP"; }; momentum: MomentumResult | undefined; }' but required in type 'SignalRowV41'.
services/v41/__tests__/exportServiceV41.ruleExplanation.test.ts(6,10): error TS2352: Conversion of type '{ symbol: string; visibilityMode: "TRADE_MODE"; markPrice: number; snapshot: { trendStrength: number; trendDirection: "BULL"; trendExhaustion: number; volumeDivergencePts: 0; reversalProbability: number; ... 6 more ...; scanTimestamp: number; }; opportunity: { ...; }; protection: { ...; }; earlyWarning: { ...; }; mo...' to type 'SignalRowV41' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
  Property 'fetchedAt' is missing in type '{ symbol: string; visibilityMode: "TRADE_MODE"; markPrice: number; snapshot: { trendStrength: number; trendDirection: "BULL"; trendExhaustion: number; volumeDivergencePts: 0; reversalProbability: number; ... 6 more ...; scanTimestamp: number; }; opportunity: { ...; }; protection: { ...; }; earlyWarning: { ...; }; mo...' but required in type 'SignalRowV41'.
services/v41/__tests__/exportServiceV41.ruleExplanation.test.ts(112,7): error TS2561: Object literal may only specify known properties, but 'signals' does not exist in type 'EarlyWarningSnapshot'. Did you mean to write 'signals1H'?
services/v41/__tests__/positionAdvisorV41.test.ts(355,9): error TS2322: Type '{ momentumLong: number; momentumShort: number; momentumConfirmedLong: boolean; momentumConfirmedShort: boolean; signalsLong: never[]; signalsShort: string[]; tpMultiplier: number; slMultiplier: number; }' is not assignable to type 'MomentumResult'.
  Types of property 'momentumLong' are incompatible.
    Type 'number' is not assignable to type '0 | 2 | 1'.
services/v41/__tests__/positionAdvisorV41.test.ts(375,9): error TS2322: Type '{ momentumLong: number; momentumShort: number; momentumConfirmedLong: boolean; momentumConfirmedShort: boolean; signalsLong: never[]; signalsShort: string[]; tpMultiplier: number; slMultiplier: number; }' is not assignable to type 'MomentumResult'.
  Types of property 'momentumLong' are incompatible.
    Type 'number' is not assignable to type '0 | 2 | 1'.
services/v41/__tests__/scanV41.test.ts(55,5): error TS2783: 'symbol' is specified more than once, so this usage will be overwritten.
services/v41/__tests__/scanV41.test.ts(56,5): error TS2783: 'direction' is specified more than once, so this usage will be overwritten.
services/v41/__tests__/scanV41.test.ts(57,5): error TS2783: 'status' is specified more than once, so this usage will be overwritten.
services/v41/__tests__/scanV41.test.ts(208,5): error TS2322: Type '"WATCH_MODE"' is not assignable to type '"INACTIVE"'.
services/v41/__tests__/tradeSessionAdviser.test.ts(154,34): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
services/v41/positionAdviserExplainV41.ts(7,41): error TS2307: Cannot find module '../decisionEngine' or its corresponding type declarations.
services/v41/positionAdviserExplainV41.ts(173,20): error TS7053: Element implicitly has an 'any' type because expression of type 'any' can't be used to index type '{ LONG: string; SHORT: string; WATCH: string; IGNORE: string; }'.
services/v41/positionAdviserExplainV41.ts(174,17): error TS7053: Element implicitly has an 'any' type because expression of type 'any' can't be used to index type '{ LONG: string; SHORT: string; WATCH: string; IGNORE: string; }'.
services/v41/positionAdviserExplainV41.ts(193,17): error TS7053: Element implicitly has an 'any' type because expression of type 'any' can't be used to index type '{ LONG: string; SHORT: string; WATCH: string; IGNORE: string; }'.
services/v41/positionAdviserExplainV41.ts(194,17): error TS7053: Element implicitly has an 'any' type because expression of type 'any' can't be used to index type '{ LONG: string; SHORT: string; WATCH: string; IGNORE: string; }'.
services/v41/rawMarketFetcher.ts(70,46): error TS2345: Argument of type '"1h" | "30m"' is not assignable to parameter of type 'Timeframe'.
  Type '"30m"' is not assignable to type 'Timeframe'.
services/v41/rc3/buildTradeSessionAdviser.ts(62,5): error TS2322: Type 'number' is not assignable to type 'string'.
services/v41/rc3/buildTradeSessionAdviser.ts(77,50): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
services/v41/rc3/buildTradeSessionAdviser.ts(131,7): error TS2322: Type 'number' is not assignable to type 'string'.
services/v41/rc3/buildTradeSessionAdviser.ts(161,5): error TS2322: Type 'number' is not assignable to type 'string'.
services/vwapJournal.test.ts(35,5): error TS2322: Type '"UP"' is not assignable to type 'MarketTrend'.
services/vwapJournal.test.ts(125,37): error TS2345: Argument of type '{ symbol: string; accountSizeAtEntry: number; market: MarketSnapshot; scoring: ScoringSnapshot; plan: { entryZoneOptimal: number; entryZoneType: string; ... 7 more ...; openReason: null; }; vwapSnapshot: VWAPSnapshot | undefined; }' is not assignable to parameter of type '{ symbol: string; accountSizeAtEntry: number; market: MarketSnapshot; scoring: ScoringSnapshot; plan: TradePlanSnapshot; tags?: string[] | undefined; ... 12 more ...; vwapSnapshot?: VWAPSnapshot | undefined; }'.
  Types of property 'plan' are incompatible.
    Type '{ entryZoneOptimal: number; entryZoneType: string; stopLoss: number; takeProfit1: number; takeProfit2: number; takeProfit3: number; sizeActual: number; sizeProposed: number; riskRewardRatio: number; openReason: null; }' is missing the following properties from type 'TradePlanSnapshot': entryZoneRangeLow, entryZoneRangeHigh, slProposed, slActual, and 6 more.
services/whaleRadarNotification.ts(6,8): error TS2307: Cannot find module './localNotification' or its corresponding type declarations.
services/whaleRadarNotification.ts(12,58): error TS2307: Cannot find module './whaleRadarAlarm' or its corresponding type declarations.
store/__tests__/esmBridgeStore.test.ts(31,5): error TS2322: Type 'string' is not assignable to type '"BTCUSDT" | "NEARUSDT" | "SOLUSDT" | "BNBUSDT"'.
store/__tests__/esmBridgeStore.test.ts(121,12): error TS2540: Cannot assign to 'message' because it is a read-only property.
store/__tests__/esmBridgeStore.test.ts(161,16): error TS2540: Cannot assign to 'message' because it is a read-only property.
store/useTradeStore.driveSync.test.ts(210,7): error TS2739: Type '{ symbol: "BTCUSDT"; direction: "LONG"; score: number; longScore: number; shortScore: number; decisionLabel: "VAO_TU_TIN"; decisionDisplay: string; winrate: string; canEnter: boolean; layers: never[]; ... 8 more ...; topLSRatio: number; }' is missing the following properties from type 'SignalRow': regimeConfidence, tradePlan, fromCache
store/useTradeStore.ts(318,18): error TS2304: Cannot find name 'SkippedSetupEntry'.
store/useTradeStore.ts(450,17): error TS2304: Cannot find name 'SkipReason'.
store/useTradeStore.ts(827,11): error TS2304: Cannot find name 'SkippedSetupEntry'.
store/useTradeStore.ts(855,11): error TS2304: Cannot find name 'SkippedSetupEntry'.
store/useTradeStore.ts(856,4): error TS2304: Cannot find name 'SkippedSetupEntry'.
store/useTradeStore.ts(994,18): error TS2304: Cannot find name 'SkippedSetupEntry'.
utils/esmUiDisplay.test.ts(25,5): error TS2322: Type 'string' is not assignable to type '"BTCUSDT" | "NEARUSDT" | "SOLUSDT" | "BNBUSDT"'.
utils/esmUlReviewExplanation.test.ts(19,5): error TS2322: Type 'string' is not assignable to type 'ScorerLayerId'.
utils/esmUlReviewExplanation.test.ts(35,5): error TS2322: Type 'string' is not assignable to type '"BTCUSDT" | "NEARUSDT" | "SOLUSDT" | "BNBUSDT"'.
utils/journalRecommendationDisplay.test.ts(43,5): error TS2322: Type 'string' is not assignable to type '"BTCUSDT" | "NEARUSDT" | "SOLUSDT" | "BNBUSDT"'.

```

---

## 2. GREP — decision_watch / threshold side effects

### 2.1 Command
```
rg -n "decision_watch" -g "*.ts" -g "*.tsx" .
```

### 2.1 Raw hits (only these files)
```
.\services\v41Export\__tests__\rulebook.test.ts:36:  'decision_watch',
.\services\v41Export\__tests__\rulebook.test.ts:245:      'decision_watch',
.\services\v41Export\__tests__\rulebook.test.ts:310:    expect(rules.find((r) => r.id === 'decision_watch')?.status).toBe('FAIL');
.\services\v41Export\__tests__\rulebook.test.ts:325:    expect(rules.find((r) => r.id === 'decision_watch')?.status).toBe('PASS');
.\services\v41Export\__tests__\rulebook.test.ts:351:    expect(rules.find((r) => r.id === 'decision_watch')?.status).toBe('PASS');
.\services\v41Export\__tests__\rulebook.test.ts:361:    expect(rules.find((r) => r.id === 'decision_watch')?.status).toBe('FAIL');
.\services\v41Export\rulebook\Formatter.ts:205:    '10. decision_long_short / decision_watch / decision_ignore dùng Method A partition rời theo confidence (độc lập decision label). decision_final_output = INFO mô tả engine state.',
.\services\v41Export\rulebook\Builder.ts:467:      id: 'decision_watch',
.\services\v41Export\rulebook\Builder.ts:593:    watch: rules.find((r) => r.id === 'decision_watch'),
.\services\v41Export\rulebook\Builder.ts:645:      id: 'decision_watch',
```

### 2.2 Command
```
rg -l "\.threshold" -g "*.ts" services | ForEach-Object { if (rg -q "decision_watch|watchRule|rulebook" $_) { $_ } }
```

Kết quả: không in HIT ngoài pipeline (Builder/Formatter/test đã nằm trong 2.1).  
**Không có file ngoài** `Builder.ts` / `Formatter.ts` / `rulebook.test.ts` chứa `decision_watch`.

**Kết luận side effect:** không có consumer ngoài phạm vi Method A đọc `decision_watch.threshold` như number đơn.

---

## 3. DUMP TOÀN VĂN — TRƯỚC

Path: `docs/outputs/01_RULEBOOK_V41_BTCUSDT_LIVE_SCAN.md`

```markdown
# 01_RULEBOOK_V41 (V4.1)

## METADATA
Document Version: v41-export-1
Generated At: 2026-07-26T08:28:15.240Z
Filename: 01_RULEBOOK_V41_BTCUSDT.md
Symbol: BTCUSDT
Trade Id: UNAVAILABLE
Side: UNAVAILABLE
Engine Version: 1.0.8
Build Info Version: 1.0.8

---

## INPUT SNAPSHOT
Symbol: BTCUSDT
Scan Timestamp (ms): 1785054495217
Fetched At (ms): 1785054495215
Row Error: UNAVAILABLE
Trend Strength: 53
Trend Direction: BEAR
Trend Exhaustion (4H MI): 0
Volume Divergence Pts: 0
Reversal Probability: 0
Market Confidence: 53
Market State: WeakDowntrend
Visibility Mode: TRADE_MODE
Early Warning Severity: CLEAR
Momentum Confirmed Long: NO
Momentum Confirmed Short: NO
Funding Rate: 0.00005884
Has Klines 1H: YES
Has Klines 4H: YES
Has BTC Klines 4H: YES

---

## RULE TRACE

### Rule 01 â€” cvd_flip

Name: CVD Flip
Stage: trend_reversal
Status: FAIL
Actual: NO
Threshold: BULL:(+,+,âˆ’) | BEAR:(âˆ’,âˆ’,+) â€” detectCvdFlip (khÃ´ng cÃ³ ngÆ°á»¡ng magnitude)
Unit: UNAVAILABLE
Source Module: services/v41/reversalDetector.ts
Gates: ACTIVE (cáº§n 4/4 signals)
Data Source: pure_recall
Data Source Detail: evaluateTrendReversalWithContext â†’ signals.cvdFlip / detail.cvdLast3 (detectCvdFlip)
Reason (VI): CVD proxy 3 náº¿n cuá»‘i khÃ´ng khá»›p pattern Ä‘áº£o chiá»u (hoáº·c NEUTRAL/<3 náº¿n)
Evidence:
- cvdLast3[0]=-593.3229999999999
- cvdLast3[1]=-241.99800000000005
- cvdLast3[2]=-129.58299999999986
--------------------------------

### Rule 02 â€” volume_confirmation

Name: Volume Confirmation
Stage: trend_reversal
Status: FAIL
Actual: 0.8389082797121661
Threshold: 1.2
Unit: ratio vs MA20
Source Module: services/v41/reversalDetector.ts
Gates: ACTIVE (cáº§n 4/4 signals)
Data Source: pure_recall
Data Source Detail: evaluateTrendReversalWithContext â†’ signals.volumeConfirmation / detail.volumeRatio
Reason (VI): volumeRatio 0.8389082797121661 â‰¤ 1.2 hoáº·c thiáº¿u náº¿n cho MA20
Evidence:
- volumeRatio=0.8389082797121661
- volumeConfirmation=false
--------------------------------

### Rule 03 â€” trend_exhaustion_gate

Name: Trend Exhaustion Gate
Stage: trend_reversal
Status: FAIL
Actual: 0
Threshold: 55
Unit: pts (1H Task-2)
Source Module: services/v41/reversalDetector.ts
Gates: ACTIVE (cáº§n 4/4 signals)
Data Source: pure_recall
Data Source Detail: evaluateTrendReversalWithContext â†’ signals.trendExhaustion / detail.trendExhaustion (1H)
Reason (VI): trendExhaustion(1H) 0 < 55
Evidence:
- trendExhaustion_1H=0
- note=KHÃ”NG dÃ¹ng snapshot.trendExhaustion (4H MI)
--------------------------------

### Rule 04 â€” structure_break

Name: Structure Break
Stage: trend_reversal
Status: PASS
Actual: LL_HL
Threshold: lookback=50; BULL:HHâ†’LH | BEAR:LLâ†’HL
Unit: UNAVAILABLE
Source Module: services/v41/reversalDetector.ts
Gates: ACTIVE (cáº§n 4/4 signals) â€” áº¨N khá»i checklist UI
Data Source: pure_recall
Data Source Detail: evaluateTrendReversalWithContext â†’ signals.structureBreak / detectStructureBreak (PHáº¢I gá»i láº¡i â€” khÃ´ng cÃ³ trÃªn row)
Reason (VI): Structure break xÃ¡c nháº­n (LL_HL)
Evidence:
- structureBreakType=LL_HL
- olderSwingPrice=63760.5
- newerSwingPrice=64233
- structureBreak=true
--------------------------------

### Rule 05 â€” trend_reversal_confidence

Name: Trend Reversal Confidence
Stage: trend_reversal
Status: WATCH
Actual: 17.5
Threshold: 70
Unit: %
Source Module: services/v41/reversalDetector.ts
Gates: ACTIVE
Data Source: pure_recall
Data Source Detail: evaluateTrendReversalWithContext â†’ state / detail.confidence (resolveTrendReversalState)
Reason (VI): State=WATCH: cáº§n 4/4 signals vÃ  confidence â‰¥ 70 (TREND_REVERSAL_CONFIDENCE_MIN)
Evidence:
- state=WATCH
- confidence=17.5
- activeConditionCount=1
- cvdFlip=false
- volumeConfirmation=false
- trendExhaustion=false
- structureBreak=true
--------------------------------

### Rule 06 â€” market_context_btc

Name: Market Context â€” BTC
Stage: market_context
Status: SKIPPED
Actual: NO
Threshold: 75
Unit: UNAVAILABLE
Source Module: services/v41/marketContextFilter.ts
Gates: Giá»¯ ACTIVE / downgrade WATCH khi fail
Data Source: pure_recall
Data Source Detail: evaluateMarketContext (display) + status SKIPPED vÃ¬ TRâ‰ ACTIVE â€” dimensions.btc
Reason (VI): Market Context khÃ´ng Ã¡p dá»¥ng (Trend Reversal â‰  ACTIVE). BTC BEAR moderate â€” chÆ°a Ä‘á»“ng thuáº­n Ä‘áº£o chiá»u
Evidence:
- contextApplied=false
- preContextState=UNAVAILABLE
- trState=WATCH
- dim.pass=false
- dim.skipped=UNAVAILABLE
- dim.title=BTC dump â€” phá»§ Ä‘á»‹nh Ä‘áº£o bullish
- thresholdNote=BTC_STRONG_THRESHOLD=75; strong band hoáº·c strengthâ‰¥75
- fundingRate_row=0.00005884
--------------------------------

### Rule 07 â€” market_context_funding

Name: Market Context â€” Funding
Stage: market_context
Status: SKIPPED
Actual: YES
Threshold: 0.0003
Unit: UNAVAILABLE
Source Module: services/v41/marketContextFilter.ts
Gates: Giá»¯ ACTIVE / downgrade WATCH khi fail
Data Source: pure_recall
Data Source Detail: evaluateMarketContext (display) + status SKIPPED vÃ¬ TRâ‰ ACTIVE â€” dimensions.funding
Reason (VI): Market Context khÃ´ng Ã¡p dá»¥ng (Trend Reversal â‰  ACTIVE). Funding 0.006% â€” trong vÃ¹ng trung tÃ­nh
Evidence:
- contextApplied=false
- preContextState=UNAVAILABLE
- trState=WATCH
- dim.pass=true
- dim.skipped=UNAVAILABLE
- dim.title=Funding trung tÃ­nh
- thresholdNote=FUNDING_EXTREME_THRESHOLD=Â±0.0003
- fundingRate_row=0.00005884
--------------------------------

### Rule 08 â€” market_context_oi

Name: Market Context â€” OI
Stage: market_context
Status: SKIPPED
Actual: skipped:true
Threshold: 1.5/-1.5
Unit: UNAVAILABLE
Source Module: services/v41/marketContextFilter.ts
Gates: Giá»¯ ACTIVE / downgrade WATCH khi fail
Data Source: pure_recall
Data Source Detail: evaluateMarketContext (display) + status SKIPPED vÃ¬ TRâ‰ ACTIVE â€” dimensions.oi
Reason (VI): Market Context khÃ´ng Ã¡p dá»¥ng (Trend Reversal â‰  ACTIVE). Open Interest khÃ´ng kháº£ dá»¥ng â€” khÃ´ng cháº·n ACTIVE khÃ´ng cÃ³ data trÃªn row (production scan khÃ´ng fetch OI/Whale)
Evidence:
- contextApplied=false
- preContextState=UNAVAILABLE
- trState=WATCH
- dim.pass=true
- dim.skipped=true
- dim.title=OI â€” khÃ´ng cÃ³ dá»¯ liá»‡u
- thresholdNote=OI_BUILDUP_PCT=1.5; OI_DECLINE_PCT=-1.5 â€” production scan KHÃ”NG cÃ³ oiDeltaPct â†’ thÆ°á»ng skipped
- fundingRate_row=0.00005884
- noDataOnRow=true
--------------------------------

### Rule 09 â€” market_context_whale

Name: Market Context â€” Whale
Stage: market_context
Status: SKIPPED
Actual: skipped:true
Threshold: whale.blocksReversal / signal enum
Unit: UNAVAILABLE
Source Module: services/v41/marketContextFilter.ts
Gates: Giá»¯ ACTIVE / downgrade WATCH khi fail
Data Source: pure_recall
Data Source Detail: evaluateMarketContext (display) + status SKIPPED vÃ¬ TRâ‰ ACTIVE â€” dimensions.whale
Reason (VI): Market Context khÃ´ng Ã¡p dá»¥ng (Trend Reversal â‰  ACTIVE). KhÃ´ng cÃ³ tÃ­n hiá»‡u whale khÃ´ng cÃ³ data trÃªn row (production scan khÃ´ng fetch OI/Whale)
Evidence:
- contextApplied=false
- preContextState=UNAVAILABLE
- trState=WATCH
- dim.pass=true
- dim.skipped=true
- dim.title=Whale khÃ´ng phá»§ Ä‘á»‹nh
- thresholdNote=Production scan KHÃ”NG fetch whale â†’ thÆ°á»ng skipped
- fundingRate_row=0.00005884
- noDataOnRow=true
--------------------------------

### Rule 10 â€” market_context_volatility

Name: Market Context â€” Volatility
Stage: market_context
Status: SKIPPED
Actual: NO
Threshold: NORMAL pass; LOW/HIGH/EXTREME fail
Unit: UNAVAILABLE
Source Module: services/v41/marketContextFilter.ts
Gates: Giá»¯ ACTIVE / downgrade WATCH khi fail
Data Source: pure_recall
Data Source Detail: evaluateMarketContext (display) + status SKIPPED vÃ¬ TRâ‰ ACTIVE â€” dimensions.volatility
Reason (VI): Market Context khÃ´ng Ã¡p dá»¥ng (Trend Reversal â‰  ACTIVE). ATR ratio 75.6% â€” thá»‹ trÆ°á»ng quÃ¡ nÃ©n
Evidence:
- contextApplied=false
- preContextState=UNAVAILABLE
- trState=WATCH
- dim.pass=false
- dim.skipped=UNAVAILABLE
- dim.title=Volatility quÃ¡ tháº¥p â€” khÃ´ng giao dá»‹ch
- thresholdNote=computeVolatilityRisk(klines4H) qua evaluateVolatilityMarketContext
- fundingRate_row=0.00005884
--------------------------------

### Rule 11 â€” decision_long_short

Name: Decision LONG/SHORT Threshold
Stage: decision
Status: FAIL
Actual: 12.909375
Threshold: 75
Unit: %
Source Module: services/v41/decision/decisionConfig.ts + decisionEngine.ts
Gates: LONG | SHORT
Data Source: pure_recall
Data Source Detail: computeConfidenceEngineResult â†’ computeDecisionEngineResult â†’ state/confidence
Reason (VI): Decision=IGNORE â€” chÆ°a Ä‘áº¡t LONG/SHORT (cáº§n confâ‰¥75 + eligibility + proposed direction)
Evidence:
- decision=IGNORE
- confidence=12.909375
- threshold_long_short=75
- proposedDirection=LONG
- eligible=false
--------------------------------

### Rule 12 â€” decision_watch

Name: Decision WATCH Threshold
Stage: decision
Status: INFO
Actual: 12.909375
Threshold: 45
Unit: %
Source Module: services/v41/decision/decisionConfig.ts + decisionEngine.ts
Gates: WATCH
Data Source: pure_recall
Data Source Detail: computeDecisionEngineResult â†’ state === WATCH
Reason (VI): Decision=IGNORE â€” khÃ´ng á»Ÿ WATCH
Evidence:
- decision=IGNORE
- confidence=12.909375
- threshold_watch=45
- hardBlocks=TREND_REVERSAL_UNCONFIRMED
--------------------------------

### Rule 13 â€” decision_ignore

Name: Decision IGNORE Threshold
Stage: decision
Status: PASS
Actual: 12.909375
Threshold: 25
Unit: %
Source Module: services/v41/decision/decisionConfig.ts + decisionEngine.ts
Gates: IGNORE
Data Source: pure_recall
Data Source Detail: computeDecisionEngineResult â†’ state === IGNORE
Reason (VI): Decision=IGNORE (NEUTRAL / 0 signals / completeness<0.55 / conf<25)
Evidence:
- decision=IGNORE
- confidence=12.909375
- threshold_ignore=25
- altTrendDirection=BEAR
- trendSignalCount=1
- completenessMultiplier=0.45
--------------------------------

### Rule 14 â€” decision_eligibility

Name: Decision Eligibility
Stage: decision
Status: FAIL
Actual: NO
Threshold: signalsâ‰¥4; completenessâ‰¥0.65; context pass; TR confirmed; no blocks
Unit: UNAVAILABLE
Source Module: services/v41/decisionEngine.ts (isEligibleForDirection)
Gates: LONG/SHORT eligibility
Data Source: pure_recall
Data Source Detail: isEligibleForDirection(readConfidenceDecisionContext(...), V41_DECISION_CONFIG)
Reason (VI): KhÃ´ng Ä‘á»§ eligibility â€” isEligibleForDirection(ctx, V41_DECISION_CONFIG)=false
Evidence:
- isEligibleForDirection=false
- trendReversalConfirmed=false
- marketContextPass=UNAVAILABLE
- marketContextDenied=false
- marketContextApplied=false
- completenessMultiplier=0.45
- minCompletenessMultiplier=0.65
- trendSignalCount=1
- requiredTrendSignalCount=4
- hardBlocks=TREND_REVERSAL_UNCONFIRMED
--------------------------------

### Rule 15 â€” visibility_show

Name: Visibility Show Gate
Stage: visibility
Status: PASS
Actual: YES
Threshold: prelimâ‰¥10 OR reversalâ‰¥60 OR exhaustionâ‰¥60
Unit: UNAVAILABLE
Source Module: services/v41/visibilityManager.ts + types.ts DEFAULT_VISIBILITY_CONFIG
Gates: INACTIVE â†’ WATCH_MODE
Data Source: condition_from_snapshot
Data Source Detail: CONDITION at scan time: calculatePreliminaryScores(row.snapshot) + DEFAULT_VISIBILITY_CONFIG show thresholds (no previousMode)
Reason (VI): Äiá»u kiá»‡n HIá»†N táº¡i thá»i Ä‘iá»ƒm scan â€” visibilityMode hiá»‡n táº¡i=TRADE_MODE (chá»‰ CONDITION; previousMode khÃ´ng cÃ³ trÃªn row)
Evidence:
- evalKind=CONDITION_AT_SCAN_TIME
- buyScorePreliminary=3
- sellScorePreliminary=13
- reversalProbability=0
- trendExhaustion_4H_MI=0
- showBuySellThreshold=10
- showReversalThreshold=60
- showExhaustionThreshold=60
- visibilityMode_row=TRADE_MODE
- previousMode=UNAVAILABLE_on_row
- note=ÄÃ¡nh giÃ¡ CONDITION thuáº§n tá»« snapshot táº¡i thá»i Ä‘iá»ƒm scan â€” khÃ´ng gá»i resolveVisibilityHysteresis
--------------------------------

### Rule 16 â€” visibility_hide

Name: Visibility Hide Gate
Stage: visibility
Status: FAIL
Actual: NO
Threshold: prelim<8 AND reversal<50 AND exhaustion<50
Unit: UNAVAILABLE
Source Module: services/v41/visibilityManager.ts + types.ts DEFAULT_VISIBILITY_CONFIG
Gates: â†’ INACTIVE
Data Source: condition_from_snapshot
Data Source Detail: CONDITION at scan time: calculatePreliminaryScores(row.snapshot) + DEFAULT_VISIBILITY_CONFIG hide thresholds (no previousMode)
Reason (VI): ChÆ°a Ä‘áº¡t Ä‘iá»u kiá»‡n áº¨N táº¡i thá»i Ä‘iá»ƒm scan (hoáº·c vÃ¹ng hysteresis) â€” visibilityMode=TRADE_MODE
Evidence:
- evalKind=CONDITION_AT_SCAN_TIME
- buyScorePreliminary=3
- sellScorePreliminary=13
- reversalProbability=0
- trendExhaustion_4H_MI=0
- hideBuySellThreshold=8
- hideReversalThreshold=50
- hideExhaustionThreshold=50
- visibilityMode_row=TRADE_MODE
- previousMode=UNAVAILABLE_on_row
--------------------------------

### Rule 17 â€” early_warning_block

Name: Early Warning BLOCK
Stage: early_warning
Status: FAIL
Actual: CLEAR
Threshold: BLOCK
Unit: UNAVAILABLE
Source Module: services/v41/earlyWarningEngine.ts + store hysteresis
Gates: BLOCK â†’ opportunityValid=false; visibilityMode=WATCH
Data Source: row_field
Data Source Detail: row.earlyWarning.severity (hysteresis-stabilized); evidence tá»« EarlyWarningSnapshot fields
Reason (VI): severity=CLEAR â€” khÃ´ng BLOCK
Evidence:
- severity=CLEAR
- rawSeverity=CLEAR
- signalCount=0
- volumeConfirmed=false
- signals30M=(none)
- signals1H=(none)
- warningMessage=UNAVAILABLE
- blockMessage=ðŸ”´ Äáº£o chiá»u xÃ¡c nháº­n 30M+1H+Volume â€” khÃ´ng vÃ o lá»‡nh
- rawBlockRule=totalSignalsâ‰¥2 && volumeConfirmed â†’ BLOCK (earlyWarningEngine)
--------------------------------

### Rule 18 â€” momentum_confirmed

Name: Momentum 1H Confirmed
Stage: momentum
Status: FAIL
Actual: LONG(0)/SHORT(1)
Threshold: 2
Unit: signals same side
Source Module: services/v41/momentumEngine1H.ts
Gates: opportunityValid / entry ready
Data Source: row_field
Data Source Detail: row.momentum.momentumConfirmedLong/Short
Reason (VI): ChÆ°a confirmed â€” cáº§n score â‰¥ 2 cÃ¹ng phÃ­a
Evidence:
- momentumConfirmedLong=false
- momentumConfirmedShort=false
- momentumLong=0
- momentumShort=1
- signalsLong=
- signalsShort=CVD_FALLING_1H
- source=row.momentum
--------------------------------

---

## RULE EVALUATION TABLE
| Rule ID | Name | Status | Actual | Threshold | Stage | Source Module |
| --- | --- | --- | --- | --- | --- | --- |
| cvd_flip | CVD Flip | FAIL | NO | BULL:(+,+,âˆ’) | BEAR:(âˆ’,âˆ’,+) â€” detectCvdFlip (khÃ´ng cÃ³ ngÆ°á»¡ng magnitude) | trend_reversal | services/v41/reversalDetector.ts |
| volume_confirmation | Volume Confirmation | FAIL | 0.8389082797121661 | 1.2 | trend_reversal | services/v41/reversalDetector.ts |
| trend_exhaustion_gate | Trend Exhaustion Gate | FAIL | 0 | 55 | trend_reversal | services/v41/reversalDetector.ts |
| structure_break | Structure Break | PASS | LL_HL | lookback=50; BULL:HHâ†’LH | BEAR:LLâ†’HL | trend_reversal | services/v41/reversalDetector.ts |
| trend_reversal_confidence | Trend Reversal Confidence | WATCH | 17.5 | 70 | trend_reversal | services/v41/reversalDetector.ts |
| market_context_btc | Market Context â€” BTC | SKIPPED | NO | 75 | market_context | services/v41/marketContextFilter.ts |
| market_context_funding | Market Context â€” Funding | SKIPPED | YES | 0.0003 | market_context | services/v41/marketContextFilter.ts |
| market_context_oi | Market Context â€” OI | SKIPPED | skipped:true | 1.5/-1.5 | market_context | services/v41/marketContextFilter.ts |
| market_context_whale | Market Context â€” Whale | SKIPPED | skipped:true | whale.blocksReversal / signal enum | market_context | services/v41/marketContextFilter.ts |
| market_context_volatility | Market Context â€” Volatility | SKIPPED | NO | NORMAL pass; LOW/HIGH/EXTREME fail | market_context | services/v41/marketContextFilter.ts |
| decision_long_short | Decision LONG/SHORT Threshold | FAIL | 12.909375 | 75 | decision | services/v41/decision/decisionConfig.ts + decisionEngine.ts |
| decision_watch | Decision WATCH Threshold | INFO | 12.909375 | 45 | decision | services/v41/decision/decisionConfig.ts + decisionEngine.ts |
| decision_ignore | Decision IGNORE Threshold | PASS | 12.909375 | 25 | decision | services/v41/decision/decisionConfig.ts + decisionEngine.ts |
| decision_eligibility | Decision Eligibility | FAIL | NO | signalsâ‰¥4; completenessâ‰¥0.65; context pass; TR confirmed; no blocks | decision | services/v41/decisionEngine.ts (isEligibleForDirection) |
| visibility_show | Visibility Show Gate | PASS | YES | prelimâ‰¥10 OR reversalâ‰¥60 OR exhaustionâ‰¥60 | visibility | services/v41/visibilityManager.ts + types.ts DEFAULT_VISIBILITY_CONFIG |
| visibility_hide | Visibility Hide Gate | FAIL | NO | prelim<8 AND reversal<50 AND exhaustion<50 | visibility | services/v41/visibilityManager.ts + types.ts DEFAULT_VISIBILITY_CONFIG |
| early_warning_block | Early Warning BLOCK | FAIL | CLEAR | BLOCK | early_warning | services/v41/earlyWarningEngine.ts + store hysteresis |
| momentum_confirmed | Momentum 1H Confirmed | FAIL | LONG(0)/SHORT(1) | 2 | momentum | services/v41/momentumEngine1H.ts |

---

## RULE SUMMARY
Total Rules: 18
Passed: 3
Failed: 8
Watch: 1
Skipped: 5
Info: 1
Decision Output: IGNORE
Visibility Mode: TRADE_MODE
Trend Reversal State: WATCH
Market Context Applied: UNAVAILABLE
Decision Block Codes (V4.1): TREND_REVERSAL_UNCONFIRMED

---

## PIPELINE STAGE MAP

1. Market Intelligence (snapshot on row) â†’ trendStrength / exhaustion / reversal / confidence / marketState
2. Visibility (show/hide conditions from snapshot) â†’ visibilityMode on row
3. Trend Reversal Task-2 (1H) â†’ cvd_flip / volume / exhaustion / structure_break / confidence â†’ ACTIVE|WATCH
4. Market Context (5 dims, only applied when ACTIVE) â†’ may downgrade to WATCH
5. Confidence Engine â†’ final confidence + decisionContext
6. Decision Engine â†’ LONG|SHORT|WATCH|IGNORE
7. Early Warning BLOCK + Momentum confirmed â†’ entry gates (scan path)

Note: UI checklist "THIáº¾U GÃŒ" chá»‰ hiá»‡n 4 má»¥c (cvd/volume/btc/exhaustion) â€” thiáº¿u structure_break vÃ  Ä‘á»§ 5 market-context dims.

---

## DECISION CHAIN
MarketState=WeakDowntrend â†’ Visibility=TRADE_MODE â†’ TrendReversal=WATCH(signals=1/4) â†’ MarketContext=NOT_APPLIED â†’ Confidence=12.909375 â†’ Decision=IGNORE â†’ EarlyWarning=CLEAR â†’ MomentumLong=false|Short=false

---

## AI REVIEW

Checklist trá»‘ng â€” reviewer Ä‘iá»n (khÃ´ng suy diá»…n tá»« V3/V4):

| Review Item | Result | Severity | Notes |
| --- | --- | --- | --- |
| Wrong threshold vs code? | â–¡ | UNAVAILABLE | UNAVAILABLE |
| Missing Structure Break while ACTIVE? | â–¡ | UNAVAILABLE | UNAVAILABLE |
| Market Context skipped mislabeled as PASS? | â–¡ | UNAVAILABLE | UNAVAILABLE |
| Decision vs eligibility contradiction? | â–¡ | UNAVAILABLE | UNAVAILABLE |
| Used 4H MI exhaustion for 1H TR gate? | â–¡ | UNAVAILABLE | UNAVAILABLE |
| OI/Whale skipped but treated as confirmed? | â–¡ | UNAVAILABLE | UNAVAILABLE |
| Visibility condition vs hysteresis outcome confused? | â–¡ | UNAVAILABLE | UNAVAILABLE |
| Need Optimization? | â–¡ | UNAVAILABLE | UNAVAILABLE |

---

## AI REVIEW SPECIFICATION (Rulebook V4.1 â€” EMBEDDED)

### REVIEW RULES
1. Má»i Actual/Threshold pháº£i trÃ¹ng field copy tá»« document hoáº·c tá»« module Ä‘Æ°á»£c nÃªu trong Source Module â€” khÃ´ng Ä‘oÃ¡n.
2. KhÃ´ng map rule V4.1 â†’ Group A/B/C hay HB-/GB- cá»§a V3/V4.
3. Status chá»‰ dÃ¹ng PASS|FAIL|WATCH|SKIPPED|INFO â€” khÃ´ng HARD/SOFT/UNLOCK.
4. Checklist UI 4 má»¥c khÃ´ng Ä‘Æ°á»£c hiá»ƒu lÃ  Ä‘á»§ Ä‘iá»u kiá»‡n ACTIVE; pháº£i kiá»ƒm tra thÃªm structure_break + confâ‰¥70 + market context.
5. Náº¿u Evidence thiáº¿u mÃ  rule cáº§n threshold sá»‘ â†’ classification INSUFFICIENT EVIDENCE, khÃ´ng bá»‹a sá»‘.
6. Market State category lÃ  INFO/regime â€” reviewer khÃ´ng tá»± suy ngÆ°á»¡ng ts/ex/vol tá»« category (Ä‘Ã£ khÃ³a á»Ÿ MI Spec).
7. decision_eligibility pháº£i gá»i isEligibleForDirection Ä‘Ã£ export â€” khÃ´ng mirror logic riÃªng trong Builder.
8. OI/Whale trong production scan thÆ°á»ng skipped (khÃ´ng cÃ³ data trÃªn row) â€” skipped â‰  business PASS; váº«n giá»¯ trong Rulebook v1.
9. Visibility chá»‰ Ä‘Ã¡nh giÃ¡ CONDITION táº¡i thá»i Ä‘iá»ƒm scan (previousMode khÃ´ng cÃ³ trÃªn row).

### REVIEW LEVEL RESOLUTION (DETERMINISTIC)

Rulebook Ä‘á»c Status/Actual Ä‘Ã£ freeze trong document â€” KHÃ”NG tá»± suy láº¡i ngÆ°á»¡ng tá»« narrative.

| Observation (from this document) | Suggested V41ReviewLevel | Notes |
| --- | --- | --- |
| Rule FAIL mÃ  Decision Output = LONG hoáº·c SHORT | CRITICAL | MÃ¢u thuáº«n pipeline |
| structure_break FAIL trong khi Trend Reversal State = ACTIVE | CRITICAL | ACTIVE Ä‘Ã²i há»i 4/4 signals |
| Market Context dim FAIL nhÆ°ng Decision váº«n LONG/SHORT | WARN | Kiá»ƒm tra hard-block / eligibility |
| decision_eligibility Actual â‰  isEligibleForDirection cÃ¹ng input | CRITICAL | Builder pháº£i gá»i hÃ m Ä‘Ã£ export, khÃ´ng tá»± tÃ­nh |
| OI/Whale Status=SKIPPED bá»‹ diá»…n giáº£i nhÆ° confirmed PASS | WARN | skipped = no data on row, khÃ´ng cháº·n |
| Thiáº¿u klines1H â†’ nhiá»u rule SKIPPED khi audit action | BLOCK | KhÃ´ng Ä‘á»§ evidence |
| Má»i gate khá»›p Decision Output | INFO | Descriptive only |

### WORKED EXAMPLES

Example A â€” TR chÆ°a Ä‘á»§:
- Input: cvd_flip=FAIL, volume_confirmation=FAIL â†’ trend_reversal_confidence WATCH
- Reviewer: Decision khÃ´ng Ä‘Æ°á»£c LONG/SHORT chá»‰ vÃ¬ Confidence UI cao.

Example B â€” Context phá»§ Ä‘á»‹nh:
- Input: 4/4 TR signals + confâ‰¥70 nhÆ°ng market_context_btc FAIL â†’ state downgrade WATCH
- Reviewer: WARN náº¿u Decision váº«n LONG/SHORT.

Example C â€” EW BLOCK:
- Input: early_warning_block Actual=BLOCK
- Reviewer: entry/opportunity pháº£i bá»‹ cháº·n; Visibility cÃ³ thá»ƒ bá»‹ demote WATCH.

### REVIEW CLASSIFICATION
PASS | BUG | INSUFFICIENT EVIDENCE | ENHANCEMENT

```

---

## 4. DUMP TOÀN VĂN — SAU (Method A)

Path: `docs/outputs/01_RULEBOOK_V41_BTCUSDT_LIVE_SCAN_METHOD_A.md`

```markdown
# 01_RULEBOOK_V41 (V4.1)

## METADATA
Document Version: v41-export-1
Generated At: 2026-07-26T10:38:30.579Z
Filename: 01_RULEBOOK_V41_BTCUSDT.md
Symbol: BTCUSDT
Trade Id: UNAVAILABLE
Side: UNAVAILABLE
Engine Version: 1.0.8
Build Info Version: 1.0.8

---

## INPUT SNAPSHOT
Symbol: BTCUSDT
Scan Timestamp (ms): 1785062310560
Fetched At (ms): 1785062310559
Row Error: UNAVAILABLE
Trend Strength: 53
Trend Direction: BEAR
Trend Exhaustion (4H MI): 0
Volume Divergence Pts: 0
Reversal Probability: 0
Market Confidence: 53
Market State: WeakDowntrend
Visibility Mode: TRADE_MODE
Early Warning Severity: CLEAR
Momentum Confirmed Long: NO
Momentum Confirmed Short: NO
Funding Rate: 0.00005884
Has Klines 1H: YES
Has Klines 4H: YES
Has BTC Klines 4H: YES

---

## RULE TRACE

### Rule 01 â€” cvd_flip

Name: CVD Flip
Stage: trend_reversal
Status: FAIL
Actual: NO
Threshold: BULL:(+,+,âˆ’) | BEAR:(âˆ’,âˆ’,+) â€” detectCvdFlip (khÃ´ng cÃ³ ngÆ°á»¡ng magnitude)
Unit: UNAVAILABLE
Source Module: services/v41/reversalDetector.ts
Gates: ACTIVE (cáº§n 4/4 signals)
Data Source: pure_recall
Data Source Detail: evaluateTrendReversalWithContext â†’ signals.cvdFlip / detail.cvdLast3 (detectCvdFlip)
Reason (VI): CVD proxy 3 náº¿n cuá»‘i khÃ´ng khá»›p pattern Ä‘áº£o chiá»u (hoáº·c NEUTRAL/<3 náº¿n)
Evidence:
- cvdLast3[0]=-129.58299999999986
- cvdLast3[1]=193.4920000000002
- cvdLast3[2]=179.00400000000013
--------------------------------

### Rule 02 â€” volume_confirmation

Name: Volume Confirmation
Stage: trend_reversal
Status: FAIL
Actual: 0.9319647941053599
Threshold: 1.2
Unit: ratio vs MA20
Source Module: services/v41/reversalDetector.ts
Gates: ACTIVE (cáº§n 4/4 signals)
Data Source: pure_recall
Data Source Detail: evaluateTrendReversalWithContext â†’ signals.volumeConfirmation / detail.volumeRatio
Reason (VI): volumeRatio 0.9319647941053599 â‰¤ 1.2 hoáº·c thiáº¿u náº¿n cho MA20
Evidence:
- volumeRatio=0.9319647941053599
- volumeConfirmation=false
--------------------------------

### Rule 03 â€” trend_exhaustion_gate

Name: Trend Exhaustion Gate
Stage: trend_reversal
Status: FAIL
Actual: 0
Threshold: 55
Unit: pts (1H Task-2)
Source Module: services/v41/reversalDetector.ts
Gates: ACTIVE (cáº§n 4/4 signals)
Data Source: pure_recall
Data Source Detail: evaluateTrendReversalWithContext â†’ signals.trendExhaustion / detail.trendExhaustion (1H)
Reason (VI): trendExhaustion(1H) 0 < 55
Evidence:
- trendExhaustion_1H=0
- note=KHÃ”NG dÃ¹ng snapshot.trendExhaustion (4H MI)
--------------------------------

### Rule 04 â€” structure_break

Name: Structure Break
Stage: trend_reversal
Status: PASS
Actual: LL_HL
Threshold: lookback=50; BULL:HHâ†’LH | BEAR:LLâ†’HL
Unit: UNAVAILABLE
Source Module: services/v41/reversalDetector.ts
Gates: ACTIVE (cáº§n 4/4 signals) â€” áº¨N khá»i checklist UI
Data Source: pure_recall
Data Source Detail: evaluateTrendReversalWithContext â†’ signals.structureBreak / detectStructureBreak (PHáº¢I gá»i láº¡i â€” khÃ´ng cÃ³ trÃªn row)
Reason (VI): Structure break xÃ¡c nháº­n (LL_HL)
Evidence:
- structureBreakType=LL_HL
- olderSwingPrice=64233
- newerSwingPrice=64256.4
- structureBreak=true
--------------------------------

### Rule 05 â€” trend_reversal_confidence

Name: Trend Reversal Confidence
Stage: trend_reversal
Status: WATCH
Actual: 17.5
Threshold: 70
Unit: %
Source Module: services/v41/reversalDetector.ts
Gates: ACTIVE
Data Source: pure_recall
Data Source Detail: evaluateTrendReversalWithContext â†’ state / detail.confidence (resolveTrendReversalState)
Reason (VI): State=WATCH: cáº§n 4/4 signals vÃ  confidence â‰¥ 70 (TREND_REVERSAL_CONFIDENCE_MIN)
Evidence:
- state=WATCH
- confidence=17.5
- activeConditionCount=1
- cvdFlip=false
- volumeConfirmation=false
- trendExhaustion=false
- structureBreak=true
--------------------------------

### Rule 06 â€” market_context_btc

Name: Market Context â€” BTC
Stage: market_context
Status: SKIPPED
Actual: NO
Threshold: 75
Unit: UNAVAILABLE
Source Module: services/v41/marketContextFilter.ts
Gates: Giá»¯ ACTIVE / downgrade WATCH khi fail
Data Source: pure_recall
Data Source Detail: evaluateMarketContext (display) + status SKIPPED vÃ¬ TRâ‰ ACTIVE â€” dimensions.btc
Reason (VI): Market Context khÃ´ng Ã¡p dá»¥ng (Trend Reversal â‰  ACTIVE). BTC BEAR moderate â€” chÆ°a Ä‘á»“ng thuáº­n Ä‘áº£o chiá»u
Evidence:
- contextApplied=false
- preContextState=UNAVAILABLE
- trState=WATCH
- dim.pass=false
- dim.skipped=UNAVAILABLE
- dim.title=BTC dump â€” phá»§ Ä‘á»‹nh Ä‘áº£o bullish
- thresholdNote=BTC_STRONG_THRESHOLD=75; strong band hoáº·c strengthâ‰¥75
- fundingRate_row=0.00005884
--------------------------------

### Rule 07 â€” market_context_funding

Name: Market Context â€” Funding
Stage: market_context
Status: SKIPPED
Actual: YES
Threshold: 0.0003
Unit: UNAVAILABLE
Source Module: services/v41/marketContextFilter.ts
Gates: Giá»¯ ACTIVE / downgrade WATCH khi fail
Data Source: pure_recall
Data Source Detail: evaluateMarketContext (display) + status SKIPPED vÃ¬ TRâ‰ ACTIVE â€” dimensions.funding
Reason (VI): Market Context khÃ´ng Ã¡p dá»¥ng (Trend Reversal â‰  ACTIVE). Funding 0.006% â€” trong vÃ¹ng trung tÃ­nh
Evidence:
- contextApplied=false
- preContextState=UNAVAILABLE
- trState=WATCH
- dim.pass=true
- dim.skipped=UNAVAILABLE
- dim.title=Funding trung tÃ­nh
- thresholdNote=FUNDING_EXTREME_THRESHOLD=Â±0.0003
- fundingRate_row=0.00005884
--------------------------------

### Rule 08 â€” market_context_oi

Name: Market Context â€” OI
Stage: market_context
Status: SKIPPED
Actual: skipped:true
Threshold: 1.5/-1.5
Unit: UNAVAILABLE
Source Module: services/v41/marketContextFilter.ts
Gates: Giá»¯ ACTIVE / downgrade WATCH khi fail
Data Source: pure_recall
Data Source Detail: evaluateMarketContext (display) + status SKIPPED vÃ¬ TRâ‰ ACTIVE â€” dimensions.oi
Reason (VI): Market Context khÃ´ng Ã¡p dá»¥ng (Trend Reversal â‰  ACTIVE). Open Interest khÃ´ng kháº£ dá»¥ng â€” khÃ´ng cháº·n ACTIVE khÃ´ng cÃ³ data trÃªn row (production scan khÃ´ng fetch OI/Whale)
Evidence:
- contextApplied=false
- preContextState=UNAVAILABLE
- trState=WATCH
- dim.pass=true
- dim.skipped=true
- dim.title=OI â€” khÃ´ng cÃ³ dá»¯ liá»‡u
- thresholdNote=OI_BUILDUP_PCT=1.5; OI_DECLINE_PCT=-1.5 â€” production scan KHÃ”NG cÃ³ oiDeltaPct â†’ thÆ°á»ng skipped
- fundingRate_row=0.00005884
- noDataOnRow=true
--------------------------------

### Rule 09 â€” market_context_whale

Name: Market Context â€” Whale
Stage: market_context
Status: SKIPPED
Actual: skipped:true
Threshold: whale.blocksReversal / signal enum
Unit: UNAVAILABLE
Source Module: services/v41/marketContextFilter.ts
Gates: Giá»¯ ACTIVE / downgrade WATCH khi fail
Data Source: pure_recall
Data Source Detail: evaluateMarketContext (display) + status SKIPPED vÃ¬ TRâ‰ ACTIVE â€” dimensions.whale
Reason (VI): Market Context khÃ´ng Ã¡p dá»¥ng (Trend Reversal â‰  ACTIVE). KhÃ´ng cÃ³ tÃ­n hiá»‡u whale khÃ´ng cÃ³ data trÃªn row (production scan khÃ´ng fetch OI/Whale)
Evidence:
- contextApplied=false
- preContextState=UNAVAILABLE
- trState=WATCH
- dim.pass=true
- dim.skipped=true
- dim.title=Whale khÃ´ng phá»§ Ä‘á»‹nh
- thresholdNote=Production scan KHÃ”NG fetch whale â†’ thÆ°á»ng skipped
- fundingRate_row=0.00005884
- noDataOnRow=true
--------------------------------

### Rule 10 â€” market_context_volatility

Name: Market Context â€” Volatility
Stage: market_context
Status: SKIPPED
Actual: NO
Threshold: NORMAL pass; LOW/HIGH/EXTREME fail
Unit: UNAVAILABLE
Source Module: services/v41/marketContextFilter.ts
Gates: Giá»¯ ACTIVE / downgrade WATCH khi fail
Data Source: pure_recall
Data Source Detail: evaluateMarketContext (display) + status SKIPPED vÃ¬ TRâ‰ ACTIVE â€” dimensions.volatility
Reason (VI): Market Context khÃ´ng Ã¡p dá»¥ng (Trend Reversal â‰  ACTIVE). ATR ratio 75.6% â€” thá»‹ trÆ°á»ng quÃ¡ nÃ©n
Evidence:
- contextApplied=false
- preContextState=UNAVAILABLE
- trState=WATCH
- dim.pass=false
- dim.skipped=UNAVAILABLE
- dim.title=Volatility quÃ¡ tháº¥p â€” khÃ´ng giao dá»‹ch
- thresholdNote=computeVolatilityRisk(klines4H) qua evaluateVolatilityMarketContext
- fundingRate_row=0.00005884
--------------------------------

### Rule 11 â€” decision_long_short

Name: Decision LONG/SHORT Threshold
Stage: decision
Status: FAIL
Actual: 12.909375
Threshold: â‰¥ 75
Unit: %
Source Module: services/v41/decision/decisionConfig.ts (thresholds.long/short)
Gates: LONG | SHORT confidence band
Data Source: pure_recall
Data Source Detail: Status = actualâ‰¥thresholds.long (75) â€” Method A partition; khÃ´ng so decision label
Reason (VI): actual 12.909375 < 75 â€” ngoÃ i band LONG/SHORT
Evidence:
- confidence=12.909375
- threshold_long_short=75
- partition=[75, 100]
- engineDecision_notUsedForStatus=IGNORE
- proposedDirection=LONG
- eligible=false
--------------------------------

### Rule 12 â€” decision_watch

Name: Decision WATCH Threshold
Stage: decision
Status: FAIL
Actual: 12.909375
Threshold: 45 â‰¤ x < 75
Unit: %
Source Module: services/v41/decision/decisionConfig.ts (thresholds.watch/long)
Gates: WATCH confidence band
Data Source: pure_recall
Data Source Detail: Status = thresholds.watch â‰¤ actual < thresholds.long â€” Method A; cháº·n trÃªn trÃ¡nh chá»“ng long
Reason (VI): actual 12.909375 âˆ‰ [45, 75) â€” ngoÃ i band WATCH
Evidence:
- confidence=12.909375
- threshold_watch_lo=45
- threshold_watch_hi_exclusive=75
- partition=[45, 75)
- engineDecision_notUsedForStatus=IGNORE
- hardBlocks=TREND_REVERSAL_UNCONFIRMED
--------------------------------

### Rule 13 â€” decision_ignore

Name: Decision IGNORE Threshold
Stage: decision
Status: PASS
Actual: 12.909375
Threshold: < 45 (band IGNORE; config.ignore=25 = isIgnoreCase floor)
Unit: %
Source Module: services/v41/decision/decisionConfig.ts + decisionEngine ladder
Gates: IGNORE confidence band
Data Source: pure_recall
Data Source Detail: Status = actual < thresholds.watch (45) â€” Method A; config.ignore=25 chá»‰ phÃ¢n nhÃ¡nh reasonVi
Reason (VI): KhÃ´ng Ä‘á»§ tÃ­n hiá»‡u â€” dÆ°á»›i ngÆ°á»¡ng ignore gá»‘c (25), gáº§n nhÆ° khÃ´ng cÃ³ dá»¯ liá»‡u há»— trá»£ hÆ°á»›ng Ä‘i
Evidence:
- confidence=12.909375
- threshold_ignore_band_hi_exclusive=45
- threshold_ignore_config_floor=25
- partition=[0, 45)
- engineDecision_notUsedForStatus=IGNORE
- altTrendDirection=BEAR
- trendSignalCount=1
- completenessMultiplier=0.45
--------------------------------

### Rule 14 â€” decision_final_output

Name: Decision Final Output (engine)
Stage: decision
Status: INFO
Actual: IGNORE
Threshold: UNAVAILABLE
Unit: UNAVAILABLE
Source Module: services/v41/decisionEngine.ts (evaluateDecision â†’ state)
Gates: Descriptive â€” matchedTier cho AI Review CRITICAL check
Data Source: pure_recall
Data Source Detail: computeDecisionEngineResult â†’ state; Status luÃ´n INFO
Reason (VI): Engine decision cuá»‘i = IGNORE (mÃ´ táº£ only; khÃ´ng so threshold)
Evidence:
- decision=IGNORE
- confidence=12.909375
--------------------------------

### Rule 15 â€” decision_eligibility

Name: Decision Eligibility
Stage: decision
Status: FAIL
Actual: NO
Threshold: signalsâ‰¥4; completenessâ‰¥0.65; context pass; TR confirmed; no blocks
Unit: UNAVAILABLE
Source Module: services/v41/decisionEngine.ts (isEligibleForDirection)
Gates: LONG/SHORT eligibility
Data Source: pure_recall
Data Source Detail: isEligibleForDirection(readConfidenceDecisionContext(...), V41_DECISION_CONFIG)
Reason (VI): KhÃ´ng Ä‘á»§ eligibility â€” isEligibleForDirection(ctx, V41_DECISION_CONFIG)=false
Evidence:
- isEligibleForDirection=false
- trendReversalConfirmed=false
- marketContextPass=UNAVAILABLE
- marketContextDenied=false
- marketContextApplied=false
- completenessMultiplier=0.45
- minCompletenessMultiplier=0.65
- trendSignalCount=1
- requiredTrendSignalCount=4
- hardBlocks=TREND_REVERSAL_UNCONFIRMED
--------------------------------

### Rule 16 â€” visibility_show

Name: Visibility Show Gate
Stage: visibility
Status: PASS
Actual: YES
Threshold: prelimâ‰¥10 OR reversalâ‰¥60 OR exhaustionâ‰¥60
Unit: UNAVAILABLE
Source Module: services/v41/visibilityManager.ts + types.ts DEFAULT_VISIBILITY_CONFIG
Gates: INACTIVE â†’ WATCH_MODE
Data Source: condition_from_snapshot
Data Source Detail: CONDITION at scan time: calculatePreliminaryScores(row.snapshot) + DEFAULT_VISIBILITY_CONFIG show thresholds (no previousMode)
Reason (VI): Äiá»u kiá»‡n HIá»†N táº¡i thá»i Ä‘iá»ƒm scan â€” visibilityMode hiá»‡n táº¡i=TRADE_MODE (chá»‰ CONDITION; previousMode khÃ´ng cÃ³ trÃªn row)
Evidence:
- evalKind=CONDITION_AT_SCAN_TIME
- buyScorePreliminary=3
- sellScorePreliminary=13
- reversalProbability=0
- trendExhaustion_4H_MI=0
- showBuySellThreshold=10
- showReversalThreshold=60
- showExhaustionThreshold=60
- visibilityMode_row=TRADE_MODE
- previousMode=UNAVAILABLE_on_row
- note=ÄÃ¡nh giÃ¡ CONDITION thuáº§n tá»« snapshot táº¡i thá»i Ä‘iá»ƒm scan â€” khÃ´ng gá»i resolveVisibilityHysteresis
--------------------------------

### Rule 17 â€” visibility_hide

Name: Visibility Hide Gate
Stage: visibility
Status: FAIL
Actual: NO
Threshold: prelim<8 AND reversal<50 AND exhaustion<50
Unit: UNAVAILABLE
Source Module: services/v41/visibilityManager.ts + types.ts DEFAULT_VISIBILITY_CONFIG
Gates: â†’ INACTIVE
Data Source: condition_from_snapshot
Data Source Detail: CONDITION at scan time: calculatePreliminaryScores(row.snapshot) + DEFAULT_VISIBILITY_CONFIG hide thresholds (no previousMode)
Reason (VI): ChÆ°a Ä‘áº¡t Ä‘iá»u kiá»‡n áº¨N táº¡i thá»i Ä‘iá»ƒm scan (hoáº·c vÃ¹ng hysteresis) â€” visibilityMode=TRADE_MODE
Evidence:
- evalKind=CONDITION_AT_SCAN_TIME
- buyScorePreliminary=3
- sellScorePreliminary=13
- reversalProbability=0
- trendExhaustion_4H_MI=0
- hideBuySellThreshold=8
- hideReversalThreshold=50
- hideExhaustionThreshold=50
- visibilityMode_row=TRADE_MODE
- previousMode=UNAVAILABLE_on_row
--------------------------------

### Rule 18 â€” early_warning_block

Name: Early Warning BLOCK
Stage: early_warning
Status: FAIL
Actual: CLEAR
Threshold: BLOCK
Unit: UNAVAILABLE
Source Module: services/v41/earlyWarningEngine.ts + store hysteresis
Gates: BLOCK â†’ opportunityValid=false; visibilityMode=WATCH
Data Source: row_field
Data Source Detail: row.earlyWarning.severity (hysteresis-stabilized); evidence tá»« EarlyWarningSnapshot fields
Reason (VI): severity=CLEAR â€” khÃ´ng BLOCK
Evidence:
- severity=CLEAR
- rawSeverity=WARNING_SOFT
- signalCount=4
- volumeConfirmed=false
- signals30M=PRICE_ABOVE_EMA20_30M|EMA20_SLOPE_UP_30M
- signals1H=PRICE_ABOVE_EMA20_1H|BTC_REVERSAL_1H
- warningMessage=âš ï¸ 4 tÃ­n hiá»‡u Ä‘áº£o chiá»u 30M+1H â€” tháº­n trá»ng
- blockMessage=ðŸ”´ Äáº£o chiá»u xÃ¡c nháº­n 30M+1H+Volume â€” khÃ´ng vÃ o lá»‡nh
- rawBlockRule=totalSignalsâ‰¥2 && volumeConfirmed â†’ BLOCK (earlyWarningEngine)
--------------------------------

### Rule 19 â€” momentum_confirmed

Name: Momentum 1H Confirmed
Stage: momentum
Status: FAIL
Actual: LONG(0)/SHORT(0)
Threshold: 2
Unit: signals same side
Source Module: services/v41/momentumEngine1H.ts
Gates: opportunityValid / entry ready
Data Source: row_field
Data Source Detail: row.momentum.momentumConfirmedLong/Short
Reason (VI): ChÆ°a confirmed â€” cáº§n score â‰¥ 2 cÃ¹ng phÃ­a
Evidence:
- momentumConfirmedLong=false
- momentumConfirmedShort=false
- momentumLong=0
- momentumShort=0
- signalsLong=
- signalsShort=
- source=row.momentum
--------------------------------

---

## RULE EVALUATION TABLE
| Rule ID | Name | Status | Actual | Threshold | Stage | Source Module |
| --- | --- | --- | --- | --- | --- | --- |
| cvd_flip | CVD Flip | FAIL | NO | BULL:(+,+,âˆ’)  /  BEAR:(âˆ’,âˆ’,+) â€” detectCvdFlip (khÃ´ng cÃ³ ngÆ°á»¡ng magnitude) | trend_reversal | services/v41/reversalDetector.ts |
| volume_confirmation | Volume Confirmation | FAIL | 0.9319647941053599 | 1.2 | trend_reversal | services/v41/reversalDetector.ts |
| trend_exhaustion_gate | Trend Exhaustion Gate | FAIL | 0 | 55 | trend_reversal | services/v41/reversalDetector.ts |
| structure_break | Structure Break | PASS | LL_HL | lookback=50; BULL:HHâ†’LH  /  BEAR:LLâ†’HL | trend_reversal | services/v41/reversalDetector.ts |
| trend_reversal_confidence | Trend Reversal Confidence | WATCH | 17.5 | 70 | trend_reversal | services/v41/reversalDetector.ts |
| market_context_btc | Market Context â€” BTC | SKIPPED | NO | 75 | market_context | services/v41/marketContextFilter.ts |
| market_context_funding | Market Context â€” Funding | SKIPPED | YES | 0.0003 | market_context | services/v41/marketContextFilter.ts |
| market_context_oi | Market Context â€” OI | SKIPPED | skipped:true | 1.5/-1.5 | market_context | services/v41/marketContextFilter.ts |
| market_context_whale | Market Context â€” Whale | SKIPPED | skipped:true | whale.blocksReversal / signal enum | market_context | services/v41/marketContextFilter.ts |
| market_context_volatility | Market Context â€” Volatility | SKIPPED | NO | NORMAL pass; LOW/HIGH/EXTREME fail | market_context | services/v41/marketContextFilter.ts |
| decision_long_short | Decision LONG/SHORT Threshold | FAIL | 12.909375 | â‰¥ 75 | decision | services/v41/decision/decisionConfig.ts (thresholds.long/short) |
| decision_watch | Decision WATCH Threshold | FAIL | 12.909375 | 45 â‰¤ x < 75 | decision | services/v41/decision/decisionConfig.ts (thresholds.watch/long) |
| decision_ignore | Decision IGNORE Threshold | PASS | 12.909375 | < 45 (band IGNORE; config.ignore=25 = isIgnoreCase floor) | decision | services/v41/decision/decisionConfig.ts + decisionEngine ladder |
| decision_final_output | Decision Final Output (engine) | INFO | IGNORE | UNAVAILABLE | decision | services/v41/decisionEngine.ts (evaluateDecision â†’ state) |
| decision_eligibility | Decision Eligibility | FAIL | NO | signalsâ‰¥4; completenessâ‰¥0.65; context pass; TR confirmed; no blocks | decision | services/v41/decisionEngine.ts (isEligibleForDirection) |
| visibility_show | Visibility Show Gate | PASS | YES | prelimâ‰¥10 OR reversalâ‰¥60 OR exhaustionâ‰¥60 | visibility | services/v41/visibilityManager.ts + types.ts DEFAULT_VISIBILITY_CONFIG |
| visibility_hide | Visibility Hide Gate | FAIL | NO | prelim<8 AND reversal<50 AND exhaustion<50 | visibility | services/v41/visibilityManager.ts + types.ts DEFAULT_VISIBILITY_CONFIG |
| early_warning_block | Early Warning BLOCK | FAIL | CLEAR | BLOCK | early_warning | services/v41/earlyWarningEngine.ts + store hysteresis |
| momentum_confirmed | Momentum 1H Confirmed | FAIL | LONG(0)/SHORT(0) | 2 | momentum | services/v41/momentumEngine1H.ts |

---

## RULE SUMMARY
Total Rules: 19
Passed: 3
Failed: 9
Watch: 1
Skipped: 5
Info: 1
Decision Output: IGNORE
Visibility Mode: TRADE_MODE
Trend Reversal State: WATCH
Market Context Applied: UNAVAILABLE
Decision Block Codes (V4.1): TREND_REVERSAL_UNCONFIRMED

---

## PIPELINE STAGE MAP

1. Market Intelligence (snapshot on row) â†’ trendStrength / exhaustion / reversal / confidence / marketState
2. Visibility (show/hide conditions from snapshot) â†’ visibilityMode on row
3. Trend Reversal Task-2 (1H) â†’ cvd_flip / volume / exhaustion / structure_break / confidence â†’ ACTIVE|WATCH
4. Market Context (5 dims, only applied when ACTIVE) â†’ may downgrade to WATCH
5. Confidence Engine â†’ final confidence + decisionContext
6. Decision Engine â†’ LONG|SHORT|WATCH|IGNORE
7. Early Warning BLOCK + Momentum confirmed â†’ entry gates (scan path)

Note: UI checklist "THIáº¾U GÃŒ" chá»‰ hiá»‡n 4 má»¥c (cvd/volume/btc/exhaustion) â€” thiáº¿u structure_break vÃ  Ä‘á»§ 5 market-context dims.

---

## DECISION CHAIN
MarketState=WeakDowntrend â†’ Visibility=TRADE_MODE â†’ TrendReversal=WATCH(signals=1/4) â†’ MarketContext=NOT_APPLIED â†’ Confidence=12.909375 â†’ Decision=IGNORE â†’ EarlyWarning=CLEAR â†’ MomentumLong=false|Short=false

---

## AI REVIEW

Checklist trá»‘ng â€” reviewer Ä‘iá»n (khÃ´ng suy diá»…n tá»« V3/V4):

| Review Item | Result | Severity | Notes |
| --- | --- | --- | --- |
| Wrong threshold vs code? | â–¡ | UNAVAILABLE | UNAVAILABLE |
| Missing Structure Break while ACTIVE? | â–¡ | UNAVAILABLE | UNAVAILABLE |
| Market Context skipped mislabeled as PASS? | â–¡ | UNAVAILABLE | UNAVAILABLE |
| Decision vs eligibility contradiction? | â–¡ | UNAVAILABLE | UNAVAILABLE |
| Used 4H MI exhaustion for 1H TR gate? | â–¡ | UNAVAILABLE | UNAVAILABLE |
| OI/Whale skipped but treated as confirmed? | â–¡ | UNAVAILABLE | UNAVAILABLE |
| Visibility condition vs hysteresis outcome confused? | â–¡ | UNAVAILABLE | UNAVAILABLE |
| Need Optimization? | â–¡ | UNAVAILABLE | UNAVAILABLE |

---

## AI REVIEW SPECIFICATION (Rulebook V4.1 â€” EMBEDDED)

### REVIEW RULES
1. Má»i Actual/Threshold pháº£i trÃ¹ng field copy tá»« document hoáº·c tá»« module Ä‘Æ°á»£c nÃªu trong Source Module â€” khÃ´ng Ä‘oÃ¡n.
2. KhÃ´ng map rule V4.1 â†’ Group A/B/C hay HB-/GB- cá»§a V3/V4.
3. Status chá»‰ dÃ¹ng PASS|FAIL|WATCH|SKIPPED|INFO â€” khÃ´ng HARD/SOFT/UNLOCK.
4. Checklist UI 4 má»¥c khÃ´ng Ä‘Æ°á»£c hiá»ƒu lÃ  Ä‘á»§ Ä‘iá»u kiá»‡n ACTIVE; pháº£i kiá»ƒm tra thÃªm structure_break + confâ‰¥70 + market context.
5. Náº¿u Evidence thiáº¿u mÃ  rule cáº§n threshold sá»‘ â†’ classification INSUFFICIENT EVIDENCE, khÃ´ng bá»‹a sá»‘.
6. Market State category lÃ  INFO/regime â€” reviewer khÃ´ng tá»± suy ngÆ°á»¡ng ts/ex/vol tá»« category (Ä‘Ã£ khÃ³a á»Ÿ MI Spec).
7. decision_eligibility pháº£i gá»i isEligibleForDirection Ä‘Ã£ export â€” khÃ´ng mirror logic riÃªng trong Builder.
8. OI/Whale trong production scan thÆ°á»ng skipped (khÃ´ng cÃ³ data trÃªn row) â€” skipped â‰  business PASS; váº«n giá»¯ trong Rulebook v1.
9. Visibility chá»‰ Ä‘Ã¡nh giÃ¡ CONDITION táº¡i thá»i Ä‘iá»ƒm scan (previousMode khÃ´ng cÃ³ trÃªn row).
10. decision_long_short / decision_watch / decision_ignore dÃ¹ng Method A partition rá»i theo confidence (Ä‘á»™c láº­p decision label). decision_final_output = INFO mÃ´ táº£ engine state.
11. LET matchedTier tá»« decision_final_output: LONG|SHORTâ†’long_short; WATCHâ†’watch; IGNOREâ†’ignore. CRITICAL náº¿u (a) rule matchedTier â‰  PASS HOáº¶C (b) rule tier khÃ¡c matchedTier = PASS.

### REVIEW LEVEL RESOLUTION (DETERMINISTIC)

Rulebook Ä‘á»c Status/Actual Ä‘Ã£ freeze trong document â€” KHÃ”NG tá»± suy láº¡i ngÆ°á»¡ng tá»« narrative.

Decision tier consistency (Method A):
- matchedTier = long_short náº¿u decision_final_output âˆˆ {LONG, SHORT}
- matchedTier = watch náº¿u decision_final_output = WATCH
- matchedTier = ignore náº¿u decision_final_output = IGNORE
- CRITICAL â‡” (matchedTier rule status â‰  PASS) âˆ¨ (âˆƒ other tier rule with status = PASS)
- NgÆ°á»£c láº¡i (khá»›p Ä‘Ãºng 1 tier) â†’ INFO

| Observation (from this document) | Suggested V41ReviewLevel | Notes |
| --- | --- | --- |
| matchedTier rule KHÃ”NG PASS (a) | CRITICAL | evaluateDecisionTierConsistency |
| Rule tier KHÃC matchedTier láº¡i PASS (b) | CRITICAL | evaluateDecisionTierConsistency |
| matchedTier PASS vÃ  khÃ´ng tier khÃ¡c PASS | INFO | Threshold bands khá»›p decision_final_output |
| Rule FAIL mÃ  Decision Output = LONG hoáº·c SHORT | CRITICAL | MÃ¢u thuáº«n pipeline |
| structure_break FAIL trong khi Trend Reversal State = ACTIVE | CRITICAL | ACTIVE Ä‘Ã²i há»i 4/4 signals |
| Market Context dim FAIL nhÆ°ng Decision váº«n LONG/SHORT | WARN | Kiá»ƒm tra hard-block / eligibility |
| decision_eligibility Actual â‰  isEligibleForDirection cÃ¹ng input | CRITICAL | Builder pháº£i gá»i hÃ m Ä‘Ã£ export, khÃ´ng tá»± tÃ­nh |
| OI/Whale Status=SKIPPED bá»‹ diá»…n giáº£i nhÆ° confirmed PASS | WARN | skipped = no data on row, khÃ´ng cháº·n |
| Thiáº¿u klines1H â†’ nhiá»u rule SKIPPED khi audit action | BLOCK | KhÃ´ng Ä‘á»§ evidence |
| Má»i gate khá»›p Decision Output | INFO | Descriptive only |

### WORKED EXAMPLES

Example A â€” TR chÆ°a Ä‘á»§:
- Input: cvd_flip=FAIL, volume_confirmation=FAIL â†’ trend_reversal_confidence WATCH
- Reviewer: Decision khÃ´ng Ä‘Æ°á»£c LONG/SHORT chá»‰ vÃ¬ Confidence UI cao.

Example B â€” Context phá»§ Ä‘á»‹nh:
- Input: 4/4 TR signals + confâ‰¥70 nhÆ°ng market_context_btc FAIL â†’ state downgrade WATCH
- Reviewer: WARN náº¿u Decision váº«n LONG/SHORT.

Example C â€” EW BLOCK:
- Input: early_warning_block Actual=BLOCK
- Reviewer: entry/opportunity pháº£i bá»‹ cháº·n; Visibility cÃ³ thá»ƒ bá»‹ demote WATCH.

### REVIEW CLASSIFICATION
PASS | BUG | INSUFFICIENT EVIDENCE | ENHANCEMENT

```

