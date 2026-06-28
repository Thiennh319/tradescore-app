import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  COLORS,
  type AppTradeSymbol,
  type TradeDirection,
} from '../../constants/scoring';
import { PANEL, RADIUS, SPACING } from '../../constants/theme';
import { vi } from '../../constants/vi';
import { scoringLayersToDisplayV4, l6RawScoreFromDirectional } from '../../services/scorerV4';
import { scoringLayersToDisplayV3 } from '../../services/scorerV3';
import { clearKeyLevelsCache } from '../../services/indicators';
import { LayerCard } from '../LayerCard';
import { ScorerV4DetailSection } from './ScorerV4DetailSection';
import { ScorerV3DetailSection } from './ScorerV3DetailSection';
import { DataSyncPanel } from '../DataSyncPanel';
import {
  getVietnamDateParts,
  useTradeStore,
  type PsychologyChecklist,
  type StoredTradeJournalEntry,
} from '../../store/useTradeStore';
import { formatUsdPrice } from '../../utils/formatPrice';

interface TradeStorePanelProps {
  symbol: AppTradeSymbol;
  price: number | null;
  suggestedDirection: TradeDirection;
}

const PSYCHOLOGY_KEYS: (keyof PsychologyChecklist)[] = [
  'noRevengeTrading',
  'withinDailyLossLimit',
  'restedAndFocused',
  'planWritten',
  'noOverLeverage',
];

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

export function TradeStorePanel({ symbol, price, suggestedDirection }: TradeStorePanelProps) {
  const hydrated = useTradeStore((s) => s.hydrated);
  const isLoading = useTradeStore((s) => s.isLoading);
  const lastError = useTradeStore((s) => s.lastError);
  const isCachedData = useTradeStore((s) => s.isCachedData);
  const analysisResults = useTradeStore((s) => s.analysisResults);
  const scoringResultV4 = useTradeStore((s) => s.scoringResultV4);
  const scoringResultV3 = useTradeStore((s) => s.scoringResultV3);
  const scorerVersion = useTradeStore((s) => s.scorerVersion);
  const tradeJournal = useTradeStore((s) => s.tradeJournal);
  const psychologyChecklist = useTradeStore((s) => s.psychologyChecklist);
  const settings = useTradeStore((s) => s.settings);
  const selectedDirection = useTradeStore((s) => s.selectedDirection);

  const fetchAndAnalyze = useTradeStore((s) => s.fetchAndAnalyze);
  const addJournalEntry = useTradeStore((s) => s.addJournalEntry);
  const closeJournalEntry = useTradeStore((s) => s.closeJournalEntry);
  const updatePsychologyChecklist = useTradeStore((s) => s.updatePsychologyChecklist);

  const [vnClock, setVnClock] = useState(() => getVietnamDateParts());

  useEffect(() => {
    const id = setInterval(() => setVnClock(getVietnamDateParts()), 30_000);
    return () => clearInterval(id);
  }, []);

  const openTrades = tradeJournal.filter((e) => e.status === 'OPEN');
  const inGoldenWindow =
    vnClock.hour >= settings.autoCheckStartHour &&
    vnClock.hour <= settings.autoCheckEndHour;
  const atTriggerMinute = vnClock.minute === settings.triggerMinute;

  const [showLayers, setShowLayers] = useState(false);

  const storeScore = analysisResults?.fullAnalysis[
    selectedDirection === 'LONG' ? 'long' : 'short'
  ];
  const v4Active = scoringResultV4
    ? scoringResultV4[selectedDirection === 'LONG' ? 'long' : 'short']
    : null;
  const v3Active = scoringResultV3
    ? scoringResultV3[selectedDirection === 'LONG' ? 'long' : 'short']
    : null;
  const activeScorer = scorerVersion === 'v4' ? v4Active : v3Active;
  const v4Layers = v4Active ? scoringLayersToDisplayV4(v4Active.layers) : [];
  const v3Layers = v3Active ? scoringLayersToDisplayV3(v3Active.layers) : [];
  const displayLayers = scorerVersion === 'v4' ? v4Layers : v3Layers;
  const displayTotalScore =
    scorerVersion === 'v4'
      ? v4Active?.awaitingRescore
        ? null
        : (v4Active?.officialTotalScore ?? v4Active?.referenceTotalScore ?? null)
      : v3Active
        ? v3Active.totalScore
        : null;

  return (
    <View style={styles.panel}>
      <View style={styles.accentStrip} />
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>{vi.store.title}</Text>
            <Text style={styles.subtitle}>{vi.store.subtitle}</Text>
          </View>
          <View
            style={[
              styles.livePill,
              { borderColor: hydrated ? COLORS.bullish : COLORS.warning },
            ]}
          >
            <View
              style={[
                styles.liveDot,
                { backgroundColor: hydrated ? COLORS.bullish : COLORS.warning },
              ]}
            />
            <Text
              style={[
                styles.liveText,
                { color: hydrated ? COLORS.bullish : COLORS.warning },
              ]}
            >
              {hydrated ? vi.store.ready : vi.store.loading}
            </Text>
          </View>
        </View>

        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>{vi.store.autoCheck}</Text>
          <Text style={styles.statusLine}>
            {vi.store.vnTime(vnClock.hour, vnClock.minute)}
          </Text>
          <Text style={styles.statusLine}>
            {vi.store.schedule(
              settings.autoCheckStartHour,
              settings.autoCheckEndHour,
              settings.triggerMinute,
            )}
          </Text>
          <Text
            style={[
              styles.statusHint,
              inGoldenWindow && atTriggerMinute && styles.statusHintActive,
            ]}
          >
            {inGoldenWindow
              ? atTriggerMinute
                ? vi.store.triggerNow
                : vi.store.inWindow
              : vi.store.outsideWindow}
          </Text>
        </View>

        <View style={styles.btnRow}>
          <ActionBtn
            label={vi.store.runAnalysis}
            onPress={() => {
              clearKeyLevelsCache(symbol);
              void fetchAndAnalyze(symbol);
            }}
            loading={isLoading}
          />
        </View>

        {lastError ? <Text style={styles.error}>{lastError}</Text> : null}

        {analysisResults ? (
          <View style={styles.resultBox}>
            <Text style={styles.resultTitle}>{vi.store.lastAnalysis}</Text>
            <Text style={styles.resultLine}>
              {analysisResults.symbol} · {analysisResults.timeframe} ·{' '}
              {formatUsdPrice(analysisResults.symbol, analysisResults.price)}
            </Text>
            {activeScorer ? (
              <>
                <Text style={[styles.resultLine, { color: activeScorer.decisionColor }]}>
                  {selectedDirection}: {activeScorer.decisionLabel}
                  {displayTotalScore != null
                    ? ` · ${displayTotalScore.toFixed(1)}/15`
                    : scorerVersion === 'v4' && v4Active?.awaitingRescore
                      ? ' · chờ tái chấm'
                      : ''}
                  {isCachedData ? ` · ${vi.store.cached}` : ''}
                </Text>
                <Text style={styles.resultMeta}>
                  {vi.scorer.winrate(activeScorer.winrate)}
                </Text>
              </>
            ) : storeScore ? (
              <Text style={styles.resultLine}>
                {selectedDirection}: {storeScore.decision.display} ·{' '}
                {storeScore.totalScore.toFixed(1)}/15
                {isCachedData ? ` · ${vi.store.cached}` : ''}
              </Text>
            ) : null}
            {displayLayers.length > 0 ? (
              <>
                <Pressable onPress={() => setShowLayers((v) => !v)} style={styles.layerToggle}>
                  <Text style={styles.layerToggleText}>
                    {showLayers ? vi.signalBoard.hideDetail : vi.signalBoard.showDetail}
                  </Text>
                </Pressable>
                {showLayers ? (
                  <>
                    {scorerVersion === 'v4' && v4Active && scoringResultV4 ? (
                      <>
                        <Text style={[styles.engineLabel, styles.engineLabelV3]}>
                          {vi.signalBoard.scorerV4}
                        </Text>
                        <ScorerV4DetailSection
                          scoringResultV4={scoringResultV4}
                          activeDirection={v4Active}
                        />
                        {v4Layers.length > 0 ? (
                          <LayerCard
                            layers={v4Layers}
                            l6ExpandV4={{
                              detail: scoringResultV4.l6Detail,
                              longScore: l6RawScoreFromDirectional(scoringResultV4.long),
                              shortScore: l6RawScoreFromDirectional(scoringResultV4.short),
                              activeDirection: v4Active.direction,
                            }}
                            l11ExpandV4={{ squeezeRisk: scoringResultV4.squeezeRisk }}
                          />
                        ) : null}
                      </>
                    ) : scorerVersion === 'v3' && v3Active && scoringResultV3 ? (
                      <>
                        <Text style={[styles.engineLabel, styles.engineLabelV3]}>
                          {vi.signalBoard.scorerV3}
                        </Text>
                        <ScorerV3DetailSection
                          scoringResultV3={scoringResultV3}
                          activeDirection={v3Active}
                        />
                        {v3Layers.length > 0 ? <LayerCard layers={v3Layers} /> : null}
                      </>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}
            <Text style={styles.resultMeta}>
              {vi.store.fetchedAt(new Date(analysisResults.fetchedAt).toLocaleTimeString('vi-VN'))}
            </Text>
          </View>
        ) : (
          <Text style={styles.empty}>{vi.store.noAnalysis}</Text>
        )}

        <Text style={styles.sectionTitle}>{vi.store.journal}</Text>
        <View style={styles.btnRow}>
          <ActionBtn
            label={vi.store.addDemo}
            onPress={() => {
              if (price == null) return;
              void addJournalEntry({
                symbol,
                direction: suggestedDirection,
                entryPrice: price,
                entryTime: Date.now(),
                leverage: settings.leverage,
                size: settings.sizePerTrade,
              });
            }}
            disabled={price == null}
          />
        </View>

        {openTrades.length === 0 ? (
          <Text style={styles.empty}>{vi.store.noOpen}</Text>
        ) : (
          openTrades.map((entry) => (
            <JournalRow
              key={entry.id}
              entry={entry}
              onClose={() => void closeJournalEntry(entry.id)}
            />
          ))
        )}

        <Text style={styles.sectionTitle}>{vi.store.psychology}</Text>
        <View style={styles.checkGrid}>
          {PSYCHOLOGY_KEYS.map((key) => {
            const on = psychologyChecklist[key];
            return (
              <Pressable
                key={key}
                onPress={() => void updatePsychologyChecklist({ [key]: !on })}
                style={[styles.checkChip, on && styles.checkChipOn, webPointer]}
              >
                <View style={[styles.checkBox, on && styles.checkBoxOn]}>
                  {on ? <Text style={styles.checkMark}>✓</Text> : null}
                </View>
                <Text style={[styles.checkLabel, on && styles.checkLabelOn]}>
                  {vi.store.psychologyItems[key]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <DataSyncPanel />
      </View>
    </View>
  );
}

function ActionBtn({
  label,
  onPress,
  loading,
  disabled,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.actionBtn,
        (disabled || loading) && styles.actionBtnDisabled,
        pressed && !disabled && styles.actionBtnPressed,
        webPointer,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={COLORS.background} />
      ) : (
        <Text style={styles.actionBtnText}>{label}</Text>
      )}
    </Pressable>
  );
}

function JournalRow({
  entry,
  onClose,
}: {
  entry: StoredTradeJournalEntry;
  onClose: () => void;
}) {
  return (
    <View style={styles.journalRow}>
      <View style={styles.journalMain}>
        <Text style={styles.journalSymbol}>
          {entry.symbol} · {entry.direction}
        </Text>
        <Text style={styles.journalMeta}>
          Entry {formatUsdPrice(entry.symbol as AppTradeSymbol, entry.entryPrice)} · x
          {entry.leverage} · {entry.status}
        </Text>
      </View>
      <Pressable onPress={onClose} style={[styles.closeBtn, webPointer]}>
        <Text style={styles.closeBtnText}>{vi.store.closeTrade}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    ...PANEL,
    marginBottom: SPACING.md,
    padding: 0,
    overflow: 'hidden',
  },
  accentStrip: {
    height: 3,
    backgroundColor: COLORS.info,
  },
  body: {
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: SPACING.md,
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusCard: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: 4,
  },
  statusTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusLine: {
    fontSize: 12,
    color: COLORS.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  statusHint: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  statusHintActive: {
    color: COLORS.accent,
    fontWeight: '700',
  },
  btnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  actionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.info,
    minWidth: 140,
    alignItems: 'center',
  },
  actionBtnDisabled: {
    opacity: 0.45,
  },
  actionBtnPressed: {
    opacity: 0.85,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  error: {
    fontSize: 11,
    color: COLORS.bearish,
  },
  resultBox: {
    backgroundColor: 'rgba(56, 97, 251, 0.08)',
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.info,
    padding: SPACING.md,
    gap: 4,
  },
  resultTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.info,
    textTransform: 'uppercase',
  },
  resultLine: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  resultMeta: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
  engineLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    marginTop: SPACING.sm,
  },
  engineLabelV3: {
    color: COLORS.bullish,
  },
  layerToggle: {
    paddingVertical: 4,
    marginTop: 4,
  },
  layerToggleText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.info,
    textTransform: 'uppercase',
  },
  empty: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: SPACING.sm,
  },
  journalRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  journalMain: {
    flex: 1,
    gap: 2,
  },
  journalSymbol: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  journalMeta: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
  journalAction: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  journalReason: {
    fontSize: 10,
    color: COLORS.textSecondary,
    lineHeight: 14,
  },
  closeBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.bearish,
  },
  closeBtnText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.bearish,
  },
  checkGrid: {
    gap: 6,
  },
  checkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  checkChipOn: {
    borderColor: COLORS.bullish,
    backgroundColor: 'rgba(14, 203, 129, 0.06)',
  },
  checkBox: {
    width: 14,
    height: 14,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: COLORS.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBoxOn: {
    borderColor: COLORS.bullish,
    backgroundColor: COLORS.bullish,
  },
  checkMark: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.background,
  },
  checkLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    flex: 1,
  },
  checkLabelOn: {
    color: COLORS.textPrimary,
  },
});
